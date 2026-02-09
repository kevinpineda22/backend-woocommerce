import React, { useState } from "react";
import {
  FaLayerGroup,
  FaUserFriends,
  FaListUl,
  FaBox,
  FaCheckCircle,
  FaExclamationTriangle,
  FaClock,
  FaCheck
} from "react-icons/fa";
import "./LiveSessionModal.css";

const ORDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

export const LiveSessionModal = ({ sessionDetail, onClose }) => {
  const [viewMode, setViewMode] = useState("batch"); // 'batch' | 'orders'

  if (!sessionDetail) return null;

  const { sessionInfo, routeData } = sessionDetail;

  // --- Helpers ---
  const getOrderColor = (orderId) => {
    const idx = routeData.orders_info.findIndex((o) => o.id === orderId);
    return ORDER_COLORS[idx % ORDER_COLORS.length];
  };

  const getOrderLetter = (orderId) => {
    const idx = routeData.orders_info.findIndex((o) => o.id === orderId);
    return String.fromCharCode(65 + idx);
  };

  const getItemsByOrder = () => {
    const ordersMap = {};
    
    // 1. Crear estructura base
    routeData.orders_info.forEach((o, idx) => {
      ordersMap[o.id] = {
        customer: o.customer,
        total_order_value: o.total,
        color: ORDER_COLORS[idx % ORDER_COLORS.length],
        code_letter: String.fromCharCode(65 + idx),
        items: [],
        stats: { total: 0, done: 0 },
      };
    });

    // 2. Distribuir items
    routeData.items.forEach((item) => {
      item.pedidos_involucrados.forEach((ped) => {
        if (ordersMap[ped.id_pedido]) {
          ordersMap[ped.id_pedido].items.push({
            ...item,
            qty_needed: ped.cantidad,
          });
          ordersMap[ped.id_pedido].stats.total += 1;
          if (item.status === "recolectado" || item.status === "sustituido") {
            ordersMap[ped.id_pedido].stats.done += 1;
          }
        }
      });
    });
    return ordersMap;
  };

  return (
    <div className="lsm-overlay" onClick={onClose}>
      <div className="lsm-content" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="lsm-header">
          <div className="lsm-header-info">
            <div className="lsm-icon-box">
              <FaListUl />
            </div>
            <div className="lsm-title">
              <h2>Ruta de {sessionInfo.picker_name}</h2>
              <span>
                <FaClock style={{ marginRight: 5 }} />
                Inicio: {new Date(sessionInfo.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>

          <div className="lsm-view-toggle">
            <button
              className={`lsm-toggle-btn ${viewMode === "batch" ? "active" : ""}`}
              onClick={() => setViewMode("batch")}
            >
              <FaLayerGroup /> Batch (Ruta)
            </button>
            <button
              className={`lsm-toggle-btn ${viewMode === "orders" ? "active" : ""}`}
              onClick={() => setViewMode("orders")}
            >
              <FaUserFriends /> Por Pedidos
            </button>
          </div>

          <button className="lsm-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* BODY (SCROLL PRINCIPAL) */}
        <div className="lsm-body">
          
          {/* --- VISTA BATCH (Grid de productos) --- */}
          {viewMode === "batch" && (
            <>
              {routeData.items.map((item, idx) => (
                <div key={idx} className={`lsm-item-card ${item.status}`}>
                  <div className="lsm-item-img">
                    {item.image_src ? <img src={item.image_src} alt="" /> : <FaBox color="#cbd5e1" />}
                  </div>

                  <div className="lsm-item-content">
                    <div className="lsm-item-name">{item.name}</div>
                    <div className="lsm-item-meta">
                      <span className="lsm-pasillo-badge">
                        {item.pasillo === "Otros" ? "General" : `Pasillo ${item.pasillo}`}
                      </span>
                      <span><strong>{item.quantity_total}</strong> un. total</span>
                      
                      {item.status === "sustituido" && item.sustituto && (
                        <span style={{color: '#d97706', display:'flex', alignItems:'center', gap:4, marginLeft:10}}>
                           <FaExclamationTriangle size={12}/> Por: <strong>{item.sustituto.name}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="lsm-orders-dots">
                    {item.pedidos_involucrados.map((p, i) => (
                        <div 
                            key={i} 
                            className="lsm-dot" 
                            style={{ background: getOrderColor(p.id_pedido) }}
                            title={`Pedido #${p.id_pedido}: ${p.cantidad} un.`}
                        >
                            {getOrderLetter(p.id_pedido)}
                        </div>
                    ))}
                  </div>

                  <div className={`lsm-status-badge ${item.status === 'recolectado' ? 'ok' : item.status === 'sustituido' ? 'change' : 'wait'}`}>
                    {item.status}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* --- VISTA ORDERS (Agrupado y Ordenado) --- */}
          {viewMode === "orders" && (
             <div className="live-orders-container">
                {Object.entries(getItemsByOrder())
                    // ✅ ORDENAMIENTO: ID Ascendente para consistencia
                    .sort(([idA], [idB]) => Number(idA) - Number(idB)) 
                    .map(([orderId, data]) => {
                        const percentage = data.items.length > 0 
                            ? Math.round((data.stats.done / data.items.length) * 100) 
                            : 0;
                        
                        return (
                            <div key={orderId} className="lsm-order-group">
                                <div className="lsm-og-header">
                                    <div className="lsm-og-user">
                                        <div className="lsm-og-avatar" style={{background: data.color}}>
                                            {data.code_letter}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:800, color:'#1e293b', fontSize:'1.1rem'}}>
                                                {data.customer}
                                            </div>
                                            <div style={{fontSize:'0.85rem', color:'#64748b'}}>
                                                Pedido #{orderId} • {formatPrice(data.total_order_value)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lsm-og-progress">
                                        <div style={{fontSize:'0.75rem', fontWeight:700, color:'#64748b'}}>
                                            PROGRESO: {data.stats.done}/{data.items.length} ({percentage}%)
                                        </div>
                                        <div className="lsm-prog-bar">
                                            <div className="lsm-prog-fill" style={{width: `${percentage}%`, background: data.color}}></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="lsm-sub-list">
                                    {data.items.map((item, idx) => (
                                        <div key={idx} className="lsm-sub-item">
                                            <div className={`lsm-mini-status ${item.status === 'recolectado' ? 'done' : item.status === 'sustituido' ? 'sub' : 'pend'}`}>
                                                {item.status === 'recolectado' && <FaCheck size={12}/>}
                                                {item.status === 'sustituido' && <FaExclamationTriangle size={12}/>}
                                            </div>
                                            
                                            <div style={{flex:1}}>
                                                <div style={{fontSize:'0.95rem', color:'#334155', fontWeight:600}}>
                                                    {item.name}
                                                </div>
                                                <div style={{fontSize:'0.8rem', color:'#94a3b8'}}>
                                                    Cant: <strong>{item.qty_needed}</strong> • {item.sku || 'Sin SKU'}
                                                </div>
                                            </div>
                                            
                                            <div style={{fontWeight:700, fontSize:'0.9rem', color:'#1e293b'}}>
                                                {formatPrice(item.price)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                })}
             </div>
          )}

        </div>
      </div>
    </div>
  );
};