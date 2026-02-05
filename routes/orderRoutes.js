const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");

// ==========================================
// RUTAS DE GESTIÓN (ADMINISTRADOR)
// ==========================================

// Obtener pedidos pendientes de asignar
router.get("/pendientes", orderController.getPendingOrders);

// Obtener lista de usuarios con rol 'picker' y su estado
router.get("/pickers", orderController.getPickers);

// Obtener datos para el Super Dashboard en Tiempo Real
router.get("/dashboard-activo", orderController.getActiveSessionsDashboard);

// --- NUEVO: AUDITORÍA Y HISTORIAL ---
router.get("/historial", orderController.getHistorySessions);
router.get("/historial-detalle", orderController.getSessionLogsDetail);

// ==========================================
// RUTAS DE SESIÓN (BATCH PICKING)
// ==========================================

// Crear una sesión agrupando varios pedidos
router.post("/crear-sesion", orderController.createPickingSession); 

// ==========================================
// RUTAS DEL PICKER (APP MÓVIL)
// ==========================================

// Obtener la sesión actual del picker (Lista de ruta)
router.get("/sesion-activa", orderController.getSessionActive);

// Buscador Inteligente (Sugerencias y Manual)
router.get("/buscar-producto", orderController.searchProduct);

// Registrar acciones (Recolectar, Sustituir, Deshacer/Reset)
router.post("/registrar-accion", orderController.registerAction);

// Finalizar la sesión completa
router.post("/finalizar-sesion", orderController.completeSession);

// Validar código de barras manual (SIESA)
router.post("/validar-codigo", orderController.validateManualCode);

module.exports = router;