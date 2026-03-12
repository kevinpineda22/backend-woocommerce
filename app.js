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

// Para webhooks: capturar rawBody (necesario para verificar firma HMAC)
app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.startsWith("/api/webhooks")) {
        req.rawBody = buf.toString("utf8");
      }
    },
  }),
);

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
