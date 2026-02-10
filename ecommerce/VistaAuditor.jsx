import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { FaClipboardCheck, FaBox, FaSearch, FaCheck, FaTimes } from "react-icons/fa";
import "./VistaAuditor.css";

const VistaAuditor = () => {
  const [sessionId, setSessionId] = useState("");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Auto-focus para lectores de código de barras
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchAuditData = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      // Reutilizamos el endpoint de historial-detalle
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${id}`
      );
      
      const logs = res.data;
      if (!logs || logs.length === 0) {
          alert("Sesión no encontrada o sin items recolectados.");
          setLoading(false);
          return;
      }

      // Procesamos los logs para agrupar
      const itemsMap = {};
      
      logs.forEach(log => {
          // Solo contamos lo que se recolectó efectivamente (o sustituyó)
          if (log.accion === 'recolectado' || log.accion === 'sustituido') {
              const key = log.id_producto;
              if (!itemsMap[key]) {
                  itemsMap[key] = {
                      name: log.nombre_producto,
                      total: 0,
                      is_sub: log.es_sustituto,
                      sub_name: log.nombre_sustituto
                  };
              }
              itemsMap[key].total += 1;
          }
      });

      setAuditData({ sessionId: id, items: Object.values(itemsMap) });
      setSessionId(""); 
    } catch (error) {
      alert("Error consultando sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (e) => {
    if (e.key === "Enter") {
      fetchAuditData(sessionId);
    }
  };

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <h1><FaClipboardCheck /> Estación de Auditoría</h1>
      </header>

      <div className="auditor-body">
        {/* BARRA DE ESCANEO */}
        <div className="scan-bar-container">
            <input
                ref={inputRef}
                className="auditor-scan-input"
                placeholder="Escanea el QR del Picker aquí..."
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                onKeyDown={handleScan}
                autoFocus
            />
            <button className="auditor-search-btn" onClick={() => fetchAuditData(sessionId)}>
                <FaSearch />
            </button>
        </div>

        {loading && <div className="auditor-loading">Cargando datos de sesión...</div>}

        {/* RESULTADOS DE AUDITORÍA */}
        {auditData && (
            <div className="audit-results animate-fade-in">
                <div className="audit-meta-card">
                    <h3>Sesión: #{auditData.sessionId.slice(0,8)}</h3>
                    <div className="audit-stats">
                        <span>Total Items: <strong>{auditData.items.reduce((acc, i) => acc + i.total, 0)}</strong></span>
                    </div>
                </div>

                <div className="audit-items-grid">
                    {auditData.items.map((item, idx) => (
                        <div key={idx} className={`audit-item-card ${item.is_sub ? 'is-sub' : ''}`}>
                            <div className="audit-icon">
                                <FaBox />
                            </div>
                            <div className="audit-info">
                                <div className="audit-prod-name">
                                    {item.is_sub ? item.sub_name : item.name}
                                </div>
                                {item.is_sub && <small className="sub-label">Sustituyó a: {item.name}</small>}
                            </div>
                            <div className="audit-qty">x{item.total}</div>
                        </div>
                    ))}
                </div>

                <div className="audit-actions">
                    <button className="audit-btn reject" onClick={() => setAuditData(null)}>
                        <FaTimes /> Rechazar / Nueva Auditoría
                    </button>
                    <button className="audit-btn approve" onClick={() => alert("✅ Pedido Aprobado. Pase a facturación.")}>
                        <FaCheck /> Aprobar Salida
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default VistaAuditor;