import React, { useState, useMemo } from "react";
import axios from "axios";
import QRCode from "react-qr-code";
import { AnimatePresence } from "framer-motion";
import {
  FaCheck,
  FaArrowRight,
  FaShoppingBasket,
  FaWifi,
  FaExclamationTriangle,
  FaSync,
  FaPhone,
  FaCheckCircle,
  FaLock,
  FaSpinner,
} from "react-icons/fa";

// Componentes y Constantes
import "./VistaPicker.css";
import EscanerBarras from "../../DesarrolloSurtido_API/EscanerBarras";
import { WeightModal, SubstituteModal, ManualEntryModal, ClientsModal } from "./Modals";
import { ProductCard } from "./components/ProductCard";
import { SessionTimer } from "./components/SessionTimer";
import { getOrderStyle } from "./utils/pickerConstants";

// Hooks (El Cerebro)
import { useOfflineQueue } from "./hooks/useOfflineQueue";
import { usePickerSession } from "./hooks/usePickerSession";

const VistaPicker = () => {
  // 1. Cargamos el cerebro (Lógica central y BD)
  const {
    loading,
    sessionData,
    showSuccessQR,
    completedSessionId,
    resetSesionLocal,
    updateLocalSessionState,
    handleFinish
  } = usePickerSession();

  // 2. Cargamos el manejador Offline (Cola de acciones)
  const { isOnline, pendingSync, queueAction } = useOfflineQueue(resetSesionLocal);

  // 3. Estados puramente visuales (UI)
  const [activeZone, setActiveZone] = useState("pendientes");
  const [isScanning, setIsScanning] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  
  // Estados de Modales
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [scanOverrideCallback, setScanOverrideCallback] = useState(null);
  const [missingQtyForSub, setMissingQtyForSub] = useState(0);
  const [lastScannedBarcode, setLastScannedBarcode] = useState(null);

  // --- LÓGICA DE INTERACCIÓN (Botones y Acciones) ---

  const isWeighable = (item) => {
    const txt = (item.name + " " + (item.categorias?.[0]?.name || "")).toLowerCase();
    const isUnitPesable = item.unidad_medida && ['kl', 'kg', 'kilo', 'lb', 'libra'].includes(item.unidad_medida.toLowerCase());
    return isUnitPesable || txt.includes("kg") || txt.includes("gramos") || txt.includes("fruver") || txt.includes("carniceria");
  };

  const handleCardAction = (item, type) => {
    setCurrentItem(item);
    if (type === "scan") {
      if (isWeighable(item)) setShowWeightModal(true); else setIsScanning(true);
    } else if (type === "manual") setShowManualModal(true);
    else if (type === "substitute") {
      setMissingQtyForSub(item.quantity_total - (item.qty_scanned || 0));
      setShowSubModal(true);
    } else if (type === "undo") handleUndo(item);
    else if (type === "short_pick") handleShortPick(item);
  };

  const handleShortPick = async (item) => {
    const scanned = item.qty_scanned || 0;
    const total = item.quantity_total;
    const missing = total - scanned;
    if (missing <= 0) return;
    
    if (window.confirm(`⚠️ FALTAN ${missing} UNIDADES.\n\n[ACEPTAR] = Buscar un SUSTITUTO.\n[CANCELAR] = Enviar INCOMPLETO.`)) {
      setMissingQtyForSub(missing);
      setShowSubModal(true);
    } else {
      queueAction({
        id_sesion: sessionData.session_id, id_producto_original: item.product_id, nombre_producto_original: item.name,
        accion: "no_encontrado", cantidad_afectada: missing, motivo: "Stock Insuficiente", pasillo: item.pasillo,
      });
      updateLocalSessionState(item.product_id, scanned, "recolectado");
    }
  };

  const handleUndo = async (item) => {
    queueAction({ id_sesion: sessionData.session_id, id_producto_original: item.product_id, accion: "reset", cantidad_afectada: 1, pasillo: item.pasillo });
    updateLocalSessionState(item.product_id, 0, "pendiente", null);
  };

  const confirmPicking = async (peso = null) => {
    if (!currentItem) return;
    const itemRef = currentItem;
    const currentScanned = (itemRef.qty_scanned || 0) + 1;
    const isFinished = currentScanned >= itemRef.quantity_total;
    
    queueAction({
      id_sesion: sessionData.session_id, id_producto_original: itemRef.product_id, nombre_producto_original: itemRef.name,
      accion: "recolectado", peso_real: peso, pasillo: itemRef.pasillo, codigo_barras_escaneado: lastScannedBarcode,
    });

    if (isFinished) {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      closeAllModals();
      setCurrentItem(null);
    } else {
      if (navigator.vibrate) navigator.vibrate(100);
      setCurrentItem((prev) => prev ? { ...prev, qty_scanned: currentScanned } : null);
    }
    updateLocalSessionState(itemRef.product_id, currentScanned, isFinished ? "recolectado" : "pendiente");
  };

  const confirmSubstitution = (newItem, qty) => {
    queueAction({
      id_sesion: sessionData.session_id, id_producto_original: currentItem.product_id, nombre_producto_original: currentItem.name,
      accion: "sustituido", datos_sustituto: { id: newItem.id, name: newItem.name, price: newItem.price },
      cantidad_afectada: qty || 1, pasillo: currentItem.pasillo, codigo_barras_escaneado: newItem.barcode || newItem.sku, 
    });
    updateLocalSessionState(currentItem.product_id, currentItem.qty_scanned || 0, "sustituido", { name: newItem.name, price: newItem.price });
    closeAllModals();
    alert("🔄 Sustitución registrada");
  };

  const handleManualValidation = async (inputCode) => {
    if (!isOnline) {
      if (window.confirm("⚠️ Estás Offline. ¿Forzar?")) {
        setLastScannedBarcode(null); setShowManualModal(false);
        if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking();
      }
      return;
    }
    if (!currentItem) return;
    try {
      const res = await axios.post("https://backend-woocommerce.vercel.app/api/orders/validar-codigo", { input_code: inputCode, expected_sku: currentItem.sku });
      if (res.data.valid) {
        setLastScannedBarcode(null); setShowManualModal(false);
        if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking();
      } else alert("❌ Código incorrecto.");
    } catch (e) { alert("Error de conexión"); }
  };
  
  const handleScanMatch = (code) => {
    if (scanOverrideCallback) { scanOverrideCallback(code); setScanOverrideCallback(null); setIsScanning(false); return; }
    if (!currentItem) return;
    const c = code.trim().toUpperCase();
    const sku = (currentItem.sku || "").trim().toUpperCase();
    const ean = (currentItem.barcode || "").trim().toUpperCase();
    
    if (c === sku || c === ean || (ean && ean.endsWith(c))) {
      setLastScannedBarcode(c);
      confirmPicking();
    } else {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      alert(`Código ${c} no coincide.`);
    }
  };

  const closeAllModals = () => {
    setIsScanning(false); setShowWeightModal(false); setShowManualModal(false); setShowSubModal(false); setCurrentItem(null); setScanOverrideCallback(null);
  };

  // --- VARIABLES DERIVADAS PARA RENDERIZAR ---
  const orderIndexMap = useMemo(() => {
    if (!sessionData) return {};
    const map = {};
    sessionData.orders_info.forEach((ord, idx) => map[ord.id] = idx);
    return map;
  }, [sessionData]);

  const pendingItems = sessionData?.items.filter((i) => i.status === "pendiente") || [];
  const doneItems = sessionData?.items.filter((i) => i.status !== "pendiente") || [];
  const currentList = activeZone === "pendientes" ? pendingItems : doneItems;
  
  // --- RENDERIZADO CONDICIONAL ---
  if (loading) return (<div className="ec-picker-centered"><div className="ec-spinner"></div><p>Conectando...</p></div>);
    
  if (showSuccessQR && completedSessionId) {
    return (
      <div className="ec-picker-centered" style={{ background: "#10b981", color: "white" }}>
        <FaCheckCircle size={60} style={{ marginBottom: 20 }} />
        <h2>¡Ruta Finalizada!</h2>
        <p>Muestra este código al auditor.</p>
        <div style={{ background: "white", padding: 20, borderRadius: 16, margin: "30px 0", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
          <QRCode value={completedSessionId} size={220} />
        </div>
        <p style={{ fontSize: "0.9rem", fontWeight: "bold", fontFamily: "monospace", background: "rgba(0,0,0,0.1)", padding: "5px 10px", borderRadius: 8 }}>
          ID: {completedSessionId.slice(0, 8)}
        </p>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.1rem", fontWeight: "bold" }}>
            <FaLock /> <span>Bloqueado por seguridad</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", opacity: 0.9 }}>
            <FaSpinner className="ec-spin" /> Esperando aprobación de salida...
          </div>
        </div>
      </div>
    );
  }
  
  if (!sessionData) return (
      <div className="ec-picker-centered">
        <FaShoppingBasket size={50} color="#cbd5e1" style={{ marginBottom: 20 }} />
        <h3>Sin asignación</h3>
        <button onClick={() => window.location.reload()} className="ec-scan-btn" style={{ width: "auto", padding: "10px 30px" }}>Actualizar</button>
      </div>
    );

  // --- RENDERIZADO PRINCIPAL ---
  return (
    <div className="ec-picker-main-layout">
      {/* STATUS BAR */}
      <div className={`ec-status-bar ${isOnline ? "online" : "offline"}`}>
        {isOnline ? (
          <span>{pendingSync > 0 ? <><FaSync className="ec-spin" /> Subiendo...</> : <><FaWifi /> Conectado</>}</span>
        ) : (
          <span><FaExclamationTriangle /> Offline ({pendingSync})</span>
        )}
      </div>

      {/* HEADER */}
      <header className="ec-picker-sticky-header">
        <div className="ec-header-top">
          <div className="ec-order-info">
            <span className="ec-label-sm">Ruta Activa</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="ec-order-id">#{sessionData.session_id.slice(0, 6)}</span>
              <SessionTimer startDate={sessionData.fecha_inicio} />
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <button className="ec-contacts-btn" onClick={() => setShowClientsModal(true)}><FaPhone /> Clientes</button>
            <div style={{ fontWeight: "bold", marginTop: 5 }}>
              {doneItems.length} / {sessionData.items.length} Items
            </div>
          </div>
        </div>
        
        <div className="ec-orders-legend">
          {sessionData.orders_info.map((ord, idx) => {
            const style = getOrderStyle(idx);
            return (
              <div key={ord.id} className="ec-legend-item">
                <div className="ec-legend-dot" style={{ background: style.color }}></div>
                <span style={{ color: style.color, fontWeight: 900 }}>{style.code}:</span>
                <span>{ord.customer.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
        
        <div className="ec-zones-tabs">
          <div className={`ec-zone-tab ${activeZone === "pendientes" ? "active" : ""}`} onClick={() => setActiveZone("pendientes")}>
            Pendientes ({pendingItems.length})
          </div>
          <div className={`ec-zone-tab ${activeZone === "canasta" ? "active" : ""}`} onClick={() => setActiveZone("canasta")}>
            En Canasta ({doneItems.length})
          </div>
        </div>
      </header>

      {/* LISTA PRODUCTOS */}
      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="popLayout">
          {currentList.length > 0 ? (
            currentList.map((item) => (
              <ProductCard key={item.product_id} item={item} orderMap={orderIndexMap} isCompleted={activeZone === "canasta"} onAction={handleCardAction} />
            ))
          ) : (
            <div className="ec-empty-state">
              <p>{activeZone === "pendientes" ? "¡Ruta Completada! 🎉" : "Tu canasta está vacía."}</p>
            </div>
          )}
        </AnimatePresence>
        <div className="ec-spacer"></div>
      </div>

      {/* FINISH BUTTON */}
      {pendingItems.length === 0 && (
        <div className="ec-fab-container">
          <button className="ec-fab-finish" onClick={() => handleFinish(pendingSync)}>
            <div className="ec-fab-content">
              <FaCheck size={24} /><span>TERMINAR RUTA</span>
            </div>
            <div className="ec-fab-arrow"><FaArrowRight /></div>
          </button>
        </div>
      )}

      {/* MODALS COMPARTIDOS */}
      <EscanerBarras isScanning={isScanning} setIsScanning={setIsScanning} onScan={handleScanMatch} />
      <ManualEntryModal isOpen={showManualModal} onClose={() => setShowManualModal(false)} onConfirm={handleManualValidation} />
      <WeightModal isOpen={showWeightModal} item={currentItem} onClose={() => { setShowWeightModal(false); setCurrentItem(null); }} onConfirm={confirmPicking} />
      <SubstituteModal isOpen={showSubModal} originalItem={currentItem} missingQty={missingQtyForSub} onClose={() => { setShowSubModal(false); setCurrentItem(null); }} onConfirmSubstitute={confirmSubstitution} onRequestScan={(cb) => { setScanOverrideCallback(() => cb); setIsScanning(true); }} />
      <ClientsModal isOpen={showClientsModal} orders={sessionData.orders_info} onClose={() => setShowClientsModal(false)} />
    </div>
  );
};

export default VistaPicker;