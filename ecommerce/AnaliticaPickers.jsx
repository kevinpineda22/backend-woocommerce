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
  FaTimes
} from "react-icons/fa";
import "./AnaliticaPickers.css";
import WarehouseMap from "./WarehouseMap"; 

const RouteSelectionView = ({ fetchPickerRoute }) => {
  const [routesHistory, setRoutesHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const BASE_URL = "https://backend-woocommerce.vercel.app/api";
        const { data } = await axios.get(`${BASE_URL}/analytics/routes-history`);
        setRoutesHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) return <div className="card-analitica"><p>Cargando historial de rutas...</p></div>;

  return (
    <div className="card-analitica">
      <div className="card-title">
        <span>🗺️ Historial de Rutas Completadas</span>
        <FaMapMarkedAlt color="#3498db" />
      </div>
      <p style={{fontSize: '0.9rem', color: '#666', marginBottom: 20}}>
        Selecciona un pedido completado para ver la visualización de la ruta realizada.
      </p>
      
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 15}}>
        {routesHistory.map((route) => (
          <div 
            key={route.id} 
            className="route-card-item"
            onClick={() => fetchPickerRoute(route.id_picker, route.id_pedido)}
            style={{
                border: '1px solid #e2e8f0', 
                borderRadius: 8, 
                padding: 15, 
                cursor: 'pointer',
                background: 'white',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 5}}>
                <span style={{fontWeight: 'bold', color: '#2d3748'}}>Pedido #{route.id_pedido}</span>
                <span style={{fontSize: '0.8rem', color: '#718096'}}>{new Date(route.fecha_fin).toLocaleDateString()}</span>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
                <div style={{width: 24, height: 24, borderRadius: '50%', background: '#edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem'}}>👷</div>
                <span style={{fontSize: '0.9rem', fontWeight: 500}}>{route.nombre_picker || 'Picker'}</span>
            </div>
            <div style={{fontSize: '0.8rem', color: '#718096', display: 'flex', gap: 15}}>
                <span>⏱️ {Math.floor(route.tiempo_total_segundos / 60)}m {route.tiempo_total_segundos % 60}s</span>
                <span style={{color: '#3498db', fontWeight: 'bold'}}>Ver Recorrido →</span>
            </div>
          </div>
        ))}
      </div>
      
      {routesHistory.length === 0 && (
          <div style={{textAlign: 'center', padding: 40, color: '#a0aec0'}}>
              No hay rutas completadas registradas aún.
          </div>
      )}
    </div>
  );
};

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

  const fetchPickerRoute = async (pickerId, orderId = null) => {
    setLoadingRoute(true);
    try {
      const BASE_URL = "https://backend-woocommerce.vercel.app/api";
      const query = orderId 
          ? `?id_picker=${pickerId}&id_pedido=${orderId}`
          : `?id_picker=${pickerId}`;
      const res = await axios.get(`${BASE_URL}/analytics/route${query}`);
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
        </button>        <button
          className={`analitica-tab ${activeTab === "routes" ? "active" : ""}`}
          onClick={() => setActiveTab("routes")}
        >
          <FaMapMarkedAlt /> Analizar Rutas
        </button>      </div>

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
          <div className="card-analitica" style={{ gridColumn: "1 / -1", overflow: 'visible' }}>
            <div className="card-title">
              <span>📊 Ritmo de Trabajo (Pedidos/Hora) - Detalle de Pickers</span>
            </div>
            
            {hourlyData && hourlyData.length > 0 ? (
               <div style={{ height: 350, position: 'relative', paddingTop: 40, paddingLeft: 10, paddingBottom: 20 }}>
                 
                 {/* Líneas de Guía (Grid Y) */}
                 <div style={{ position: 'absolute', top: 40, bottom: 25, left: 30, right: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0 }}>
                    {[100, 75, 50, 25, 0].map((pct) => (
                       <div key={pct} style={{ borderBottom: '1px dashed #f0f0f0', width: '100%', height: 0, position: 'relative' }}>
                          <span style={{ position: 'absolute', left: -25, top: -7, fontSize: '0.75rem', color: '#bdc3c7' }}>
                             {Math.ceil(Math.max(...hourlyData.map(h=>h.pedidos), 5) * (pct/100))}
                          </span>
                       </div>
                    ))}
                 </div>

                 {/* Barras */}
                 <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', marginLeft: 30, paddingRight: 10, gap: 8, position: 'relative', zIndex: 2 }}>
                    {hourlyData.map((d, i) => {
                       const max = Math.max(...hourlyData.map(h => h.pedidos), 5); 
                       const height = (d.pedidos / max) * 100;
                       
                       return (
                         <div 
                            key={i} 
                            style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', cursor: 'pointer' }} 
                            className="bar-group"
                            onMouseEnter={(e) => {
                                // Simple DOM manipulation for tooltip visibility to avoid heavy React state re-renders on hover
                                const tooltip = document.getElementById(`tooltip-${i}`);
                                if(tooltip) tooltip.style.opacity = 1;
                                if(tooltip) tooltip.style.pointerEvents = 'auto';
                            }}
                            onMouseLeave={(e) => {
                                const tooltip = document.getElementById(`tooltip-${i}`);
                                if(tooltip) tooltip.style.opacity = 0;
                                if(tooltip) tooltip.style.pointerEvents = 'none';
                            }}
                         >
                            {/* Tooltip FLOTANTE con Lista de Pickers */}
                            {d.pedidos > 0 && d.pickers && (
                                <div 
                                    id={`tooltip-${i}`}
                                    style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        marginBottom: 10,
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'rgba(255, 255, 255, 0.98)',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 8,
                                        padding: 10,
                                        width: 'max-content',
                                        maxWidth: 200,
                                        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                                        opacity: 0,
                                        pointerEvents: 'none',
                                        transition: 'all 0.2s ease',
                                        zIndex: 100,
                                        color: '#2d3748',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: 5, marginBottom: 5 }}>
                                        {d.pedidos} Pedidos ({d.hour})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
                                        {d.pickers.map((picker, idx) => (
                                            <div key={idx} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                                                <span>👷</span> {picker}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ position: 'absolute', bottom: -6, left: '50%', marginLeft: -6, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid white' }}></div>
                                </div>
                            )}

                            {/* Valor flotante (Mini Badge) */}
                            {d.pedidos > 0 && (
                                <div style={{ marginBottom: 4, background: '#2c3e50', color: 'white', borderRadius: 10, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                   {d.pedidos}
                                </div>
                            )}

                            {/* Barra */}
                            <div style={{ 
                               width: '100%', 
                               height: `${Math.max(height, d.pedidos > 0 ? 5 : 0)}%`, 
                               background: d.pedidos > 0 ? 'linear-gradient(180deg, #3498db 0%, #2980b9 100%)' : 'rgba(236, 240, 241, 0.5)',
                               borderRadius: '6px 6px 0 0',
                               transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                               opacity: d.pedidos > 0 ? 1 : 0.3,
                               boxShadow: d.pedidos > 0 ? '0 4px 6px rgba(52, 152, 219, 0.3)' : 'none'
                            }}></div>

                            {/* Etiqueta X */}
                            {i % 2 === 0 && (
                               <span style={{ position: 'absolute', bottom: -20, fontSize: '0.75rem', fontWeight: 500, color: '#7f8c8d' }}>
                                 {d.hour.split(':')[0]}h
                               </span>
                            )}
                         </div>
                       )
                    })}
                 </div>
               </div>
            ) : (
                <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#bdc3c7' }}>
                   <FaChartLine size={30} style={{ marginBottom: 10, opacity: 0.5 }} />
                   <p>No hay datos de actividad reciente</p>
                </div>
            )}
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
                  <th>Distancia Est.</th>
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
                        {p.total_pedidos} pedidos • {p.motivo_comun_fallo !== 'N/A' ? `Falla freq: ${p.motivo_comun_fallo}` : 'Sin fallos'}
                      </div>
                    </td>
                    <td>
                        <div style={{ fontWeight: "bold", color: "#2d3748" }}>{p.segundos_por_item}s</div>
                        <div style={{ fontSize: "0.7rem", color: "#7f8c8d" }}>por item</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#e67e22', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FaRoute size={12} />
                        {Math.round(p.distancia_recorrida_px || 0)}m
                      </div>
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
      ) : activeTab === "logs" ? (
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
      ) : null}

      {activeTab === "routes" && (
        <RouteSelectionView fetchPickerRoute={fetchPickerRoute} />
      )}

      {/* MODAL DE RUTA (Nuevo) */}
      {selectedPickerRoute && routeData && (
        <div className="ap-modal-backdrop" onClick={() => { setSelectedPickerRoute(null); setRouteData(null); }}>
          <div className="ap-modal-container" onClick={e => e.stopPropagation()}>
            <div className="ap-modal-header">
              <h2><FaMapMarkedAlt /> Análisis de Ruta Detallado</h2>
              <button className="ap-modal-close-btn" onClick={() => { setSelectedPickerRoute(null); setRouteData(null); }}>×</button>
            </div>
            
            <div className="ap-modal-body">
              
              {/* 1. Kpis Superiores */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20}}>
                <div className="ap-metric-card">
                  <div style={{fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5}}>Pasillos Recorridos</div>
                  <div style={{fontSize: '2.5rem', fontWeight: '800', color: '#334155'}}>{routeData.metrics.total_pasillos_visitados}</div>
                </div>
                <div className="ap-metric-card">
                  <div style={{fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5}}>Tiempo Total Picking</div>
                  <div style={{fontSize: '2.5rem', fontWeight: '800', color: '#3b82f6'}}>
                    {Math.floor(routeData.metrics.total_time / 60)}<span style={{fontSize: '1.5rem'}}>m</span> {String(routeData.metrics.total_time % 60).padStart(2, '0')}<span style={{fontSize: '1.5rem'}}>s</span>
                  </div>
                </div>
                <div className="ap-metric-card">
                  <div style={{fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5}}>Items Procesados</div>
                  <div style={{fontSize: '2.5rem', fontWeight: '800', color: '#334155'}}>{routeData.metrics.total_items}</div>
                </div>
              </div>

              {/* 2. Alertas de Ineficiencia */}
              {routeData.regressions.length > 0 && (
                <div className="ap-card-internal" style={{borderLeft: '5px solid #f59e0b', background: '#fffbeb'}}>
                  <h3 style={{fontSize: '1.1rem', color: '#b45309', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: 10}}>
                    <FaExclamationTriangle /> Ineficiencias Detectadas
                  </h3>
                  <div style={{display: 'grid', gap: 10}}>
                    {routeData.regressions.map((r, i) => (
                      <div key={i} style={{fontSize: '0.95rem', color: '#92400e', background: 'white', padding: '10px 15px', borderRadius: 8, border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 10}}>
                         <span style={{background: '#fef3c7', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold'}}>Pasillo {r.pasillo}</span>
                         <span>{r.message}</span>
                         <span style={{marginLeft: 'auto', fontSize: '0.85rem', color: '#b45309'}}>Secuencia: {r.visits.join(' ➔ ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Mapa Interactivo Grande */}
              <div className="ap-card-internal" style={{padding: 0, overflow: 'hidden'}}>
                 <div style={{padding: '15px 24px', borderBottom: '1px solid #eee', background: '#f8fafc'}}>
                    <h3 style={{margin: 0, fontSize: '1rem', color: '#475569'}}>🗺️ Reproducción de Recorrido en Planta</h3>
                 </div>
                 <div style={{background: '#1e1e24'}}>
                    <WarehouseMap routeData={routeData.raw_logs || []} />
                 </div>
              </div>

              {/* 4. Timeline y Tabla en Grid */}
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
                  
                  {/* Timeline */}
                  <div className="ap-card-internal">
                    <h3 style={{marginBottom: 20, color: '#1e293b'}}>⏱️ Línea de Tiempo Secuencial</h3>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '400px', overflowY: 'auto', paddingRight: 10}}>
                      {routeData.route.map((seg, i) => {
                        const maxDuration = Math.max(...routeData.route.map(s => s.duration_seconds), 1);
                        const widthPercent = (seg.duration_seconds / maxDuration) * 100;
                        const isRegression = i > 0 && routeData.route.slice(0, i).some(prev => prev.pasillo === seg.pasillo);
                        
                        return (
                          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 12}}>
                            <div style={{
                                width: '60px', 
                                height: '60px', 
                                background: isRegression ? '#fee2e2' : '#eff6ff', 
                                color: isRegression ? '#dc2626' : '#2563eb',
                                borderRadius: 8, 
                                display: 'flex', 
                                flexDirection: 'column',
                                alignItems: 'center', 
                                justifyContent: 'center',
                                border: `1px solid ${isRegression ? '#fecaca' : '#bfdbfe'}`,
                                flexShrink: 0
                            }}>
                              <span style={{fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold'}}>Pasillo</span>
                              <span style={{fontSize: '1.2rem', fontWeight: '800'}}>{seg.pasillo}</span>
                            </div>

                            <div style={{flex: 1}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.85rem'}}>
                                    <span style={{color: '#64748b'}}>{new Date(seg.start_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
                                    <span style={{fontWeight: 'bold', color: '#334155'}}>{Math.floor(seg.duration_seconds / 60)}m {seg.duration_seconds % 60}s</span>
                                </div>
                                <div style={{width: '100%', background: '#f1f5f9', height: 10, borderRadius: 5, overflow: 'hidden'}}>
                                    <div style={{
                                        width: `${Math.max(widthPercent, 5)}%`,
                                        height: '100%',
                                        background: isRegression ? '#ef4444' : '#3b82f6',
                                        borderRadius: 5
                                    }}></div>
                                </div>
                                <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: 4}}>{seg.items} items recogidos</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tabla Resumen */}
                  <div className="ap-card-internal">
                    <h3 style={{marginBottom: 20, color: '#1e293b'}}>📊 Métricas por Pasillo</h3>
                    <div style={{overflowX: 'auto'}}>
                        <table style={{width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse'}}>
                        <thead>
                            <tr style={{background: '#f8fafc', textAlign: 'left', borderBottom: '2px solid #e2e8f0'}}>
                            <th style={{padding: '12px', color: '#64748b'}}>Pasillo</th>
                            <th style={{padding: '12px', color: '#64748b'}}>Tiempo</th>
                            <th style={{padding: '12px', color: '#64748b'}}>Items</th>
                            <th style={{padding: '12px', color: '#64748b'}}>T/Item</th>
                            </tr>
                        </thead>
                        <tbody>
                            {routeData.summary.map((s, i) => (
                            <tr key={i} style={{borderBottom: '1px solid #f1f5f9'}}>
                                <td style={{padding: '12px', fontWeight: '600', color: '#334155'}}>{s.pasillo} {s.visits > 1 && <span style={{fontSize:'0.7rem', background:'#fef3c7', color:'#b45309', padding:'2px 6px', borderRadius:4, marginLeft:5}}>x{s.visits}</span>}</td>
                                <td style={{padding: '12px', fontFamily: 'monospace'}}>{s.total_time_formatted}</td>
                                <td style={{padding: '12px'}}>{s.total_items}</td>
                                <td style={{padding: '12px'}}>
                                    <span style={{
                                        padding: '4px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: '0.8rem',
                                        background: s.avg_time_per_item > 60 ? '#fee2e2' : '#dcfce7',
                                        color: s.avg_time_per_item > 60 ? '#ef4444' : '#16a34a'
                                    }}>
                                        {s.avg_time_per_item}s
                                    </span>
                                </td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                  </div>

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