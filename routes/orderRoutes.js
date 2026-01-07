const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

// Esta será la ruta: GET /api/orders/pendientes
router.get("/pendientes", orderController.getPendingOrders);

// Ruta para obtener detalle de un pedido (con imágenes)
router.get("/:id", orderController.getOrderById);

module.exports = router;
