import React, { useState, useEffect, useCallback } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
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

const PA_QUOTES = [
  { text: "Puede que no controles los hechos que ocurren, pero puedes decidir no dejarte derrotar por ellos.", author: "Maya Angelou" },
  { text: "La innovación diferencia a un líder de un seguidor.", author: "Steve Jobs" },
  { text: "Aquel que se exige mucho a sí mismo y espera poco de los demás, mantendrá lejos el resentimiento.", author: "Confucio" },
  { text: "Si hacemos el bien por interés, seremos astutos, pero nunca buenos.", author: "Cicerón" },
  { text: "Sé un criterio de calidad. Algunas personas no están acostumbradas a un ambiente donde se espera la excelencia.", author: "Steve Jobs" },
  { text: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.", author: "Aristóteles" },
  { text: "El principio de la sabiduría es la definición de los términos.", author: "Aristóteles" },
  { text: "La calidad no es un acto, es un hábito.", author: "Aristóteles" },
  { text: "Conocerse a uno mismo es el principio de toda sabiduría.", author: "Aristóteles" },
  { text: "La paciencia es amarga, pero sus frutos son dulces.", author: "Aristóteles" },
];

/** Devuelve una cita diferente según un índice offset (para evitar repetir la misma en todas las zonas) */
const getQuote = (shuffled, offset = 0) => shuffled[offset % shuffled.length];

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const PedidosAdmin = () => {
  // --- MULTI-SEDE ---
  const { sedeId, getSedeParam } = useSedeContext();

  // --- FRASES ROTATIVAS (cambian en cada carga del componente) ---
  const shuffledQuotes = React.useMemo(() => {
    return [...PA_QUOTES].sort(() => Math.random() - 0.5);
  }, []);

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
        const resPending = await ecommerceApi.get(
          `/pendientes`,
          { params: { ...Object.fromEntries(new URLSearchParams(sedeParam)) } },
        );
        const listPending = resPending.data.filter((o) => !o.is_assigned);
        setOrders(listPending);

        // 2. Sesiones Activas
        const resActive = await ecommerceApi.get(
          `/dashboard-activo`,
          { params: { ...Object.fromEntries(new URLSearchParams(sedeParam)) } },
        );
        setActiveSessions(resActive.data);

        const resAuditPending = await ecommerceApi.get(
          `/pendientes-auditoria`,
          { params: { ...Object.fromEntries(new URLSearchParams(sedeParam)) } },
        );
        setPendingAuditOrders(resAuditPending.data || []);

        const resPaymentPending = await ecommerceApi.get(
          `/pendientes-pago`,
          { params: { ...Object.fromEntries(new URLSearchParams(sedeParam)) } },
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
      const res = await ecommerceApi.get(
        `/pickers?${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/pickers?${getSedeParam()}`,
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      alert("Error cargando lista de pickers.");
    }
  };

  const handleConfirmAssignment = async (picker) => {
    try {
      await ecommerceApi.post(
        `/crear-sesion?${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/historial?${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/pendientes-auditoria?${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/pendientes-pago?${getSedeParam()}`,
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
      await ecommerceApi.post(
        `/marcar-pagado?${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/sesion-activa?id_picker=${session.picker_id}&include_removed=true&${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/historial-detalle?session_id=${session.id}&${getSedeParam()}`,
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
      const res = await ecommerceApi.get(
        `/historial-detalle?session_id=${session.id}&${getSedeParam()}`,
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
        sede_nombre: session.sede_nombre || null,
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
        {/* SELECTOR DE SEDE (integra rol + sede) */}
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
        <div className="pedidos-sidebar-footer">
          «{getQuote(shuffledQuotes, 0).text}»
          <strong>— {getQuote(shuffledQuotes, 0).author}</strong>
        </div>
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
              <div>
                <h1>📜 Historial de Sesiones</h1>
                <div className="pedidos-header-quote">
                  «{getQuote(shuffledQuotes, 3).text}» — {getQuote(shuffledQuotes, 3).author}
                </div>
              </div>
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
              <div>
                <h1>
                  {currentView === "pending"
                    ? "📦 Pedidos Pendientes"
                    : "🚀 Centro de Comando"}
                </h1>
                <div className="pedidos-header-quote">
                  {currentView === "pending"
                    ? `«${getQuote(shuffledQuotes, 1).text}» — ${getQuote(shuffledQuotes, 1).author}`
                    : `«${getQuote(shuffledQuotes, 2).text}» — ${getQuote(shuffledQuotes, 2).author}`}
                </div>
              </div>
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
