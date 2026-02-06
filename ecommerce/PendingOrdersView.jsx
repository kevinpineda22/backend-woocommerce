import React, { useMemo } from "react";
import { 
  FaSearch, FaCalendarAlt, FaMapMarkerAlt, 
  FaCheckDouble, FaTimes, FaBox, FaClock
} from "react-icons/fa";
import "./PedidosAdmin.css"; 

const formatPrice = (amount) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

const PendingOrdersView = ({ 
  orders, 
  loading, 
  searchTerm, setSearchTerm, 
  filterDate, setFilterDate, 
  filterZone, setFilterZone, 
  selectedIds, setSelectedIds,
  onAssignClick,
  onOrderClick // <--- NUEVA PROP PARA ABRIR EL MODAL
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

  return (
    <>
      {/* 1. BARRA DE FILTROS */}
      <div className="pedidos-admin-filters-container">
         <div className="pedidos-admin-filter-group">
            <label><FaSearch/> Buscar</label>
            <input type="text" className="pedidos-admin-filter-input" value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="#ID o Cliente"/>
         </div>
         <div className="pedidos-admin-filter-group">
            <label><FaCalendarAlt/> Fecha</label>
            <input type="date" className="pedidos-admin-filter-input" value={filterDate} onChange={(e)=>setFilterDate(e.target.value)}/>
         </div>
         <div className="pedidos-admin-filter-group">
            <label><FaMapMarkerAlt/> Zona</label>
            <input type="text" className="pedidos-admin-filter-input" value={filterZone} onChange={(e)=>setFilterZone(e.target.value)} placeholder="Barrio / Ciudad"/>
         </div>
         <div className="pedidos-filter-actions">
            <button className="pedidos-btn-clear" onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}>
                Limpiar Filtros
            </button>
         </div>
      </div>

      {/* 2. GRID DE PEDIDOS */}
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
                return (
                  <div 
                    key={order.id} 
                    className={`pa-ticket-card ${isSelected ? 'selected' : ''}`} 
                  >
                     {/* BANDA IZQUIERDA: SOLO PARA SELECCIONAR */}
                     <div 
                        className="pa-ticket-left"
                        onClick={(e) => {
                            e.stopPropagation(); // Evita abrir el modal
                            toggleSelection(order.id);
                        }}
                        title="Clic para seleccionar/deseleccionar"
                     >
                        <input 
                            type="checkbox" 
                            className="pa-ticket-checkbox" 
                            checked={isSelected} 
                            readOnly 
                        />
                     </div>

                     {/* CONTENIDO DERECHO: CLIC PARA VER DETALLES */}
                     <div 
                        className="pa-ticket-content"
                        onClick={() => onOrderClick(order)} // <--- AQUÍ ABRE EL MODAL
                        title="Ver detalles del pedido"
                     >
                        <div className="pa-ticket-header">
                            <span className="pa-ticket-id">#{order.id}</span>
                            <span className="pa-ticket-date">
                                <FaClock size={12} style={{marginRight:4}}/> 
                                {new Date(order.date_created).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        
                        <div className="pa-ticket-body">
                            <h4 className="pa-ticket-customer">
                                {order.billing?.first_name} {order.billing?.last_name}
                            </h4>
                            
                            <div className="pa-ticket-meta">
                                <span className="pa-meta-item">
                                    <FaBox /> {order.line_items?.length} items
                                </span>
                                <span className="pa-meta-price">
                                    {formatPrice(order.total)}
                                </span>
                            </div>
                            
                            <div className="pa-ticket-address">
                                <FaMapMarkerAlt color="#ef4444" /> 
                                {order.billing?.address_1 || "Sin dirección"}, {order.billing?.city}
                            </div>
                        </div>
                     </div>
                  </div>
                );
            })
          )}
        </div>
      )}

      {/* 3. BARRA FLOTANTE DE ACCIÓN */}
      {selectedIds.size > 0 && (
        <div className="batch-action-bar">
            <div className="batch-info">
                <strong>{selectedIds.size}</strong> pedidos seleccionados
            </div>
            <div style={{display:'flex', gap:15}}>
                <button className="batch-btn cancel" onClick={()=>setSelectedIds(new Set())}>
                    <FaTimes/> Cancelar
                </button>
                <button className="batch-btn assign" onClick={onAssignClick}>
                    <FaCheckDouble/> Asignar a Picker
                </button>
            </div>
        </div>
      )}
    </>
  );
};

export default PendingOrdersView;