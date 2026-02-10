// --- HELPER: Agrupar items de múltiples pedidos (Batch Picking) ---
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    if (!order || !order.line_items) return;

    order.line_items.forEach((item) => {
      const key = item.product_id;

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
          is_removed: false 
        };
      }

      // Si el item tiene la marca de eliminado en el snapshot, marcamos el grupo
      if (item.is_removed) {
          mapaProductos[key].is_removed = true;
      }

      // Solo sumamos si NO está eliminado administrativamente
      if (!item.is_removed) {
          mapaProductos[key].quantity_total += item.quantity;
          mapaProductos[key].pedidos_involucrados.push({
            id_pedido: order.id,
            nombre_cliente: order.billing ? `${order.billing.first_name} ${order.billing.last_name}` : "Cliente",
            cantidad: item.quantity,
          });
      }
    });
  });

  return Object.values(mapaProductos);
};

module.exports = { agruparItemsParaPicking };