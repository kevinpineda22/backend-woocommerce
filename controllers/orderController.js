const WooCommerce = require('../services/wooService');

exports.getPendingOrders = async (req, res) => {
  try {
    const { data } = await WooCommerce.get("orders", {
      status: "processing", // Solo pedidos pendientes de recolección
      per_page: 20,         // Traer los últimos 20
      order: "asc"          // Los más viejos primero para despachar en orden
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ 
      error: "Error al obtener pedidos de WooCommerce",
      details: error.response ? error.response.data : error.message 
    });
  }
};