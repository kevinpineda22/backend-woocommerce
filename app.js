const express = require("express");
const cors = require("cors");
require("dotenv").config();

const orderRoutes = require("./routes/orderRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const webhookRoutes = require("./routes/webhookRoutes");

const app = express();

// Esto permite que cualquier dominio (incluyendo tu web de React en producción)
// consuma los datos de los pedidos.
app.use(cors());

// Webhooks: capturar raw body ANTES del parse para verificación HMAC.
// En Vercel, express.raw() garantiza acceso al payload original byte a byte.
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    // Guardar el buffer crudo antes de parsear
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString("utf8");
      req.body = JSON.parse(req.rawBody);
    }
    next();
  },
);

// JSON parser para todo lo demás
app.use(express.json());

// Rutas
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/webhooks", webhookRoutes);

// Ruta de prueba para saber que el backend vive
app.get("/", (req, res) => res.send("Backend del Supermercado Funcionando 🛒"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
