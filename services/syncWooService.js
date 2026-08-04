const { getWooClient } = require("./wooMultiService");
const { supabase } = require("./supabaseClient");
const { classifyWeighable } = require("../utils/manifestPricing");

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

    // 4b. Anulaciones del admin — se consultan a nivel de SESIÓN, no de pedido.
    // `removeItemFromSession` marca el producto como retirado en TODOS los
    // pedidos del snapshot pero deja un único log colgado de una asignación
    // cualquiera, así que filtrar por `assignment.id` lo perdería en el resto
    // de los pedidos de la sesión.
    const { data: sessionAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", sessionId);

    const { data: adminRemovals } = await supabase
      .from("wc_log_picking")
      .select("id_producto")
      .in("id_asignacion", (sessionAssignments || []).map((a) => a.id))
      .eq("accion", "eliminado_admin");

    // --- LÓGICA DE PROCESAMIENTO --- //
    const productMap = {};

    // A. Llenar con lo solicitado
    // ✅ FIX: Usar variation_id como key cuando existe (los logs de picking usan variation_id como id_producto)
    // Mantener también un mapa de product_id → effectiveKey para fallback
    const pidToKey = {};
    wooOrder.line_items.forEach((item) => {
      const effectiveKey = item.variation_id || item.product_id;
      productMap[effectiveKey] = {
        line_id: item.id,
        name: item.name,
        sku: item.sku || "",
        original_price: parseFloat(item.price || 0),
        requested_qty: item.quantity,
        picked_qty: 0,
        subbed_qty: 0,
        notfound_qty: 0,
        removed_by_admin: false,
        weight_total: 0,
      };
      // Mapa inverso: si el log trae product_id padre, también lo encontramos
      pidToKey[item.product_id] = effectiveKey;
      if (item.variation_id) pidToKey[item.variation_id] = effectiveKey;
    });

    // B. Procesar Logs para entender la realidad
    const itemsToAdd = [];

    // ✅ Resuelve la línea de Woo a la que pertenece un log (directo o vía variación)
    const resolveKey = (logProdId) =>
      productMap[logProdId] ? logProdId : pidToKey[logProdId] || null;

    logs.forEach((log) => {
      const key = resolveKey(log.id_producto);

      if (log.accion === "recolectado" && !log.es_sustituto) {
        if (key && productMap[key]) {
          productMap[key].picked_qty += 1;
          if (log.peso_real && parseFloat(log.peso_real) > 0) {
            productMap[key].weight_total += parseFloat(log.peso_real);
          }
        }
      } else if (log.accion === "sustituido") {
        itemsToAdd.push({
          product_id: log.id_producto_final,
          qty: 1,
          price: parseFloat(log.precio_nuevo || 0),
        });
        // La unidad sustituida SÍ sale de la línea original (se agrega como línea nueva)
        if (key && productMap[key]) productMap[key].subbed_qty += 1;
      } else if (log.accion === "no_encontrado") {
        if (key && productMap[key]) productMap[key].notfound_qty += 1;
      }
    });

    // Marcar las líneas anuladas por el admin (log a nivel de sesión)
    (adminRemovals || []).forEach((r) => {
      const key = resolveKey(r.id_producto);
      if (key && productMap[key]) productMap[key].removed_by_admin = true;
    });

    // CONSTRUIR EL PAYLOAD BATCH
    const lineItemsPayload = [];

    // 4. Líneas Existentes (Actualizar, Eliminar o dejar en $0)
    //
    // 📌 REGLA DE NEGOCIO — ítems NO ENCONTRADOS:
    // La línea NO se borra del pedido de WooCommerce: sigue visible con su
    // cantidad original para que el cliente vea qué pidió, pero se cobra solo
    // lo que se entregó de verdad (`picked_qty × precio`) y se marca con un meta
    // "NO ENTREGADO". Si no se encontró ninguna unidad el cobro queda en $0.
    // Así el total de Woo coincide con el manifiesto, que solo suma lo
    // recolectado y lo sustituido.
    // La línea solo desaparece cuando la unidad salió de verdad del pedido:
    // sustitución total (se agrega la línea del sustituto) o retiro del admin.
    for (const prodId in productMap) {
      const item = productMap[prodId];

      const targetQty = item.removed_by_admin
        ? 0
        : Math.max(0, item.requested_qty - item.subbed_qty);

      if (item.weight_total > 0 && item.picked_qty > 0) {
        // ✅ FIX: respetar la convención de unidad (igual que la caja POS).
        // LB / LIBRA / 500GR → el price es por MEDIA libra → cobro = price × 2 × peso.
        // KL / KG / KILO (o desconocido) → cobro = price × peso.
        // Clasificación centralizada en manifestPricing (SKU es la fuente de verdad).
        const kind = classifyWeighable({ sku: item.sku });
        const factor = kind === "half" ? 2 : 1;
        const nuevoTotal = item.original_price * factor * item.weight_total;
        console.log(
          `⚖️ [PESO] ${item.name} (${item.sku || "?"}, ${kind || "kg?"}): ${item.weight_total}Kg × $${item.original_price} × ${factor} -> $${nuevoTotal.toFixed(2)}`,
        );

        const metaPeso = [
          { key: "Peso Real Facturado", value: `${item.weight_total} Kg` },
          { key: "_picking_adjusted", value: "true" },
        ];
        // Pesable con unidades faltantes: se factura solo el peso realmente
        // pesado, así que el faltante ya queda sin cobro. Se deja constancia.
        if (item.notfound_qty > 0) {
          metaPeso.unshift({
            key: "NO ENTREGADO",
            value: `${item.notfound_qty} de ${item.requested_qty} sin existencias`,
          });
        }

        lineItemsPayload.push({
          id: item.line_id,
          quantity: item.picked_qty,
          total: nuevoTotal.toFixed(2),
          subtotal: nuevoTotal.toFixed(2),
          meta_data: metaPeso,
        });
      } else if (targetQty === 0) {
        // Sustitución total o retiro del admin → la línea sale del pedido
        console.log(
          `🗑️ [DELETE] ${item.name}: Eliminando línea (sustituidas=${item.subbed_qty}, retiro_admin=${item.removed_by_admin}).`,
        );
        lineItemsPayload.push({
          id: item.line_id,
          quantity: 0,
        });
      } else if (item.notfound_qty > 0) {
        // 🚫 NO ENTREGADO: la línea se queda en el pedido pero solo se cobra lo
        // que se entregó. Sin unidades recolectadas el cobro es $0.
        const cobro = item.original_price * item.picked_qty;
        console.log(
          `🚫 [NO-ENTREGADO] ${item.name}: ${item.notfound_qty}/${item.requested_qty} sin existencias — se cobran ${item.picked_qty} un. -> $${cobro.toFixed(2)}`,
        );
        lineItemsPayload.push({
          id: item.line_id,
          quantity: targetQty,
          total: cobro.toFixed(2),
          subtotal: cobro.toFixed(2),
          meta_data: [
            {
              key: "NO ENTREGADO",
              value: `${item.notfound_qty} de ${item.requested_qty} sin existencias`,
            },
            { key: "_picking_adjusted", value: "true" },
          ],
        });
      } else if (targetQty !== item.requested_qty) {
        // Sustitución parcial → solo se descuentan las unidades sustituidas
        console.log(
          `📉 [SUB-PARCIAL] ${item.name}: ${item.requested_qty} -> ${targetQty}`,
        );
        lineItemsPayload.push({
          id: item.line_id,
          quantity: targetQty,
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
