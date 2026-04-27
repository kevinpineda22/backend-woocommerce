const { supabase } = require("../services/supabaseClient");
const dayjs = require("dayjs");

/**
 * Procesa los datos de rendimiento, financieros y de inventario.
 */
exports.getCollectorPerformance = async (req, res) => {
  try {
    const { range } = req.query;
    const sedeId = req.sedeId;

    // 1. Configuración de Rango de Fechas
    const now = dayjs();
    let startDate = null;
    if (range === "today") startDate = now.startOf("day");
    else if (range === "7d") startDate = now.subtract(7, "day").startOf("day");
    else if (range === "30d") startDate = now.subtract(30, "day").startOf("day");

    // 2. Consultas en Paralelo para Máximo Rendimiento
    let sessionsQuery = supabase
      .from("wc_picking_sessions")
      .select("datos_salida, fecha_fin, metodo_pago")
      .eq("estado", "finalizado");

    let asigQuery = supabase
      .from("wc_asignaciones_pedidos")
      .select("id_picker, nombre_picker, tiempo_total_segundos, id_pedido, fecha_inicio")
      .eq("estado_asignacion", "completado");

    let logsQuery = supabase
      .from("wc_log_picking")
      .select("nombre_producto, accion, motivo")
      .in("accion", ["retirado", "no_encontrado"]);

    if (sedeId) {
      sessionsQuery = sessionsQuery.eq("sede_id", sedeId);
      asigQuery = asigQuery.eq("sede_id", sedeId);
      logsQuery = logsQuery.eq("sede_id", sedeId);
    }

    if (startDate) {
      const isoDate = startDate.toISOString();
      sessionsQuery = sessionsQuery.gte("fecha_fin", isoDate);
      asigQuery = asigQuery.gte("fecha_inicio", isoDate);
    }

    const [
      { data: sessions, error: errSess },
      { data: asignaciones, error: errAsig },
      { data: logs, error: errLogs }
    ] = await Promise.all([sessionsQuery, asigQuery, logsQuery]);

    if (errSess || errAsig || errLogs) throw new Error("Error en consultas Supabase");

    // 3. Procesamiento Financiero
    let totalRevenue = 0;
    let orderCount = 0;
    const byMethod = {};

    sessions?.forEach(s => {
      let sessionAmount = 0;
      s.datos_salida?.orders?.forEach(o => {
        sessionAmount += parseFloat(o.total) || 0;
        orderCount++;
      });
      totalRevenue += sessionAmount;
      const method = s.metodo_pago || "otro";
      byMethod[method] = (byMethod[method] || 0) + sessionAmount;
    });

    // 4. Procesamiento de Rendimiento (Pickers)
    const pickerMap = {};
    asignaciones?.forEach(a => {
      if (!pickerMap[a.id_picker]) {
        pickerMap[a.id_picker] = { name: a.nombre_picker, total_orders: 0, total_time: 0 };
      }
      pickerMap[a.id_picker].total_orders++;
      pickerMap[a.id_picker].total_time += a.tiempo_total_segundos || 0;
    });

    const performance = Object.values(pickerMap)
      .map(p => ({
        name: p.name,
        orders: p.total_orders,
        spi: Math.round(p.total_time / (p.total_orders || 1))
      }))
      .sort((a, b) => a.spi - b.spi);

    // 5. Procesamiento de Inventario (Agotados)
    const stockMap = {};
    logs?.forEach(l => {
      const name = l.nombre_producto || "Desconocido";
      if (!stockMap[name]) stockMap[name] = { name, count: 0, reason: l.motivo };
      stockMap[name].count++;
    });

    const stockAlerts = Object.values(stockMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 6. Actividad por Hora
    const hourlyStats = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, pedidos: 0 }));
    asignaciones?.forEach(a => {
      const h = dayjs(a.fecha_inicio).hour();
      hourlyStats[h].pedidos++;
    });

    res.status(200).json({
      financials: {
        totalRevenue,
        avgTicket: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
        orderCount,
        methods: Object.entries(byMethod).map(([name, value]) => ({ name, value }))
      },
      performance,
      stockAlerts,
      hourlyActivity: hourlyStats
    });

  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
};
