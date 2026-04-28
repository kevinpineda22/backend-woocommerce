const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const variacionesController = require("../controllers/variacionesController");
const { sedeMiddleware } = require("../middleware/sedeMiddleware");

// Middleware Multi-Sede
router.use(sedeMiddleware);

router.get("/intelligence", analyticsController.getIntelligenceCenter);
router.get("/performance", analyticsController.getCollectorPerformance);
router.get("/heatmap", analyticsController.getProductHeatmap);
router.get("/audit", analyticsController.getAuditLogs);
router.get("/route", analyticsController.getPickerRoute);
router.get("/routes-history", analyticsController.getCompletedRoutesList);
router.get("/variaciones", variacionesController.getVariaciones);

module.exports = router;
