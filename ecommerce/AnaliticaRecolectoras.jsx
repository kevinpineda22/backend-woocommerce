import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  FaChartLine,
  FaChartPie,
  FaListUl,
  FaSearch,
  FaTrophy,
  FaClock,
  FaShoppingBasket,
  FaExclamationTriangle,
  FaSync,
} from "react-icons/fa";
import "./AnaliticaRecolectoras.css";

const AnaliticaRecolectoras = () => {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | logs
  const [performanceData, setPerformanceData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Carga inicial
  const fetchData = async () => {
    setLoading(true);
    try {
      // Ajuste de URLs para entorno local vs producción
      const BASE_URL = "https://backend-woocommerce.vercel.app/api";

      const [perfRes, heatRes, auditRes] = await Promise.all([
        axios.get(`${BASE_URL}/analytics/performance`),
        axios.get(`${BASE_URL}/analytics/heatmap`),
        axios.get(`${BASE_URL}/analytics/audit`),
      ]);

      setPerformanceData(perfRes.data);
      setHeatmapData(heatRes.data);
      setAuditLogs(auditRes.data);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="analitica-container">
      <div className="analitica-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h1>Centro de Inteligencia</h1>
            <p>
              Métricas de rendimiento y auditoría de recolección en tiempo real
            </p>
          </div>
          <button className="pedidos-admin-refresh-btn" onClick={fetchData}>
            <FaSync className={loading ? "ec-spin" : ""} /> Actualizar Dátos
          </button>
        </div>
      </div>

      <div className="analitica-tabs">
        <button
          className={`analitica-tab ${
            activeTab === "dashboard" ? "active" : ""
          }`}
          onClick={() => setActiveTab("dashboard")}
        >
          <FaChartPie /> Dashboard General
        </button>
        <button
          className={`analitica-tab ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          <FaListUl /> Auditoría Forense
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          Cargando inteligencia de negocio...
        </div>
      ) : activeTab === "dashboard" ? (
        <div className="dashboard-grid">
          {/* CARD 1: RENDIMIENTO RECOLECTORAS */}
          <div className="card-analitica">
            <div className="card-title">
              <span>🏆 Rendimiento y Calidad de Recolección</span>
              <FaTrophy color="#f1c40f" />
            </div>
            <table className="rank-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Pedidos</th>
                  <th>Velocidad</th>
                  <th>Precisión</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="rank-number">{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                      <div style={{ fontSize: "0.75rem", color: "#7f8c8d" }}>
                        ~{p.promedio_minutos} min/pedido
                      </div>
                    </td>
                    <td style={{ fontWeight: "bold" }}>{p.total_pedidos}</td>
                    <td>
                      <span
                        style={{
                          background: "#ebf8ff",
                          color: "#3182ce",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: "bold",
                        }}
                      >
                        {p.velocidad_picking}
                      </span>{" "}
                      <span style={{ fontSize: "0.7rem", color: "#7f8c8d" }}>
                        it/min
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 24,
                            height: 4,
                            background: "#edf2f7",
                            borderRadius: 2,
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              width: `${p.tasa_precision}%`,
                              height: "100%",
                              background:
                                p.tasa_precision >= 95 ? "#48bb78" : "#ed8936",
                              borderRadius: 2,
                            }}
                          ></div>
                        </div>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color:
                              p.tasa_precision >= 95 ? "#2f855a" : "#c05621",
                            fontWeight: 600,
                          }}
                        >
                          {p.tasa_precision}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {performanceData.length === 0 && (
                  <tr>
                    <td colSpan="5">Sin datos aún</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CARD 2: PRODUCTOS MÁS RETIRADOS (OJO DE HALCÓN) */}
          <div className="card-analitica">
            <div className="card-title">
              <span>⚠️ Alertas de Inventario (Más Retirados)</span>
              <FaExclamationTriangle color="#e74c3c" />
            </div>

            <div
              className="heatmap-list"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {heatmapData
                .filter((p) => p.total_removed > 0)
                .sort((a, b) => b.total_removed - a.total_removed)
                .slice(0, 5)
                .map((p, idx) => (
                  <div
                    key={idx}
                    style={{ borderBottom: "1px solid #eee", paddingBottom: 8 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.9rem",
                        marginBottom: 4,
                      }}
                    >
                      <strong>{p.name}</strong>
                      <span style={{ color: "#e74c3c", fontWeight: "bold" }}>
                        {p.total_removed} Fallos
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#7f8c8d" }}>
                      Motivo principal:{" "}
                      {Object.entries(p.motivos).sort(
                        (a, b) => b[1] - a[1]
                      )[0]?.[0] || "N/A"}
                    </div>
                    <div className="progress-bar-bg">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${
                            (p.total_removed / p.total_interacciones) * 100
                          }%`,
                          background: "#e74c3c",
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              {heatmapData.length === 0 && (
                <div>Todo perfecto en inventario</div>
              )}
            </div>
          </div>

          {/* CARD 3: MAPA DE CALOR (PRODUCTOS POPULARES) */}
          <div className="card-analitica" style={{ gridColumn: "span 2" }}>
            <div className="card-title">
              <span>🔥 Mapa de Calor (Productos más movidos)</span>
              <FaChartLine color="#3498db" />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {heatmapData.slice(0, 20).map((p, idx) => {
                // Top 20
                // Tamaño basado en popularidad relativa
                const maxPicks = Math.max(
                  ...heatmapData.map((h) => h.total_interacciones)
                );
                const scale = p.total_interacciones / maxPicks;
                return (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      background: `rgba(52, 152, 219, ${0.1 + scale * 0.9})`, // Opacidad dinamica
                      color: scale > 0.5 ? "white" : "#2c3e50",
                      borderRadius: 8,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {p.name}
                    <span
                      style={{
                        background: "rgba(0,0,0,0.2)",
                        padding: "0 4px",
                        borderRadius: 4,
                        fontSize: "0.7rem",
                      }}
                    >
                      {p.total_interacciones}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="card-analitica">
          <div className="card-title">
            <span>🕵️ Auditoría Forense Completa</span>
            {/* Aquí podrías agregar un input de búsqueda local */}
          </div>
          <div className="log-list">
            {auditLogs.map((log) => (
              <div key={log.id} className={`log-item ${log.accion}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                  <div
                    className={`badge-log ${
                      log.accion === "recolectado" ? "success" : "error"
                    }`}
                  >
                    {log.accion === "recolectado" ? (
                      <FaShoppingBasket />
                    ) : (
                      <FaExclamationTriangle />
                    )}
                  </div>
                  <div className="log-meta">
                    <span className="log-product">{log.nombre_producto}</span>
                    <span style={{ fontSize: "0.75rem" }}>
                      Pedido #{log.id_pedido} •{" "}
                      {log.wc_asignaciones_pedidos?.nombre_recolectora ||
                        "Recolectora"}
                      {log.motivo && (
                        <span style={{ color: "#e74c3c" }}>
                          {" "}
                          • Motivo: {log.motivo}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#a0aec0" }}>
                  <FaClock
                    style={{ marginRight: 4, verticalAlign: "middle" }}
                  />
                  {new Date(log.fecha_registro).toLocaleString()}
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div
                style={{ textAlign: "center", padding: 20, color: "#a0aec0" }}
              >
                No hay registros de actividad reciente
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliticaRecolectoras;
