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
  FaRoute,
  FaMapMarkedAlt,
} from "react-icons/fa";
import "./AnaliticaPickers.css";

const AnaliticaPickers = () => {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | logs
  const [performanceData, setPerformanceData] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [hourlyData, setHourlyData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPickerRoute, setSelectedPickerRoute] = useState(null); // [NEW]
  const [routeData, setRouteData] = useState(null); // [NEW]
  const [loadingRoute, setLoadingRoute] = useState(false); // [NEW]

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

      // Nueva Respuesta de Performance: { pickers, hourlyActivity, globalStats }
      if (perfRes.data.pickers) {
          setPerformanceData(perfRes.data.pickers);
          setHourlyData(perfRes.data.hourlyActivity || []);
          setGlobalStats(perfRes.data.globalStats || null);
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

  // [NEW] Fetch Route Data
  const fetchPickerRoute = async (pickerId) => {
    setLoadingRoute(true);
    try {
      const BASE_URL = "https://backend-woocommerce.vercel.app/api";
      const res = await axios.get(`${BASE_URL}/analytics/route?id_picker=${pickerId}`);
      setRouteData(res.data);
      setSelectedPickerRoute(pickerId);
    } catch (error) {
      console.error("Error fetching route:", error);
      alert("No se pudo cargar la ruta del picker");
    }
    setLoadingRoute(false);
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
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 20, marginBottom: 10 }}>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>Pedidos Totales</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#2c3e50' }}>{globalStats.total_pedidos}</div>
                    </div>
                    <FaShoppingBasket size={32} color="#3498db" opacity={0.2} />
                </div>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>Eficiencia Global (SPI)</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#2d3748' }}>{globalStats.spi_promedio}s</div>
                    </div>
                    <FaClock size={32} color="#f1c40f" opacity={0.3} />
                </div>
                <div className="card-analitica" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#7f8c8d' }}>Tasa de Éxito Global</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: globalStats.tasa_exito_global > 95 ? '#27ae60' : '#e67e22' }}>
                            {globalStats.tasa_exito_global}%
                        </div>
                    </div>
                    <FaChartLine size={32} color="#27ae60" opacity={0.2} />
                </div>
            </div>
          )}

          {/* SECCIÓN 2: GRÁFICAS */}
          <div className="card-analitica" style={{ gridColumn: "span 1" }}>
              <div className="card-title">
                  <span>📊 Ritmo de Trabajo (Pedidos/Hora)</span>
              </div>
              <div style={{ height: 180, display: 'flex', alignItems: 'flex-end', gap: 4, paddingTop: 20 }}>
                  {hourlyData.map((d, i) => {
                      const max = Math.max(...hourlyData.map(h => h.pedidos), 1);
                      const height = (d.pedidos / max) * 100;
                      return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                              <div style={{ 
                                  width: '100%', 
                                  height: `${height}%`, 
                                  background: height > 0 ? '#3498db' : 'transparent',
                                  borderRadius: '4px 4px 0 0',
                                  minHeight: height > 0 ? 4 : 0,
                                  transition: 'height 0.3s ease'
                              }}></div>
                              {i % 3 === 0 && <span style={{ fontSize: '0.6rem', color: '#95a5a6' }}>{d.hour}</span>}
                          </div>
                      )
                  })}
              </div>
          </div>

          <div className="card-analitica" style={{ gridColumn: "span 1" }}>
              <div className="card-title">
                  <span>🚀 Comparativa Velocidad (SPI - Menor es Mejor)</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 }}>
                  {performanceData.slice(0, 5).map(p => (
                      <div key={p.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                              <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{p.segundos_por_item} seg/item</span>
                          </div>
                          <div style={{ width: '100%', background: '#eee', height: 8, borderRadius: 4 }}>
                               {/* Barra Invertida visualmente: Mas corto es mejor, pero queremos llenar la barra si es rapido. 
                                  Digamos que 120s es "lento" (0%) y 30s es "rapido" (100%). */}
                              <div style={{ 
                                  width: `${Math.min(100, Math.max(10, (150 - p.segundos_por_item) / 1.5))}%`, 
                                  background: p.segundos_por_item < 60 ? '#2ecc71' : p.segundos_por_item < 100 ? '#f1c40f' : '#e74c3c',
                                  height: '100%',
                                  borderRadius: 4,
                                  transition: 'width 0.5s ease'
                              }}></div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>

          {/* CARD 3: TABLA DETALLADA (Original mejorada) */}
          <div className="card-analitica" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title">
              <span>🏆 Rendimiento Detallado por Picker</span>
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
                  <th>Ruta</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="rank-number">{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                      <div style={{ fontSize: "0.75rem", color: "#7f8c8d" }}>
                        {p.total_pedidos} pedidos • {p.motivo_comun_fallo !== 'N/A' ? `Falla freq: ${p.motivo_comun_fallo}` : 'Sin fallos'}
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
                    <td>
                      <button
                        onClick={() => fetchPickerRoute(p.id)}
                        style={{
                          padding: "6px 12px",
                          background: "#3498db",
                          color: "white",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <FaRoute size={12} /> Ver Ruta
                      </button>
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

      {/* MODAL DE RUTA (Nuevo) */}
      {selectedPickerRoute && routeData && (
        <div className="ap-modal-backdrop" onClick={() => { setSelectedPickerRoute(null); setRouteData(null); }}>
          <div className="ap-modal-container" onClick={e => e.stopPropagation()} style={{maxWidth: '900px'}}>
            <div className="ap-modal-header">
              <h2><FaMapMarkedAlt /> Mapa de Ruta del Picker</h2>
              <button className="ap-modal-close-btn" onClick={() => { setSelectedPickerRoute(null); setRouteData(null); }}>×</button>
            </div>
            <div className="ap-modal-body">
              
              {/* Métricas Resumen */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 15, marginBottom: 20}}>
                <div style={{background: '#f8f9fa', padding: 15, borderRadius: 8, textAlign: 'center'}}>
                  <div style={{fontSize: '0.8rem', color: '#6c757d'}}>Pasillos Visitados</div>
                  <div style={{fontSize: '1.8rem', fontWeight: 'bold', color: '#495057'}}>{routeData.metrics.total_pasillos_visitados}</div>
                </div>
                <div style={{background: '#f8f9fa', padding: 15, borderRadius: 8, textAlign: 'center'}}>
                  <div style={{fontSize: '0.8rem', color: '#6c757d'}}>Tiempo Total</div>
                  <div style={{fontSize: '1.8rem', fontWeight: 'bold', color: '#495057'}}>{Math.floor(routeData.metrics.total_time / 60)}:{String(routeData.metrics.total_time % 60).padStart(2, '0')}</div>
                </div>
                <div style={{background: '#f8f9fa', padding: 15, borderRadius: 8, textAlign: 'center'}}>
                  <div style={{fontSize: '0.8rem', color: '#6c757d'}}>Items Procesados</div>
                  <div style={{fontSize: '1.8rem', fontWeight: 'bold', color: '#495057'}}>{routeData.metrics.total_items}</div>
                </div>
              </div>

              {/* Alertas de Regresiones */}
              {routeData.regressions.length > 0 && (
                <div style={{background: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 20, border: '1px solid #ffc107'}}>
                  <h3 style={{fontSize: '0.9rem', color: '#856404', margin: '0 0 8px 0'}}>⚠️ Rutas Ineficientes Detectadas</h3>
                  {routeData.regressions.map((r, i) => (
                    <div key={i} style={{fontSize: '0.8rem', color: '#856404'}}>
                      • <b>{r.pasillo}</b>: {r.message} (Orden: {r.visits.join(' → ')})
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline Visual (Gantt Style) */}
              <div className="ap-modal-section">
                <h3>🗺️ Secuencia de Recorrido</h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                  {routeData.route.map((seg, i) => {
                    const maxDuration = Math.max(...routeData.route.map(s => s.duration_seconds), 1);
                    const widthPercent = (seg.duration_seconds / maxDuration) * 100;
                    const isRegression = i > 0 && routeData.route.slice(0, i).some(prev => prev.pasillo === seg.pasillo);
                    
                    return (
                      <div key={i} style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <div style={{width: '80px', fontSize: '0.75rem', fontWeight: '600', color: '#495057', flexShrink: 0}}>
                          {seg.pasillo}
                        </div>
                        <div style={{flex: 1, position: 'relative'}}>
                          <div style={{
                            width: `${Math.max(widthPercent, 10)}%`,
                            height: '24px',
                            background: isRegression ? '#e74c3c' : '#3498db',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '8px',
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            transition: 'width 0.3s ease'
                          }}>
                            {seg.items} items • {Math.floor(seg.duration_seconds / 60)}:{String(seg.duration_seconds % 60).padStart(2, '0')}
                          </div>
                        </div>
                        <div style={{width: '50px', fontSize: '0.7rem', color: '#6c757d', textAlign: 'right'}}>
                          {new Date(seg.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabla de Resumen por Pasillo */}
              <div className="ap-modal-section">
                <h3>📊 Análisis por Pasillo</h3>
                <table style={{width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{background: '#f8f9fa', textAlign: 'left'}}>
                      <th style={{padding: '8px'}}>Pasillo</th>
                      <th style={{padding: '8px'}}>Tiempo Total</th>
                      <th style={{padding: '8px'}}>Items</th>
                      <th style={{padding: '8px'}}>Tiempo/Item</th>
                      <th style={{padding: '8px'}}>Visitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeData.summary.map((s, i) => (
                      <tr key={i} style={{borderBottom: '1px solid #dee2e6'}}>
                        <td style={{padding: '8px', fontWeight: '600'}}>{s.pasillo}</td>
                        <td style={{padding: '8px'}}>{s.total_time_formatted}</td>
                        <td style={{padding: '8px'}}>{s.total_items}</td>
                        <td style={{padding: '8px', color: s.avg_time_per_item > 60 ? '#e74c3c' : '#2ecc71'}}>
                          {s.avg_time_per_item}s
                        </td>
                        <td style={{padding: '8px'}}>
                          {s.visits > 1 ? (
                            <span style={{background: '#ffc107', color: '#856404', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem'}}>
                              {s.visits}x
                            </span>
                          ) : s.visits}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      )}

      {loadingRoute && (
        <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '20px', borderRadius: '8px', zIndex: 10000}}>
          Cargando ruta...
        </div>
      )}
    </div>
  );
};

export default AnaliticaPickers;