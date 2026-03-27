import React from "react";
import { FaFileAlt, FaQrcode, FaStoreAlt } from "react-icons/fa";
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
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {sess.clientes && sess.clientes.length > 0 ? (
                      sess.clientes.map((c, i) => (
                        <span key={i} style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem" }}>
                          👤 {c}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "#64748b", fontStyle: "italic" }}>Sin datos</span>
                    )}
                  </div>
                </td>
              ) : (
                <td>{sess.picker}</td>
              )}

              <td>
                {sess.sede_nombre ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      borderRadius: 5,
                      background: "#f0f4ff",
                      border: "1px solid #c7d2fe",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#4338ca",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <FaStoreAlt size={10} /> {sess.sede_nombre}
                  </span>
                ) : (
                  <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                    —
                  </span>
                )}
              </td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {sess.pedidos.map((p, i) => (
                    <span key={p} style={{ fontSize: "0.8rem" }}>
                      #{p} {isPaymentView ? "" : (sess.clientes?.[i] ? `(${sess.clientes[i].split(" ")[0]})` : "")}
                    </span>
                  ))}
                </div>
              </td>
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
