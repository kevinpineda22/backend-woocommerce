const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");

router.get("/performance", analyticsController.getCollectorPerformance);
router.get("/heatmap", analyticsController.getProductHeatmap);
router.get("/audit", analyticsController.getAuditLogs);
router.get("/route", analyticsController.getPickerRoute); // [NEW]
router.get("/routes-history", analyticsController.getCompletedRoutesList); // [NEW] Listado de rutas

module.exports = router;
