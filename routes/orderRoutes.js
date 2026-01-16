const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.get("/pendientes", orderController.getPendingOrders);
router.get("/historial", orderController.getHistory); // <--- NUEVA RUTA
router.get("/pickers", orderController.getPickers);
router.post("/asignar", orderController.assignOrder);
router.post("/progreso", orderController.updateProgress); // <--- NUEVA RUTA DE PROGRESO
router.post("/cancelar-asignacion", orderController.cancelAssignment); // <--- NUEVA RUTA
router.post("/finalizar-picking", orderController.completePicking);
router.get("/:id", orderController.getOrderById);

module.exports = router;
