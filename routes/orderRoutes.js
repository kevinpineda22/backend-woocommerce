const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.get("/pendientes", orderController.getPendingOrders);
router.get("/recolectoras", orderController.getRecolectoras); // Nueva
router.post("/asignar", orderController.assignOrder); // Nueva
router.post("/finalizar-recoleccion", orderController.completeCollection); // Nueva
router.get("/:id", orderController.getOrderById);

module.exports = router;
