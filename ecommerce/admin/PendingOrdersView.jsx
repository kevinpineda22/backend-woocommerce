import React, { useMemo, useState } from "react";
import {
  FaSearch,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaCheckDouble,
  FaTimes,
  FaBox,
  FaClock,
  FaCheck,
  FaUserCheck,
  FaBoxOpen,
  FaPhone,
  FaWalking,
  FaStoreAlt,
  FaSpinner,
  FaSync,
  FaTrashAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import "./PedidosAdmin.css";

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const PendingOrdersView = ({
  orders,
  loading,
  searchTerm,
  setSearchTerm,
  filterDate,
  setFilterDate,
  filterZone,
  setFilterZone,
  selectedIds,
  setSelectedIds,
  onAssignClick,
  onAssignSingleDirect,
  isFetchingPickers,
  onForceSync,
  onCancelOrder,
  isCancelling,
}) => {
  const displayedOrders = useMemo(() => {
    return orders.filter((order) => {
      const sLower = searchTerm.toLowerCase();
      const idReal = (order.id || "").toString();
      let fullName = order.billing
        ? `${order.billing.first_name} ${order.billing.last_name}`
        : "";
      fullName = fullName.toLowerCase();

      const matchText = idReal.includes(sLower) || fullName.includes(sLower);

      let matchDate = true;
      if (filterDate) {
        const dRaw = order.date_created;
        if (dRaw)
          matchDate = new Date(dRaw).toISOString().split("T")[0] === filterDate;
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
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");

  // ✅ Función auxiliar para detectar recogida
  const isPickupOrder = (order) => {
    return order.shipping_lines?.some(
      (ship) => ship.method_id === "local_pickup",
    );
  };

  return (
    <>
      {/* FILTROS — flat, sin wrappers innecesarios */}
      <div className="pedidos-admin-filters-container">
        <div className="pedidos-admin-filter-group">
          <label><FaSearch /> Buscar</label>
          <input
            type="text"
            className="pedidos-admin-filter-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="#ID o Cliente"
          />
        </div>
        <div className="pedidos-admin-filter-group">
          <label><FaCalendarAlt /> Fecha</label>
          <input
            type="date"
            className="pedidos-admin-filter-input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </div>
        <div className="pedidos-admin-filter-group">
          <label><FaMapMarkerAlt /> Zona</label>
          <input
            type="text"
            className="pedidos-admin-filter-input"
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            placeholder="Barrio / Ciudad"
          />
        </div>
        <div className="pedidos-filter-actions">
          <button
            className="pedidos-btn-sync"
            onClick={onForceSync}
            disabled={loading}
          >
            {loading ? <FaSpinner className="ec-spin" /> : <FaSync />} Sincronizar
          </button>
          <button
            className="pedidos-btn-clear"
            onClick={() => { setSearchTerm(""); setFilterDate(""); setFilterZone(""); }}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="pedidos-filter-results">
        Mostrando <strong>{displayedOrders.length}</strong> de <strong>{orders.length}</strong> pedidos
      </div>

      {loading && orders.length === 0 ? (
        <div className="pedidos-main-loading">
          <div className="pedidos-spinner-large" />
          <p>Sincronizando pedidos...</p>
        </div>
      ) : (
        <div className="pedidos-admin-orders-grid">
          {displayedOrders.length === 0 ? (
            <div className="pa-premium-empty-state">
              <FaBoxOpen className="pa-premium-empty-icon" size={56} />
              <h3 className="pa-premium-empty-title">
                {orders.length === 0 ? "Todo al dia" : "Sin Coincidencias"}
              </h3>
              <p className="pa-premium-empty-text">
                {orders.length === 0
                  ? "No hay nuevos pedidos pendientes de preparar."
                  : "Ningun pedido coincide con tus terminos de busqueda."}
              </p>
            </div>
          ) : (
            displayedOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const isPickup = isPickupOrder(order);

              return (
                <div
                  key={order.id}
                  className={`pa-ticket-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setLocalSelectedOrder(order)}
                >
                  <div className="pa-ticket-header">
                    <div className="pa-ticket-tags-row">
                      <input
                        type="checkbox"
                        className="pa-ticket-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(order.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="pa-ticket-id">#{order.id}</span>
                      {order.sede_detected && (
                        <span className="pa-ticket-sede-tag">
                          <FaStoreAlt size={9} /> {order.sede_detected}
                        </span>
                      )}
                      {isPickup && (
                        <span className="pa-ticket-pickup-tag">
                          <FaWalking /> RECOGIDA
                        </span>
                      )}
                    </div>
                    <span className="pa-ticket-date">
                      <FaClock size={11} />
                      {new Date(order.date_created).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
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
                    {isPickup ? (
                      <span className="pa-ticket-address-pickup">
                        Retira el cliente en sede
                      </span>
                    ) : (
                      <>
                        <FaMapMarkerAlt color="#ef4444" />{" "}
                        {order.billing?.address_1}, {order.billing?.city}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL DETALLE PEDIDO */}
      {localSelectedOrder && (
        <div
          className="pedidos-modal-overlay"
          onClick={() => setLocalSelectedOrder(null)}
        >
          <div
            className="pedidos-modal-content large animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pa-modal-header-custom">
              <div className="pa-modal-header-left">
                <div className="pa-modal-icon-badge">
                  <FaBoxOpen size={20} />
                </div>
                <div>
                  <h2 className="pa-modal-id">
                    Pedido #{localSelectedOrder.id}
                  </h2>
                  <span className="pa-modal-date">
                    <FaClock size={12} />{" "}
                    {new Date(localSelectedOrder.date_created).toLocaleString(
                      "es-CO",
                    )}
                  </span>
                </div>
              </div>
              <div className="pa-modal-header-right">
                <div className="pa-modal-total-label">Total</div>
                <h3 className="pa-modal-total">
                  {formatPrice(localSelectedOrder.total)}
                </h3>
              </div>
              <button
                className="pa-close-btn-white"
                onClick={() => setLocalSelectedOrder(null)}
              >
                &times;
              </button>
            </div>

            <div className="pa-modal-body-custom">
              <div className="pa-detail-info-grid">
                <div className="pa-detail-card">
                  <h4 className="pa-section-title">
                    <FaUserCheck /> Cliente
                  </h4>
                  <p className="pa-info-main-text">
                    {localSelectedOrder.billing?.first_name}{" "}
                    {localSelectedOrder.billing?.last_name}
                  </p>
                  <p className="pa-info-sub-text">
                    {localSelectedOrder.billing?.email}
                  </p>
                  <div className="pa-phone-row">
                    <FaPhone size={12} /> {localSelectedOrder.billing?.phone}
                  </div>
                </div>
                <div className="pa-detail-card">
                  <h4 className="pa-section-title">
                    <FaMapMarkerAlt /> Entrega
                  </h4>
                  {isPickupOrder(localSelectedOrder) ? (
                    <p className="pa-info-main-text pa-ticket-address-pickup">
                      🚶‍♂️ Recogida en Sede
                    </p>
                  ) : (
                    <>
                      <p className="pa-info-main-text">
                        {localSelectedOrder.billing?.address_1}
                      </p>
                      <p className="pa-info-sub-text">
                        {localSelectedOrder.billing?.city}
                      </p>
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
                <h4 className="pa-products-count-title">
                  Productos <span>{localSelectedOrder.line_items.length}</span>
                </h4>
                <div className="pa-products-list-scroll">
                  {localSelectedOrder.line_items.map((item) => {
                    const noteMeta = item.meta_data?.find(
                      (m) =>
                        m.key === "_wcfx_item_note" ||
                        m.key === "Nota de preparación",
                    );
                    return (
                      <div key={item.id} className="pa-product-detailed-row">
                        <div className="pa-prod-image-container">
                          {item.image?.src ? (
                            <img src={item.image.src} alt="" />
                          ) : (
                            <FaBox size={24} color="#cbd5e1" />
                          )}
                          <div className="pa-prod-qty-circle">
                            {item.quantity}
                          </div>
                        </div>
                        <div className="pa-prod-main-info">
                          <h5 className="pa-prod-full-name">{item.name}</h5>
                          <div className="pa-prod-sub-info">
                            <span className="pa-prod-sku-tag">
                              {item.sku || "N/A"}
                            </span>
                            <span className="pa-prod-price-tag">
                              {formatPrice(item.total)}
                            </span>
                          </div>
                          {noteMeta && (
                            <div className="pa-prod-note-box">
                              <strong>Nota:</strong> {noteMeta.value}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pa-modal-footer-custom">
                <div className="pa-footer-left">
                  <button
                    className="pa-btn-secondary"
                    onClick={() => setLocalSelectedOrder(null)}
                  >
                    Cerrar
                  </button>
                  <button
                    className={`pa-btn-toggle ${selectedIds.has(localSelectedOrder.id) ? "active" : ""}`}
                    onClick={() => toggleSelection(localSelectedOrder.id)}
                  >
                    {selectedIds.has(localSelectedOrder.id) ? (
                      <>
                        <FaCheck /> Seleccionado
                      </>
                    ) : (
                      "Incluir en Lote"
                    )}
                  </button>
                  <button
                    className="pa-btn-cancel-order"
                    onClick={() => {
                      setCancelMotivo("");
                      setShowCancelModal(true);
                    }}
                    disabled={isCancelling}
                  >
                    <FaTrashAlt /> Cancelar Pedido
                  </button>
                </div>
                <div className="pa-footer-right">
                  <button
                    className="pa-btn-success"
                    onClick={() => {
                      setLocalSelectedOrder(null);
                      onAssignSingleDirect(localSelectedOrder);
                    }}
                    disabled={isFetchingPickers}
                  >
                    {isFetchingPickers ? (
                      <FaSpinner className="ec-spin" />
                    ) : (
                      <FaCheckDouble />
                    )}{" "}
                    Asignar Ahora
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="batch-action-bar">
          <div className="batch-info">
            <strong>{selectedIds.size}</strong> seleccionados
          </div>
          <div className="pa-batch-buttons">
            <button
              className="batch-btn cancel"
              onClick={() => setSelectedIds(new Set())}
              disabled={isFetchingPickers}
            >
              <FaTimes /> Cancelar
            </button>
            <button
              className="batch-btn assign"
              onClick={onAssignClick}
              disabled={isFetchingPickers}
            >
              {isFetchingPickers ? (
                <FaSpinner className="ec-spin" />
              ) : (
                <FaCheckDouble />
              )}{" "}
              Asignar a Picker
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CANCELACIÓN */}
      {showCancelModal && localSelectedOrder && (
        <div
          className="pedidos-modal-overlay"
          onClick={() => setShowCancelModal(false)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="pedidos-modal-content cancel-modal animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cancel-modal-header">
              <FaExclamationTriangle className="cancel-modal-icon" />
              <h3>Cancelar Pedido #{localSelectedOrder.id}</h3>
            </div>
            <p className="cancel-modal-warning">
              Esta acción cambiará el estado del pedido en WooCommerce a{" "}
              <strong>cancelado</strong>. El cliente será notificado por email.
            </p>
            <div className="cancel-modal-field">
              <label>Motivo de cancelación *</label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder="Ej: Cliente solicitó cancelación por teléfono, producto agotado, error en pedido..."
                rows={3}
                autoFocus
              />
            </div>
            <div className="cancel-modal-actions">
              <button
                className="pa-btn-secondary"
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
              >
                <FaTimes /> Volver
              </button>
              <button
                className="pa-btn-danger"
                disabled={!cancelMotivo.trim() || isCancelling}
                onClick={async () => {
                  await onCancelOrder(localSelectedOrder, cancelMotivo);
                  setShowCancelModal(false);
                  setLocalSelectedOrder(null);
                  setCancelMotivo("");
                }}
              >
                {isCancelling ? (
                  <FaSpinner className="ec-spin" />
                ) : (
                  <FaTrashAlt />
                )}{" "}
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PendingOrdersView;
