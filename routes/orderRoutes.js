const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

router.get("/pendientes", orderController.getPendingOrders);
router.get("/historial", orderController.getHistory); 
router.get("/pickers", orderController.getPickers);
router.post("/asignar", orderController.assignOrder);
router.post("/update-progress", orderController.updateProgress); 
router.post("/cancelar-asignacion", orderController.cancelAssignment);
router.post("/finalizar-picking", orderController.completePicking);
router.get("/:id", orderController.getOrderById);

module.exports = router;