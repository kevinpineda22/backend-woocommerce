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
      .eq("estado_asignacion", "completado")
      // Filtramos datos muy antiguos o corruptos si es necesario
      .not("tiempo_total_segundos", "is", null);

    if (asigError) throw asigError;

    // 2. Obtenemos Logs para calcular Items por Minuto, Tasa de Error y Pedidos Perfectos
    const { data: logs, error: logError } = await supabase
      .from("wc_log_picking")
      .select("accion, motivo, id_pedido, wc_asignaciones_pedidos!inner(id_picker)");

    if (logError) throw logError;

    const stats = {};
    const pedidosConFallas = new Set(); // Para rastrear pedidos imperfectos

    // Identificar pedidos con fallos
    logs.forEach(log => {
        if(log.accion === 'retirado' || log.accion === 'no_encontrado') {
            pedidosConFallas.add(log.id_pedido);
        }
    });

    // Inicializar Estructura y sumar tiempos/pedidos
    asignaciones.forEach((a) => {
      const id = a.id_picker;
      if (!stats[id]) {
        stats[id] = {
          id,
          nombre: a.nombre_picker,
          total_pedidos: 0,
          pedidos_perfectos: 0,
          tiempo_total_acumulado: 0,
          total_items_recolectados: 0,
          total_items_reportados: 0,
          motivos_frecuentes: {}
        };
      }
      stats[id].total_pedidos += 1;
      stats[id].tiempo_total_acumulado += a.tiempo_total_segundos || 0;
      
      // Chequear si este pedido fue perfecto
      if (!pedidosConFallas.has(a.id_pedido)) {
          stats[id].pedidos_perfectos += 1;
      }
    });

    // Sumar conteo de items (acciones) a cada picker
    logs.forEach((log) => {
      const id = log.wc_asignaciones_pedidos?.id_picker;
      if (stats[id]) {
        if (log.accion === "recolectado") {
            stats[id].total_items_recolectados += 1;
        } else if (log.accion === "retirado" || log.accion === "no_encontrado") {
            stats[id].total_items_reportados += 1;
            // Registrar motivo para perfilado del picker
            const motivo = log.motivo || "Sin motivo";
            stats[id].motivos_frecuentes[motivo] = (stats[id].motivos_frecuentes[motivo] || 0) + 1;
        }
      }
    });

    // Calcular Métricas Derivadas KPI (Key Performance Indicators)
    const result = Object.values(stats)
      .map((s) => {
        const minutos_totales = s.tiempo_total_acumulado / 60 || 1;
        const total_acciones = s.total_items_recolectados + s.total_items_reportados;
        
        // Segundos por Item (SPI) - Métrica Dorada en Logística
        // Cuantos segundos le toma procesar 1 item (buscar + escanear)
        // Se usa total_acciones porque tanto encontrar como no encontrar toma tiempo
        const segundos_por_item = total_acciones > 0 
            ? Math.round(s.tiempo_total_acumulado / total_acciones) 
            : 0;

        // Tasa de Pedido Perfecto
        const tasa_pedido_perfecto = s.total_pedidos > 0
            ? Math.round((s.pedidos_perfectos / s.total_pedidos) * 100)
            : 0;
            
        // Motivo más frecuente de fallo
        const topMotivo = Object.entries(s.motivos_frecuentes)
            .sort((a,b) => b[1] - a[1])[0];
        
        return {
          ...s,
          promedio_minutos_pedido: Math.round(minutos_totales / s.total_pedidos),
          segundos_por_item: segundos_por_item, 
          velocidad_picking: parseFloat((s.total_items_recolectados / minutos_totales).toFixed(2)), // Items/min (Legacy pero útil)
          tasa_precision: total_acciones > 0 
            ? Math.round((s.total_items_recolectados / total_acciones) * 100) 
            : 0,
          tasa_pedido_perfecto,
          motivo_comun_fallo: topMotivo ? `${topMotivo[0]} (${topMotivo[1]})` : 'N/A'
        };
      })
      .sort((a, b) => b.tasa_pedido_perfecto - a.tasa_pedido_perfecto); // Ordenamos por Calidad (Pedidos Perfectos)

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
