const express = require('express');
const cors = require('cors');
require('dotenv').config();

const orderRoutes = require('./routes/orderRoutes');

const app = express();

app.use(cors()); // Permite que tu React se conecte sin errores de CORS
app.use(express.json());

// Rutas
app.use('/api/orders', orderRoutes);

// Ruta de prueba para saber que el backend vive
app.get('/', (req, res) => res.send('Backend del Supermercado Funcionando 🛒'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});