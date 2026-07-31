/**
 * TRASLADO CONTROLLER
 *
 * Orquesta el traslado de pedidos WooCommerce `processing` entre sedes del
 * Multisite, siguiendo el patrón de `cancelOrder` (adminController):
 * guardas → lógica → trazabilidad en Supabase → invalidar caché → audit.
 *
 * Flujo (design.md):
 *   POST /api/orders/trasladar-pedido/validar → guardas + pre-chequeo de stock
 *     + resumen (NO muta datos).
 *   POST /api/orders/trasladar-pedido         → guardas → re-chequeo de stock
 *     → clon con precios de ORIGEN → copiar notas filtradas → cancelar origen
 *     (opcional, default true) → insert en wc_pedidos_trasladados →
 *     invalidar caché → audit `order.transferred`.
 *
 * Decisiones:
 *   - La sede de ORIGEN sale del request (`sede_id`, la conoce el frontend:
 *     el order_id NO es único global entre sub-sitios) con fallback a la sede
 *     donde `getOrderFromAnySede` encontró el pedido.
 *   - `cancelarOrigen` (helper interno) NO escribe snapshot en
 *     `wc_pedidos_cancelados` (spec R5/ADR-4: un traslado no es una
 *     cancelación; si el cancel falla post-clon queda `pendiente_cancelar`).
 *   - La copia de notas extra es NO bloqueante: el clon ya lleva la
 *     customer_note construida por el service; si falla solo se loguea.
 *
 * Testabilidad: `createTrasladoController(deps)` expone la misma lógica con
 * dependencias inyectadas (supabaseClient, woo, sedes, audit, service). Los
 * tests usan fakes sin red ni DB; el módulo exporta además una instancia
 * default con las dependencias reales para las rutas. (vitest 4 solo mockea
 * imports estáticos, no require()s internos — por eso la inyección.)
 */

const { supabase } = require("../services/supabaseClient");
const {
  getWooClient,
  getOrderFromAnySede,
  invalidateResponseCache,
} = require("../services/wooMultiService");
const { getSedeById } = require("../services/sedeConfig");
const { logAuditEvent } = require("../services/auditService");
const trasladoService = require("../services/trasladoService");

const MENSAJE_SESION_ACTIVA =
  "Este pedido está en una sesión de picking activa. Finalice o cancele la sesión primero.";

/**
 * Factory del controller con dependencias inyectables.
 *
 * @param {Object} [deps]
 * @param {Object} [deps.supabaseClient] - Cliente Supabase (default: real).
 * @param {Object} [deps.woo] - { getWooClient, getOrderFromAnySede, invalidateResponseCache }.
 * @param {Object} [deps.sedes] - { getSedeById }.
 * @param {Function} [deps.audit] - logAuditEvent (fire-and-forget).
 * @param {Object} [deps.service] - Funciones puras del traslado (default: real).
 * @returns {{ validateTraslado: Function, ejecutarTraslado: Function }}
 */
function createTrasladoController(deps = {}) {
  const supabaseClient = deps.supabaseClient || supabase;
  const woo = deps.woo || { getWooClient, getOrderFromAnySede, invalidateResponseCache };
  const sedes = deps.sedes || { getSedeById };
  const audit = deps.audit || logAuditEvent;
  const {
    validateTrasladoRequest,
    isSameSede,
    summarizeOrder,
    buildClonePayload,
    filterOrderNotes,
    checkStockDestino,
  } = deps.service || trasladoService;

  // ============================================================
  // HELPERS DE GUARDA (no exportados)
  // ============================================================

  /**
   * Busca el pedido origen en cualquier sede (order_id no es único global entre
   * sub-sitios). Devuelve { order, sedeId, sedeName } o null.
   */
  async function getOrdenOrigen(orderId) {
    return woo.getOrderFromAnySede(orderId);
  }

  /**
   * true si el pedido está asignado a una sesión de picking activa.
   * Misma query que `cancelOrder` (adminController L372-387).
   */
  async function guardSesionActiva(orderId) {
    const { data: activeAssignments } = await supabaseClient
      .from("wc_asignaciones_pedidos")
      .select("id, id_sesion, wc_picking_sessions!inner(estado)")
      .eq("id_pedido", orderId)
      .not("wc_picking_sessions.estado", "in", '("cancelado","finalizado","auditado")');

    return Array.isArray(activeAssignments) && activeAssignments.length > 0;
  }

  /**
   * true si ya existe un traslado para el par (order_id_origen, sede_origen_id)
   * — idempotencia garantizada por el unique de wc_pedidos_trasladados (ADR-3).
   */
  async function guardYaTrasladado(orderId, sedeOrigenId) {
    const { data: existing } = await supabaseClient
      .from("wc_pedidos_trasladados")
      .select("id")
      .eq("order_id_origen", orderId)
      .eq("sede_origen_id", sedeOrigenId)
      .maybeSingle();

    return !!existing;
  }

  /**
   * Guardas compartidas por `validateTraslado` y `ejecutarTraslado`.
   * Orden: 400 request → 400 destino sin wc_url → 404 pedido → 400 misma sede
   * → 400 status≠processing → 409 sesión activa → 409 ya trasladado.
   *
   * Si una guarda falla, responde 4xx y devuelve null; si todas pasan,
   * devuelve el contexto resuelto { body, order, sedeOrigen, sedeDestino }.
   */
  async function validarGuardas(req, res) {
    const body = req.body || {};

    const errors = validateTrasladoRequest(body);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join("; ") });
      return null;
    }

    // Destino sin wc_url → 400 (evita el fallback silencioso de getWooClient).
    const sedeDestino = await sedes.getSedeById(body.sede_destino_id);
    if (!sedeDestino || !sedeDestino.wc_url) {
      res.status(400).json({
        error: "La sede destino no tiene WooCommerce configurado.",
      });
      return null;
    }

    // Pedido origen: 404 si no existe en NINGUNA sede.
    const found = await getOrdenOrigen(body.order_id);
    if (!found || !found.order) {
      res.status(404).json({ error: "Pedido no encontrado en WooCommerce." });
      return null;
    }
    const order = found.order;

    // Origen: el frontend lo conoce (order.sede_id) y lo envía en `sede_id`;
    // si no viene, usamos la sede donde la búsqueda encontró el pedido.
    const sedeOrigenIdBody = body.sede_id || req.sedeId || null;
    const sedeOrigen = sedeOrigenIdBody ? await sedes.getSedeById(sedeOrigenIdBody) : null;
    const origenId = (sedeOrigen && sedeOrigen.id) || found.sedeId;
    const origenInfo =
      sedeOrigen || { id: found.sedeId, nombre: found.sedeName || "Sede origen" };

    if (isSameSede(origenId, sedeDestino.id)) {
      res.status(400).json({ error: "El pedido ya pertenece a la sede destino." });
      return null;
    }

    if (order.status !== "processing") {
      res
        .status(400)
        .json({ error: "Solo se pueden trasladar pedidos en estado processing." });
      return null;
    }

    if (await guardSesionActiva(order.id)) {
      res.status(409).json({ error: MENSAJE_SESION_ACTIVA });
      return null;
    }

    if (await guardYaTrasladado(order.id, origenId)) {
      res.status(409).json({ error: "Este pedido ya fue trasladado previamente." });
      return null;
    }

    return { body, order, sedeOrigen: origenInfo, sedeDestino };
  }

  /**
   * Cancela el pedido origen en WooCommerce (PUT status cancelled + invalidar
   * caché). Reusa el patrón de `cancelOrder` pero NO inserta snapshot en
   * `wc_pedidos_cancelados` (ADR-4: no es una cancelación, es un traslado).
   */
  async function cancelarOrigen(sedeOrigenId, orderId) {
    const wooClient = await woo.getWooClient(sedeOrigenId);
    await wooClient.put(`orders/${orderId}`, { status: "cancelled" });
    woo.invalidateResponseCache();
  }

  // ============================================================
  // POST /api/orders/trasladar-pedido/validar — pre-flight (sin mutar datos)
  // ============================================================
  const validateTraslado = async (req, res) => {
    try {
      const ctx = await validarGuardas(req, res);
      if (!ctx) return;

      const { order, sedeOrigen, sedeDestino } = ctx;
      const wooClientDestino = await woo.getWooClient(sedeDestino.id);

      const warnings = await checkStockDestino({
        lineItems: order.line_items,
        fetchProducts: async (endpoint, params) => {
          const { data } = await wooClientDestino.get(endpoint, params);
          return data;
        },
      });

      const resumen = summarizeOrder(order);

      res.status(200).json({
        valido: true,
        order_id: order.id,
        sede_origen: { id: sedeOrigen.id, nombre: sedeOrigen.nombre },
        sede_destino: { id: sedeDestino.id, nombre: sedeDestino.nombre },
        resumen,
        warnings,
      });
    } catch (error) {
      console.error("Error validando traslado:", error.message);
      res
        .status(500)
        .json({ error: `Error al validar traslado: ${error.message}` });
    }
  };

  // ============================================================
  // POST /api/orders/trasladar-pedido — ejecutar el traslado
  // ============================================================
  const ejecutarTraslado = async (req, res) => {
    try {
      const ctx = await validarGuardas(req, res);
      if (!ctx) return;

      const { body, order, sedeOrigen, sedeDestino } = ctx;
      const adminName = String(body.admin_name || "").trim();
      const adminEmail = body.admin_email || null;
      const motivo = String(body.motivo || "").trim();
      const cancelarOrigenFlag = body.cancelar_origen !== false; // default true
      const origenId = sedeOrigen.id;

      const wooClientDestino = await woo.getWooClient(sedeDestino.id);

      // 1. Re-chequeo de stock (race validar→ejecutar); warnings NO bloqueantes.
      const warnings = await checkStockDestino({
        lineItems: order.line_items,
        fetchProducts: async (endpoint, params) => {
          const { data } = await wooClientDestino.get(endpoint, params);
          return data;
        },
      });

      // 2. Clonar en destino con precios de ORIGEN (ADR-1).
      let clone;
      try {
        const { data } = await wooClientDestino.post(
          "orders",
          buildClonePayload({
            order,
            sedeOrigen,
            sedeDestino,
            adminName,
            motivo,
            orderIdOrigen: order.id,
          }),
        );
        clone = data;
      } catch (error) {
        // Mapa de errores: POST clon rechazado → 400, NO se persiste ni se cancela.
        const detalle = (error && error.message) || "error desconocido";
        return res.status(400).json({
          error: `No se pudo crear el pedido en la sede destino: ${detalle}`,
        });
      }
      const orderIdDestino = clone.id;

      // 3. Copiar notas filtradas del origen → clon (NO bloqueante).
      const wooClientOrigen = await woo.getWooClient(origenId);
      try {
        const { data: notas } = await wooClientOrigen.get(`orders/${order.id}/notes`);
        const notasFiltradas = filterOrderNotes(notas);
        for (const nota of notasFiltradas) {
          await wooClientDestino.post(`orders/${orderIdDestino}/notes`, {
            note: nota.note,
            customer_note: nota.customer_note === true,
          });
        }
      } catch (error) {
        console.warn("[traslado] Error copiando notas de pedido:", error.message);
      }

      // 4. Cancelar origen (si cancelar_origen); fallo post-clon → pendiente_cancelar.
      let estado = "completado";
      if (cancelarOrigenFlag) {
        try {
          await cancelarOrigen(origenId, order.id);
        } catch (error) {
          estado = "pendiente_cancelar";
          warnings.push({ tipo: "cancel_origen_fallido", message: error.message });
          console.warn(
            "[traslado] No se pudo cancelar el pedido original:",
            error.message,
          );
        }
      }

      // 5. Trazabilidad: insert en wc_pedidos_trasladados (unique → idempotencia).
      const { error: insertError } = await supabaseClient
        .from("wc_pedidos_trasladados")
        .insert([
          {
            order_id_origen: order.id,
            sede_origen_id: origenId,
            order_id_destino: orderIdDestino,
            sede_destino_id: sedeDestino.id,
            estado,
            warnings,
            admin_name: adminName,
            admin_email: adminEmail,
            motivo,
          },
        ]);
      if (insertError) throw insertError;

      // 6. Invalidar caché (el origen desaparece de pendientes, el clon aparece en destino).
      woo.invalidateResponseCache();

      // 7. Audit order.transferred.
      audit({
        actor: { type: "admin", id: adminEmail, name: adminName },
        action: "order.transferred",
        entity: { type: "order", id: order.id },
        sedeId: origenId,
        metadata: {
          order_id_destino: orderIdDestino,
          sede_destino_id: sedeDestino.id,
          sede_destino_nombre: sedeDestino.nombre,
          warnings,
          cancelar_origen: cancelarOrigenFlag,
          motivo,
        },
      });

      console.log(
        `🔀 [TRASLADO] Pedido #${order.id} trasladado a ${sedeDestino.nombre} (nuevo #${orderIdDestino}) por ${adminName} — estado: ${estado}`,
      );

      // 8. Responder (message indica reintento manual si el cancel falló).
      const message =
        estado === "pendiente_cancelar"
          ? `Pedido #${order.id} trasladado a ${sedeDestino.nombre} (nuevo #${orderIdDestino}). No se pudo cancelar el pedido original: reintente la cancelación manualmente.`
          : `Pedido #${order.id} trasladado a ${sedeDestino.nombre} (nuevo #${orderIdDestino}).`;

      res.status(200).json({
        message,
        order_id_origen: order.id,
        order_id_destino: orderIdDestino,
        sede_destino_id: sedeDestino.id,
        estado,
        warnings,
      });
    } catch (error) {
      console.error("Error trasladando pedido:", error.message);
      res
        .status(500)
        .json({ error: `Error al trasladar pedido: ${error.message}` });
    }
  };

  return { validateTraslado, ejecutarTraslado };
}

// Instancia default con dependencias reales (usada por routes/orderRoutes.js).
module.exports = {
  createTrasladoController,
  ...createTrasladoController(),
};
