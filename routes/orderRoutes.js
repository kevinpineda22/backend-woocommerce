const express = require('express');
const router = express.Router();

// Importar Controladores
const sessionCtrl = require('../controllers/sessionController');
const actionCtrl = require('../controllers/actionController');
const productCtrl = require('../controllers/productController');
const dashboardCtrl = require('../controllers/dashboardController');
const adminCtrl = require('../controllers/adminController');

// Rutas de Sesión
router.post('/crear-sesion', sessionCtrl.createPickingSession);
router.get('/sesion-activa', sessionCtrl.getSessionActive);
router.post('/finalizar-sesion', sessionCtrl.completeSession);
router.post('/cancelar-asignacion', sessionCtrl.cancelAssignment);

// Rutas de Acción
router.post('/registrar-accion', actionCtrl.registerAction);
router.post('/validar-codigo', actionCtrl.validateManualCode);

// Rutas de Producto
router.get('/buscar-producto', productCtrl.searchProduct);

// Rutas Dashboard/Admin
router.get('/dashboard-activo', dashboardCtrl.getActiveSessionsDashboard);
router.get('/pendientes', dashboardCtrl.getPendingOrders);
router.get('/pickers', dashboardCtrl.getPickers);
router.get('/historial', dashboardCtrl.getHistorySessions);
router.get('/historial-detalle', dashboardCtrl.getSessionLogsDetail);

// Rutas de Gestión
router.post('/admin-remove-item', adminCtrl.removeItemFromSession);

module.exports = router;