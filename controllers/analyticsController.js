const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const dayjs = require("dayjs");

// Coordenadas aproximadas para cálculo de distancias (Basado en WarehouseMap.jsx)
// Se toman los puntos centrales de cada bloque.
const AISLE_COORDINATES = {
  '1': { x: 90, y: 170 }, 
  '2': { x: 90, y: 340 },
  '3': { x: 200, y: 170 },
  '4': { x: 200, y: 340 },
  '5': { x: 310, y: 170 },
  '6': { x: 310, y: 340 },
  '7': { x: 420, y: 170 },
  '8': { x: 420, y: 340 },
  '9': { x: 530, y: 170 },
  '10': { x: 530, y: 340 },
  '11': { x: 640, y: 170 },
  '12': { x: 640, y: 340 },
  '13': { x: 730, y: 275 },
  '14': { x: 400, y: 520 }, 
  'default': { x: 40, y: 40 } // Entrada/Oficina (Inicio de turno)
};

const calculateDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// 1. Estadísticas de Rendimiento por Picker (Mejorado con Velocidad y Precisión)
exports.getCollectorPerformance = async (req, res) => {
  try {
    // 1. Obtenemos asignaciones completadas (Base para Tiempo y Cantidad de Pedidos)
    const { data: asignaciones, error: asigError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id_picker, nombre_picker, tiempo_total_segundos, id_pedido, fecha_inicio, fecha_fin"
      )
      .eq("estado_asignacion", "completado")
      // Filtramos datos muy antiguos o corruptos si es necesario
      .not("tiempo_total_segundos", "is", null);

    if (asigError) throw asigError;

    // 2. Obtenemos Logs para calcular Items por Minuto, Tasa de Error y Pedidos Perfectos
    const { data: logs, error: logError } = await supabase
      .from("wc_log_picking")
      .select("accion, motivo, id_pedido, pasillo, fecha_registro, wc_asignaciones_pedidos!inner(id_picker)")
      .order("fecha_registro", { ascending: true }); // Importante: Orden cronologico para distancia

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
          distancia_recorrida_px: 0, // Nueva Metrica de Esfuerzo Físico
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

    // Estructura para calcular distancias: picker -> pedido -> [logs ordenados]
    const pickerRoutes = {};

    // Sumar conteo de items (acciones) a cada picker
    logs.forEach((log) => {
      const id = log.wc_asignaciones_pedidos?.id_picker;
      if (stats[id]) {
        // Logica Distancia: Agrupar por pedido
        if (!pickerRoutes[id]) pickerRoutes[id] = {};
        if (!pickerRoutes[id][log.id_pedido]) pickerRoutes[id][log.id_pedido] = [];
        pickerRoutes[id][log.id_pedido].push(log);

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

    // CÁLCULO DE DISTANCIAS
    Object.keys(pickerRoutes).forEach(pickerId => {
        let totalDistancia = 0;
        const pedidos = pickerRoutes[pickerId];

        Object.values(pedidos).forEach(logsDePedido => {
            // Ordenamos por seguridad, aunque ya vinieron ordenados
            // Empezamos en "Entrada" o ultimo punto conocido (Asumimos Entrada por cada pedido nuevo por ahora)
            let prevPos = AISLE_COORDINATES['default'];
            
            logsDePedido.forEach(log => {
                const pasillo = String(log.pasillo || '').replace('P-', '');
                const targetPos = AISLE_COORDINATES[pasillo];

                if (targetPos) {
                    totalDistancia += calculateDistance(prevPos, targetPos);
                    prevPos = targetPos; // Caminamos aqui
                }
            });
            // Retorno a base (opcional, pero realista)
            totalDistancia += calculateDistance(prevPos, AISLE_COORDINATES['default']);
        });

        if (stats[pickerId]) {
            // Convertimos pixeles (unidades arbitrarias) a Metros Estimados
            // Factor: 100px aprox = 10 metros en bodegas pequeñas -> 1px = 0.1m
            stats[pickerId].distancia_recorrida_px = Math.round(totalDistancia * 0.1); 
        }
    });

    // 4. Calcular Métricas por Hora (Ritmo Circadiano - Global)
    // Inicializamos array de objetos con contador y set de pickers
    const hourlyStats = Array.from({ length: 24 }, () => ({ count: 0, pickers: new Set() }));

    asignaciones.forEach(a => {
       // RECOMENDACIÓN: Usar 'fecha_inicio' para medir la DEMANDA/CARGA de trabajo real (Cuándo llegan los pedidos).
       // Si un pedido llega a las 11:59, cuenta como carga de las 11h, aunque se termine a las 12h.
       const fechaRef = a.fecha_inicio; 
       
       if (fechaRef) {
          const date = dayjs(fechaRef).subtract(5, 'hour'); // UTC-5
          const hour = date.hour(); // 0-23
          
          if(hour >= 0 && hour < 24) {
              hourlyStats[hour].count++;
              if (a.nombre_picker) {
                  hourlyStats[hour].pickers.add(a.nombre_picker);
              }
          }
       }
    });
    
    // Formatear para gráfica
    const hourlyActivity = hourlyStats.map((stat, hour) => ({
        hour: `${hour}:00`,
        pedidos: stat.count,
        pickers: Array.from(stat.pickers) // Convertimos Set a Array para el frontend
    }));

    // 5. Calcular Métricas Globales
    const total_pedidos_global = asignaciones.length;
    const total_items_global = Object.values(stats).reduce((acc, curr) => acc + curr.total_items_recolectados + curr.total_items_reportados, 0);
    const tiempo_total_global = Object.values(stats).reduce((acc, curr) => acc + curr.tiempo_total_acumulado, 0);
    
    const globalStats = {
        total_pedidos: total_pedidos_global,
        spi_promedio: total_items_global > 0 ? Math.round(tiempo_total_global / total_items_global) : 0,
        tasa_exito_global: total_items_global > 0 
           ? Math.round((Object.values(stats).reduce((acc, c) => acc + c.total_items_recolectados, 0) / total_items_global) * 100) 
           : 0
    };

    // Calcular Métricas Derivadas KPI (Key Performance Indicators) por Picker
    const resultPickers = Object.values(stats)
      .map((s) => {
        const minutos_totales = s.tiempo_total_acumulado / 60 || 1;
        const total_acciones = s.total_items_recolectados + s.total_items_reportados;
        
        // Segundos por Item (SPI)
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
          velocidad_picking: parseFloat((s.total_items_recolectados / minutos_totales).toFixed(2)),
          tasa_precision: total_acciones > 0 
            ? Math.round((s.total_items_recolectados / total_acciones) * 100) 
            : 0,
          tasa_pedido_perfecto,
          motivo_comun_fallo: topMotivo ? `${topMotivo[0]} (${topMotivo[1]})` : 'N/A'
        };
      })
      .sort((a, b) => b.tasa_pedido_perfecto - a.tasa_pedido_perfecto);

    // DEVOLVEMOS OBJETO COMPUESTO, NO SOLO ARRAY
    res.status(200).json({
        pickers: resultPickers,
        hourlyActivity,
        globalStats
    });

  } catch (error) {
    console.error("Error en getCollectorPerformance:", error);
    res.status(500).json({ error: error.message });
  }
};

// 2. Auditoría de Productos (Top Fallos y Problemas)
exports.getProductHeatmap = async (req, res) => {
  try {
    // Solo traemos logs de errores/retiros para optimizar
    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select("nombre_producto, accion, motivo")
      .in("accion", ["retirado", "no_encontrado"])
      .order("fecha_registro", { ascending: false })
      .limit(2000);

    if (error) throw error;

    const productMap = {};

    logs.forEach((log) => {
      const name = log.nombre_producto || "Desconocido";
      
      if (!productMap[name]) {
        productMap[name] = { 
          name, 
          total_removed: 0, 
          motivos: {} 
        };
      }
      
      productMap[name].total_removed += 1;
      const reason = log.motivo || "Sin motivo";
      productMap[name].motivos[reason] = (productMap[name].motivos[reason] || 0) + 1;
    });

    // Convertir a array y ordenar por num de problemas
    const products = Object.values(productMap)
        .sort((a, b) => b.total_removed - a.total_removed)
        .slice(0, 50); // Top 50 problemas

    res.status(200).json({ products }); // Eliminamos aisles

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

// 4. [NEW] Análisis de Ruta por Pasillos (Mapa de Recorrido del Picker)
exports.getPickerRoute = async (req, res) => {
  try {
    const { id_picker, id_pedido } = req.query;

    if (!id_picker) {
      return res.status(400).json({ error: "id_picker requerido" });
    }

    // Paso 1: Obtener los pedidos del picker
    let pedidosQuery = supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido")
      .eq("id_picker", id_picker)
      .eq("estado_asignacion", "completado");

    if (id_pedido) {
      pedidosQuery = pedidosQuery.eq("id_pedido", id_pedido);
    }

    const { data: asignaciones, error: asigError } = await pedidosQuery;
    
    if (asigError) throw asigError;

    if (!asignaciones || asignaciones.length === 0) {
      return res.status(200).json({
        route: [],
        summary: [],
        regressions: [],
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 }
      });
    }

    const pedidoIds = asignaciones.map(a => a.id_pedido);

    // Paso 2: Obtener logs de esos pedidos
    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select("accion, pasillo, nombre_producto, fecha_registro, id_pedido")
      .in("id_pedido", pedidoIds)
      .order("fecha_registro", { ascending: true })
      .limit(500);

    if (error) throw error;

    if (!logs || logs.length === 0) {
      return res.status(200).json({
        route: [],
        summary: [],
        regressions: [],
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 },
        raw_logs: []
      });
    }

    // Agrupar por secuencia de pasillos
    const routeSegments = [];
    let currentSegment = null;

    logs.forEach(log => {
      const timestamp = new Date(log.fecha_registro);
      const pasillo = log.pasillo || "S/N";

      if (!currentSegment || currentSegment.pasillo !== pasillo) {
        // Nuevo segmento (cambio de pasillo)
        if (currentSegment) {
          currentSegment.end_time = timestamp;
          currentSegment.duration_seconds = Math.round((currentSegment.end_time - currentSegment.start_time) / 1000);
          routeSegments.push(currentSegment);
        }

        currentSegment = {
          pasillo: pasillo,
          start_time: timestamp,
          end_time: timestamp,
          items: 0,
          products: [],
          visit_order: routeSegments.length + 1
        };
      }

      // Acumular items en el segmento actual
      currentSegment.items++;
      currentSegment.products.push({
        name: log.nombre_producto,
        accion: log.accion,
        time: timestamp.toISOString()
      });
      currentSegment.end_time = timestamp;
    });

    // Cerrar el último segmento
    if (currentSegment) {
      currentSegment.duration_seconds = Math.round((currentSegment.end_time - currentSegment.start_time) / 1000);
      routeSegments.push(currentSegment);
    }

    // Detectar "regresiones" (visitas repetidas al mismo pasillo)
    const pasilloVisits = {};
    routeSegments.forEach(seg => {
      if (!pasilloVisits[seg.pasillo]) pasilloVisits[seg.pasillo] = [];
      pasilloVisits[seg.pasillo].push(seg.visit_order);
    });

    const regressions = [];
    Object.entries(pasilloVisits).forEach(([pasillo, visits]) => {
      if (visits.length > 1) {
        regressions.push({
          pasillo,
          visits: visits,
          message: `Regresó ${visits.length - 1} vez(es)`
        });
      }
    });

    // Calcular estadísticas por pasillo (agregadas)
    const pasilloStats = {};
    routeSegments.forEach(seg => {
      if (!pasilloStats[seg.pasillo]) {
        pasilloStats[seg.pasillo] = {
          pasillo: seg.pasillo,
          total_time: 0,
          total_items: 0,
          visits: 0
        };
      }
      pasilloStats[seg.pasillo].total_time += seg.duration_seconds;
      pasilloStats[seg.pasillo].total_items += seg.items;
      pasilloStats[seg.pasillo].visits++;
    });

    // Formatear para tabla resumen
    const summary = Object.values(pasilloStats).map(p => ({
      ...p,
      avg_time_per_item: p.total_items > 0 ? Math.round(p.total_time / p.total_items) : 0,
      total_time_formatted: `${Math.floor(p.total_time / 60)}:${String(p.total_time % 60).padStart(2, '0')}`
    })).sort((a, b) => b.total_time - a.total_time);

    res.status(200).json({
      route: routeSegments.map(s => ({
        ...s,
        start_time: s.start_time.toISOString(),
        end_time: s.end_time.toISOString()
      })),
      summary,
      regressions,
      raw_logs: logs,
      metrics: {
        total_pasillos_visitados: Object.keys(pasilloStats).length,
        total_time: routeSegments.reduce((acc, s) => acc + s.duration_seconds, 0),
        total_items: logs.length
      }
    });

  } catch (error) {
    console.error("Error en getPickerRoute:", error);
    res.status(500).json({ error: error.message });
  }
};

// 7. Listado de Rutas Completadas (Historial para Selección)
exports.getCompletedRoutesList = async (req, res) => {
  try {
    const { data: routes, error } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, nombre_picker, id_picker, fecha_fin, tiempo_total_segundos")
      .eq("estado_asignacion", "completado")
      .order("fecha_fin", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.status(200).json(routes);
  } catch (error) {
    console.error("Error en getCompletedRoutesList:", error);
    res.status(500).json({ error: error.message });
  }
};