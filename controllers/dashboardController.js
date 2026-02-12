const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");
const { syncOrderToWoo } = require("../services/syncWooService");

// --- 1. DASHBOARD EN VIVO (CORREGIDO PARA TIEMPO REAL) ---
exports.getActiveSessionsDashboard = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, id_picker, ids_pedidos, snapshot_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "en_proceso");

    if (error) throw error;

    const dashboardData = await Promise.all(
      sessions.map(async (sess) => {
        let orders =
          sess.snapshot_pedidos && sess.snapshot_pedidos.length > 0
            ? sess.snapshot_pedidos
            : (
                await Promise.all(
                  sess.ids_pedidos.map((id) => WooCommerce.get(`orders/${id}`)),
                )
              ).map((r) => r.data);

        const itemsUnificados = agruparItemsParaPicking(orders);
        const activeItems = itemsUnificados.filter((i) => !i.is_removed);
        const totalItems = activeItems.length;

        // ✅ CORRECCIÓN TIEMPO REAL: Filtrar por IDs de asignación, no por fecha genérica
        const { data: assignments } = await supabase
          .from("wc_asignaciones_pedidos")
          .select("id")
          .eq("id_sesion", sess.id);
        const assignIds = assignments.map((a) => a.id);

        const { data: logs } = await supabase
          .from("wc_log_picking")
          .select(
            "id_producto, accion, es_sustituto, fecha_registro, nombre_producto, pasillo",
          )
          .in("id_asignacion", assignIds); // Esto asegura que traemos SOLO lo de esta sesión

        // AGRUPAR LOGS POR PRODUCTO PARA EVITAR CONTEO DOBLE
        const logsPorProducto = logs.reduce((acc, log) => {
          if (!acc[log.id_producto]) acc[log.id_producto] = [];
          acc[log.id_producto].push(log);
          return acc;
        }, {});

        // CALCULAR METRICAS BASADAS EN ITEMS ÚNICOS PROCESADOS (SOLO COMPLETADOS REALES)
        let itemsProcesados = 0;
        let itemsConSustituto = 0;

        Object.values(logsPorProducto).forEach((productLogs) => {
          // Verificamos qué tipo de acciones tiene
          const tieneSustituto = productLogs.some((l) => l.es_sustituto);
          const tieneRecolectado = productLogs.some(
            (l) => l.accion === "recolectado" && !l.es_sustituto,
          );

          // SOLO contamos como procesado si efectivamente se recolectó o sustituyó
          if (tieneSustituto) {
            itemsConSustituto++;
            itemsProcesados++;
          } else if (tieneRecolectado) {
            itemsProcesados++;
          }
          // Si solo tiene "no_encontrado" pero NO se resolvió, NO cuenta como procesado
        });

        // En la interfaz:
        // "Listos" = itemsProcesados - itemsConSustituto ( = itemsRecolectadosOriginales)
        // "Cambios" = itemsConSustituto
        // "Faltan" = totalItems - itemsProcesados

        const completados = itemsProcesados;
        const sustituidos = itemsConSustituto;
        const percentage =
          totalItems > 0 ? Math.round((completados / totalItems) * 100) : 0;

        let currentLocation = "Inicio";
        if (logs.length > 0) {
          const lastLog = logs.sort(
            (a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro),
          )[0];
          // Usamos el pasillo que ya guardamos en base de datos
          if (lastLog.pasillo) currentLocation = `Pasillo ${lastLog.pasillo}`;
          else currentLocation = "En Ruta";
        }

        return {
          session_id: sess.id,
          picker_id: sess.id_picker,
          picker_name: sess.wc_pickers?.nombre_completo || "Desconocido",
          start_time: sess.fecha_inicio,
          total_items: totalItems,
          completed_items: completados,
          substituted_items: sustituidos,
          progress: percentage,
          current_location: currentLocation,
          orders_count: sess.ids_pedidos.length,
          order_ids: sess.ids_pedidos,
        };
      }),
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 2. PEDIDOS PENDIENTES ---
exports.getPendingOrders = async (req, res) => {
  try {
    const { data: wcOrders } = await WooCommerce.get("orders", {
      status: "processing",
      per_page: 50,
    });
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido")
      .eq("estado_asignacion", "en_proceso");
    const assignedIds = new Set(activeAssignments.map((a) => a.id_pedido));
    const cleanOrders = wcOrders.map((order) => ({
      ...order,
      is_assigned: assignedIds.has(order.id),
    }));
    res.status(200).json(cleanOrders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// --- 3. PICKERS ---
exports.getPickers = async (req, res) => {
  const { email } = req.query;
  let query = supabase
    .from("wc_pickers")
    .select("*")
    .order("nombre_completo", { ascending: true });
  if (email) query = query.eq("email", email);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
};

// --- 4. HISTORIAL ---
exports.getHistorySessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .in("estado", ["completado", "auditado"])
      .order("fecha_fin", { ascending: false })
      .limit(50);

    if (error) throw error;

    const historyData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = new Date(sess.fecha_fin);
      const durationMin = Math.round((end - start) / 60000);
      const optionsDate = {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const optionsTime = {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        pedidos: sess.ids_pedidos,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(historyData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// --- 5. FINALIZAR AUDITORÍA (CON SNAPSHOT Y SYNC OFF) ---
exports.completeAuditSession = async (req, res) => {
  const { session_id, datos_salida } = req.body;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const now = new Date().toISOString();

    const { data: session, error: getSessError } = await supabase
      .from("wc_picking_sessions")
      .select("id_picker, ids_pedidos")
      .eq("id", session_id)
      .single();

    if (getSessError) throw getSessError;

    const updatePayload = {
      estado: "auditado",
      fecha_fin_auditoria: now,
    };
    if (datos_salida) updatePayload.datos_salida = datos_salida;

    const { error: sessError } = await supabase
      .from("wc_picking_sessions")
      .update(updatePayload)
      .eq("id", session_id);
    if (sessError) throw sessError;

    if (session && session.id_picker) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", session.id_picker);
    }

    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", session_id)
      .limit(1);
    if (assignments && assignments.length > 0) {
      await supabase.from("wc_log_picking").insert([
        {
          id_asignacion: assignments[0].id,
          id_pedido: assignments[0].id_pedido,
          id_producto: 0,
          accion: "auditoria_finalizada",
          motivo: "Salida Autorizada - Snapshot Guardado",
          fecha_registro: now,
          nombre_producto: "--- PROCESO FINALIZADO ---",
        },
      ]);
    }

    // if (session.ids_pedidos && session.ids_pedidos.length > 0) {
    //     (async () => {
    //         for (const orderId of session.ids_pedidos) {
    //             await syncOrderToWoo(session_id, orderId);
    //         }
    //     })();
    // }

    res
      .status(200)
      .json({
        message: "Salida aprobada. Snapshot guardado y Picker liberado.",
      });
  } catch (error) {
    console.error("Error finalizando auditoría:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// --- 6. CONSULTA DETALLADA PARA AUDITOR ---
exports.getSessionLogsDetail = async (req, res) => {
  let { session_id } = req.query;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    if (session_id.length < 30) {
      const { data: recents } = await supabase
        .from("wc_picking_sessions")
        .select("id")
        .order("fecha_inicio", { ascending: false })
        .limit(100);
      const match = recents.find((s) => s.id.startsWith(session_id));
      if (!match)
        return res
          .status(404)
          .json({ error: "Sesión no encontrada (ID Corto)." });
      session_id = match.id;
    }

    const { data: sessionInfo, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, wc_pickers!wc_picking_sessions_picker_fkey(nombre_completo, email)`,
      )
      .eq("id", session_id)
      .single();

    if (sessError || !sessionInfo)
      throw new Error("Error obteniendo info de la sesión");

    let ordersData = [];
    let productDetailsMap = {};

    const processOrderData = (orderList) => {
      return orderList.map((o) => {
        if (o.line_items) {
          o.line_items.forEach((item) => {
            const imgUrl =
              item.image?.src ||
              (item.image && item.image.length > 0 ? item.image[0].src : null);
            productDetailsMap[item.product_id] = {
              image: imgUrl,
              sku: item.sku,
            };
            if (item.variation_id)
              productDetailsMap[item.variation_id] = {
                image: imgUrl,
                sku: item.sku,
              };
          });
        }
        return {
          id: o.id,
          customer:
            (o.billing?.first_name + " " + o.billing?.last_name).trim() ||
            "Cliente",
          total_items:
            o.line_items?.reduce((acc, i) => acc + i.quantity, 0) || 0,
        };
      });
    };

    if (
      sessionInfo.snapshot_pedidos &&
      sessionInfo.snapshot_pedidos.length > 0
    ) {
      ordersData = processOrderData(sessionInfo.snapshot_pedidos);
    } else {
      try {
        const wooProms = sessionInfo.ids_pedidos.map((id) =>
          WooCommerce.get(`orders/${id}`),
        );
        const wooRes = await Promise.all(wooProms);
        ordersData = processOrderData(wooRes.map((r) => r.data));
      } catch (e) {
        ordersData = sessionInfo.ids_pedidos.map((id) => ({
          id,
          customer: "#" + id,
          total_items: 0,
        }));
      }
    }

    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", session_id);
    const assignIds = assignments.map((a) => a.id);

    let logs = [];
    if (assignIds.length > 0) {
      const { data: ls, error: logError } = await supabase
        .from("wc_log_picking")
        .select("*, wc_asignaciones_pedidos(nombre_picker)")
        .in("id_asignacion", assignIds)
        .order("fecha_registro", { ascending: true });

      if (logError) throw logError;
      logs = ls;

      try {
        const missingIds = new Set();
        logs.forEach((l) => {
          if (
            l.es_sustituto &&
            l.id_producto_final &&
            !productDetailsMap[l.id_producto_final]
          ) {
            missingIds.add(l.id_producto_final);
          }
        });
        if (missingIds.size > 0) {
          const { data: subProds } = await WooCommerce.get(
            `products?include=${Array.from(missingIds).join(",")}&per_page=100`,
          );
          if (subProds) {
            subProds.forEach((p) => {
              productDetailsMap[p.id] = { image: p.images[0]?.src, sku: p.sku };
            });
          }
        }
      } catch (e) {}
    }

    res.status(200).json({
      metadata: {
        session_id: sessionInfo.id,
        picker_name: sessionInfo.wc_pickers?.nombre_completo || "Sin Asignar",
        start_time: sessionInfo.fecha_inicio,
        end_time: sessionInfo.fecha_fin,
        status: sessionInfo.estado,
        total_orders: sessionInfo.ids_pedidos.length,
      },
      orders_info: ordersData,
      products_map: productDetailsMap,
      logs: logs,
      final_snapshot: sessionInfo.datos_salida || null,
    });
  } catch (error) {
    console.error("Error Auditoría Detalle:", error.message);
    if (error.code === "22P02")
      return res.status(400).json({ error: "Formato de ID inválido." });
    res.status(500).json({ error: error.message });
  }
};
