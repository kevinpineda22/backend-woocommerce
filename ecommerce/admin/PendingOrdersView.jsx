import React, { useMemo, useState } from "react";
import { 
  FaSearch, FaCalendarAlt, FaMapMarkerAlt, 
  FaCheckDouble, FaTimes, FaBox, FaClock,
  FaCheck, FaUserCheck, FaBoxOpen, FaPhone, FaWalking
} from "react-icons/fa";
import "./PedidosAdmin.css"; 

const formatPrice = (amount) => 
  new Intl.NumberFormat("es-CO", { 
    style: "currency", 
    currency: "COP", 
    maximumFractionDigits: 0 
  }).format(amount);

const PendingOrdersView = ({ 
  orders, 
  loading, 
  searchTerm, setSearchTerm, 
  filterDate, setFilterDate, 
  filterZone, setFilterZone, 
  selectedIds, setSelectedIds,
  onAssignClick,
  onAssignSingleDirect 
}) => {

  const displayedOrders = useMemo(() => {
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

  const toggleSelection = (orderId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(orderId)) newSet.delete(orderId);
    else newSet.add(orderId);
    setSelectedIds(newSet);
  };

  const [localSelectedOrder, setLocalSelectedOrder] = useState(null);

  // ✅ Función auxiliar para detectar recogida
  const isPickupOrder = (order) => {
    return order.shipping_lines?.some(ship => ship.method_id === 'local_pickup');
  };

  return (
    <>
      <div className="pedidos-admin-filters-container">
         <div className="pedidos-admin-filter-group">
            <label><FaSearch/> Buscar</label>
            <input 
              type="text" 
              className="pedidos-admin-filter-input" 
              value={searchTerm} 
              onChange={(e)=>setSearchTerm(e.target.value)} 
              placeholder="#ID o Cliente"
            />
         </div>
         <div className="pedidos-admin-filter-group">
            <label><FaCalendarAlt/> Fecha</label>
            <input 
              type="date" 
              className="pedidos-admin-filter-input" 
              value={filterDate} 
              onChange={(e)=>setFilterDate(e.target.value)}
            />
         </div>
         <div className="pedidos-admin-filter-group">
            <label><FaMapMarkerAlt/> Zona</label>
            <input 
              type="text" 
              className="pedidos-admin-filter-input" 
              value={filterZone} 
              onChange={(e)=>setFilterZone(e.target.value)} 
              placeholder="Barrio / Ciudad"
            />
         </div>
         <div className="pedidos-filter-actions">
            <button className="pedidos-btn-clear" onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}>
                Limpiar
            </button>
         </div>
      </div>

      {loading && orders.length === 0 ? (
        <div className="pedidos-main-loading">
            <div className="pedidos-spinner-large"></div>
            <p>Sincronizando pedidos...</p>
        </div>
      ) : (
        <div className="pedidos-admin-orders-grid">
          {displayedOrders.length === 0 ? (
            <div className="pedidos-empty-list-container">
                <h3>No hay pedidos pendientes que coincidan.</h3>
            </div>
          ) : (
            displayedOrders.map(order => {
                const isSelected = selectedIds.has(order.id);
                const isPickup = isPickupOrder(order);

                return (
                  <div key={order.id} className={`pa-ticket-card ${isSelected ? 'selected' : ''}`}>
                     <div 
                        className="pa-ticket-left"
                        onClick={(e) => { e.stopPropagation(); toggleSelection(order.id); }}
                     >
                        <input type="checkbox" className="pa-ticket-checkbox" checked={isSelected} readOnly />
                     </div>
                     <div className="pa-ticket-content" onClick={() => setLocalSelectedOrder(order)}>
                        <div className="pa-ticket-header">
                            <div>
                                <span className="pa-ticket-id">#{order.id}</span>
                                {isPickup && (
                                  <span style={{background: '#d946ef', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '5px', display: 'inline-flex', alignItems: 'center', gap: '3px'}}>
                                    <FaWalking /> RECOGIDA
                                  </span>
                                )}
                            </div>
                            <span className="pa-ticket-date">
                                <FaClock size={12} style={{marginRight:4}}/> 
                                {new Date(order.date_created).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        <div className="pa-ticket-body">
                            <h4 className="pa-ticket-customer">{order.billing?.first_name} {order.billing?.last_name}</h4>
                            <div className="pa-ticket-meta">
                                <span className="pa-meta-item"><FaBox /> {order.line_items?.length} items</span>
                                <span className="pa-meta-price">{formatPrice(order.total)}</span>
                            </div>
                            <div className="pa-ticket-address">
                                {isPickup ? (
                                    <span style={{color: '#a21caf', fontWeight: 'bold'}}>Retira el cliente en sucursal</span>
                                ) : (
                                    <><FaMapMarkerAlt color="#ef4444" /> {order.billing?.address_1}, {order.billing?.city}</>
                                )}
                            </div>
                        </div>
                     </div>
                  </div>
                );
            })
          )}
        </div>
      )}

      {/* MODAL DETALLE PEDIDO */}
      {localSelectedOrder && (
        <div className="pedidos-modal-overlay" onClick={() => setLocalSelectedOrder(null)}>
          <div className="pedidos-modal-content large animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="pa-modal-header-custom">
              <div className="pa-modal-header-left">
                <div className="pa-modal-icon-badge"><FaBoxOpen size={20} /></div>
                <div>
                  <h2 className="pa-modal-id">Pedido #{localSelectedOrder.id}</h2>
                  <span className="pa-modal-date">
                    <FaClock size={12} /> {new Date(localSelectedOrder.date_created).toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <div className="pa-modal-header-right">
                <div className="pa-modal-total-label">Total</div>
                <h3 className="pa-modal-total">{formatPrice(localSelectedOrder.total)}</h3>
              </div>
              <button className="pa-close-btn-white" onClick={() => setLocalSelectedOrder(null)}>&times;</button>
            </div>

            <div className="pa-modal-body-custom">
              <div className="pa-detail-info-grid">
                <div className="pa-detail-card">
                  <h4 className="pa-section-title"><FaUserCheck /> Cliente</h4>
                  <p className="pa-info-main-text">{localSelectedOrder.billing?.first_name} {localSelectedOrder.billing?.last_name}</p>
                  <p className="pa-info-sub-text">{localSelectedOrder.billing?.email}</p>
                  <div className="pa-phone-row">
                      <FaPhone size={12}/> {localSelectedOrder.billing?.phone}
                  </div>
                </div>
                <div className="pa-detail-card">
                  <h4 className="pa-section-title"><FaMapMarkerAlt /> Entrega</h4>
                  {isPickupOrder(localSelectedOrder) ? (
                      <p className="pa-info-main-text" style={{color: '#a21caf'}}>🚶‍♂️ Recogida en Sucursal</p>
                  ) : (
                      <>
                        <p className="pa-info-main-text">{localSelectedOrder.billing?.address_1}</p>
                        <p className="pa-info-sub-text">{localSelectedOrder.billing?.city}</p>
                      </>
                  )}
                  {localSelectedOrder.customer_note && (
                      <div className="pa-note-box">
                          <strong>Nota:</strong> {localSelectedOrder.customer_note}
                      </div>
                  )}
                </div>
              </div>

              <div className="pa-products-section">
                <h4 className="pa-products-count-title">Productos <span>{localSelectedOrder.line_items.length}</span></h4>
                <div className="pa-products-list-scroll">
                  {localSelectedOrder.line_items.map((item) => {
                    const noteMeta = item.meta_data?.find(m => m.key === '_wcfx_item_note' || m.key === 'Nota de preparación');
                    return (
                    <div key={item.id} className="pa-product-detailed-row">
                      <div className="pa-prod-image-container">
                        {item.image?.src ? <img src={item.image.src} alt="" /> : <FaBox size={24} color="#cbd5e1" />}
                        <div className="pa-prod-qty-circle">{item.quantity}</div>
                      </div>
                      <div className="pa-prod-main-info">
                        <h5 className="pa-prod-full-name">{item.name}</h5>
                        <div className="pa-prod-sub-info">
                          <span className="pa-prod-sku-tag">{item.sku || "N/A"}</span>
                          <span className="pa-prod-price-tag">{formatPrice(item.total)}</span>
                        </div>
                        {/* Mostramos nota del producto en admin también */}
                        {noteMeta && (
                          <div style={{marginTop: '5px', fontSize: '0.8rem', color: '#b45309', background: '#fffbeb', padding: '4px 8px', borderRadius: '4px'}}>
                            <strong>Nota:</strong> {noteMeta.value}
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              </div>

              <div className="pa-modal-footer-custom">
                <div className="pa-footer-left">
                    <button className="pa-btn-secondary" onClick={() => setLocalSelectedOrder(null)}>Cerrar</button>
                    <button 
                        className={`pa-btn-toggle ${selectedIds.has(localSelectedOrder.id) ? 'active' : ''}`}
                        onClick={() => toggleSelection(localSelectedOrder.id)}
                    >
                        {selectedIds.has(localSelectedOrder.id) ? <><FaCheck /> Seleccionado</> : "Incluir en Lote"}
                    </button>
                </div>
                <div className="pa-footer-right">
                    <button 
                        className="pa-btn-success"
                        onClick={() => {
                            setLocalSelectedOrder(null);
                            onAssignSingleDirect(localSelectedOrder);
                        }}
                    >
                        <FaCheckDouble /> Asignar Ahora
                    </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="batch-action-bar">
            <div className="batch-info"><strong>{selectedIds.size}</strong> seleccionados</div>
            <div style={{display:'flex', gap:15}}>
                <button className="batch-btn cancel" onClick={()=>setSelectedIds(new Set())}><FaTimes/> Cancelar</button>
                <button className="batch-btn assign" onClick={onAssignClick}><FaCheckDouble/> Asignar a Picker</button>
            </div>
        </div>
      )}
    </>
  );
};

export default PendingOrdersView;