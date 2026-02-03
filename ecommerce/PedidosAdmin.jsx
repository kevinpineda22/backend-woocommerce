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
  FaChartLine,
  FaClock,
  FaCheckDouble, // Icono para batch
  FaTimes,
  FaPhone,
  FaEnvelope
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

// --- COMPONENTE PRINCIPAL ---
const PedidosAdmin = () => {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ pending: 0, process: 0 });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("pending");

  // Estados Modal y Asignación
  const [selectedOrder, setSelectedOrder] = useState(null); // Para ver detalle
  const [pickers, setPickers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // --- MULTI-SELECCIÓN (NUEVO) ---
  const [selectedIds, setSelectedIds] = useState(new Set()); 

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
        const list = await fetchStats(); 
        setOrders(list);
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [currentView]
  );

  // Intervalo global de actualización
  useEffect(() => {
    setOrders([]);
    fetchOrders();
    const interval = setInterval(() => fetchOrders(true), 15000);
    return () => clearInterval(interval);
  }, [currentView, fetchOrders]);

  // --- 2. FILTRADO ---
  const displayedList = useMemo(() => {
    let baseList = [];
    if (currentView === "pending") {
      baseList = orders.filter((o) => !o.is_assigned);
    } else if (currentView === "process") {
      baseList = orders.filter((o) => o.is_assigned);
    } 

    return baseList.filter((order) => {
      const sLower = searchTerm.toLowerCase();
      const idReal = (order.id || "").toString();
      let fullName = order.billing ? `${order.billing.first_name} ${order.billing.last_name}` : "";
      fullName = fullName.toLowerCase();

      const matchText = idReal.includes(sLower) || fullName.includes(sLower);
      
      let matchDate = true;
      if (filterDate) {
        const dRaw = order.date_created;
        if (dRaw) matchDate = new Date(dRaw).toISOString().split("T")[0] === filterDate;
      }

      let matchZone = true;
      if (filterZone && order.billing) {
        const zLower = filterZone.toLowerCase();
        const address = (order.billing.address_1 || "").toLowerCase();
        const city = (order.billing.city || "").toLowerCase();
        matchZone = address.includes(zLower) || city.includes(zLower);
      }

      return matchText && matchDate && matchZone;
    });
  }, [orders, currentView, searchTerm, filterDate, filterZone]);

  // --- 3. MANEJADORES DE SELECCIÓN ---
  
  const toggleSelection = (orderId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(orderId)) {
      newSet.delete(orderId);
    } else {
      newSet.add(orderId);
    }
    setSelectedIds(newSet);
  };

  const handleCardClick = (order) => {
    setSelectedOrder(order);
  };

  const handleBatchAssignClick = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get("https://backend-woocommerce.vercel.app/api/orders/pickers");
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) {
      console.error(e);
      alert("Error cargando pickers");
    }
  };

  const confirmAssignment = async (picker) => {
    if (picker.estado_picker !== "disponible") {
      alert("Este picker ya tiene una sesión activa.");
      return;
    }
    
    setAssigning(true);
    try {
      const payload = {
        id_picker: picker.id,
        ids_pedidos: Array.from(selectedIds)
      };

      await axios.post("https://backend-woocommerce.vercel.app/api/orders/crear-sesion", payload);
      
      alert(`¡Sesión creada para ${picker.nombre_completo} con ${selectedIds.size} pedidos!`);
      
      setShowAssignModal(false);
      setSelectedIds(new Set()); // Limpiar selección
      fetchOrders(); // Recargar
    } catch (error) {
      console.error(error);
      alert("Error al asignar: " + (error.response?.data?.error || error.message));
    } finally {
      setAssigning(false);
    }
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
            className={`pedidos-layout-sidebar-button ${currentView === "pending" ? "active" : ""}`}
            onClick={() => { setOrders([]); setCurrentView("pending"); setSelectedIds(new Set()); }}
          >
            <FaBox /> <span>Por Asignar</span> <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button
            className={`pedidos-layout-sidebar-button ${currentView === "process" ? "active" : ""}`}
            onClick={() => { setOrders([]); setCurrentView("process"); setSelectedIds(new Set()); }}
          >
            <FaRunning /> <span>En Proceso</span> <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>
          
          <div className="pedidos-nav-label spacer">ADMIN</div>
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
        <div className="pedidos-layout-sidebar-footer">
          <p className="pedidos-footer-text">Merkahorro V2 © 2026</p>
        </div>
      </aside>

      {/* MAIN */}
      <main className="pedidos-layout-content">
        {currentView === "pickers" ? (
          <GestionPickers />
        ) : currentView === "analitica" ? (
          <AnaliticaPickers />
        ) : (
          <>
            <header className="pedidos-layout-header">
              <h1>📦 Gestión de Pedidos</h1>
              <button onClick={() => fetchOrders()} className="pedidos-admin-refresh-btn">
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar
              </button>
            </header>

            <div className="pedidos-layout-body">
              {/* FILTROS */}
              <div className="pedidos-admin-filters-container">
                <div className="pedidos-admin-filter-group">
                  <label><FaSearch className="pedidos-icon-spacer" /> Buscar</label>
                  <input type="text" className="pedidos-admin-filter-input" placeholder="#123 o Nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="pedidos-admin-filter-group">
                  <label><FaCalendarAlt className="pedidos-icon-spacer" /> Fecha</label>
                  <input type="date" className="pedidos-admin-filter-input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                </div>
                <div className="pedidos-admin-filter-group">
                  <label><FaMapMarkerAlt className="pedidos-icon-spacer" /> Zona</label>
                  <input type="text" className="pedidos-admin-filter-input" placeholder="Ej: Centro..." value={filterZone} onChange={(e) => setFilterZone(e.target.value)} />
                </div>
                <div className="pedidos-filter-actions">
                  <button className="pedidos-btn-clear" onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}>Limpiar</button>
                </div>
              </div>

              {/* GRID */}
              {loading && orders.length === 0 ? (
                <div className="pedidos-main-loading">
                  <div className="pedidos-spinner-large"></div>
                  <div className="pedidos-spinner-text">Cargando pedidos...</div>
                </div>
              ) : (
                <div className="pedidos-admin-orders-grid">
                  {displayedList.length === 0 ? (
                    <div className="pedidos-empty-list-container">
                      <h3>No se encontraron pedidos.</h3>
                    </div>
                  ) : (
                    displayedList.map((order) => {
                        const isSelected = selectedIds.has(order.id);
                        return (
                          <div
                            key={order.id}
                            className={`pedidos-admin-order-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleCardClick(order)}
                          >
                            <div className="pedidos-admin-card-header">
                              <span className="pedidos-admin-order-id">#{order.id}</span>
                              
                              {/* CHECKBOX SOLO EN VISTA PENDING */}
                              {currentView === "pending" ? (
                                <input 
                                    type="checkbox" 
                                    className="pedidos-card-checkbox"
                                    checked={isSelected}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleSelection(order.id)}
                                />
                              ) : (
                                <span className="pedidos-badge-busy">En proceso</span>
                              )}
                            </div>

                            <div className="pedidos-admin-card-body">
                              <div className="pedidos-card-info">
                                <h3>{order.billing?.first_name} {order.billing?.last_name}</h3>
                                <p>🛒 {order.line_items?.length} items</p>
                                <p>💰 {formatPrice(order.total)}</p>
                                <p><FaMapMarkerAlt className="pedidos-icon-red" /> {order.billing?.city}</p>
                              </div>
                            </div>
                          </div>
                        );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* BARRA FLOTANTE BATCH ASSIGN (SOLO SI HAY SELECCIONADOS) */}
        {selectedIds.size > 0 && currentView === "pending" && (
            <div className="batch-action-bar">
                <span className="batch-info">{selectedIds.size} Pedidos seleccionados</span>
                <button className="batch-btn" onClick={handleBatchAssignClick}>
                    <FaCheckDouble /> Asignar Ruta Lote
                </button>
                <button className="pedidos-btn-clear" style={{background:'rgba(255,255,255,0.2)', marginLeft: 10}} onClick={() => setSelectedIds(new Set())}>
                    <FaTimes />
                </button>
            </div>
        )}
      </main>

      {/* MODAL ASIGNAR PICKER */}
      {showAssignModal && (
        <div className="pedidos-modal-overlay high-z">
          <div className="pedidos-modal-content assign-modal">
            <div className="pedidos-modal-header">
              <h2>Asignar Sesión de Picking</h2>
              <button className="pedidos-modal-close-btn" onClick={() => setShowAssignModal(false)}>&times;</button>
            </div>
            <div className="pedidos-modal-body">
              <p style={{marginBottom: 15, color: '#666'}}>
                  Se creará una sesión unificada para recolectar <strong>{selectedIds.size} pedidos</strong> simultáneamente.
              </p>
              <div className="pedidos-pickers-list">
                {pickers.map((r) => (
                  <div
                    key={r.id}
                    className={`pedidos-picker-card ${r.estado_picker}`}
                    onClick={() => confirmAssignment(r)}
                  >
                    <div>
                      <strong>{r.nombre_completo}</strong><br />
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

      {/* MODAL DETALLE COMPLETO (RESTAURADO) */}
      {selectedOrder && !showAssignModal && (
        <div className="pedidos-modal-overlay" onClick={() => setSelectedOrder(null)}>
            <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                <div className="pedidos-modal-header">
                    <h2>Pedido #{selectedOrder.id}</h2>
                    <button className="pedidos-modal-close-btn" onClick={() => setSelectedOrder(null)}>&times;</button>
                </div>
                
                <div className="pedidos-modal-body">
                    {/* SECCIÓN 1: DATOS DEL CLIENTE */}
                    <div className="pedidos-detail-row">
                        <div className="pedidos-detail-section">
                            <h4>👤 Cliente</h4>
                            <p><strong>Nombre:</strong> {selectedOrder.billing?.first_name} {selectedOrder.billing?.last_name}</p>
                            <p><FaEnvelope style={{marginRight:5}}/> {selectedOrder.billing?.email}</p>
                            <p><FaPhone style={{marginRight:5}}/> {selectedOrder.billing?.phone}</p>
                            <p><strong>Método Pago:</strong> {selectedOrder.payment_method_title}</p>
                        </div>
                        
                        <div className="pedidos-detail-section">
                            <h4>📍 Envío</h4>
                            <p><strong>Dirección:</strong> {selectedOrder.shipping?.address_1 || selectedOrder.billing?.address_1}</p>
                            <p><strong>Ciudad:</strong> {selectedOrder.shipping?.city || selectedOrder.billing?.city}</p>
                            {selectedOrder.customer_note && (
                                <div className="pedidos-customer-note">
                                    📝 "{selectedOrder.customer_note}"
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SECCIÓN 2: PRODUCTOS CON IMÁGENES */}
                    <h3 style={{margin: '20px 0 10px', color: '#1f2933'}}>
                        🛒 Productos Solicitados ({selectedOrder.line_items.length})
                    </h3>
                    
                    <div className="pedidos-products-grid">
                        {selectedOrder.line_items.map((item) => (
                            <div key={item.id} className="pedidos-product-card">
                                <div className="pedidos-product-img-wrapper">
                                    {/* Muestra la cantidad */}
                                    <span className="pedidos-product-qty-tag">{item.quantity}</span>
                                    
                                    {/* Intenta mostrar imagen (soporta estructura woo v3) */}
                                    {item.image?.src || item.image_src ? (
                                        <img 
                                            src={item.image?.src || item.image_src} 
                                            className="pedidos-product-img" 
                                            alt={item.name} 
                                        />
                                    ) : (
                                        <FaBox size={30} color="#ccc"/>
                                    )}
                                </div>
                                <div className="pedidos-product-details">
                                    <div className="pedidos-product-name">{item.name}</div>
                                    <div className="pedidos-product-price">{formatPrice(item.total)}</div>
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