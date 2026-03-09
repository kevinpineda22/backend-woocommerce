import React, { useState, useEffect, useRef } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import EscanerBarras from "../../DesarrolloSurtido_API/EscanerBarras";
import ManifestSheet from "../shared/ManifestSheet";
import { useSedeContext } from "../shared/SedeContext";
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
  FaArrowRight,
  FaPrint,
  FaFileInvoice,
  FaShieldAlt,
  FaSearchPlus,
  FaInfoCircle,
} from "react-icons/fa";
import "./VistaAuditor.css";

const VistaAuditor = () => {
  const { sedeName } = useSedeContext();
  const [sessionId, setSessionId] = useState("");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [scannerMode, setScannerMode] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");

  const [requiredItems, setRequiredItems] = useState(new Set());
  const [verifiedItems, setVerifiedItems] = useState(new Set());
  const [manualVerifyCode, setManualVerifyCode] = useState("");
  const [showInvoices, setShowInvoices] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);

  const showFeedback = (type, message) => {
    if (navigator.vibrate) {
      if (type === "success") navigator.vibrate([50, 50]);
      if (type === "warning") navigator.vibrate([100]);
      if (type === "error") navigator.vibrate([200, 100, 200]);
    }
    setScanFeedback({ type, message });
    setTimeout(() => {
      setScanFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    const storedSession = localStorage.getItem("auditor_session_id");
    if (storedSession) {
      setSessionId(storedSession);
      fetchAuditData(storedSession);
    }
  }, []);

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

  const verifyProductScan = (code) => {
    const cleanCode = code.trim().toUpperCase();
    let matchId = null;
    let foundInOrder = false;
    let matchedName = "";

    auditData.items.forEach((item) => {
      const scannedBarcodes = auditData.scannedBarcodes?.[item.id];
      const hasScannedBarcode = scannedBarcodes && scannedBarcodes.has(cleanCode);
      const hasSiesaBarcode = item.barcode && item.barcode.trim().toUpperCase() === cleanCode;
      const itemSku = (item.id || "").toString().toUpperCase();
      const hasSkuMatch = itemSku === cleanCode || (item.sku && item.sku.toUpperCase() === cleanCode);

      if (hasScannedBarcode || hasSiesaBarcode || hasSkuMatch) {
        foundInOrder = true;
        matchedName = item.name;
        if (requiredItems.has(item.id)) {
          matchId = item.id;
        }
      }
    });

    if (matchId) {
      if (!verifiedItems.has(matchId)) {
        setVerifiedItems((prev) => new Set(prev).add(matchId));
        showFeedback("success", `Producto verificado: ${matchedName}`);
      } else {
        showFeedback("warning", "El producto ya había sido verificado.");
      }
    } else if (foundInOrder) {
      showFeedback("info", "El producto pertenece al pedido, pero no requiere validación (fuera de muestra).");
    } else {
      showFeedback("error", `El código "${cleanCode}" no pertenece a este pedido.`);
    }
  };

  const handleManualVerify = () => {
    if (!manualVerifyCode.trim()) {
      showFeedback("warning", "Por favor ingresa un código manualmente.");
      return;
    }
    verifyProductScan(manualVerifyCode);
    setManualVerifyCode("");
  };

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
    const SAMPLE_SIZE = totalOrders === 1 ? 3 : 2;

    orderIds.forEach((orderId) => {
      const productsInOrder = groupedByOrder[orderId];
      const shuffled = productsInOrder.sort(() => 0.5 - Math.random());
      const selection = shuffled.slice(0, SAMPLE_SIZE);
      selection.forEach((id) => selectedIds.add(id));
    });

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
    setScannerMode(null);

    try {
      const res = await ecommerceApi.get(
        `/historial-detalle?session_id=${id}`,
      );
      const { metadata, logs, orders_info, products_map, final_snapshot } =
        res.data;

      if (!logs || logs.length === 0) {
        setErrorMsg("Sesión vacía o no encontrada.");
        setLoading(false);
        return;
      }

      const itemsMap = {};
      let substitutedCount = 0;
      const scannedBarcodesMap = {}; // ✅ NUEVO: Mapa de códigos escaneados por producto

      logs.forEach((log) => {
        if (log.accion === "recolectado" || log.accion === "sustituido") {
          const key = log.es_sustituto
            ? log.id_producto_final || log.id_producto
            : log.id_producto;

          // ✅ GUARDAR código de barras escaneado si existe
          if (log.codigo_barras_escaneado) {
            if (!scannedBarcodesMap[key]) {
              scannedBarcodesMap[key] = new Set();
            }
            scannedBarcodesMap[key].add(
              log.codigo_barras_escaneado.trim().toUpperCase(),
            );
          }

          if (!itemsMap[key]) {
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
              image: prodDetail?.image || null,
              sku: prodDetail?.sku || null,
              barcode: prodDetail?.barcode || null, // ✅ Código de barras de SIESA
            };
          }
          itemsMap[key].count += 1;
          if (log.es_sustituto) substitutedCount += 1;
        }
      });

      const itemsArray = Object.values(itemsMap);
      const storedStateStr = localStorage.getItem("auditor_state");
      let loadedFromStorage = false;

      if (storedStateStr) {
        try {
          const storedState = JSON.parse(storedStateStr);
          if (storedState.sessionId === metadata.session_id) {
            setRequiredItems(new Set(storedState.required));
            setVerifiedItems(new Set(storedState.verified));
            loadedFromStorage = true;
          }
        } catch (e) {}
      }

      if (!loadedFromStorage) {
        const sampleSet = generateSmartSample(itemsArray, logs, metadata);
        setRequiredItems(sampleSet);
        setVerifiedItems(new Set());
      }

      localStorage.setItem("auditor_session_id", metadata.session_id);

      let duration = "En curso";
      if (metadata.end_time && metadata.start_time) {
        const diff =
          new Date(metadata.end_time) - new Date(metadata.start_time);
        duration = Math.round(diff / 60000) + " min";
      }

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
              customer: "Otros",
              items: [],
            };
          groupedGroups["others"].items.push(item);
        }
      });

      const finalGroups = Object.values(groupedGroups).filter(
        (g) => g.items.length > 0,
      );

      setAuditData({
        meta: metadata,
        items: itemsArray,
        groupedItems: finalGroups,
        rawLogs: logs,
        scannedBarcodes: scannedBarcodesMap, // ✅ NUEVO: Mapa de códigos escaneados
        // ✅ Guardamos el snapshot si existe
        finalSnapshot: final_snapshot,
        stats: {
          totalPhysicalItems: itemsArray.length,
          substitutedCount,
          duration,
        },
      });
    } catch (error) {
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
    setShowInvoices(false);
    localStorage.removeItem("auditor_session_id");
    localStorage.removeItem("auditor_state");
  };

  const isAuditComplete = () => {
    if (!auditData) return false;
    const requiredArray = Array.from(requiredItems);
    return requiredArray.every((id) => verifiedItems.has(id));
  };

  // ✅ GENERAMOS EL SNAPSHOT FINAL PARA LA DB
  const generateOutputData = () => {
    if (!auditData) return null;
    return auditData.groupedItems.map((group) => ({
      id: group.id,
      customer: group.customer,
      billing: group.billing,
      shipping: group.shipping,
      items: group.items.map((i) => ({
        id: i.id,
        sku: i.sku || i.id,
        name: i.name,
        original_name: i.original_name || null,
        qty: i.count,
        price: i.price,
        is_sub: i.is_sub,
        barcode: i.barcode || i.sku || i.id,
      })),
    }));
  };

  // ✅ RESTAURAR HISTORIAL
  const handleViewHistorical = () => {
    if (auditData.finalSnapshot) {
      // Reemplazamos la vista actual con el snapshot guardado
      setAuditData((prev) => ({
        ...prev,
        groupedItems: prev.groupedItems,
      }));
      setShowInvoices(true);
    }
  };

  const handleFinishAudit = async () => {
    if (!isAuditComplete()) {
      alert("⚠️ Faltan productos por verificar.");
      return;
    }
    if (
      !window.confirm(
        "¿Seguro que deseas liberar esta sesión y generar el QR de salida?",
      )
    )
      return;

    try {
      setLoading(true);

      // PREPARAMOS EL SNAPSHOT PARA GUARDAR EN DB (HISTÓRICO)
      // Debe tener la estructura que PedidosAdmin espera para el manifiesto: { timestamp, items }
      const snapshotPayload = {
        timestamp: new Date().toISOString(),
        session_id: auditData.meta.session_id,
        orders: generateOutputData(),
      };

      // Llamamos al nuevo endpoint que genera el QR en backend
      const response = await ecommerceApi.post(
        `/auditor/finalizar`,
        {
          session_id: auditData.meta.session_id,
          datos_salida: snapshotPayload,
        },
      );

      const data = response.data;
      if (response.status !== 200) throw new Error(data.error || "Error al finalizar");

      // 1. Inyectamos el QR generado por el servidor en el estado
      const newAuditData = { ...auditData };
      newAuditData.meta.status = "auditado";

      // Si el backend nos devuelve qr_data, lo usamos como la verdad absoluta
      if (data.qr_data) {
        newAuditData.finalSnapshot = data.qr_data;
      }

      setAuditData(newAuditData);
      setShowInvoices(true); // Mostramos pantalla de impresión
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString) =>
    isoString
      ? new Date(isoString).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  const generateMasterCode = (group) => {
    const payload = {
      id: group.id,
      date: new Date().toISOString().split("T")[0],
      // Minimizamos el JSON para que quepa bien en el QR
      items: group.items.map((i) => ({
        s: i.sku || i.id,
        q: i.count,
        p: i.price,
      })),
    };
    return JSON.stringify(payload);
  };

  if (showInvoices && auditData) {
    // Intentamos usar los datos del servidor (finalSnapshot) o fallamos a los locales
    const qrData = auditData.finalSnapshot || {
      session_id: auditData.meta.session_id,
      timestamp: new Date().toISOString(),
      orders: generateOutputData(),
    };

    const normalizedOrders = Array.isArray(qrData.orders)
      ? qrData.orders
      : qrData.items
        ? [
            {
              id: qrData.order_id || qrData.session_id,
              customer: "Cliente",
              items: qrData.items,
            },
          ]
        : [];

    return (
      <div className="invoice-mode-layout">
        <div className="invoice-actions no-print">
          <button
            className="audit-act-btn approve"
            onClick={() => window.print()}
          >
            <FaPrint /> IMPRIMIR
          </button>
          <button className="audit-act-btn reject" onClick={clearAudit}>
            🏠 FINALIZAR Y SALIR
          </button>
        </div>

        {normalizedOrders.map((order, orderIndex) => {
          // Normalizar items para que tengan el formato esperado por ManifestSheet
          const normalizedItems = (order.items || []).map((i) => ({
            id: i.id || i.sku,
            name: i.name,
            original_name: i.original_name || null,
            sku: i.barcode || i.sku || "",
            barcode: i.barcode || i.sku || i.id,
            qty: i.qty || i.count || 1,
            is_sub: i.type === "sustituido" || i.is_sub,
          }));

          return (
            <ManifestSheet
              key={orderIndex}
              order={{ ...order, items: normalizedItems }}
              timestamp={qrData.timestamp}
              pickerName={auditData.meta.picker_name}
              orderIndex={orderIndex}
              sedeName={sedeName}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <div className="aud-header-spacer"></div>
        <h1>
          <FaClipboardCheck /> Auditoría
        </h1>
        <div className="aud-header-right">
        </div>
      </header>

      <EscanerBarras 
        isScanning={!!scannerMode} 
        setIsScanning={(val) => setScannerMode(val ? scannerMode : null)} 
        onScan={handleScanSuccess} 
      />

      <div className="auditor-body">
        {!auditData && (
          <div className="aud-dashboard animate-fade-in">
            {/* HER0 SECCTION / BUSCADOR */}
            <div className="aud-hero">
              <FaShieldAlt className="aud-hero-icon" />
              <h2>Centro de Auditoría</h2>
              <p>Escanea el Código QR de la canasta o ingresa el ID de sesión manualmente para iniciar la validación del pedido.</p>
              
              <div className="scan-bar-container">
                <button
                  className="auditor-scan-btn"
                  title="Escanear QR de Sesión"
                  onClick={() => setScannerMode("session")}
                >
                  <FaCamera />
                </button>
                <input
                  className="auditor-input"
                  placeholder="Ej: d7a1b3f9..."
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  onKeyDown={handleManualSubmit}
                  autoFocus
                />
                <button
                  className="auditor-search-btn"
                  title="Buscar Sesión"
                  onClick={() => fetchAuditData(sessionId)}
                  disabled={loading || !sessionId}
                  style={{ opacity: loading || !sessionId ? 0.7 : 1 }}
                >
                  <FaSearch />
                </button>
              </div>

              {errorMsg && <div className="auditor-error" style={{ marginTop: '20px' }}>{errorMsg}</div>}
              {loading && <div className="auditor-loading" style={{ marginTop: '20px' }}>Obteniendo datos de sesión...</div>}
            </div>

            {/* TARJETAS EDUCATIVAS - GUÍA PARA EL AUDITOR */}
            <div className="aud-info-cards">
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaSearchPlus />
                </div>
                <h3>Validación Rigurosa</h3>
                <p>Verifica que los productos físicos coincidan exactamente con el pedido escaneando sus códigos de barras de forma aleatoria.</p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaCheckDouble />
                </div>
                <h3>Control de Sustitutos</h3>
                <p>Presta especial atención a los productos sustituidos. Garantiza que el cliente reciba un producto de igual o mejor calidad.</p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaShieldAlt />
                </div>
                <h3>Garantía de Calidad</h3>
                <p>Tu rol es la última línea de defensa. Una vez aprobada la salida, generas el código QR maestro para facturación y despacho.</p>
              </div>
            </div>
          </div>
        )}

        {auditData && (
          <div className="audit-dashboard animate-fade-in">
            <div className="audit-card meta-section">
              <div className="meta-row">
                <div className="meta-item">
                  <label>SESIÓN</label>
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
                  <FaDice color="#8b5cf6" /> Muestra:{" "}
                  <strong>
                    {verifiedItems.size} / {requiredItems.size}
                  </strong>
                </div>

                {/* ✅ BOTÓN DE HISTORIAL DE QR */}
                {auditData.finalSnapshot && (
                  <button
                    className="audit-act-btn approve aud-qr-history-btn"
                    onClick={handleViewHistorical}
                  >
                    <FaFileInvoice /> Ver QR Original
                  </button>
                )}
              </div>
            </div>

            <div className="audit-tabs">
              <button
                className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
                onClick={() => setActiveTab("inventory")}
              >
                <FaListOl /> Inventario
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
                      <FaBarcode /> Escanear Producto
                    </button>
                    <div className="manual-verify-box">
                      <input
                        placeholder="Código manual..."
                        value={manualVerifyCode}
                        onChange={(e) => setManualVerifyCode(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleManualVerify()
                        }
                      />
                      <button
                        onClick={handleManualVerify}
                        disabled={!manualVerifyCode}
                      >
                        <FaCheck />
                      </button>
                    </div>
                  </div>
                  <div className="audit-groups-container">
                    {auditData.groupedItems.map((group) => (
                      <div key={group.id} className="audit-order-group">
                        <div className="audit-group-header">
                          <span className="agh-customer">{group.customer}</span>
                          <span className="agh-id">#{group.id}</span>
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
                                    {item.name}{" "}
                                    {isRequired && (
                                      <span className="sample-badge">
                                        <FaDice />
                                      </span>
                                    )}
                                  </div>
                                  <div className="inv-sku">
                                    {isRequired && !isVerified ? (
                                      <span className="hidden-code">●●●●</span>
                                    ) : (
                                      item.barcode ||
                                      item.sku ||
                                      `Ref: ${item.id}`
                                    )}
                                  </div>
                                  {/* ✅ MOSTRAR códigos escaneados para verificación */}
                                  {isRequired &&
                                    !isVerified &&
                                    auditData.scannedBarcodes?.[item.id] && (
                                      <div className="aud-barcode-hint">
                                        <FaBarcode />
                                        {Array.from(
                                          auditData.scannedBarcodes[item.id],
                                        ).join(", ")}
                                      </div>
                                    )}
                                  {item.is_sub && (
                                    <div className="inv-sub-note">
                                      <FaExclamationTriangle /> Sustitución:{" "}
                                      <strong>{item.original_name}</strong>
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
                        <div className="tl-desc">
                          {log.accion === "sustituido" ? (
                            <div className="aud-timeline-sub-layout">
                              <span className="aud-timeline-sub-original">
                                {log.nombre_producto}
                              </span>
                              <span className="aud-timeline-sub-replacement">
                                <FaArrowRight size={12} />{" "}
                                {log.nombre_sustituto}
                              </span>
                            </div>
                          ) : (
                            log.nombre_producto
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="audit-footer-section">
              <div className="audit-actions-row">
                {/* Si ya está auditada, no mostramos aprobar, solo salir.
                  Si es "pendiente_auditoria" significa que espera auditoría. */}
                {auditData.meta.status === "auditado" ? (
                  <button className="audit-act-btn reject" onClick={clearAudit}>
                    🏠 VOLVER AL INICIO
                  </button>
                ) : (
                  <button
                    className={`audit-act-btn approve ${isAuditComplete() ? "ready" : "disabled"}`}
                    onClick={handleFinishAudit}
                  >
                    <FaCheck /> APROBAR SALIDA
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {scanFeedback && (
        <div className="aud-toast-container">
          <div className={`aud-toast ${scanFeedback.type}`}>
            {scanFeedback.type === "success" && <FaCheck />}
            {scanFeedback.type === "error" && <FaTimes />}
            {scanFeedback.type === "warning" && <FaExclamationTriangle />}
            {scanFeedback.type === "info" && <FaInfoCircle />}
            <span>{scanFeedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VistaAuditor;
