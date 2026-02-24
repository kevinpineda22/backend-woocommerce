const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");
const { syncOrderToWoo } = require("../services/syncWooService");

// =========================================================
// HELPER: Obtener códigos de barras desde SIESA
// =========================================================
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    // Agrupar por producto y filtrar códigos válidos
    const barcodesByProduct = {};
    barcodes.forEach((bc) => {
      if (!barcodesByProduct[bc.f120_id]) {
        barcodesByProduct[bc.f120_id] = [];
      }
      barcodesByProduct[bc.f120_id].push(bc.codigo_barras);
    });

    // Seleccionar el mejor código de barras por producto
    const barcodeMap = {};
    Object.keys(barcodesByProduct).forEach((productId) => {
      const codes = barcodesByProduct[productId];

      // Limpiar y filtrar códigos válidos:
      // 1. Preservar '+' del final (algunos productos SIESA lo necesitan en POS)
      // 2. Eliminar códigos que empiecen con 'M' o 'N'
      // 3. Aceptar códigos numéricos puros o numéricos con '+' al final
      const validCodes = codes
        .map((code) => (code || "").toString().trim())
        .filter((cleaned) => {
          if (!cleaned || cleaned.replace(/\+$/, "").length < 8) return false;
          if (
            cleaned.toUpperCase().startsWith("M") ||
            cleaned.toUpperCase().startsWith("N")
          )
            return false;
          // Aceptar dígitos con '+' opcional al final
          return /^\d+\+?$/.test(cleaned);
        });

      // Priorizar EAN-13 (parte numérica = 13 dígitos), luego cualquier código válido
      const ean13 = validCodes.find((c) => c.replace(/\+$/, "").length === 13);
      const firstValid = validCodes[0];

      barcodeMap[productId] = ean13 || firstValid || null;
    });

    return barcodeMap;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

// =========================================================
// 1. DASHBOARD EN VIVO (CÁLCULO EXACTO & REALTIME)
// =========================================================
exports.getActiveSessionsDashboard = async (req, res) => {
  // Evitar caching en Vercel/Navegador para datos en tiempo real
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    // 1. Obtener sesiones en proceso
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, id_picker, ids_pedidos, snapshot_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "en_proceso");

    if (error) throw error;

    const dashboardData = await Promise.all(
      sessions.map(async (sess) => {
        // A. Obtener Pedidos (Snapshot o Woo)
        let orders =
          sess.snapshot_pedidos && sess.snapshot_pedidos.length > 0
            ? sess.snapshot_pedidos
            : (
                await Promise.all(
                  sess.ids_pedidos.map((id) => WooCommerce.get(`orders/${id}`)),
                )
              ).map((r) => r.data);

        // B. Calcular Universo de Items (Líneas únicas)
        const itemsUnificados = agruparItemsParaPicking(orders);
        const activeItems = itemsUnificados.filter((i) => !i.is_removed);
        const totalItems = activeItems.length; // Total de tarjetas/líneas

        // C. Obtener Logs de ESTA sesión (Vía Asignaciones)
        const { data: assignments } = await supabase
          .from("wc_asignaciones_pedidos")
          .select("id")
          .eq("id_sesion", sess.id);
        const assignIds = assignments.map((a) => a.id);

        const { data: logs } = await supabase
          .from("wc_log_picking")
          .select(
            "id_producto, id_producto_original, accion, es_sustituto, fecha_registro, nombre_producto, pasillo",
          )
          .in("id_asignacion", assignIds);

        // D. Matemática de Progreso (Item por Item)
        let completedLines = 0;
        let subLines = 0;

        activeItems.forEach((item) => {
          // Filtramos logs que pertenecen a este item (Original o Sustituto)
          const itemLogs = logs.filter(
            (l) =>
              String(l.id_producto) === String(item.product_id) ||
              String(l.id_producto_original) === String(item.product_id),
          );

          // Cantidad requerida vs Cantidad procesada (Scan + Sustitución + No Encontrado)
          const qtyRequired = item.quantity_total;
          // Filtramos solo las acciones definitivas (recolectado, sustituido, no_encontrado)
          // 'reset' NO cuenta porque borra el registro, así que no aparecerá aquí.
          const validLogs = itemLogs.filter((l) =>
            ["recolectado", "sustituido", "no_encontrado"].includes(l.accion),
          );
          const qtyProcessed = validLogs.length;

          // ¿Línea Completa? (Solo si procesó TODO lo requerido)
          if (qtyProcessed >= qtyRequired) {
            completedLines++;
            // ¿Hubo sustitución en alguna unidad?
            if (itemLogs.some((l) => l.es_sustituto)) {
              subLines++;
            }
          }
        });

        // Porcentaje basado en LÍNEAS terminadas
        const percentage =
          totalItems > 0 ? Math.round((completedLines / totalItems) * 100) : 0;

        // Ubicación Actual (Último movimiento)
        let currentLocation = "Inicio";
        if (logs.length > 0) {
          const lastLog = logs.sort(
            (a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro),
          )[0];
          if (lastLog.pasillo) currentLocation = `Pasillo ${lastLog.pasillo}`;
          else currentLocation = "En Ruta";
        }

        return {
          session_id: sess.id,
          picker_id: sess.id_picker,
          picker_name: sess.wc_pickers?.nombre_completo || "Desconocido",
          start_time: sess.fecha_inicio,

          total_items: totalItems, // Total de productos distintos
          completed_items: completedLines, // Productos completados al 100%
          substituted_items: subLines, // Productos con cambios

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

// =========================================================
// 2. PEDIDOS PENDIENTES
// =========================================================
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

// =========================================================
// 3. LISTADO DE PICKERS
// =========================================================
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

// =========================================================
// 4. HISTORIAL DE SESIONES
// =========================================================
exports.getPendingPaymentSessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "auditado")
      .order("fecha_fin", { ascending: false });

    if (error) throw error;

    const pendingData = sessions.map((sess) => {
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
    res.status(200).json(pendingData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.markSessionAsPaid = async (req, res) => {
  const { session_id } = req.body;
  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const { error } = await supabase
      .from("wc_picking_sessions")
      .update({ estado: "finalizado" })
      .eq("id", session_id);

    if (error) throw error;

    res.status(200).json({ message: "Sesión marcada como pagada/finalizada." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHistorySessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .in("estado", ["finalizado"])
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

// =========================================================
// 4B. PENDIENTES DE AUDITORIA
// =========================================================
exports.getPendingAuditSessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "pendiente_auditoria")
      .order("fecha_fin", { ascending: false })
      .limit(100);

    if (error) throw error;

    const pendingData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = sess.fecha_fin ? new Date(sess.fecha_fin) : null;
      const durationMin = end
        ? Math.round((end - start) / 60000)
        : Math.round((Date.now() - start.getTime()) / 60000);
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
        fecha: end ? end.toLocaleDateString("es-CO", optionsDate) : "--",
        hora_fin: end ? end.toLocaleTimeString("es-CO", optionsTime) : "--",
        duracion: `${durationMin} min`,
        estado: sess.estado,
      };
    });
    res.status(200).json(pendingData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 5. FINALIZAR AUDITORÍA (APROBAR SALIDA)
// =========================================================
exports.completeAuditSession = async (req, res) => {
  const { session_id, datos_salida } = req.body;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const now = new Date().toISOString();

    const { data: session, error: getSessError } = await supabase
      .from("wc_picking_sessions")
      .select("id_picker, ids_pedidos, resumen_metricas")
      .eq("id", session_id)
      .single();

    if (getSessError) throw getSessError;

    // Actualizar métricas y estado
    const currentMetrics = session.resumen_metricas || {};
    const updatedMetrics = { ...currentMetrics, fecha_fin_auditoria: now };

    const updatePayload = {
      estado: "auditado", // ✅ Estado final luego de auditoria
      resumen_metricas: updatedMetrics,
    };
    if (datos_salida) updatePayload.datos_salida = datos_salida;

    const { error: sessError } = await supabase
      .from("wc_picking_sessions")
      .update(updatePayload)
      .eq("id", session_id);
    if (sessError) throw sessError;

    // Liberar Picker
    if (session && session.id_picker) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", session.id_picker);
    }

    // Log de Sistema
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", session_id)
      .limit(1);

    // ✅ Actualizar estado de asignaciones también a 'completado'
    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "completado", fecha_fin: now })
      .eq("id_sesion", session_id);
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

    // Sync Woo (Background)
    if (session.ids_pedidos && session.ids_pedidos.length > 0) {
      (async () => {
        for (const orderId of session.ids_pedidos) {
          try {
            console.log(`🚀 Iniciando Sync para Orden #${orderId}...`);
            await syncOrderToWoo(session_id, orderId);
          } catch (err) {
            console.error(`❌ Error sync orden ${orderId}:`, err);
          }
        }
      })();
    }

    res.status(200).json({
      message: "Salida aprobada. Snapshot guardado y Picker liberado.",
    });
  } catch (error) {
    console.error("Error finalizando auditoría:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 6. CONSULTA DETALLADA (AUDITOR & HISTORIAL)
// =========================================================
exports.getSessionLogsDetail = async (req, res) => {
  let { session_id } = req.query;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    // Detección ID Corto
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
          phone: o.billing?.phone,
          email: o.billing?.email,
          billing: o.billing,
          shipping: o.shipping,
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

    // ✅ OBTENER CÓDIGOS DE BARRAS DESDE SIESA (por SKU, no por product_id)
    const skuList = Array.from(
      new Set(
        Object.values(productDetailsMap)
          .map((p) => p.sku)
          .filter(Boolean)
          .map((sku) => parseInt(sku))
          .filter((sku) => !isNaN(sku)),
      ),
    );

    console.log(
      `🔍 Buscando códigos de barras para ${skuList.length} SKUs:`,
      skuList,
    );
    const barcodeMapBySku = await getBarcodesFromSiesa(skuList);
    console.log(`📦 Códigos encontrados:`, Object.keys(barcodeMapBySku).length);

    // Agregar códigos de barras al productDetailsMap (mapear de SKU a product_id)
    Object.keys(productDetailsMap).forEach((productId) => {
      const sku = productDetailsMap[productId].sku;
      const skuAsNumber = parseInt(sku);
      const barcode = barcodeMapBySku[skuAsNumber];

      if (barcode) {
        productDetailsMap[productId].barcode = barcode;
        console.log(
          `✅ Producto ${productId} (SKU ${sku}): código = ${barcode}`,
        );
      } else {
        console.log(
          `⚠️ Producto ${productId} (SKU ${sku}): sin código válido en SIESA`,
        );
      }
    });

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

// =========================================================
// RUTA TEMPORAL PARA ESPIAR METADATOS DE WOOCOMMERCE
// =========================================================
exports.espiarPedido = async (req, res) => {
  try {
    const orderId = req.params.id;
    // Llamamos directamente a WooCommerce
    const { data: order } = await WooCommerce.get(`orders/${orderId}`);

    // Devolvemos el pedido completo para que lo veas en el navegador
    res.status(200).json({
      mensaje: "Aquí están los datos crudos del pedido",
      line_items: order.line_items,
      shipping_lines: order.shipping_lines,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
