import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { FaBox, FaArrowLeft, FaSync, FaChartLine, FaUserTag, FaRunning, FaHistory, FaListUl, FaLayerGroup, FaUserFriends, FaCheckCircle, FaExclamationTriangle, FaFileAlt, FaPhone } from "react-icons/fa";

// --- COMPONENTES MODULARES ---
import PendingOrdersView from "./PendingOrdersView"; 
import ActiveSessionsView from "./ActiveSessionsView"; // <--- NUEVO
import AssignPickerModal from "./AssignPickerModal"; 
import { GestionPickers } from "./GestionPickers";
import AnaliticaPickers from "./AnaliticaPickers";

import "./PedidosAdmin.css";

const formatPrice = (amount) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
const ORDER_COLORS = ['#3b82f6', '#f97316', '#8b5cf6', '#10b981', '#ec4899'];

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

  // Modales
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null); 
  
  // Estados Vistas Complejas
  const [liveSessionDetail, setLiveSessionDetail] = useState(null);
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [liveViewMode, setLiveViewMode] = useState("batch");
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
          const resPending = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}`);
          const listPending = resPending.data.filter(o => !o.is_assigned);
          setOrders(listPending);

          const resActive = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}`);
          setActiveSessions(resActive.data);

          setStats({ pending: listPending.length, process: resActive.data.length });
      } catch (error) { console.error("Error data", error); } finally { if (!isBackground) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 10000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- HANDLERS ---
  const handleOpenAssignModal = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get("https://backend-woocommerce.vercel.app/api/orders/pickers");
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) { alert("Error cargando pickers"); }
  };

  const handleConfirmAssignment = async (picker) => {
    try {
      await axios.post("https://backend-woocommerce.vercel.app/api/orders/crear-sesion", {
        id_picker: picker.id, ids_pedidos: Array.from(selectedIds)
      });
      alert(`✅ Misión asignada a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData(); 
    } catch (error) { alert("Error al asignar: " + error.message); }
  };

  const fetchHistory = async () => {
      setLoading(true);
      try {
          const res = await axios.get("https://backend-woocommerce.vercel.app/api/orders/historial");
          setHistoryOrders(res.data);
      } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleViewLiveDetail = async (session) => {
      try {
          const res = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${session.picker_id}`);
          setLiveSessionDetail({ sessionInfo: session, routeData: res.data });
          setLiveViewMode("batch");
          setShowLiveModal(true);
      } catch (e) { alert("No se pudo cargar detalles. Sesión finalizada."); }
  };

  const handleViewHistoryDetail = async (session) => {
      try {
          const res = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}`);
          setHistoryDetail({ session, logs: res.data });
          setShowHistoryModal(true);
      } catch (e) { alert("Error detalles"); }
  };

  // Helper Agrupación Vista Vivo
  const getItemsByOrder = () => {
      if (!liveSessionDetail) return {};
      const ordersMap = {};
      liveSessionDetail.routeData.orders_info.forEach((o, idx) => { 
          ordersMap[o.id] = { 
              customer: o.customer, 
              total_order_value: o.total,
              color: ORDER_COLORS[idx % ORDER_COLORS.length],
              code_letter: String.fromCharCode(65 + idx),
              items: [],
              stats: { total: 0, done: 0 }
          }; 
      });
      liveSessionDetail.routeData.items.forEach(item => {
          item.pedidos_involucrados.forEach(ped => {
              if (ordersMap[ped.id_pedido]) {
                  ordersMap[ped.id_pedido].items.push({ ...item, qty_needed: ped.cantidad });
                  ordersMap[ped.id_pedido].stats.total += 1;
                  if (item.status === 'recolectado' || item.status === 'sustituido') {
                      ordersMap[ped.id_pedido].stats.done += 1;
                  }
              }
          });
      });
      return ordersMap;
  };

  const getOrderIndex = (orderId) => {
      if (!liveSessionDetail) return 0;
      return liveSessionDetail.routeData.orders_info.findIndex(o => o.id === orderId);
  };

  return (
    <div className="pedidos-layout-main-container">
      <aside className="pedidos-layout-sidebar">
        <div className="pedidos-layout-sidebar-header">
          <Link to="/acceso" className="pedidos-back-button"><FaArrowLeft /></Link>
          <div className="pedidos-layout-logo">MK</div>
          <h2 className="pedidos-layout-sidebar-title">Admin Center</h2>
        </div>
        <nav className="pedidos-layout-sidebar-nav">
          <div className="pedidos-nav-label">OPERACIÓN</div>
          <button className={`pedidos-layout-sidebar-button ${currentView === "pending" ? "active" : ""}`} onClick={() => setCurrentView("pending")}>
            <FaBox /> <span>Por Asignar</span> <span className="pedidos-badge-count">{stats.pending}</span>
          </button>
          <button className={`pedidos-layout-sidebar-button ${currentView === "process" ? "active" : ""}`} onClick={() => setCurrentView("process")}>
            <FaRunning /> <span>En Proceso</span> <span className="pedidos-badge-count-blue">{stats.process}</span>
          </button>
          <div className="pedidos-nav-label spacer">AUDITORÍA</div>
          <button className={`pedidos-layout-sidebar-button ${currentView === "history" ? "active" : ""}`} onClick={() => { setCurrentView("history"); fetchHistory(); }}>
            <FaHistory /> <span>Historial</span>
          </button>
          <div className="pedidos-nav-label spacer">ADMINISTRACIÓN</div>
          <button className={`pedidos-layout-sidebar-button ${currentView === "analitica" ? "active" : ""}`} onClick={() => setCurrentView("analitica")}>
            <FaChartLine /> <span>Inteligencia</span>
          </button>
          <button className={`pedidos-layout-sidebar-button ${currentView === "pickers" ? "active" : ""}`} onClick={() => setCurrentView("pickers")}>
            <FaUserTag /> <span>Pickers</span>
          </button>
        </nav>
      </aside>

      <main className="pedidos-layout-content">
        {currentView === "pickers" ? <GestionPickers /> : 
         currentView === "analitica" ? <AnaliticaPickers /> : 
         currentView === "history" ? (
             <>
                <header className="pedidos-layout-header"><h1>📜 Historial de Sesiones</h1><button onClick={fetchHistory} className="pedidos-admin-refresh-btn"><FaSync/> Refrescar</button></header>
                <div className="pedidos-layout-body">
                    <div className="history-table-container">
                        <table className="pickers-table"> 
                            <thead><tr><th>Fecha</th><th>Picker</th><th>Pedidos</th><th>Duración</th><th>Acción</th></tr></thead>
                            <tbody>
                                {historyOrders.map(sess => (
                                    <tr key={sess.id}>
                                        <td><div style={{fontWeight:'bold', color:'#1e293b'}}>{sess.fecha}</div><small>{sess.hora_fin}</small></td>
                                        <td>{sess.picker}</td><td>{sess.pedidos.join(", ")}</td><td><span className="pedidos-badge-ok" style={{background:'#e0f2fe', color:'#0284c7'}}>{sess.duracion}</span></td>
                                        <td><button className="gp-btn-icon warning" onClick={() => handleViewHistoryDetail(sess)}><FaFileAlt /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
             </>
         ) : (
          <>
            <header className="pedidos-layout-header">
              <h1>{currentView === "pending" ? "📦 Pedidos Pendientes" : "🚀 Centro de Comando"}</h1>
              <button onClick={() => fetchData()} className="pedidos-admin-refresh-btn"><FaSync className={loading ? "fa-spin" : ""} /> Actualizar</button>
            </header>

            <div className="pedidos-layout-body">
              {currentView === "pending" ? (
                
                // COMPONENTE: PENDIENTES
                <PendingOrdersView 
                    orders={orders} loading={loading} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                    filterDate={filterDate} setFilterDate={setFilterDate} filterZone={filterZone} setFilterZone={setFilterZone}
                    selectedIds={selectedIds} setSelectedIds={setSelectedIds} onAssignClick={handleOpenAssignModal}
                    onOrderClick={setSelectedOrder}
                />

              ) : (
                
                // COMPONENTE: EN PROCESO
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
      <AssignPickerModal isOpen={showAssignModal} pickers={pickers} onClose={() => setShowAssignModal(false)} onConfirm={handleConfirmAssignment} />

      {/* MODAL DETALLE EN VIVO (Aún es complejo, se mantiene aquí por la lógica de datos en vivo) */}
      {showLiveModal && liveSessionDetail && (
          <div className="pedidos-modal-overlay high-z" onClick={() => setShowLiveModal(false)}>
              <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="pedidos-modal-header" style={{background:'#1e293b'}}>
                      <div style={{display:'flex', gap:15, alignItems:'center', flex:1}}>
                          <FaListUl size={24} />
                          <div><h2 style={{fontSize:'1.2rem', margin:0}}>Ruta: {liveSessionDetail.sessionInfo.picker_name}</h2><span style={{fontSize:'0.8rem', opacity:0.8}}>Operación en Vivo</span></div>
                      </div>
                      <div className="pa-view-toggle">
                          <button className={liveViewMode === 'batch' ? 'active' : ''} onClick={() => setLiveViewMode('batch')}><FaLayerGroup /> Batch</button>
                          <button className={liveViewMode === 'orders' ? 'active' : ''} onClick={() => setLiveViewMode('orders')}><FaUserFriends /> Pedidos</button>
                      </div>
                      <button className="pedidos-modal-close-btn" onClick={() => setShowLiveModal(false)}>&times;</button>
                  </div>
                  
                  <div className="pedidos-modal-body" style={{background:'#f1f5f9'}}>
                      {liveViewMode === 'batch' && (
                          <div className="live-detail-grid">
                              {liveSessionDetail.routeData.items.map((item, idx) => (
                                  <div key={idx} className={`live-item-row ${item.status}`}>
                                      <div className="live-item-img">{item.image_src ? <img src={item.image_src} alt=""/> : <FaBox size={20} color="#ccc"/>}</div>
                                      <div className="live-item-info">
                                          <div className="live-item-name">{item.name}</div>
                                          <div className="live-item-meta"><span className="live-badge-pasillo">{item.pasillo === 'Otros' ? 'Gen' : `P-${item.pasillo}`}</span><span style={{fontWeight:'bold'}}>{item.quantity_total} un.</span></div>
                                          <div className="live-who-wants">
                                              {item.pedidos_involucrados.map((p, i) => {
                                                  const oIdx = getOrderIndex(p.id_pedido);
                                                  const color = ORDER_COLORS[oIdx % ORDER_COLORS.length];
                                                  const letter = String.fromCharCode(65 + oIdx);
                                                  return <span key={i} className="live-order-dot" style={{background:color}} title={`Pedido #${p.id_pedido}`}>{letter}</span>
                                              })}
                                          </div>
                                          {item.status === 'sustituido' && item.sustituto && <div className="live-sub-info">🔄 {item.sustituto.name}</div>}
                                      </div>
                                      <div className="live-item-status-badge">{item.status === 'recolectado' ? <span className="pa-status-pill success">LISTO</span> : item.status === 'sustituido' ? <span className="pa-status-pill warning">CAMBIO</span> : <span className="pa-status-pill pending">PENDIENTE</span>}</div>
                                  </div>
                              ))}
                          </div>
                      )}
                      {liveViewMode === 'orders' && (
                          <div className="live-orders-container">
                              {Object.entries(getItemsByOrder()).map(([orderId, data]) => {
                                  const percentage = data.items.length > 0 ? Math.round((data.stats.done / data.items.length) * 100) : 0;
                                  return (
                                      <div key={orderId} className="live-order-group">
                                          <div className="live-order-header-card">
                                              <div className="live-oh-left">
                                                  <div className="live-oh-letter" style={{background: data.color}}>{data.code_letter}</div>
                                                  <div><h3 className="live-oh-customer">{data.customer}</h3><span className="live-oh-id">Pedido #{orderId}</span></div>
                                              </div>
                                              <div className="live-oh-right">
                                                  <div className="live-oh-price">{formatPrice(data.total_order_value)}</div>
                                                  <div className="live-oh-progress-wrap">
                                                      <div className="live-oh-progress-text">{data.stats.done}/{data.items.length} Items ({percentage}%)</div>
                                                      <div className="live-oh-progress-bar"><div className="live-oh-progress-fill" style={{width: `${percentage}%`, background: data.color}}></div></div>
                                                  </div>
                                              </div>
                                          </div>
                                          <div className="live-detail-grid">
                                              {data.items.map((item, idx) => (
                                                  <div key={idx} className={`live-item-row compact ${item.status}`}>
                                                      <div className="live-item-img-sm">{item.image_src ? <img src={item.image_src} alt=""/> : <FaBox size={15} color="#ccc"/>}</div>
                                                      <div className="live-item-info" style={{flex:1}}>
                                                          <div className="live-item-name" style={{fontSize:'0.85rem'}}>{item.name}</div>
                                                          <div className="live-item-meta"><span>{item.qty_needed} un.</span><span style={{fontSize:'0.75rem', color:'#64748b'}}> • {formatPrice(item.price)}</span></div>
                                                          {item.status === 'sustituido' && item.sustituto && <span style={{color:'#e67e22', fontSize:'0.75rem'}}> ➔ {item.sustituto.name} ({formatPrice(item.sustituto.price)})</span>}
                                                      </div>
                                                      <div className="live-item-status-badge" style={{width:'auto'}}>{item.status === 'recolectado' ? <FaCheckCircle color="#22c55e"/> : item.status === 'sustituido' ? <FaExclamationTriangle color="#f59e0b"/> : <span className="status-dot pending"></span>}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {selectedOrder && !showAssignModal && !showHistoryModal && !showLiveModal && (
          <div className="pedidos-modal-overlay" onClick={() => setSelectedOrder(null)}>
              <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="pedidos-modal-header"><h2>Pedido #{selectedOrder.id}</h2><button className="pedidos-modal-close-btn" onClick={()=>setSelectedOrder(null)}>&times;</button></div>
                  <div className="pedidos-modal-body">
                      <div className="pedidos-detail-row" style={{marginBottom:20, gridTemplateColumns:'1fr 1fr'}}>
                          <div className="pedidos-detail-section"><h4>Datos Cliente</h4><p><strong>Nombre:</strong> {selectedOrder.billing?.first_name} {selectedOrder.billing?.last_name}</p>{selectedOrder.billing?.phone && <p style={{display:'flex', alignItems:'center', gap:5}}><FaPhone/> {selectedOrder.billing.phone}</p>}</div>
                          <div className="pedidos-detail-section"><h4>Envío</h4><p>{selectedOrder.billing?.address_1}</p><p>{selectedOrder.billing?.city}</p></div>
                      </div>
                      <h3>Productos</h3>
                      <div className="pedidos-products-grid">
                          {selectedOrder.line_items.map(item => (
                              <div key={item.id} className="pedidos-product-card">
                                  <div className="pedidos-product-img-wrapper"><span className="pedidos-product-qty-tag">{item.quantity}</span>{item.image?.src ? <img src={item.image.src} className="pedidos-product-img" alt=""/> : <FaBox size={30} color="#ccc"/>}</div>
                                  <div className="pedidos-product-details"><div className="pedidos-product-name">{item.name}</div><div className="pedidos-product-price">{formatPrice(item.total)}</div></div>
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {showHistoryModal && historyDetail && (
          <div className="pedidos-modal-overlay high-z" onClick={() => setShowHistoryModal(false)}>
              <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="pedidos-modal-header"><h2>Auditoría</h2><button className="pedidos-modal-close-btn" onClick={() => setShowHistoryModal(false)}>&times;</button></div>
                  <div className="pedidos-modal-body">
                      <div className="audit-timeline">
                          {historyDetail.logs.map((log) => (
                              <div key={log.id} className={`audit-item ${log.es_sustituto ? 'sub' : ''}`}>
                                  <div className="audit-time">{new Date(log.fecha_registro).toLocaleTimeString()}</div>
                                  <div className="audit-content">
                                      <div className="audit-title">{log.accion === 'recolectado' ? (log.es_sustituto ? '🔄 Sustituyó' : '✅ Recolectó') : log.accion}: <strong>{log.nombre_producto}</strong></div>
                                      {log.es_sustituto && <div className="audit-sub-detail">Por: {log.nombre_sustituto} ({formatPrice(log.precio_nuevo)})</div>}
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