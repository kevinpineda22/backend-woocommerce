const { getWooClient } = require("./wooMultiService");
const { supabase } = require("./supabaseClient");

/**
 * Función Principal: Sincroniza los cambios físicos hacia WooCommerce.
 * Usa un SOLO PUT /orders/{id} con todas las modificaciones de line_items
 * en batch, que es la forma correcta de la API REST de WooCommerce v3.
 */
const syncOrderToWoo = async (sessionId, orderId) => {
  console.log(
    `🔄 [SYNC] Iniciando sincronización para Pedido #${orderId} (Sesión ${sessionId})`,
  );

  let activeClient;

  try {
    // 1. Obtener la Asignación interna (Para filtrar los logs correctos y obtener sede)
    const { data: assignment } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, sede_id")
      .eq("id_sesion", sessionId)
      .eq("id_pedido", orderId)
      .single();

    if (!assignment)
      throw new Error("No se encontró asignación para este pedido.");

    // 2. Instanciar Cliente WooCommerce Dinámico según Sede
    activeClient = await getWooClient(assignment.sede_id);

    // 3. Obtener el Pedido Original de Woo (Para tener precios base y IDs de línea)
    const { data: wooOrder } = await activeClient.get(`orders/${orderId}`);

    // 4. Obtener los Logs Reales (Lo que hizo el Picker)
    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select("*")
      .eq("id_asignacion", assignment.id)
      .order("fecha_registro", { ascending: true });

    // --- LÓGICA DE PROCESAMIENTO --- //
    const productMap = {};

    // A. Llenar con lo solicitado
    wooOrder.line_items.forEach((item) => {
      productMap[item.product_id] = {
        line_id: item.id,
        name: item.name,
        original_price: parseFloat(item.price || 0),
        requested_qty: item.quantity,
        picked_qty: 0,
        weight_total: 0,
      };
    });

    // B. Procesar Logs para entender la realidad
    const itemsToAdd = [];

    logs.forEach((log) => {
      if (log.accion === "recolectado" && !log.es_sustituto) {
        if (productMap[log.id_producto]) {
          productMap[log.id_producto].picked_qty += 1;
          if (log.peso_real && parseFloat(log.peso_real) > 0) {
            productMap[log.id_producto].weight_total += parseFloat(
              log.peso_real,
            );
          }
        }
      } else if (log.accion === "sustituido") {
        itemsToAdd.push({
          product_id: log.id_producto_final,
          qty: 1,
          price: parseFloat(log.precio_nuevo || 0),
        });
      }
    });

    // CONSTRUIR EL PAYLOAD BATCH
    const lineItemsPayload = [];

    // 4. Líneas Existentes (Actualizar o Eliminar)
    for (const prodId in productMap) {
      const item = productMap[prodId];

      if (item.weight_total > 0 && item.picked_qty > 0) {
        const nuevoTotal = item.original_price * item.weight_total;
        console.log(
          `⚖️ [PESO] ${item.name}: ${item.weight_total}Kg -> $${nuevoTotal.toFixed(2)}`,
        );

        lineItemsPayload.push({
          id: item.line_id,
          quantity: item.picked_qty,
          total: nuevoTotal.toFixed(2),
          subtotal: nuevoTotal.toFixed(2),
          meta_data: [
            { key: "Peso Real Facturado", value: `${item.weight_total} Kg` },
            { key: "_picking_adjusted", value: "true" },
          ],
        });
      } else if (item.picked_qty < item.requested_qty && item.picked_qty > 0) {
        console.log(
          `📉 [SHORT] ${item.name}: ${item.requested_qty} -> ${item.picked_qty}`,
        );
        lineItemsPayload.push({
          id: item.line_id,
          quantity: item.picked_qty,
        });
      } else if (item.picked_qty === 0) {
        console.log(`🗑️ [DELETE] ${item.name}: Eliminando línea.`);
        lineItemsPayload.push({
          id: item.line_id,
          quantity: 0,
        });
      }
    }

    // 5. Agregar Sustitutos
    const consolidatedSubs = {};
    itemsToAdd.forEach((sub) => {
      if (!consolidatedSubs[sub.product_id]) {
        consolidatedSubs[sub.product_id] = { qty: 0, price: sub.price };
      }
      consolidatedSubs[sub.product_id].qty += sub.qty;
    });

    for (const [subId, info] of Object.entries(consolidatedSubs)) {
      console.log(`➕ [ADD] Sustituto ID ${subId} x${info.qty}`);
      lineItemsPayload.push({
        product_id: parseInt(subId),
        quantity: info.qty,
      });
    }

    // 6. EJECUTAR PUT
    const updatePayload = {
      status: "completed",
    };

    if (lineItemsPayload.length > 0) {
      updatePayload.line_items = lineItemsPayload;
    }

    console.log(
      `📦 [SYNC] Enviando ${lineItemsPayload.length} cambios de líneas + status=completed para Pedido #${orderId}`,
    );
    await activeClient.put(`orders/${orderId}`, updatePayload);

    console.log(`✅ [OK] Pedido #${orderId} sincronizado exitosamente.`);
    return true;
  } catch (error) {
    console.error(
      `❌ [ERROR] Falló sync completo para pedido #${orderId}:`,
      error.message,
    );

    // FALLBACK
    try {
      if (activeClient) {
        console.log(
          `🔁 [FALLBACK] Intentando marcar solo status=completed para Pedido #${orderId}...`,
        );
        await activeClient.put(`orders/${orderId}`, {
          status: "completed",
        });
        console.log(
          `⚠️ [FALLBACK OK] Pedido #${orderId} marcado como completed (sin ajustes de líneas).`,
        );
        return true;
      }
    } catch (fallbackError) {
      console.error(
        `❌ [FALLBACK ERROR] No se pudo cambiar estado del pedido #${orderId}:`,
        fallbackError.message,
      );
    }
    return false;
  }
};

module.exports = { syncOrderToWoo };
