// --- HELPER: Agrupar items de múltiples pedidos (Batch Picking) ---
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    if (!order || !order.line_items) return;

    // Detectar si el pedido entero es de Recogida en Local
    const isPickup = order.shipping_lines?.some(ship => ship.method_id === 'local_pickup');

    order.line_items.forEach((item) => {
      const key = item.product_id;

      // ✅ 1. EXTRAER NOTA DEL CLIENTE
      const noteMeta = item.meta_data?.find(m => m.key === '_wcfx_item_note' || m.key === 'Nota de preparación');
      const itemNote = noteMeta ? noteMeta.value : null;

      // ✅ 2. EXTRAER UNIDAD DE MEDIDA (Ej: Kl, Lb)
      const unitMeta = item.meta_data?.find(m => m.key === 'pa_unidad-de-medida-aproximado');
      const unitMeasure = unitMeta ? unitMeta.display_value : null;

      if (!mapaProductos[key]) {
        mapaProductos[key] = {
          id: item.id,
          product_id: item.product_id,
          name: item.name,
          sku: item.sku,
          image_src: item.image?.src || "",
          price: parseFloat(item.price || 0),
          quantity_total: 0,
          pedidos_involucrados: [],
          categorias: item.parent_name ? [{ name: item.parent_name }] : [],
          barcode: item.meta_data?.find((m) =>
              ["ean", "barcode", "_ean", "_barcode"].includes(m.key.toLowerCase())
            )?.value || "",
          is_removed: false,
          notas_cliente: [], // 📝 Array para guardar las notas
          unidad_medida: unitMeasure // ⚖️ Ej: 'Kl'
        };
      }

      if (item.is_removed) {
          mapaProductos[key].is_removed = true;
      }

      if (!item.is_removed) {
          mapaProductos[key].quantity_total += item.quantity;
          
          // Agregamos info de recogida al badge del pedido
          mapaProductos[key].pedidos_involucrados.push({
            id_pedido: order.id,
            nombre_cliente: order.billing ? `${order.billing.first_name} ${order.billing.last_name}` : "Cliente",
            cantidad: item.quantity,
            is_pickup: isPickup 
          });

          // Si hay nota, la guardamos indicando de qué pedido es
          if (itemNote) {
              mapaProductos[key].notas_cliente.push(`Pedido #${order.id}: ${itemNote}`);
          }
      }
    });
  });

  return Object.values(mapaProductos);
};

module.exports = { agruparItemsParaPicking };