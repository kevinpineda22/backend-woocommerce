import React from "react";
import { FaFileAlt, FaQrcode } from "react-icons/fa";
import "./HistoryView.css";

/* ─── Helpers ─── */
const ESTADO_CONFIG = {
  finalizado: { className: "hv-badge--pagado", label: "💰 Pagado" },
  auditado: { className: "hv-badge--pendiente", label: "🚧 Pendiente de Pago" },
};

const getEstadoBadge = (estado) => {
  const config = ESTADO_CONFIG[estado] || {
    className: "hv-badge--default",
    label: estado,
  };
  return <span className={`hv-badge ${config.className}`}>{config.label}</span>;
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
            <th>Picker</th>
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
              <td>{sess.picker}</td>
              <td>{sess.pedidos.join(", ")}</td>
              <td className="hv-cell-estado">{getEstadoBadge(sess.estado)}</td>
              <td>
                <span className="hv-badge-duracion">{sess.duracion}</span>
              </td>
              <td>
                <div className="hv-cell-acciones">
                  {isPaymentView && (
                    <button
                      className="hv-btn-paid"
                      title="Marcar como Pagado"
                      onClick={() => onMarkAsPaid(sess)}
                    >
                      💰 Pagado
                    </button>
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
