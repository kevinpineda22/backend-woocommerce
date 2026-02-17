import React from "react";
import { FaCheckCircle, FaQrcode } from "react-icons/fa";
import "./HistoryView.css";

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

const HistoryDetailModal = ({ historyDetail, onClose, onViewManifest }) => {
  if (!historyDetail) return null;

  const handleViewCertificate = () => {
    const manifestData = {
      ...historyDetail.final_snapshot,
      session_id: historyDetail.metadata.session_id,
      picker: historyDetail.metadata.picker_name || "Desconocido",
    };
    onViewManifest(manifestData);
  };

  return (
    <div className="pedidos-modal-overlay high-z" onClick={onClose}>
      <div
        className="pedidos-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "800px", width: "90%" }}
      >
        {/* Header */}
        <div className="pedidos-modal-header">
          <h2>Auditoría Pym</h2>
          <button className="pedidos-modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Banner de Sesión Auditada */}
        {historyDetail.final_snapshot && (
          <div
            style={{
              padding: "10px 20px",
              background: "#f0fdf4",
              borderBottom: "1px solid #bbf7d0",
              display: "flex",
              gap: 10,
              alignItems: "center",
            }}
          >
            <FaCheckCircle color="#16a34a" />
            <span style={{ color: "#166534", fontWeight: 600 }}>
              Sesión Auditada y Completada.
            </span>
            <button
              onClick={handleViewCertificate}
              style={{
                marginLeft: "auto",
                background: "#22c55e",
                color: "white",
                border: "none",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <FaQrcode /> VER CERTIFICADO SALIDA
            </button>
          </div>
        )}

        {/* Timeline de Logs */}
        <div className="pedidos-modal-body">
          <div className="audit-timeline">
            {historyDetail.logs.map((log) => (
              <div
                key={log.id}
                className={`audit-item ${log.es_sustituto ? "sub" : ""}`}
              >
                <div className="audit-time">
                  {new Date(log.fecha_registro).toLocaleTimeString()}
                </div>
                <div className="audit-content">
                  <div className="audit-title">
                    {log.accion === "recolectado"
                      ? log.es_sustituto
                        ? "🔄 Sustituyó"
                        : "✅ Recolectó"
                      : log.accion}
                    : <strong>{log.nombre_producto}</strong>
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
        </div>
      </div>
    </div>
  );
};

export default HistoryDetailModal;
