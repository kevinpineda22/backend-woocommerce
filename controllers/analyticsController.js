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
    const { range } = req.query; // 'today', '7d', '30d', 'all'

    // Construcción de query base
    let query = supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id_picker, nombre_picker, tiempo_total_segundos, id_pedido, fecha_inicio, fecha_fin"
      )
      .eq("estado_asignacion", "completado")
      .not("tiempo_total_segundos", "is", null);

    // Aplicar Filtro de Fecha (Ajustado a Zona Horaria Colombia aprox si usamos UTC server)
    // Se asume que fecha_inicio está en ISO UTC
    if (range && range !== 'all') {
        const now = dayjs(); // Server time
        let startDate;

        if (range === 'today') {
            // Inicio del día actual
            startDate = now.startOf('day'); 
        } else if (range === '7d') {
            startDate = now.subtract(7, 'day').startOf('day');
        } else if (range === '30d') {
            startDate = now.subtract(30, 'day').startOf('day');
        }

        if (startDate) {
            query = query.gte('fecha_inicio', startDate.toISOString());
        }
    }

    // 1. Obtenemos asignaciones completadas (Base para Tiempo y Cantidad de Pedidos)
    const { data: asignaciones, error: asigError } = await query;

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

    let pedidoIds = [];
    let relatedOrdersInfo = [];

    // Paso 1: Identificar sesión MULTIPICKER (pedidos simultáneos)
    if (id_pedido) {
       // A. Obtener detalles del pedido solicitado
       const { data: primaryOrder, error: poError } = await supabase
         .from("wc_asignaciones_pedidos")
         .select("id_pedido, fecha_inicio, fecha_fin, nombre_picker")
         .eq("id_picker", id_picker)
         .eq("id_pedido", id_pedido)
         .single();
       
       if (poError || !primaryOrder) {
         // Fallback si no encuentra (raro)
         pedidoIds = [id_pedido];
       } else {
         // B. Buscar pedidos concurrentes (Overlap de tiempo significativo)
         // Definimos ventana: Que hayan empezado o terminado dentro del rango del principal (+/- 5 min margen)
         const startTime = new Date(primaryOrder.fecha_inicio).getTime() - (5 * 60 * 1000);
         const endTime = new Date(primaryOrder.fecha_fin).getTime() + (5 * 60 * 1000);

         const { data: concurrentOrders, error: coError } = await supabase
            .from("wc_asignaciones_pedidos")
            .select("id_pedido, fecha_inicio, fecha_fin")
            .eq("id_picker", id_picker)
            .eq("estado_asignacion", "completado")
            .gte("fecha_fin", new Date(startTime).toISOString()) 
            .lte("fecha_inicio", new Date(endTime).toISOString());
         
         if (!coError && concurrentOrders.length > 0) {
            pedidoIds = concurrentOrders.map(o => o.id_pedido);
            relatedOrdersInfo = concurrentOrders;
         } else {
            pedidoIds = [id_pedido];
         }
       }
    } else {
       // C. Si no hay id_pedido, traer últimos (comportamiento legacy o por defecto)
       const { data: recentOrders } = await supabase
         .from("wc_asignaciones_pedidos")
         .select("id_pedido")
         .eq("id_picker", id_picker)
         .eq("estado_asignacion", "completado")
         .order("fecha_fin", { ascending: false })
         .limit(5);
         
       pedidoIds = recentOrders ? recentOrders.map(o => o.id_pedido) : [];
    }
  
    if (pedidoIds.length === 0) {
      return res.status(200).json({
        route: [], summary: [], regressions: [], 
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 }
      });
    }

    // Paso 2: Obtener logs de TODOS los pedidos de la sesión
    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select("accion, pasillo, nombre_producto, fecha_registro, id_pedido")
      .in("id_pedido", pedidoIds)
      .order("fecha_registro", { ascending: true }) // Orden cronológico real mezcla los pedidos
      .limit(1000);

    if (error) throw error;

    if (!logs || logs.length === 0) {
      return res.status(200).json({
        route: [], summary: [], regressions: [], 
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 }
      });
    }

    // Mapeo de colores para pedidos (hasta 5 colores distintos)
    // El frontend recibirá 'order_color_index'
    const uniqueOrders = [...new Set(logs.map(l => l.id_pedido))];
    const orderColorMap = {};
    uniqueOrders.forEach((oid, idx) => orderColorMap[oid] = idx);

    // Enriquecer logs con color index
    const enrichedLogs = logs.map(log => ({
      ...log,
      order_color_index: orderColorMap[log.id_pedido]
    }));

    // Agrupar por LOG INDIVIDUAL para máxima fidelidad en animación multipicker
    // OJO: WarehouseMap.jsx itera sobre 'routeData'. 
    // Si queremos ver CADA item picado con su color, debemos enviar un paso por cada item (o agrupados muy fino).
    // El código original agrupaba por PASILLO. 
    // Para Multipicker, si estamos en Pasillo 1 y picamos A, luego B, luego A -> Son 3 acciones.
    // Si agrupamos todo el pasillo, perdemos la secuencia de colores.
    // ESTRATEGIA: Agrupar por (Pasillo + Pedido) consecutivo O desglosar acciones.
    // Para simplificar mapa: "Cada acción de picking es un paso" si hay cambio, 
    // O mantenemos "Paso = Visita a Pasillo", pero indicamos qué pedidos se tocaron.
    // MEJOR: Desglosar un poco mas. Si cambia de pedido DENTRO del mismo pasillo, generamos "mini-paso".

    const routeSegments = [];
    let currentSegment = null;

    logs.forEach(log => {
      const timestamp = new Date(log.fecha_registro);
      const pasillo = log.pasillo || "S/N";
      const orderId = log.id_pedido;

      // Romper segmento si: cambia pasillo O cambia pedido (para mostrar cambio de color)
      const isNewSegment = !currentSegment 
          || currentSegment.pasillo !== pasillo 
          || currentSegment.order_id !== orderId;

      if (isNewSegment) {
        if (currentSegment) {
          currentSegment.end_time = timestamp;
          currentSegment.duration_seconds = Math.round((currentSegment.end_time - currentSegment.start_time) / 1000);
          routeSegments.push(currentSegment);
        }

        currentSegment = {
          pasillo: pasillo,
          order_id: orderId,
          order_color_index: orderColorMap[orderId], // 0, 1, 2...
          start_time: timestamp,
          end_time: timestamp,
          items: 0,
          products: [],
          visit_order: routeSegments.length + 1
        };
      }

      currentSegment.items++;
      currentSegment.products.push({
        name: log.nombre_producto,
        accion: log.accion,
        time: timestamp.toISOString(),
        order_id: log.id_pedido // Para detalle
      });
      currentSegment.end_time = timestamp;
    });

    if (currentSegment) {
      currentSegment.duration_seconds = Math.round((currentSegment.end_time - currentSegment.start_time) / 1000);
      routeSegments.push(currentSegment);
    }

    // ... (Regresiones y Stats igual) ...
    // Detectar "regresiones"
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

    // Calcular estadísticas por pasillo
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

    const summary = Object.values(pasilloStats).map(p => ({
      ...p,
      avg_time_per_item: p.total_items > 0 ? Math.round(p.total_time / p.total_items) : 0,
      total_time_formatted: `${Math.floor(p.total_time / 60)}:${String(p.total_time % 60).padStart(2, '0')}`
    })).sort((a, b) => b.total_time - a.total_time);

    res.status(200).json({
      // Metadata extra para frontend
      session_info: {
        is_multipicker: uniqueOrders.length > 1,
        total_orders: uniqueOrders.length,
        order_ids: uniqueOrders,
        related_orders: relatedOrdersInfo
      },
      route: routeSegments.map(s => ({
        ...s,
        start_time: s.start_time.toISOString(),
        end_time: s.end_time.toISOString()
      })),
      summary,
      regressions,
      raw_logs: enrichedLogs,
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