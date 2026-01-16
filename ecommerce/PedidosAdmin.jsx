import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { GestionPickers } from "./GestionPickers";
import AnaliticaPickers from "./AnaliticaPickers";
import {
  FaBox,
  FaArrowLeft,
  FaSync,
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserTag,
  FaRunning,
  FaHistory,
  FaChartLine,
  FaClock,
} from "react-icons/fa";
import "./PedidosAdmin.css";

// --- UTILS ---
const formatPrice = (amount) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// --- COMPONENTE TIMER EN VIVO ---
const LiveTimer = ({ startTime }) => {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startTime) return;
    const update = () => {
      const diff = Math.max(0, Date.now() - new Date(startTime).getTime());
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      setElapsed(hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`);
    };
    update();
    const i = setInterval(update, 60000);
    return () => clearInterval(i);
  }, [startTime]);

  return (
    <span className="pedidos-live-timer">
      <FaClock className="pedidos-icon-spacer" /> {elapsed || "0 min"}
    </span>
  );
};

// --- COMPONENTE PRINCIPAL ---
const PedidosAdmin = () => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ pending: 0, process: 0 });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("pending");

  // Estados Modal y Asignación
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickers, setPickers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // --- 1. DATA FETCHING ---
  const fetchStats = async () => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}`
      );
      const list = res.data;
      setStats({
        pending: list.filter((o) => !o.is_assigned).length,
        process: list.filter((o) => o.is_assigned).length,
      });
      return list;
    } catch (e) {
      console.error("Error fetching stats", e);
      return [];
    }
  };

  const fetchOrders = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        if (currentView === "completed") {
          // Carga pesada del historial con timestamp para evitar caché
          const [resHist] = await Promise.all([
            axios.get(
              `https://backend-woocommerce.vercel.app/api/orders/historial?t=${Date.now()}`
            ),
            fetchStats(),
          ]);
          setOrders(resHist.data);
        } else if (currentView === "pickers" || currentView === "analitica") {
          await fetchStats();
        } else {
          const list = await fetchStats();
          setOrders(list);
        }
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [currentView]
  );

  // Intervalo global
  useEffect(() => {
    setOrders([]); // Limpiar lista al cambiar de vista para mostrar spinner
    fetchOrders();

    // Actualización automática para TODAS las vistas
    // 10s para ver cambios en tiempo real en todos los paneles
    const interval = setInterval(() => fetchOrders(true), 10000);

    return () => clearInterval(interval);
  }, [currentView, fetchOrders]);

  // Intervalo detalle modal (solo en proceso para ver avance en vivo)
  useEffect(() => {
    let interval = null;
    if (selectedOrder && currentView === "process") {
      interval = setInterval(async () => {
        try {
          const realId = selectedOrder.id_pedido || selectedOrder.id;
          const res = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/${realId}?t=${Date.now()}`
          );
          setSelectedOrder((prev) => {
            if (!prev) return null;
            const prevId = prev.id_pedido || prev.id;
            if (prevId !== realId) return prev;
            return { ...prev, ...res.data };
          });
        } catch (error) {
          console.error("Error refresh details", error);
        }
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [selectedOrder, currentView]);

  // --- 2. FILTRADO ---
  const displayedList = useMemo(() => {
    let baseList = [];
    if (currentView === "pending") {
      baseList = orders.filter((o) => !o.is_assigned);
    } else if (currentView === "process") {
      baseList = orders.filter((o) => o.is_assigned);
    } else if (currentView === "completed") {
      baseList = orders;
    }

    return baseList.filter((order) => {
      const sLower = searchTerm.toLowerCase();
      const idReal = (order.id_pedido || order.id || "").toString();

      let fullName = order.nombre_picker || "";
      if (order.billing) {
        fullName = `${order.billing.first_name} ${order.billing.last_name}`;
      }
      fullName = fullName.toLowerCase();

      const matchText = idReal.includes(sLower) || fullName.includes(sLower);

      let matchDate = true;
      if (filterDate) {
        const dRaw = order.date_created || order.fecha_fin;
        if (dRaw) {
          matchDate = new Date(dRaw).toISOString().split("T")[0] === filterDate;
        }
      }

      let matchZone = true;
      if (filterZone && order.billing) {
        const zLower = filterZone.toLowerCase();
        const address = (order.billing.address_1 || "").toLowerCase();
        const city = (order.billing.city || "").toLowerCase();
        const hood = (
          order.billing.neighborhood ||
          order.billing.address_2 ||
          ""
        ).toLowerCase();
        matchZone =
          address.includes(zLower) ||
          city.includes(zLower) ||
          hood.includes(zLower);
      }

      return matchText && matchDate && matchZone;
    });
  }, [orders, currentView, searchTerm, filterDate, filterZone]);

  // --- 3. MANEJADORES ---
  const handleOrderClick = async (order) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    try {
      const realId = order.id_pedido || order.id;
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/${realId}`
      );
      // Fusionamos la info de la lista (reporte_snapshot) con el detalle fresco
      setSelectedOrder((prev) => ({ ...prev, ...res.data }));
    } catch (error) {
      console.error("Error loading details", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAssignClick = async () => {
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pickers"
      );
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      console.error(e);
    }
  };

  const confirmAssignment = async (picker) => {
    if (picker.estado_picker !== "disponible") {
      alert("Este picker ya está en un pedido.");
      return;
    }
    setAssigning(true);
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/asignar",
        {
          id_pedido: selectedOrder.id,
          id_picker: picker.id,
          nombre_picker: picker.nombre_completo,
        }
      );
      alert(`Pedido asignado a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedOrder(null);
      setOrders([]);
      fetchOrders();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setAssigning(false);
    }
  };

  const renderProgressBar = (order) => {
    if (!order.reporte_progress) return null;
    const total = order.line_items?.length || 1;
    const rec = order.reporte_progress.recolectados?.length || 0;
    const ret = order.reporte_progress.retirados?.length || 0;
    const pend = order.reporte_progress.pendientes?.length || 0;

    return (
      <div className="pedidos-progress-wrapper">
        <div className="pedidos-progress-stats">
          <span className="text-success">✔ {rec}</span>
          <span className="text-warning">⚠ {ret}</span>
          <span className="text-muted">⏳ {pend}</span>
        </div>
        <div className="pedidos-progress-track">
          <div
            className="pedidos-progress-fill success"
            style={{ width: `${(rec / total) * 100}%` }}
          />
          <div
            className="pedidos-progress-fill warning"
            style={{ width: `${(ret / total) * 100}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* SIDEBAR */}
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button" title="Salir">
            <FaArrowLeft />
          </Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Ecommerce</h2>
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">PEDIDOS</div>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "pending" ? "active" : ""
            }`}
            onClick={() => {
              setOrders([]);
              setCurrentView("pending");
            }}
          >
            <FaBox /> <span>Por Asignar</span>{" "}
            <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "process" ? "active" : ""
            }`}
            onClick={() => {
              setOrders([]);
              setCurrentView("process");
            }}
          >
            <FaRunning /> <span>En Proceso</span>{" "}
            <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "completed" ? "active" : ""
            }`}
            onClick={() => {
              setOrders([]);
              setCurrentView("completed");
            }}
          >
            <FaHistory /> <span>Historial</span>
          </button>

          <div className="pedidos-nav-label spacer">ADMIN</div>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "analitica" ? "active" : ""
            }`}
            onClick={() => setCurrentView("analitica")}
          >
            <FaChartLine /> <span>Centro Inteligencia</span>
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
        <div className="pedidos-layout-sidebar-footer">
          <p className="pedidos-footer-text">Merkahorro Admin © 2026</p>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="pedidos-layout-content">
        {currentView === "pickers" ? (
          <GestionPickers />
        ) : currentView === "analitica" ? (
          <AnaliticaPickers />
        ) : (
          <>
            <header className="pedidos-layout-header">
              <h1>📦 Gestión de Pedidos</h1>
              <button
                onClick={() => {
                  setOrders([]);
                  fetchOrders();
                }}
                className="pedidos-admin-refresh-btn"
              >
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar Lista
              </button>
            </header>

            <div className="pedidos-layout-body">
              {/* FILTROS */}
              <div className="pedidos-admin-filters-container">
                <div className="pedidos-admin-filter-group">
                  <label>
                    <FaSearch className="pedidos-icon-spacer" /> Buscar
                  </label>
                  <input
                    type="text"
                    className="pedidos-admin-filter-input"
                    placeholder="#123 o Nombre..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="pedidos-admin-filter-group">
                  <label>
                    <FaCalendarAlt className="pedidos-icon-spacer" /> Fecha
                  </label>
                  <input
                    type="date"
                    className="pedidos-admin-filter-input"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  />
                </div>
                <div className="pedidos-admin-filter-group">
                  <label>
                    <FaMapMarkerAlt className="pedidos-icon-spacer" /> Zona
                  </label>
                  <input
                    type="text"
                    className="pedidos-admin-filter-input"
                    placeholder="Ej: Centro..."
                    value={filterZone}
                    onChange={(e) => setFilterZone(e.target.value)}
                  />
                </div>
                <div className="pedidos-filter-actions">
                  <button
                    className="pedidos-btn-clear"
                    onClick={() => {
                      setSearchTerm("");
                      setFilterDate("");
                      setFilterZone("");
                    }}
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* GRID PEDIDOS CON SPINNER DE CARGA */}
              {loading && orders.length === 0 ? (
                <div className="pedidos-main-loading">
                  <div className="pedidos-spinner-large"></div>
                  <div className="pedidos-spinner-text">
                    Cargando pedidos...
                  </div>
                </div>
              ) : (
                <div className="pedidos-admin-orders-grid">
                  {displayedList.length === 0 ? (
                    <div className="pedidos-empty-list-container">
                      <h3>No se encontraron pedidos.</h3>
                    </div>
                  ) : (
                    displayedList.map((order) => (
                      <div
                        key={order.id}
                        className="pedidos-admin-order-card"
                        onClick={() => handleOrderClick(order)}
                      >
                        {/* HEADER TARJETA */}
                        <div className="pedidos-admin-card-header">
                          <span className="pedidos-admin-order-id">
                            #{order.id_pedido || order.id}
                          </span>
                          {currentView === "process" && (
                            <span className="pedidos-badge-busy">
                              🏃 {order.assigned_to}
                            </span>
                          )}
                          {currentView === "completed" && (
                            <>
                              {order.reporte_snapshot?.retirados?.length > 0 ? (
                                <span className="pedidos-badge-busy warning">
                                  ⚠️ {order.reporte_snapshot.retirados.length}{" "}
                                  Falta
                                </span>
                              ) : (
                                <span className="pedidos-badge-ok">
                                  ✅ Completo
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* BODY TARJETA (Flexible) */}
                        <div className="pedidos-admin-card-body">
                          <div className="pedidos-card-info">
                            {currentView === "completed" ? (
                              <>
                                <h3>Picker: {order.nombre_picker || "N/A"}</h3>
                                <p>
                                  ⏱ Tiempo: {order.tiempo_formateado || "0 min"}
                                </p>
                                <p>
                                  📅{" "}
                                  {new Date(order.fecha_fin).toLocaleString()}
                                </p>
                              </>
                            ) : (
                              <>
                                <h3>
                                  {order.billing?.first_name}{" "}
                                  {order.billing?.last_name}
                                </h3>
                                <p>🛒 {order.line_items?.length} items</p>
                                <p>💰 ${order.total}</p>
                                <p>
                                  <FaMapMarkerAlt className="pedidos-icon-red" />{" "}
                                  {order.billing?.city}{" "}
                                  {order.billing?.neighborhood &&
                                    `- ${order.billing.neighborhood}`}
                                </p>
                                {currentView === "process" &&
                                  renderProgressBar(order)}
                              </>
                            )}
                          </div>

                          {/* FOOTER TARJETA */}
                          <div className="pedidos-card-footer">
                            {currentView === "pending" && (
                              <button
                                className="pedidos-admin-refresh-btn pedidos-btn-assign-mini"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(order);
                                  handleAssignClick();
                                }}
                              >
                                Asignar Picker
                              </button>
                            )}
                            {currentView === "process" && order.started_at && (
                              <div className="pedidos-process-timer">
                                <LiveTimer startTime={order.started_at} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* MODAL DETALLE CON SPINNER Y REPORTE SEPARADO */}
      {selectedOrder && (
        <div
          className="pedidos-modal-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="pedidos-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* SPINNER DENTRO DEL MODAL */}
            {detailLoading && (
              <div className="pedidos-modal-loading-overlay">
                <div className="pedidos-spinner-large"></div>
                <div className="pedidos-spinner-text">
                  Cargando detalles y productos...
                </div>
              </div>
            )}

            <div className="pedidos-modal-header">
              <h2>Pedido #{selectedOrder.id}</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setSelectedOrder(null)}
              >
                &times;
              </button>
            </div>

            <div className="pedidos-modal-body">
              {/* Info General */}
              <div className="pedidos-detail-row">
                <div className="pedidos-detail-section">
                  <h4>👤 Cliente</h4>
                  <p>
                    <strong>Nombre:</strong> {selectedOrder.billing?.first_name}{" "}
                    {selectedOrder.billing?.last_name}
                  </p>
                  <p>
                    <strong>Email:</strong> {selectedOrder.billing?.email}
                  </p>
                  <p>
                    <strong>Tel:</strong> {selectedOrder.billing?.phone}
                  </p>
                  <p>
                    <strong>Ciudad:</strong> {selectedOrder.billing?.city}
                  </p>
                  <p>
                    <strong>Método Pago:</strong>{" "}
                    {selectedOrder.payment_method_title}
                  </p>
                </div>
                <div className="pedidos-detail-section">
                  <h4>📍 Envío</h4>
                  {(() => {
                    const hasShipping =
                      selectedOrder.shipping &&
                      selectedOrder.shipping.address_1;
                    const addr = hasShipping
                      ? selectedOrder.shipping
                      : selectedOrder.billing;
                    return (
                      <>
                        <p>
                          <strong>Calle:</strong> {addr?.address_1}
                        </p>
                        {addr?.address_2 && (
                          <p>
                            <strong>Detalle:</strong> {addr.address_2}
                          </p>
                        )}
                        <p>
                          <strong>Ubicación:</strong> {addr?.city},{" "}
                          {addr?.state}
                        </p>
                        {addr?.postcode && (
                          <p>
                            <strong>CP:</strong> {addr.postcode}
                          </p>
                        )}
                      </>
                    );
                  })()}
                  {selectedOrder.customer_note && (
                    <div className="pedidos-customer-note">
                      📝 "{selectedOrder.customer_note}"
                    </div>
                  )}
                </div>
                {currentView === "pending" && (
                  <div className="pedidos-detail-section center-flex">
                    <button
                      className="pedidos-admin-refresh-btn"
                      onClick={() => {
                        setShowAssignModal(true);
                        handleAssignClick();
                      }}
                    >
                      🚚 Asignar Picker
                    </button>
                  </div>
                )}
                {currentView === "completed" && (
                  <div className="pedidos-detail-section">
                    <h4>🏁 Gestión</h4>
                    <p>
                      <strong>Picker:</strong>{" "}
                      {selectedOrder.nombre_picker || "N/A"}
                    </p>
                    <p>
                      <strong>Tiempo Total:</strong>{" "}
                      {selectedOrder.tiempo_formateado || "N/A"}
                    </p>
                    <p>
                      <strong>Finalizado:</strong>{" "}
                      {selectedOrder.fecha_fin
                        ? new Date(selectedOrder.fecha_fin).toLocaleString()
                        : "N/A"}
                    </p>
                  </div>
                )}
              </div>

              {/* Lógica de Renderizado Diferenciada */}
              {currentView === "completed" || currentView === "process" ? (
                (() => {
                  const isProcess = currentView === "process";
                  // FIX: Priorizar reporte_items (que viene del detalle fresco) sobre reporte_progress (que viene de la lista y puede estar stale)
                  const report = selectedOrder.reporte_items ||
                    selectedOrder.reporte_progress ||
                    selectedOrder.reporte_snapshot || {
                      recolectados: [],
                      retirados: [],
                    };
                  const items = selectedOrder.line_items || [];

                  const removedItems = items.filter((item) =>
                    report.retirados?.some((r) => r.id === item.id)
                  );

                  const collectedItems = items.filter((item) =>
                    report.recolectados?.some((r) => r.id === item.id)
                  );

                  // Items sin estado (pendientes si es proceso, desconocidos si completado)
                  const pendingItems = items.filter(
                    (item) =>
                      !removedItems.includes(item) &&
                      !collectedItems.includes(item)
                  );

                  return (
                    <div className="pedidos-history-report-container">
                      {isProcess && (
                        <div
                          className="pedidos-detail-section report-success"
                          style={{ marginBottom: 30 }}
                        >
                          <h4>🚀 Progreso en Tiempo Real</h4>
                          {selectedOrder.started_at && (
                            <div className="pedidos-mt-5">
                              <LiveTimer startTime={selectedOrder.started_at} />
                            </div>
                          )}
                          <div className="pedidos-report-stats-row">
                            <span className="pedidos-stat-success">
                              ✔ {collectedItems.length} Listos
                            </span>
                            <span className="pedidos-stat-danger">
                              ⚠️ {removedItems.length} Retirados
                            </span>
                            <span
                              className="text-muted"
                              style={{ fontWeight: 800 }}
                            >
                              ⏳ {pendingItems.length} Pendientes
                            </span>
                          </div>
                        </div>
                      )}

                      {/* SECCIÓN RETIRADOS (En Rojo) */}
                      {removedItems.length > 0 && (
                        <div className="pedidos-history-section removed">
                          <h4 className="history-section-title danger">
                            🚫 No Enviados / Retirados ({removedItems.length})
                          </h4>
                          <div className="pedidos-products-grid">
                            {removedItems.map((item) => {
                              const reportData = report.retirados.find(
                                (r) => r.id === item.id
                              );
                              return (
                                <div
                                  key={item.id}
                                  className="pedidos-product-card history-removed"
                                >
                                  <div className="pedidos-product-img-wrapper">
                                    {item.image_src ? (
                                      <img
                                        src={item.image_src}
                                        className="pedidos-product-img grayscale"
                                        alt={item.name}
                                      />
                                    ) : (
                                      <span>📷</span>
                                    )}
                                    <span className="history-qty-badge">
                                      x{item.quantity}
                                    </span>
                                  </div>
                                  <div className="pedidos-product-details">
                                    <div className="pedidos-product-name">
                                      {item.name}
                                    </div>
                                    <div className="history-reason-box">
                                      <span className="reason-label">
                                        Motivo:
                                      </span>
                                      <span className="reason-text">
                                        {reportData?.reason ||
                                          "No especificado"}
                                      </span>
                                    </div>
                                    <div className="pedidos-product-price strikethrough">
                                      {formatPrice(item.total)}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* SECCIÓN RECOLECTADOS (En Verde) */}
                      {collectedItems.length > 0 && (
                        <div className="pedidos-history-section collected">
                          <h4 className="history-section-title success">
                            ✅{" "}
                            {isProcess
                              ? "Ya Recolectados"
                              : "Enviados Exitosamente"}{" "}
                            ({collectedItems.length})
                          </h4>
                          <div className="pedidos-products-grid">
                            {collectedItems.map((item) => (
                              <div
                                key={item.id}
                                className="pedidos-product-card history-picked"
                              >
                                <div className="pedidos-product-img-wrapper">
                                  {item.image_src ? (
                                    <img
                                      src={item.image_src}
                                      className="pedidos-product-img"
                                      alt={item.name}
                                    />
                                  ) : (
                                    <span>📷</span>
                                  )}
                                  <span className="history-qty-badge success">
                                    x{item.quantity}
                                  </span>
                                </div>
                                <div className="pedidos-product-details">
                                  <div className="pedidos-product-name">
                                    {item.name}
                                  </div>
                                  <div className="pedidos-product-price">
                                    {formatPrice(item.total)}
                                  </div>
                                  <div className="history-check-label">
                                    ✔ {isProcess ? "Listo" : "Agregado"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PENDIENTES (Solo visible si hay y en proceso es importante) */}
                      {pendingItems.length > 0 && (
                        <div
                          className="pedidos-history-section"
                          style={{ marginTop: 30 }}
                        >
                          <h4
                            className="history-section-title"
                            style={{
                              color: "#64748b",
                              borderBottomColor: "#cbd5e1",
                            }}
                          >
                            ⏳ Pendientes por Recolectar ({pendingItems.length})
                          </h4>
                          <div className="pedidos-products-grid">
                            {pendingItems.map((item) => (
                              <div
                                key={item.id}
                                className="pedidos-product-card"
                                style={{ opacity: 0.8 }}
                              >
                                <div className="pedidos-product-img-wrapper">
                                  <span className="pedidos-product-qty-tag">
                                    {item.quantity}
                                  </span>
                                  {item.image_src ? (
                                    <img
                                      src={item.image_src}
                                      className="pedidos-product-img"
                                      alt={item.name}
                                    />
                                  ) : (
                                    <span>📷</span>
                                  )}
                                </div>
                                <div className="pedidos-product-details">
                                  <div className="pedidos-product-name">
                                    {item.name}
                                  </div>
                                  <div className="pedidos-product-price">
                                    {formatPrice(item.total)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                // --- VISTA PENDIENTE (SOLO LISTA SIMPLE) ---
                <>
                  <div className="pedidos-products-section-title">
                    🛒 Productos Solicitados ({selectedOrder.line_items?.length}
                    )
                  </div>
                  <div className="pedidos-products-grid">
                    {selectedOrder.line_items?.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="pedidos-product-card"
                      >
                        <div className="pedidos-product-img-wrapper">
                          <span className="pedidos-product-qty-tag">
                            {item.quantity}
                          </span>
                          {item.image_src ? (
                            <img
                              src={item.image_src}
                              className="pedidos-product-img"
                              alt={item.name}
                            />
                          ) : (
                            <span>📷</span>
                          )}
                        </div>
                        <div className="pedidos-product-details">
                          <div className="pedidos-product-name">
                            {item.name}
                          </div>
                          <div className="pedidos-product-price">
                            {formatPrice(item.total)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR PICKER */}
      {showAssignModal && (
        <div className="pedidos-modal-overlay high-z">
          <div className="pedidos-modal-content assign-modal">
            <div className="pedidos-modal-header">
              <h2>Asignar Picker</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setShowAssignModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="pedidos-modal-body">
              <div className="pedidos-pickers-list">
                {pickers.map((r) => (
                  <div
                    key={r.id}
                    className={`pedidos-picker-card ${r.estado_picker}`}
                    onClick={() => confirmAssignment(r)}
                  >
                    <div>
                      <strong>{r.nombre_completo}</strong>
                      <br />
                      <small>{r.email}</small>
                    </div>
                    <div>
                      {r.estado_picker === "disponible" ? (
                        <span className="pedidos-badge-ok">Libre</span>
                      ) : (
                        <span className="pedidos-badge-busy">Ocupado</span>
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
