import React from "react";
import { FaFileAlt, FaQrcode, FaStoreAlt } from "react-icons/fa";
import "./HistoryView.css";

/* ─── Helpers ─── */
const ESTADO_CONFIG = {
  finalizado: { className: "hv-badge--pagado", label: "💰 Pagado" },
  auditado: { className: "hv-badge--pendiente", label: "🚧 Pendiente de Pago" },
};

const METODO_PAGO_CONFIG = {
  efectivo: { className: "hv-badge-metodo hv-badge-metodo--cash", label: "💵 Efectivo" },
  credito:  { className: "hv-badge-metodo hv-badge-metodo--credit", label: "🏦 Crédito" },
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
const HistoryView = ({
  historyOrders,
  loading,
  onViewDetail,
  onViewManifest,
  loadingText = "Cargando historial...",
  emptyText = "📭 No hay registros en el historial",
  isPaymentView = false,
  onMarkAsPaid,
  onMarkAsCredit,
}) => {
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
            <th>Fecha</th>
            {isPaymentView ? <th>Cliente(s)</th> : <th>Picker</th>}
            <th>Sede</th>
            <th>Pedidos</th>
            <th>Estado</th>
            <th>Duración</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {historyOrders.map((sess) => (
            <tr key={sess.id}>
              <td>
                <div className="hv-cell-fecha-label">{sess.fecha}</div>
                <small>{sess.hora_fin}</small>
              </td>

              {isPaymentView ? (
                <td>
                  <div className="hv-cell-stack">
                    {sess.clientes && sess.clientes.length > 0 ? (
                      sess.clientes.map((c, i) => (
                        <span key={i} className="hv-client-name">{c}</span>
                      ))
                    ) : (
                      <span className="hv-text-muted">Sin datos</span>
                    )}
                  </div>
                </td>
              ) : (
                <td>{sess.picker}</td>
              )}

              <td>
                {sess.sede_nombre ? (
                  <span className="hv-sede-tag">
                    <FaStoreAlt size={10} /> {sess.sede_nombre}
                  </span>
                ) : (
                  <span className="hv-text-muted">—</span>
                )}
              </td>
              <td>
                <div className="hv-cell-stack">
                  {sess.pedidos.map((p, i) => (
                    <span key={p} className="hv-order-id">
                      #{p} {isPaymentView ? "" : (sess.clientes?.[i] ? `(${sess.clientes[i].split(" ")[0]})` : "")}
                    </span>
                  ))}
                </div>
              </td>
              <td className="hv-cell-estado">
                <div className="hv-cell-stack hv-cell-stack--center">
                  {getEstadoBadge(sess.estado)}
                  {!isPaymentView && getMetodoPagoBadge(sess.metodo_pago)}
                </div>
              </td>
              <td>
                <span className="hv-badge-duracion">{sess.duracion}</span>
              </td>
              <td>
                <div className="hv-cell-acciones">
                  {isPaymentView && (
                    <>
                      <button
                        className="hv-btn-paid"
                        title="Marcar como Pagado (Efectivo)"
                        onClick={() => onMarkAsPaid(sess)}
                      >
                        💰 Pagado
                      </button>
                      <button
                        className="hv-btn-credit"
                        title="Marcar como Crédito"
                        onClick={() => onMarkAsCredit(sess)}
                      >
                        🏦 Crédito
                      </button>
                    </>
                  )}
                  <button
                    className="hv-btn-icon hv-btn-icon--warning"
                    title="Ver Logs"
                    onClick={() => onViewDetail(sess)}
                  >
                    <FaFileAlt />
                  </button>
                  <button
                    className="hv-btn-icon hv-btn-icon--success"
                    title="Ver Certificado"
                    onClick={() => onViewManifest(sess)}
                  >
                    <FaQrcode />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryView;
