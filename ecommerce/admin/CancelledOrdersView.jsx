import React, { useState } from "react";
import {
  FaTrashAlt,
  FaUndoAlt,
  FaUser,
  FaPhone,
  FaMapMarkerAlt,
  FaBox,
  FaCalendarAlt,
  FaStickyNote,
  FaSpinner,
  FaSync,
  FaBoxOpen,
} from "react-icons/fa";
import "./PedidosAdmin.css";

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const CancelledOrdersView = ({
  cancelledOrders,
  loading,
  onRefresh,
  onRestore,
  isRestoring,
}) => {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading && cancelledOrders.length === 0) {
    return (
      <div className="pedidos-main-loading">
        <div className="pedidos-spinner-large" />
        <p>Cargando pedidos cancelados...</p>
      </div>
    );
  }

  return (
    <>
      <div className="pedidos-filter-actions" style={{ marginBottom: 16 }}>
        <button
          className="pedidos-btn-sync"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <FaSpinner className="ec-spin" /> : <FaSync />} Actualizar
        </button>
      </div>

      <div className="pedidos-filter-results">
        <strong>{cancelledOrders.length}</strong> pedido
        {cancelledOrders.length !== 1 ? "s" : ""} cancelado
        {cancelledOrders.length !== 1 ? "s" : ""}
      </div>

      {cancelledOrders.length === 0 ? (
        <div className="pa-premium-empty-state">
          <FaBoxOpen className="pa-premium-empty-icon" size={56} />
          <h3 className="pa-premium-empty-title">Sin cancelaciones</h3>
          <p className="pa-premium-empty-text">
            No hay pedidos cancelados en este momento.
          </p>
        </div>
      ) : (
        <div className="cancelled-orders-list">
          {cancelledOrders.map((record) => {
            const order = record.order_data || {};
            const billing = order.billing || {};
            const lineItems = order.line_items || [];
            const isExpanded = expandedId === record.id;

            return (
              <div
                key={record.id}
                className={`cancelled-order-card ${isExpanded ? "expanded" : ""}`}
              >
                {/* Header */}
                <div
                  className="cancelled-order-header"
                  onClick={() => toggleExpand(record.id)}
                >
                  <div className="cancelled-order-header-left">
                    <FaTrashAlt className="cancelled-order-icon" />
                    <div>
                      <span className="cancelled-order-id">
                        Pedido #{record.order_id}
                      </span>
                      <span className="cancelled-order-customer">
                        {billing.first_name} {billing.last_name}
                      </span>
                    </div>
                  </div>
                  <div className="cancelled-order-header-right">
                    <span className="cancelled-order-total">
                      {formatPrice(order.total || 0)}
                    </span>
                    <span className="cancelled-order-date">
                      <FaCalendarAlt size={10} />{" "}
                      {new Date(record.cancelled_at).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Motivo + Admin (siempre visible) */}
                <div className="cancelled-order-reason">
                  <div className="cancelled-reason-block">
                    <FaStickyNote size={11} />
                    <div>
                      <span className="cancelled-reason-label">Motivo:</span>
                      <span className="cancelled-reason-text">
                        {record.motivo}
                      </span>
                    </div>
                  </div>
                  <div className="cancelled-admin-block">
                    <FaUser size={11} />
                    <span>Cancelado por: <strong>{record.admin_name}</strong></span>
                  </div>
                </div>

                {/* Detalles expandibles */}
                {isExpanded && (
                  <div className="cancelled-order-details">
                    {/* Info cliente */}
                    <div className="cancelled-detail-section">
                      <h5>Cliente</h5>
                      <div className="cancelled-detail-grid">
                        <span>
                          <FaUser size={10} /> {billing.first_name}{" "}
                          {billing.last_name}
                        </span>
                        {billing.phone && (
                          <span>
                            <FaPhone size={10} /> {billing.phone}
                          </span>
                        )}
                        {billing.address_1 && (
                          <span>
                            <FaMapMarkerAlt size={10} /> {billing.address_1},{" "}
                            {billing.city}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Productos */}
                    <div className="cancelled-detail-section">
                      <h5>
                        <FaBox size={11} /> Productos ({lineItems.length})
                      </h5>
                      <div className="cancelled-products-list">
                        {lineItems.map((item, idx) => (
                          <div key={idx} className="cancelled-product-row">
                            <span className="cancelled-product-qty">
                              {item.quantity}x
                            </span>
                            <span className="cancelled-product-name">
                              {item.name}
                            </span>
                            <span className="cancelled-product-price">
                              {formatPrice(item.total || item.price * item.quantity)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Nota del cliente */}
                    {order.customer_note && (
                      <div className="cancelled-detail-section">
                        <h5><FaStickyNote size={11} /> Nota del cliente</h5>
                        <p className="cancelled-customer-note">
                          {order.customer_note}
                        </p>
                      </div>
                    )}

                    {/* Botón restaurar */}
                    <button
                      className="cancelled-restore-btn"
                      onClick={() => onRestore(record)}
                      disabled={isRestoring}
                    >
                      {isRestoring ? (
                        <FaSpinner className="ec-spin" />
                      ) : (
                        <FaUndoAlt />
                      )}{" "}
                      Restaurar Pedido
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default CancelledOrdersView;
