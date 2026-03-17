import React, { useState, useEffect, useRef } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import EscanerBarras from "../../DesarrolloSurtido_API/EscanerBarras";
import ManifestSheet from "../shared/ManifestSheet";
import { useSedeContext } from "../shared/SedeContext";
import { supabase } from "../../../supabaseClient";
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
  FaSpinner,
  FaBarcode,
  FaBoxOpen,
  FaArrowRight,
  FaPrint,
  FaFileInvoice,
  FaShieldAlt,
  FaSearchPlus,
  FaInfoCircle,
  FaExclamationCircle,
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
  const [showTrusted, setShowTrusted] = useState(false);

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

  // ─── DETECCIÓN DE TIPO DE PRODUCTO ───
  const FRUVER_KEYWORDS = [
    "fruver",
    "fruta",
    "verdura",
    "manzana",
    "banano",
    "tomate",
    "cebolla",
    "papa",
    "zanahoria",
    "limón",
    "limon",
    "naranja",
    "aguacate",
    "lechuga",
    "pepino",
    "pimentón",
    "pimenton",
  ];

  const isFruverItem = (itemName) => {
    const name = (itemName || "").toLowerCase();
    return FRUVER_KEYWORDS.some((kw) => name.includes(kw));
  };

  const requiresGS1 = (itemId) => {
    const scans = auditData?.scannedBarcodes?.[itemId];
    if (!scans) return false;
    return Array.from(scans).some(
      (code) => /^\d{13,14}$/.test(code) && code.startsWith("2"),
    );
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
      const hasScannedBarcode =
        scannedBarcodes && scannedBarcodes.has(cleanCode);
      const hasSiesaBarcode =
        item.barcode && item.barcode.trim().toUpperCase() === cleanCode;
      const itemSku = (item.id || "").toString().toUpperCase();
      const hasSkuMatch =
        itemSku === cleanCode ||
        (item.sku && item.sku.toUpperCase() === cleanCode);

      // Comprobamos si el picker escaneó un código GS1 para este producto
      let pickerScannedGS1 = false;
      if (scannedBarcodes) {
        for (const code of scannedBarcodes) {
          if (/^\d{13,14}$/.test(code) && code.startsWith("2")) {
            pickerScannedGS1 = true;
            break;
          }
        }
      }

      // Si el picker escaneó un GS1 (ej. etiqueta de báscula de carnes),
      // forzamos al auditor a escanear exactamente la misma etiqueta o al menos un GS1 válido.
      if (pickerScannedGS1 && requiredItems.has(item.id)) {
        const isGS1 =
          /^\d{13,14}$/.test(cleanCode) && cleanCode.startsWith("2");
        if (!isGS1) return; // Ignorar coincidencias si el auditor intenta escanear el SKU corto normal

        if (hasScannedBarcode) {
          foundInOrder = true;
          matchedName = item.name;
          matchId = item.id;
        }
        return;
      }

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
      showFeedback(
        "info",
        "El producto pertenece al pedido, pero no requiere validación (fuera de muestra).",
      );
    } else {
      // Check if the rejected code was a short code for a meat/weighable item
      const itemRequiringGS1 = auditData.items.find((item) => {
        if (!requiredItems.has(item.id) || verifiedItems.has(item.id))
          return false;
        const scans = auditData.scannedBarcodes?.[item.id];
        if (scans) {
          for (const code of scans) {
            if (/^\d{13,14}$/.test(code) && code.startsWith("2")) return true;
          }
        }
        return false;
      });

      if (itemRequiringGS1) {
        showFeedback(
          "error",
          `⚖️ Producto pesado detectado. Debes escanear la etiqueta GS1 completa que capturó el picker.`,
        );
      } else {
        showFeedback(
          "error",
          `El código "${cleanCode}" no pertenece a este pedido.`,
        );
      }
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
      const res = await ecommerceApi.get(`/historial-detalle?session_id=${id}`);
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
              unidad_medida: prodDetail?.unidad_medida || null, // ⚖️ UOM (UND, P6, KL...)
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
      items: group.items.map((i) => {
        // Encontrar los códigos exactos escaneados para este producto
        const scannedSet = auditData.scannedBarcodes[i.id];
        const exactScannedBarcode =
          scannedSet && scannedSet.size > 0
            ? Array.from(scannedSet).join(",")
            : i.barcode || i.sku || i.id;

        return {
          id: i.id,
          sku: i.sku || i.id,
          name: i.name,
          original_name: i.original_name || null,
          qty: i.count,
          price: i.price,
          is_sub: i.is_sub,
          barcode: exactScannedBarcode, // ✅ El código EXACTO GS1 capturado en el picker
        };
      }),
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
      const response = await ecommerceApi.post(`/auditor/finalizar`, {
        session_id: auditData.meta.session_id,
        datos_salida: snapshotPayload,
      });

      const data = response.data;
      if (response.status !== 200)
        throw new Error(data.error || "Error al finalizar");

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
            // ✅ IMPORTANTE: Usar sku_final si está disponible (SKU reconstruido desde SIESA)
            // Si no, usar sku original de WooCommerce
            sku: i.sku_final || i.sku || "",
            barcode: i.barcode || "", // Solo barcode real, nunca SKU ni ID
            qty: i.qty || i.count || 1,
            is_sub: i.type === "sustituido" || i.is_sub,
            unidad_medida: i.unidad_medida || "", // Para detectar multipacks (P6, P25, KL, LB, etc.)
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
        <div className="aud-header-right"></div>
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
              <p>
                Escanea el Código QR de la canasta o ingresa el ID de sesión
                manualmente para iniciar la validación del pedido.
              </p>

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

              {errorMsg && (
                <div className="auditor-error" style={{ marginTop: "20px" }}>
                  {errorMsg}
                </div>
              )}
              {loading && (
                <div className="auditor-loading" style={{ marginTop: "20px" }}>
                  Obteniendo datos de sesión...
                </div>
              )}
            </div>

            {/* TARJETAS EDUCATIVAS - GUÍA PARA EL AUDITOR */}
            <div className="aud-info-cards">
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaSearchPlus />
                </div>
                <h3>Validación Rigurosa</h3>
                <p>
                  Verifica que los productos físicos coincidan exactamente con
                  el pedido escaneando sus códigos de barras de forma aleatoria.
                </p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaCheckDouble />
                </div>
                <h3>Control de Sustitutos</h3>
                <p>
                  Presta especial atención a los productos sustituidos.
                  Garantiza que el cliente reciba un producto de igual o mejor
                  calidad.
                </p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaShieldAlt />
                </div>
                <h3>Garantía de Calidad</h3>
                <p>
                  Tu rol es la última línea de defensa. Una vez aprobada la
                  salida, generas el código QR maestro para facturación y
                  despacho.
                </p>
              </div>
            </div>
          </div>
        )}

        {auditData &&
          (() => {
            // Compute sections
            const allItems = auditData.groupedItems.flatMap((g) =>
              g.items.map((i) => ({
                ...i,
                orderCustomer: g.customer,
                orderId: g.id,
              })),
            );
            const pendingItems = allItems.filter(
              (i) => requiredItems.has(i.id) && !verifiedItems.has(i.id),
            );
            const verifiedList = allItems.filter(
              (i) => requiredItems.has(i.id) && verifiedItems.has(i.id),
            );
            const trustedItems = allItems.filter(
              (i) => !requiredItems.has(i.id),
            );
            const progress =
              requiredItems.size > 0
                ? Math.round((verifiedItems.size / requiredItems.size) * 100)
                : 0;
            const allDone = isAuditComplete();

            return (
              <div className="aud-session animate-fade-in">
                {/* ─── COMPACT META ─── */}
                <div className="aud-compact-meta">
                  <div className="aud-meta-left">
                    <span className="aud-meta-session">
                      #{auditData.meta.session_id.slice(0, 8)}
                    </span>
                    <span className="aud-meta-sep">•</span>
                    <span className="aud-meta-picker">
                      <FaUserCircle /> {auditData.meta.picker_name}
                    </span>
                  </div>
                  <div className="aud-meta-right">
                    {auditData.finalSnapshot && (
                      <button
                        className="aud-meta-qr-btn"
                        onClick={handleViewHistorical}
                        title="Ver QR Original"
                      >
                        <FaFileInvoice />
                      </button>
                    )}
                  </div>
                </div>

                {/* ─── PROGRESS BAR ─── */}
                <div className="aud-progress-section">
                  <div className="aud-progress-text">
                    <span>
                      {allDone
                        ? "✅ Auditoría completa"
                        : `${verifiedItems.size} de ${requiredItems.size} verificados`}
                    </span>
                    <span className="aud-progress-pct">{progress}%</span>
                  </div>
                  <div className="aud-progress-track">
                    <div
                      className={`aud-progress-fill ${allDone ? "complete" : ""}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* ─── STICKY SCANNER BAR ─── */}
                {auditData.meta.status !== "auditado" && (
                  <div className="aud-scanner-sticky">
                    <button
                      className="aud-scan-cam-btn"
                      onClick={() => setScannerMode("product")}
                      title="Escanear con Cámara"
                    >
                      <FaCamera size={20} />
                    </button>
                    <div className="aud-scan-input-wrap">
                      <input
                        className="aud-scan-input"
                        placeholder="Digitar código de barras..."
                        value={manualVerifyCode}
                        onChange={(e) => setManualVerifyCode(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleManualVerify()
                        }
                      />
                      {manualVerifyCode && (
                        <button
                          className="aud-scan-go-btn"
                          onClick={handleManualVerify}
                        >
                          <FaCheck />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── COMPLETION BANNER ─── */}
                {allDone && auditData.meta.status !== "auditado" && (
                  <div className="aud-complete-banner">
                    <FaCheckDouble size={20} />
                    <span>
                      ¡Todos los productos fueron verificados! Puedes aprobar la
                      salida.
                    </span>
                  </div>
                )}

                {/* ─── ORDERS LIST ─── */}
                <div
                  className="aud-orders-container"
                  style={{ marginTop: "20px" }}
                >
                  {auditData.groupedItems.map((group, orderIndex) => {
                    const orderItems = group.items.map((i) => ({
                      ...i,
                      orderCustomer: group.customer,
                      orderId: group.id,
                    }));
                    const pendingItems = orderItems.filter(
                      (i) =>
                        requiredItems.has(i.id) && !verifiedItems.has(i.id),
                    );
                    const verifiedList = orderItems.filter(
                      (i) => requiredItems.has(i.id) && verifiedItems.has(i.id),
                    );
                    const trustedItems = orderItems.filter(
                      (i) => !requiredItems.has(i.id),
                    );

                    // Progress calculations
                    const requiredCount =
                      pendingItems.length + verifiedList.length;
                    const verifiedCount = verifiedList.length;
                    const orderProgress =
                      requiredCount > 0
                        ? Math.round((verifiedCount / requiredCount) * 100)
                        : 100;
                    const isOrderComplete = requiredCount === verifiedCount;
                    // Obtener datos del pedido original si existe la orden en el snapshot (o en la sesión)
                    const orderData =
                      auditData.orders_info?.find((o) => o.id === group.id) ||
                      {};
                    const phone =
                      orderData.phone || orderData.billing?.phone || null;
                    const address =
                      orderData.shipping?.address_1 ||
                      orderData.billing?.address_1 ||
                      null;
                    const city =
                      orderData.shipping?.city ||
                      orderData.billing?.city ||
                      null;
                    const email =
                      orderData.email || orderData.billing?.email || null;
                    const dateCreated = orderData.date_created
                      ? new Date(orderData.date_created).toLocaleString(
                          "es-CO",
                          { dateStyle: "short", timeStyle: "short" },
                        )
                      : null;
                    const customerNote = orderData.customer_note || null;

                    return (
                      <div
                        key={group.id || orderIndex}
                        className="aud-order-group"
                      >
                        {/* ORDER HEADER ENRIQUECIDO */}
                        <div className="aud-order-header">
                          <div className="aud-order-customer">
                            <div className="aud-order-title-row">
                              <span className="aud-order-customer-name">
                                👤 {group.customer}
                              </span>
                              <span className="aud-order-id-badge">
                                {group.id === "others"
                                  ? "Ítems sin pedido"
                                  : `Pedido: ${group.id}`}
                              </span>
                            </div>
                            {(phone ||
                              address ||
                              email ||
                              dateCreated ||
                              customerNote) && (
                              <div className="aud-order-customer-details">
                                {dateCreated && (
                                  <div
                                    className="aud-order-detail-line"
                                    style={{
                                      color: "#3b82f6",
                                      fontWeight: 700,
                                    }}
                                  >
                                    <span>📅 Fecha: {dateCreated}</span>
                                  </div>
                                )}
                                {phone && (
                                  <div className="aud-order-detail-line">
                                    <span>📞 {phone}</span>
                                  </div>
                                )}
                                {email && (
                                  <div className="aud-order-detail-line">
                                    <span>✉️ {email}</span>
                                  </div>
                                )}
                                {address && (
                                  <div className="aud-order-detail-line">
                                    <span>
                                      📍 {address}
                                      {city ? `, ${city}` : ""}
                                    </span>
                                  </div>
                                )}
                                {customerNote && (
                                  <div
                                    className="aud-order-detail-line"
                                    style={{
                                      marginTop: "4px",
                                      background: "#fef9c3",
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      color: "#854d0e",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span>
                                      📝 Nota del Cliente: {customerNote}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="aud-order-progress">
                            <div className="aud-order-progress-text">
                              {isOrderComplete
                                ? "✅ Todo verificado"
                                : `${verifiedCount} de ${requiredCount} verificados`}
                            </div>
                            <div className="aud-order-progress-bar">
                              <div
                                className={`aud-order-progress-fill ${isOrderComplete ? "complete" : ""}`}
                                style={{ width: `${orderProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* ORDER BODY WITH SECTIONS */}
                        <div className="aud-order-body">
                          {/* 1. Pendientes */}
                          {pendingItems.length > 0 && (
                            <div className="aud-section">
                              <div
                                className="aud-section-header pending"
                                style={{
                                  background: "#fef3c7",
                                  padding: "8px 12px",
                                  marginBottom: "8px",
                                }}
                              >
                                <FaExclamationCircle />
                                <span>
                                  Pendientes de verificar ({pendingItems.length}
                                  )
                                </span>
                              </div>
                              <div className="aud-items-list compact">
                                {pendingItems.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className={`aud-item-card pending ${item.is_sub ? "sub" : ""}`}
                                  >
                                    {/* COLUMNA 1: IMAGEN */}
                                    <div className="aud-item-img-col">
                                      <div className="aud-item-img">
                                        {item.image ? (
                                          <img src={item.image} alt="" />
                                        ) : (
                                          <FaBoxOpen className="aud-item-placeholder" />
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 2: INFO CENTRAL */}
                                    <div className="aud-item-info">
                                      <div className="aud-item-name">
                                        {item.name}
                                      </div>
                                      {item.is_sub && (
                                        <div className="aud-sub-details">
                                          <div className="aud-sub-original">
                                            <span className="aud-label-tiny">
                                              PIDIÓ:
                                            </span>{" "}
                                            {item.original_name}
                                          </div>
                                          <div className="aud-sub-replacement">
                                            <span className="aud-label-tiny">
                                              LLEVAS:
                                            </span>{" "}
                                            {item.name}
                                          </div>
                                        </div>
                                      )}
                                      <div className="aud-item-action">
                                        {requiresGS1(item.id) ? (
                                          <span className="aud-type-badge meat">
                                            ⚖️ Escanear etiqueta GS1
                                          </span>
                                        ) : isFruverItem(item.name) ? (
                                          <button
                                            className="aud-visual-approve-btn"
                                            onClick={() => {
                                              setVerifiedItems((prev) =>
                                                new Set(prev).add(item.id),
                                              );
                                              showFeedback(
                                                "success",
                                                `✅ Fruver aprobado: ${item.name}`,
                                              );
                                            }}
                                          >
                                            👁️ Aprobar Visual
                                          </button>
                                        ) : (
                                          <span className="aud-type-badge normal">
                                            🔒 Requerido
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                    <div className="aud-item-action-col">
                                      {(() => {
                                        const uom = item.unidad_medida
                                          ? item.unidad_medida.toUpperCase()
                                          : "";
                                        const isPack =
                                          uom.startsWith("P") &&
                                          !isNaN(uom.substring(1));
                                        const packQty = isPack
                                          ? parseInt(uom.substring(1)) || 0
                                          : 0;
                                        return isPack ? (
                                          <div
                                            style={{
                                              background: "#9333ea",
                                              color: "white",
                                              padding: "4px 8px",
                                              borderRadius: "6px",
                                              fontWeight: "900",
                                              fontSize: "0.7rem",
                                              textAlign: "center",
                                              marginBottom: "4px",
                                            }}
                                          >
                                            📦 x{packQty}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="aud-massive-qty-badge">
                                        <span className="aud-massive-qty-num">
                                          {item.count}
                                        </span>
                                        <span className="aud-massive-qty-unit">
                                          {item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "UN."}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Verificados */}
                          {verifiedList.length > 0 && (
                            <div
                              className="aud-section"
                              style={{
                                marginTop: pendingItems.length > 0 ? "16px" : 0,
                              }}
                            >
                              <div className="aud-items-list compact">
                                {verifiedList.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="aud-item-card verified"
                                  >
                                    {/* COLUMNA 1: IMAGEN */}
                                    <div className="aud-item-img-col">
                                      <div className="aud-item-img small">
                                        {item.image ? (
                                          <img src={item.image} alt="" />
                                        ) : (
                                          <FaBoxOpen className="aud-item-placeholder" />
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 2: INFO CENTRAL */}
                                    <div className="aud-item-info">
                                      <div className="aud-item-name">
                                        {item.name}
                                      </div>
                                      <div className="aud-item-verified-tag">
                                        ✅ Verificado exitosamente
                                      </div>
                                    </div>

                                    {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                    <div className="aud-item-action-col">
                                      {(() => {
                                        const uom = item.unidad_medida
                                          ? item.unidad_medida.toUpperCase()
                                          : "";
                                        const isPack =
                                          uom.startsWith("P") &&
                                          !isNaN(uom.substring(1));
                                        const packQty = isPack
                                          ? parseInt(uom.substring(1)) || 0
                                          : 0;
                                        return isPack ? (
                                          <div
                                            style={{
                                              background: "#9333ea",
                                              color: "white",
                                              padding: "4px 8px",
                                              borderRadius: "6px",
                                              fontWeight: "900",
                                              fontSize: "0.7rem",
                                              textAlign: "center",
                                              marginBottom: "4px",
                                            }}
                                          >
                                            📦 x{packQty}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div
                                        className="aud-massive-qty-badge"
                                        style={{ background: "#16a34a" }}
                                      >
                                        <span className="aud-massive-qty-num">
                                          {item.count}
                                        </span>
                                        <span className="aud-massive-qty-unit">
                                          {item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "UN."}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Confiables */}
                          {trustedItems.length > 0 && (
                            <div
                              className="aud-section"
                              style={{ marginTop: "16px", marginBottom: 0 }}
                            >
                              <button
                                className="aud-section-header trusted collapsible"
                                style={{
                                  background: "#f1f5f9",
                                  padding: "8px 12px",
                                }}
                                onClick={() => {
                                  const elId = `trusted-collapse-${group.id}`;
                                  const el = document.getElementById(elId);
                                  if (el)
                                    el.style.display =
                                      el.style.display === "none"
                                        ? "block"
                                        : "none";
                                }}
                              >
                                <FaShieldAlt />
                                <span>
                                  Productos confiables ({trustedItems.length})
                                </span>
                                <FaArrowRight className="aud-collapse-arrow" />
                              </button>
                              <div
                                id={`trusted-collapse-${group.id}`}
                                style={{ display: "none", marginTop: "8px" }}
                              >
                                <div className="aud-items-list compact">
                                  {trustedItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className={`aud-item-card trusted ${item.is_sub ? "sub" : ""}`}
                                      style={{ opacity: 0.8 }}
                                    >
                                      {/* COLUMNA 1: IMAGEN */}
                                      <div className="aud-item-img-col">
                                        <div className="aud-item-img small">
                                          {item.image ? (
                                            <img src={item.image} alt="" />
                                          ) : (
                                            <FaBoxOpen className="aud-item-placeholder" />
                                          )}
                                        </div>
                                      </div>

                                      {/* COLUMNA 2: INFO CENTRAL */}
                                      <div className="aud-item-info">
                                        <div
                                          className="aud-item-name"
                                          style={{ fontSize: "0.95rem" }}
                                        >
                                          {item.name}
                                        </div>
                                      </div>

                                      {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                      <div className="aud-item-action-col">
                                        {(() => {
                                          const uom = item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "";
                                          const isPack =
                                            uom.startsWith("P") &&
                                            !isNaN(uom.substring(1));
                                          const packQty = isPack
                                            ? parseInt(uom.substring(1)) || 0
                                            : 0;
                                          return isPack ? (
                                            <div
                                              style={{
                                                background: "#9333ea",
                                                color: "white",
                                                padding: "3px 6px",
                                                borderRadius: "6px",
                                                fontWeight: "900",
                                                fontSize: "0.65rem",
                                                textAlign: "center",
                                                marginBottom: "3px",
                                              }}
                                            >
                                              📦 x{packQty}
                                            </div>
                                          ) : null;
                                        })()}
                                        <div
                                          className="aud-massive-qty-badge"
                                          style={{
                                            padding: "4px 12px",
                                            background: "#cbd5e1",
                                            color: "#334155",
                                          }}
                                        >
                                          <span
                                            className="aud-massive-qty-num"
                                            style={{ fontSize: "1.2rem" }}
                                          >
                                            {item.count}
                                          </span>
                                          <span
                                            className="aud-massive-qty-unit"
                                            style={{ fontSize: "0.7rem" }}
                                          >
                                            {item.unidad_medida
                                              ? item.unidad_medida.toUpperCase()
                                              : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ─── TABS: HISTORIAL (moved below) ─── */}
                <div className="aud-section">
                  <button
                    className="aud-section-header timeline collapsible"
                    onClick={() =>
                      setActiveTab(
                        activeTab === "timeline" ? "inventory" : "timeline",
                      )
                    }
                  >
                    <FaHistory />
                    <span>Historial de picking</span>
                    <FaArrowRight
                      className={`aud-collapse-arrow ${activeTab === "timeline" ? "open" : ""}`}
                    />
                  </button>
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

                {/* ─── FAB: FLOATING APPROVE BUTTON ─── */}
                <div className="aud-fab-container">
                  {auditData.meta.status === "auditado" ? (
                    <button className="aud-fab-btn done" onClick={clearAudit}>
                      🏠 Volver al Inicio
                    </button>
                  ) : (
                    <button
                      className={`aud-fab-btn ${allDone ? "ready" : "disabled"}`}
                      onClick={handleFinishAudit}
                      disabled={!allDone || loading}
                    >
                      {loading ? (
                        <FaSpinner className="ec-spin" />
                      ) : (
                        <FaCheck />
                      )}{" "}
                      {loading
                        ? "APROBANDO..."
                        : allDone
                          ? "APROBAR SALIDA"
                          : `Faltan ${pendingItems.length} por verificar`}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
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
