import React from "react";
import { FaCheckCircle, FaQrcode } from "react-icons/fa";
import "./HistoryView.css";

/* ─── Helpers ─── */
const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const formatTime = (dateStr) =>
  new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const calcDuration = (start, end) =>
  Math.round((new Date(end) - new Date(start)) / 60000);

const getLogLabel = (log) => {
  if (log.accion === "recolectado")
    return log.es_sustituto ? "🔄 Sustituyó" : "✅ Recolectó";
  if (log.accion === "auditoria_finalizada") return "🏁 Finalizado";
  return log.accion;
};

/* ─── Subcomponentes ─── */
const SessionSummary = ({ metadata }) => (
  <div className="hdm-summary">
    <div>
      <div className="hdm-summary-label">Inicio</div>
      <div className="hdm-summary-value">{formatTime(metadata.start_time)}</div>
    </div>
    <div>
      <div className="hdm-summary-label">Fin</div>
      <div className="hdm-summary-value">{formatTime(metadata.end_time)}</div>
    </div>
    <div>
      <div className="hdm-summary-label">Duración</div>
      <div className="hdm-summary-value hdm-summary-value--accent">
        {calcDuration(metadata.start_time, metadata.end_time)} min
      </div>
    </div>
  </div>
);

const ProductThumbnail = ({ item, productsMap }) => {
  const prod = productsMap?.[item.id_producto] || {};
  const img = prod.image;
  const qty = item.cantidad || 1;
  // ✅ Priorizamos Barcode > SKU > item.sku_producto > vacío (no mostrar ID)
  const displayCode = prod.barcode || prod.sku || item.sku_producto || "";

  return (
    <div className="hdm-product-item">
      <div className="hdm-product-img-wrapper">
        {img ? (
          <img src={img} alt={displayCode} className="hdm-product-img" />
        ) : (
          <div className="hdm-product-img" style={{ background: "#e2e8f0" }} />
        )}
        <span className="hdm-product-qty">{qty}</span>
      </div>
      <div className="hdm-product-sku">{displayCode}</div>
    </div>
  );
};

const LogEntry = ({ log }) => {
  const isSub = log.es_sustituto;
  return (
    <div
      className={`hdm-log-item ${isSub ? "hdm-log-item--sub" : "hdm-log-item--normal"}`}
    >
      <span className="hdm-log-time">
        {new Date(log.fecha_registro).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>{" "}
      <span className="hdm-log-action">{getLogLabel(log)}</span>
      <strong>{log.nombre_producto}</strong>
      {isSub && (
        <div className="hdm-log-sub-detail">
          Por: {log.nombre_sustituto} (
          <span className="hdm-log-sub-price">
            {formatPrice(log.precio_nuevo)}
          </span>
          )
        </div>
      )}
    </div>
  );
};

const OrderCard = ({ orderInfo, logs, productsMap }) => {
  const order = orderInfo || {};
  const billing = order.billing || {};
  const orderLogs = logs.filter(
    (l) => String(l.id_pedido) === String(order.id),
  );
  const orderProducts = logs.filter(
    (l) =>
      String(l.id_pedido) === String(order.id) && l.accion === "recolectado",
  );

  return (
    <div className="hdm-order-card">
      <div className="hdm-order-header">
        <h4 className="hdm-order-title">Pedido #{order.id}</h4>
        {billing.first_name && (
          <div className="hdm-order-customer">
            <div className="hdm-order-customer-name">
              {billing.first_name} {billing.last_name}
            </div>
            <div className="hdm-order-customer-contact">
              {billing.phone || billing.email || ""}
            </div>
          </div>
        )}
      </div>

      {/* Grid de productos recolectados */}
      {orderProducts.length > 0 && (
        <div className="hdm-products-section">
          <div className="hdm-products-title">
            Productos ({orderProducts.length})
          </div>
          <div className="hdm-products-grid">
            {orderProducts.map((p) => (
              <ProductThumbnail key={p.id} item={p} productsMap={productsMap} />
            ))}
          </div>
        </div>
      )}

      {/* Novedades / Logs del pedido */}
      {orderLogs.length > 0 ? (
        orderLogs.map((log) => <LogEntry key={log.id} log={log} />)
      ) : (
        <p className="hdm-no-logs">Sin novedades</p>
      )}
    </div>
  );
};

/* ─── Componente Principal ─── */
const HistoryDetailModal = ({ historyDetail, onClose, onViewManifest }) => {
  if (!historyDetail) return null;

  const { metadata, orders_info, logs, products_map, final_snapshot } =
    historyDetail;

  const handleViewCertificate = () => {
    const mData = {
      ...final_snapshot,
      session_id: metadata?.session_id,
      picker: metadata?.picker_name || "Desconocido",
    };
    onViewManifest(mData);
  };

  return (
    <div className="hdm-overlay" onClick={onClose}>
      <div className="hdm-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="hdm-header">
          <h2>
            📋 Detalle — Sesión #
            {metadata?.session_id || historyDetail.session?.id}
          </h2>
          <button className="hdm-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Banner auditado */}
        {final_snapshot && (
          <div className="hdm-banner">
            <FaCheckCircle color="#16a34a" />
            <span className="hdm-banner-text">
              Sesión Auditada y Completada.
            </span>
            <button
              className="hdm-btn-certificate"
              onClick={handleViewCertificate}
            >
              <FaQrcode /> VER CERTIFICADO
            </button>
          </div>
        )}

        {/* Body */}
        <div className="hdm-body">
          {/* Resumen */}
          {metadata && <SessionSummary metadata={metadata} />}

          {/* Sección por pedido */}
          {orders_info && orders_info.length > 0 ? (
            <>
              <h3 className="hdm-section-title">
                Detalle por Pedido ({orders_info.length})
              </h3>
              {orders_info.map((oi) => (
                <OrderCard
                  key={oi.id}
                  orderInfo={oi}
                  logs={logs || []}
                  productsMap={products_map}
                />
              ))}
            </>
          ) : (
            /* Fallback: timeline clásico */
            <div className="audit-timeline">
              {(logs || []).map((log) => (
                <div
                  key={log.id}
                  className={`audit-item ${log.es_sustituto ? "sub" : ""}`}
                >
                  <div className="audit-time">
                    {new Date(log.fecha_registro).toLocaleTimeString()}
                  </div>
                  <div className="audit-content">
                    <div className="audit-title">
                      {getLogLabel(log)}: <strong>{log.nombre_producto}</strong>
                    </div>
                    {log.es_sustituto && (
                      <div className="audit-sub-detail">
                        Por: {log.nombre_sustituto} (
                        {formatPrice(log.precio_nuevo)})
                      </div>
                    )}
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

export default HistoryDetailModal;
