const { supabase } = require("../services/supabaseClient");
const dayjs = require("dayjs");

/**
 * Controller for Price Variations Analytics
 */

exports.getVariaciones = async (req, res) => {
  try {
    const { range } = req.query;
    const sedeId = req.sedeId;

    // 1. Fetch Finished Sessions in range
    let sessionsQuery = supabase
      .from("wc_picking_sessions")
      .select("id, ids_pedidos, snapshot_pedidos, datos_salida, fecha_fin, id_picker, nombre_picker, sede_id")
      .eq("estado", "finalizado")
      .order("fecha_fin", { ascending: false });

    if (sedeId) {
      sessionsQuery = sessionsQuery.eq("sede_id", sedeId);
    }

    if (range && range !== "all") {
      const now = dayjs();
      let startDate;
      if (range === "today") startDate = now.startOf("day");
      else if (range === "7d") startDate = now.subtract(7, "day").startOf("day");
      else if (range === "30d") startDate = now.subtract(30, "day").startOf("day");

      if (startDate) {
        sessionsQuery = sessionsQuery.gte("fecha_fin", startDate.toISOString());
      }
    }

    const { data: sessions, error: sessionsError } = await sessionsQuery;
    if (sessionsError) throw sessionsError;

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ variaciones: [], stats: {} });
    }

    const allOrderIds = sessions.flatMap((s) => s.ids_pedidos || []);
    
    // 2. Fetch Logs for these orders
    let logs = [];
    if (allOrderIds.length > 0) {
      const { data: fetchedLogs, error: logsError } = await supabase
        .from("wc_log_picking")
        .select("*")
        .in("id_pedido", allOrderIds)
        .order("fecha_registro", { ascending: true });

      if (logsError) throw logsError;
      logs = fetchedLogs || [];
    }

    // 3. Process Data
    const results = [];
    let total_orders = 0;
    const stats = {
      total_delta: 0,
      count_variations: 0,
      reasons: {
        sustitucion: 0,
        faltante: 0,
        peso: 0,
        admin: 0
      }
    };

    sessions.forEach((session) => {
      const initialOrders = session.snapshot_pedidos || [];
      const finalOrders = session.datos_salida?.orders || [];
      total_orders += initialOrders.length;

      initialOrders.forEach((initialOrder) => {
        const finalOrder = finalOrders.find(fo => String(fo.id) === String(initialOrder.id));
        if (!finalOrder) return;

        const initialTotal = parseFloat(initialOrder.total) || 0;
        
        // Calcular total final real desde los items (igual que ManifestSheet)
        const finalItemsTotal = (finalOrder.items || []).filter(i => !i.is_shipping_method && !i.is_removed).reduce((sum, item) => {
           const qty = item.qty || item.count || 1;
           const unitFinal = parseFloat(item.line_total) || parseFloat(item.price) || 0;
           return sum + unitFinal * qty;
        }, 0);
        const finalShipping = (finalOrder.shipping_lines || initialOrder.shipping_lines || []).reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const finalTotal = finalItemsTotal + finalShipping;

        const delta = finalTotal - initialTotal;

        // Solo reportar como variación si el delta es significativo o si hay logs relevantes
        const orderLogs = logs.filter(l => String(l.id_pedido) === String(initialOrder.id) && l.accion !== 'auditoria_finalizada' && l.accion !== 'recolectado');
        
        if (Math.abs(delta) > 0.01 || orderLogs.length > 0) {
          if (Math.abs(delta) > 0.01) {
            stats.total_delta += delta;
            stats.count_variations += 1;
          }

          const events = orderLogs.map(log => {
            let reason = "Otro";
            let type = "other";

            if (log.accion === "sustituido") {
              reason = "Sustitución";
              type = "sustitucion";
              stats.reasons.sustitucion++;
            } else if (log.accion === "no_encontrado") {
              reason = "Faltante";
              type = "faltante";
              stats.reasons.faltante++;
            } else if (log.accion === "pesaje" || log.peso_real) {
              reason = "Ajuste de Peso";
              type = "peso";
              stats.reasons.peso++;
            } else if (log.accion === "eliminado_admin") {
              reason = "Removido por Admin";
              type = "admin";
              stats.reasons.admin++;
            }

            // Buscar precio original en el snapshot
            const origItem = initialOrder.line_items?.find(i => String(i.product_id) === String(log.id_producto) || String(i.variation_id) === String(log.id_producto));
            const precio_original = origItem ? parseFloat(origItem.price) : 0;
            const precio_sustituto = log.precio_nuevo || 0;

            return {
              id: log.id,
              fecha: log.fecha_registro,
              producto: log.nombre_producto || log.nombre_producto_original || log.id_producto,
              accion: log.accion,
              motivo: log.motivo,
              reason_label: reason,
              type,
              metadata: {
                sustituto: log.nombre_sustituto || log.datos_sustituto?.nombre || null,
                peso: log.peso_real || null,
                cantidad: log.cantidad_afectada || 1,
                precio_original,
                precio_sustituto
              }
            };
          });

          results.push({
            id_pedido: initialOrder.id,
            id_sesion: session.id,
            picker: session.wc_pickers?.nombre_completo || "Desconocido",
            fecha: session.fecha_fin,
            total_inicial: initialTotal,
            total_final: finalTotal,
            delta,
            events
          });
        }
      });
    });

    res.status(200).json({
      variaciones: results,
      stats: {
        ...stats,
        total_orders,
        avg_delta: stats.count_variations > 0 ? stats.total_delta / stats.count_variations : 0,
        avg_sustituciones_por_pedido: total_orders > 0 ? stats.reasons.sustitucion / total_orders : 0,
        avg_faltantes_por_pedido: total_orders > 0 ? stats.reasons.faltante / total_orders : 0,
        avg_eliminados_por_pedido: total_orders > 0 ? stats.reasons.admin / total_orders : 0,
      }
    });

  } catch (error) {
    console.error("Error in getVariaciones:", error);
    res.status(500).json({ error: error.message });
  }
};
