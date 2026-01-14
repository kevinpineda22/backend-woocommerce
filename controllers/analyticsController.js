const { supabase } = require("../services/supabaseClient");

// 1. Estadísticas de Rendimiento por Recolectora (Mejorado con Velocidad y Precisión)
exports.getCollectorPerformance = async (req, res) => {
  try {
    // 1. Obtenemos asignaciones completadas (Base para Tiempo y Cantidad de Pedidos)
    const { data: asignaciones, error: asigError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id_recolectora, nombre_recolectora, tiempo_total_segundos, id_pedido"
      )
      .eq("estado_asignacion", "completado");

    if (asigError) throw asigError;

    // 2. Obtenemos Logs para calcular Items por Minuto y Tasa de Error
    // Nota: Traemos solo lo necesario para agrupar
    const { data: logs, error: logError } = await supabase
      .from("wc_log_recoleccion")
      .select("accion, wc_asignaciones_pedidos!inner(id_recolectora)");
      // .limit(10000); // Podríamos limitar si crece mucho

    if (logError) throw logError;

    const stats = {};

    // Inicializar Estructura y sumar tiempos/pedidos
    asignaciones.forEach((a) => {
      const id = a.id_recolectora;
      if (!stats[id]) {
        stats[id] = {
          id,
          nombre: a.nombre_recolectora,
          total_pedidos: 0,
          tiempo_total_acumulado: 0,
          total_items_recolectados: 0,
          total_items_retirados: 0,
        };
      }
      stats[id].total_pedidos += 1;
      stats[id].tiempo_total_acumulado += a.tiempo_total_segundos || 0;
    });

    // Sumar conteo de items (acciones) a cada recolectora
    logs.forEach((log) => {
      // log.wc_asignaciones_pedidos es un objeto gracias al join (!inner)
      const id = log.wc_asignaciones_pedidos?.id_recolectora;
      if (stats[id]) {
        if (log.accion === "recolectado") stats[id].total_items_recolectados += 1;
        else if (log.accion === "retirado") stats[id].total_items_retirados += 1;
      }
    });

    // Calcular Métricas Derivadas
    const result = Object.values(stats)
      .map((s) => {
        const minutos_totales = s.tiempo_total_acumulado / 60 || 1; // Evitar div 0
        const total_intentos = s.total_items_recolectados + s.total_items_retirados;
        
        return {
          ...s,
          promedio_minutos: Math.round(minutos_totales / s.total_pedidos),
          // Velocidad: Items recolectados por minuto de trabajo activo
          velocidad_picking: parseFloat((s.total_items_recolectados / minutos_totales).toFixed(2)),
          // Precisión: % de items recolectados vs intentos totales
          tasa_precision: total_intentos > 0 
            ? Math.round((s.total_items_recolectados / total_intentos) * 100) 
            : 0
        };
      })
      .sort((a, b) => b.velocidad_picking - a.velocidad_picking); // Ordenar por velocidad (productividad)

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
