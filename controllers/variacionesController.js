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
      .select("id, snapshot_pedidos, datos_salida, fecha_fin, id_picker, nombre_picker, sede_id")
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

    const sessionIds = sessions.map((s) => s.id);

    // 2. Fetch Logs for these sessions
    // We fetch logs tied to these sessions to reconstruct history
    const { data: logs, error: logsError } = await supabase
      .from("wc_log_picking")
      .select("*")
      .in("id_sesion", sessionIds)
      .order("fecha_registro", { ascending: true });

    if (logsError) throw logsError;

    // 3. Process Data
    const results = [];
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
      const sessionLogs = logs.filter(l => l.id_sesion === session.id);

      initialOrders.forEach((initialOrder) => {
        const finalOrder = finalOrders.find(fo => String(fo.id) === String(initialOrder.id));
        if (!finalOrder) return;

        const initialTotal = parseFloat(initialOrder.total) || 0;
        const finalTotal = parseFloat(finalOrder.total) || 0;
        const delta = finalTotal - initialTotal;

        if (Math.abs(delta) > 0.01) {
          stats.total_delta += delta;
          stats.count_variations += 1;

          // Reconstruct events for this order
          const orderLogs = sessionLogs.filter(l => String(l.id_pedido) === String(initialOrder.id));
          
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

            return {
              id: log.id,
              fecha: log.fecha_registro,
              producto: log.nombre_producto_original,
              accion: log.accion,
              motivo: log.motivo,
              reason_label: reason,
              type,
              metadata: {
                sustituto: log.datos_sustituto?.nombre || null,
                peso: log.peso_real || null,
                cantidad: log.cantidad_afectada || 1
              }
            };
          });

          results.push({
            id_pedido: initialOrder.id,
            id_sesion: session.id,
            picker: session.nombre_picker,
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
        avg_delta: stats.count_variations > 0 ? stats.total_delta / stats.count_variations : 0
      }
    });

  } catch (error) {
    console.error("Error in getVariaciones:", error);
    res.status(500).json({ error: error.message });
  }
};
