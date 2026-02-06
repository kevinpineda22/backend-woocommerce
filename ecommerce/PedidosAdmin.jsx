import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  FaBox,
  FaArrowLeft,
  FaSync,
  FaChartLine,
  FaUserTag,
  FaRunning,
  FaHistory,
  FaFileAlt,
} from "react-icons/fa";

// --- COMPONENTES MODULARES ---
import PendingOrdersView from "./PendingOrdersView";
import ActiveSessionsView from "./ActiveSessionsView";
import AssignPickerModal from "./AssignPickerModal";
import { LiveSessionModal } from "./LiveSessionModal"; // ✅ Importación del módulo nuevo
import { GestionPickers } from "./GestionPickers";
import AnaliticaPickers from "./AnaliticaPickers";

import "./PedidosAdmin.css";

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const PedidosAdmin = () => {
  // --- ESTADOS GLOBALES ---
  const [currentView, setCurrentView] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, process: 0 });

  // Datos
  const [orders, setOrders] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [pickers, setPickers] = useState([]);

  // Modales de Gestión
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  
  // Modales de Detalle
  const [liveSessionDetail, setLiveSessionDetail] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // --- DATA FETCHING ---
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // 1. Pedidos Pendientes
      const resPending = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}`
      );
      const listPending = resPending.data.filter((o) => !o.is_assigned);
      setOrders(listPending);

      // 2. Sesiones Activas
      const resActive = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}`
      );
      setActiveSessions(resActive.data);

      setStats({ pending: listPending.length, process: resActive.data.length });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // Refresco automático cada 10 segundos
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- HANDLERS: ASIGNACIÓN DE PICKERS ---
  
  // Abrir modal para asignar lotes (varios seleccionados)
  const handleOpenAssignModal = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pickers"
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      alert("Error cargando lista de pickers.");
    }
  };

  // Asignar un solo pedido directamente (sin seleccionarlo primero)
  const handleAssignSingleOrder = async (order) => {
    setSelectedIds(new Set([order.id]));
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pickers"
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      alert("Error cargando lista de pickers.");
    }
  };

  // Confirmar la asignación en el servidor
  const handleConfirmAssignment = async (picker) => {
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/crear-sesion",
        {
          id_picker: picker.id,
          ids_pedidos: Array.from(selectedIds),
        }
      );
      alert(`✅ Misión asignada a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData(); // Recargar datos
    } catch (error) {
      alert("Error al asignar: " + (error.response?.data?.error || error.message));
    }
  };

  // --- HANDLERS: HISTORIAL Y DETALLES ---

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/historial"
      );
      setHistoryOrders(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Ver detalle de una sesión activa (Live Dashboard)
  const handleViewLiveDetail = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${session.picker_id}`
      );
      setLiveSessionDetail({ sessionInfo: session, routeData: res.data });
      setShowLiveModal(true);
    } catch (e) {
      alert("No se pudo cargar detalles. Es posible que la sesión haya finalizado.");
      fetchData(); // Refrescar por si acaso
    }
  };

  // Ver detalle de auditoría (Historial pasado)
  const handleViewHistoryDetail = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}`
      );
      setHistoryDetail({ session, logs: res.data });
      setShowHistoryModal(true);
    } catch (e) {
      alert("Error cargando detalles del historial.");
    }
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* SIDEBAR DE NAVEGACIÓN */}
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button">
            <FaArrowLeft />
          </Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Center</h2>
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">OPERACIÓN</div>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "pending" ? "active" : ""
            }`}
            onClick={() => setCurrentView("pending")}
          >
            <FaBox /> <span>Por Asignar</span>{" "}
            <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "process" ? "active" : ""
            }`}
            onClick={() => setCurrentView("process")}
          >
            <FaRunning /> <span>En Proceso</span>{" "}
            <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>
          <div className="pedidos-nav-label spacer">AUDITORÍA</div>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "history" ? "active" : ""
            }`}
            onClick={() => {
              setCurrentView("history");
              fetchHistory();
            }}
          >
            <FaHistory /> <span>Historial</span>
          </button>
          <div className="pedidos-nav-label spacer">ADMINISTRACIÓN</div>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "analitica" ? "active" : ""
            }`}
            onClick={() => setCurrentView("analitica")}
          >
            <FaChartLine /> <span>Inteligencia</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "pickers" ? "active" : ""
            }`}
            onClick={() => setCurrentView("pickers")}
          >
            <FaUserTag /> <span>Pickers</span>
          </button>
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="pedidos-layout-content">
        {/* VISTAS DE ADMINISTRACIÓN */}
        {currentView === "pickers" ? (
          <GestionPickers />
        ) : currentView === "analitica" ? (
          <AnaliticaPickers />
        ) : currentView === "history" ? (
          /* VISTA DE HISTORIAL */
          <>
            <header className="pedidos-layout-header">
              <h1>📜 Historial de Sesiones</h1>
              <button
                onClick={fetchHistory}
                className="pedidos-admin-refresh-btn"
              >
                <FaSync /> Refrescar
              </button>
            </header>
            <div className="pedidos-layout-body">
              <div className="history-table-container">
                <table className="pickers-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Picker</th>
                      <th>Pedidos</th>
                      <th>Duración</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOrders.map((sess) => (
                      <tr key={sess.id}>
                        <td>
                          <div style={{ fontWeight: "bold", color: "#1e293b" }}>
                            {sess.fecha}
                          </div>
                          <small>{sess.hora_fin}</small>
                        </td>
                        <td>{sess.picker}</td>
                        <td>{sess.pedidos.join(", ")}</td>
                        <td>
                          <span
                            className="pedidos-badge-ok"
                            style={{
                              background: "#e0f2fe",
                              color: "#0284c7",
                            }}
                          >
                            {sess.duracion}
                          </span>
                        </td>
                        <td>
                          <button
                            className="gp-btn-icon warning"
                            onClick={() => handleViewHistoryDetail(sess)}
                          >
                            <FaFileAlt />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* VISTAS OPERATIVAS (PENDIENTES Y PROCESO) */
          <>
            <header className="pedidos-layout-header">
              <h1>
                {currentView === "pending"
                  ? "📦 Pedidos Pendientes"
                  : "🚀 Centro de Comando"}
              </h1>
              <button
                onClick={() => fetchData()}
                className="pedidos-admin-refresh-btn"
              >
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar
              </button>
            </header>

            <div className="pedidos-layout-body">
              {currentView === "pending" ? (
                <PendingOrdersView
                  orders={orders}
                  loading={loading}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  filterDate={filterDate}
                  setFilterDate={setFilterDate}
                  filterZone={filterZone}
                  setFilterZone={setFilterZone}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  onAssignClick={handleOpenAssignModal}
                  onAssignSingleDirect={handleAssignSingleOrder}
                />
              ) : (
                <ActiveSessionsView
                  sessions={activeSessions}
                  onViewDetail={handleViewLiveDetail}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* --- MODALES COMPARTIDOS --- */}
      
      <AssignPickerModal
        isOpen={showAssignModal}
        pickers={pickers}
        onClose={() => setShowAssignModal(false)}
        onConfirm={handleConfirmAssignment}
      />

      {/* ✅ USO DEL NUEVO COMPONENTE MODULARIZADO */}
      {showLiveModal && liveSessionDetail && (
        <LiveSessionModal 
            sessionDetail={liveSessionDetail}
            onClose={() => setShowLiveModal(false)}
        />
      )}

      {/* MODAL DETALLE HISTORIAL (Aún integrado aquí por simplicidad) */}
      {showHistoryModal && historyDetail && (
        <div
          className="pedidos-modal-overlay high-z"
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="pedidos-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pedidos-modal-header">
              <h2>Auditoría</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setShowHistoryModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="pedidos-modal-body">
              <div className="audit-timeline">
                {historyDetail.logs.map((log) => (
                  <div
                    key={log.id}
                    className={`audit-item ${log.es_sustituto ? "sub" : ""}`}
                  >
                    <div className="audit-time">
                      {new Date(log.fecha_registro).toLocaleTimeString()}
                    </div>
                    <div className="audit-content">
                      <div className="audit-title">
                        {log.accion === "recolectado"
                          ? log.es_sustituto
                            ? "🔄 Sustituyó"
                            : "✅ Recolectó"
                          : log.accion}
                        : <strong>{log.nombre_producto}</strong>
                      </div>
                      {log.es_sustituto && (
                        <div className="audit-sub-detail">
                          Por: {log.nombre_sustituto} (
                          {formatPrice(log.precio_nuevo)})
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PedidosAdmin;