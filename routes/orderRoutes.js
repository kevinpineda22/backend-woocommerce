const express = require("express");
const router = express.Router();

// Importar Controladores
const sessionCtrl = require("../controllers/sessionController");
const actionCtrl = require("../controllers/actionController");
const productCtrl = require("../controllers/productController");
const dashboardCtrl = require("../controllers/dashboardController");
const adminCtrl = require("../controllers/adminController");
const sedeCtrl = require("../controllers/sedeController");

// Middleware Multi-Sede (se aplica a TODAS las rutas de este router)
const { sedeMiddleware } = require("../middleware/sedeMiddleware");
router.use(sedeMiddleware);

// =====================================
// Rutas de Gestión de SEDES
// =====================================
router.get("/sedes", sedeCtrl.listSedes);
router.get("/sedes/stats", sedeCtrl.getSedesStats);
router.post("/sedes", sedeCtrl.createSede);
router.put("/sedes/:id", sedeCtrl.updateSede);
router.delete("/sedes/:id", sedeCtrl.deactivateSede);
router.post("/sedes/asignar-picker", sedeCtrl.assignPickerToSede);
router.post("/sedes/asignar-usuario", sedeCtrl.assignUserToSede);
router.get("/sedes/diagnosticar-pedido/:id", sedeCtrl.diagnosticarSedePedido);

// Rutas de Sesión
router.post("/crear-sesion", sessionCtrl.createPickingSession);
router.get("/sesion-activa", sessionCtrl.getSessionActive);
router.post("/finalizar-sesion", sessionCtrl.completeSession);
router.post("/cancelar-asignacion", sessionCtrl.cancelAssignment);

// Rutas de Acción
router.post("/registrar-accion", actionCtrl.registerAction);
router.post("/validar-codigo", actionCtrl.validateManualCode);
router.post("/validar-codigo-siesa", actionCtrl.validateCodeWithSiesa);
router.post("/validar-codigo-auditor", actionCtrl.validateCodeForAuditor);
router.post("/load-barcodes-audit", actionCtrl.loadBarcodesForAudit);

// Rutas de Producto
router.get("/buscar-producto", productCtrl.searchProduct);
router.get("/producto/base-ean-fruver/:sku", productCtrl.getBaseEanFruver);

// Rutas Dashboard/Admin
router.get("/dashboard-activo", dashboardCtrl.getActiveSessionsDashboard);
router.get("/pendientes", dashboardCtrl.getPendingOrders);
router.get("/pickers", dashboardCtrl.getPickers);
router.get("/pendientes-pago", dashboardCtrl.getPendingPaymentSessions);
router.post("/marcar-pagado", dashboardCtrl.markSessionAsPaid);
router.get("/historial", dashboardCtrl.getHistorySessions);
router.get("/pendientes-auditoria", dashboardCtrl.getPendingAuditSessions);

router.get("/historial-detalle", dashboardCtrl.getSessionLogsDetail);
router.post("/auditor/finalizar", dashboardCtrl.completeAuditSession);

// Rutas de Gestión
router.post("/admin-remove-item", adminCtrl.removeItemFromSession);
router.post("/admin-restore-item", adminCtrl.restoreItemToSession);
router.post("/admin-force-pick", adminCtrl.forcePickItemToSession);

// Ruta temporal para espiar metadatos (mejorada con detección de sede)
router.get("/espiar-pedido/:id", dashboardCtrl.espiarPedido);
// Diagnóstico: listar pedidos recientes de WooCommerce
router.get("/diagnostico-woo", dashboardCtrl.diagnosticoWoo);
module.exports = router;
