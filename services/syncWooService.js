const WooCommerce = require("./wooService");
const { supabase } = require("./supabaseClient");

/**
 * Función Principal: Sincroniza los cambios físicos hacia WooCommerce
 */
const syncOrderToWoo = async (sessionId, orderId) => {
  console.log(`🔄 [SYNC] Iniciando sincronización para Pedido #${orderId} (Sesión ${sessionId})`);

  try {
    // 1. Obtener el Pedido Original de Woo (Para tener precios base y IDs de línea)
    const { data: wooOrder } = await WooCommerce.get(`orders/${orderId}`);
    
    // 2. Obtener la Asignación interna (Para filtrar los logs correctos)
    const { data: assignment } = await supabase
        .from('wc_asignaciones_pedidos')
        .select('id')
        .eq('id_sesion', sessionId)
        .eq('id_pedido', orderId)
        .single();

    if (!assignment) throw new Error("No se encontró asignación para este pedido.");

    // 3. Obtener los Logs Reales (Lo que hizo el Picker)
    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select("*")
      .eq("id_asignacion", assignment.id)
      .order('fecha_registro', { ascending: true });

    // --- LÓGICA DE PROCESAMIENTO ---

    // Mapa de estado actual de cada producto solicitado
    // { product_id: { line_id, original_price, requested_qty, picked_qty, weight_total, ... } }
    const productMap = {};

    // A. Llenar con lo solicitado
    wooOrder.line_items.forEach(item => {
      productMap[item.product_id] = {
        line_id: item.id,
        name: item.name,
        original_price: parseFloat(item.price || 0), // Precio unitario (por unidad o por Kg)
        requested_qty: item.quantity,
        picked_qty: 0,
        weight_total: 0,
        is_fully_substituted: false
      };
    });

    // B. Procesar Logs para entender la realidad
    const itemsToAdd = []; // Lista de sustitutos para agregar

    logs.forEach(log => {
      // CASO: Recolección Normal (o con Peso Variable)
      if (log.accion === 'recolectado' && !log.es_sustituto) {
        if (productMap[log.id_producto]) {
          productMap[log.id_producto].picked_qty += 1;
          // Sumar peso si existe (Ej: 1.250 kg)
          if (log.peso_real && parseFloat(log.peso_real) > 0) {
            productMap[log.id_producto].weight_total += parseFloat(log.peso_real);
          }
        }
      }
      
      // CASO: Sustitución
      else if (log.accion === 'sustituido') {
        // Agregamos el nuevo producto a la lista de "Añadir"
        itemsToAdd.push({
          product_id: log.id_producto_final,
          qty: 1,
          price: parseFloat(log.precio_nuevo || 0) // Precio del sustituto
        });
        // Nota: No sumamos al picked_qty del original, por lo que el sistema sabrá que falta.
      }
      
      // CASO: No Encontrado (Short Pick)
      // No hacemos nada, el picked_qty se quedará menor al requested_qty
    });

    // --- EJECUCIÓN DE CAMBIOS EN WOOCOMMERCE ---

    // 4. Actualizar Líneas Existentes (Cantidades y Precios)
    for (const prodId in productMap) {
      const item = productMap[prodId];

      // A. LÓGICA PESO VARIABLE (Prioridad Alta)
      // Si se registró peso, ignoramos la cantidad unitaria para el cobro y usamos el peso total.
      if (item.weight_total > 0 && item.picked_qty > 0) {
        // Cálculo: Nuevo Total = Precio Base * Peso Total Real
        const nuevoTotal = (item.original_price * item.weight_total);
        
        console.log(`⚖️ [PESO] ${item.name}: ${item.weight_total}Kg -> $${nuevoTotal.toFixed(2)}`);
        
        // Actualizamos la línea en Woo
        await WooCommerce.put(`orders/${orderId}/line_items/${item.line_id}`, {
          quantity: item.picked_qty, // Mantenemos la cantidad de "paquetes/bolsas" físicas
          total: nuevoTotal.toString(),
          subtotal: nuevoTotal.toString(), // Base imponible
          meta_data: [
            { key: "Peso Real Facturado", value: `${item.weight_total} Kg` },
            { key: "_picking_adjusted", value: "true" }
          ]
        });
      }
      
      // B. LÓGICA SHORT PICK (Si no es peso variable)
      // Si pidió 4 y llevó 3, actualizamos cantidad.
      else if (item.picked_qty < item.requested_qty && item.picked_qty > 0) {
        console.log(`📉 [SHORT] ${item.name}: ${item.requested_qty} -> ${item.picked_qty}`);
        await WooCommerce.put(`orders/${orderId}/line_items/${item.line_id}`, {
          quantity: item.picked_qty
        });
      }

      // C. LÓGICA ELIMINACIÓN (Si la cantidad recolectada es 0)
      // Esto pasa si no se encontró nada o si todo fue sustituido
      else if (item.picked_qty === 0) {
        console.log(`🗑️ [DELETE] ${item.name}: Eliminando línea.`);
        await WooCommerce.delete(`orders/${orderId}/line_items/${item.line_id}`, { force: true });
      }
    }

    // 5. Agregar Sustitutos (Nuevas Líneas)
    // Agrupamos para no añadir 5 líneas de "Salsa Y", sino 1 línea x5
    const consolidatedSubs = {};
    itemsToAdd.forEach(sub => {
        if(!consolidatedSubs[sub.product_id]) consolidatedSubs[sub.product_id] = 0;
        consolidatedSubs[sub.product_id] += sub.qty;
    });

    for (const [subId, qty] of Object.entries(consolidatedSubs)) {
        console.log(`➕ [ADD] Sustituto ID ${subId} x${qty}`);
        // Woo calcula el precio y nombre automáticamente al agregar por ID
        await WooCommerce.post(`orders/${orderId}/line_items`, {
            product_id: parseInt(subId),
            quantity: qty
        });
    }

    // 6. Actualizar Estado del Pedido
    // Marcamos como "Completado" para cerrar el flujo
    await WooCommerce.put(`orders/${orderId}`, {
      status: 'completed',
      customer_note: `Pedido verificado y ajustado por Auditoría (Sesión ${sessionId.slice(0,6)}).`
    });

    console.log(`✅ [OK] Pedido #${orderId} sincronizado exitosamente.`);
    return true;

  } catch (error) {
    console.error(`❌ [ERROR] Falló sync pedido #${orderId}:`, error.message);
    return false;
  }
};

module.exports = { syncOrderToWoo };