const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.get("/pendientes", orderController.getPendingOrders);
router.get("/historial", orderController.getHistory); // <--- NUEVA RUTA
router.get("/recolectoras", orderController.getRecolectoras);
router.post("/asignar", orderController.assignOrder);
router.post("/cancelar-asignacion", orderController.cancelAssignment); // <--- NUEVA RUTA
router.post("/finalizar-recoleccion", orderController.completeCollection);
router.get("/:id", orderController.getOrderById);

module.exports = router;
