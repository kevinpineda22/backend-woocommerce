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
  FaClipboardCheck,
  FaMoneyBillWave,
} from "react-icons/fa";

import { supabase } from "../../../supabaseClient";

// --- COMPONENTES MODULARES ---
import PendingOrdersView from "./PendingOrdersView";
import ActiveSessionsView from "./ActiveSessionsView";
import AssignPickerModal from "./AssignPickerModal";
import { LiveSessionModal } from "./LiveSessionModal";
import { GestionPickers } from "./GestionPickers";
import AnaliticaPickers from "./AnaliticaPickers";
import HistoryView from "./HistoryView";
import PendingAuditView from "./PendingAuditView";
import PendingPaymentView from "./PendingPaymentView";
import HistoryDetailModal from "./HistoryDetailModal";
import ManifestInvoiceModal from "../shared/ManifestInvoiceModal";

// --- MULTI-SEDE ---
import { useSedeContext } from "../shared/SedeContext";
import { SedeSelector } from "../shared/SedeSelector";

import "./PedidosAdmin.css";

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const PedidosAdmin = () => {
  // --- MULTI-SEDE ---
  const {
    sedeId,
    sedeName,
    getSedeParam,
    isSuperAdmin,
    isMultiSede,
    sedeActual,
  } = useSedeContext();

  // --- ESTADOS GLOBALES ---
  const [currentView, setCurrentView] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, process: 0 });

  // Datos
  const [orders, setOrders] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [pendingAuditOrders, setPendingAuditOrders] = useState([]);
  const [paymentPendingOrders, setPaymentPendingOrders] = useState([]);
  const [pickers, setPickers] = useState([]);

  // Modales de Gestión
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Modales de Detalle
  const [liveSessionDetail, setLiveSessionDetail] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Estados visual QR Histórico (Factura)
  const [showQrManifest, setShowQrManifest] = useState(false);
  const [manifestData, setManifestData] = useState(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // --- DATA FETCHING ---
  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      const sedeParam = getSedeParam();
      try {
        // 1. Pedidos Pendientes
        const resPending = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}&${sedeParam}`,
        );
        const listPending = resPending.data.filter((o) => !o.is_assigned);
        setOrders(listPending);

        // 2. Sesiones Activas
        const resActive = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}&${sedeParam}`,
        );
        setActiveSessions(resActive.data);

        const resAuditPending = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/pendientes-auditoria?t=${Date.now()}&${sedeParam}`,
        );
        setPendingAuditOrders(resAuditPending.data || []);

        const resPaymentPending = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/pendientes-pago?t=${Date.now()}&${sedeParam}`,
        );
        setPaymentPendingOrders(resPaymentPending.data || []);

        const totalProcessOrders = resActive.data.reduce(
          (sum, s) => sum + (s.orders_count || 0),
          0,
        );
        setStats({
          pending: listPending.length,
          process: totalProcessOrders,
          auditPending: resAuditPending.data?.length || 0,
          paymentPending: resPaymentPending.data?.length || 0,
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [getSedeParam],
  );

  // Refresco automático + Realtime
  useEffect(() => {
    fetchData();

    // Polling de respaldo (30s)
    const interval = setInterval(() => fetchData(true), 30000);

    // REALTIME SUPABASE
    const channel = supabase
      .channel("admin-dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_picking_sessions" },
        () => fetchData(true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_asignaciones_pedidos" },
        () => fetchData(true),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchData, sedeId]); // Re-fetch when sede changes

  // --- HANDLERS: ASIGNACIÓN DE PICKERS ---
  const handleOpenAssignModal = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/pickers?${getSedeParam()}`,
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
        `https://backend-woocommerce.vercel.app/api/orders/pickers?${getSedeParam()}`,
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
        `https://backend-woocommerce.vercel.app/api/orders/crear-sesion?${getSedeParam()}`,
        {
          id_picker: picker.id,
          ids_pedidos: Array.from(selectedIds),
        },
      );
      alert(`✅ Misión asignada a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData();
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
        `https://backend-woocommerce.vercel.app/api/orders/historial?${getSedeParam()}`,
      );
      setHistoryOrders(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingAudit = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/pendientes-auditoria?${getSedeParam()}`,
      );
      setPendingAuditOrders(res.data || []);
      setStats((prev) => ({ ...prev, auditPending: res.data?.length || 0 }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentPending = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/pendientes-pago?${getSedeParam()}`,
      );
      setPaymentPendingOrders(res.data || []);
      setStats((prev) => ({ ...prev, paymentPending: res.data?.length || 0 }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (session) => {
    if (
      !window.confirm(
        `¿Confirmar que el picker ${session.picker} entregó el dinero?\nLa sesión pasará a historial finalizado.`,
      )
    )
      return;

    try {
      await axios.post(
        `https://backend-woocommerce.vercel.app/api/orders/marcar-pagado?${getSedeParam()}`,
        { session_id: session.id },
      );
      alert("✅ Pago registrado con éxito.");
      fetchPaymentPending();
      fetchHistory(); // Actualizar historial
    } catch (error) {
      alert("Error al registrar pago: " + error.message);
    }
  };

  const handleViewLiveDetail = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${session.picker_id}&include_removed=true&${getSedeParam()}`,
      );
      setLiveSessionDetail({ sessionInfo: session, routeData: res.data });
      setShowLiveModal(true);
    } catch (e) {
      alert(
        "No se pudo cargar detalles. Es posible que la sesión haya finalizado.",
      );
      fetchData();
    }
  };

  const handleViewHistoryDetail = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}&${getSedeParam()}`,
      );
      setHistoryDetail({
        session,
        ...res.data,
        logs: res.data.logs || [],
      });
      setShowHistoryModal(true);
    } catch (e) {
      alert("Error cargando detalles del historial.");
    }
  };

  const handleViewManifestDirect = async (session) => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}&${getSedeParam()}`,
      );

      const { final_snapshot, metadata, products_map } = res.data;
      if (!final_snapshot) {
        alert(
          "Esta sesión no tiene certificado de salida (no ha sido auditada o es antigua).",
        );
        return;
      }

      // ✅ Mergear códigos de barras del products_map con los items del snapshot
      const enrichedSnapshot = { ...final_snapshot };
      if (products_map && enrichedSnapshot.orders) {
        enrichedSnapshot.orders = enrichedSnapshot.orders.map((order) => ({
          ...order,
          items: order.items.map((item) => ({
            ...item,
            barcode:
              products_map[item.id]?.barcode ||
              item.barcode ||
              item.sku ||
              item.id,
          })),
        }));
      }

      setManifestData({
        ...enrichedSnapshot,
        session_id: metadata.session_id,
        picker: metadata.picker_name || "Desconocido",
      });
      setShowQrManifest(true);
    } catch (e) {
      alert("Error cargando certificado.");
    }
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* SIDEBAR */}
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button">
            <FaArrowLeft />
          </Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Center</h2>
        </div>
        {/* SELECTOR DE SEDE */}
        <div className="pedidos-sede-selector-wrapper">
          <SedeSelector compact />
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">OPERACIÓN</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "pending" ? "active" : ""}`}
            onClick={() => setCurrentView("pending")}
          >
            <FaBox /> <span>Por Asignar</span>{" "}
            <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "process" ? "active" : ""}`}
            onClick={() => setCurrentView("process")}
          >
            <FaRunning /> <span>En Proceso</span>{" "}
            <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>
          <div className="pedidos-nav-label spacer">AUDITORÍA</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "audit_pending" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("audit_pending");
              fetchPendingAudit();
            }}
          >
            <FaClipboardCheck /> <span>Pendiente Auditoría</span>{" "}
            <span className="pedidos-badge-count-blue">
              {stats.auditPending || 0}
            </span>
          </button>
          <div className="pedidos-nav-label spacer">PAGOS</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "payment_pending" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("payment_pending");
              fetchPaymentPending();
            }}
          >
            <FaMoneyBillWave /> <span>Pendiente Pago</span>{" "}
            <span className="pedidos-badge-count-red">
              {stats.paymentPending || 0}
            </span>
          </button>
          <div className="pedidos-nav-label spacer">HISTORIAL</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "history" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("history");
              fetchHistory();
            }}
          >
            <FaHistory /> <span>Historial</span>
          </button>
          <div className="pedidos-nav-label spacer">ADMINISTRACIÓN</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "analitica" ? "active" : ""}`}
            onClick={() => setCurrentView("analitica")}
          >
            <FaChartLine /> <span>Inteligencia</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "pickers" ? "active" : ""}`}
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
        ) : currentView === "audit_pending" ? (
          /* VISTA PENDIENTES AUDITORIA */
          <PendingAuditView
            pendingOrders={pendingAuditOrders}
            loading={loading}
            onRefresh={fetchPendingAudit}
            onViewDetail={handleViewHistoryDetail}
            onViewManifest={handleViewManifestDirect}
          />
        ) : currentView === "payment_pending" ? (
          /* VISTA PENDIENTES PAGO */
          <PendingPaymentView
            pendingPaymentOrders={paymentPendingOrders}
            loading={loading}
            onRefresh={fetchPaymentPending}
            onViewDetail={handleViewHistoryDetail}
            onViewManifest={handleViewManifestDirect}
            onMarkAsPaid={handleMarkAsPaid}
          />
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
              <HistoryView
                historyOrders={historyOrders}
                loading={loading}
                onViewDetail={handleViewHistoryDetail}
                onViewManifest={handleViewManifestDirect}
              />
            </div>
          </>
        ) : (
          /* VISTAS OPERATIVAS */
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

      {/* --- MODALES --- */}
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

      <HistoryDetailModal
        historyDetail={showHistoryModal ? historyDetail : null}
        onClose={() => setShowHistoryModal(false)}
        onViewManifest={(manifestData) => {
          setManifestData(manifestData);
          setShowQrManifest(true);
        }}
      />

      {/* Modal de Factura/Manifiesto de Salida */}
      {showQrManifest && (
        <ManifestInvoiceModal
          manifestData={manifestData}
          onClose={() => setShowQrManifest(false)}
        />
      )}
    </div>
  );
};

export default PedidosAdmin;
