const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// 1. Estadísticas de Rendimiento por Picker (Mejorado con Velocidad y Precisión)
exports.getCollectorPerformance = async (req, res) => {
  try {
    // 1. Obtenemos asignaciones completadas (Base para Tiempo y Cantidad de Pedidos)
    const { data: asignaciones, error: asigError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id_picker, nombre_picker, tiempo_total_segundos, id_pedido"
      )
      .eq("estado_asignacion", "completado");

    if (asigError) throw asigError;

    // 2. Obtenemos Logs para calcular Items por Minuto y Tasa de Error
    // Nota: Traemos solo lo necesario para agrupar
    const { data: logs, error: logError } = await supabase
      .from("wc_log_picking")
      .select("accion, wc_asignaciones_pedidos!inner(id_picker)");
      // .limit(10000); // Podríamos limitar si crece mucho

    if (logError) throw logError;

    const stats = {};

    // Inicializar Estructura y sumar tiempos/pedidos
    asignaciones.forEach((a) => {
      const id = a.id_picker;
      if (!stats[id]) {
        stats[id] = {
          id,
          nombre: a.nombre_picker,
          total_pedidos: 0,
          tiempo_total_acumulado: 0,
          total_items_recolectados: 0,
          total_items_retirados: 0,
        };
      }
      stats[id].total_pedidos += 1;
      stats[id].tiempo_total_acumulado += a.tiempo_total_segundos || 0;
    });

    // Sumar conteo de items (acciones) a cada picker
    logs.forEach((log) => {
      // log.wc_asignaciones_pedidos es un objeto gracias al join (!inner)
      const id = log.wc_asignaciones_pedidos?.id_picker;
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

// 2. Mapa de Calor de Productos y Pasillos
exports.getProductHeatmap = async (req, res) => {
  try {
    // Traemos todo el log (limitado a últimos 5000 registros)
    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select("nombre_producto, accion, motivo")
      .order("fecha_registro", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const productMap = {};
    const aisleMap = {};

    logs.forEach((log) => {
      const name = log.nombre_producto || "Desconocido";
      
      // 1. Agregación por Producto
      if (!productMap[name]) {
        productMap[name] = { 
          name, 
          total_interacciones: 0, 
          total_removed: 0, 
          motivos: {} 
        };
      }
      productMap[name].total_interacciones += 1;
      
      if (log.accion === "retirado") {
        productMap[name].total_removed += 1;
        const reason = log.motivo || "Sin motivo";
        productMap[name].motivos[reason] = (productMap[name].motivos[reason] || 0) + 1;
      }

      // 2. Agregación por Pasillos (Nueva lógica usando mapeadorPasillos)
      // obtenerInfoPasillo retorna { pasillo: "6", prioridad: 5 }
      const { pasillo } = obtenerInfoPasillo([], name); 
      
      // Si el nombre es null o undefined, pasillo será undefined, pero obtenerInfoPasillo maneja defaults
      const pasilloKey = pasillo || "Otros";

      if (!aisleMap[pasilloKey]) {
        aisleMap[pasilloKey] = { 
          pasillo: pasilloKey, 
          total_interacciones: 0, 
          total_fallos: 0 
        };
      }
      aisleMap[pasilloKey].total_interacciones += 1;
      if (log.accion === "retirado") {
        aisleMap[pasilloKey].total_fallos += 1;
      }
    });

    const products = Object.values(productMap).sort((a, b) => b.total_interacciones - a.total_interacciones);
    
    // Ordenar pasillos alfabéticamente
    const aisles = Object.values(aisleMap).sort((a, b) => a.pasillo.localeCompare(b.pasillo));

    res.status(200).json({ products, aisles });

  } catch (error) {
    console.error("Error en getProductHeatmap:", error);
    res.status(500).json({ error: error.message });
  }
};

// 3. Auditoría Forense (Logs detallados)
exports.getAuditLogs = async (req, res) => {
  try {
    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select(
        `
        id,
        accion,
        fecha_registro,
        nombre_producto,
        motivo,
        id_pedido,
        wc_asignaciones_pedidos (
          nombre_picker
        )
      `
      )
      .order("fecha_registro", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.status(200).json(logs);
  } catch (error) {
    console.error("Error en getAuditLogs:", error);
    res.status(500).json({ error: error.message });
  }
};
