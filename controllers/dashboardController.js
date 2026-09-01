const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { agruparItemsParaPicking } = require("./pickingUtils");
const { syncOrderToWoo } = require("../services/syncWooService");
const { logAuditEvent } = require("../services/auditService");
const { isWeighableUnit } = require("../utils/weighableUnits");
const { calcLineCharge } = require("../utils/manifestPricing");
const {
  resolvePaymentLabel,
  isCreditoOrder,
  COD_MODE_META_KEY,
} = require("../utils/paymentMethods");
const {
  CREDITO_METHOD,
  SYSTEM_ACTOR,
  paymentDateFor,
  findCreditoOrderIds,
  allSettled,
  summarizeSessionMethod,
} = require("../utils/paymentSettlement");
const { evaluarRiesgoBot } = require("../utils/botDetection");
// Fuente única de verdad para códigos SIESA, presentaciones y códigos de
// manifiesto. Guardada por utils/siesaMatching.test.js — no reimplementar
// esta lógica acá adentro: cada copia divergió y trabó auditorías.
const {
  normalizeBarcode,
  normalizeUM,
  buildBarcodeIndex,
  availableUMsFor,
  resolveExpectedUM,
  buildManifestCode,
  findGs1Base,
} = require("../utils/siesaMatching");
const { buildManifestItems } = require("../utils/manifestItems");
const {
  getSedeFromWooOrder,
  extractSedeFromOrder,
  WOO_SEDE_META_KEYS,
} = require("../services/sedeConfig");
// Pre-agregado de recaudo por sesión: recalcular tras cada cambio de estado /
// método de pago para que el total all-time (/analytics/summary) quede exacto.
const { refreshSessionSummary } = require("../utils/sessionRevenue");
const { fetchByIdsChunked } = require("../utils/dbPagination");

// Multi-sede WooCommerce (WordPress Multisite)
const {
  getWooClient,
  fetchFromAllSedes,
  fetchFromSede,
  getOrderFromAnySede,
  invalidateResponseCache,
} = require("../services/wooMultiService");

// =========================================================
// HELPER: Extraer documento de identidad del cliente
// =========================================================
const DOC_META_KEYS = [
  "_billing_document",
  "_billing_dni",
  "_billing_cedula",
  "_billing_nit",
  "billing_document",
  "cedula",
  "documento",
];

function extractDocumento(orderSnapshot) {
  const meta = orderSnapshot?.meta_data;
  if (!meta || !Array.isArray(meta)) return "";
  const found = meta.find((m) => DOC_META_KEYS.includes(m.key));
  return found?.value || "";
}

// Etiqueta legible del método de pago. La lógica vive en utils/paymentMethods.js
// (fuente única, compartida con el frontend).
function extractMetodoPago(orderSnapshot) {
  return resolvePaymentLabel(orderSnapshot);
}

// Los helpers getBarcodesFromSiesaByUnitMeasure() y getBarcodesFromSiesa()
// vivían acá y se borraron: cada uno reimplementaba la normalización de
// códigos y unidades con reglas ligeramente distintas, y esa divergencia era
// justamente lo que trababa las auditorías. La lógica ahora es única y está
// en utils/siesaMatching.js, con tests de regresión. No la reimplementes acá.

// =========================================================
// 1. DASHBOARD EN VIVO (CÁLCULO EXACTO & REALTIME)
// =========================================================
exports.getActiveSessionsDashboard = async (req, res) => {
  // Evitar caching en Vercel/Navegador para datos en tiempo real
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    // 1. Obtener sesiones en proceso (FILTRADAS POR SEDE)
    let sessQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, id_picker, ids_pedidos, snapshot_pedidos, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre )`,
      )
      .eq("estado", "en_proceso");

    // Filtro Multi-Sede
    if (req.sedeId) {
      sessQuery = sessQuery.eq("sede_id", req.sedeId);
    }

    const { data: sessions, error } = await sessQuery;

    if (error) throw error;

    // ── BATCH: Obtener TODAS las asignaciones y logs de una vez ──
    const sessionIds = sessions.map((s) => s.id);

    // Una sola query para todas las asignaciones de todas las sesiones activas
    const { data: allAssignments } =
      sessionIds.length > 0
        ? await supabase
            .from("wc_asignaciones_pedidos")
            .select("id, id_sesion")
            .in("id_sesion", sessionIds)
        : { data: [] };

    const allAssignIds = (allAssignments || []).map((a) => a.id);

    // Todos los logs de todas las asignaciones, paginado por tandas para no
    // truncar en silencio (varias sesiones activas superan fácil las 1000 filas).
    const allLogs =
      allAssignIds.length > 0
        ? await fetchByIdsChunked(
            "wc_log_picking",
            "id_asignacion, id_producto, id_producto_original, accion, es_sustituto, fecha_registro, nombre_producto, pasillo",
            "id_asignacion",
            allAssignIds,
            { column: "fecha_registro", ascending: true },
          )
        : [];

    // Indexar para acceso rápido
    const assignmentsBySession = {};
    (allAssignments || []).forEach((a) => {
      if (!assignmentsBySession[a.id_sesion])
        assignmentsBySession[a.id_sesion] = [];
      assignmentsBySession[a.id_sesion].push(a);
    });

    const logsByAssignment = {};
    (allLogs || []).forEach((l) => {
      if (!logsByAssignment[l.id_asignacion])
        logsByAssignment[l.id_asignacion] = [];
      logsByAssignment[l.id_asignacion].push(l);
    });

    const dashboardData = await Promise.all(
      sessions.map(async (sess) => {
        // A. Obtener Pedidos (Snapshot o Woo)
        let orders =
          sess.snapshot_pedidos && sess.snapshot_pedidos.length > 0
            ? sess.snapshot_pedidos
            : await (async () => {
                // Multi-sede: usar el cliente WC de la sede de esta sesión
                const sessClient = await getWooClient(sess.sede_id);
                const results = await Promise.all(
                  sess.ids_pedidos.map((id) => sessClient.get(`orders/${id}`)),
                );
                return results.map((r) => r.data);
              })();

        // B. Calcular Universo de Items (Líneas únicas)
        const itemsUnificados = agruparItemsParaPicking(orders);
        const activeItems = itemsUnificados.filter((i) => !i.is_removed);
        const totalItems = activeItems.length;

        // C. Obtener Logs de ESTA sesión (desde el batch pre-cargado)
        const sessAssigns = assignmentsBySession[sess.id] || [];
        const logs = sessAssigns.flatMap((a) => logsByAssignment[a.id] || []);

        // D. Matemática de Progreso (Item por Item)
        let completedLines = 0;
        let subLines = 0;
        let totalUnitsRequired = 0;
        let totalUnitsProcessed = 0;
        let notFoundLines = 0;

        activeItems.forEach((item) => {
          // ✅ FIX: Para productos con variaciones, el picker loguea con variation_id
          // como id_producto/id_producto_original, NO con product_id (padre).
          // Debemos comparar contra ambos: product_id Y variation_id.
          const matchIds = [String(item.product_id)];
          if (item.variation_id) {
            matchIds.push(String(item.variation_id));
          }

          const itemLogs = logs.filter(
            (l) =>
              matchIds.includes(String(l.id_producto)) ||
              matchIds.includes(String(l.id_producto_original)),
          );

          // Cantidad requerida vs Cantidad procesada
          const qtyRequired = item.quantity_total;
          totalUnitsRequired += qtyRequired;

          // Solo acciones definitivas (recolectado, sustituido, no_encontrado)
          const validLogs = itemLogs.filter((l) =>
            ["recolectado", "sustituido", "no_encontrado"].includes(l.accion),
          );
          const qtyProcessed = validLogs.length;
          totalUnitsProcessed += Math.min(qtyProcessed, qtyRequired);

          // ¿Línea Completa? (Solo si procesó TODO lo requerido)
          if (qtyProcessed >= qtyRequired) {
            completedLines++;
            if (itemLogs.some((l) => l.es_sustituto)) {
              subLines++;
            }
            if (validLogs.every((l) => l.accion === "no_encontrado")) {
              notFoundLines++;
            }
          }
        });

        // Porcentaje basado en UNIDADES procesadas (más granular que líneas completas)
        const percentage =
          totalUnitsRequired > 0
            ? Math.round((totalUnitsProcessed / totalUnitsRequired) * 100)
            : 0;

        // Ubicación Actual (Último movimiento)
        let currentLocation = "Inicio";
        if (logs.length > 0) {
          const lastLog = logs.sort(
            (a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro),
          )[0];
          if (lastLog.pasillo) currentLocation = `Pasillo ${lastLog.pasillo}`;
          else currentLocation = "En Ruta";
        }

        // Tiempo de inicio real de picking (primer log de acción válida)
        const validPickActions = ["recolectado", "sustituido", "no_encontrado"];
        const firstPickLog = logs
          .filter((l) => validPickActions.includes(l.accion))
          .sort(
            (a, b) => new Date(a.fecha_registro) - new Date(b.fecha_registro),
          )[0];
        const pickingStartTime = firstPickLog?.fecha_registro || null;

        return {
          session_id: sess.id,
          picker_id: sess.id_picker,
          picker_name: sess.wc_pickers?.nombre_completo || "Desconocido",
          sede_nombre: sess.wc_sedes?.nombre || null,
          start_time: sess.fecha_inicio,
          picking_start_time: pickingStartTime,

          total_items: totalItems, // Total de líneas de producto distintas
          completed_items: completedLines, // Líneas completadas al 100%
          substituted_items: subLines, // Líneas con sustitución
          not_found_items: notFoundLines, // Líneas no encontradas (stock insuficiente)

          // Conteo granular por unidades
          total_units: totalUnitsRequired,
          processed_units: totalUnitsProcessed,

          progress: percentage,
          current_location: currentLocation,
          orders_count: sess.ids_pedidos.length,
          order_ids: sess.ids_pedidos,
          clientes: orders.map(
            (o) =>
              (
                (o.billing?.first_name || "") +
                " " +
                (o.billing?.last_name || "")
              ).trim() || "Cliente",
          ),
          telefonos: orders.map((o) => o.billing?.phone || "").filter(Boolean),
          documentos: orders.map((o) => extractDocumento(o)),
          metodos_pago: orders.map((o) => extractMetodoPago(o)),
          totales: calcTotalesFromDatosSalida(null, orders, sess.ids_pedidos),
        };
      }),
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error getActiveSessionsDashboard:", error.message);
    res.status(500).json({
      error: `Error al cargar el dashboard de sesiones activas: ${error.message}`,
    });
  }
};

// =========================================================
// 2. PEDIDOS PENDIENTES
// =========================================================
exports.getPendingOrders = async (req, res) => {
  try {
    if (req.query.force === "true") {
      invalidateResponseCache();
    }

    // ── MULTI-SEDE (WordPress Multisite): Cada sede tiene su propio WooCommerce ──
    let wcOrders;
    if (req.sedeId) {
      // Sede específica → fetch cacheado
      const data = await fetchFromSede(req.sedeId, "orders", {
        status: "processing",
        per_page: 50,
      });
      // Tagear cada pedido con la sede de origen
      wcOrders = data.map((o) => ({ ...o, _sede_id: req.sedeId }));
    } else {
      // "Todas las sedes" → consultar TODOS los WooCommerce en paralelo
      wcOrders = await fetchFromAllSedes("orders", {
        status: "processing",
        per_page: 50,
      });
    }

    // Obtener asignaciones activas verificando la sesión a la que pertenecen.
    // Solo omitimos el pedido si está en "en_proceso" o "completado"
    // y su sesión correspondiente AÚN está activa (no finalizada/cancelada).
    let assignQuery = supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido, sede_id, wc_picking_sessions!inner(estado)")
      .in("estado_asignacion", ["en_proceso", "completado"])
      .neq("wc_picking_sessions.estado", "cancelado");

    if (req.sedeId) {
      assignQuery = assignQuery.eq("sede_id", req.sedeId);
    }
    const { data: activeAssignments } = await assignQuery;
    // Multisede: el order_id NO es único global (cada sede tiene su propio
    // auto-increment). La asignación debe cotejarse por (id_pedido, sede_id);
    // si no, un pedido asignado en una sede oculta el pedido con el mismo id
    // en otra sede en modo "Todas las sedes".
    const assignedKeys = new Set(
      (activeAssignments || []).map((a) => `${a.id_pedido}-${a.sede_id}`),
    );

    // Riesgo de bot: se evalúa acá, en la única lista donde un humano decide si
    // el pedido entra a picking. Marcarlo antes de asignarlo evita que un
    // pedido inventado de $400k se lleve un picker y stock real.
    const cleanOrders = wcOrders.map((order) => ({
      ...order,
      is_assigned: assignedKeys.has(`${order.id}-${order._sede_id}`),
      sede_detected: order._sede_name || null,
      sede_id: order._sede_id || null,
      riesgo_bot: evaluarRiesgoBot(order),
    }));

    res.status(200).json(cleanOrders);
  } catch (e) {
    console.error("Error getPendingOrders:", e.message);
    res
      .status(500)
      .json({ error: `Error al cargar pedidos pendientes: ${e.message}` });
  }
};

// =========================================================
// 3. LISTADO DE PICKERS
// =========================================================
exports.getPickers = async (req, res) => {
  const { email } = req.query;

  // Only return pickers that still have an active profile (deleted users leave orphan wc_pickers rows)
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("correo")
    .eq("role", "picker");

  if (profilesError)
    return res
      .status(500)
      .json({ error: `Error al consultar profiles: ${profilesError.message}` });

  const activeEmails = profiles
    .map((p) => (p.correo || "").toLowerCase().trim())
    .filter(Boolean);

  if (activeEmails.length === 0) return res.status(200).json([]);

  let query = supabase
    .from("wc_pickers")
    .select("*, wc_sedes(nombre, slug)")
    .in("email", activeEmails)
    .order("nombre_completo", { ascending: true });

  if (email) query = query.eq("email", email.toLowerCase().trim());
  if (req.sedeId) query = query.eq("sede_id", req.sedeId);

  const { data, error } = await query;
  if (error)
    return res
      .status(500)
      .json({ error: `Error al consultar pickers: ${error.message}` });

  // Calcular cantidad de pedidos activos por picker
  const pickerIds = data.map(p => p.id);
  const { data: activeAssignments } = await supabase
    .from("wc_asignaciones_pedidos")
    .select("id_picker")
    .in("id_picker", pickerIds)
    .eq("estado_asignacion", "en_proceso");

  const assignmentsCountByPicker = {};
  if (activeAssignments) {
    activeAssignments.forEach(a => {
      assignmentsCountByPicker[a.id_picker] = (assignmentsCountByPicker[a.id_picker] || 0) + 1;
    });
  }

  const enrichedData = data.map(picker => ({
    ...picker,
    active_orders_count: assignmentsCountByPicker[picker.id] || 0,
  }));

  res.status(200).json(enrichedData);
};

// =========================================================
// 4. HISTORIAL DE SESIONES
// =========================================================

/**
 * Calcula los totales de cada pedido desde datos_salida (post-picking, precios reales).
 * Fallback a snapshot_pedidos.total si datos_salida no está disponible.
 *
 * @param {Object|null} datosSalida  — campo datos_salida de la sesión
 * @param {Array}       snapshotPedidos — campo snapshot_pedidos
 * @param {number[]}    idsPedidos    — ids_pedidos para mantener el orden
 * @returns {(number|null)[]}         — array de totales en el mismo orden que ids_pedidos
 */
function calcTotalesFromDatosSalida(
  datosSalida,
  snapshotPedidos,
  idsPedidos,
  session_id = null,
) {
  // 1. Si hay datos_salida con orders (el flujo ideal), calcular desde ahí
  if (datosSalida?.orders?.length) {
    return (idsPedidos || []).map((pid) => {
      const order = datosSalida.orders.find(
        (o) => String(o.id) === String(pid),
      );
      if (!order) return null;

      const productItems = (order.items || []).filter(
        (i) => !i.is_shipping_method && !i.is_removed,
      );
      const itemsTotal = productItems.reduce(
        (sum, item) => sum + calcLineCharge(item),
        0,
      );
      const shippingTotal = (order.shipping_lines || []).reduce(
        (sum, s) => sum + (parseFloat(s.total) || 0),
        0,
      );
      const calculatedTotal = itemsTotal + shippingTotal;

      // ✅ REGLA DE ORO: datos_salida es la única fuente de verdad
      // Siempre usamos el total recalculado con calcLineCharge (consistente en todo el sistema)
      return calculatedTotal || null;
    });
  }

  // 2. Fallback: Si no hay datos_salida pero tenemos el snapshot, usar el total calculándolo sin productos eliminados
  if (snapshotPedidos?.length) {
    return snapshotPedidos.map((order) => {
      const productItems = (order.line_items || order.items || []).filter(
        (i) => !i.is_shipping_method && !i.is_removed,
      );
      const itemsTotal = productItems.reduce(
        (sum, item) => sum + calcLineCharge(item),
        0,
      );
      const shippingTotal = (order.shipping_lines || []).reduce(
        (sum, s) => sum + (parseFloat(s.total) || 0),
        0,
      );
      const calculatedTotal = itemsTotal + shippingTotal;

      const wooOrderTotal = parseFloat(order.total) || 0;
      if (
        Math.abs(calculatedTotal - wooOrderTotal) > 1 &&
        calculatedTotal > 0
      ) {
        return calculatedTotal;
      }
      return wooOrderTotal > 0 ? wooOrderTotal : calculatedTotal || null;
    });
  }

  return (idsPedidos || []).map(() => null);
}

exports.getPendingPaymentSessions = async (req, res) => {
  try {
    let payQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre ), wc_asignaciones_pedidos ( id_pedido, metodo_pago, fecha_pago, pagado_por )`,
      )
      .eq("estado", "auditado")
      .order("fecha_fin", { ascending: false });
    // Filtro Multi-Sede
    if (req.sedeId) {
      payQuery = payQuery.eq("sede_id", req.sedeId);
    }
    const { data: sessions, error } = await payQuery;

    if (error) throw error;

    const pendingData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = new Date(sess.fecha_fin);
      const durationMin = Math.round((end - start) / 60000);
      const optionsDate = {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const optionsTime = {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      const clientes = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map(
            (o) =>
              (
                (o.billing?.first_name || "") +
                " " +
                (o.billing?.last_name || "")
              ).trim() || "Cliente",
          )
        : [];

      const telefonos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.phone || "")
            .filter(Boolean)
        : [];
      const emails = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.email || "")
            .filter(Boolean)
        : [];

      const totales = calcTotalesFromDatosSalida(
        sess.datos_salida,
        sess.snapshot_pedidos,
        sess.ids_pedidos,
      );

      const documentos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractDocumento(o))
        : [];

      const metodos_pago = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractMetodoPago(o))
        : [];

      // Estado de pago real por pedido (desde la junction wc_asignaciones_pedidos).
      // El front lo usa para mostrar progreso parcial y bloquear botones de
      // pedidos ya pagados.
      const asignacionesById = new Map(
        (sess.wc_asignaciones_pedidos || []).map((a) => [a.id_pedido, a]),
      );
      // Snapshot por id, para saber qué pedidos llegaron con pasarela Crédito
      // aunque su asignación todavía no esté resuelta.
      const snapshotById = new Map(
        (sess.snapshot_pedidos || []).map((o) => [o.id, o]),
      );

      const pagos_pedidos = (sess.ids_pedidos || []).map((idPedido) => {
        const a = asignacionesById.get(idPedido);
        return {
          id_pedido: idPedido,
          metodo_pago: a?.metodo_pago || null,
          fecha_pago: a?.fecha_pago || null,
          pagado_por: a?.pagado_por || null,
          // El cajero NO debe cobrarlos: ya quedaron resueltos como crédito.
          es_credito: isCreditoOrder(snapshotById.get(idPedido)),
        };
      });

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        telefonos,
        emails,
        totales,
        documentos,
        metodos_pago,
        pagos_pedidos,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(pendingData);
  } catch (error) {
    console.error("Error getPendingPaymentSessions:", error.message);
    res.status(500).json({
      error: `Error al cargar sesiones pendientes de pago: ${error.message}`,
    });
  }
};

// Métodos de pago aceptados a nivel de pedido individual.
const VALID_PAYMENT_METHODS = ["efectivo", "qr", "datafono", "credito"];

// Cierra la sesión si todos sus pedidos ya tienen método de pago definido.
// Compartido por markSessionAsPaid (el cajero registra un cobro) y
// completeAuditSession (el sistema auto-resuelve los pedidos a crédito), para
// que ambos caminos usen exactamente el mismo criterio de cierre.
// Devuelve { finalized, sedeId, pickerName }.
async function settleSessionIfComplete(sessionId, now, actorName) {
  const { data: asignaciones, error: readErr } = await supabase
    .from("wc_asignaciones_pedidos")
    .select("id_pedido, metodo_pago, fecha_pago")
    .eq("id_sesion", sessionId);
  if (readErr) throw readErr;

  if (!allSettled(asignaciones)) {
    const { data: sessRead } = await supabase
      .from("wc_picking_sessions")
      .select(
        "sede_id, wc_pickers!wc_picking_sessions_picker_fkey(nombre_completo)",
      )
      .eq("id", sessionId)
      .single();
    return {
      finalized: false,
      sedeId: sessRead?.sede_id || null,
      pickerName: sessRead?.wc_pickers?.nombre_completo || null,
    };
  }

  const { data: sessUpdated, error: sessErr } = await supabase
    .from("wc_picking_sessions")
    .update({
      estado: "finalizado",
      metodo_pago: summarizeSessionMethod(asignaciones),
      // A nivel de sesión, fecha_pago marca cuándo quedó resuelto el tema pago.
      // El cobro real de un crédito vive en la asignación, no acá.
      fecha_pago: now,
      pagado_por: actorName,
    })
    .eq("id", sessionId)
    .select(
      "sede_id, wc_pickers!wc_picking_sessions_picker_fkey(nombre_completo)",
    )
    .single();
  if (sessErr) throw sessErr;

  return {
    finalized: true,
    sedeId: sessUpdated?.sede_id || null,
    pickerName: sessUpdated?.wc_pickers?.nombre_completo || null,
  };
}

// Marca como 'credito' (sin fecha de cobro) los pedidos que llegaron con la
// pasarela Crédito de WooCommerce. Sin esto la sesión se quedaría esperando un
// cobro que nunca ocurre en la entrega, arrastrando fuera del recaudo a los
// pedidos que sí se cobraron. Solo toca asignaciones sin método definido, así
// que es idempotente y nunca pisa lo que registró un cajero.
async function autoResolveCreditoOrders(sessionId, snapshotOrders) {
  const creditoIds = findCreditoOrderIds(snapshotOrders);
  if (creditoIds.length === 0) return [];

  const { data: updated, error } = await supabase
    .from("wc_asignaciones_pedidos")
    .update({
      metodo_pago: CREDITO_METHOD,
      fecha_pago: null,
      pagado_por: SYSTEM_ACTOR,
    })
    .eq("id_sesion", sessionId)
    .in("id_pedido", creditoIds)
    .is("metodo_pago", null)
    .select("id_pedido");
  if (error) throw error;

  return (updated || []).map((a) => a.id_pedido);
}

// Cada pedido de una sesión puede pagarse con un método distinto. La fuente de
// verdad es wc_asignaciones_pedidos (junction sesión↔pedido). El campo
// metodo_pago en wc_picking_sessions queda como resumen derivado:
//   - método único si todos los pedidos coinciden
//   - "mixto" si hubo más de un método
// La sesión solo pasa a estado "finalizado" cuando TODAS sus asignaciones
// tienen metodo_pago no nulo.
exports.markSessionAsPaid = async (req, res) => {
  const { session_id, payments, admin_name, admin_email } = req.body;

  if (!session_id) return res.status(400).json({ error: "Falta session_id" });
  if (!Array.isArray(payments) || payments.length === 0) {
    return res
      .status(400)
      .json({ error: "Falta payments[] con al menos un pago" });
  }

  for (const p of payments) {
    if (!p.id_pedido) {
      return res
        .status(400)
        .json({ error: "Cada item de payments[] requiere id_pedido" });
    }
    if (!VALID_PAYMENT_METHODS.includes(p.payment_method)) {
      return res.status(400).json({
        error: `payment_method inválido para pedido ${p.id_pedido}. Esperado: ${VALID_PAYMENT_METHODS.join(", ")}`,
      });
    }
  }

  const now = new Date().toISOString();
  const actorName = (admin_name || "").trim() || "Admin";

  try {
    // 1. Persistir el método por pedido en la junction. Un pedido a crédito se
    //    registra SIN fecha_pago: queda resuelto pero debiendo, y lo cobra
    //    cartera después.
    for (const p of payments) {
      const { error: updErr } = await supabase
        .from("wc_asignaciones_pedidos")
        .update({
          metodo_pago: p.payment_method,
          fecha_pago: paymentDateFor(p.payment_method, now),
          pagado_por: actorName,
        })
        .eq("id_sesion", session_id)
        .eq("id_pedido", p.id_pedido);
      if (updErr) throw updErr;
    }

    // 2. Cerrar la sesión si ya no queda ningún pedido sin método.
    const settlement = await settleSessionIfComplete(session_id, now, actorName);
    const sessionFinalized = settlement.finalized;
    const sedeIdForLog = settlement.sedeId || req.sedeId || null;
    const pickerName = settlement.pickerName;

    // 3. Una entrada de auditoría por pago registrado.
    for (const p of payments) {
      logAuditEvent({
        actor: { type: "admin", id: admin_email || null, name: actorName },
        action: "payment.marked",
        entity: { type: "order", id: p.id_pedido },
        sedeId: sedeIdForLog,
        metadata: {
          session_id,
          payment_method: p.payment_method,
          picker_name: pickerName,
        },
      });
    }

    const aCredito = payments.filter(
      (p) => p.payment_method === CREDITO_METHOD,
    ).length;

    // Cambió el método de pago de pedidos → recalcular recaudo pre-agregado.
    await refreshSessionSummary(session_id);

    res.status(200).json({
      message: sessionFinalized
        ? "Todos los pedidos resueltos. Sesión finalizada."
        : "Pagos parciales registrados.",
      session_finalized: sessionFinalized,
      payments_recorded: payments.length,
      pendientes_cartera: aCredito,
    });
  } catch (error) {
    console.error("Error markSessionAsPaid:", error.message);
    res
      .status(500)
      .json({ error: `Error al registrar pagos: ${error.message}` });
  }
};

exports.getHistorySessions = async (req, res) => {
  try {
    let histQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, sede_id, metodo_pago, fecha_pago, pagado_por, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre ), wc_asignaciones_pedidos ( id_pedido, metodo_pago, fecha_pago, pagado_por )`,
      )
      .in("estado", ["finalizado"])
      .order("fecha_fin", { ascending: false })
      .limit(500);
    // Filtro Multi-Sede
    if (req.sedeId) {
      histQuery = histQuery.eq("sede_id", req.sedeId);
    }
    const { data: sessions, error } = await histQuery;

    if (error) throw error;

    const historyData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = new Date(sess.fecha_fin);
      const durationMin = Math.round((end - start) / 60000);
      const optionsDate = {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const optionsTime = {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      const clientes = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map(
            (o) =>
              (
                (o.billing?.first_name || "") +
                " " +
                (o.billing?.last_name || "")
              ).trim() || "Cliente",
          )
        : [];

      const telefonos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.phone || "")
            .filter(Boolean)
        : [];
      const emails = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.email || "")
            .filter(Boolean)
        : [];

      const totales = calcTotalesFromDatosSalida(
        sess.datos_salida,
        sess.snapshot_pedidos,
        sess.ids_pedidos,
      );

      const documentos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractDocumento(o))
        : [];

      const metodos_pago = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractMetodoPago(o))
        : [];

      // Estado de pago real por pedido (desde la junction wc_asignaciones_pedidos).
      const asignacionesById = new Map(
        (sess.wc_asignaciones_pedidos || []).map((a) => [a.id_pedido, a]),
      );
      // Snapshot por id, para saber qué pedidos llegaron con pasarela Crédito
      // aunque su asignación todavía no esté resuelta.
      const snapshotById = new Map(
        (sess.snapshot_pedidos || []).map((o) => [o.id, o]),
      );

      const pagos_pedidos = (sess.ids_pedidos || []).map((idPedido) => {
        const a = asignacionesById.get(idPedido);
        return {
          id_pedido: idPedido,
          metodo_pago: a?.metodo_pago || null,
          fecha_pago: a?.fecha_pago || null,
          pagado_por: a?.pagado_por || null,
          // El cajero NO debe cobrarlos: ya quedaron resueltos como crédito.
          es_credito: isCreditoOrder(snapshotById.get(idPedido)),
        };
      });

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        telefonos,
        emails,
        totales,
        documentos,
        metodos_pago,
        pagos_pedidos,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
        estado: sess.estado,
        metodo_pago: sess.metodo_pago || null,
        fecha_pago: sess.fecha_pago || null,
        pagado_por: sess.pagado_por || null,
      };
    });
    res.status(200).json(historyData);
  } catch (error) {
    console.error("Error getHistorySessions:", error.message);
    res.status(500).json({
      error: `Error al cargar historial de sesiones: ${error.message}`,
    });
  }
};

// =========================================================
// 4B. PENDIENTES DE AUDITORIA
// =========================================================
exports.getPendingAuditSessions = async (req, res) => {
  try {
    let auditQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre )`,
      )
      .eq("estado", "pendiente_auditoria")
      .order("fecha_fin", { ascending: false })
      .limit(100);
    // Filtro Multi-Sede
    if (req.sedeId) {
      auditQuery = auditQuery.eq("sede_id", req.sedeId);
    }
    const { data: sessions, error } = await auditQuery;

    if (error) throw error;

    const pendingData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = sess.fecha_fin ? new Date(sess.fecha_fin) : null;
      const durationMin = end
        ? Math.round((end - start) / 60000)
        : Math.round((Date.now() - start.getTime()) / 60000);
      const optionsDate = {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const optionsTime = {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      const clientes = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map(
            (o) =>
              (
                (o.billing?.first_name || "") +
                " " +
                (o.billing?.last_name || "")
              ).trim() || "Cliente",
          )
        : [];

      const telefonos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.phone || "")
            .filter(Boolean)
        : [];
      const emails = sess.snapshot_pedidos
        ? sess.snapshot_pedidos
            .map((o) => o.billing?.email || "")
            .filter(Boolean)
        : [];

      const totales = calcTotalesFromDatosSalida(
        sess.datos_salida,
        sess.snapshot_pedidos,
        sess.ids_pedidos,
      );

      const documentos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractDocumento(o))
        : [];

      const metodos_pago = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => extractMetodoPago(o))
        : [];

      const fechas_pedidos = sess.snapshot_pedidos
        ? sess.snapshot_pedidos.map((o) => {
            if (!o.date_created) return null;
            const d = new Date(o.date_created);
            return {
              fecha: d.toLocaleDateString("es-CO", optionsDate),
              hora: d.toLocaleTimeString("es-CO", optionsTime),
            };
          })
        : [];

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        telefonos,
        emails,
        totales,
        documentos,
        metodos_pago,
        fechas_pedidos,
        fecha: end ? end.toLocaleDateString("es-CO", optionsDate) : "--",
        hora_inicio: start.toLocaleTimeString("es-CO", optionsTime),
        hora_fin: end ? end.toLocaleTimeString("es-CO", optionsTime) : "--",
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(pendingData);
  } catch (error) {
    console.error("Error getPendingAuditSessions:", error.message);
    res.status(500).json({
      error: `Error al cargar sesiones pendientes de auditoría: ${error.message}`,
    });
  }
};

// =========================================================
// 5. FINALIZAR AUDITORÍA (APROBAR SALIDA)
// =========================================================
exports.completeAuditSession = async (req, res) => {
  const { session_id, datos_salida, auditor_name, auditor_email } = req.body;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const now = new Date().toISOString();

    const { data: session, error: getSessError } = await supabase
      .from("wc_picking_sessions")
      .select("id_picker, ids_pedidos, resumen_metricas, sede_id")
      .eq("id", session_id)
      .single();

    if (getSessError) throw getSessError;

    // Actualizar métricas y estado
    const currentMetrics = session.resumen_metricas || {};
    const updatedMetrics = { ...currentMetrics, fecha_fin_auditoria: now };

    const updatePayload = {
      estado: "auditado", // ✅ Estado final luego de auditoria
      resumen_metricas: updatedMetrics,
    };

    if (datos_salida) {
      // 🚀 LIMPIEZA DE PRECIOS 0: Si algún ítem llega con precio 0 pero tiene valor real, lo rescatamos
      if (datos_salida.orders && Array.isArray(datos_salida.orders)) {
        datos_salida.orders.forEach((order) => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item) => {
              // Si no es un ítem de despacho y tiene precio/catálogo pero line_total es 0
              if (!item.is_shipping_method) {
                const itemPrice = parseFloat(item.price) || 0;
                const itemCatalog = parseFloat(item.catalog_price) || 0;
                const effectivePrice = itemPrice || itemCatalog;

                if (
                  (!item.line_total || parseFloat(item.line_total) === 0) &&
                  effectivePrice > 0
                ) {
                  item.price = effectivePrice;
                  item.catalog_price = itemCatalog || effectivePrice;
                  item.subtotal = effectivePrice;
                  item.line_total = effectivePrice;
                }
              }
            });
          }
        });
      }
      updatePayload.datos_salida = datos_salida;
    }

    const { error: sessError } = await supabase
      .from("wc_picking_sessions")
      .update(updatePayload)
      .eq("id", session_id);
    if (sessError) throw sessError;

    // Liberar Picker
    if (session && session.id_picker) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", session.id_picker);
    }

    // ✅ BLINDAJE ANTI-FANTASMAS: Detectar ítems no procesados y marcarlos como faltantes por sistema
    //
    // ⚠️ Este bloque hoy es INERTE a propósito: el SELECT de la sesión no pide
    // `snapshot_pedidos`, así que `snapshotOrders` queda vacío. Ver la nota de
    // CLAUDE.md antes de activarlo.
    //
    // La consulta de logs de acá abajo estaba ROTA: filtraba por `id_sesion`,
    // columna que `wc_log_picking` NO tiene (ver sql/2026-08-19_hot_path_indexes.sql).
    // Fallaba en silencio y dejaba `allSessionLogs` en null — de modo que si
    // alguien agregaba `snapshot_pedidos` al SELECT, este bloque marcaba
    // TODOS los ítems recolectados como `no_encontrado`: se facturaban en $0 y
    // salían rotulados "NO ENTREGADO" en WooCommerce.
    // Ahora se enlaza por `id_asignacion`, que es como los logs cuelgan de la
    // sesión de verdad, y el error se revisa en vez de tragarse.
    const snapshotOrders = session.snapshot_pedidos || [];

    const { data: sessionAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", session_id);

    let allSessionLogs = [];
    let ghostGuardOk = true;
    if (sessionAssignments && sessionAssignments.length > 0) {
      const { data: logsSesion, error: logsErr } = await supabase
        .from("wc_log_picking")
        .select("*")
        .in(
          "id_asignacion",
          sessionAssignments.map((a) => a.id),
        );
      if (logsErr) {
        // Sin los logs no se puede distinguir un ítem no procesado de uno
        // recolectado. Se desactiva el blindaje: marcar todo "no_encontrado"
        // sería infinitamente peor que no marcar nada.
        console.error(
          "⚠️ No se pudieron leer los logs de la sesión; blindaje anti-fantasmas OMITIDO:",
          logsErr.message,
        );
        ghostGuardOk = false;
      } else {
        allSessionLogs = logsSesion || [];
      }
    }

    const ghostLogs = [];
    const ordersParaBlindaje = ghostGuardOk ? snapshotOrders : [];
    ordersParaBlindaje.forEach((orderSnap) => {
      const assign = sessionAssignments?.find(
        (a) => String(a.id_pedido) === String(orderSnap.id),
      );
      if (!assign) return;

      const orderLogs = (allSessionLogs || []).filter(
        (l) => String(l.id_pedido) === String(orderSnap.id),
      );

      orderSnap.line_items?.forEach((item) => {
        const pId = item.product_id;
        const vId = item.variation_id;
        // ¿Tiene algún log de acción real? (recolectado, sustituido, no_encontrado, eliminado_admin)
        const hasAction = orderLogs.some(
          (l) =>
            (String(l.id_producto) === String(pId) ||
              (vId && String(l.id_producto) === String(vId))) &&
            [
              "recolectado",
              "sustituido",
              "no_encontrado",
              "eliminado_admin",
            ].includes(l.accion),
        );

        if (!hasAction) {
          console.warn(
            `👻 Detectado ítem fantasma: ${item.name} en pedido #${orderSnap.id}. Registrando faltante por sistema.`,
          );
          ghostLogs.push({
            id_asignacion: assign.id,
            id_pedido: orderSnap.id,
            id_producto: vId || pId,
            id_producto_original: vId || pId,
            nombre_producto: item.name,
            accion: "no_encontrado",
            motivo: "SISTEMA: No procesado por el picker al cerrar sesión",
            fecha_registro: now,
            sede_id: session.sede_id,
          });
        }
      });
    });

    if (ghostLogs.length > 0) {
      await supabase.from("wc_log_picking").insert(ghostLogs);
    }

    // Log de Sistema
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", session_id)
      .limit(1);

    // ✅ Actualizar estado de asignaciones también a 'completado'
    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "completado", fecha_fin: now })
      .eq("id_sesion", session_id);
    if (assignments && assignments.length > 0) {
      await supabase.from("wc_log_picking").insert([
        {
          id_asignacion: assignments[0].id,
          id_pedido: assignments[0].id_pedido,
          id_producto: 0,
          accion: "auditoria_finalizada",
          motivo: "Salida Autorizada - Snapshot Guardado",
          fecha_registro: now,
          nombre_producto: "--- PROCESO FINALIZADO ---",
        },
      ]);
    }

    // ✅ CRÉDITO: los pedidos que llegaron con la pasarela Crédito no se cobran
    // en la entrega. Se resuelven acá como 'credito' sin fecha_pago, para que la
    // sesión pueda cerrar y entrar a los reportes mientras la deuda sigue viva
    // en cartera. Se consulta el snapshot aparte a propósito: agregarlo al
    // SELECT de arriba activaría el bloque anti-fantasmas de la línea ~1128,
    // que hoy está inerte porque `session.snapshot_pedidos` nunca se pide.
    let creditoResueltos = [];
    try {
      const { data: snapRow } = await supabase
        .from("wc_picking_sessions")
        .select("snapshot_pedidos")
        .eq("id", session_id)
        .single();

      creditoResueltos = await autoResolveCreditoOrders(
        session_id,
        snapRow?.snapshot_pedidos || [],
      );

      if (creditoResueltos.length > 0) {
        // Si TODOS los pedidos de la sesión eran a crédito, nadie va a abrir el
        // modal de cobro: hay que cerrarla acá o se queda colgada para siempre.
        await settleSessionIfComplete(session_id, now, SYSTEM_ACTOR);

        for (const orderId of creditoResueltos) {
          logAuditEvent({
            actor: { type: "system", id: null, name: SYSTEM_ACTOR },
            action: "payment.marked",
            entity: { type: "order", id: orderId },
            sedeId: session?.sede_id || req.sedeId || null,
            metadata: {
              session_id,
              payment_method: CREDITO_METHOD,
              auto_resolved: true,
              reason: "Pedido con pasarela Crédito — cobro pendiente en cartera",
            },
          });
        }
      }
    } catch (creditErr) {
      // Un fallo acá no debe tumbar el cierre de auditoría: el pedido queda
      // pendiente de cobro y el cajero lo puede marcar a mano.
      console.error(
        "⚠️ Error auto-resolviendo pedidos a crédito:",
        creditErr.message,
      );
    }

    // Sync Woo — AWAIT obligatorio para que se complete antes de cerrar la respuesta
    // (En Vercel serverless, el proceso muere al enviar res.json si no esperamos)
    const syncResults = [];
    if (session.ids_pedidos && session.ids_pedidos.length > 0) {
      for (const orderId of session.ids_pedidos) {
        try {
          console.log(`🚀 Iniciando Sync para Orden #${orderId}...`);
          const result = await syncOrderToWoo(session_id, orderId);
          syncResults.push({ orderId, success: result });
        } catch (err) {
          console.error(`❌ Error sync orden ${orderId}:`, err);
          syncResults.push({ orderId, success: false, error: err.message });
        }
      }
    }

    const allSynced = syncResults.every((r) => r.success);

    // Resolver nombre del picker para el registro de auditoría
    let auditPickerName = null;
    if (session?.id_picker) {
      const { data: pickerRow } = await supabase
        .from("wc_pickers")
        .select("nombre_completo")
        .eq("id", session.id_picker)
        .single();
      auditPickerName = pickerRow?.nombre_completo || null;
    }

    logAuditEvent({
      actor: {
        type: "auditor",
        id: auditor_email || null,
        name: (auditor_name || "").trim() || "Auditor",
      },
      action: "session.audited",
      entity: { type: "session", id: session_id },
      sedeId: session?.sede_id || req.sedeId || null,
      metadata: {
        orders: session?.ids_pedidos || [],
        picker_id: session?.id_picker || null,
        picker_name: auditPickerName,
        all_synced: allSynced,
      },
    });

    // Recalcular el recaudo pre-agregado de la sesión (estado ya es 'auditado',
    // datos_salida y créditos resueltos). Deja exacto el total /analytics/summary.
    await refreshSessionSummary(session_id);

    res.status(200).json({
      message: allSynced
        ? "Salida aprobada. Pedidos sincronizados con WooCommerce."
        : "Salida aprobada. Algunos pedidos tuvieron errores de sincronización.",
      sync_results: syncResults,
      credito_auto_resueltos: creditoResueltos,
    });
  } catch (error) {
    console.error("Error finalizando auditoría:", error.message);
    res
      .status(500)
      .json({ error: `Error al finalizar auditoría: ${error.message}` });
  }
};

// =========================================================
// 6. CONSULTA DETALLADA (AUDITOR & HISTORIAL)
// =========================================================
exports.getSessionLogsDetail = async (req, res) => {
  let { session_id } = req.query;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    // Detección ID Corto
    if (session_id.length < 30) {
      const { data: recents } = await supabase
        .from("wc_picking_sessions")
        .select("id")
        .order("fecha_inicio", { ascending: false })
        .limit(100);
      const match = recents.find((s) => s.id.startsWith(session_id));
      if (!match)
        return res
          .status(404)
          .json({ error: "Sesión no encontrada (ID Corto)." });
      session_id = match.id;
    }

    const { data: sessionInfo, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, wc_pickers!wc_picking_sessions_picker_fkey(nombre_completo, email)`,
      )
      .eq("id", session_id)
      .single();

    if (sessError || !sessionInfo)
      throw new Error("Error obteniendo info de la sesión");

    let ordersData = [];
    let productDetailsMap = {};

    const processOrderData = (orderList) => {
      return orderList.map((o) => {
        if (o.line_items) {
          o.line_items.forEach((item) => {
            const imgUrl =
              item.image?.src ||
              (item.image && item.image.length > 0 ? item.image[0].src : null);
            const unitMeta = item.meta_data?.find(
              (m) => m.key === "pa_unidad-de-medida-aproximado",
            );
            const unitMeasure = unitMeta ? unitMeta.display_value : null;
            // catalog_price: precio de catálogo por unidad/kg (sin ajuste de peso)
            // effective_price: total cobrado / cantidad pedida (lo que realmente se factura)
            // Para productos pesables: total = catalog_price × peso_real_kg
            // Para productos normales: effective_price = catalog_price (sin diferencia)
            const catalogPrice = parseFloat(item.price) || 0;
            const lineSubtotal = parseFloat(item.subtotal) || 0;
            const lineTotal = parseFloat(item.total) || 0;
            const effectivePrice =
              item.quantity > 0 ? lineTotal / item.quantity : catalogPrice;
            const effectiveSubtotal =
              item.quantity > 0 ? lineSubtotal / item.quantity : catalogPrice;

            // ⚠️ `productDetailsMap` es un índice de CONSULTA por id, no la
            // lista del manifiesto: la misma entrada se escribe bajo
            // `product_id` y bajo `variation_id`, y el mismo producto pedido
            // por dos clientes colapsa en una sola clave (gana el último).
            // Para el QR / manifiesto usar `manifest_items`, que tiene una
            // entrada por línea de pedido real.
            const detalle = {
              name: item.name,
              image: imgUrl,
              sku: item.sku,
              price: effectivePrice,
              catalog_price: catalogPrice,
              subtotal: effectiveSubtotal,
              line_total: effectivePrice,
              unidad_medida: unitMeasure,
              pedidos_involucrados: [],
            };

            const previo =
              productDetailsMap[item.variation_id || item.product_id];
            const historial = previo?.pedidos_involucrados || [];
            detalle.pedidos_involucrados = [
              ...historial,
              { order_id: o.id, qty: item.quantity, price: effectivePrice },
            ];
            // Deja visible que este producto viene de varios pedidos con
            // precios distintos: antes se pisaba en silencio.
            detalle._precio_ambiguo = detalle.pedidos_involucrados.some(
              (p) => p.price !== effectivePrice,
            );

            productDetailsMap[item.product_id] = detalle;
            if (item.variation_id)
              productDetailsMap[item.variation_id] = { ...detalle };
          });
        }
        return {
          id: o.id,
          customer:
            (o.billing?.first_name + " " + o.billing?.last_name).trim() ||
            "Cliente",
          phone: o.billing?.phone,
          email: o.billing?.email,
          billing: o.billing,
          shipping: o.shipping,
          shipping_lines: o.shipping_lines || [],
          meta_data: o.meta_data || [],
          total: o.total || null,
          total_items:
            o.line_items?.reduce((acc, i) => acc + i.quantity, 0) || 0,
          date_created: o.date_created,
          customer_note: o.customer_note,
          items: o.line_items || [],
        };
      });
    };

    if (
      sessionInfo.snapshot_pedidos &&
      sessionInfo.snapshot_pedidos.length > 0
    ) {
      ordersData = processOrderData(sessionInfo.snapshot_pedidos);
    } else {
      try {
        // Multi-sede: usar cliente WC de la sede de la sesión
        const detailClient = await getWooClient(
          sessionInfo.sede_id || req.sedeId,
        );
        const wooProms = sessionInfo.ids_pedidos.map((id) =>
          detailClient.get(`orders/${id}`),
        );
        const wooRes = await Promise.all(wooProms);
        ordersData = processOrderData(wooRes.map((r) => r.data));
      } catch (e) {
        ordersData = sessionInfo.ids_pedidos.map((id) => ({
          id,
          customer: "#" + id,
          total_items: 0,
        }));
      }
    }

    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", session_id);
    const assignIds = assignments.map((a) => a.id);

    let logs = [];
    if (assignIds.length > 0) {
      const { data: ls, error: logError } = await supabase
        .from("wc_log_picking")
        .select("*, wc_asignaciones_pedidos(nombre_picker)")
        .in("id_asignacion", assignIds)
        .order("fecha_registro", { ascending: true });

      if (logError) throw logError;
      logs = ls;

      try {
        const missingIds = new Set();
        logs.forEach((l) => {
          if (
            l.es_sustituto &&
            l.id_producto_final &&
            !productDetailsMap[l.id_producto_final]
          ) {
            missingIds.add(l.id_producto_final);
          }
        });
        if (missingIds.size > 0) {
          const subClient = await getWooClient(
            sessionInfo.sede_id || req.sedeId,
          );
          const { data: subProds } = await subClient.get(
            `products?include=${Array.from(missingIds).join(",")}&per_page=100`,
          );
          if (subProds) {
            subProds.forEach((p) => {
              const catalogPrice = parseFloat(p.price) || 0;
              productDetailsMap[p.id] = {
                name: p.name,
                image: p.images[0]?.src,
                sku: p.sku,
                price: catalogPrice,
                catalog_price: catalogPrice,
                subtotal: catalogPrice,
                line_total: catalogPrice,
                unidad_medida:
                  (p.attributes || []).find((a) =>
                    a.name.toLowerCase().includes("unidad"),
                  )?.options[0] || "UND",
              };
            });
          }
        }
      } catch (e) {}
    }

    // ✅ CÓDIGOS DE BARRAS DESDE SIESA
    // Se traen TODAS las filas de cada f120_id involucrado. La resolución de
    // presentación se hace después contra ese universo completo (ver
    // utils/siesaMatching.js): no se pre-filtra por unidad de medida, porque
    // esa unidad puede ser justamente el dato equivocado.
    const f120IdOnlySet = new Set();
    Object.values(productDetailsMap).forEach((p) => {
      const f120_id = parseInt(p.sku);
      if (!isNaN(f120_id)) f120IdOnlySet.add(f120_id);
    });

    // 🔧 TAMBIÉN incluir f120_ids de los barcodes que el picker escaneó
    // Esto cubre el caso donde el SKU de WooCommerce no coincide con el f120_id de SIESA
    const scannedBarcodes = [
      ...new Set(
        logs
          .filter((l) => l.codigo_barras_escaneado)
          .map((l) => l.codigo_barras_escaneado.toString().trim()),
      ),
    ];
    if (scannedBarcodes.length > 0) {
      try {
        const { data: scannedSiesa } = await supabase
          .from("siesa_codigos_barras")
          .select("f120_id")
          .in("codigo_barras", scannedBarcodes);
        if (scannedSiesa) {
          scannedSiesa.forEach((bc) => f120IdOnlySet.add(bc.f120_id));
        }
      } catch (e) {
        console.warn(
          "⚠️ Error buscando f120_ids de barcodes escaneados:",
          e.message,
        );
      }
    }

    // Todas las presentaciones que SIESA conoce de cada f120_id.
    // Paginar para evitar el límite default de 1000 filas de Supabase.
    const f120IdArray = Array.from(f120IdOnlySet);
    let allSiesaBarcodes = [];
    let siesaError = null;
    const BATCH_SIZE = 500;
    for (let i = 0; i < f120IdArray.length; i += BATCH_SIZE) {
      const batch = f120IdArray.slice(i, i + BATCH_SIZE);
      const { data: batchData, error: batchError } = await supabase
        .from("siesa_codigos_barras")
        .select("f120_id, codigo_barras, unidad_medida")
        .in("f120_id", batch)
        .limit(10000);
      if (batchError) {
        siesaError = batchError;
        break;
      }
      if (batchData) allSiesaBarcodes = allSiesaBarcodes.concat(batchData);
    }

    if (siesaError) {
      console.error(
        "⚠️ Error trayendo códigos SIESA para la auditoría:",
        siesaError.message,
      );
    }

    // =================================================================
    // RESOLUCIÓN DE PRESENTACIÓN Y CÓDIGO DE BARRAS POR PRODUCTO
    //
    // Toda la decisión vive en `utils/siesaMatching.js`. Antes había una
    // copia local de `inferUnitMeasureFromName` acá, con dos problemas
    // graves que trababan auditorías:
    //
    //   1. La confianza de la inferencia se calculaba y se TIRABA. Una UM
    //      adivinada sobre el nombre del producto salía al frontend
    //      indistinguible de un dato real, y después invalidaba el código
    //      correcto del producto correcto.
    //   2. El fallback era `availableUMs[0]`: el orden que devolviera
    //      Postgres. La misma sesión podía pedir distinta presentación en
    //      dos consultas.
    //
    // Ahora cada producto viaja con `unidad_medida_confiable`, y el
    // validador solo bloquea por presentación cuando eso es `true`.
    // =================================================================
    Object.keys(productDetailsMap).forEach((productId) => {
      const detalle = productDetailsMap[productId];
      const f120_id = parseInt(detalle.sku, 10);
      if (isNaN(f120_id)) {
        detalle.unidad_medida_confiable = false;
        detalle.unidad_medida_fuente = "sin_sku";
        detalle.barcode_sku_um = null;
        return;
      }

      const umsDisponibles = availableUMsFor(allSiesaBarcodes || [], f120_id);

      const resuelta = resolveExpectedUM({
        umWoo: detalle.unidad_medida,
        sku: detalle.sku,
        nombre: detalle.name || "",
        umsDisponibles,
      });

      // ⚠️ DOS UNIDADES DE MEDIDA DISTINTAS. No confundirlas: hacerlo cambia
      // cuánta plata se cobra.
      //
      //   `unidad_medida`       — la de WooCommerce. Describe la PRESENTACIÓN
      //     FÍSICA que compró el cliente (500g, Kg, Und). Gobierna el peso
      //     (`kgPerUnit`) y el cobro (`calcLineCharge`). NO SE TOCA.
      //   `unidad_medida_siesa` — cómo está catalogado el CÓDIGO DE BARRAS en
      //     SIESA. Solo sirve para matchear códigos y armar el código del
      //     manifiesto.
      //
      // Caso real que lo probó (sesión 00281109, "Tocino Carnudo Kilo - 500g"):
      // Woo manda `500g`, SIESA solo conoce `KL`. Pisar la de Woo con la de
      // SIESA duplicaba el peso del GS1 — `kgPerUnit("500g")` es 0.5 y
      // `kgPerUnit("KL")` es 1.0.
      detalle.unidad_medida_siesa = resuelta.um;
      detalle.unidad_medida_confiable = resuelta.confiable;
      detalle.unidad_medida_fuente = resuelta.fuente;
      detalle.unidades_disponibles = umsDisponibles;

      // Código de barras: preferir el de la presentación resuelta; si no
      // hay, cualquiera del producto sirve para MOSTRAR (la validación ya
      // no depende de este campo, compara contra SIESA completo).
      const filasDelProducto = (allSiesaBarcodes || []).filter(
        (bc) => bc.f120_id === f120_id,
      );
      const deLaPresentacion = filasDelProducto.find(
        (bc) => normalizeUM(bc.unidad_medida) === normalizeUM(resuelta.um),
      );
      const elegida = deLaPresentacion || filasDelProducto[0] || null;
      detalle.barcode = elegida ? normalizeBarcode(elegida.codigo_barras) : null;

      // Todos los códigos válidos del producto: el auditor acepta cualquiera.
      detalle.barcodes_producto = filasDelProducto
        .map((bc) => normalizeBarcode(bc.codigo_barras))
        .filter(Boolean);

      // Código para el manifiesto/QR: se ELIGE entre los códigos que el
      // producto realmente tiene en `siesa_codigos_barras`. En el QR solo van
      // códigos de barras reales — la caja no entiende un ítem suelto ni un
      // código fabricado. Si el producto no tiene ninguno, queda en null y el
      // manifiesto lo reporta para digitarlo a mano.
      // Base GS1 REAL de SIESA para pesables ("2900061"), no fabricada desde
      // el SKU: el prefijo real no es 29+f120_id. Sin esto el manifiesto
      // inventaba un código que la caja no puede resolver.
      detalle.gs1_base = findGs1Base(filasDelProducto, f120_id);

      detalle.barcode_sku_um = buildManifestCode({
        f120_id,
        um: resuelta.um,
        barcode: detalle.barcode,
        siesaRows: filasDelProducto,
      });
    });

    // ✅ OBTENER CATEGORÍAS REALES para detección fruver/carnicería en auditor
    try {
      const productIdsForCat = Object.keys(productDetailsMap)
        .map(Number)
        .filter((id) => !isNaN(id));
      if (productIdsForCat.length > 0) {
        const catClient = await getWooClient(sessionInfo.sede_id || req.sedeId);
        const { data: productsWithCats } = await catClient.get("products", {
          include: productIdsForCat.join(","),
          per_page: 100,
          _fields: "id,categories",
        });
        if (productsWithCats) {
          productsWithCats.forEach((p) => {
            if (p.categories && productDetailsMap[p.id]) {
              productDetailsMap[p.id].categorias_reales = p.categories
                .map((c) => c.name)
                .filter((n) => n !== "Uncategorized");
            }
          });
        }
      }
    } catch (e) {
      console.warn(
        "⚠️ No se pudieron obtener categorías para auditor:",
        e.message,
      );
    }

    // 🔧 CAMBIO DE ESTRATEGIA:
    // Enviar TODOS los logs y productos como están (sin filtrar)
    // El filtrado se hace en el FRONTEND (VistaAuditor)
    // que decidirá qué mostrar en "Por verificar" vs "Productos confiables"

    // Identificar productos PESABLES (fruver/carnes) para marcar en el frontend
    Object.entries(productDetailsMap).forEach(([id, detail]) => {
      if (isWeighableUnit(detail.unidad_medida)) {
        detail._isWeighable = true; // Marcar para que frontend lo detecte
      }
    });

    // Enviar TODOS los logs sin filtrar
    const auditableLogs = logs;

    // Índice de códigos para la validación local del auditor.
    // Claves NORMALIZADAS (sin el '+' de SIESA, que ninguna etiqueta física
    // trae) y valor en LISTA: un mismo EAN puede estar registrado para varias
    // presentaciones y el mapa plano anterior se quedaba con la última.
    const auditBarcodeIndex = buildBarcodeIndex(allSiesaBarcodes || []);
    const auditBarcodeMap = {};
    Object.entries(auditBarcodeIndex).forEach(([code, entries]) => {
      auditBarcodeMap[code] = {
        f120_id: entries[0].f120_id,
        unidad_medida: entries[0].unidad_medida,
        presentaciones: entries,
      };
    });

    // Ítems canónicos del manifiesto/QR — UNA entrada por línea de pedido.
    // `products_map` NO sirve para esto (duplica variaciones y colapsa el
    // mismo producto pedido por dos clientes). Ver utils/manifestItems.js.
    const { items: manifestItems, warnings: manifestWarnings } =
      buildManifestItems({ ordersData, productDetailsMap });

    if (manifestWarnings.colisiones.length > 0) {
      console.warn(
        `⚠️ [MANIFIESTO] ${manifestWarnings.colisiones.length} colisión(es) de código en la sesión ${sessionInfo.id}:`,
        JSON.stringify(manifestWarnings.colisiones),
      );
    }
    if (manifestWarnings.sin_codigo.length > 0) {
      console.warn(
        `⚠️ [MANIFIESTO] ${manifestWarnings.sin_codigo.length} ítem(s) sin código resoluble en la sesión ${sessionInfo.id}`,
      );
    }

    res.status(200).json({
      metadata: {
        session_id: sessionInfo.id,
        picker_name: sessionInfo.wc_pickers?.nombre_completo || "Sin Asignar",
        picker_email: sessionInfo.wc_pickers?.email || "",
        start_time: sessionInfo.fecha_inicio,
        end_time: sessionInfo.fecha_fin,
        status: sessionInfo.estado,
        total_orders: sessionInfo.ids_pedidos.length,
      },
      orders_info: ordersData,
      products_map: productDetailsMap,
      // ⬇️ Usar ESTO para el QR, no `products_map`.
      manifest_items: manifestItems,
      manifest_warnings: manifestWarnings,
      audit_barcode_index: auditBarcodeIndex,
      audit_barcode_map: auditBarcodeMap,
      logs: auditableLogs, // 🔧 TODOS los logs sin filtrar (frontend decide qué validar)
      final_snapshot: sessionInfo.datos_salida || null,
    });
  } catch (error) {
    console.error("Error Auditoría Detalle:", error.message);
    if (error.code === "22P02")
      return res.status(400).json({ error: "Formato de ID inválido." });
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// RUTA TEMPORAL PARA ESPIAR METADATOS DE WOOCOMMERCE
// =========================================================
exports.espiarPedido = async (req, res) => {
  try {
    const orderId = req.params.id;
    // Multi-sede: intentar con sede del request, luego buscar en todas
    let order;
    if (req.sedeId) {
      const client = await getWooClient(req.sedeId);
      const resp = await client.get(`orders/${orderId}`);
      order = resp.data;
    } else {
      const result = await getOrderFromAnySede(orderId);
      if (!result)
        return res
          .status(404)
          .json({ error: "Pedido no encontrado en ninguna sede" });
      order = result.order;
    }

    // Detección de sede
    const sedeRaw = extractSedeFromOrder(order);
    const { sede_id, sede_raw_value } = await getSedeFromWooOrder(order);

    res.status(200).json({
      mensaje: "Datos crudos del pedido (con detección de sede)",

      // ★ DETECCIÓN DE SEDE
      sede_detectada: {
        valor_crudo: sedeRaw,
        sede_id_resuelto: sede_id,
        estado: sedeRaw
          ? "✅ Campo de sede encontrado"
          : "❌ No se detectó sede",
        campos_buscados: WOO_SEDE_META_KEYS,
      },

      // ★ PASARELA DE PAGO (gateway elegido en el checkout)
      pago: {
        payment_method: order.payment_method,
        payment_method_title: order.payment_method_title,
        // Valor CRUDO a propósito (incluye el literal `na`): este endpoint es
        // de diagnóstico y debe mostrar lo que manda Woo, no la interpretación.
        cod_payment_mode:
          (order.meta_data || []).find((m) => m.key === COD_MODE_META_KEY)
            ?.value ?? null,
        etiqueta_resuelta: resolvePaymentLabel(order),
        es_credito: isCreditoOrder(order),
      },

      status: order.status,
      total: order.total,

      // Meta_data completa (para encontrar el campo de sede manualmente)
      meta_data: order.meta_data,
      line_items: order.line_items,
      shipping_lines: order.shipping_lines,
      fee_lines: order.fee_lines,
      billing: order.billing,
      shipping: order.shipping,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// DIAGNÓSTICO: Listar pedidos recientes de WooCommerce (cualquier estado)
// =========================================================
exports.diagnosticoWoo = async (req, res) => {
  try {
    const status = req.query.status || "any";
    const perPage = parseInt(req.query.per_page) || 10;

    const params = { per_page: perPage, orderby: "date", order: "desc" };
    if (status !== "any") params.status = status;

    // Multi-sede: si hay sede específica usar esa, si no consultar TODAS
    let orders;
    if (req.sedeId) {
      const client = await getWooClient(req.sedeId);
      const { data } = await client.get("orders", params);
      orders = data.map((o) => ({
        ...o,
        _sede_id: req.sedeId,
        _sede_name: req.sedeName,
      }));
    } else {
      orders = await fetchFromAllSedes("orders", params);
    }

    const resumen = orders.map((o) => {
      return {
        id: o.id,
        number: o.number,
        status: o.status,
        date_created: o.date_created,
        total: o.total,
        billing_name:
          `${o.billing?.first_name || ""} ${o.billing?.last_name || ""}`.trim(),
        sede: o._sede_name || "desconocida",
        sede_id: o._sede_id || null,
        meta_keys: (o.meta_data || []).map(
          (m) => `${m.key} = ${String(m.value).substring(0, 80)}`,
        ),
        shipping_methods: (o.shipping_lines || []).map(
          (s) => `${s.method_title} (${s.method_id})`,
        ),
      };
    });

    res.status(200).json({
      total_encontrados: orders.length,
      filtro_status: status,
      pedidos: resumen,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
