import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { GestionRecolectoras } from "./GestionRecolectoras";
import {
  FaBox,
  FaArrowLeft,
  FaSync,
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUserTag,
  FaRunning,
} from "react-icons/fa";
import "./PedidosAdmin.css";

const PedidosAdmin = () => {
  const [orders, setOrders] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // Vistas: 'pending', 'process', 'recolectoras'
  const [currentView, setCurrentView] = useState("pending");

  // Estados de Modal y Asignación
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recolectoras, setRecolectoras] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // --- CARGA DE DATOS ---
  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Endpoint que trae pedidos de WooCommerce + Estado de Supabase
      const resOrders = await axios.get(
        "https://backend-woocommerce.vercel.app/api/orders/pendientes"
      );
      setOrders(resOrders.data);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentView !== 'recolectoras') {
        fetchOrders();
    }
  }, [currentView]);

  // --- LÓGICA DE FILTRADO ---
  const displayedList = useMemo(() => {
    let baseList = [];

    if (currentView === "pending") {
      // Pedidos que NO tienen asignación
      baseList = orders.filter((o) => !o.is_assigned);
    } else if (currentView === "process") {
      // Pedidos que SÍ tienen asignación
      baseList = orders.filter((o) => o.is_assigned);
    }

    return baseList.filter((order) => {
      const searchLower = searchTerm.toLowerCase();
      
      const idReal = order.id_pedido || order.id;
      const idStr = idReal ? idReal.toString() : "";

      let fullName = "";
      if (order.billing) {
        fullName = `${order.billing.first_name || ""} ${order.billing.last_name || ""}`;
      } else if (order.nombre_recolectora) {
        fullName = order.nombre_recolectora;
      }
      fullName = fullName.toLowerCase();

      const idMatch = idStr.includes(searchLower);
      const nameMatch = fullName.includes(searchLower);

      let dateMatch = true;
      if (filterDate) {
        const dateRaw = order.date_created || order.fecha_fin;
        if (dateRaw) {
          const orderDate = new Date(dateRaw).toISOString().split("T")[0];
          dateMatch = orderDate === filterDate;
        }
      }

      let zoneMatch = true;
      if (filterZone) {
        const zoneLower = filterZone.toLowerCase();
        let address = "";
        let city = "";
        let neighborhood = "";

        if (order.billing) {
          address = (order.billing.address_1 || "").toLowerCase();
          city = (order.billing.city || "").toLowerCase();
          neighborhood = (order.billing.neighborhood || order.billing.address_2 || "").toLowerCase();
        }
        zoneMatch = address.includes(zoneLower) || city.includes(zoneLower) || neighborhood.includes(zoneLower);
      }

      return (idMatch || nameMatch) && dateMatch && zoneMatch;
    });
  }, [orders, currentView, searchTerm, filterDate, filterZone]);

  // --- MANEJADORES DE ACCIÓN ---
  const handleOrderClick = async (order) => {
    setSelectedOrder(order);
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

  const handleAssignClick = () => {
    fetchRecolectoras();
    setShowAssignModal(true);
  };

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
      alert(`Pedido #${selectedOrder.id} asignado a ${recolectora.nombre_completo}`);
      setShowAssignModal(false);
      closeModal();
      fetchOrders();
    } catch (error) {
      alert("Error al asignar: " + error.message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* SIDEBAR */}
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button" title="Volver al acceso">
            <FaArrowLeft />
          </Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Ecommerce</h2>
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">PEDIDOS</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "pending" ? "active" : ""}`}
            onClick={() => setCurrentView("pending")}
          >
            <FaBox /> <span>Por Asignar</span>
            <span className="pedidos-badge-count">
              {orders.filter((o) => !o.is_assigned).length}
            </span>
          </button>

          <button
            className={`pedidos-layout-sidebar-button ${currentView === "process" ? "active" : ""}`}
            onClick={() => setCurrentView("process")}
          >
            <FaRunning /> <span>En Proceso</span>
            <span className="pedidos-badge-count-blue">
              {orders.filter((o) => o.is_assigned).length}
            </span>
          </button>

          <div className="pedidos-nav-label" style={{ marginTop: 20 }}>ADMIN</div>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "recolectoras" ? "active" : ""}`}
            onClick={() => setCurrentView("recolectoras")}
          >
            <FaUserTag /> <span>Recolectoras</span>
          </button>
        </nav>
        <div className="pedidos-layout-sidebar-footer">
          <p style={{ marginTop: "1rem" }}>Merkahorro Admin © 2026</p>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="pedidos-layout-content">
        {currentView === "recolectoras" ? (
          <GestionRecolectoras />
        ) : (
          <>
            <header className="pedidos-layout-header">
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <h1>📦 Gestión de Pedidos</h1>
              </div>
              <button onClick={fetchOrders} className="pedidos-admin-refresh-btn" title="Recargar lista">
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar Lista
              </button>
            </header>

            <div className="pedidos-layout-body">
              {/* Filtros */}
              <div className="pedidos-admin-filters-container">
                <div className="pedidos-admin-filter-group">
                  <label><FaSearch style={{ marginRight: 5 }} /> Buscar</label>
                  <input type="text" className="pedidos-admin-filter-input" placeholder="#123 o Nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="pedidos-admin-filter-group">
                  <label><FaCalendarAlt style={{ marginRight: 5 }} /> Fecha</label>
                  <input type="date" className="pedidos-admin-filter-input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                </div>
                <div className="pedidos-admin-filter-group">
                    <label><FaMapMarkerAlt style={{ marginRight: 5 }} /> Zona</label>
                    <input type="text" className="pedidos-admin-filter-input" placeholder="Ej: Centro..." value={filterZone} onChange={(e) => setFilterZone(e.target.value)} />
                </div>
                <div className="pedidos-admin-filter-group" style={{ flex: "0 0 auto", justifyContent: "flex-end" }}>
                  <button className="pedidos-admin-refresh-btn" style={{ background: "#95a5a6", padding: "10px 20px", fontSize: "0.9rem" }} onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}>Limpiar</button>
                </div>
              </div>

              {loading && displayedList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px", color: "#64748b" }}><h2>Cargando pedidos...</h2></div>
              ) : (
                <div className="pedidos-admin-orders-grid">
                  {displayedList.length === 0 ? (
                    <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "40px", color: "#7f8c8d" }}><h3>No se encontraron pedidos.</h3></div>
                  ) : (
                    displayedList.map((order) => (
                      <div
                        key={order.id}
                        className="pedidos-admin-order-card"
                        onClick={() => handleOrderClick(order)}
                      >
                        <div className="pedidos-admin-card-header">
                          <span className="pedidos-admin-order-id">
                            #{order.id}
                          </span>
                          {currentView === "process" && <span className="pedidos-badge-busy">🏃 {order.assigned_to}</span>}
                        </div>

                        <div className="pedidos-admin-card-body">
                          <h3>{order.billing?.first_name} {order.billing?.last_name}</h3>
                          <p>🛒 {order.line_items?.length} items</p>
                          <p>💰 ${order.total}</p>
                          <p className="pedidos-zone-text">
                            <FaMapMarkerAlt style={{ color: "#e74c3c" }} />
                            {order.billing?.city} {order.billing?.neighborhood ? `- ${order.billing.neighborhood}` : ""}
                          </p>

                          {currentView === "pending" && (
                            <button
                              className="pedidos-admin-assign-btn pedidos-admin-refresh-btn"
                              style={{ marginTop: 10, fontSize: "0.8rem" }}
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); handleAssignClick(); }}
                            >
                              Asignar Recolectora
                            </button>
                          )}
                          {currentView === "process" && order.started_at && (
                            <div className="pedidos-process-timer">Iniciado: {new Date(order.started_at).toLocaleTimeString()}</div>
                          )}
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

      {/* MODAL DETALLES DEL PEDIDO (Estilos en PedidosAdmin.css) */}
      {selectedOrder && (
        <div className="pedidos-modal-overlay" onClick={closeModal}>
          <div className="pedidos-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="pedidos-modal-header">
              <h2>Pedido #{selectedOrder.id}</h2>
              <button className="pedidos-modal-close-btn" onClick={closeModal}>&times;</button>
            </div>

            <div className="pedidos-modal-body">
              {detailLoading && <div className="pedidos-loading-overlay"><div className="pedidos-spinner"></div></div>}
              
              <div className="pedidos-detail-row">
                <div className="pedidos-detail-section pedidos-info-block">
                  <h4>👤 Cliente</h4>
                  <p><strong>Nombre:</strong> {selectedOrder.billing?.first_name} {selectedOrder.billing?.last_name}</p>
                  <p><strong>Email:</strong> {selectedOrder.billing?.email}</p>
                  <p><strong>Teléfono:</strong> {selectedOrder.billing?.phone}</p>
                </div>
                <div className="pedidos-detail-section pedidos-info-block">
                  <h4>📍 Envío</h4>
                  <p><strong>Dir:</strong> {selectedOrder.billing?.address_1} {selectedOrder.billing?.address_2}</p>
                  <p><strong>Ciudad:</strong> {selectedOrder.billing?.city}</p>
                  {selectedOrder.customer_note && (
                    <p style={{ marginTop: "10px", fontStyle: "italic", background: "#ffebee", padding: "10px", borderRadius: "8px", color: "#c62828" }}>
                      📝 <strong>Nota:</strong> "{selectedOrder.customer_note}"
                    </p>
                  )}
                </div>
                {/* Botón de Asignar desde el Modal solo si está pendiente */}
                {currentView === "pending" && (
                  <div className="pedidos-detail-section pedidos-info-block" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <button className="pedidos-admin-refresh-btn" onClick={() => { setShowAssignModal(true); fetchRecolectoras(); }}>
                      🚚 Asignar Recolectora
                    </button>
                  </div>
                )}
              </div>

              <div className="pedidos-products-section-title">
                🛒 Productos ({selectedOrder.line_items?.length})
              </div>
              <div className="pedidos-products-grid">
                {selectedOrder.line_items?.map((item, idx) => (
                  <div key={item.id || idx} className="pedidos-product-card">
                    <div className="pedidos-product-img-wrapper">
                      {item.image_src ? (
                        <img src={item.image_src} alt={item.name} className="pedidos-product-img" loading="lazy" />
                      ) : (
                        <div className="pedidos-no-image"><span>📷</span><small>Sin Imagen</small></div>
                      )}
                      <div className="pedidos-product-qty-tag">{item.quantity}</div>
                    </div>
                    <div className="pedidos-product-details">
                      <h4 className="pedidos-product-name">{item.name}</h4>
                      <div className="pedidos-product-price">${parseFloat(item.total).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ASIGNAR RECOLECTORA */}
      {showAssignModal && (
        <div className="pedidos-modal-overlay" style={{ zIndex: 3000 }}>
          <div className="pedidos-modal-content" style={{ maxWidth: "500px", height: "auto" }}>
            <div className="pedidos-modal-header">
              <h2>Asignar Recolectora</h2>
              <button className="pedidos-modal-close-btn" onClick={() => setShowAssignModal(false)}>&times;</button>
            </div>
            <div className="pedidos-modal-body">
              <div className="pedidos-recolectoras-list">
                {recolectoras.map((r) => (
                  <div key={r.id} className={`pedidos-recolectora-card ${r.estado_recolectora}`} onClick={() => confirmAssignment(r)}>
                    <div className="pedidos-recolectora-info">
                      <strong>{r.nombre_completo}</strong>
                      <span>{r.email}</span>
                    </div>
                    <div className="pedidos-recolectora-status">
                      {r.estado_recolectora === "disponible" ? <span className="pedidos-badge-ok">Libre</span> : <span className="pedidos-badge-busy">Ocupada</span>}
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