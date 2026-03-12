const express = require("express");
const router = express.Router();
const webhookCtrl = require("../controllers/webhookController");

// Health check (sin autenticación)
router.get("/health", webhookCtrl.webhookHealth);

// Receptor de Webhooks de WooCommerce
// NO usa sedeMiddleware porque WooCommerce no envía headers de sede
router.post("/woocommerce", webhookCtrl.handleWooWebhook);

module.exports = router;
