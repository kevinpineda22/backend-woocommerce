const { supabase } = require("../services/supabaseClient");
const dayjs = require("dayjs");

// Coordenadas aproximadas para cálculo de distancias (Basado en WarehouseMap.jsx)
// Se toman los puntos centrales de cada bloque.
const AISLE_COORDINATES = {
  1: { x: 90, y: 170 },
  2: { x: 90, y: 340 },
  3: { x: 200, y: 170 },
  4: { x: 200, y: 340 },
  5: { x: 310, y: 170 },
  6: { x: 310, y: 340 },
  7: { x: 420, y: 170 },
  8: { x: 420, y: 340 },
  9: { x: 530, y: 170 },
  10: { x: 530, y: 340 },
  11: { x: 640, y: 170 },
  12: { x: 640, y: 340 },
  13: { x: 730, y: 275 },
  14: { x: 400, y: 520 },
  default: { x: 40, y: 40 }, // Entrada/Oficina (Inicio de turno)
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
        "id_picker, nombre_picker, tiempo_total_segundos, id_pedido, fecha_inicio, fecha_fin",
      )
      .eq("estado_asignacion", "completado")
      .not("tiempo_total_segundos", "is", null);

    // Filtro Multi-Sede
    if (req.sedeId) {
      query = query.eq("sede_id", req.sedeId);
    }

    // Aplicar Filtro de Fecha (Ajustado a Zona Horaria Colombia aprox si usamos UTC server)
    // Se asume que fecha_inicio está en ISO UTC
    if (range && range !== "all") {
      const now = dayjs(); // Server time
      let startDate;

      if (range === "today") {
        // Inicio del día actual
        startDate = now.startOf("day");
      } else if (range === "7d") {
        startDate = now.subtract(7, "day").startOf("day");
      } else if (range === "30d") {
        startDate = now.subtract(30, "day").startOf("day");
      }

      if (startDate) {
        query = query.gte("fecha_inicio", startDate.toISOString());
      }
    }

    // 1. Obtenemos asignaciones completadas (Base para Tiempo y Cantidad de Pedidos)
    const { data: asignaciones, error: asigError } = await query;

    if (asigError) throw asigError;

    // 2. Obtenemos Logs para calcular Items por Minuto, Tasa de Error y Pedidos Perfectos
    let logsQuery = supabase
      .from("wc_log_picking")
      .select(
        "accion, motivo, id_pedido, pasillo, fecha_registro, wc_asignaciones_pedidos!inner(id_picker, fecha_inicio)",
      )
      .order("fecha_registro", { ascending: true });

    // Filtro Multi-Sede
    if (req.sedeId) {
      logsQuery = logsQuery.eq("sede_id", req.sedeId);
    }

    // Aplicar mismo filtro de fecha a los logs para evitar traer miles de registros innecesarios
    if (range && range !== "all") {
      const now = dayjs();
      let startDate;
      if (range === "today") startDate = now.startOf("day");
      else if (range === "7d") startDate = now.subtract(7, "day").startOf("day");
      else if (range === "30d")
        startDate = now.subtract(30, "day").startOf("day");

      if (startDate) {
        logsQuery = logsQuery.gte(
          "wc_asignaciones_pedidos.fecha_inicio",
          startDate.toISOString(),
        );
      }
    }

    const { data: logs, error: logError } = await logsQuery;

    if (logError) throw logError;

    // 3. Obtener Total Recaudado (Sesiones Finalizadas)
    let sessionsQuery = supabase
      .from("wc_picking_sessions")
      .select("datos_salida, fecha_fin")
      .eq("estado", "finalizado");

    if (req.sedeId) {
      sessionsQuery = sessionsQuery.eq("sede_id", req.sedeId);
    }

    if (range && range !== "all") {
      const now = dayjs();
      let startDate;
      if (range === "today") startDate = now.startOf("day");
      else if (range === "7d") startDate = now.subtract(7, "day").startOf("day");
      else if (range === "30d")
        startDate = now.subtract(30, "day").startOf("day");

      if (startDate) {
        sessionsQuery = sessionsQuery.gte("fecha_fin", startDate.toISOString());
      }
    }

    const { data: sessionsFin } = await sessionsQuery;
    let totalRecaudado = 0;
    sessionsFin?.forEach((s) => {
      if (s.datos_salida?.orders) {
        s.datos_salida.orders.forEach((o) => {
          totalRecaudado += parseFloat(o.total) || 0;
        });
      }
    });

    const stats = {};
    const pedidosConFallas = new Set(); // Para rastrear pedidos imperfectos

    // Identificar pedidos con fallos
    logs.forEach((log) => {
      if (log.accion === "retirado" || log.accion === "no_encontrado") {
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
          motivos_frecuentes: {},
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
        if (!pickerRoutes[id][log.id_pedido])
          pickerRoutes[id][log.id_pedido] = [];
        pickerRoutes[id][log.id_pedido].push(log);

        if (log.accion === "recolectado") {
          stats[id].total_items_recolectados += 1;
        } else if (
          log.accion === "retirado" ||
          log.accion === "no_encontrado"
        ) {
          stats[id].total_items_reportados += 1;
          // Registrar motivo para perfilado del picker
          const motivo = log.motivo || "Sin motivo";
          stats[id].motivos_frecuentes[motivo] =
            (stats[id].motivos_frecuentes[motivo] || 0) + 1;
        }
      }
    });

    // CÁLCULO DE DISTANCIAS
    Object.keys(pickerRoutes).forEach((pickerId) => {
      let totalDistancia = 0;
      const pedidos = pickerRoutes[pickerId];

      Object.values(pedidos).forEach((logsDePedido) => {
        // Ordenamos por seguridad, aunque ya vinieron ordenados
        // Empezamos en "Entrada" o ultimo punto conocido (Asumimos Entrada por cada pedido nuevo por ahora)
        let prevPos = AISLE_COORDINATES["default"];

        logsDePedido.forEach((log) => {
          const pasillo = String(log.pasillo || "").replace("P-", "");
          const targetPos = AISLE_COORDINATES[pasillo];

          if (targetPos) {
            totalDistancia += calculateDistance(prevPos, targetPos);
            prevPos = targetPos; // Caminamos aqui
          }
        });
        // Retorno a base (opcional, pero realista)
        totalDistancia += calculateDistance(
          prevPos,
          AISLE_COORDINATES["default"],
        );
      });

      if (stats[pickerId]) {
        // Convertimos pixeles (unidades arbitrarias) a Metros Estimados
        // Factor: 100px aprox = 10 metros en bodegas pequeñas -> 1px = 0.1m
        stats[pickerId].distancia_recorrida_px = Math.round(
          totalDistancia * 0.1,
        );
      }
    });

    // 4. Calcular Métricas por Hora (Ritmo Circadiano - Global)
    // Inicializamos array de objetos con contador y set de pickers
    const hourlyStats = Array.from({ length: 24 }, () => ({
      count: 0,
      pickers: new Set(),
    }));

    asignaciones.forEach((a) => {
      // RECOMENDACIÓN: Usar 'fecha_inicio' para medir la DEMANDA/CARGA de trabajo real (Cuándo llegan los pedidos).
      // Si un pedido llega a las 11:59, cuenta como carga de las 11h, aunque se termine a las 12h.
      const fechaRef = a.fecha_inicio;

      if (fechaRef) {
        const date = dayjs(fechaRef).subtract(5, "hour"); // UTC-5
        const hour = date.hour(); // 0-23

        if (hour >= 0 && hour < 24) {
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
      pickers: Array.from(stat.pickers), // Convertimos Set a Array para el frontend
    }));

    // 5. Calcular Métricas Globales
    const total_pedidos_global = asignaciones.length;
    const total_items_global = Object.values(stats).reduce(
      (acc, curr) =>
        acc + curr.total_items_recolectados + curr.total_items_reportados,
      0,
    );
    const tiempo_total_global = Object.values(stats).reduce(
      (acc, curr) => acc + curr.tiempo_total_acumulado,
      0,
    );

    const globalStats = {
      total_pedidos: total_pedidos_global,
      total_recaudado: totalRecaudado,
      spi_promedio:
        total_items_global > 0
          ? Math.round(tiempo_total_global / total_items_global)
          : 0,
      tasa_exito_global:
        total_items_global > 0
          ? Math.round(
              (Object.values(stats).reduce(
                (acc, c) => acc + c.total_items_recolectados,
                0,
              ) /
                total_items_global) *
                100,
            )
          : 0,
    };

    // Calcular Métricas Derivadas KPI (Key Performance Indicators) por Picker
    const resultPickers = Object.values(stats)
      .map((s) => {
        const minutos_totales = s.tiempo_total_acumulado / 60 || 1;
        const total_acciones =
          s.total_items_recolectados + s.total_items_reportados;

        // Segundos por Item (SPI)
        const segundos_por_item =
          total_acciones > 0
            ? Math.round(s.tiempo_total_acumulado / total_acciones)
            : 0;

        // Tasa de Pedido Perfecto
        const tasa_pedido_perfecto =
          s.total_pedidos > 0
            ? Math.round((s.pedidos_perfectos / s.total_pedidos) * 100)
            : 0;

        // Motivo más frecuente de fallo
        const topMotivo = Object.entries(s.motivos_frecuentes).sort(
          (a, b) => b[1] - a[1],
        )[0];

        return {
          ...s,
          promedio_minutos_pedido: Math.round(
            minutos_totales / s.total_pedidos,
          ),
          segundos_por_item: segundos_por_item,
          velocidad_picking: parseFloat(
            (s.total_items_recolectados / minutos_totales).toFixed(2),
          ),
          tasa_precision:
            total_acciones > 0
              ? Math.round((s.total_items_recolectados / total_acciones) * 100)
              : 0,
          tasa_pedido_perfecto,
          motivo_comun_fallo: topMotivo
            ? `${topMotivo[0]} (${topMotivo[1]})`
            : "N/A",
        };
      })
      .sort((a, b) => b.tasa_pedido_perfecto - a.tasa_pedido_perfecto);

    // DEVOLVEMOS OBJETO COMPUESTO, NO SOLO ARRAY
    res.status(200).json({
      pickers: resultPickers,
      hourlyActivity,
      globalStats,
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
    let heatQuery = supabase
      .from("wc_log_picking")
      .select("nombre_producto, accion, motivo")
      .in("accion", ["retirado", "no_encontrado"])
      .order("fecha_registro", { ascending: false })
      .limit(2000);
    // Filtro Multi-Sede
    if (req.sedeId) {
      heatQuery = heatQuery.eq("sede_id", req.sedeId);
    }
    const { data: logs, error } = await heatQuery;

    if (error) throw error;

    const productMap = {};

    logs.forEach((log) => {
      const name = log.nombre_producto || "Desconocido";

      if (!productMap[name]) {
        productMap[name] = {
          name,
          total_removed: 0,
          motivos: {},
        };
      }

      productMap[name].total_removed += 1;
      const reason = log.motivo || "Sin motivo";
      productMap[name].motivos[reason] =
        (productMap[name].motivos[reason] || 0) + 1;
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
    let auditLogsQuery = supabase
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
      `,
      )
      .order("fecha_registro", { ascending: false })
      .limit(100);
    // Filtro Multi-Sede
    if (req.sedeId) {
      auditLogsQuery = auditLogsQuery.eq("sede_id", req.sedeId);
    }
    const { data: logs, error } = await auditLogsQuery;

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
        const startTime =
          new Date(primaryOrder.fecha_inicio).getTime() - 5 * 60 * 1000;
        const endTime =
          new Date(primaryOrder.fecha_fin).getTime() + 5 * 60 * 1000;

        const { data: concurrentOrders, error: coError } = await supabase
          .from("wc_asignaciones_pedidos")
          .select("id_pedido, fecha_inicio, fecha_fin")
          .eq("id_picker", id_picker)
          .eq("estado_asignacion", "completado")
          .gte("fecha_fin", new Date(startTime).toISOString())
          .lte("fecha_inicio", new Date(endTime).toISOString());

        if (!coError && concurrentOrders.length > 0) {
          pedidoIds = concurrentOrders.map((o) => o.id_pedido);
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

      pedidoIds = recentOrders ? recentOrders.map((o) => o.id_pedido) : [];
    }

    if (pedidoIds.length === 0) {
      return res.status(200).json({
        route: [],
        summary: [],
        regressions: [],
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 },
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
        route: [],
        summary: [],
        regressions: [],
        metrics: { total_pasillos_visitados: 0, total_time: 0, total_items: 0 },
      });
    }

    // Mapeo de colores para pedidos (hasta 5 colores distintos)
    // El frontend recibirá 'order_color_index'
    const uniqueOrders = [...new Set(logs.map((l) => l.id_pedido))];
    const orderColorMap = {};
    uniqueOrders.forEach((oid, idx) => (orderColorMap[oid] = idx));

    // Enriquecer logs con color index
    const enrichedLogs = logs.map((log) => ({
      ...log,
      order_color_index: orderColorMap[log.id_pedido],
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

    logs.forEach((log) => {
      const timestamp = new Date(log.fecha_registro);
      const pasillo = log.pasillo || "S/N";
      const orderId = log.id_pedido;

      // Romper segmento si: cambia pasillo O cambia pedido (para mostrar cambio de color)
      const isNewSegment =
        !currentSegment ||
        currentSegment.pasillo !== pasillo ||
        currentSegment.order_id !== orderId;

      if (isNewSegment) {
        if (currentSegment) {
          currentSegment.end_time = timestamp;
          currentSegment.duration_seconds = Math.round(
            (currentSegment.end_time - currentSegment.start_time) / 1000,
          );
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
          visit_order: routeSegments.length + 1,
        };
      }

      currentSegment.items++;
      currentSegment.products.push({
        name: log.nombre_producto,
        accion: log.accion,
        time: timestamp.toISOString(),
        order_id: log.id_pedido, // Para detalle
      });
      currentSegment.end_time = timestamp;
    });

    if (currentSegment) {
      currentSegment.duration_seconds = Math.round(
        (currentSegment.end_time - currentSegment.start_time) / 1000,
      );
      routeSegments.push(currentSegment);
    }

    // ... (Regresiones y Stats igual) ...
    // Detectar "regresiones"
    const pasilloVisits = {};
    routeSegments.forEach((seg) => {
      if (!pasilloVisits[seg.pasillo]) pasilloVisits[seg.pasillo] = [];
      pasilloVisits[seg.pasillo].push(seg.visit_order);
    });

    const regressions = [];
    Object.entries(pasilloVisits).forEach(([pasillo, visits]) => {
      if (visits.length > 1) {
        regressions.push({
          pasillo,
          visits: visits,
          message: `Regresó ${visits.length - 1} vez(es)`,
        });
      }
    });

    // Calcular estadísticas por pasillo
    const pasilloStats = {};
    routeSegments.forEach((seg) => {
      if (!pasilloStats[seg.pasillo]) {
        pasilloStats[seg.pasillo] = {
          pasillo: seg.pasillo,
          total_time: 0,
          total_items: 0,
          visits: 0,
        };
      }
      pasilloStats[seg.pasillo].total_time += seg.duration_seconds;
      pasilloStats[seg.pasillo].total_items += seg.items;
      pasilloStats[seg.pasillo].visits++;
    });

    const summary = Object.values(pasilloStats)
      .map((p) => ({
        ...p,
        avg_time_per_item:
          p.total_items > 0 ? Math.round(p.total_time / p.total_items) : 0,
        total_time_formatted: `${Math.floor(p.total_time / 60)}:${String(p.total_time % 60).padStart(2, "0")}`,
      }))
      .sort((a, b) => b.total_time - a.total_time);

    res.status(200).json({
      // Metadata extra para frontend
      session_info: {
        is_multipicker: uniqueOrders.length > 1,
        total_orders: uniqueOrders.length,
        order_ids: uniqueOrders,
        related_orders: relatedOrdersInfo,
      },
      route: routeSegments.map((s) => ({
        ...s,
        start_time: s.start_time.toISOString(),
        end_time: s.end_time.toISOString(),
      })),
      summary,
      regressions,
      raw_logs: enrichedLogs,
      metrics: {
        total_pasillos_visitados: Object.keys(pasilloStats).length,
        total_time: routeSegments.reduce(
          (acc, s) => acc + s.duration_seconds,
          0,
        ),
        total_items: logs.length,
      },
    });
  } catch (error) {
    console.error("Error en getPickerRoute:", error);
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 5. CENTRO DE INTELIGENCIA — Endpoint consolidado
// Devuelve financieros, operación, pickers, productos y tendencias
// en una sola respuesta coherente para el panel de admin.
// =========================================================

const COD_LABELS = {
  cash: "Efectivo",
  efectivo: "Efectivo",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  qr: "QR",
  datafono: "Datáfono",
  credito: "Crédito",
};

const PAY_LABELS = {
  efectivo: "Efectivo",
  credito: "Crédito",
  qr: "QR",
  datafono: "Datáfono",
};

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Resuelve método de pago: 
// 1. Prioridad: Lo registrado individualmente en wc_asignaciones_pedidos (Fase 4).
// 2. Fallback: Lo registrado en la sesión (modelo previo).
// 3. Fallback: Lo que venía en el snapshot de WooCommerce.
function resolvePaymentMethod(session, snapshotOrder, assignment = null) {
  // A. Si tenemos el dato de la asignación individual (Fase 4), es la fuente de verdad.
  if (assignment?.metodo_pago && PAY_LABELS[assignment.metodo_pago]) {
    return PAY_LABELS[assignment.metodo_pago];
  }
  // B. Fallback a la sesión (para sesiones antiguas o cierres globales).
  if (session?.metodo_pago && PAY_LABELS[session.metodo_pago] && session.metodo_pago !== 'mixto') {
    return PAY_LABELS[session.metodo_pago];
  }
  // C. Fallback al snapshot de WooCommerce.
  const meta = snapshotOrder?.meta_data;
  if (Array.isArray(meta)) {
    const cod = meta.find((m) => m.key === "_billing_cod_payment_mode");
    if (cod?.value) {
      const v = cod.value.toString().toLowerCase();
      return COD_LABELS[v] || cod.value;
    }
  }
  const title = (snapshotOrder?.payment_method_title || "")
    .toString()
    .toLowerCase();
  if (title === "card") return "Tarjeta";
  if (title === "cash") return "Efectivo";
  return snapshotOrder?.payment_method_title || "Otros";
}

// Suma el total real de un pedido a partir de datos_salida (post-picking).
function orderRevenue(order) {
  if (!order) return 0;
  const items = (order.items || order.line_items || []).filter(
    (i) => !i.is_shipping_method && !i.is_removed,
  );
  const itemsTotal = items.reduce((s, it) => {
    const qty = it.qty || it.count || it.quantity || 1;
    const price =
      parseFloat(it.line_total) ||
      parseFloat(it.price) ||
      parseFloat(it.catalog_price) ||
      0;
    return s + price * qty;
  }, 0);
  const shipping = (order.shipping_lines || []).reduce(
    (s, x) => s + (parseFloat(x.total) || 0),
    0,
  );
  const calc = itemsTotal + shipping;
  const wooTotal = parseFloat(order.total) || 0;
  if (Math.abs(calc - wooTotal) > 1 && calc > 0) return calc;
  return wooTotal > 0 ? wooTotal : calc;
}

// Convierte UTC a hora Colombia (UTC-5) sin dependencias extra.
function toBogota(d) {
  return dayjs(d).subtract(5, "hour");
}

function rangeBounds(range) {
  const now = dayjs();
  if (range === "today") return { start: now.startOf("day"), days: 1 };
  if (range === "30d") return { start: now.subtract(30, "day").startOf("day"), days: 30 };
  if (range === "all") return { start: null, days: null };
  return { start: now.subtract(7, "day").startOf("day"), days: 7 };
}

exports.getIntelligenceCenter = async (req, res) => {
  try {
    const { range = "7d" } = req.query;
    const { start, days } = rangeBounds(range);
    const sedeId = req.sedeId || null;

    // ---- 1. SESIONES (financieros + ritmo) ---------------------------------
    let sessQ = supabase
      .from("wc_picking_sessions")
      .select(
        "id, sede_id, id_picker, fecha_inicio, fecha_fin, fecha_pago, estado, metodo_pago, snapshot_pedidos, datos_salida, ids_pedidos, wc_sedes(nombre), wc_asignaciones_pedidos(id_pedido, metodo_pago, fecha_pago, pagado_por)",
      )
      .in("estado", ["finalizado", "auditado", "pendiente_auditoria"]);
    if (sedeId) sessQ = sessQ.eq("sede_id", sedeId);
    if (start) sessQ = sessQ.gte("fecha_fin", start.toISOString());

    const { data: sessions = [], error: sessErr } = await sessQ;
    if (sessErr) throw sessErr;

    // ---- 2. ASIGNACIONES (operación + pickers) -----------------------------
    let asigQ = supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id, id_picker, nombre_picker, id_pedido, tiempo_total_segundos, fecha_inicio, fecha_fin, sede_id",
      )
      .eq("estado_asignacion", "completado")
      .not("tiempo_total_segundos", "is", null);
    if (sedeId) asigQ = asigQ.eq("sede_id", sedeId);
    if (start) asigQ = asigQ.gte("fecha_fin", start.toISOString());

    const { data: asignaciones = [], error: asigErr } = await asigQ;
    if (asigErr) throw asigErr;

    // ---- 3. LOGS (acciones de picking) -------------------------------------
    const asigIds = asignaciones.map((a) => a.id);
    let logs = [];
    if (asigIds.length > 0) {
      const { data: logsData = [], error: logErr } = await supabase
        .from("wc_log_picking")
        .select("id_asignacion, accion, motivo, nombre_producto, id_pedido, fecha_registro")
        .in("id_asignacion", asigIds);
      if (logErr) throw logErr;
      logs = logsData;
    }

    // =======================================================================
    // FINANCIEROS
    // =======================================================================
    let totalRevenue = 0;
    let orderCount = 0;
    const revByMethod = new Map();
    const revBySede = new Map();
    const revByDay = new Map(); // "YYYY-MM-DD" → { revenue, orders }
    const revByWeekday = new Map(); // 0..6 → { revenue, orders }

    for (const sess of sessions) {
      const orders =
        sess.datos_salida?.orders ||
        sess.snapshot_pedidos ||
        sess.ids_pedidos?.map((id) => ({ id })) ||
        [];

      const dateRef = sess.fecha_pago || sess.fecha_fin || sess.fecha_inicio;
      const dBog = toBogota(dateRef);
      const dayKey = dBog.format("YYYY-MM-DD");
      const wd = dBog.day();
      const sedeName = sess.wc_sedes?.nombre || "Sin sede";

      // Mapear asignaciones por pedido para acceso rápido (Fase 4)
      const asignacionesByPedido = new Map(
        (sess.wc_asignaciones_pedidos || []).map((a) => [String(a.id_pedido), a]),
      );

      orders.forEach((order, idx) => {
        const orderId = String(order.id);
        const snapshot =
          (sess.snapshot_pedidos || []).find(
            (o) => String(o.id) === orderId,
          ) || sess.snapshot_pedidos?.[idx];
        
        const rev = orderRevenue(order) || orderRevenue(snapshot);
        if (rev <= 0) return;

        // Solo sumar a recaudación si REALMENTE tiene un método de pago confirmado
        const assignment = asignacionesByPedido.get(orderId);
        const method = resolvePaymentMethod(sess, snapshot || order, assignment);
        
        // Si está en 'auditado' pero no tiene método en la asignación ni en la sesión,
        // es un pedido que falta por cobrar. No lo sumamos a RECAUDACIÓN real.
        const isPaid = !!(assignment?.metodo_pago || (sess.metodo_pago && sess.metodo_pago !== 'mixto'));
        if (!isPaid && sess.estado === 'auditado') return;

        totalRevenue += rev;
        orderCount += 1;

        revByMethod.set(method, (revByMethod.get(method) || 0) + rev);

        revBySede.set(
          sedeName,
          (revBySede.get(sedeName) || 0) + rev,
        );

        const dayBucket = revByDay.get(dayKey) || { revenue: 0, orders: 0 };
        dayBucket.revenue += rev;
        dayBucket.orders += 1;
        revByDay.set(dayKey, dayBucket);

        const wdBucket = revByWeekday.get(wd) || { revenue: 0, orders: 0 };
        wdBucket.revenue += rev;
        wdBucket.orders += 1;
        revByWeekday.set(wd, wdBucket);
      });
    }

    const revenueByMethod = Array.from(revByMethod, ([name, value]) => ({
      name,
      value: Math.round(value),
    })).sort((a, b) => b.value - a.value);

    const revenueBySede = Array.from(revBySede, ([name, value]) => ({
      name,
      value: Math.round(value),
    })).sort((a, b) => b.value - a.value);

    // Serie temporal: rellenar días faltantes para que el área no tenga huecos
    const revenueTrend = [];
    if (days && days > 1) {
      for (let i = days - 1; i >= 0; i--) {
        const d = toBogota(dayjs().toISOString()).subtract(i, "day");
        const key = d.format("YYYY-MM-DD");
        const bucket = revByDay.get(key) || { revenue: 0, orders: 0 };
        revenueTrend.push({
          date: d.format("DD/MM"),
          dateKey: key,
          revenue: Math.round(bucket.revenue),
          orders: bucket.orders,
        });
      }
    } else {
      // 'today' o 'all': serializar lo que haya
      Array.from(revByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, b]) => {
          revenueTrend.push({
            date: dayjs(key).format("DD/MM"),
            dateKey: key,
            revenue: Math.round(b.revenue),
            orders: b.orders,
          });
        });
    }

    const weekdayActivity = WEEKDAY_LABELS.map((label, idx) => {
      const b = revByWeekday.get(idx) || { revenue: 0, orders: 0 };
      return {
        day: label,
        pedidos: b.orders,
        revenue: Math.round(b.revenue),
      };
    });

    // =======================================================================
    // OPERACIÓN + PICKERS
    // =======================================================================
    const pickerMap = new Map();
    const ordersWithIssues = new Set();
    const productIssues = new Map(); // nombre → { count, motivos }
    const topProducts = new Map(); // nombre → { qty, revenue }

    // Pre-clasificar logs por pedido
    logs.forEach((l) => {
      if (l.accion === "no_encontrado" || l.accion === "sustituido") {
        ordersWithIssues.add(l.id_pedido);
      }
      if (l.accion === "no_encontrado" || l.accion === "sustituido") {
        const name = l.nombre_producto || "Sin nombre";
        const entry = productIssues.get(name) || { count: 0, motivos: {} };
        entry.count += 1;
        const motivo = l.motivo || "Sin motivo";
        entry.motivos[motivo] = (entry.motivos[motivo] || 0) + 1;
        productIssues.set(name, entry);
      }
    });

    // Top productos vendidos (de sesiones finalizadas con datos_salida)
    sessions.forEach((sess) => {
      const orders = sess.datos_salida?.orders || [];
      orders.forEach((order) => {
        const items = (order.items || []).filter(
          (i) => !i.is_shipping_method && !i.is_removed,
        );
        items.forEach((it) => {
          const name = it.name || it.product_name || "Sin nombre";
          const qty = parseFloat(it.qty || it.count || it.quantity || 1);
          const price =
            parseFloat(it.line_total) ||
            parseFloat(it.price) ||
            parseFloat(it.catalog_price) ||
            0;
          const entry = topProducts.get(name) || { qty: 0, revenue: 0 };
          entry.qty += qty;
          entry.revenue += price * qty;
          topProducts.set(name, entry);
        });
      });
    });

    // Indexar logs por id_asignacion
    const logsByAsig = new Map();
    logs.forEach((l) => {
      const arr = logsByAsig.get(l.id_asignacion) || [];
      arr.push(l);
      logsByAsig.set(l.id_asignacion, arr);
    });

    asignaciones.forEach((a) => {
      const id = a.id_picker;
      if (!pickerMap.has(id)) {
        pickerMap.set(id, {
          id,
          nombre: a.nombre_picker || "Sin nombre",
          pedidos: 0,
          pedidos_perfectos: 0,
          tiempo_total_seg: 0,
          items_recolectados: 0,
          items_sustituidos: 0,
          items_no_encontrados: 0,
          motivos: {},
        });
      }
      const p = pickerMap.get(id);
      p.pedidos += 1;
      p.tiempo_total_seg += a.tiempo_total_segundos || 0;
      if (!ordersWithIssues.has(a.id_pedido)) p.pedidos_perfectos += 1;

      const aLogs = logsByAsig.get(a.id) || [];
      aLogs.forEach((l) => {
        if (l.accion === "recolectado") p.items_recolectados += 1;
        else if (l.accion === "sustituido") p.items_sustituidos += 1;
        else if (l.accion === "no_encontrado") p.items_no_encontrados += 1;
        if (l.motivo && (l.accion === "no_encontrado" || l.accion === "sustituido")) {
          p.motivos[l.motivo] = (p.motivos[l.motivo] || 0) + 1;
        }
      });
    });

    const pickers = Array.from(pickerMap.values())
      .map((p) => {
        const totalAcciones =
          p.items_recolectados + p.items_sustituidos + p.items_no_encontrados;
        const minutos = p.tiempo_total_seg / 60 || 1;
        const topMotivo = Object.entries(p.motivos).sort(
          (a, b) => b[1] - a[1],
        )[0];
        return {
          id: p.id,
          nombre: p.nombre,
          pedidos: p.pedidos,
          items_recolectados: p.items_recolectados,
          items_sustituidos: p.items_sustituidos,
          items_no_encontrados: p.items_no_encontrados,
          tiempo_promedio_min: Math.round(minutos / p.pedidos),
          segundos_por_item:
            totalAcciones > 0
              ? Math.round(p.tiempo_total_seg / totalAcciones)
              : 0,
          velocidad_items_min:
            minutos > 0
              ? parseFloat((p.items_recolectados / minutos).toFixed(2))
              : 0,
          tasa_precision:
            totalAcciones > 0
              ? Math.round((p.items_recolectados / totalAcciones) * 100)
              : 0,
          tasa_pedido_perfecto:
            p.pedidos > 0
              ? Math.round((p.pedidos_perfectos / p.pedidos) * 100)
              : 0,
          motivo_top: topMotivo ? `${topMotivo[0]} (${topMotivo[1]})` : null,
        };
      })
      .sort((a, b) => b.pedidos - a.pedidos);

    // =======================================================================
    // OPERACIÓN — agregados globales
    // =======================================================================
    const totalAcciones = pickers.reduce(
      (s, p) =>
        s + p.items_recolectados + p.items_sustituidos + p.items_no_encontrados,
      0,
    );
    const totalRecolectados = pickers.reduce(
      (s, p) => s + p.items_recolectados,
      0,
    );
    const totalSustituidos = pickers.reduce(
      (s, p) => s + p.items_sustituidos,
      0,
    );
    const totalNoEncontrados = pickers.reduce(
      (s, p) => s + p.items_no_encontrados,
      0,
    );
    const tiempoTotalSeg = asignaciones.reduce(
      (s, a) => s + (a.tiempo_total_segundos || 0),
      0,
    );
    const totalPedidosCompletos = asignaciones.length;
    const pedidosPerfectos = asignaciones.filter(
      (a) => !ordersWithIssues.has(a.id_pedido),
    ).length;

    const operations = {
      totalSessions: sessions.length,
      totalCompletedOrders: totalPedidosCompletos,
      avgSessionMin:
        totalPedidosCompletos > 0
          ? Math.round(tiempoTotalSeg / totalPedidosCompletos / 60)
          : 0,
      spiAverage:
        totalAcciones > 0 ? Math.round(tiempoTotalSeg / totalAcciones) : 0,
      avgItemsPerOrder:
        totalPedidosCompletos > 0
          ? Math.round(totalAcciones / totalPedidosCompletos)
          : 0,
      completionRate:
        totalAcciones > 0
          ? Math.round((totalRecolectados / totalAcciones) * 100)
          : 0,
      substitutionRate:
        totalAcciones > 0
          ? Math.round((totalSustituidos / totalAcciones) * 100)
          : 0,
      notFoundRate:
        totalAcciones > 0
          ? Math.round((totalNoEncontrados / totalAcciones) * 100)
          : 0,
      perfectOrderRate:
        totalPedidosCompletos > 0
          ? Math.round((pedidosPerfectos / totalPedidosCompletos) * 100)
          : 0,
    };

    // =======================================================================
    // RITMO POR HORA
    // =======================================================================
    const hourly = Array.from({ length: 24 }, () => 0);
    asignaciones.forEach((a) => {
      if (!a.fecha_inicio) return;
      const h = toBogota(a.fecha_inicio).hour();
      if (h >= 0 && h < 24) hourly[h] += 1;
    });
    const hourlyActivity = hourly.map((v, h) => ({
      hour: `${String(h).padStart(2, "0")}h`,
      pedidos: v,
    }));

    // =======================================================================
    // PRODUCTOS — top vendidos + problemas
    // =======================================================================
    const topSellingProducts = Array.from(topProducts, ([name, v]) => ({
      name,
      qty: Math.round(v.qty * 100) / 100,
      revenue: Math.round(v.revenue),
    }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const productIssuesArr = Array.from(productIssues, ([name, v]) => {
      const top = Object.entries(v.motivos).sort((a, b) => b[1] - a[1])[0];
      return {
        name,
        count: v.count,
        top_motivo: top ? top[0] : "Sin motivo",
      };
    })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // =======================================================================
    // RESPUESTA
    // =======================================================================
    res.status(200).json({
      rangeMeta: {
        range,
        days,
        from: start ? start.toISOString() : null,
        to: dayjs().toISOString(),
      },
      financials: {
        totalRevenue: Math.round(totalRevenue),
        orderCount,
        avgTicket: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
        revenueByMethod,
        revenueBySede,
        revenueTrend,
      },
      operations,
      pickers,
      hourlyActivity,
      weekdayActivity,
      topSellingProducts,
      productIssues: productIssuesArr,
    });
  } catch (error) {
    console.error("Error getIntelligenceCenter:", error);
    res.status(500).json({ error: error.message });
  }
};

// 7. Listado de Rutas Completadas (Historial para Selección)
exports.getCompletedRoutesList = async (req, res) => {
  try {
    let routesQuery = supabase
      .from("wc_asignaciones_pedidos")
      .select(
        "id, id_pedido, nombre_picker, id_picker, fecha_fin, tiempo_total_segundos",
      )
      .eq("estado_asignacion", "completado")
      .order("fecha_fin", { ascending: false })
      .limit(50);
    // Filtro Multi-Sede
    if (req.sedeId) {
      routesQuery = routesQuery.eq("sede_id", req.sedeId);
    }
    const { data: routes, error } = await routesQuery;

    if (error) throw error;

    res.status(200).json(routes);
  } catch (error) {
    console.error("Error en getCompletedRoutesList:", error);
    res.status(500).json({ error: error.message });
  }
};
