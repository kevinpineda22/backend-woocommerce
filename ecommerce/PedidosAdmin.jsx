import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import QRCode from "react-qr-code";
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
  FaCheckCircle,
  FaQrcode,
} from "react-icons/fa";

import { supabase } from "../../supabaseClient";

// --- COMPONENTES MODULARES ---
import PendingOrdersView from "./PendingOrdersView";
import ActiveSessionsView from "./ActiveSessionsView";
import AssignPickerModal from "./AssignPickerModal";
import { LiveSessionModal } from "./LiveSessionModal";
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

  // Estados visual QR Histórico
  const [showQrManifest, setShowQrManifest] = useState(false);
  const [manifestData, setManifestData] = useState(null);

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
        `https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}`,
      );
      const listPending = resPending.data.filter((o) => !o.is_assigned);
      setOrders(listPending);

      // 2. Sesiones Activas
      const resActive = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}`,
      );
      setActiveSessions(resActive.data);

      const totalProcessOrders = resActive.data.reduce(
        (sum, s) => sum + (s.orders_count || 0),
        0,
      );
      setStats({ pending: listPending.length, process: totalProcessOrders });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  // Refresco automático: SOLO para PENDIENTES (woo) cada 30seg + REALTIME SUPABASE
  useEffect(() => {
    fetchData();

    // Polling lento solo para "Pendientes" que vienen de Woo y no tienen webhook
    const interval = setInterval(() => fetchData(true), 30000);

    // REALTIME: Escuchamos cambios en sesiones y asignaciones
    const channel = supabase
      .channel("admin-dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_picking_sessions" },
        () => {
          console.log(
            "🔔 Cambio en sesiones activo detectado. Refrescando dashboard...",
          );
          fetchData(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_asignaciones_pedidos" },
        () => {
          console.log(
            "🔔 Nueva asignación/cambio detectado. Refrescando dashboard...",
          );
          fetchData(true);
        },
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // --- HANDLERS: ASIGNACIÓN DE PICKERS ---

  const handleOpenAssignModal = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pickers",
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      alert("Error cargando lista de pickers.");
    }
  };

  const handleAssignSingleOrder = async (order) => {
    setSelectedIds(new Set([order.id]));
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pickers",
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      alert("Error cargando lista de pickers.");
    }
  };

  const handleConfirmAssignment = async (picker) => {
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/crear-sesion",
        {
          id_picker: picker.id,
          ids_pedidos: Array.from(selectedIds),
        },
      );
      alert(`✅ Misión asignada a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData(); // Recargar datos
    } catch (error) {
      alert(
        "Error al asignar: " + (error.response?.data?.error || error.message),
      );
    }
  };

  // --- HANDLERS: HISTORIAL Y DETALLES ---

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/historial",
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
      // ✅ AQUI ES EL CAMBIO: pedimos incluir eliminados
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${session.picker_id}&include_removed=true`,
      );
      setLiveSessionDetail({ sessionInfo: session, routeData: res.data });
      setShowLiveModal(true);
    } catch (e) {
      alert(
        "No se pudo cargar detalles. Es posible que la sesión haya finalizado.",
      );
      fetchData(); // Refrescar por si acaso
    }
  };

  const handleViewHistoryDetail = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}`,
      );
      // CORRECCION: Extender respuesta completa para tener acceso a metadata y final_snapshot
      setHistoryDetail({
        session,
        ...res.data,
        logs: res.data.logs || [], // Garantizar array
      });
      setShowHistoryModal(true);
    } catch (e) {
      alert("Error cargando detalles del historial.");
    }
  };

  const handleViewManifestDirect = async (session) => {
    try {
      // Reutilizamos el endpoint de detalle para obtener el snapshot
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}`,
      );

      const { final_snapshot, metadata } = res.data;
      if (!final_snapshot) {
        alert(
          "Esta sesión no tiene certificado de salida (no ha sido auditada o es antigua).",
        );
        return;
      }

      setManifestData({
        session_id: metadata.session_id,
        timestamp: final_snapshot.timestamp,
        items: final_snapshot.items,
        picker: metadata.picker_name || "Desconocido",
      });
      setShowQrManifest(true);
    } catch (e) {
      alert("Error cargando certificado.");
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
                        <td style={{ display: "flex", gap: "5px" }}>
                          <button
                            className="gp-btn-icon warning"
                            title="Ver Logs Detallados"
                            onClick={() => handleViewHistoryDetail(sess)}
                          >
                            <FaFileAlt />
                          </button>
                          <button
                            className="gp-btn-icon"
                            style={{ color: "#16a34a" }}
                            title="Ver Certificado Salida"
                            onClick={() => handleViewManifestDirect(sess)}
                          >
                            <FaQrcode />
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

      {showLiveModal && liveSessionDetail && (
        <LiveSessionModal
          sessionDetail={liveSessionDetail}
          onClose={() => setShowLiveModal(false)}
        />
      )}

      {showHistoryModal && historyDetail && (
        <div
          className="pedidos-modal-overlay high-z"
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="pedidos-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "800px", width: "90%" }}
          >
            <div className="pedidos-modal-header">
              <h2>Auditoría Pym</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setShowHistoryModal(false)}
              >
                &times;
              </button>
            </div>

            {/* ✅ BOTÓN DE CERTIFICADO DE SALIDA */}
            {historyDetail.final_snapshot && (
              <div
                style={{
                  padding: "10px 20px",
                  background: "#f0fdf4",
                  borderBottom: "1px solid #bbf7d0",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <FaCheckCircle color="#16a34a" />
                <span style={{ color: "#166534", fontWeight: 600 }}>
                  Sesión Auditada y Completada.
                </span>
                <button
                  onClick={() => {
                    setManifestData({
                      session_id: historyDetail.metadata.session_id,
                      timestamp: historyDetail.final_snapshot.timestamp,
                      items: historyDetail.final_snapshot.items,
                      picker:
                        historyDetail.metadata.picker_name || "Desconocido",
                    });
                    setShowQrManifest(true);
                  }}
                  style={{
                    marginLeft: "auto",
                    background: "#22c55e",
                    color: "white",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <FaQrcode /> VER CERTIFICADO SALIDA
                </button>
              </div>
            )}

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

      {showQrManifest && manifestData && (
        <div
          className="invoice-mode-layout"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 9999,
            overflowY: "auto",
          }}
        >
          <div className="invoice-actions no-print">
            <button
              style={{ background: "#64748b", color: "white" }}
              onClick={() => setShowQrManifest(false)}
            >
              ❌ CERRAR
            </button>
            <button
              style={{ background: "#2563eb", color: "white" }}
              onClick={() => window.print()}
            >
              🖨️ IMPRIMIR
            </button>
          </div>

          <div className="invoice-sheet">
            <div className="inv-sheet-header">
              <div className="sheet-logo">MANIFIESTO HISTÓRICO</div>
              <div className="sheet-info">
                <h2>Orden #{manifestData.session_id.toString().slice(0, 6)}</h2>
                <p>{new Date(manifestData.timestamp).toLocaleString()}</p>
              </div>
            </div>

            <div className="sheet-customer">
              <strong>Auditado por:</strong> Sistema WMS (Historial)
              <br />
              <strong>Responsable Original:</strong> {manifestData.picker}
              <br />
            </div>

            <div className="master-code-section">
              <div className="qr-wrapper">
                <QRCode
                  value={JSON.stringify({
                    id: manifestData.session_id,
                    d: manifestData.timestamp.split("T")[0],
                    it: manifestData.items.map((x) => [x.sku || x.name, x.qty]),
                  })}
                  size={150}
                />
              </div>
              <div className="code-info">
                <h4>COPIA DIGITAL FINAL</h4>
                <p>Recuperado del historial seguro de auditoría.</p>
              </div>
            </div>

            <table className="invoice-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }}>Cant</th>
                  <th>Item</th>
                  <th>SKU / ID</th>
                </tr>
              </thead>
              <tbody>
                {manifestData.items.map((it, k) => (
                  <tr key={k}>
                    <td
                      style={{
                        textAlign: "center",
                        fontWeight: "bold",
                        fontSize: "1.1rem",
                      }}
                    >
                      {it.qty}
                    </td>
                    <td>
                      {it.name}{" "}
                      {it.type === "sustituido" && (
                        <strong style={{ color: "#d97706" }}>(SUB)</strong>
                      )}
                    </td>
                    <td style={{ fontFamily: "monospace" }}>{it.sku}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sheet-footer">
              <div className="cut-line">
                - - - - - - Documento informativo - - - - - -
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PedidosAdmin;
