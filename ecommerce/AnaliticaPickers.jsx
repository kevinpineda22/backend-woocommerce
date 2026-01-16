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
  FaArrowUp,
  FaArrowDown,
  FaStopwatch,
  FaTimesCircle
} from "react-icons/fa";
import "./AnaliticaPickers.css";

const AnaliticaPickers = () => {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | logs
  const [performanceData, setPerformanceData] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [histogramData, setHistogramData] = useState(null); // New
  const [hourlyData, setHourlyData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPicker, setSelectedPicker] = useState(null); // New

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

      // Nueva Respuesta de Performance: { pickers, histogram, globalStats }
      if (perfRes.data.pickers) {
          setPerformanceData(perfRes.data.pickers);
          setHistogramData(perfRes.data.histogram);
          setHourlyData(perfRes.data.hourlyActivity || []);
          
          // Calcular Globals en Frontend
          const pickers = perfRes.data.pickers;
          // Validación: si el backend no devolvió stats (versión vieja cacheada), evitar crash
          const avgPPH = Math.round(pickers.reduce((acc, p) => acc + (p.stats?.pph || 0), 0) / (pickers.length || 1));
          const avgPerfect = Math.round(pickers.reduce((acc, p) => acc + (p.stats?.perfect_order_rate || 0), 0) / (pickers.length || 1));
          const totalIdle = pickers.reduce((acc, p) => acc + (p.stats?.idle_minutes || 0), 0);

          setGlobalStats({
              avg_pph: avgPPH,
              tasa_exito_global: avgPerfect,
              total_idle: totalIdle,
              // Compatibilidad para visualización
              spi_promedio: pickers.reduce((acc, p) => acc + (p.stats?.spi || 0), 0) / (pickers.length || 1)
          });
      } else {
          // Fallback por si la API no se ha desplegado aun
          setPerformanceData(Array.isArray(perfRes.data) ? perfRes.data : []);
      }

      // Respuesta Heatmap limpia
      if (heatRes.data.products) {
          setHeatmapData(heatRes.data.products);
      } else {
          setHeatmapData([]);
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

  // Compute Sparkline-ish Trend Arrow
  const renderTrend = (val) => {
      if(val === undefined || val === null) return <span style={{color: '#95a5a6'}}>-</span>;
      const color = val > 0 ? '#27ae60' : val < 0 ? '#c0392b' : '#7f8c8d';
      const Icon = val > 0 ? FaArrowUp : val < 0 ? FaArrowDown : FaChartLine;
      return (
          <div style={{display: 'flex', alignItems: 'center', gap: 4, color: color, fontSize: '0.75rem', fontWeight: 600}}>
              <Icon size={10} />
              {Math.abs(val)}%
          </div>
      )
  };

  // Badge Logic
  const getBadgeColor = (val) => {
      if (val < 95) return 'alert-badge-red';
      return 'alert-badge-green';
  };

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
          {/* SECCIÓN 1: KPIS GLOBALES */}
          {globalStats && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 15, marginBottom: 10 }}>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d', textTransform: 'uppercase' }}>Promedio PPH</div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2c3e50' }}>{globalStats.avg_pph || 0} <span style={{fontSize: '1rem', color:'#bdc3c7'}}>picks/h</span></div>
                    </div>
                    <FaStopwatch size={28} color="#3498db" opacity={0.3} />
                </div>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d', textTransform: 'uppercase' }}>Tasa Pedido Perfecto</div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: globalStats.tasa_exito_global > 90 ? '#27ae60' : '#e67e22' }}>
                            {globalStats.tasa_exito_global}%
                        </div>
                    </div>
                    <FaTrophy size={28} color="#f1c40f" opacity={0.3} />
                </div>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d', textTransform: 'uppercase' }}>Tiempo Ocioso Hoy</div>
                        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e74c3c' }}>{globalStats.total_idle} <span style={{fontSize: '1rem'}}>min</span></div>
                    </div>
                    <FaExclamationTriangle size={28} color="#e74c3c" opacity={0.3} />
                </div>
            </div>
          )}

          {/* SECCIÓN 2: GRÁFICAS */}
          {/* HISTOGRAMA DE TIEMPOS */}
          <div className="card-analitica" style={{ gridColumn: "span 1" }}>
              <div className="card-title"><span>⏱️ Distribución de Tiempos de Pick</span></div>
              {histogramData && histogramData.buckets ? (
                  <div style={{height: 180, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 20}}>
                      {Object.keys(histogramData.buckets).map((key) => {
                          const val = histogramData.buckets[key];
                          const max = Math.max(...Object.values(histogramData.buckets)) || 1;
                          const h = (val / max) * 100;
                          return (
                              <div key={key} style={{display:'flex', flexDirection:'column', alignItems:'center', width: '18%'}}>
                                  <div style={{fontSize:'0.7rem', fontWeight: 'bold', marginBottom: 4}}>{val}</div>
                                  <div style={{
                                      width: '100%', 
                                      height: `${h}%`, 
                                      background: key.includes('120') ? '#e74c3c' : '#3498db',
                                      minHeight: 4,
                                      borderRadius: '4px 4px 0 0'
                                  }}></div>
                                  <div style={{fontSize:'0.6rem', marginTop: 4, color: '#7f8c8d'}}>{key}</div>
                              </div>
                          )
                      })}
                  </div>
              ) : (
                  <div style={{padding:20, color:'#bdc3c7'}}>Sin datos suficientes</div>
              )}
              {histogramData && (
                <div style={{marginTop: 15, fontSize: '0.75rem', color: '#7f8c8d', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: 8}}>
                    <span>P50: <b>{histogramData.percentiles.p50}s</b></span>
                    <span>P75: <b>{histogramData.percentiles.p75}s</b></span>
                    <span>P90: <b>{histogramData.percentiles.p90}s</b></span>
                </div>
              )}
          </div>

          <div className="card-analitica" style={{ gridColumn: "span 1" }}>
              <div className="card-title">
                  <span>🚀 Velocidad (Tiempo por ítem)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 }}>
                  {performanceData.slice(0, 5).map(p => {
                      const spi = p.stats?.spi || 0;
                      return (
                      <div key={p.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                              <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                                  {spi > 60 ? `${(spi/60).toFixed(1)}m` : `${spi}s`} / item
                              </span>
                          </div>
                          <div style={{ width: '100%', background: '#eee', height: 8, borderRadius: 4 }}>
                               {/* Barra Invertida visualmente: Mas corto es mejor. 
                                  Digamos que 120s es "lento" (0% width) y 30s es "rapido" (100% width). */}
                              <div style={{ 
                                  width: `${Math.min(100, Math.max(10, (150 - spi) / 1.5))}%`, 
                                  background: spi < 60 ? '#2ecc71' : spi < 100 ? '#f1c40f' : '#e74c3c',
                                  height: '100%',
                                  borderRadius: 4,
                                  transition: 'width 0.5s ease'
                              }}></div>
                          </div>
                      </div>
                  )})}
              </div>
          </div>

          {/* LISTADO PICKERS CON DRILLDOWN */}
          <div className="card-analitica" style={{ gridColumn: '1 / -1' }}>
             <div className="card-title"><span>👥 Productividad Individual (Haz click para detalle)</span></div>
             <div className="table-wrapper" style={{overflowX: 'auto'}}>
                 <table className="rank-table">
                     <thead>
                         <tr>
                             <th>Picker</th>
                             <th>PPH</th>
                             <th>SPI (Velocidad)</th>
                             <th>Idle (Hoy)</th>
                             <th>Exactitud</th>
                             <th>Tendencia</th>
                         </tr>
                     </thead>
                     <tbody>
                        {performanceData.map(p => (
                            <tr 
                                key={p.id} 
                                onClick={() => setSelectedPicker(p)} 
                                style={{cursor: 'pointer', background: selectedPicker?.id === p.id ? '#f0f9ff' : 'transparent'}}
                                className="picker-row-interactive"
                            >
                                <td>
                                    <div style={{fontWeight: 600}}>{p.nombre}</div>
                                    <div style={{fontSize: '0.65rem', color: '#95a5a6'}}>ID: {p.id.split('-')[0]}</div>
                                </td>
                                <td>
                                    <div style={{fontWeight: 'bold', fontSize: '1.1rem'}}>{p.stats?.pph || 0}</div>
                                </td>
                                <td>
                                    {p.stats?.spi || 0}s
                                </td>
                                <td>
                                    <span style={{
                                        padding: '2px 6px', 
                                        borderRadius: 4, 
                                        background: (p.stats?.idle_minutes || 0) > 15 ? '#ffeaa7' : 'transparent',
                                        color: (p.stats?.idle_minutes || 0) > 15 ? '#d35400' : 'inherit',
                                        fontWeight: (p.stats?.idle_minutes || 0) > 15 ? 'bold' : 'normal'
                                    }}>
                                        {p.stats?.idle_minutes || 0} min
                                    </span>
                                </td>
                                <td>
                                    {/* Usamos clase directa aqui porque el helper devuelve string de clase */}
                                    <span style={{
                                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                                        background: (p.stats?.accuracy || 100) < 95 ? '#ffebee' : '#e8f5e9',
                                        color: (p.stats?.accuracy || 100) < 95 ? '#e74c3c' : '#2ecc71'
                                    }}>
                                        {p.stats?.accuracy || 100}%
                                    </span>
                                </td>
                                <td>
                                    {renderTrend(p.stats?.trend_pph)}
                                </td>
                            </tr>
                        ))}
                     </tbody>
                 </table>
             </div>
          </div>

          {/* CARD 4: PRODUCTOS MÁS RETIRADOS (OJO DE HALCÓN) - MODIFICADO para ocupar fila completa */}
          <div className="card-analitica" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">
              <span>⚠️ Productos Problemáticos (No Encontrados / Agotados)</span>
              <FaExclamationTriangle color="#e74c3c" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 15 }}>
              {heatmapData
                .filter((p) => p.total_removed > 0)
                .slice(0, 8)
                .map((p, idx) => (
                  <div
                    key={idx}
                    style={{ border: "1px solid #eee", padding: 12, borderRadius: 8, background: '#fff' }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.9rem",
                        marginBottom: 4,
                      }}
                    >
                      <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }} title={p.name}>{p.name}</strong>
                      <span style={{ color: "#e74c3c", fontWeight: "bold" }}>
                        {p.total_removed} Rep.
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#7f8c8d", marginTop: 4 }}>
                      Motivo: {Object.entries(p.motivos).sort((a, b) => b[1] - a[1])[0]?.[0]}
                    </div>
                  </div>
                ))}
            </div>
             {heatmapData.length === 0 && (
                <div style={{padding: 20, textAlign: 'center', color: '#aaa'}}>Todo perfecto en inventario</div>
              )}
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
      {/* MODAL / DRILLDOWN */}
      {selectedPicker && (
          <div className="ap-modal-backdrop" onClick={() => setSelectedPicker(null)}>
              <div className="ap-modal-container" onClick={e => e.stopPropagation()}>
                  <div className="ap-modal-header">
                      <h2>📋 Detalle: {selectedPicker.nombre}</h2>
                      <button className="ap-modal-close-btn" onClick={() => setSelectedPicker(null)}>×</button>
                  </div>
                  <div className="ap-modal-body">
                      <div className="ap-modal-section">
                          <h3>⏳ Tiempos Muertos (&gt;5 min)</h3>
                          {selectedPicker.drilldown?.gaps?.length > 0 ? (
                              <div className="ap-tags-container">
                                  {selectedPicker.drilldown.gaps.map((g, i) => (
                                      <span key={i} className="ap-gap-tag">
                                          {g.start} - {g.end} ({g.duration})
                                      </span>
                                  ))}
                              </div>
                          ) : <p className="ap-success-text">Sin tiempos muertos significativos hoy.</p>}
                      </div>

                      <div className="ap-modal-section">
                          <h3>⚠️ Errores Reportados</h3>
                          {selectedPicker.drilldown?.errors && Object.keys(selectedPicker.drilldown.errors).length > 0 ? (
                              <ul className="ap-error-list">
                                  {Object.entries(selectedPicker.drilldown.errors).map(([k, v]) => (
                                      <li key={k}><b>{k}:</b> {v} veces</li>
                                  ))}
                              </ul>
                          ) : <p className="ap-success-text">100% Precisión hoy.</p>}
                      </div>

                      <div className="ap-modal-section">
                          <h3>📜 Últimos 20 Logs</h3>
                          <div className="ap-logs-table">
                              {selectedPicker.drilldown?.recent_logs?.map((L, i) => (
                                  <div key={i} className="ap-log-row">
                                      <span className="ap-log-time">{L.hora}</span>
                                      <span className={`ap-log-badge ap-log-${L.accion}`}>{L.accion}</span>
                                      {L.motivo && <span className="ap-log-reason">{L.motivo}</span>}
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Styles moved to AnaliticaPickers.css */}
    </div>
  );
};

export default AnaliticaPickers;
