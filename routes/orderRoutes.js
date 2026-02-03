const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

// --- Rutas de Gestión (Admin) ---
router.get("/pendientes", orderController.getPendingOrders);
router.get("/pickers", orderController.getPickers);

// --- Rutas de Sesión (Multi-orden) ---
router.post("/crear-sesion", orderController.createPickingSession); 

// --- Rutas del Picker (App Móvil) ---
router.get("/sesion-activa", orderController.getSessionActive);
router.get("/buscar-producto", orderController.searchProduct);
router.post("/registrar-accion", orderController.registerAction);
router.post("/finalizar-sesion", orderController.completeSession);

// NUEVA: Validar código manual contra SIESA
router.post("/validar-codigo", orderController.validateManualCode);

module.exports = router;