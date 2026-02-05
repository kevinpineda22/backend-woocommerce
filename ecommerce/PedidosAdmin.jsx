import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { GestionPickers } from "./GestionPickers";
import AnaliticaPickers from "./AnaliticaPickers";
import {
  FaBox, FaArrowLeft, FaSync, FaSearch, FaCalendarAlt, FaMapMarkerAlt,
  FaUserTag, FaRunning, FaChartLine, FaCheckDouble, FaTimes, 
  FaPhone, FaEnvelope, FaClock, FaCheckCircle, FaExclamationTriangle,
  FaHistory, FaFileAlt // Iconos nuevos para historial
} from "react-icons/fa";
import "./PedidosAdmin.css";

const formatPrice = (amount) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

// --- COMPONENTE CRONÓMETRO ---
const SessionTimer = ({ startTime }) => {
    const [elapsed, setElapsed] = useState("00:00:00");
    const [isLong, setIsLong] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            const start = new Date(startTime).getTime();
            const now = new Date().getTime();
            const diff = now - start;

            if (diff < 0) return;

            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            setElapsed(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
            
            if (hours > 0 || minutes >= 45) setIsLong(true);

        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return (
        <div className={`pa-timer ${isLong ? 'danger' : ''}`}>
            <FaClock /> {elapsed}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const PedidosAdmin = () => {
  const [orders, setOrders] = useState([]); // Pendientes
  const [activeSessions, setActiveSessions] = useState([]); // Dashboard En Proceso
  
  // ESTADOS NUEVOS PARA HISTORIAL
  const [historyOrders, setHistoryOrders] = useState([]); 
  const [historyDetail, setHistoryDetail] = useState(null); 
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const [stats, setStats] = useState({ pending: 0, process: 0 });
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("pending");

  // Estados Modal y Asignación
  const [selectedOrder, setSelectedOrder] = useState(null); 
  const [pickers, setPickers] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set()); 

  // Filtros Pendientes
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterZone, setFilterZone] = useState("");

  // --- 1. DATA FETCHING ---
  const fetchData = useCallback(async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
          const resPending = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pendientes?t=${Date.now()}`);
          const listPending = resPending.data.filter(o => !o.is_assigned);
          setOrders(listPending);

          const resActive = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}`);
          setActiveSessions(resActive.data);

          setStats({
              pending: listPending.length,
              process: resActive.data.length 
          });

      } catch (error) {
          console.error("Error fetching data", error);
      } finally {
          if (!isBackground) setLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 10000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  // --- NUEVA FUNCIÓN: CARGAR HISTORIAL ---
  const fetchHistory = async () => {
      setLoading(true);
      try {
          const res = await axios.get("https://backend-woocommerce.vercel.app/api/orders/historial");
          setHistoryOrders(res.data);
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
  };

  const handleViewHistoryDetail = async (session) => {
      try {
          const res = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${session.id}`);
          setHistoryDetail({ session, logs: res.data });
          setShowHistoryModal(true);
      } catch (e) { alert("Error cargando detalles"); }
  };

  // --- 2. FILTRADO PENDIENTES ---
  const displayedPending = useMemo(() => {
    return orders.filter((order) => {
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
  }, [orders, searchTerm, filterDate, filterZone]);

  // --- HANDLERS ---
  const toggleSelection = (orderId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(orderId)) newSet.delete(orderId);
    else newSet.add(orderId);
    setSelectedIds(newSet);
  };

  const handleBatchAssignClick = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await axios.get("https://backend-woocommerce.vercel.app/api/orders/pickers");
      setPickers(res.data);
      setShowAssignModal(true);
    } catch (e) { alert("Error cargando pickers"); }
  };

  const confirmAssignment = async (picker) => {
    if (picker.estado_picker !== "disponible") { alert("Este picker ya tiene una misión activa."); return; }
    try {
      await axios.post("https://backend-woocommerce.vercel.app/api/orders/crear-sesion", {
        id_picker: picker.id, ids_pedidos: Array.from(selectedIds)
      });
      alert(`Misión asignada a ${picker.nombre_completo}`);
      setShowAssignModal(false);
      setSelectedIds(new Set());
      fetchData();
    } catch (error) { alert("Error al asignar: " + error.message); }
  };

  return (
    <div className="pedidos-layout-main-container">
      {/* SIDEBAR */}
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

      {/* MAIN */}
      <main className="pedidos-layout-content">
        {currentView === "pickers" ? <GestionPickers /> : 
         currentView === "analitica" ? <AnaliticaPickers /> : 
         currentView === "history" ? (
             // --- VISTA HISTORIAL ---
             <>
                <header className="pedidos-layout-header">
                    <h1>📜 Historial de Sesiones Completadas</h1>
                    <button onClick={fetchHistory} className="pedidos-admin-refresh-btn"><FaSync/> Refrescar</button>
                </header>
                <div className="pedidos-layout-body">
                    <div className="history-table-container">
                        <table className="pickers-table"> 
                            <thead>
                                <tr>
                                    <th>Fecha/Hora</th>
                                    <th>Picker</th>
                                    <th>Pedidos</th>
                                    <th>Duración</th>
                                    <th>Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyOrders.length === 0 ? <tr><td colSpan="5" style={{textAlign:'center', padding:20}}>No hay historial reciente.</td></tr> :
                                historyOrders.map(sess => (
                                    <tr key={sess.id}>
                                        <td>
                                            <div style={{fontWeight:'bold', color:'#1e293b'}}>{sess.fecha}</div>
                                            <small style={{color:'#64748b'}}>{sess.hora_fin}</small>
                                        </td>
                                        <td>{sess.picker}</td>
                                        <td>{sess.pedidos.join(", ")}</td>
                                        <td><span className="pedidos-badge-ok" style={{background:'#e0f2fe', color:'#0284c7'}}>{sess.duracion}</span></td>
                                        <td>
                                            <button className="gp-btn-icon warning" onClick={() => handleViewHistoryDetail(sess)} title="Ver Auditoría">
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
          <>
            <header className="pedidos-layout-header">
              <h1>{currentView === "pending" ? "📦 Pedidos Pendientes" : "🚀 Centro de Comando (En Vivo)"}</h1>
              <button onClick={() => fetchData()} className="pedidos-admin-refresh-btn">
                <FaSync className={loading ? "fa-spin" : ""} /> Actualizar
              </button>
            </header>

            <div className="pedidos-layout-body">
              {currentView === "pending" ? (
                // --- VISTA PENDIENTES ---
                <>
                  <div className="pedidos-admin-filters-container">
                     <div className="pedidos-admin-filter-group"><label><FaSearch/> Buscar</label><input type="text" className="pedidos-admin-filter-input" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="#ID o Cliente"/></div>
                     <div className="pedidos-admin-filter-group"><label><FaCalendarAlt/> Fecha</label><input type="date" className="pedidos-admin-filter-input" value={filterDate} onChange={(e)=>setFilterDate(e.target.value)}/></div>
                     <div className="pedidos-admin-filter-group"><label><FaMapMarkerAlt/> Zona</label><input type="text" className="pedidos-admin-filter-input" value={filterZone} onChange={(e)=>setFilterZone(e.target.value)} placeholder="Barrio..."/></div>
                     <div className="pedidos-filter-actions"><button className="pedidos-btn-clear" onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}>Limpiar</button></div>
                  </div>

                  {loading && orders.length === 0 ? <div className="pedidos-main-loading"><div className="pedidos-spinner-large"></div><div className="pedidos-spinner-text">Cargando...</div></div> : (
                    <div className="pedidos-admin-orders-grid">
                      {displayedPending.length === 0 ? <div className="pedidos-empty-list-container"><h3>No hay pedidos pendientes.</h3></div> :
                      displayedPending.map(order => (
                        <div key={order.id} className={`pedidos-admin-order-card ${selectedIds.has(order.id) ? 'selected' : ''}`} onClick={() => setSelectedOrder(order)}>
                           <div className="pedidos-admin-card-header">
                              <span className="pedidos-admin-order-id">#{order.id}</span>
                              <input type="checkbox" className="pedidos-card-checkbox" checked={selectedIds.has(order.id)} onClick={(e)=>e.stopPropagation()} onChange={()=>toggleSelection(order.id)}/>
                           </div>
                           <div className="pedidos-admin-card-body">
                              <h3>{order.billing?.first_name} {order.billing?.last_name}</h3>
                              <p>🛒 {order.line_items?.length} items</p>
                              <p>💰 {formatPrice(order.total)}</p>
                              <p><FaMapMarkerAlt className="pedidos-icon-red"/> {order.billing?.city}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedIds.size > 0 && (
                    <div className="batch-action-bar">
                        <span className="batch-info">{selectedIds.size} seleccionados</span>
                        <button className="batch-btn" onClick={handleBatchAssignClick}><FaCheckDouble/> Asignar Lote</button>
                        <button className="pedidos-btn-clear" onClick={()=>setSelectedIds(new Set())}><FaTimes/></button>
                    </div>
                  )}
                </>
              ) : (
                // --- VISTA EN PROCESO (SUPER DASHBOARD) ---
                <div className="pa-dashboard-grid">
                    {activeSessions.length === 0 ? (
                        <div className="pedidos-empty-list-container">
                            <FaRunning size={50} color="#cbd5e1" style={{marginBottom:20}}/>
                            <h3>Todo tranquilo. No hay pickers en ruta.</h3>
                        </div>
                    ) : (
                        activeSessions.map(session => (
                            <div key={session.session_id} className="pa-dashboard-card">
                                <div className="pa-card-header">
                                    <div className="pa-picker-info">
                                        <div className="pa-avatar">{session.picker_name.charAt(0)}</div>
                                        <div>
                                            <h4>{session.picker_name}</h4>
                                            <span className="pa-session-id">Sesión #{session.session_id.slice(0,6)}</span>
                                        </div>
                                    </div>
                                    <SessionTimer startTime={session.start_time} />
                                </div>

                                <div className="pa-progress-section">
                                    <div className="pa-progress-labels">
                                        <span>Progreso</span>
                                        <span>{session.progress}%</span>
                                    </div>
                                    <div className="pa-progress-bar-bg">
                                        <div className="pa-progress-bar-fill" style={{width: `${session.progress}%`, background: session.progress === 100 ? '#22c55e' : '#3b82f6'}}></div>
                                    </div>
                                </div>

                                <div className="pa-stats-grid">
                                    <div className="pa-stat-box">
                                        <span className="pa-stat-num">{session.completed_items - session.substituted_items}</span>
                                        <span className="pa-stat-label">OK</span>
                                    </div>
                                    <div className="pa-stat-box warning">
                                        <span className="pa-stat-num">{session.substituted_items}</span>
                                        <span className="pa-stat-label">Subs</span>
                                    </div>
                                    <div className="pa-stat-box pending">
                                        <span className="pa-stat-num">{session.total_items - session.completed_items}</span>
                                        <span className="pa-stat-label">Pend</span>
                                    </div>
                                </div>

                                <div className="pa-location-badge">
                                    <FaMapMarkerAlt /> {session.current_location}
                                </div>

                                <div className="pa-orders-list">
                                    <small><strong>Pedidos:</strong> {session.order_ids.join(", ")}</small>
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

      {/* MODAL ASIGNAR PICKER */}
      {showAssignModal && (
        <div className="pedidos-modal-overlay high-z">
          <div className="pedidos-modal-content assign-modal">
            <div className="pedidos-modal-header"><h2>Asignar Picker</h2><button className="pedidos-modal-close-btn" onClick={()=>setShowAssignModal(false)}>&times;</button></div>
            <div className="pedidos-modal-body">
                <div className="pedidos-pickers-list">
                    {pickers.map(p => (
                        <div key={p.id} className={`pedidos-picker-card ${p.estado_picker}`} onClick={()=>confirmAssignment(p)}>
                            <strong>{p.nombre_completo}</strong>
                            {p.estado_picker === 'disponible' ? <span className="pedidos-badge-ok">Libre</span> : <span className="pedidos-badge-busy">Ocupado</span>}
                        </div>
                    ))}
                </div>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL AUDITORÍA FORENSE (NUEVO) */}
      {showHistoryModal && historyDetail && (
          <div className="pedidos-modal-overlay high-z" onClick={() => setShowHistoryModal(false)}>
              <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="pedidos-modal-header">
                      <h2>Auditoría Sesión #{historyDetail.session.id.slice(0,6)}</h2>
                      <button className="pedidos-modal-close-btn" onClick={() => setShowHistoryModal(false)}>&times;</button>
                  </div>
                  <div className="pedidos-modal-body">
                      <div className="audit-timeline">
                          {historyDetail.logs.length === 0 ? <p>No hay registros.</p> : 
                           historyDetail.logs.map((log) => (
                              <div key={log.id} className={`audit-item ${log.es_sustituto ? 'sub' : ''}`}>
                                  <div className="audit-time">{new Date(log.fecha_registro).toLocaleTimeString()}</div>
                                  <div className="audit-content">
                                      <div className="audit-title">
                                          {log.accion === 'recolectado' && !log.es_sustituto && <span>✅ Recolectó: <strong>{log.nombre_producto}</strong></span>}
                                          {log.accion === 'sustituido' && <span style={{color:'#d97706'}}>🔄 Sustituyó: <strong>{log.nombre_producto}</strong></span>}
                                          {log.accion === 'recolectado' && log.es_sustituto && <span style={{color:'#d97706'}}>🔄 Sustituyó: <strong>{log.nombre_producto}</strong></span>}
                                      </div>
                                      {log.es_sustituto && (
                                          <div className="audit-sub-detail">
                                              ⬇️ Por: <strong>{log.nombre_sustituto}</strong> <br/>
                                              💰 Nuevo Precio: {formatPrice(log.precio_nuevo)}
                                          </div>
                                      )}
                                      {log.peso_real && <div className="audit-extra">⚖️ Peso: {log.peso_real} Kg</div>}
                                  </div>
                              </div>
                           ))
                          }
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DETALLE PEDIDO (PENDIENTE) */}
      {selectedOrder && !showAssignModal && !showHistoryModal && (
          <div className="pedidos-modal-overlay" onClick={() => setSelectedOrder(null)}>
              <div className="pedidos-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="pedidos-modal-header"><h2>Pedido #{selectedOrder.id}</h2><button className="pedidos-modal-close-btn" onClick={()=>setSelectedOrder(null)}>&times;</button></div>
                  <div className="pedidos-modal-body">
                      <div className="pedidos-detail-row" style={{marginBottom:20, gridTemplateColumns:'1fr 1fr'}}>
                          <div className="pedidos-detail-section">
                              <h4>Datos Cliente</h4>
                              <p><strong>Nombre:</strong> {selectedOrder.billing?.first_name} {selectedOrder.billing?.last_name}</p>
                              <p><FaPhone/> {selectedOrder.billing?.phone}</p>
                          </div>
                          <div className="pedidos-detail-section">
                              <h4>Envío</h4>
                              <p>{selectedOrder.billing?.address_1}</p>
                              <p>{selectedOrder.billing?.city}</p>
                          </div>
                      </div>
                      <h3>Productos</h3>
                      <div className="pedidos-products-grid">
                          {selectedOrder.line_items.map(item => (
                              <div key={item.id} className="pedidos-product-card">
                                  <div className="pedidos-product-img-wrapper">
                                      <span className="pedidos-product-qty-tag">{item.quantity}</span>
                                      {item.image?.src ? <img src={item.image.src} className="pedidos-product-img" alt=""/> : <FaBox size={30} color="#ccc"/>}
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