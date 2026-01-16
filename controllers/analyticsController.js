const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// 1. Estadísticas de Rendimiento por Picker (Mejorado con PPH, Idle Time, Drilldown y Tendencias) [Versión 2.0]
exports.getCollectorPerformance = async (req, res) => {
  try {
    // Definir ventanas de tiempo (Hoy vs Ayer para tendencias)
    // Nota: "Hoy" se define como desde la medianoche hasta ahora.
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    // Ayer para comparativa
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    // 1. Logs de Picking - Fuente de verdad para tiempos y acciones
    // Traemos logs de las últimas 48h (Ayer + Hoy)
    const { data: logs, error: logError } = await supabase
      .from("wc_log_picking")
      .select("accion, motivo, id_pedido, fecha_registro, device_timestamp, wc_asignaciones_pedidos!inner(id_picker, nombre_picker)")
      .gte("fecha_registro", yesterdayStart.toISOString())
      .order("fecha_registro", { ascending: true }); // Orden cronológico vital para idle calc
    
    if (logError) throw logError;

    // 2. Asignaciones (para complementar tasa de pedido perfecto)
    const { data: asignaciones, error: asigError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_picker, id_pedido, fecha_inicio, estado_asignacion")
      .gte("fecha_inicio", yesterdayStart.toISOString())
      .eq("estado_asignacion", "completado");

    if (asigError) throw asigError;

    // --- ESTRUCTURAS DE DATOS ---
    const pickersObj = {};
    const histogramData = []; // Para guardar durations de picks (hoy)
    
    const initPicker = (id, nombre) => ({
        id,
        nombre,
        today: { 
            active_sec: 0, idle_sec: 0, items: 0, errors: 0, total_orders: 0, perfect_orders: 0, logs: [], error_map: {} 
        },
        yesterday: { 
            active_sec: 0, items: 0 
        },
        idle_gaps: []
    });

    const isToday = (dateStr) => new Date(dateStr) >= todayStart;

    // --- PROCESAMIENTO DE LOGS (Idle, SPI, PPH) ---
    // Agrupamos logs primero
    const logsByPicker = {};
    logs.forEach(log => {
        const pid = log.wc_asignaciones_pedidos.id_picker;
        const nombre = log.wc_asignaciones_pedidos.nombre_picker;
        if(!logsByPicker[pid]) logsByPicker[pid] = { name: nombre, logs: [] };
        logsByPicker[pid].logs.push({
            ...log,
            timeObj: log.device_timestamp ? new Date(log.device_timestamp) : new Date(log.fecha_registro)
        });
    });

    // Analizamos secuencias de tiempo por picker
    for (const [pid, data] of Object.entries(logsByPicker)) {
        if (!pickersObj[pid]) pickersObj[pid] = initPicker(pid, data.name);
        
        // Orden garantizado
        const sortedLogs = data.logs.sort((a, b) => a.timeObj - b.timeObj);
        let lastTime = null;

        sortedLogs.forEach(currentLog => {
           const currentIsToday = isToday(currentLog.fecha_registro);
           const targetStats = currentIsToday ? pickersObj[pid].today : pickersObj[pid].yesterday;

           // 1. Contabilizar Acción
           if (currentLog.accion === 'recolectado') targetStats.items++;
           else if (['no_encontrado', 'retirado', 'dañado'].includes(currentLog.accion)) {
               if (currentIsToday) {
                   targetStats.errors++;
                   const m = currentLog.motivo || 'General';
                   targetStats.error_map[m] = (targetStats.error_map[m] || 0) + 1;
               }
           }

           // 2. Sample Logs (Solo Hoy)
           if (currentIsToday) {
               pickersObj[pid].today.logs.push({
                   hora: currentLog.timeObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
                   accion: currentLog.accion,
                   motivo: currentLog.motivo,
                   sku: "Ver Drilldown" // Idealmente vendría del log si existiera columna
               });
           }

           // 3. TIEMPO (Idle vs Active)
           // Aproximación: Tiempo entre logs.
           if (lastTime) {
               const diffSeconds = (currentLog.timeObj - lastTime) / 1000;
               
               // REGLA IDLE: Gap > 5 minutos (300s)
               if (diffSeconds > 300) {
                   if (currentIsToday) {
                        pickersObj[pid].today.idle_sec += diffSeconds;
                        pickersObj[pid].idle_gaps.push({
                            start: lastTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                            end: currentLog.timeObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                            duration: Math.round(diffSeconds / 60) + ' min'
                        });
                   }
               } else {
                   // Active Time Estimado
                   targetStats.active_sec += diffSeconds;
                   
                   // Valid Data para Histograma (Solo Hoy y gaps positivos)
                   if (currentIsToday && diffSeconds > 0) {
                       histogramData.push(Math.round(diffSeconds));
                   }
               }
           }
           lastTime = currentLog.timeObj;
        });
    }

    // --- PROCESAMIENTO PEDIDOS PERFECTOS ---
    const pedidosFallidos = new Set();
    logs.forEach(l => {
        if (isToday(l.fecha_registro) && ['no_encontrado', 'retirado'].includes(l.accion)) {
            pedidosFallidos.add(l.id_pedido);
        }
    });

    asignaciones.forEach(a => {
        if (isToday(a.fecha_inicio)) {
            const pid = a.id_picker;
            if (pickersObj[pid]) {
                pickersObj[pid].today.total_orders++;
                if (!pedidosFallidos.has(a.id_pedido)) {
                    pickersObj[pid].today.perfect_orders++;
                }
            }
        }
    });

    // --- CÁLCULO DE PERCENTILES (Histograma) ---
    histogramData.sort((a,b) => a - b);
    const getPercentile = (p) => {
        if(histogramData.length === 0) return 0;
        const idx = Math.floor((p / 100) * histogramData.length);
        return histogramData[idx];
    };
    const distribution = {
        p50: getPercentile(50),
        p75: getPercentile(75),
        p90: getPercentile(90),
        values: histogramData
    };
    // Hacemos buckets simples
    const buckets = { '<10s': 0, '10-30s': 0, '30-60s': 0, '60-120s': 0, '>120s': 0 };
    histogramData.forEach(v => {
        if (v < 10) buckets['<10s']++;
        else if (v <= 30) buckets['10-30s']++;
        else if (v <= 60) buckets['30-60s']++;
        else if (v <= 120) buckets['60-120s']++;
        else buckets['>120s']++;
    });


    // --- FORMATO FINAL ---
    const resultPickers = Object.values(pickersObj).map(p => {
        const t = p.today;
        const y = p.yesterday;

        // Metrics Today
        const hoursActive = t.active_sec / 3600;
        const pph = hoursActive > 0 ? Math.round(t.items / hoursActive) : 0;
        const spi = t.items > 0 ? Math.round(t.active_sec / t.items) : 0;
        const totalOps = t.items + t.errors;
        const accuracy = totalOps > 0 ? Math.round((t.items / totalOps) * 100) : 100;
        const perfectRate = t.total_orders > 0 ? Math.round((t.perfect_orders / t.total_orders) * 100) : 100;

        // Metrics Yesterday (Baseline)
        const yHours = y.active_sec / 3600;
        const yPph = yHours > 0 ? Math.round(y.items / yHours) : 0;
        
        // Diff
        const pphDiff = yPph > 0 ? Math.round(((pph - yPph) / yPph) * 100) : 0;

        return {
            id: p.id,
            nombre: p.nombre,
            stats: {
                pph: pph,
                spi: spi,
                accuracy: accuracy,
                perfect_order_rate: perfectRate,
                idle_minutes: Math.round(t.idle_sec / 60),
                trend_pph: pphDiff
            },
            drilldown: {
                errors: t.error_map, // { "No encontrado": 5, ... }
                gaps: p.idle_gaps,   // [{ start, end, duration }, ...]
                recent_logs: t.logs.sort((a,b) => b.hora.localeCompare(a.hora)).slice(0, 20)
            }
        };
    }).sort((a,b) => b.stats.pph - a.stats.pph); // Ranking por PPH

    res.status(200).json({
        pickers: resultPickers,
        histogram: { buckets, percentiles: distribution },
        globalStats: { 
            total_active_pickers: resultPickers.length,
            avg_pph: Math.round(resultPickers.reduce((acc, c) => acc + c.stats.pph, 0) / (resultPickers.length || 1))
        }
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
