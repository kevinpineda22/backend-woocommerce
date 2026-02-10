import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Html5QrcodeScanner } from "html5-qrcode";
import { 
  FaClipboardCheck, 
  FaBox, 
  FaSearch, 
  FaCheck, 
  FaTimes, 
  FaCamera, 
  FaBarcode, 
  FaExclamationTriangle 
} from "react-icons/fa";
import "./VistaAuditor.css";

const VistaAuditor = () => {
  const [sessionId, setSessionId] = useState("");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const scannerRef = useRef(null);

  // --- LÓGICA DEL ESCÁNER ---
  useEffect(() => {
    let scanner = null;

    if (showScanner) {
      // Configuración del escáner
      scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        /* verbose= */ false
      );

      scanner.render(
        (decodedText) => {
          // Éxito al escanear
          handleScanSuccess(decodedText);
          scanner.clear();
          setShowScanner(false);
        },
        (errorMessage) => {
          // Error de lectura (ignoramos el ruido)
        }
      );
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(error => console.error("Failed to clear scanner", error));
      }
    };
  }, [showScanner]);

  const handleScanSuccess = (decodedText) => {
    if (navigator.vibrate) navigator.vibrate(200);
    setSessionId(decodedText);
    fetchAuditData(decodedText);
  };

  // --- LÓGICA DE DATOS ---
  const fetchAuditData = async (id) => {
    if (!id) return;
    setLoading(true);
    setErrorMsg("");
    setAuditData(null);

    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${id}`
      );
      
      const logs = res.data;
      if (!logs || logs.length === 0) {
          setErrorMsg("Sesión no encontrada o sin items recolectados.");
          setLoading(false);
          return;
      }

      // PROCESAMIENTO DE LOGS: Convertir historial en lista física
      const itemsMap = {};
      let totalItems = 0;
      let substitutedCount = 0;
      
      logs.forEach(log => {
          // Solo nos interesa lo que FÍSICAMENTE está en la canasta
          if (log.accion === 'recolectado' || log.accion === 'sustituido') {
              // Usamos el ID del producto final (si hubo sustitución) o el original
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
              totalItems += 1;
              if (log.es_sustituto) substitutedCount += 1;
          }
      });

      setAuditData({ 
          sessionId: id, 
          items: Object.values(itemsMap),
          totalItems,
          substitutedCount,
          pickerName: logs[0]?.wc_asignaciones_pedidos?.nombre_picker || "Desconocido"
      });
      
    } catch (error) {
      console.error(error);
      setErrorMsg("Error consultando la sesión. Verifica el ID.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    if (e.key === "Enter") {
      fetchAuditData(sessionId);
    }
  };

  const clearAudit = () => {
      setAuditData(null);
      setSessionId("");
      setErrorMsg("");
      // Enfocar input manual por si acaso
      document.getElementById("manual-input")?.focus();
  };

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <h1><FaClipboardCheck /> Estación de Auditoría</h1>
      </header>

      <div className="auditor-body">
        
        {/* BARRA DE BÚSQUEDA Y ESCÁNER */}
        {!auditData && (
            <div className="auditor-controls">
                {showScanner ? (
                    <div className="scanner-container-wrapper">
                        <div id="reader"></div>
                        <button className="close-scanner-btn" onClick={() => setShowScanner(false)}>
                            <FaTimes /> Cerrar Cámara
                        </button>
                    </div>
                ) : (
                    <div className="scan-bar-container">
                        <button 
                            className="auditor-scan-btn" 
                            onClick={() => setShowScanner(true)}
                            title="Abrir Cámara"
                        >
                            <FaCamera />
                        </button>
                        <input
                            id="manual-input"
                            className="auditor-input"
                            placeholder="Escanea el QR o escribe el ID..."
                            value={sessionId}
                            onChange={(e) => setSessionId(e.target.value)}
                            onKeyDown={handleManualSubmit}
                            autoFocus
                        />
                        <button className="auditor-search-btn" onClick={() => fetchAuditData(sessionId)}>
                            <FaSearch />
                        </button>
                    </div>
                )}
                
                {errorMsg && <div className="auditor-error">{errorMsg}</div>}
                {loading && <div className="auditor-loading">Cargando datos de la nube...</div>}
            </div>
        )}

        {/* RESULTADOS DE AUDITORÍA */}
        {auditData && (
            <div className="audit-results animate-fade-in">
                
                {/* HEADER DE RESULTADOS */}
                <div className="audit-meta-card">
                    <div className="am-row">
                        <span className="am-label">SESIÓN:</span>
                        <span className="am-value code">#{auditData.sessionId.slice(0,8)}</span>
                    </div>
                    <div className="am-row">
                        <span className="am-label">PICKER:</span>
                        <span className="am-value">{auditData.pickerName}</span>
                    </div>
                    <div className="am-stats-row">
                        <div className="am-stat">
                            <span className="am-stat-num">{auditData.totalItems}</span>
                            <span className="am-stat-desc">Items Totales</span>
                        </div>
                        <div className="am-stat warning">
                            <span className="am-stat-num">{auditData.substitutedCount}</span>
                            <span className="am-stat-desc">Sustituciones</span>
                        </div>
                    </div>
                </div>

                {/* LISTA DE ITEMS AGRUPADOS */}
                <div className="audit-items-grid">
                    {auditData.items.map((item, idx) => (
                        <div key={idx} className={`audit-item-card ${item.is_sub ? 'is-sub' : ''}`}>
                            <div className="audit-qty-box">
                                x{item.count}
                            </div>
                            <div className="audit-info">
                                <div className="audit-prod-name">
                                    {item.name}
                                </div>
                                {item.is_sub && (
                                    <div className="audit-sub-alert">
                                        <FaExclamationTriangle /> Reemplazó a: {item.original_name}
                                    </div>
                                )}
                                <div className="audit-sku">ID: {item.id}</div>
                            </div>
                            <div className="audit-check">
                                <input type="checkbox" className="audit-checkbox" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* ACCIONES FINALES */}
                <div className="audit-actions-footer">
                    <button className="audit-btn reject" onClick={clearAudit}>
                        <FaTimes /> Rechazar / Nueva
                    </button>
                    <button 
                        className="audit-btn approve" 
                        onClick={() => {
                            alert("✅ Salida Autorizada. El picker puede continuar.");
                            clearAudit();
                        }}
                    >
                        <FaCheck /> APROBAR SALIDA
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default VistaAuditor;