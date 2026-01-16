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
import "./AnaliticaPickers.css";

const AnaliticaPickers = () => {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | logs
  const [performanceData, setPerformanceData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [aisleData, setAisleData] = useState([]);
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
      // Soporte para estructura nueva { products, aisles } o antigua [products]
      if (heatRes.data.products) {
          setHeatmapData(heatRes.data.products);
          setAisleData(heatRes.data.aisles || []);
      } else {
          setHeatmapData(heatRes.data);
          setAisleData([]);
      }
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
              Métricas de rendimiento y auditoría de picking en tiempo real
            </p>
          </div>
          <button className="pedidos-admin-refresh-btn" onClick={fetchData}>
            <FaSync className={loading ? "ec-spin" : ""} /> Actualizar Datos
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
          {/* CARD 1: RENDIMIENTO PICKERS */}
          <div className="card-analitica">
            <div className="card-title">
              <span>🏆 Rendimiento y Calidad de Picking</span>
              <FaTrophy color="#f1c40f" />
            </div>
            <table className="rank-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Eficiencia (SPI)</th>
                  <th>Precisión Global</th>
                  <th>Pedidos Perfectos</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="rank-number">{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                      <div style={{ fontSize: "0.75rem", color: "#7f8c8d" }}>
                        {p.total_pedidos} pedidos • {p.motivo_comun_fallo !== 'N/A' ? `Falla: ${p.motivo_comun_fallo}` : 'Sin fallos'}
                      </div>
                    </td>
                    <td>
                        <div style={{ fontWeight: "bold", color: "#2d3748" }}>{p.segundos_por_item}s</div>
                        <div style={{ fontSize: "0.7rem", color: "#7f8c8d" }}>por item</div>
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
                                p.tasa_precision >= 98 ? "#48bb78" : "#ed8936",
                              borderRadius: 2,
                            }}
                          ></div>
                        </div>
                        <span
                          style={{
                            fontSize: "0.85rem",
                            color:
                              p.tasa_precision >= 98 ? "#2f855a" : "#c05621",
                            fontWeight: 600,
                          }}
                        >
                          {p.tasa_precision}%
                        </span>
                      </div>
                    </td>
                    <td>
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                            <span style={{fontWeight: 'bold', color: p.tasa_pedido_perfecto > 90 ? '#2f855a' : '#2d3748'}}>
                                {p.tasa_pedido_perfecto}%
                            </span>
                            <span style={{ fontSize: "0.65rem", color: "#a0aec0" }}>
                                ({p.pedidos_perfectos}/{p.total_pedidos})
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
              <span>⚠️ Productos No Encontrados / Agotados</span>
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
                        {p.total_removed} Reportes
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

          {/* CARD 3: MAPA DE CALOR DE PASILLOS (VISUAL) */}
          <div className="card-analitica" style={{ gridColumn: "span 2" }}>
            <div className="card-title">
              <span>🗺️ Mapa de Calor del Almacén (Pasillos)</span>
              <div
                style={{
                  display: "flex",
                  gap: 15,
                  fontSize: "0.75rem",
                  fontWeight: "normal",
                  color: "#64748b",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background: "#e0f2fe",
                      borderRadius: 2,
                    }}
                  ></div>{" "}
                  Tráfico Bajo
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      background: "#0284c7",
                      borderRadius: 2,
                    }}
                  ></div>{" "}
                  Tráfico Intenso
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      border: "2px solid #ef4444",
                      background: "#fef2f2",
                      borderRadius: 2,
                    }}
                  ></div>{" "}
                  Alta Tasa de Reportes
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                gap: 12,
                marginTop: 10,
              }}
            >
              {aisleData.length > 0 ? (
                aisleData.map((aisle) => {
                  // Calcular intensidad del calor (0 a 1)
                  const maxInteractions = Math.max(
                    ...aisleData.map((a) => a.total_interacciones)
                  );
                  const intensity =
                    aisle.total_interacciones / (maxInteractions || 1);

                  // Estilos dinámicos
                  const hasIssues =
                    aisle.total_fallos > 0 &&
                    aisle.total_fallos / aisle.total_interacciones > 0.05; // >5% error

                  return (
                    <div
                      key={aisle.pasillo}
                      style={{
                        position: "relative",
                        background: hasIssues
                          ? "#fff5f5"
                          : `rgba(2, 132, 199, ${0.1 + intensity * 0.9})`,
                        color:
                          !hasIssues && intensity > 0.6 ? "white" : "#1e293b",
                        border: hasIssues
                          ? "2px solid #fc8181"
                          : "1px solid transparent",
                        padding: "12px 8px",
                        borderRadius: 8,
                        textAlign: "center",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }}
                    >
                      {hasIssues && (
                        <FaExclamationTriangle
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            color: "#c53030",
                            fontSize: "0.7rem",
                          }}
                        />
                      )}
                      
                      <div
                        style={{
                          fontSize: "0.7rem",
                          textTransform: "uppercase",
                          opacity: 0.8,
                          marginBottom: 2,
                        }}
                      >
                        Pasillo
                      </div>
                      <div
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 800,
                          lineHeight: 1,
                        }}
                      >
                        {aisle.pasillo === "Otros" ? "Gral" : aisle.pasillo}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: "0.7rem",
                          fontWeight: 600,
                        }}
                      >
                        {aisle.total_interacciones} movs
                      </div>
                      {aisle.total_fallos > 0 && (
                        <div
                          style={{
                            fontSize: "0.65rem",
                            color: hasIssues
                              ? "#c53030"
                              : !hasIssues && intensity > 0.6
                              ? "#e2e8f0"
                              : "#718096",
                          }}
                        >
                          ({aisle.total_fallos} reportes)
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    gridColumn: "1/-1",
                    padding: 20,
                    textAlign: "center",
                    color: "#94a3b8",
                  }}
                >
                  No se pudo generar el mapa de pasillos. Faltan datos de
                  recolección.
                </div>
              )}
            </div>
          </div>

          {/* CARD 4: TOP PRODUCTOS */}
          <div className="card-analitica" style={{ gridColumn: "span 2" }}>
            <div className="card-title">
              <span>🔥 Nube de Productos (Top Movimientos)</span>
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
                      {log.wc_asignaciones_pedidos?.nombre_picker ||
                        "Picker"}
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

export default AnaliticaPickers;
