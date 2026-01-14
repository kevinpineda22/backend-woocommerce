// src/data/masterRoutes.js

import { patch } from "@mui/material";

// Esta es la FUENTE DE VERDAD de todas las rutas disponibles en la aplicación.
// DEBES POBLAR ESTA LISTA con todas las rutas que usabas en tu antiguo credenciales.js.

const masterRoutes = [
  // === ADMINISTRACIÓN & Desarrollo ===
  {
    path: "/adminusuarios",
    label: "Administración de Usuarios",
    group: "Desarrollo",
  },
  {
    path: "/monitorActividad",
    label: "Monitor de Actividades",
    group: "Desarrollo",
  },
  {
    path: "/solicitud-desarrollo",
    label: "Solicitud de Desarrollo",
    group: "Desarrollo",
  },
  {
    path: "/admin-desarrollo",
    label: "Administrador Desarrollo",
    group: "Desarrollo",
  },
  {
    path: "/admin-direcciones",
    label: "Admin Direcciones",
    group: "Desarrollo",
  },
  {
    path: "/desarrollo-compras",
    label: "Desarrollo Compras",
    group: "Integraciones con Siesa",
  },
  {
    path: "/admin-promociones",
    label: "Admin Promociones",
    group: "Desarrollo",
  },
  {
    path: "/desarrollo-domicilios",
    label: "Desarrollo inventarios-ventas",
    group: "Desarrollo",
  },
  {
    path: "/desarrollo-surtido",
    label: "Surtido Móvil",
    group: "Integraciones con Siesa",
  },
  {
    path: "/siesa-sync",
    label: "Sincronizar Siesa → Supabase",
    group: "Integraciones con Siesa",
  },
  {
    path: "/admin-vacantes",
    label: "Admin Vacantes",
    group: "GH",
  },

  // === GESTIÓN HUMANA (GH) ===
  { path: "/solicitudaprobacion", label: "Perfil gestión humana", group: "GH" },
  { path: "/gestionEntrevistas", label: "Gestión de Entrevistas", group: "GH" },
  {
    path: "/programador-horarios",
    label: "Programador de Horarios",
    group: "GH",
  },
  {
    path: "/sociodemografico",
    label: "Formulario Sociodemográfico",
    group: "GH",
  },
  {
    path: "/historialformulario",
    label: "Historial Sociodemográfico",
    group: "GH",
  },
  {
    path: "/dashboardpostulaciones",
    label: "Dashboard Postulaciones",
    group: "GH",
  },
  {
    path: "/dashboardsociodemografico",
    label: "Dashboard Sociodemográfico",
    group: "GH",
  },

  // === CONTRATACIÓN VIRTUAL ===
  {
    path: "/adminContratacion",
    label: "Admin Contratación Virtual",
    group: "CONTRATACIÓN VIRTUAL",
  },
  {
    path: "/postulacionesTable",
    label: "Base de datos Postulaciones",
    group: "CONTRATACIÓN VIRTUAL",
  },
  {
    path: "/panelNotificacionesGH",
    label: "Panel Examenes Medicos",
    group: "CONTRATACIÓN VIRTUAL",
  },

  // === ECOMMERCE ===
  {
    path: "/ecommerce/pedidos",
    label: "Gestión Pedidos",
    group: "Ecommerce",
  },
  {
    path: "/ecommerce/recolectora",
    label: "Vista Recolectora",
    group: "Ecommerce",
  },
  {
    path: "/ecommerce/analitica",
    label: "Centro de Inteligencia",
    group: "Ecommerce",
  },
  {
    path: "/ecommerce/gestion-recolectoras",
    label: "Gestión Recolectoras",
    group: "Ecommerce",
  },
  {
    path: "/panelGHDocumentos",
    label: "Panel Documentacion",
    group: "CONTRATACIÓN VIRTUAL",
  },
  {
    path: "/formularioSolicitudPersonal",
    label: "Solicitud de Personal",
    group: "CONTRATACIÓN VIRTUAL",
  },

  // === CONTABILIDAD ===
  { path: "/gastos", label: "Gestión de Gastos", group: "Contabilidad" },
  {
    path: "/historialgastos",
    label: "Historial de Gastos",
    group: "Contabilidad",
  },
  {
    path: "/historialcartera",
    label: "Historial Cartera",
    group: "Contabilidad",
  },
  {
    path: "/dashboardGastos",
    label: "Dashboard Gastos",
    group: "Contabilidad",
  },
  // --- RUTAS DE TRAZABILIDAD (Actualizadas y Nuevas) ---
  {
    path: "/trazabilidad/crear-empleado",
    label: "Crear Empleado", // Etiqueta actualizada de "(Cont.)" a ""
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/crear-proveedor",
    label: "Crear Proveedor", // Etiqueta actualizada de "(Cont.)" a ""
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/crear-cliente", // Ruta nueva
    label: "Crear Cliente",
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/admin", // Ruta nueva
    label: "Gestión Documental",
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/gestion-tokens",
    label: "Gestión de Tokens",
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/aprobaciones",
    label: "Panel de Aprobaciones",
    group: "Contabilidad",
  },
  {
    path: "/trazabilidad/panel",
    label: "Admin Trazabilidad",
    group: "Contabilidad",
  },

  // --- FIN RUTAS CONTABILIDAD ---

  // === LOGÍSTICA & OPERACIONES ===
  {
    path: "/automatizacion",
    label: "Reposiciones Fruver",
    group: "Operaciones",
  },
  { path: "/transporte", label: "Gestión de Transporte", group: "Operaciones" },
  {
    path: "/historialtransporte",
    label: "Historial de Transporte",
    group: "Operaciones",
  },
  {
    path: "/dashboardtransporte",
    label: "Dashboard Transporte",
    group: "Operaciones",
  },

  // === INVENTARIO ===
  { path: "/operario", label: "Inventario Operario", group: "Inventario" },
  {
    path: "/administradorInventario",
    label: "Administrador Inventario",
    group: "Inventario",
  },
  {
    path: "/admin-inventarios-generales",
    label: "Admin Inventarios Generales",
    group: "Inventario",
  },
  {
    path: "/empleado-inventarios-generales",
    label: "Empleado Inventarios Generales",
    group: "Inventario",
  },

  // === MANTENIMIENTO ===
  {
    path: "/mantenimiento",
    label: "Mantenimiento General",
    group: "Mantenimiento",
  },
  { path: "/lider-sst", label: "Mantenimiento Tareas", group: "Mantenimiento" },

  // === DOTACIÓN ===
  { path: "/adminDotacion", label: "Admin Dotación", group: "Dotación" },
  { path: "/empleadodotacion", label: "Empleado Dotación", group: "Dotación" },
  {
    path: "/FormularioDotacion",
    label: "Formulario Dotación",
    group: "Dotación",
  }, // Esta estaba en el base, pero no en el nuevo. Se mantiene.

  // === VARIOS ===
  { path: "/salones", label: "Reserva de Salones", group: "Varios" },
  { path: "/dashboards", label: "Dashboards Generales", group: "Varios" },
];

export default masterRoutes;
