import React from "react";
import { FaFileAlt, FaQrcode } from "react-icons/fa";
import "./HistoryView.css";

const HistoryView = ({
  historyOrders,
  loading,
  onViewDetail,
  onViewManifest,
}) => {
  if (loading) {
    return (
      <div className="history-loading-state">
        <div className="pedidos-spinner-large"></div>
        <p>Cargando historial...</p>
      </div>
    );
  }

  if (historyOrders.length === 0) {
    return (
      <div className="history-empty-state">
        <p>📭 No hay registros en el historial</p>
      </div>
    );
  }

  return (
    <div className="history-table-container">
      <table className="pickers-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Picker</th>
            <th>Pedidos</th>
            <th>Duración</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {historyOrders.map((sess) => (
            <tr key={sess.id}>
              <td>
                <div style={{ fontWeight: "bold", color: "#1e293b" }}>
                  {sess.fecha}
                </div>
                <small>{sess.hora_fin}</small>
              </td>
              <td>{sess.picker}</td>
              <td>{sess.pedidos.join(", ")}</td>
              <td>
                <span
                  className="pedidos-badge-ok"
                  style={{ background: "#e0f2fe", color: "#0284c7" }}
                >
                  {sess.duracion}
                </span>
              </td>
              <td style={{ display: "flex", gap: "5px" }}>
                <button
                  className="gp-btn-icon warning"
                  title="Ver Logs"
                  onClick={() => onViewDetail(sess)}
                >
                  <FaFileAlt />
                </button>
                <button
                  className="gp-btn-icon"
                  style={{ color: "#16a34a" }}
                  title="Ver Certificado"
                  onClick={() => onViewManifest(sess)}
                >
                  <FaQrcode />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryView;
