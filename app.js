const express = require("express");
const cors = require("cors");
require("dotenv").config();

const orderRoutes = require("./routes/orderRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();

// Esto permite que cualquier dominio (incluyendo tu web de React en producción)
// consuma los datos de los pedidos.
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/orders", orderRoutes);
app.use("/api/analytics", analyticsRoutes);

// Ruta de prueba para saber que el backend vive
app.get("/", (req, res) => res.send("Backend del Supermercado Funcionando 🛒"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});
