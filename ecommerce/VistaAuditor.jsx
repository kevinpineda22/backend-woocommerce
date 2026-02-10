import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras";
import {
  FaClipboardCheck,
  FaSearch,
  FaCheck,
  FaTimes,
  FaCamera,
  FaHistory,
  FaListOl,
  FaUserCircle,
  FaDice,
  FaCheckDouble,
  FaKeyboard,
  FaExclamationTriangle,
  FaBarcode,
  FaBoxOpen,
} from "react-icons/fa";
import "./VistaAuditor.css";

const VistaAuditor = () => {
  const [sessionId, setSessionId] = useState("");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [scannerMode, setScannerMode] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");

  // Estado de Auditoría Inteligente
  const [requiredItems, setRequiredItems] = useState(new Set());
  const [verifiedItems, setVerifiedItems] = useState(new Set());

  // Estado para input manual de verificación
  const [manualVerifyCode, setManualVerifyCode] = useState("");

  // --- PERSISTENCIA: RECUPERAR SESIÓN AL CARGAR ---
  useEffect(() => {
    const storedSession = localStorage.getItem("auditor_session_id");
    if (storedSession) {
      setSessionId(storedSession);
      fetchAuditData(storedSession);
    }
  }, []);

  // --- PERSISTENCIA: GUARDAR ESTADO DE PROGRESO ---
  useEffect(() => {
    if (auditData?.meta?.session_id) {
      const stateToSave = {
        sessionId: auditData.meta.session_id,
        required: Array.from(requiredItems),
        verified: Array.from(verifiedItems),
      };
      localStorage.setItem("auditor_state", JSON.stringify(stateToSave));
    }
  }, [requiredItems, verifiedItems, auditData]);

  const handleSetIsScanning = (state) => {
    if (!state) setScannerMode(null);
  };

  const handleScanSuccess = (decodedText) => {
    if (navigator.vibrate) navigator.vibrate(100);

    setTimeout(() => {
      if (scannerMode === "session") {
        setSessionId(decodedText);
        fetchAuditData(decodedText);
      } else if (scannerMode === "product" && auditData) {
        verifyProductScan(decodedText);
      }
      setScannerMode(null);
    }, 200);
  };

  // --- LÓGICA DE VALIDACIÓN ---
  const verifyProductScan = (code) => {
    const cleanCode = code.trim().toUpperCase();
    let matchId = null;

    auditData.items.forEach((item) => {
      const itemSku = (item.id || "").toString().toUpperCase();
      if (requiredItems.has(item.id)) {
        if (
          itemSku === cleanCode ||
          item.name.toUpperCase().includes(cleanCode)
        ) {
          matchId = item.id;
        }
      }
    });

    if (matchId) {
      if (!verifiedItems.has(matchId)) {
        setVerifiedItems((prev) => new Set(prev).add(matchId));
        if (navigator.vibrate) navigator.vibrate([50, 50]);
      }
    } else {
      alert(
        `ℹ️ El código proporcionado no coincide con la muestra solicitada.`,
      );
    }
  };

  const handleManualVerify = () => {
    if (!manualVerifyCode.trim()) return;
    verifyProductScan(manualVerifyCode);
    setManualVerifyCode("");
  };

  // --- ALGORITMO DE MUESTREO ---
  const generateSmartSample = (items, logs, metadata) => {
    const groupedByOrder = {};
    items.forEach((item) => {
      const relatedLog = logs.find(
        (l) =>
          (l.es_sustituto ? l.id_producto_final : l.id_producto) === item.id,
      );
      if (relatedLog) {
        const orderId = relatedLog.id_pedido;
        if (!groupedByOrder[orderId]) groupedByOrder[orderId] = [];
        groupedByOrder[orderId].push(item.id);
      }
    });

    const orderIds = Object.keys(groupedByOrder);
    const totalOrders = orderIds.length;
    const selectedIds = new Set();
    const SAMPLE_SIZE = totalOrders === 1 ? 3 : 2; // Mínimo a verificar por pedido

    orderIds.forEach((orderId) => {
      const productsInOrder = groupedByOrder[orderId];
      const shuffled = productsInOrder.sort(() => 0.5 - Math.random());
      const selection = shuffled.slice(0, SAMPLE_SIZE);
      selection.forEach((id) => selectedIds.add(id));
    });

    // Asegurar al menos 1 item si hay muy pocos
    if (selectedIds.size === 0 && items.length > 0) {
      selectedIds.add(items[0].id);
    }

    return selectedIds;
  };

  const fetchAuditData = async (id) => {
    if (!id) return;
    setLoading(true);
    setErrorMsg("");
    setAuditData(null);
    setVerifiedItems(new Set());

    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial-detalle?session_id=${id}`,
      );
      // Backend ahora devuelve: { metadata, orders_info, logs, products_map }
      const { metadata, logs, orders_info, products_map } = res.data;

      if (!logs || logs.length === 0) {
        setErrorMsg("Sesión vacía o no encontrada.");
        setLoading(false);
        return;
      }

      const itemsMap = {};
      let substitutedCount = 0;

      logs.forEach((log) => {
        if (log.accion === "recolectado" || log.accion === "sustituido") {
          const key = log.es_sustituto
            ? log.id_producto_final || log.id_producto
            : log.id_producto;
          if (!itemsMap[key]) {
            // Mapear imagen si existe
            const prodDetail = products_map ? products_map[key] : null;
            itemsMap[key] = {
              id: key,
              name: log.es_sustituto
                ? log.nombre_sustituto
                : log.nombre_producto,
              original_name: log.nombre_producto,
              count: 0,
              is_sub: log.es_sustituto,
              price: log.precio_nuevo || 0,
              order_id: log.id_pedido,
              image: prodDetail?.image || null, // Imagen de Woo
              sku: prodDetail?.sku || null,
            };
          }
          itemsMap[key].count += 1;
          if (log.es_sustituto) substitutedCount += 1;
        }
      });

      const itemsArray = Object.values(itemsMap);

      // --- LOGICA DE PERSISTENCIA O GENERACION DE MUESTRA ---
      const storedStateStr = localStorage.getItem("auditor_state");
      let loadedFromStorage = false;

      if (storedStateStr) {
        try {
          const storedState = JSON.parse(storedStateStr);
          // Si la sesión guardada coincide con la que acabamos de cargar
          if (storedState.sessionId === metadata.session_id) {
            setRequiredItems(new Set(storedState.required));
            setVerifiedItems(new Set(storedState.verified));
            loadedFromStorage = true;
          }
        } catch (e) {
          console.error("Error leyendo estado guardado", e);
        }
      }

      if (!loadedFromStorage) {
        const sampleSet = generateSmartSample(itemsArray, logs, metadata);
        setRequiredItems(sampleSet);
        setVerifiedItems(new Set()); // Reiniciar verificados si es nueva sesión
      }

      // Guardar session_id activo para recarga automática
      localStorage.setItem("auditor_session_id", metadata.session_id);

      let duration = "En curso";
      if (metadata.end_time && metadata.start_time) {
        const diff =
          new Date(metadata.end_time) - new Date(metadata.start_time);
        duration = Math.round(diff / 60000) + " min";
      }

      // Agrupación por Pedido
      const groupedGroups = {};
      if (orders_info) {
        orders_info.forEach((ord) => {
          groupedGroups[ord.id] = { ...ord, items: [] };
        });
      }

      itemsArray.forEach((item) => {
        if (groupedGroups[item.order_id]) {
          groupedGroups[item.order_id].items.push(item);
        } else {
          if (!groupedGroups["others"])
            groupedGroups["others"] = {
              id: "others",
              customer: "Otros / Sin Asignar",
              items: [],
            };
          groupedGroups["others"].items.push(item);
        }
      });

      // Filtrar grupos vacíos
      const finalGroups = Object.values(groupedGroups).filter(
        (g) => g.items.length > 0,
      );

      setAuditData({
        meta: metadata,
        items: itemsArray,
        groupedItems: finalGroups,
        rawLogs: logs,
        stats: {
          totalPhysicalItems: itemsArray.length,
          substitutedCount,
          duration,
        },
      });
    } catch (error) {
      console.error(error);
      setErrorMsg("Error consultando la sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    if (e.key === "Enter") fetchAuditData(sessionId);
  };

  const clearAudit = () => {
    setAuditData(null);
    setSessionId("");
    setErrorMsg("");
    setVerifiedItems(new Set());
    setRequiredItems(new Set());
    localStorage.removeItem("auditor_session_id");
    localStorage.removeItem("auditor_state");
  };

  const isAuditComplete = () => {
    if (!auditData) return false;
    const requiredArray = Array.from(requiredItems);
    return requiredArray.every((id) => verifiedItems.has(id));
  };

  const formatTime = (isoString) =>
    isoString
      ? new Date(isoString).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <h1>
          <FaClipboardCheck /> Auditoría Inteligente
        </h1>
      </header>

      <EscanerBarras
        isScanning={!!scannerMode}
        setIsScanning={handleSetIsScanning}
        onScan={handleScanSuccess}
      />

      <div className="auditor-body">
        {!auditData && (
          <div className="auditor-controls">
            <div className="scan-bar-container">
              <button
                className="auditor-scan-btn"
                onClick={() => setScannerMode("session")}
              >
                <FaCamera />
              </button>
              <input
                className="auditor-input"
                placeholder="ID Sesión o Escanear QR..."
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                onKeyDown={handleManualSubmit}
                autoFocus
              />
              <button
                className="auditor-search-btn"
                onClick={() => fetchAuditData(sessionId)}
              >
                <FaSearch />
              </button>
            </div>
            {errorMsg && <div className="auditor-error">{errorMsg}</div>}
            {loading && (
              <div className="auditor-loading">
                Analizando datos de la sesión...
              </div>
            )}
          </div>
        )}

        {auditData && (
          <div className="audit-dashboard animate-fade-in">
            <div className="audit-card meta-section">
              <div className="meta-row">
                <div className="meta-item">
                  <label>ID SESIÓN</label>
                  <span className="code-badge">
                    #{auditData.meta.session_id.slice(0, 8)}
                  </span>
                </div>
                <div className="meta-item">
                  <label>PICKER</label>
                  <span className="picker-badge">
                    <FaUserCircle /> {auditData.meta.picker_name}
                  </span>
                </div>
              </div>
              <div className="meta-row secondary">
                <div className="meta-item">
                  <FaDice color="#8b5cf6" />
                  Muestra Aleatoria:{" "}
                  <strong>
                    {verifiedItems.size} / {requiredItems.size}
                  </strong>{" "}
                  verificados
                </div>
              </div>
            </div>

            <div className="audit-tabs">
              <button
                className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
                onClick={() => setActiveTab("inventory")}
              >
                <FaListOl /> Inventario por Pedido
              </button>
              <button
                className={`tab-btn ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => setActiveTab("timeline")}
              >
                <FaHistory /> Historial
              </button>
            </div>

            <div className="audit-content-area">
              {activeTab === "inventory" && (
                <>
                  <div className="inventory-actions">
                    <button
                      className="start-verify-btn"
                      onClick={() => setScannerMode("product")}
                    >
                      <FaBarcode /> Validar Muestra
                    </button>

                    <div className="manual-verify-box">
                      <input
                        placeholder="Ingresa código..."
                        value={manualVerifyCode}
                        onChange={(e) => setManualVerifyCode(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleManualVerify()
                        }
                      />
                      <button
                        onClick={handleManualVerify}
                        disabled={!manualVerifyCode}
                        title="Validar código ingresado"
                      >
                        <FaCheck />
                      </button>
                    </div>
                  </div>

                  {/* LISTADO AGRUPADO POR PEDIDO */}
                  <div className="audit-groups-container">
                    {auditData.groupedItems.map((group) => (
                      <div key={group.id} className="audit-order-group">
                        <div className="audit-group-header">
                          <span className="agh-customer">{group.customer}</span>
                          <span className="agh-id">Pedido #{group.id}</span>
                        </div>
                        <div className="inventory-grid">
                          {group.items.map((item, idx) => {
                            const isRequired = requiredItems.has(item.id);
                            const isVerified = verifiedItems.has(item.id);
                            return (
                              <div
                                key={idx}
                                className={`inv-item ${item.is_sub ? "sub" : ""} ${isRequired ? "required-scan" : "trusted"} ${isVerified ? "verified-ok" : ""}`}
                              >
                                <div className="inv-qty">x{item.count}</div>

                                {/* IMAGEN DEL PRODUCTO */}
                                <div className="inv-img-box">
                                  {item.image ? (
                                    <img
                                      src={item.image}
                                      alt=""
                                      className="inv-img-thumb"
                                    />
                                  ) : (
                                    <FaBoxOpen className="inv-img-placeholder" />
                                  )}
                                </div>

                                <div className="inv-details">
                                  <div className="inv-name">
                                    {item.name}
                                    {isRequired && (
                                      <span className="sample-badge">
                                        <FaDice /> Muestra
                                      </span>
                                    )}
                                  </div>

                                  {/* SKU OCULTO SI ES MUESTRA NO VERIFICADA */}
                                  <div className="inv-sku">
                                    {isRequired && !isVerified ? (
                                      <span className="hidden-code">
                                        ●●●●●● (Escanear para revelar)
                                      </span>
                                    ) : (
                                      `Ref: ${item.id}`
                                    )}
                                  </div>

                                  {item.is_sub && (
                                    <div className="inv-sub-note">
                                      <FaExclamationTriangle /> Sustitución
                                    </div>
                                  )}
                                </div>
                                <div className="inv-status-icon">
                                  {isVerified ? (
                                    <FaCheckDouble size={18} color="white" />
                                  ) : isRequired ? (
                                    <span className="dot-pulse"></span>
                                  ) : (
                                    <FaCheck size={14} color="#94a3b8" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeTab === "timeline" && (
                <div className="timeline-container">
                  {auditData.rawLogs.map((log, idx) => (
                    <div key={idx} className={`timeline-row ${log.accion}`}>
                      <div className="tl-time">
                        {formatTime(log.fecha_registro)}
                      </div>
                      <div className="tl-marker"></div>
                      <div className="tl-content">
                        <div className="tl-title">{log.accion}</div>
                        <div className="tl-desc">{log.nombre_producto}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="audit-footer-section">
              <div className="audit-actions-row">
                <button
                  className="audit-act-btn reject"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Seguro que deseas rechazar esta auditoría? Esto reiniciará la vista.",
                      )
                    ) {
                      clearAudit();
                    }
                  }}
                >
                  <FaTimes /> Rechazar
                </button>

                <button
                  className={`audit-act-btn approve ${isAuditComplete() ? "ready" : "disabled"}`}
                  onClick={() => {
                    if (!isAuditComplete()) {
                      alert(
                        "⚠️ Faltan validar productos de la muestra. Escanea los items marcados en azul.",
                      );
                      return;
                    }
                    alert("✅ Auditoría Aprobada Correctamente."); // Mensaje Final
                    clearAudit();
                  }}
                >
                  <FaCheck /> APROBAR SALIDA
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VistaAuditor;
