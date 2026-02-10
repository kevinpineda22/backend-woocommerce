import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Html5QrcodeScanner } from "html5-qrcode";
import { 
  FaClipboardCheck, 
  FaSearch, 
  FaCheck, 
  FaTimes, 
  FaCamera, 
  FaHistory,
  FaListOl,
  FaUserCircle,
  FaClock,
  FaExclamationTriangle
} from "react-icons/fa";
import "./VistaAuditor.css";

const VistaAuditor = () => {
  const [sessionId, setSessionId] = useState("");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("inventory"); // 'inventory' | 'timeline'
  
  const scannerRef = useRef(null);

  useEffect(() => {
    let scanner = null;
    if (showScanner) {
      scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }, false);
      scanner.render((decodedText) => {
          handleScanSuccess(decodedText);
          scanner.clear();
          setShowScanner(false);
        }, () => {});
    }
    return () => { if (scanner) scanner.clear().catch(console.error); };
  }, [showScanner]);

  const handleScanSuccess = (decodedText) => {
    if (navigator.vibrate) navigator.vibrate(200);
    setSessionId(decodedText);
    fetchAuditData(decodedText);
  };

  const fetchAuditData = async (id) => {
    if (!id) return;
    setLoading(true);
    setErrorMsg("");
    setAuditData(null);

    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${id}`
      );
      
      // ✅ AHORA RECIBIMOS METADATA Y LOGS SEPARADOS
      const { metadata, logs } = res.data;

      if (!logs || logs.length === 0) {
          setErrorMsg("Sesión vacía o sin movimientos.");
          setLoading(false);
          return;
      }

      // PROCESAMIENTO: Agrupar para inventario físico
      const itemsMap = {};
      let substitutedCount = 0;
      
      logs.forEach(log => {
          // Solo contamos items físicos (recolectados o sustitutos finales)
          if (log.accion === 'recolectado' || log.accion === 'sustituido') {
              const key = log.es_sustituto ? (log.id_producto_final || log.id_producto) : log.id_producto;
              
              if (!itemsMap[key]) {
                  itemsMap[key] = {
                      id: key,
                      name: log.es_sustituto ? log.nombre_sustituto : log.nombre_producto,
                      original_name: log.nombre_producto,
                      count: 0,
                      is_sub: log.es_sustituto,
                      price: log.precio_nuevo || 0
                  };
              }
              itemsMap[key].count += 1;
              if (log.es_sustituto) substitutedCount += 1;
          }
      });

      // Cálculo de duración
      let duration = "En curso";
      if(metadata.end_time && metadata.start_time) {
          const diff = new Date(metadata.end_time) - new Date(metadata.start_time);
          duration = Math.round(diff / 60000) + " min";
      }

      setAuditData({ 
          meta: metadata,
          items: Object.values(itemsMap),
          rawLogs: logs,
          stats: {
              totalPhysicalItems: logs.filter(l => l.accion === 'recolectado' || l.accion === 'sustituido').length,
              substitutedCount,
              duration
          }
      });
      
    } catch (error) {
      console.error(error);
      setErrorMsg("Error consultando la sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => { if (e.key === "Enter") fetchAuditData(sessionId); };
  const clearAudit = () => { setAuditData(null); setSessionId(""); setErrorMsg(""); };

  // Helper para formatear fecha
  const formatTime = (isoString) => isoString ? new Date(isoString).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : '--:--';

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <h1><FaClipboardCheck /> Auditoría 360°</h1>
      </header>

      <div className="auditor-body">
        
        {/* BUSCADOR */}
        {!auditData && (
            <div className="auditor-controls">
                {showScanner ? (
                    <div className="scanner-wrapper"><div id="reader"></div><button className="close-scanner-btn" onClick={() => setShowScanner(false)}><FaTimes /> Cerrar</button></div>
                ) : (
                    <div className="scan-bar-container">
                        <button className="auditor-scan-btn" onClick={() => setShowScanner(true)}><FaCamera /></button>
                        <input className="auditor-input" placeholder="ID Sesión o Escanear QR..." value={sessionId} onChange={(e) => setSessionId(e.target.value)} onKeyDown={handleManualSubmit} autoFocus />
                        <button className="auditor-search-btn" onClick={() => fetchAuditData(sessionId)}><FaSearch /></button>
                    </div>
                )}
                {errorMsg && <div className="auditor-error">{errorMsg}</div>}
                {loading && <div className="auditor-loading">Recuperando expediente...</div>}
            </div>
        )}

        {/* DASHBOARD DE AUDITORÍA */}
        {auditData && (
            <div className="audit-dashboard animate-fade-in">
                
                {/* 1. FICHA TÉCNICA */}
                <div className="audit-card meta-section">
                    <div className="meta-row">
                        <div className="meta-item">
                            <label>ID SESIÓN</label>
                            <span className="code-badge">#{auditData.meta.session_id.slice(0,8)}</span>
                        </div>
                        <div className="meta-item">
                            <label>RESPONSABLE</label>
                            <span className="picker-badge"><FaUserCircle/> {auditData.meta.picker_name}</span>
                        </div>
                    </div>
                    <div className="meta-row secondary">
                        <div className="meta-item">
                            <FaClock color="#64748b"/> 
                            {formatTime(auditData.meta.start_time)} - {formatTime(auditData.meta.end_time)}
                            <small>({auditData.stats.duration})</small>
                        </div>
                        <div className="meta-item">
                            <strong>{auditData.meta.total_orders}</strong> Pedidos
                        </div>
                    </div>
                </div>

                {/* 2. PESTAÑAS */}
                <div className="audit-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                        onClick={() => setActiveTab('inventory')}
                    >
                        <FaListOl /> Inventario Físico ({auditData.stats.totalPhysicalItems})
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                        onClick={() => setActiveTab('timeline')}
                    >
                        <FaHistory /> Trazabilidad Completa
                    </button>
                </div>

                {/* 3. CONTENIDO DINÁMICO */}
                <div className="audit-content-area">
                    
                    {/* VISTA A: INVENTARIO AGRUPADO */}
                    {activeTab === 'inventory' && (
                        <div className="inventory-grid">
                            {auditData.items.map((item, idx) => (
                                <div key={idx} className={`inv-item ${item.is_sub ? 'sub' : ''}`}>
                                    <div className="inv-qty">x{item.count}</div>
                                    <div className="inv-details">
                                        <div className="inv-name">{item.name}</div>
                                        {item.is_sub && (
                                            <div className="inv-sub-note">
                                                <FaExclamationTriangle /> Reemplazó a: {item.original_name}
                                            </div>
                                        )}
                                        <div className="inv-sku">Ref: {item.id}</div>
                                    </div>
                                    <input type="checkbox" className="audit-check-big" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* VISTA B: LÍNEA DE TIEMPO DETALLADA */}
                    {activeTab === 'timeline' && (
                        <div className="timeline-container">
                            {auditData.rawLogs.map((log, idx) => (
                                <div key={idx} className={`timeline-row ${log.accion}`}>
                                    <div className="tl-time">{formatTime(log.fecha_registro)}</div>
                                    <div className="tl-marker"></div>
                                    <div className="tl-content">
                                        <div className="tl-title">
                                            {log.accion === 'recolectado' && (log.es_sustituto ? "🔄 Sustitución" : "✅ Recolección")}
                                            {log.accion === 'eliminado_admin' && "🗑️ Eliminado por Admin"}
                                            {log.accion === 'restaurado_admin' && "♻️ Restaurado"}
                                            {log.accion === 'no_encontrado' && "❌ No Encontrado"}
                                        </div>
                                        <div className="tl-desc">
                                            {log.nombre_producto}
                                            {log.es_sustituto && <span> ➔ {log.nombre_sustituto}</span>}
                                        </div>
                                        {log.motivo && <div className="tl-reason">Motivo: {log.motivo}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                </div>

                {/* 4. FOOTER */}
                <div className="audit-footer-actions">
                    <button className="audit-act-btn reject" onClick={clearAudit}>
                        <FaTimes /> Rechazar
                    </button>
                    <button className="audit-act-btn approve" onClick={() => { alert("✅ Salida Autorizada"); clearAudit(); }}>
                        <FaCheck /> Confirmar Salida
                    </button>
                </div>

            </div>
        )}
      </div>
    </div>
  );
};

export default VistaAuditor;