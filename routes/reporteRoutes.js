const express = require("express");
const router = express.Router();
const reporteController = require("../controllers/reporteController");

// Sin sedeMiddleware: el reporte cubre todas las sedes.
router.get("/no-encontrados", reporteController.reporteNoEncontrados);

module.exports = router;
