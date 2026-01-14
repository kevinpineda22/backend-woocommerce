const { supabase } = require("../services/supabaseClient");

// 1. Estadísticas de Rendimiento por Recolectora
exports.getCollectorPerformance = async (req, res) => {
  try {
    // Obtenemos todas las asignaciones completadas
    const { data: asignaciones, error } = await supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id_recolectora, nombre_recolectora, tiempo_total_segundos, fecha_fin"
      )
      .eq("estado_asignacion", "completado");

    if (error) throw error;

    const stats = {};

    asignaciones.forEach((a) => {
      const id = a.id_recolectora;
      if (!stats[id]) {
        stats[id] = {
          id,
          nombre: a.nombre_recolectora,
          total_pedidos: 0,
          tiempo_total_acumulado: 0,
          promedio_minutos: 0,
        };
      }
      stats[id].total_pedidos += 1;
      stats[id].tiempo_total_acumulado += a.tiempo_total_segundos || 0;
    });

    // Calcular promedios
    const result = Object.values(stats)
      .map((s) => ({
        ...s,
        promedio_minutos: Math.round(
          s.tiempo_total_acumulado / s.total_pedidos / 60
        ),
      }))
      .sort((a, b) => b.total_pedidos - a.total_pedidos); // Ordenar por actividad

    res.status(200).json(result);
  } catch (error) {
    console.error("Error en getCollectorPerformance:", error);
    res.status(500).json({ error: error.message });
  }
};

// 2. Mapa de Calor de Productos (Top Recolectados y Top Reportados)
exports.getProductHeatmap = async (req, res) => {
  try {
    // Usamos rpc (Remote Procedure Call) si existiera, pero como no tengo acceso a crear funciones SQL complejas
    // desde aquí fácilmente sin migraciones, haré la agregación en JS (menos eficiente pero viable para miles de registros).
    // Si la tabla crece mucho, esto debería moverse a una View de SQL.

    // Traemos todo el log (limitado a últimos 5000 registros por seguridad de memoria)
    const { data: logs, error } = await supabase
      .from("wc_log_recoleccion")
      .select("nombre_producto, accion, motivo")
      .order("fecha_registro", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const productMap = {};

    logs.forEach((log) => {
      const name = log.nombre_producto || "Desconocido";
      if (!productMap[name]) {
        productMap[name] = {
          name,
          total_picks: 0,
          total_removed: 0,
          motivos: {},
        };
      }

      if (log.accion === "recolectado") {
        productMap[name].total_picks += 1;
      } else if (log.accion === "retirado") {
        productMap[name].total_removed += 1;
        const motivo = log.motivo || "Sin motivo";
        productMap[name].motivos[motivo] =
          (productMap[name].motivos[motivo] || 0) + 1;
      }
    });

    // Convertir a array y determinar top
    const heatmap = Object.values(productMap)
      .map((p) => ({
        ...p,
        total_interacciones: p.total_picks + p.total_removed,
        tasa_exito: p.total_picks / (p.total_picks + p.total_removed || 1),
      }))
      .sort((a, b) => b.total_interacciones - a.total_interacciones);

    res.status(200).json(heatmap.slice(0, 50)); // Top 50
  } catch (error) {
    console.error("Error en getProductHeatmap:", error);
    res.status(500).json({ error: error.message });
  }
};

// 3. Auditoría Forense (Logs filtrables)
exports.getAuditLogs = async (req, res) => {
  const { limit = 100, search = "" } = req.query;
  try {
    let query = supabase
      .from("wc_log_recoleccion")
      .select("*, wc_asignaciones_pedidos(nombre_recolectora)") // Acceso a la FK si existe relación en Supabase
      .order("fecha_registro", { ascending: false })
      .limit(limit);

    if (search) {
      // Búsqueda simple por nombre de producto
      query = query.ilike("nombre_producto", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Aplanar respuesta para facilitar frontend
    const flatData = data.map((d) => ({
      ...d,
      recolectora: d.wc_asignaciones_pedidos?.nombre_recolectora || "N/A",
    }));

    res.status(200).json(flatData);
  } catch (error) {
    console.error("Error en getAuditLogs:", error);
    // Fallback si la relación FK falla (wc_asignaciones_pedidos podría no estar ligada formalmente en schema)
    // Intentamos query simple
    try {
      const { data } = await supabase
        .from("wc_log_recoleccion")
        .select("*")
        .order("fecha_registro", { ascending: false })
        .limit(limit);
      res.status(200).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
};
