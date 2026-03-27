const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");
const { syncOrderToWoo } = require("../services/syncWooService");
const {
  getSedeFromWooOrder,
  extractSedeFromOrder,
  WOO_SEDE_META_KEYS,
} = require("../services/sedeConfig");

// Multi-sede WooCommerce (WordPress Multisite)
const {
  getWooClient,
  fetchFromAllSedes,
  fetchFromSede,
  getOrderFromAnySede,
  invalidateResponseCache,
} = require("../services/wooMultiService");

// =========================================================
// HELPER: Obtener códigos de barras desde SIESA
// =========================================================
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras, unidad_medida")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    // ✅ Agrupar por f120_id + unidad_medida
    // Estructura: { f120_id: { unidad_medida: [barcode1, barcode2], _default: [barcode1, barcode2] } }
    const barcodesByProduct = {};
    barcodes.forEach((bc) => {
      if (!barcodesByProduct[bc.f120_id]) {
        barcodesByProduct[bc.f120_id] = { _default: [] };
      }
      const um = (bc.unidad_medida || "_unknown").toUpperCase();
      const code = (bc.codigo_barras || "").toString().trim();
      const cleaned = code.replace(/\+$/, "");

      // Filtrar códigos válidos (excluyendo explícitamente prefijos M o N)
      if (!cleaned || cleaned.length < 8) return;
      if (cleaned.toUpperCase().startsWith("M") || cleaned.toUpperCase().startsWith("N")) return;
      if (!/^\d+\+?$/.test(code)) return;

      if (!barcodesByProduct[bc.f120_id][um]) {
        barcodesByProduct[bc.f120_id][um] = [];
      }
      
      // Añadir la lista de códigos válidos para esta unidad de medida específica
      if (!barcodesByProduct[bc.f120_id][um].includes(cleaned)) {
        barcodesByProduct[bc.f120_id][um].push(cleaned);
      }
      // También guardar en un array genérico por defecto
      if (!barcodesByProduct[bc.f120_id]._default.includes(cleaned)) {
        barcodesByProduct[bc.f120_id]._default.push(cleaned);
      }
    });

    return barcodesByProduct;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

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

    // Una sola query para todos los logs de todas las asignaciones
    const { data: allLogs } =
      allAssignIds.length > 0
        ? await supabase
            .from("wc_log_picking")
            .select(
              "id_asignacion, id_producto, id_producto_original, accion, es_sustituto, fecha_registro, nombre_producto, pasillo",
            )
            .in("id_asignacion", allAssignIds)
            .order("fecha_registro", { ascending: true })
        : { data: [] };

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
        };
      }),
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error getActiveSessionsDashboard:", error.message);
    res
      .status(500)
      .json({
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
      .select("id_pedido, wc_picking_sessions!inner(estado)")
      .in("estado_asignacion", ["en_proceso", "completado"])
      .not(
        "wc_picking_sessions.estado",
        "in",
        '("cancelado","finalizado","auditado")',
      );

    if (req.sedeId) {
      assignQuery = assignQuery.eq("sede_id", req.sedeId);
    }
    const { data: activeAssignments } = await assignQuery;
    const assignedIds = new Set(activeAssignments.map((a) => a.id_pedido));

    const cleanOrders = wcOrders.map((order) => ({
      ...order,
      is_assigned: assignedIds.has(order.id),
      sede_detected: order._sede_name || null,
      sede_id: order._sede_id || null,
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
  let query = supabase
    .from("wc_pickers")
    .select("*, wc_sedes(nombre, slug)")
    .order("nombre_completo", { ascending: true });
  if (email) query = query.eq("email", email);
  // Filtro Multi-Sede
  if (req.sedeId) {
    query = query.eq("sede_id", req.sedeId);
  }
  const { data, error } = await query;
  if (error)
    return res
      .status(500)
      .json({ error: `Error al consultar pickers: ${error.message}` });
  res.status(200).json(data);
};

// =========================================================
// 4. HISTORIAL DE SESIONES
// =========================================================
exports.getPendingPaymentSessions = async (req, res) => {
  try {
    let payQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre )`,
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
        ? sess.snapshot_pedidos.map((o) =>
            ((o.billing?.first_name || "") + " " + (o.billing?.last_name || "")).trim() || "Cliente"
          )
        : [];

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(pendingData);
  } catch (error) {
    console.error("Error getPendingPaymentSessions:", error.message);
    res
      .status(500)
      .json({
        error: `Error al cargar sesiones pendientes de pago: ${error.message}`,
      });
  }
};

exports.markSessionAsPaid = async (req, res) => {
  const { session_id } = req.body;
  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const { error } = await supabase
      .from("wc_picking_sessions")
      .update({ estado: "finalizado" })
      .eq("id", session_id);

    if (error) throw error;

    res.status(200).json({ message: "Sesión marcada como pagada/finalizada." });
  } catch (error) {
    console.error("Error markSessionAsPaid:", error.message);
    res
      .status(500)
      .json({ error: `Error al marcar sesión como pagada: ${error.message}` });
  }
};

exports.getHistorySessions = async (req, res) => {
  try {
    let histQuery = supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre )`,
      )
      .in("estado", ["finalizado"])
      .order("fecha_fin", { ascending: false })
      .limit(50);
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
        ? sess.snapshot_pedidos.map((o) =>
            ((o.billing?.first_name || "") + " " + (o.billing?.last_name || "")).trim() || "Cliente"
          )
        : [];

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(historyData);
  } catch (error) {
    console.error("Error getHistorySessions:", error.message);
    res
      .status(500)
      .json({
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
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, sede_id, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email ), wc_sedes ( nombre )`,
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
        ? sess.snapshot_pedidos.map((o) =>
            ((o.billing?.first_name || "") + " " + (o.billing?.last_name || "")).trim() || "Cliente"
          )
        : [];

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        sede_nombre: sess.wc_sedes?.nombre || null,
        pedidos: sess.ids_pedidos,
        clientes: clientes,
        fecha: end ? end.toLocaleDateString("es-CO", optionsDate) : "--",
        hora_fin: end ? end.toLocaleTimeString("es-CO", optionsTime) : "--",
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(pendingData);
  } catch (error) {
    console.error("Error getPendingAuditSessions:", error.message);
    res
      .status(500)
      .json({
        error: `Error al cargar sesiones pendientes de auditoría: ${error.message}`,
      });
  }
};

// =========================================================
// 5. FINALIZAR AUDITORÍA (APROBAR SALIDA)
// =========================================================
exports.completeAuditSession = async (req, res) => {
  const { session_id, datos_salida } = req.body;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const now = new Date().toISOString();

    const { data: session, error: getSessError } = await supabase
      .from("wc_picking_sessions")
      .select("id_picker, ids_pedidos, resumen_metricas")
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
    if (datos_salida) updatePayload.datos_salida = datos_salida;

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
    res.status(200).json({
      message: allSynced
        ? "Salida aprobada. Pedidos sincronizados con WooCommerce."
        : "Salida aprobada. Algunos pedidos tuvieron errores de sincronización.",
      sync_results: syncResults,
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
            productDetailsMap[item.product_id] = {
              image: imgUrl,
              sku: item.sku,
              unidad_medida: unitMeasure,
            };
            if (item.variation_id)
              productDetailsMap[item.variation_id] = {
                image: imgUrl,
                sku: item.sku,
                unidad_medida: unitMeasure,
              };
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
          total_items:
            o.line_items?.reduce((acc, i) => acc + i.quantity, 0) || 0,
          date_created: o.date_created,
          customer_note: o.customer_note,
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
              productDetailsMap[p.id] = { image: p.images[0]?.src, sku: p.sku };
            });
          }
        }
      } catch (e) {}
    }

    // ✅ OBTENER CÓDIGOS DE BARRAS DESDE SIESA (extrayendo el f120_id maestro numérico del SKU)
    const f120IdList = Array.from(
      new Set(
        Object.values(productDetailsMap)
          .map((p) => p.sku)
          .filter(Boolean)
          .map((sku) => parseInt(sku)) // Extrae "188407" automáticamente desde "188407-P6"
          .filter((id) => !isNaN(id)),
      ),
    );

    console.log(
      `🔍 Buscando códigos de barras para ${f120IdList.length} f120_ids:`,
      f120IdList,
    );
    const barcodeMapByF120Id = await getBarcodesFromSiesa(f120IdList);
    console.log(
      `📦 Códigos encontrados:`,
      Object.keys(barcodeMapByF120Id).length,
    );

    // Agregar códigos de barras al productDetailsMap cruzando el f120_id + unidad_medida
    Object.keys(productDetailsMap).forEach((productId) => {
      const sku = productDetailsMap[productId].sku;
      const f120_id = parseInt(sku);
      const um = (productDetailsMap[productId].unidad_medida || "").toUpperCase();

      if (!isNaN(f120_id) && barcodeMapByF120Id[f120_id]) {
        // ✅ Buscar arreglos de barcodes específicos para la unidad_medida del item
        let normalizedUm = um;
        if (um === "UN" || um === "UNIDAD") normalizedUm = "UND";
        else if (um === "KG" || um === "KILO") normalizedUm = "KL";

        const group = barcodeMapByF120Id[f120_id];
        
        // REGLA ESTRICTA: Si la orden exige una unidad, usar SOLO los barcodes de esa unidad.
        // Solo usar default si el producto base no tiene unidad de medida.
        const specificBarcodes = normalizedUm ? (group[normalizedUm] || []) : (group._default || []);
        
        if (specificBarcodes.length > 0) {
          productDetailsMap[productId].barcode = specificBarcodes;
        }
      }
    });

    // ✅ OBTENER CATEGORÍAS REALES para detección fruver/carnicería en auditor
    try {
      const productIdsForCat = Object.keys(productDetailsMap).map(Number).filter((id) => !isNaN(id));
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
      console.warn("⚠️ No se pudieron obtener categorías para auditor:", e.message);
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
      logs: logs,
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
