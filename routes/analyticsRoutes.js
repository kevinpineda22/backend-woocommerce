const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");

router.get("/performance", analyticsController.getCollectorPerformance);
router.get("/heatmap", analyticsController.getProductHeatmap);
router.get("/audit", analyticsController.getAuditLogs);

module.exports = router;
