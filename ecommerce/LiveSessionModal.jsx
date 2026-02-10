import React, { useState, useMemo } from "react";
import axios from "axios";
import {
  FaLayerGroup,
  FaUserFriends,
  FaListUl,
  FaBox,
  FaExclamationTriangle,
  FaClock,
  FaCheck,
  FaTrash,
  FaTrashRestore,
  FaHistory
} from "react-icons/fa";
import "./LiveSessionModal.css";

const ORDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

export const LiveSessionModal = ({ sessionDetail, onClose }) => {
  const [viewMode, setViewMode] = useState("batch"); // 'batch' | 'orders'
  const [showTrash, setShowTrash] = useState(false); // ✅ Nuevo estado: Ver papelera
  const [isProcessing, setIsProcessing] = useState(false);

  if (!sessionDetail) return null;
  const { sessionInfo, routeData } = sessionDetail;

  // --- FILTROS DE LISTAS ---
  const activeItems = useMemo(() => routeData.items.filter(i => !i.is_removed), [routeData]);
  const removedItems = useMemo(() => routeData.items.filter(i => i.is_removed), [routeData]);

  // Lista a mostrar según el toggle
  const displayItems = showTrash ? removedItems : activeItems;

  // --- ACCIONES ADMIN ---
  const handleAdminDelete = async (item) => {
    if (!window.confirm(`¿ANULAR "${item.name}"? El picker dejará de verlo.`)) return;
    setIsProcessing(true);
    try {
        await axios.post('https://backend-woocommerce.vercel.app/api/orders/admin-remove-item', {
            id_sesion: sessionInfo.session_id, id_producto: item.product_id
        });
        alert("✅ Anulado."); onClose();
    } catch (error) { alert("Error: " + error.message); } 
    finally { setIsProcessing(false); }
  };

  const handleAdminRestore = async (item) => {
    if (!window.confirm(`¿RESTAURAR "${item.name}" al batch activo?`)) return;
    setIsProcessing(true);
    try {
        await axios.post('https://backend-woocommerce.vercel.app/api/orders/admin-restore-item', {
            id_sesion: sessionInfo.session_id, id_producto: item.product_id
        });
        alert("✅ Restaurado."); onClose();
    } catch (error) { alert("Error: " + error.message); } 
    finally { setIsProcessing(false); }
  };

  // Helpers de colores y letras
  const getOrderColor = (id) => ORDER_COLORS[routeData.orders_info.findIndex(o => o.id === id) % ORDER_COLORS.length];
  const getOrderLetter = (id) => String.fromCharCode(65 + routeData.orders_info.findIndex(o => o.id === id));

  // Helper simplificado para la vista de ordenes (solo activos)
  const getItemsByOrder = () => {
      const map = {};
      routeData.orders_info.forEach((o, i) => map[o.id] = { ...o, color: ORDER_COLORS[i % 5], letter: String.fromCharCode(65+i), items:[], stats:{total:0,done:0}});
      activeItems.forEach(item => { // Solo usamos activeItems aquí
          item.pedidos_involucrados.forEach(ped => {
              if(map[ped.id_pedido]) {
                  map[ped.id_pedido].items.push({...item, qty: ped.cantidad});
                  map[ped.id_pedido].stats.total++;
                  if(['recolectado','sustituido'].includes(item.status)) map[ped.id_pedido].stats.done++;
              }
          });
      });
      return map;
  };

  return (
    <div className="lsm-overlay" onClick={onClose}>
      <div className="lsm-content" onClick={e => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="lsm-header">
          <div className="lsm-header-info">
            <div className="lsm-icon-box"><FaListUl /></div>
            <div className="lsm-title">
              <h2>Ruta de {sessionInfo.picker_name}</h2>
              <span><FaClock style={{marginRight:5}}/> {new Date(sessionInfo.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
          </div>

          <div className="lsm-controls-group">
            {/* TOGGLE VISTAS */}
            <div className="lsm-view-toggle">
                <button className={`lsm-toggle-btn ${viewMode === "batch" && !showTrash ? "active" : ""}`} onClick={() => {setViewMode("batch"); setShowTrash(false)}}>
                <FaLayerGroup /> Activos ({activeItems.length})
                </button>
                <button className={`lsm-toggle-btn ${viewMode === "orders" ? "active" : ""}`} onClick={() => {setViewMode("orders"); setShowTrash(false)}}>
                <FaUserFriends /> Pedidos
                </button>
            </div>

            {/* BOTÓN PAPELERA */}
            <button 
                className={`lsm-trash-toggle ${showTrash ? 'active' : ''}`}
                onClick={() => { setShowTrash(true); setViewMode("batch"); }}
                title="Ver productos anulados"
            >
                <FaTrash /> Anulados ({removedItems.length})
            </button>
          </div>

          <button className="lsm-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* BODY */}
        <div className="lsm-body">
          
          {/* VISTA BATCH (ACTIVOS O PAPELERA) */}
          {viewMode === "batch" && (
            <>
              {displayItems.length === 0 && (
                  <div className="lsm-empty-state">
                      {showTrash ? "No hay productos anulados." : "No hay productos activos."}
                  </div>
              )}

              {displayItems.map((item, idx) => (
                <div key={idx} className={`lsm-item-card ${showTrash ? 'removed-mode' : item.status}`}>
                  <div className="lsm-item-img">
                    {item.image_src ? <img src={item.image_src} alt="" style={showTrash ? {filter:'grayscale(100%)'} : {}} /> : <FaBox color="#cbd5e1" />}
                  </div>

                  <div className="lsm-item-content">
                    <div className="lsm-item-name" style={showTrash ? {textDecoration:'line-through', color:'#ef4444'} : {}}>
                        {item.name}
                    </div>
                    <div className="lsm-item-meta">
                      <span className="lsm-pasillo-badge">{item.pasillo === "Otros" ? "General" : `Pasillo ${item.pasillo}`}</span>
                      <span><strong>{item.quantity_total}</strong> un. total</span>
                      {item.status === "sustituido" && !showTrash && (
                        <span style={{color:'#d97706', marginLeft:10}}><FaExclamationTriangle/> {item.sustituto.name}</span>
                      )}
                    </div>
                  </div>

                  {/* ACCIONES */}
                  {showTrash ? (
                      <button className="lsm-restore-btn" onClick={() => handleAdminRestore(item)} disabled={isProcessing} title="Restaurar al Batch">
                          <FaTrashRestore /> Restaurar
                      </button>
                  ) : (
                      <>
                        <div className="lsm-orders-dots">
                            {item.pedidos_involucrados.map((p, i) => (
                                <div key={i} className="lsm-dot" style={{ background: getOrderColor(p.id_pedido) }}>{getOrderLetter(p.id_pedido)}</div>
                            ))}
                        </div>
                        {item.status === 'pendiente' && (
                            <button className="lsm-delete-btn" onClick={() => handleAdminDelete(item)} disabled={isProcessing}>
                                <FaTrash />
                            </button>
                        )}
                        <div className={`lsm-status-badge ${item.status}`}>{item.status}</div>
                      </>
                  )}
                </div>
              ))}
            </>
          )}

          {/* VISTA ORDERS (Solo activos) */}
          {viewMode === "orders" && !showTrash && (
             <div className="live-orders-container">
                {Object.entries(getItemsByOrder()).map(([id, data]) => (
                    <div key={id} className="lsm-order-group">
                        <div className="lsm-og-header">
                            <strong>{data.customer}</strong> <span>{data.stats.done}/{data.stats.total}</span>
                        </div>
                        <div className="lsm-sub-list">
                            {data.items.map((it, k) => (
                                <div key={k} className="lsm-sub-item">
                                    {it.status === 'recolectado' && <FaCheck color="green"/>} {it.name} ({it.qty})
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
             </div>
          )}
        </div>
      </div>
    </div>
  );
};