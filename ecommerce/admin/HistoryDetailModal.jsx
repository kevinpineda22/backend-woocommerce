import React, { useMemo } from "react";
import {
  FaCheckCircle,
  FaQrcode,
  FaExchangeAlt,
  FaBoxOpen,
  FaTimesCircle,
  FaArrowRight,
  FaClock,
  FaUser,
  FaTruck,
  FaPhone,
  FaEnvelope,
} from "react-icons/fa";
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

/* ─── Stats Cards ─── */
const StatsBar = ({ logs }) => {
  const stats = useMemo(() => {
    const picked = logs.filter(
      (l) => l.accion === "recolectado" && !l.es_sustituto,
    ).length;
    const substituted = logs.filter((l) => l.accion === "sustituido").length;
    const notFound = logs.filter((l) => l.accion === "no_encontrado").length;
    return { picked, substituted, notFound };
  }, [logs]);

  return (
    <div className="hdm-stats-bar">
      <div className="hdm-stat-card hdm-stat-picked">
        <FaBoxOpen className="hdm-stat-icon" />
        <div className="hdm-stat-info">
          <span className="hdm-stat-number">{stats.picked}</span>
          <span className="hdm-stat-label">Recolectados</span>
        </div>
      </div>
      <div className="hdm-stat-card hdm-stat-substituted">
        <FaExchangeAlt className="hdm-stat-icon" />
        <div className="hdm-stat-info">
          <span className="hdm-stat-number">{stats.substituted}</span>
          <span className="hdm-stat-label">Sustituidos</span>
        </div>
      </div>
      <div className="hdm-stat-card hdm-stat-notfound">
        <FaTimesCircle className="hdm-stat-icon" />
        <div className="hdm-stat-info">
          <span className="hdm-stat-number">{stats.notFound}</span>
          <span className="hdm-stat-label">No Encontrados</span>
        </div>
      </div>
    </div>
  );
};

/* ─── Session Summary (mejorado) ─── */
const SessionSummary = ({ metadata }) => (
  <div className="hdm-summary">
    <div className="hdm-summary-item">
      <FaClock className="hdm-summary-icon" />
      <div>
        <div className="hdm-summary-label">Inicio</div>
        <div className="hdm-summary-value">
          {formatTime(metadata.start_time)}
        </div>
      </div>
    </div>
    <div className="hdm-summary-item">
      <FaClock className="hdm-summary-icon" />
      <div>
        <div className="hdm-summary-label">Fin</div>
        <div className="hdm-summary-value">{formatTime(metadata.end_time)}</div>
      </div>
    </div>
    <div className="hdm-summary-item">
      <div>
        <div className="hdm-summary-label">Duración</div>
        <div className="hdm-summary-value hdm-summary-value--accent">
          {calcDuration(metadata.start_time, metadata.end_time)} min
        </div>
      </div>
    </div>
    <div className="hdm-summary-item">
      <FaUser className="hdm-summary-icon" />
      <div>
        <div className="hdm-summary-label">Picker</div>
        <div className="hdm-summary-value">{metadata.picker_name}</div>
      </div>
    </div>
  </div>
);

/* ─── Producto con Imagen (mejorado) ─── */
const ProductCard = ({ log, productsMap }) => {
  const isSub = log.es_sustituto;
  const isNotFound = log.accion === "no_encontrado";
  const isSystem = log.accion === "auditoria_finalizada";

  if (isSystem) return null;

  // Imagen del producto original
  const originalProd = productsMap?.[log.id_producto] || {};
  const originalImg = originalProd.image;

  // Imagen del producto sustituto
  const subProd = isSub ? productsMap?.[log.id_producto_final] || {} : {};
  const subImg = subProd.image;

  // Código display
  const displayCode = originalProd.barcode || originalProd.sku || "";

  return (
    <div
      className={`hdm-product-card ${isSub ? "hdm-product-card--sub" : ""} ${isNotFound ? "hdm-product-card--notfound" : ""}`}
    >
      {/* Status indicator bar */}
      <div
        className={`hdm-product-status-bar ${isSub ? "sub" : isNotFound ? "notfound" : "normal"}`}
      />

      <div className="hdm-product-card-body">
        {/* Hora */}
        <div className="hdm-product-time">{formatTime(log.fecha_registro)}</div>

        {/* Imagen y detalles del producto */}
        <div className="hdm-product-main">
          <div className="hdm-product-img-container">
            {originalImg ? (
              <img src={originalImg} alt="" className="hdm-product-img-large" />
            ) : (
              <div className="hdm-product-img-placeholder">
                <FaBoxOpen size={20} color="#94a3b8" />
              </div>
            )}
          </div>

          <div className="hdm-product-details">
            <div
              className={`hdm-product-name ${isNotFound ? "hdm-strikethrough" : ""} ${isSub ? "hdm-strikethrough" : ""}`}
            >
              {log.nombre_producto}
            </div>
            {displayCode && (
              <div className="hdm-product-code">{displayCode}</div>
            )}

            {/* Badge de estado */}
            {!isSub && !isNotFound && (
              <span className="hdm-badge hdm-badge--success">
                ✓ Recolectado
              </span>
            )}
            {isNotFound && (
              <span className="hdm-badge hdm-badge--danger">
                ✕ No Encontrado
              </span>
            )}
          </div>
        </div>

        {/* Bloque de sustitución */}
        {isSub && (
          <div className="hdm-substitution-block">
            <div className="hdm-sub-arrow-container">
              <div className="hdm-sub-arrow-line" />
              <div className="hdm-sub-arrow-badge">
                <FaExchangeAlt size={10} />
                <span>SUSTITUIDO POR</span>
              </div>
              <div className="hdm-sub-arrow-line" />
            </div>

            <div className="hdm-product-main hdm-sub-product">
              <div className="hdm-product-img-container">
                {subImg ? (
                  <img src={subImg} alt="" className="hdm-product-img-large" />
                ) : (
                  <div className="hdm-product-img-placeholder hdm-placeholder--sub">
                    <FaExchangeAlt size={20} color="#d97706" />
                  </div>
                )}
              </div>
              <div className="hdm-product-details">
                <div className="hdm-product-name hdm-product-name--sub">
                  {log.nombre_sustituto}
                </div>
                {log.precio_nuevo > 0 && (
                  <div className="hdm-product-price">
                    {formatPrice(log.precio_nuevo)}
                  </div>
                )}
                <span className="hdm-badge hdm-badge--warning">
                  ↳ Sustituto
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Motivo si existe */}
        {log.motivo && (
          <div className="hdm-product-reason">
            <strong>Motivo:</strong> {log.motivo}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Order Card (mejorado) ─── */
const OrderCard = ({ orderInfo, logs, productsMap }) => {
  const order = orderInfo || {};
  const billing = order.billing || {};
  const shipping = order.shipping || {};
  const orderLogs = logs.filter(
    (l) =>
      String(l.id_pedido) === String(order.id) &&
      l.accion !== "auditoria_finalizada",
  );

  const subsCount = orderLogs.filter((l) => l.es_sustituto).length;
  const notFoundCount = orderLogs.filter(
    (l) => l.accion === "no_encontrado",
  ).length;

  const addr = shipping.address_1 || billing.address_1 || "";
  const city = shipping.city || billing.city || "";

  return (
    <div className="hdm-order-card">
      <div className="hdm-order-header">
        <div className="hdm-order-header-left">
          <h4 className="hdm-order-title">
            <FaTruck className="hdm-order-icon" />
            Pedido #{order.id}
          </h4>
          <div className="hdm-order-tags">
            <span className="hdm-order-tag">{orderLogs.length} acciones</span>
            {subsCount > 0 && (
              <span className="hdm-order-tag hdm-order-tag--warning">
                {subsCount} sustituciones
              </span>
            )}
            {notFoundCount > 0 && (
              <span className="hdm-order-tag hdm-order-tag--danger">
                {notFoundCount} no encontrados
              </span>
            )}
          </div>
        </div>
        {billing.first_name && (
          <div className="hdm-order-customer">
            <div className="hdm-order-customer-name">
              <FaUser size={11} /> {billing.first_name} {billing.last_name}
            </div>
            {billing.phone && (
              <div className="hdm-order-customer-contact">
                <FaPhone size={10} /> {billing.phone}
              </div>
            )}
            {billing.email && (
              <div className="hdm-order-customer-contact">
                <FaEnvelope size={10} /> {billing.email}
              </div>
            )}
            {(addr || city) && (
              <div className="hdm-order-customer-contact">
                <FaTruck size={10} /> {[addr, city].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de productos como tarjetas */}
      <div className="hdm-products-list">
        {orderLogs.map((log) => (
          <ProductCard key={log.id} log={log} productsMap={productsMap} />
        ))}
        {orderLogs.length === 0 && (
          <p className="hdm-no-logs">Sin novedades registradas</p>
        )}
      </div>
    </div>
  );
};

/* ─── Componente Principal ─── */
const HistoryDetailModal = ({ historyDetail, onClose, onViewManifest }) => {
  if (!historyDetail) return null;

  const { metadata, orders_info, logs, products_map, final_snapshot } =
    historyDetail;

  // Filtrar logs del sistema
  const actionLogs = useMemo(
    () => (logs || []).filter((l) => l.accion !== "auditoria_finalizada"),
    [logs],
  );

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
          <div className="hdm-header-info">
            <h2>📋 Detalle de Sesión</h2>
            <span className="hdm-header-session-id">
              #{(metadata?.session_id || "").slice(0, 8)}
            </span>
          </div>
          <button className="hdm-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Banner auditado */}
        {final_snapshot && (
          <div className="hdm-banner">
            <FaCheckCircle color="#16a34a" size={18} />
            <span className="hdm-banner-text">
              Sesión Auditada y Completada
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

          {/* Stats */}
          {actionLogs.length > 0 && <StatsBar logs={actionLogs} />}

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
                  logs={actionLogs}
                  productsMap={products_map}
                />
              ))}
            </>
          ) : (
            <div className="hdm-empty-state">
              <FaBoxOpen size={40} color="#cbd5e1" />
              <p>No hay datos de pedidos disponibles</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryDetailModal;
