import React, { lazy, Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import RutaProtegida from "../components/RutaProtegida.jsx";
import ErrorPage from "../pages/ErrorPage.jsx";

// =============================================================================
// HELPER: LAZY LOADING
// =============================================================================
const LazyLoad = (Component) => (
  <Suspense fallback={null}>
    <Component />
  </Suspense>
);

// =============================================================================
// IMPORTACIÓN DE COMPONENTES (Agrupados por Módulo)
// =============================================================================

// --- PÁGINAS PÚBLICAS Y GENERALES ---
const Home = lazy(() =>
  import("../pages/Home").then((m) => ({ default: m.Home })),
);
const Login = lazy(() =>
  import("../pages/admin/Login").then((m) => ({ default: m.Login })),
);
const ReestablecerContraseña = lazy(() =>
  import("../pages/admin/ReestablecerContraseña").then((m) => ({
    default: m.ReestablecerContraseña,
  })),
);
const Contribucion = lazy(() =>
  import("../pages/Contribucion").then((m) => ({ default: m.Contribucion })),
);
const Promociones = lazy(() =>
  import("../pages/promociones/Promociones").then((m) => ({
    default: m.Promociones,
  })),
);
const AprobarRechazar = lazy(() =>
  import("../pages/flujo_gastos/AprobarRechazar.jsx").then((m) => ({
    default: m.AprobarRechazar,
  })),
);

// --- LEGAL ---
const Politicas = lazy(() =>
  import("../pages/legal/Politicas").then((m) => ({ default: m.Politicas })),
);
const Condiciones = lazy(() =>
  import("../pages/legal/Condiciones").then((m) => ({
    default: m.Condiciones,
  })),
);
const DeclaracionFondos = lazy(() =>
  import("../pages/legal/DeclaracionFondos").then((m) => ({
    default: m.DeclaracionFondos,
  })),
);
const NotificacionesElectronicas = lazy(
  () => import("../pages/legal/NotificacionesElectronicas"),
);

// --- TALENTO HUMANO (GH) ---
const Trabaja = lazy(() =>
  import("../pages/entrevistasGH/Trabaja").then((m) => ({
    default: m.Trabaja,
  })),
);
const Vacantes = lazy(() =>
  import("../pages/entrevistasGH/Vacantes").then((m) => ({
    default: m.Vacantes,
  })),
);
const AgendarEntrevista = lazy(() =>
  import("../pages/entrevistasGH/AgendarEntrevista").then((m) => ({
    default: m.AgendarEntrevista,
  })),
);
const GestionEntrevistas = lazy(
  () => import("../pages/entrevistasGH/GestionEntrevistasGH"),
);
const PostulacionesTable = lazy(() =>
  import("../contratacion_virtual/PostulacionesTable").then((m) => ({
    default: m.PostulacionesTable,
  })),
);
const BuscadorPostulante = lazy(() =>
  import("../contratacion_virtual/BuscadorPostulante").then((m) => ({
    default: m.BuscadorPostulante,
  })),
);
const PanelPostulante = lazy(() =>
  import("../contratacion_virtual/PanelPostulante").then((m) => ({
    default: m.PanelPostulante,
  })),
);
const PanelGHDocumentos = lazy(() =>
  import("../contratacion_virtual/PanelGHDocumentos").then((m) => ({
    default: m.PanelGHDocumentos,
  })),
);
const PanelNotificacionesGH = lazy(() =>
  import("../contratacion_virtual/PanelNotificacionesGH").then((m) => ({
    default: m.PanelNotificacionesGH,
  })),
);
const AdminContratacion = lazy(() =>
  import("../contratacion_virtual/AdminContratacion").then((m) => ({
    default: m.AdminContratacion,
  })),
);
const FormularioSolicitudPersonal = lazy(() =>
  import("../contratacion_virtual/FormularioSolicitudPersonal.jsx").then(
    (m) => ({ default: m.FormularioSolicitudPersonal }),
  ),
);
const AdminVacantes = lazy(
  () => import("../pages/entrevistasGH/AdminVacantes.jsx"),
);
const AdminDotacion = lazy(() =>
  import("../pages/Dotación/AdminDotación.jsx").then((m) => ({
    default: m.AdminDotacion,
  })),
);
const EmpleadoDotacion = lazy(() =>
  import("../pages/Dotación/EmpleadoDotacion.jsx").then((m) => ({
    default: m.EmpleadoDotacion,
  })),
);
const FormularioDotacion = lazy(
  () => import("../pages/Dotación/FormularioDotación.jsx"),
);
const EPP = lazy(() =>
  import("../pages/Dotación/EPP.jsx").then((m) => ({
    default: m.default,
  })),
);

// --- ADMINISTRACIÓN Y USUARIOS ---
const Acceso = lazy(() =>
  import("../pages/admin/Acceso").then((m) => ({ default: m.Acceso })),
);
const AdminUsuarios = lazy(() =>
  import("../pages/admin/AdminUsuarios.jsx").then((m) => ({
    default: m.AdminUsuarios,
  })),
);
const TeamManager = lazy(() =>
  import("../pages/admin/TeamManager.jsx").then((m) => ({
    default: m.TeamManager,
  })),
);
const SolicitudAprobacion = lazy(() =>
  import("../pages/flujo_perfil/SolicitudAprobacion").then((m) => ({
    default: m.SolicitudAprobacion,
  })),
);
const DGdecision = lazy(() =>
  import("../pages/flujo_perfil/DGdecision").then((m) => ({
    default: m.DGdecision,
  })),
);
const AdminPromociones = lazy(
  () => import("../pages/promociones/AdminPromociones.jsx"),
);
const AdminDirecciones = lazy(
  () => import("../pages/Tareas_dirreciones/Admin.jsx"),
);

// --- CONTABILIDAD Y GASTOS ---
const Gastos = lazy(() =>
  import("../pages/flujo_gastos/Gastos/Gastos").then((m) => ({
    default: m.Gastos,
  })),
);
const HistorialGastos = lazy(() =>
  import("../pages/flujo_gastos/HistorialGastos").then((m) => ({
    default: m.HistorialGastos,
  })),
);
const HistorialCartera = lazy(() =>
  import("../pages/flujo_gastos/HistorialCartera").then((m) => ({
    default: m.HistorialCartera,
  })),
);
const SuperAdminContabilidad = lazy(
  () => import("../pages/trazabilidad_contabilidad/SuperAdminContabilidad.jsx"),
);
const AdminTrazabilidad = lazy(
  () => import("../pages/trazabilidad_contabilidad/AdminTrazabilidad.jsx"),
);
const GestionTokens = lazy(
  () => import("../pages/trazabilidad_contabilidad/GestionTokens"),
);
const PanelAprobaciones = lazy(
  () => import("../pages/trazabilidad_contabilidad/PanelAprobaciones"),
);
const CreacionSubirEmpleado = lazy(
  () => import("../pages/trazabilidad_contabilidad/CreacionSubirEmpleado.jsx"),
);
const CreacionProveedor = lazy(
  () => import("../pages/trazabilidad_contabilidad/CreacionProveedor.jsx"),
);
const CreacionCliente = lazy(
  () => import("../pages/trazabilidad_contabilidad/CreacionCliente.jsx"),
);

// --- OPERACIONES, INVENTARIO Y TRANSPORTE ---
const Automatizacion = lazy(() =>
  import("../pages/flujo_fruver/Automatizacion").then((m) => ({
    default: m.Automatizacion,
  })),
);
const HistorialRegistros = lazy(() =>
  import("../pages/flujo_fruver/HistorialRegistros").then((m) => ({
    default: m.HistorialRegistros,
  })),
);

// *** NUEVO PANEL DE TRANSPORTE ***
const AdminTransportePanel = lazy(() =>
  import("../pages/flujo_transporte/AdminTransporte").then((m) => ({
    default: m.default,
  })),
);

// Mantenemos estos por si se requieren individualmente, aunque el Panel los engloba
const Transporte = lazy(() =>
  import("../pages/flujo_transporte/Transporte").then((m) => ({
    default: m.Transporte,
  })),
);
const HistorialTransporte = lazy(() =>
  import("../pages/flujo_transporte/HistorialTransporte").then((m) => ({
    default: m.HistorialTransporte,
  })),
);
const AdministradorInventario = lazy(
  () => import("../Inventario/AdministradorInventario.jsx"),
);
const OperarioPadre = lazy(() => import("../Inventario/Operario.jsx"));
const AdminInventarioGeneral = lazy(
  () => import("../Inventario-General/Admin/AdminInventarioGeneral.jsx"),
);
const EmpleadoInventarioGeneral = lazy(
  () => import("../Inventario-General/Empleado/EmpleadoInventarioGeneral.jsx"),
);
const Salones = lazy(() =>
  import("../pages/reservaSalones/Salones").then((m) => ({
    default: m.Salones,
  })),
);
const ReservaForm = lazy(() =>
  import("../pages/reservaSalones/Reserva").then((m) => ({
    default: m.ReservaForm,
  })),
);
const AdminProgramadorHorarios = lazy(() =>
  import("../pages/Programador_horarios/AdminProgramadorHorarios.jsx").then(
    (m) => ({ default: m.AdminProgramadorHorarios }),
  ),
);
const ConsultaHorariosPublica = lazy(
  () => import("../pages/Programador_horarios/ConsultaHorariosPublica.jsx"),
);

// --- MANTENIMIENTO Y SST ---
const AdministradorMantenimiento = lazy(
  () => import("../pages/Mantenimiento/AdministradorMantenimiento.jsx"),
);
const RegistroActividad = lazy(
  () => import("../pages/Mantenimiento/RegistroActividad.jsx"),
);
const InventarioMantenimiento = lazy(
  () => import("../pages/Mantenimiento/InventarioMantenimiento.jsx"),
);
const HojaDeVidaMantenimiento = lazy(
  () => import("../pages/Mantenimiento/HojaDeVidaMantenimiento.jsx"),
);
const DashboardMantenimiento = lazy(
  () => import("../pages/Mantenimiento/DashboardMantenimiento.jsx"),
);
const AsignarTarea = lazy(
  () => import("../pages/Mantenimiento/AsignarTarea.jsx"),
);
const HistorialTareas = lazy(
  () => import("../pages/Mantenimiento/HistorialTareas.jsx"),
);
const HistorialActividadesPage = lazy(
  () => import("../pages/Mantenimiento/HistorialActividadesPage.jsx"),
);
const LiderSST = lazy(() => import("../pages/Mantenimiento/LiderSST.jsx"));
const TareasRecibidas = lazy(
  () => import("../pages/Mantenimiento/TareasRecibidas.jsx"),
);

// --- SOCIODEMOGRÁFICO ---
const Autogestion = lazy(() => import("../pages/Autogestion/Autogestion.jsx"));
const Sociodemografico = lazy(() =>
  import("../pages/Sociodemografico/Sociodemografico.jsx").then((m) => ({
    default: m.Sociodemografico,
  })),
);
const FormularioPerfilMerkahorro = lazy(() =>
  import("../pages/Sociodemografico/socioMerkahorro/FormularioPerfilMerkahorro").then(
    (m) => ({ default: m.FormularioPerfilMerkahorro }),
  ),
);
const FormularioPerfilConstruahorro = lazy(() =>
  import("../pages/Sociodemografico/socioConstruahorro/FormularioPerfilConstruahorro").then(
    (m) => ({ default: m.FormularioPerfilConstruahorro }),
  ),
);
const FormularioPerfilMegamayoristas = lazy(() =>
  import("../pages/Sociodemografico/socioMegamayoristas/FormularioPerfilMegamayoristas").then(
    (m) => ({ default: m.FormularioPerfilMegamayoristas }),
  ),
);
const HistorialFormulario = lazy(() =>
  import("../pages/Sociodemografico/HistorialFormulario").then((m) => ({
    default: m.HistorialFormulario,
  })),
);

// --- DASHBOARDS ---
const Dashboards = lazy(() =>
  import("../pages/Dashboards").then((m) => ({ default: m.Dashboards })),
);
const DashboardGastos = lazy(() =>
  import("../Dashboards/DSH-gastos/DashboardGastos").then((m) => ({
    default: m.DashboardGastos,
  })),
);
const DashboardTransporte = lazy(() =>
  import("../pages/flujo_transporte/DSH-transporte/DashboardTransporte").then(
    (m) => ({
      default: m.DashboardTransporte,
    }),
  ),
);
const DashboardPostulaciones = lazy(() =>
  import("../Dashboards/DSH-postulaciones/DashboardPostulaciones").then(
    (m) => ({ default: m.DashboardPostulaciones }),
  ),
);
const DashboardFruver = lazy(
  () => import("../Dashboards/DSH-Fruver/DashboardFruver.jsx"),
);
const DashboardSociodemografico = lazy(
  () =>
    import("../pages/Sociodemografico/dashboards/DashboardSociodemografico.jsx"),
);

// --- DESARROLLO ---
const SolicitudDesarrollo = lazy(() =>
  import("../pages/Solicitud_Desarrollo/SolicitudDesarrollo.jsx").then((m) => ({
    default: m.SolicitudDesarrollo,
  })),
);
const AdminDesarrollo = lazy(
  () => import("../pages/Solicitud_Desarrollo/AdminDesarrollo.jsx"),
);
const DesarrolloSurtido = lazy(
  () => import("../pages/DesarrolloSurtido_API/DesarrolloSurtido.jsx"),
);
const SiesaSyncPage = lazy(
  () => import("../pages/SiesaSync/SiesaSyncPage.jsx"),
);
const DesarrolloCompras = lazy(
  () => import("../pages/Desarrollo-Compras/Desarrollo_compras.jsx"),
);
const DesarrolloDomicilios = lazy(
  () => import("../pages/Desarrollo-Domicilios/Domicilios.jsx"),
);

// --- ECOMMERCE ---
import { SedeProvider } from "../pages/ecommerce/shared/SedeContext";

const PedidosAdmin = lazy(
  () => import("../pages/ecommerce/admin/PedidosAdmin.jsx"),
);
const VistaPicker = lazy(
  () => import("../pages/ecommerce/picker/VistaPicker.jsx"),
);
const VistaAuditor = lazy(
  () => import("../pages/ecommerce/auditor/VistaAuditor.jsx"),
);
const AnaliticaPickers = lazy(
  () => import("../pages/ecommerce/admin/AnaliticaPickers.jsx"),
);
const GestionPickers = lazy(() =>
  import("../pages/ecommerce/admin/GestionPickers.jsx").then((module) => ({
    default: module.GestionPickers,
  })),
);

// Helper: Envolver componente ecommerce con SedeProvider
const withSede = (Component) => (
  <SedeProvider>
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  </SedeProvider>
);

const GestorEcommerce = lazy(() =>
  import("../pages/gestor-ecommerce/GestorEcommerce.jsx").then((m) => ({
    default: m.default,
  })),
);

// --- TESTING ---
const TestUploadR2 = lazy(() => import("../components/TestUploadR2"));

// =============================================================================
// DEFINICIÓN DE RUTAS
// =============================================================================

const publicRoutes = [
  { path: "/test-r2", element: LazyLoad(TestUploadR2) },
  { path: "/", element: LazyLoad(Home) },
  { path: "/index.html", element: <Navigate to="/" replace /> },
  { path: "/login", element: LazyLoad(Login) },
  { path: "/reestablecer", element: LazyLoad(ReestablecerContraseña) },
  { path: "/contribucion", element: LazyLoad(Contribucion) },
  { path: "/promociones", element: LazyLoad(Promociones) },
  { path: "/aprobarrechazar", element: LazyLoad(AprobarRechazar) },
  { path: "/consulta-horarios", element: LazyLoad(ConsultaHorariosPublica) },
  { path: "/reserva", element: LazyLoad(ReservaForm) },
  { path: "/historial/:correo", element: LazyLoad(HistorialRegistros) },

  // Legal
  { path: "/politicas", element: LazyLoad(Politicas) },
  { path: "/condiciones", element: LazyLoad(Condiciones) },
  { path: "/declaracion-origen-fondos", element: LazyLoad(DeclaracionFondos) },
  {
    path: "/notificacionesElectronicas",
    element: LazyLoad(NotificacionesElectronicas),
  },

  // GH Público
  { path: "/trabaja-con-nosotros", element: LazyLoad(Vacantes) },
  { path: "/aplicar", element: LazyLoad(Trabaja) },
  { path: "/agendar-entrevista", element: LazyLoad(AgendarEntrevista) },
  { path: "/empleadodotacion", element: LazyLoad(EmpleadoDotacion) },

  // Inventarios Públicos/Externos
  {
    path: "/admin-inventarios-generales",
    element: LazyLoad(AdminInventarioGeneral),
  },
  {
    path: "/empleado-inventarios-generales",
    element: LazyLoad(EmpleadoInventarioGeneral),
  },
  { path: "/admin-direcciones", element: LazyLoad(AdminDirecciones) },

  // Sociodemográfico Público
  { path: "/autogestion", element: LazyLoad(Autogestion) },
  {
    path: "/formularioperfilmerkahorro",
    element: LazyLoad(FormularioPerfilMerkahorro),
  },
  {
    path: "/formularioperfilconstruahorro",
    element: LazyLoad(FormularioPerfilConstruahorro),
  },
  {
    path: "/formularioperfilmegamayoristas",
    element: LazyLoad(FormularioPerfilMegamayoristas),
  },

  // Trazabilidad Pública (Tokens)
  {
    path: "/trazabilidad/crear-empleado",
    element: LazyLoad(Autogestion), // Redirección a nuevo formulario unificado
  },
  {
    path: "/trazabilidad/crear-proveedor",
    element: LazyLoad(CreacionProveedor),
  },
  { path: "/trazabilidad/crear-cliente", element: LazyLoad(CreacionCliente) },

  // Desarrollo
  { path: "/solicitud-desarrollo", element: LazyLoad(SolicitudDesarrollo) },
  { path: "/dgdecision/:workflow_id/:role", element: LazyLoad(DGdecision) },
  { path: "/ecommerce/picker", element: withSede(VistaPicker) },
];

const protectedRoutes = [
  // Admin & Usuarios
  { path: "/acceso", element: LazyLoad(Acceso) },
  { path: "/adminUsuarios", element: LazyLoad(AdminUsuarios) },
  { path: "/gestion-equipo", element: LazyLoad(TeamManager) }, // ✅ Nueva ruta para líderes
  { path: "/solicitudaprobacion", element: LazyLoad(SolicitudAprobacion) },
  { path: "/admin-promociones", element: LazyLoad(AdminPromociones) },

  // GH Privado
  { path: "/postulacionesTable", element: LazyLoad(PostulacionesTable) },
  { path: "/gestionEntrevistas", element: LazyLoad(GestionEntrevistas) },
  { path: "/buscadorpostulante", element: LazyLoad(BuscadorPostulante) },
  { path: "/panelpostulante/:id", element: LazyLoad(PanelPostulante) },
  { path: "/panelghdocumentos", element: LazyLoad(PanelGHDocumentos) },
  { path: "/panelnotificacionesgh", element: LazyLoad(PanelNotificacionesGH) },
  { path: "/admincontratacion", element: LazyLoad(AdminContratacion) },
  {
    path: "/formularioSolicitudPersonal",
    element: LazyLoad(FormularioSolicitudPersonal),
  },
  { path: "/admin-vacantes", element: LazyLoad(AdminVacantes) },
  { path: "/adminDotacion", element: LazyLoad(AdminDotacion) },
  { path: "/FormularioDotacion", element: LazyLoad(FormularioDotacion) },
  { path: "/epp", element: LazyLoad(EPP) },

  // Contabilidad & Gastos
  { path: "/gastos", element: LazyLoad(Gastos) },
  { path: "/historialgastos", element: LazyLoad(HistorialGastos) },
  { path: "/historialcartera", element: LazyLoad(HistorialCartera) },
  { path: "/trazabilidad/admin", element: LazyLoad(SuperAdminContabilidad) },
  { path: "/trazabilidad/panel", element: LazyLoad(AdminTrazabilidad) },
  { path: "/trazabilidad/gestion-tokens", element: LazyLoad(GestionTokens) },
  { path: "/trazabilidad/aprobaciones", element: LazyLoad(PanelAprobaciones) },

  // Operaciones
  { path: "/automatizacion", element: LazyLoad(Automatizacion) },

  // === MODIFICADO: Apunta al nuevo panel administrativo ===
  { path: "/transporte", element: LazyLoad(AdminTransportePanel) },
  // ========================================================

  { path: "/historialtransporte", element: LazyLoad(HistorialTransporte) },
  {
    path: "/administradorInventario",
    element: LazyLoad(AdministradorInventario),
  },
  { path: "/operario", element: LazyLoad(OperarioPadre) },
  { path: "/salones", element: LazyLoad(Salones) },
  {
    path: "/programador-horarios",
    element: LazyLoad(AdminProgramadorHorarios),
  },

  // Sociodemográfico Privado
  { path: "/historialformulario", element: LazyLoad(HistorialFormulario) },
  { path: "/sociodemografico", element: LazyLoad(Sociodemografico) },

  // Dashboards
  { path: "/dashboards", element: LazyLoad(Dashboards) },
  { path: "/dashboardgastos", element: LazyLoad(DashboardGastos) },
  { path: "/dashboardtransporte", element: LazyLoad(DashboardTransporte) },
  {
    path: "/dashboardpostulaciones",
    element: LazyLoad(DashboardPostulaciones),
  },
  {
    path: "/dashboardsociodemografico",
    element: LazyLoad(DashboardSociodemografico),
  },
  { path: "/dashboardFruver", element: LazyLoad(DashboardFruver) },

  // Desarrollo
  { path: "/admin-desarrollo", element: LazyLoad(AdminDesarrollo) },
  { path: "/desarrollo-domicilios", element: LazyLoad(DesarrolloDomicilios) },
  { path: "/desarrollo-compras", element: LazyLoad(DesarrolloCompras) },
  { path: "/desarrollo-surtido", element: LazyLoad(DesarrolloSurtido) },
  { path: "/siesa-sync", element: LazyLoad(SiesaSyncPage) },

  // Ecommerce (envuelto con SedeProvider)
  { path: "/ecommerce/pedidos", element: withSede(PedidosAdmin) },
  { path: "/ecommerce/analitica", element: withSede(AnaliticaPickers) },
  { path: "/ecommerce/gestion-pickers", element: withSede(GestionPickers) },
  { path: "/ecommerce/auditor", element: withSede(VistaAuditor) },
  { path: "/gestor-ecommerce", element: LazyLoad(GestorEcommerce) },
];

// Rutas anidadas complejas (Mantenimiento)
const maintenanceRoutes = {
  path: "/mantenimiento",
  element: LazyLoad(AdministradorMantenimiento),
  children: [
    { index: true, element: LazyLoad(RegistroActividad) },
    { path: "registro_actividad", element: LazyLoad(RegistroActividad) },
    { path: "inventario", element: LazyLoad(InventarioMantenimiento) },
    { path: "hoja_de_vida", element: LazyLoad(HojaDeVidaMantenimiento) },
    { path: "dashboard", element: LazyLoad(DashboardMantenimiento) },
    {
      path: "historial_actividades",
      element: LazyLoad(HistorialActividadesPage),
    },
  ],
};

const sstRoutes = {
  path: "/lider-sst",
  element: LazyLoad(LiderSST),
  children: [
    { index: true, element: LazyLoad(AsignarTarea) },
    { path: "asignar_tarea", element: LazyLoad(AsignarTarea) },
    { path: "tareas_recibidas", element: LazyLoad(TareasRecibidas) },
    { path: "mis_tareas_asignadas", element: LazyLoad(HistorialTareas) },
    { path: "historial_completo", element: LazyLoad(HistorialActividadesPage) },
  ],
};

// =============================================================================
// EXPORTACIÓN FINAL
// =============================================================================

export const routes = [
  {
    element: <Outlet />,
    errorElement: <ErrorPage />,
    children: [
      ...publicRoutes,
      {
        element: <RutaProtegida />,
        children: [...protectedRoutes, maintenanceRoutes, sstRoutes],
      },
      // Catch-all para rutas no encontradas (404)
      { path: "*", element: <ErrorPage force404={true} /> },
    ],
  },
];
