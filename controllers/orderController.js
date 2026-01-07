const WooCommerce = require("../services/wooService");

exports.getPendingOrders = async (req, res) => {
  try {
    const { data } = await WooCommerce.get("orders", {
      status: "processing", // Solo pedidos pendientes de recolección
      per_page: 20, // Traer los últimos 20
      order: "asc", // Los más viejos primero para despachar en orden
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: "Error al obtener pedidos de WooCommerce",
      details: error.response ? error.response.data : error.message,
    });
  }
};

exports.getOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: order } = await WooCommerce.get(`orders/${id}`);

    // Enriquecer con imágenes de productos
    const enrichedItems = await Promise.all(
      order.line_items.map(async (item) => {
        try {
          if (!item.product_id) return item;
          const { data: product } = await WooCommerce.get(
            `products/${item.product_id}`
          );
          const imageSrc =
            product.images && product.images.length > 0
              ? product.images[0].src
              : null;
          return { ...item, image_src: imageSrc };
        } catch (err) {
          // Si falla obtener el producto, devolvemos el item sin imagen
          return item;
        }
      })
    );

    order.line_items = enrichedItems;

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({
      error: "Error al obtener el pedido",
      details: error.response ? error.response.data : error.message,
    });
  }
};
