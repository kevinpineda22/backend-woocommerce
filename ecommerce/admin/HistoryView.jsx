import React, { useState, useMemo } from "react";
import {
  FaFileAlt,
  FaQrcode,
  FaStoreAlt,
  FaPhone,
  FaEnvelope,
  FaSpinner,
  FaClipboardCheck,
  FaChevronLeft,
  FaChevronRight,
  FaClock,
  FaIdCard,
  FaCreditCard,
} from "react-icons/fa";
import "./HistoryView.css";

/* ─── Helpers ─── */
const ESTADO_CONFIG = {
  finalizado: { className: "hv-badge--pagado", label: "💰 Pagado" },
  auditado: { className: "hv-badge--pendiente", label: "🚧 Pendiente de Pago" },
};

const METODO_PAGO_CONFIG = {
  efectivo: {
    className: "hv-badge-metodo hv-badge-metodo--cash",
    label: "💵 Efectivo",
  },
  card: {
    className: "hv-badge-metodo hv-badge-metodo--datafono",
    label: "💳 Tarjeta",
  },
  tarjeta: {
    className: "hv-badge-metodo hv-badge-metodo--datafono",
    label: "💳 Tarjeta",
  },
  qr: {
    className: "hv-badge-metodo hv-badge-metodo--qr",
    label: "📱 QR",
  },
  datafono: {
    className: "hv-badge-metodo hv-badge-metodo--datafono",
    label: "💳 Datáfono",
  },
  credito: {
    className: "hv-badge-metodo hv-badge-metodo--credit",
    label: "🏦 Crédito",
  },
};

const getEstadoBadge = (estado) => {
  const config = ESTADO_CONFIG[estado] || {
    className: "hv-badge--default",
    label: estado,
  };
  return <span className={`hv-badge ${config.className}`}>{config.label}</span>;
};

const getMetodoPagoBadge = (metodo) => {
  if (!metodo) return null;
  const cfg = METODO_PAGO_CONFIG[metodo];
  if (!cfg) return null;
  return <span className={cfg.className}>{cfg.label}</span>;
};

/* ─── Componente ─── */
const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const HistoryView = ({
  historyOrders,
  loading,
  onViewDetail,
  onViewManifest,
  loadingText = "Cargando historial...",
  emptyText = "📭 No hay registros en el historial",
  isPaymentView = false,
  isAuditView = false,
  onMarkAsPaid,
  onMarkAsCredit,
  onAudit,
  pageSize = 10,
}) => {
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [loadingManifestId, setLoadingManifestId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(historyOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return historyOrders.slice(start, start + pageSize);
  }, [historyOrders, currentPage, pageSize]);

  // Reset page when data changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [historyOrders]);

  const handleViewDetail = async (sess) => {
    if (loadingDetailId) return;
    setLoadingDetailId(sess.id);
    try {
      await onViewDetail(sess);
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleViewManifest = async (sess) => {
    if (loadingManifestId) return;
    setLoadingManifestId(sess.id);
    try {
      await onViewManifest(sess);
    } finally {
      setLoadingManifestId(null);
    }
  };
  if (loading) {
    return (
      <div className="history-loading-state">
        <div className="pedidos-spinner-large" />
        <p>{loadingText}</p>
      </div>
    );
  }

  if (historyOrders.length === 0) {
    return (
      <div className="history-empty-state">
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="history-table-container">
      <table className="hv-table">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Pedidos / Total</th>
            {isAuditView ? <th>Trazabilidad</th> : <th>Fecha</th>}
            {!isPaymentView && <th>Picker</th>}
            <th>Sede</th>
            <th>Estado</th>
            <th>Duración</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {paginatedOrders.map((sess) => (
            <tr key={sess.id}>
              {/* ── CLIENTE + CONTACTO (siempre visible, primera columna) ── */}
              <td>
                <div className="hv-client-block">
                  {sess.clientes && sess.clientes.length > 0 ? (
                    sess.clientes.map((c, i) => (
                      <div key={i} className="hv-client-row">
                        <span className="hv-client-name">{c}</span>
                        {sess.telefonos?.[i] && (
                          <a
                            href={`tel:${sess.telefonos[i]}`}
                            className="hv-contact-link"
                          >
                            <FaPhone size={9} /> {sess.telefonos[i]}
                          </a>
                        )}
                        {sess.emails?.[i] && (
                          <a
                            href={`mailto:${sess.emails[i]}`}
                            className="hv-contact-link"
                          >
                            <FaEnvelope size={9} /> {sess.emails[i]}
                          </a>
                        )}
                        {sess.documentos?.[i] && (
                          <span className="hv-contact-link hv-doc-badge">
                            <FaIdCard size={9} /> {sess.documentos[i]}
                          </span>
                        )}
                        {sess.metodos_pago?.[i] && (
                          <span className="hv-contact-link">
                            <FaCreditCard size={9} /> {sess.metodos_pago[i]}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className="hv-text-muted">Sin datos</span>
                  )}
                </div>
              </td>

              {/* ── PEDIDOS + TOTAL (fusionados) ── */}
              <td>
                <div className="hv-orders-block">
                  {sess.pedidos.map((p, i) => (
                    <div key={p} className="hv-order-row">
                      <span className="hv-order-id">#{p}</span>
                      {sess.totales?.[i] ? (
                        <span className="hv-order-total">
                          {formatPrice(sess.totales[i])}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {sess.totales && sess.totales.length > 1 && (
                    <div className="hv-order-total-sum">
                      Σ{" "}
                      {formatPrice(
                        sess.totales.reduce(
                          (sum, t) => sum + (parseFloat(t) || 0),
                          0,
                        ),
                      )}
                    </div>
                  )}
                </div>
              </td>

              {/* ── FECHA / TRAZABILIDAD ── */}
              <td>
                {isAuditView ? (
                  <div className="hv-trace-block">
                    {sess.clientes?.map((c, i) => (
                      <div key={i} className="hv-trace-row">
                        <span className="hv-trace-client">
                          {c} — #{sess.pedidos?.[i]}
                        </span>
                        {sess.fechas_pedidos?.[i] && (
                          <span className="hv-trace-step hv-trace-step--order">
                            <FaClock size={9} /> Pedido:{" "}
                            {sess.fechas_pedidos[i].hora}
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="hv-trace-session">
                      <span className="hv-trace-step hv-trace-step--assign">
                        📋 Asignado: {sess.hora_inicio || "--"}
                      </span>
                      <span className="hv-trace-step hv-trace-step--done">
                        ✅ Finalizado: {sess.hora_fin || "--"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="hv-cell-fecha-label">{sess.fecha}</div>
                    <small>{sess.hora_fin}</small>
                  </>
                )}
              </td>

              {/* ── PICKER (no en payment view) ── */}
              {!isPaymentView && <td>{sess.picker}</td>}

              {/* ── SEDE ── */}
              <td>
                {sess.sede_nombre ? (
                  <span className="hv-sede-tag">
                    <FaStoreAlt size={10} /> {sess.sede_nombre}
                  </span>
                ) : (
                  <span className="hv-text-muted">—</span>
                )}
              </td>

              {/* ── ESTADO ── */}
              <td className="hv-cell-estado">
                <div className="hv-cell-stack hv-cell-stack--center">
                  {getEstadoBadge(sess.estado)}
                  {!isPaymentView && getMetodoPagoBadge(sess.metodo_pago)}
                </div>
              </td>

              {/* ── DURACIÓN ── */}
              <td>
                <span className="hv-badge-duracion">{sess.duracion}</span>
              </td>

              {/* ── ACCIONES ── */}
              <td>
                <div className="hv-cell-acciones">
                  {isPaymentView && (
                    <div className="hv-payment-methods">
                      <button
                        className="hv-btn-pay hv-btn-pay--cash"
                        title="Pagó en Efectivo"
                        onClick={() => onMarkAsPaid(sess, "efectivo")}
                      >
                        💵 Efectivo
                      </button>
                      <button
                        className="hv-btn-pay hv-btn-pay--qr"
                        title="Pagó con QR"
                        onClick={() => onMarkAsPaid(sess, "qr")}
                      >
                        📱 QR
                      </button>
                      <button
                        className="hv-btn-pay hv-btn-pay--datafono"
                        title="Pagó con Datáfono"
                        onClick={() => onMarkAsPaid(sess, "datafono")}
                      >
                        💳 Datáfono
                      </button>
                      <button
                        className="hv-btn-pay hv-btn-pay--credit"
                        title="Marcar como Crédito"
                        onClick={() => onMarkAsCredit(sess)}
                      >
                        🏦 Crédito
                      </button>
                    </div>
                  )}
                  {isAuditView && onAudit && (
                    <button
                      className="hv-btn-icon hv-btn-icon--audit"
                      title="Auditar Sesión"
                      onClick={() => onAudit(sess)}
                    >
                      <FaClipboardCheck />
                    </button>
                  )}
                  <button
                    className="hv-btn-icon hv-btn-icon--warning"
                    title="Ver Logs"
                    onClick={() => handleViewDetail(sess)}
                    disabled={loadingDetailId === sess.id}
                  >
                    {loadingDetailId === sess.id ? (
                      <FaSpinner className="ec-spin" />
                    ) : (
                      <FaFileAlt />
                    )}
                  </button>
                  <button
                    className="hv-btn-icon hv-btn-icon--success"
                    title="Ver Certificado"
                    onClick={() => handleViewManifest(sess)}
                    disabled={loadingManifestId === sess.id}
                  >
                    {loadingManifestId === sess.id ? (
                      <FaSpinner className="ec-spin" />
                    ) : (
                      <FaQrcode />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── PAGINACIÓN ── */}
      {totalPages > 1 && (
        <div className="hv-pagination">
          <button
            className="hv-page-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            <FaChevronLeft size={12} />
          </button>
          <span className="hv-page-info">
            {currentPage} / {totalPages}
            <small> ({historyOrders.length} registros)</small>
          </span>
          <button
            className="hv-page-btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            <FaChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
