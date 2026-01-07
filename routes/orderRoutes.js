const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Esta será la ruta: GET /api/orders/pendientes
router.get('/pendientes', orderController.getPendingOrders);

module.exports = router;