import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { GestionRecolectoras } from "./GestionRecolectoras";
import {
  FaBox,
  FaArrowLeft,
  FaSignOutAlt,
  FaSync,
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserTag,
  FaClock,
  FaCheckCircle,
} from "react-icons/fa";
import "./PedidosAdmin.css";

const PedidosAdmin = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("orders");

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recolectoras, setRecolectoras] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pendientes"
      );
      setOrders(response.data);
    } catch (error) {
      console.error("Error al obtener pedidos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleOrderClick = async (order) => {
    setSelectedOrder(order); // Show basic info immediately
    setDetailLoading(true);
    try {
      const response = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/${order.id}`
      );
      setSelectedOrder(response.data);
    } catch (error) {
      console.error("Error loading order details", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setDetailLoading(false);
  };

  // Función para cargar recolectoras desde Supabase (vía tu Backend)
  const fetchRecolectoras = async () => {
    try {
      const res = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/recolectoras"
      );
      setRecolectoras(res.data);
    } catch (error) {
      console.error("Error al cargar recolectoras", error);
    }
  };

  // Abrir el proceso de asignación
  const handleAssignClick = () => {
    fetchRecolectoras();
    setShowAssignModal(true);
  };

  // Ejecutar la asignación final
  const confirmAssignment = async (recolectora) => {
    if (recolectora.estado_recolectora !== "disponible") {
      alert("Esta recolectora ya está en una misión.");
      return;
    }

    try {
      setAssigning(true);
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/asignar",
        {
          id_pedido: selectedOrder.id,
          id_recolectora: recolectora.id,
          nombre_recolectora: recolectora.nombre_completo,
        }
      );

      alert(
        `Pedido #${selectedOrder.id} asignado a ${recolectora.nombre_completo}`
      );
      setShowAssignModal(false);
      closeModal();
      fetchOrders(); // Refrescar lista principal
    } catch (error) {
      alert("Error al asignar: " + error.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignCollector = () => {
    handleAssignClick();
  };

  // Filter Logic
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const searchLower = searchTerm.toLowerCase();
      const fullName =
        `${order.billing.first_name} ${order.billing.last_name}`.toLowerCase();
      const idMatch = order.id.toString().includes(searchLower);
      const nameMatch = fullName.includes(searchLower);

      let dateMatch = true;
      if (filterDate) {
        const orderDate = new Date(order.date_created)
          .toISOString()
          .split("T")[0];
        dateMatch = orderDate === filterDate;
      }

      let zoneMatch = true;
      if (filterZone) {
        const zoneLower = filterZone.toLowerCase();
        const address = (order.billing.address_1 || "").toLowerCase();
        const city = (order.billing.city || "").toLowerCase();
        const neighborhood = (
          order.billing.neighborhood ||
          order.billing.address_2 ||
          ""
        ).toLowerCase();
        zoneMatch =
          address.includes(zoneLower) ||
          city.includes(zoneLower) ||
          neighborhood.includes(zoneLower);
      }

      return (idMatch || nameMatch) && dateMatch && zoneMatch;
    });
  }, [orders, searchTerm, filterDate, filterZone]);

  return (
    <div className="pedidos-layout-main-container">
      {/* Sidebar - Inspired by AdminTrazabilidad */}
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link
            to="/acceso"
            className="pedidos-back-button"
            title="Volver al acceso"
          >
            <FaArrowLeft />
          </Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Ecommerce</h2>
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "orders" ? "active" : ""
            }`}
            onClick={() => setCurrentView("orders")}
          >
            <FaBox size={18} /> <span>Gestión Pedidos</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${
              currentView === "recolectoras" ? "active" : ""
            }`}
            onClick={() => setCurrentView("recolectoras")}
          >
            <FaUserTag size={18} /> <span>Configuración</span>
          </button>
        </nav>
        <div className="pedidos-layout-sidebar-footer">
          <p style={{ marginTop: "1rem" }}>Merkahorro Admin © 2026</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="pedidos-layout-content">
        {currentView === "recolectoras" ? (
          <GestionRecolectoras />
        ) : (
          <>
            {/* Sticky Header */}
            <header className="pedidos-layout-header">
              <div
                style={{ display: "flex", alignItems: "center", gap: "15px" }}
              >
                <h1>📦 Gestión de Pedidos</h1>
              </div>

              <button
                onClick={fetchOrders}
                className="pedidos-admin-refresh-btn"
                title="Recargar lista"
              >
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar Lista
              </button>
            </header>

            {/* Scrollable Body Content */}
            <div className="pedidos-layout-body">
              {/* Filters Section */}
              <div className="pedidos-admin-filters-container">
                <div className="pedidos-admin-filter-group">
                  <label>
                    <FaSearch style={{ marginRight: 5 }} /> Buscar (ID o
                    Cliente)
                  </label>
                  <input
                    type="text"
                    className="pedidos-admin-filter-input"
                    placeholder="#123 o Juan Pérez"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="pedidos-admin-filter-group">
                  <label>
                    <FaCalendarAlt style={{ marginRight: 5 }} /> Fecha
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
                    <FaMapMarkerAlt style={{ marginRight: 5 }} /> Zona / Barrio
                  </label>
                  <input
                    type="text"
                    className="pedidos-admin-filter-input"
                    placeholder="Ej: Centro..."
                    value={filterZone}
                    onChange={(e) => setFilterZone(e.target.value)}
                  />
                </div>

                <div
                  className="pedidos-admin-filter-group"
                  style={{ flex: "0 0 auto", justifyContent: "flex-end" }}
                >
                  <button
                    className="pedidos-admin-refresh-btn"
                    style={{
                      background: "#95a5a6",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                    }}
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

              {/* Orders Grid */}
              {loading && orders.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "50px",
                    color: "#64748b",
                  }}
                >
                  <h2>Cargando pedidos...</h2>
                </div>
              ) : (
                <div className="pedidos-admin-orders-grid">
                  {filteredOrders.length === 0 ? (
                    <div
                      style={{
                        gridColumn: "1/-1",
                        textAlign: "center",
                        padding: "40px",
                        color: "#7f8c8d",
                      }}
                    >
                      <h3>No se encontraron pedidos con estos filtros.</h3>
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        className={`pedidos-admin-order-card status-${order.status}`}
                        onClick={() => handleOrderClick(order)}
                      >
                        <div className="pedidos-admin-card-header">
                          <span className="pedidos-admin-order-id">
                            #{order.id}
                          </span>
                          <span
                            className={`pedidos-admin-status-badge pedidos-admin-status-${order.status}`}
                          >
                            {order.status}
                          </span>
                        </div>
                        <div className="pedidos-admin-card-body">
                          <h3>
                            {order.billing.first_name} {order.billing.last_name}
                          </h3>
                          <p>
                            <FaMapMarkerAlt style={{ color: "#e74c3c" }} />
                            {order.billing.city}{" "}
                            {order.billing.neighborhood
                              ? `- ${order.billing.neighborhood}`
                              : ""}
                          </p>
                          <p>🛒 {order.line_items.length} Productos</p>
                          <p>💰 ${order.total}</p>
                          <p>
                            📅{" "}
                            {new Date(order.date_created).toLocaleDateString()}
                          </p>

                          <div className="pedidos-click-hint">
                            👉 Ver Detalle &rarr;
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

      {/* Modal - Overlay */}
      {selectedOrder && (
        <div className="pedidos-modal-overlay" onClick={closeModal}>
          <div
            className="pedidos-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pedidos-modal-header">
              <h2>
                Pedido #{selectedOrder.id}{" "}
                <span
                  className={`pedidos-admin-status-badge pedidos-admin-status-${selectedOrder.status}`}
                  style={{
                    marginLeft: 15,
                    background: "rgba(255,255,255,0.2)",
                    color: "white",
                  }}
                >
                  {selectedOrder.status}
                </span>
              </h2>
              <button className="pedidos-modal-close-btn" onClick={closeModal}>
                &times;
              </button>
            </div>

            <div className="pedidos-modal-body">
              {detailLoading && (
                <div className="pedidos-loading-overlay">
                  <div className="pedidos-spinner"></div>
                </div>
              )}

              <div className="pedidos-detail-row">
                <div className="pedidos-detail-section pedidos-info-block">
                  <h4>👤 Cliente</h4>
                  <p>
                    <strong>Nombre:</strong> {selectedOrder.billing.first_name}{" "}
                    {selectedOrder.billing.last_name}
                  </p>
                  <p>
                    <strong>Email:</strong> {selectedOrder.billing.email}
                  </p>
                  <p>
                    <strong>Teléfono:</strong> {selectedOrder.billing.phone}
                  </p>
                </div>
                <div className="pedidos-detail-section pedidos-info-block">
                  <h4>📍 Envío / Entrega</h4>
                  <p>
                    <strong>Dirección:</strong>{" "}
                    {selectedOrder.billing.address_1}{" "}
                    {selectedOrder.billing.address_2}
                  </p>
                  <p>
                    <strong>Ciudad:</strong> {selectedOrder.billing.city}
                  </p>
                  {selectedOrder.customer_note && (
                    <p
                      style={{
                        marginTop: "10px",
                        fontStyle: "italic",
                        background: "#ffebee",
                        padding: "10px",
                        borderRadius: "8px",
                        color: "#c62828",
                      }}
                    >
                      📝 <strong>Nota del Cliente:</strong> "
                      {selectedOrder.customer_note}"
                    </p>
                  )}
                </div>
                <div
                  className="pedidos-detail-section pedidos-info-block"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <button
                    className="pedidos-admin-refresh-btn"
                    onClick={handleAssignCollector}
                  >
                    🚚 Asignar Recolectora
                  </button>
                </div>
              </div>

              <div className="pedidos-products-section-title">
                🛒 Productos a Recoger ({selectedOrder.line_items.length})
              </div>

              <div className="pedidos-products-grid">
                {selectedOrder.line_items.map((item, idx) => (
                  <div key={item.id || idx} className="pedidos-product-card">
                    <div className="pedidos-product-img-wrapper">
                      {item.image_src ? (
                        <img
                          src={item.image_src}
                          alt={item.name}
                          className="pedidos-product-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="pedidos-no-image">
                          <span>📷</span>
                          <small>Sin Imagen</small>
                        </div>
                      )}
                      <div className="pedidos-product-qty-tag">
                        {item.quantity}
                      </div>
                    </div>

                    <div className="pedidos-product-details">
                      <h4 className="pedidos-product-name">{item.name}</h4>
                      <div className="pedidos-product-price">
                        ${parseFloat(item.total).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Skeletons if loading detail (technically we show overlay, but if we wanted inline skeletons) */}
                {detailLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={`skel-${i}`}
                      className="pedidos-product-card pedidos-skeleton"
                    >
                      <div className="pedidos-product-img-wrapper"></div>
                      <div className="pedidos-product-details">
                        <div
                          className="pedidos-skeleton-text"
                          style={{ width: "80%" }}
                        ></div>
                        <div
                          className="pedidos-skeleton-text"
                          style={{ width: "40%" }}
                        ></div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="pedidos-modal-overlay" style={{ zIndex: 3000 }}>
          <div
            className="pedidos-modal-content"
            style={{ maxWidth: "500px", height: "auto" }}
          >
            <div className="pedidos-modal-header">
              <h2>Asignar Recolectora</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setShowAssignModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="pedidos-modal-body">
              <div className="pedidos-recolectoras-list">
                {recolectoras.map((r) => (
                  <div
                    key={r.id}
                    className={`pedidos-recolectora-card ${r.estado_recolectora}`}
                    onClick={() => confirmAssignment(r)}
                  >
                    <div className="pedidos-recolectora-info">
                      <strong>{r.nombre_completo}</strong>
                      <span>{r.email}</span>
                    </div>
                    <div className="pedidos-recolectora-status">
                      {r.estado_recolectora === "disponible" ? (
                        <span className="pedidos-badge-ok">Libre</span>
                      ) : (
                        <span className="pedidos-badge-busy">
                          En Pedido #{r.id_pedido_actual}
                        </span>
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
