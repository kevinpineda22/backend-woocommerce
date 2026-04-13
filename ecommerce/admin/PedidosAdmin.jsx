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
  FaUserCircle,
  FaTrashAlt,
} from "react-icons/fa";

import { supabase } from "../../../supabaseClient";

// --- REAL-TIME WEBHOOKS ---
import { useRealtimeOrders } from "../shared/useRealtimeOrders";

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
import ConfirmModal from "../shared/ConfirmModal";
import CancelledOrdersView from "./CancelledOrdersView";
import { AnimatePresence, motion } from "framer-motion";

// --- MULTI-SEDE ---
import { useSedeContext } from "../shared/SedeContext";
import { SedeSelector } from "../shared/SedeSelector";

import "./PedidosAdmin.css";

const PA_QUOTES = [
  {
    text: "Puede que no controles los hechos que ocurren, pero puedes decidir no dejarte derrotar por ellos.",
    author: "Maya Angelou",
  },
  {
    text: "La innovación diferencia a un líder de un seguidor.",
    author: "Steve Jobs",
  },
  {
    text: "Aquel que se exige mucho a sí mismo y espera poco de los demás, mantendrá lejos el resentimiento.",
    author: "Confucio",
  },
  {
    text: "Si hacemos el bien por interés, seremos astutos, pero nunca buenos.",
    author: "Cicerón",
  },
  {
    text: "Sé un criterio de calidad. Algunas personas no están acostumbradas a un ambiente donde se espera la excelencia.",
    author: "Steve Jobs",
  },
  {
    text: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.",
    author: "Aristóteles",
  },
  {
    text: "El principio de la sabiduría es la definición de los términos.",
    author: "Aristóteles",
  },
  { text: "La calidad no es un acto, es un hábito.", author: "Aristóteles" },
  {
    text: "Conocerse a uno mismo es el principio de toda sabiduría.",
    author: "Aristóteles",
  },
  {
    text: "La paciencia es amarga, pero sus frutos son dulces.",
    author: "Aristóteles",
  },
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

  // --- MOBILE SIDEBAR ---
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [pickers, setPickers] = useState([]);

  // Modales de Gestión
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isFetchingPickers, setIsFetchingPickers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Modales de Detalle
  const [liveSessionDetail, setLiveSessionDetail] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState(null);

  const [historyDetail, setHistoryDetail] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Estados visual QR Histórico (Factura)
  const [showQrManifest, setShowQrManifest] = useState(false);
  const [manifestData, setManifestData] = useState(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // UI Premium
  const [toasts, setToasts] = useState([]);
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    session: null,
  });

  const showToast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // --- DATA FETCHING ---
  const fetchData = useCallback(
    async (isBackground = false, forceSync = false) => {
      if (!isBackground) setLoading(true);
      const sedeParam = getSedeParam();
      const params = { ...Object.fromEntries(new URLSearchParams(sedeParam)) };

      if (forceSync) {
        params.force = "true";
      }

      try {
        // Todas las llamadas en PARALELO (antes eran secuenciales)
        const [resPending, resActive, resAuditPending, resPaymentPending] =
          await Promise.all([
            ecommerceApi.get(`/pendientes`, { params }),
            ecommerceApi.get(`/dashboard-activo`, { params }),
            ecommerceApi.get(`/pendientes-auditoria`, { params }),
            ecommerceApi.get(`/pendientes-pago`, { params }),
          ]);

        const listPending = resPending.data.filter((o) => !o.is_assigned);
        setOrders(listPending);
        setActiveSessions(resActive.data);
        setPendingAuditOrders(resAuditPending.data || []);
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

    // REALTIME SUPABASE (cambios en DB de sesiones/asignaciones)
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

  // REAL-TIME WEBHOOKS: Refrescar al instante cuando WooCommerce envía un pedido nuevo
  useRealtimeOrders(() => {
    console.log(
      "⚡ [WEBHOOK-RT] Nuevo pedido detectado, refrescando dashboard...",
    );
    fetchData(true);
  }, sedeId);

  // --- HANDLERS: ASIGNACIÓN DE PICKERS ---
  const handleOpenAssignModal = async () => {
    if (selectedIds.size === 0) return;
    setIsFetchingPickers(true);
    try {
      const res = await ecommerceApi.get(`/pickers?${getSedeParam()}`);
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      showToast("Error cargando lista de pickers.", "error");
    } finally {
      setIsFetchingPickers(false);
    }
  };

  const handleAssignSingleOrder = async (order) => {
    setSelectedIds(new Set([order.id]));
    setIsFetchingPickers(true);
    try {
      const res = await ecommerceApi.get(`/pickers?${getSedeParam()}`);
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      showToast("Error cargando lista de pickers.", "error");
    } finally {
      setIsFetchingPickers(false);
    }
  };

  const handleConfirmAssignment = async (picker) => {
    setIsAssigning(true);
    try {
      await ecommerceApi.post(`/crear-sesion?${getSedeParam()}`, {
        id_picker: picker.id,
        ids_pedidos: Array.from(selectedIds),
      });
      showToast(`✅ Misión asignada a ${picker.nombre_completo}`, "success");
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      showToast(
        "Error al asignar: " + (error.response?.data?.error || error.message),
        "error",
      );
    } finally {
      setIsAssigning(false);
    }
  };

  // --- HANDLERS: HISTORIAL Y DETALLES ---
  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await ecommerceApi.get(`/historial?${getSedeParam()}`);
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
      const res = await ecommerceApi.get(`/pendientes-pago?${getSedeParam()}`);
      setPaymentPendingOrders(res.data || []);
      setStats((prev) => ({ ...prev, paymentPending: res.data?.length || 0 }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLERS: PEDIDOS CANCELADOS ---
  const fetchCancelledOrders = async () => {
    setLoading(true);
    try {
      const res = await ecommerceApi.get(
        `/pedidos-cancelados?${getSedeParam()}`,
      );
      setCancelledOrders(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (order, motivo) => {
    const empleado = JSON.parse(localStorage.getItem("empleado_info") || "{}");
    const adminName = empleado.nombre || "Admin";
    const adminEmail = localStorage.getItem("correo_empleado") || "";

    setIsCancelling(true);
    try {
      await ecommerceApi.post(`/cancelar-pedido?${getSedeParam()}`, {
        order_id: order.id,
        motivo,
        admin_name: adminName,
        admin_email: adminEmail,
        sede_id: order.sede_id || null,
      });
      showToast(`Pedido #${order.id} cancelado correctamente.`, "success");
      fetchData();
    } catch (error) {
      const msg =
        error.response?.data?.error || error.message || "Error desconocido";
      showToast(msg, "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRestoreOrder = async (record) => {
    const empleado = JSON.parse(localStorage.getItem("empleado_info") || "{}");
    const adminName = empleado.nombre || "Admin";

    if (
      !window.confirm(
        `¿Restaurar pedido #${record.order_id}? Volverá al panel de pendientes.`,
      )
    )
      return;

    setIsRestoring(true);
    try {
      await ecommerceApi.post(`/restaurar-pedido?${getSedeParam()}`, {
        cancel_record_id: record.id,
        admin_name: adminName,
      });
      showToast(
        `Pedido #${record.order_id} restaurado correctamente.`,
        "success",
      );
      fetchCancelledOrders();
      fetchData();
    } catch (error) {
      const msg =
        error.response?.data?.error || error.message || "Error desconocido";
      showToast(msg, "error");
    } finally {
      setIsRestoring(false);
    }
  };

  // --- MARCAR COMO PAGADO (MODAL CONFIRMACIÓN) ---
  const handleMarkAsPaidRequested = (session) => {
    setConfirmConfig({ isOpen: true, session });
  };

  const handleMarkAsPaidConfirm = async () => {
    if (!confirmConfig.session) return;
    try {
      await ecommerceApi.post(`/marcar-pagado?${getSedeParam()}`, {
        session_id: confirmConfig.session.id,
      });
      showToast("✅ Pago registrado con éxito.", "success");
      fetchPaymentPending();
      fetchHistory(); // Actualizar historial
    } catch (error) {
      showToast("Error al registrar pago: " + error.message, "error");
    } finally {
      setConfirmConfig({ isOpen: false, session: null });
    }
  };

  const handleViewLiveDetail = async (session) => {
    setLoadingDetailId(session.session_id);
    try {
      const res = await ecommerceApi.get(
        `/sesion-activa?id_picker=${session.picker_id}&include_removed=true&${getSedeParam()}`,
      );
      setLiveSessionDetail({ sessionInfo: session, routeData: res.data });
      setShowLiveModal(true);
    } catch (e) {
      showToast(
        "No se pudo cargar detalles. Es posible que la sesión haya finalizado.",
        "error",
      );
      fetchData();
    } finally {
      setLoadingDetailId(null);
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
      showToast("Error cargando detalles del historial.", "error");
    }
  };

  const handleViewManifestDirect = async (session) => {
    try {
      const res = await ecommerceApi.get(
        `/historial-detalle?session_id=${session.id}&${getSedeParam()}`,
      );

      const { final_snapshot, metadata, products_map, orders_info } = res.data;
      if (!final_snapshot) {
        showToast(
          "Esta sesión no tiene certificado de salida (no ha sido auditada o es antigua).",
          "warning",
        );
        return;
      }

      // ✅ Mergear códigos de barras del products_map con los items del snapshot
      // Prioridad: barcode_sku_um (SKU+UM validado en SIESA) > datos_salida > barcode general > fallback
      const enrichedSnapshot = { ...final_snapshot };
      // Construir mapa de orders_info para enriquecer con meta_data (cédula, etc.)
      const ordersInfoMap = {};
      if (orders_info) {
        orders_info.forEach((oi) => {
          ordersInfoMap[oi.id] = oi;
        });
      }
      if (products_map && enrichedSnapshot.orders) {
        enrichedSnapshot.orders = enrichedSnapshot.orders.map((order) => {
          const orderInfo = ordersInfoMap[order.id] || {};
          return {
            ...order,
            meta_data: order.meta_data || orderInfo.meta_data || [],
            billing: order.billing || orderInfo.billing,
            shipping: order.shipping || orderInfo.shipping,
            items: order.items.map((item) => {
              const pm = products_map[item.id] || {};
              return {
                ...item,
                barcode:
                  pm.barcode_sku_um ||
                  item.barcode ||
                  pm.barcode ||
                  item.sku ||
                  item.id,
                unidad_medida: pm.unidad_medida || item.unidad_medida || "",
              };
            }),
          };
        });
      }

      setManifestData({
        ...enrichedSnapshot,
        session_id: metadata.session_id,
        picker: metadata.picker_name || "Desconocido",
        sede_nombre: session.sede_nombre || null,
      });
      setShowQrManifest(true);
    } catch (e) {
      showToast("Error cargando certificado.", "error");
    }
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* MOBILE MENU TOGGLE */}
      <button
        className={`pedidos-mobile-toggle ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label="Toggle menu"
      >
        <span />
        <span />
        <span />
      </button>

      {/* SIDEBAR OVERLAY (mobile) */}
      {sidebarOpen && (
        <div
          className="pedidos-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`pedidos-layout-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button">
            <FaArrowLeft />
          </Link>
          <FaUserCircle className="pedidos-layout-avatar" />
          <h2 className="pedidos-layout-sidebar-title">Admin Picking</h2>
        </div>

        <div className="pedidos-sede-selector-wrapper">
          <SedeSelector compact />
        </div>

        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">Operación</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "pending" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("pending");
              setSidebarOpen(false);
            }}
          >
            <FaBox /> <span>Por Asignar</span>
            <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "process" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("process");
              setSidebarOpen(false);
            }}
          >
            <FaRunning /> <span>En Proceso</span>
            <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>

          <div className="pedidos-nav-label">Auditoría</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "audit_pending" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("audit_pending");
              fetchPendingAudit();
              setSidebarOpen(false);
            }}
          >
            <FaClipboardCheck /> <span>Pendiente Auditoría</span>
            <span className="pedidos-badge-count-blue">
              {stats.auditPending || 0}
            </span>
          </button>

          <div className="pedidos-nav-label">Pagos</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "payment_pending" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("payment_pending");
              fetchPaymentPending();
              setSidebarOpen(false);
            }}
          >
            <FaMoneyBillWave /> <span>Pendiente Pago</span>
            <span className="pedidos-badge-count-red">
              {stats.paymentPending || 0}
            </span>
          </button>

          <div className="pedidos-nav-label">Historial</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "history" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("history");
              fetchHistory();
              setSidebarOpen(false);
            }}
          >
            <FaHistory /> <span>Historial</span>
          </button>

          <div className="pedidos-nav-label">Administración</div>
          {/* TODO: Habilitar cuando Inteligencia tenga datos reales
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "analitica" ? "active" : ""}`}
            onClick={() => { setCurrentView("analitica"); setSidebarOpen(false); }}
          >
            <FaChartLine /> <span>Inteligencia</span>
          </button>
          */}
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "pickers" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("pickers");
              setSidebarOpen(false);
            }}
          >
            <FaUserTag /> <span>Pickers</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "cancelled" ? "active" : ""}`}
            onClick={() => {
              setCurrentView("cancelled");
              fetchCancelledOrders();
              setSidebarOpen(false);
            }}
          >
            <FaTrashAlt /> <span>Pedidos Cancelados</span>
          </button>
        </nav>
        <div className="pedidos-sidebar-footer">
          «{getQuote(shuffledQuotes, 0).text}»
          <strong>— {getQuote(shuffledQuotes, 0).author}</strong>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="pedidos-layout-content">
        {currentView === "cancelled" ? (
          <>
            <header className="pedidos-layout-header">
              <div>
                <h1>🗑️ Pedidos Cancelados</h1>
                <div className="pedidos-header-quote">
                  Registro de pedidos cancelados desde el panel de
                  administración
                </div>
              </div>
            </header>
            <div className="pedidos-layout-body">
              <CancelledOrdersView
                cancelledOrders={cancelledOrders}
                loading={loading}
                onRefresh={fetchCancelledOrders}
                onRestore={handleRestoreOrder}
                isRestoring={isRestoring}
              />
            </div>
          </>
        ) : currentView === "pickers" ? (
          <GestionPickers />
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
            onMarkAsPaid={handleMarkAsPaidRequested}
          />
        ) : currentView === "history" ? (
          /* VISTA DE HISTORIAL */
          <>
            <header className="pedidos-layout-header">
              <div>
                <h1>📜 Historial de Sesiones</h1>
                <div className="pedidos-header-quote">
                  «{getQuote(shuffledQuotes, 3).text}» —{" "}
                  {getQuote(shuffledQuotes, 3).author}
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
                  isFetchingPickers={isFetchingPickers}
                  onForceSync={() => fetchData(false, true)}
                  onCancelOrder={handleCancelOrder}
                  isCancelling={isCancelling}
                />
              ) : (
                <ActiveSessionsView
                  sessions={activeSessions}
                  onViewDetail={handleViewLiveDetail}
                  loadingDetailId={loadingDetailId}
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
        onClose={() => !isAssigning && setShowAssignModal(false)}
        onConfirm={handleConfirmAssignment}
        isAssigning={isAssigning}
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

      {/* COMPONENTE DE CONFIRMACION */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title="💵 Confirmar Recepción de Pago"
        message={
          confirmConfig.session
            ? `¿Confirmas físicamente haber recibido el dinero del picker ${confirmConfig.session.picker}? Una vez procesado, este registro pasará al Historial de Sesiones Finalizadas y no habrá vuelta atrás.`
            : ""
        }
        confirmText="Confirmar Pago"
        cancelText="Volver"
        onConfirm={handleMarkAsPaidConfirm}
        onCancel={() => setConfirmConfig({ isOpen: false, session: null })}
      />

      {/* TOAST ESTILO GLOBAL */}
      <div className="pa-toast-container">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`pa-toast-item pa-toast-${t.type === "success" ? "success" : t.type === "error" ? "error" : "warning"}`}
            >
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PedidosAdmin;
