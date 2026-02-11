import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { supabase } from "../../supabaseClient"; 
import QRCode from "react-qr-code"; 
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCheck,
  FaBoxOpen,
  FaArrowRight,
  FaShoppingBasket,
  FaBarcode,
  FaExchangeAlt,
  FaKeyboard,
  FaWifi,
  FaExclamationTriangle,
  FaSync,
  FaUndo,
  FaPhone,
  FaClock,
  FaCheckCircle,
  FaBan,
  FaSpinner, // Icono de carga
  FaLock // Icono de candado
} from "react-icons/fa";
import "./VistaPicker.css";
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras";
import {
  WeightModal,
  SubstituteModal,
  ManualEntryModal,
  ClientsModal,
} from "./Modals";

const ORDER_COLORS = [
  { code: "A", color: "#3b82f6", bg: "#eff6ff" },
  { code: "B", color: "#f97316", bg: "#fff7ed" },
  { code: "C", color: "#8b5cf6", bg: "#f5f3ff" },
  { code: "D", color: "#10b981", bg: "#ecfdf5" },
  { code: "E", color: "#ec4899", bg: "#fdf2f8" },
];

const getOrderStyle = (orderIndex) =>
  ORDER_COLORS[orderIndex % ORDER_COLORS.length];

const SessionTimer = ({ startDate }) => {
  const [elapsed, setElapsed] = useState("00:00");
  useEffect(() => {
    if (!startDate) return;
    const interval = setInterval(() => {
      const start = new Date(startDate).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      if (diff < 0) return;
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      const hours = Math.floor(diff / (1000 * 60 * 60));
      setElapsed(`${hours > 0 ? hours + ":" : ""}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startDate]);
  return <div className="ec-timer-badge"><FaClock /> {elapsed}</div>;
};

const ProductCard = ({ item, orderMap, onAction, isCompleted }) => {
  const scanned = item.qty_scanned || 0;
  const total = item.quantity_total;
  const remaining = total - scanned;
  const isPartial = scanned > 0 && scanned < total;
  const isSubstituted = item.status === "sustituido" && item.sustituto;
  const isShortPick = isCompleted && scanned < total && item.status !== "sustituido";
  const formatPrice = (p) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(p);

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      className={`ec-product-card ${isCompleted ? "completed" : ""} ${isPartial ? "partial-scan" : ""} ${isSubstituted ? "sustituido-card" : ""} ${isShortPick ? "short-pick-mode" : ""}`}
    >
      <div className="ec-img-wrapper">
        {item.image_src ? <img src={item.image_src} className="ec-prod-img" alt="" /> : <FaBoxOpen color="#ccc" size={30} />}
        <span className="ec-qty-badge-img">{total}</span>
      </div>
      <div className="ec-info-col">
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start", marginBottom: "2px" }}>
          <span className="ec-pasillo-badge" style={{ background: "#2563eb", color: "white", padding: "4px 10px", fontSize: "0.8rem", boxShadow: "0 2px 4px rgba(37,99,235,0.3)" }}>
            {item.pasillo === "S/N" || item.pasillo === "Otros" ? "GENERAL" : `PASILLO ${item.pasillo}`}
          </span>
          {(item.categorias_reales || (item.categorias && item.categorias.length > 0)) && (
            <span style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {(item.categorias_reales || item.categorias.map((c) => c.name)).slice(0, 3).join(" • ")}
            </span>
          )}
        </div>
        {isSubstituted ? (
          <div className="ec-sub-details">
            <div className="ec-original-row"><span className="ec-label-tiny">PIDIÓ:</span><span className="ec-text-crossed">{item.name}</span></div>
            <div className="ec-arrow-down"><FaArrowRight style={{ transform: "rotate(90deg)", fontSize: "0.8rem", color: "#f59e0b" }} /></div>
            <div className="ec-final-row"><span className="ec-label-tiny">LLEVAS:</span><span className="ec-text-final">{item.sustituto.name}</span><span className="ec-price-final">{formatPrice(item.sustituto.price)}</span></div>
          </div>
        ) : (
          <>
            <h4 className="ec-prod-name">{item.name}</h4>
            <div className="ec-price-tag">{item.price > 0 ? formatPrice(item.price) : ""}</div>
            {isShortPick && (
                <div className="short-pick-alert">
                    <FaExclamationTriangle /> Se encontraron solo {scanned} de {total}
                </div>
            )}
          </>
        )}
        <div className="ec-req-list">
          {item.pedidos_involucrados.map((ped, idx) => {
            const orderIdx = orderMap[ped.id_pedido] || 0;
            const style = getOrderStyle(orderIdx);
            return (
              <div key={idx} className="ec-req-badge" style={{ borderLeftColor: style.color }}>
                <span className="ec-req-letter" style={{ color: style.color }}>{style.code}</span>
                <span className="ec-req-qty">{ped.cantidad} un.</span>
                <span className="ec-req-name">{ped.nombre_cliente.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!isCompleted ? (
        <div className="ec-action-col">
          <button className={`ec-scan-btn ${isPartial ? "active-partial" : ""}`} onClick={() => onAction(item, "scan")}>
            {isPartial ? (
              <div className="ec-scan-progress"><span className="ec-scan-prog-nums">{scanned}/{total}</span><span className="ec-scan-prog-label">FALTAN {remaining}</span></div>
            ) : (
              <><FaBarcode /><span className="ec-scan-label">SCAN</span></>
            )}
          </button>
          
          {isPartial && (
              <button className="ec-short-btn" onClick={() => onAction(item, "short_pick")} title="Faltan Unidades">
                  <FaBan />
              </button>
          )}

          <div style={{ display: "flex", gap: 5 }}>
            <button className="ec-alt-btn" onClick={() => onAction(item, "manual")} title="Teclado"><FaKeyboard size={14} /></button>
            <button className="ec-alt-btn warning" onClick={() => onAction(item, "substitute")} title="Sustituir Total"><FaExchangeAlt size={14} /></button>
          </div>
        </div>
      ) : (
        <div className="ec-action-col">
          <button className="ec-alt-btn" style={{ color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2" }} onClick={() => { if (window.confirm("¿Devolver a pendientes?")) onAction(item, "undo"); }} title="Devolver a pendientes"><FaUndo /></button>
          <div style={{ marginTop: 5, color: isSubstituted ? "#d97706" : isShortPick ? "#ef4444" : "#16a34a" }}>
              {isSubstituted ? <FaExchangeAlt /> : isShortPick ? <FaExclamationTriangle /> : <FaCheck />}
          </div>
        </div>
      )}
    </motion.div>
  );
};

const VistaPicker = () => {
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null);
  const [pickerInfo, setPickerInfo] = useState(null);
  const [activeZone, setActiveZone] = useState("pendientes");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [showSuccessQR, setShowSuccessQR] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState(null);

  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [scanOverrideCallback, setScanOverrideCallback] = useState(null);
  const [missingQtyForSub, setMissingQtyForSub] = useState(0);

  const resetSesionLocal = () => {
    localStorage.removeItem("session_active_cache");
    localStorage.removeItem("offline_actions_queue");
    localStorage.removeItem("waiting_for_audit_id");
    setPendingSync(0);
  };

  const refreshSessionData = useCallback(async (idPicker) => {
    if (!idPicker) return;
    try {
      const { data: session } = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${idPicker}`,
      );
      setSessionData(session);
      localStorage.setItem("session_active_cache", JSON.stringify(session));
    } catch (err) {
      if (err.response && err.response.status === 404) {
        resetSesionLocal();
        setSessionData(null);
        setShowSuccessQR(false); 
        setCompletedSessionId(null);
      } else {
        const cached = localStorage.getItem("session_active_cache");
        if(cached) setSessionData(JSON.parse(cached));
      }
    }
  }, []);

  // CONFIGURAR LISTENER REALTIME Y POLLING
  useEffect(() => {
    let channel = null;
    let pollingInterval = null;

    const setupListener = (sid) => {
        // Realtime Supabase
        channel = supabase.channel(`live-session-${sid}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wc_picking_sessions', filter: `id=eq.${sid}` }, 
                async (payload) => {
                    const newState = payload.new.estado;
                    // LIBERACIÓN AUTOMÁTICA
                    if (newState === 'auditado' || newState === 'finalizado') {
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                        resetSesionLocal();
                        window.location.reload();
                    }
                    if (newState === 'cancelado') {
                        alert("⛔ Ruta CANCELADA.");
                        resetSesionLocal();
                        window.location.reload();
                    }
                }
            ).subscribe();

        // Polling de respaldo (cada 4s) por si falla el socket
        pollingInterval = setInterval(async () => {
            try {
                const { data } = await supabase.from("wc_picking_sessions").select("estado").eq("id", sid).single();
                if (data && (data.estado === 'auditado' || data.estado === 'finalizado')) {
                    resetSesionLocal();
                    window.location.reload();
                }
            } catch (e) {}
        }, 4000);
    };

    if (sessionData?.session_id) setupListener(sessionData.session_id);
    else if (completedSessionId) setupListener(completedSessionId);

    return () => {
        if (channel) supabase.removeChannel(channel);
        if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [sessionData?.session_id, completedSessionId]);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        let email = localStorage.getItem("correo_empleado") || localStorage.getItem("picker_email") || "juan@test.com";
        let me = null;
        try {
          const { data: pickers } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pickers?email=${email}`);
          if (pickers && pickers.length > 0) {
            me = pickers[0];
            localStorage.setItem("picker_info_cache", JSON.stringify(me));
          }
        } catch (err) { me = JSON.parse(localStorage.getItem("picker_info_cache")); }
        
        if (!me) { alert("Usuario no encontrado."); setLoading(false); return; }
        setPickerInfo(me);

        // Si hay una sesión pendiente de auditoría, bloquear aquí
        const savedCompletedId = localStorage.getItem("waiting_for_audit_id");
        if (savedCompletedId) {
            setCompletedSessionId(savedCompletedId);
            setShowSuccessQR(true);
            setLoading(false);
            return; 
        }
        await refreshSessionData(me.id);
      } catch (e) { console.error("Error init:", e); } 
      finally { setLoading(false); }
    };
    init();
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [refreshSessionData]);

  const queueAction = (payload) => {
    const queue = JSON.parse(localStorage.getItem("offline_actions_queue") || "[]");
    queue.push(payload);
    localStorage.setItem("offline_actions_queue", JSON.stringify(queue));
    setPendingSync(queue.length);
  };

  const orderIndexMap = useMemo(() => {
    if (!sessionData) return {};
    const map = {};
    sessionData.orders_info.forEach((ord, idx) => { map[ord.id] = idx; });
    return map;
  }, [sessionData]);

  const handleCardAction = (item, type) => {
    setCurrentItem(item);
    if (type === "scan") {
      if (isWeighable(item)) setShowWeightModal(true);
      else setIsScanning(true);
    } else if (type === "manual") setShowManualModal(true);
    else if (type === "substitute") {
        setMissingQtyForSub(item.quantity_total - (item.qty_scanned || 0)); 
        setShowSubModal(true);
    }
    else if (type === "undo") handleUndo(item);
    else if (type === "short_pick") handleShortPick(item);
  };

  const isWeighable = (item) => {
    const txt = (item.name + " " + (item.categorias?.[0]?.name || "")).toLowerCase();
    return (txt.includes("kg") || txt.includes("gramos") || txt.includes("fruver") || txt.includes("carniceria"));
  };

  const handleShortPick = async (item) => {
      const scanned = item.qty_scanned || 0;
      const total = item.quantity_total;
      const missing = total - scanned;
      if(missing <= 0) return;

      const choice = window.confirm(
          `⚠️ FALTAN ${missing} UNIDADES.\n\n` + 
          `[ACEPTAR] = Buscar un SUSTITUTO para lo que falta.\n` + 
          `[CANCELAR] = Enviar INCOMPLETO (cobrar solo ${scanned}).`
      );

      if (choice) {
          setMissingQtyForSub(missing);
          setShowSubModal(true);
      } else {
          queueAction({
              id_sesion: sessionData.session_id,
              id_producto_original: item.product_id,
              nombre_producto_original: item.name,
              accion: "no_encontrado", 
              cantidad_afectada: missing, 
              motivo: "Stock Insuficiente"
          });
          updateLocalSessionState(item.product_id, scanned, "recolectado");
      }
  };

  const handleUndo = async (item) => {
    try {
      queueAction({ id_sesion: sessionData.session_id, id_producto_original: item.product_id, accion: "reset" });
      updateLocalSessionState(item.product_id, 0, "pendiente", null);
    } catch (e) { alert("Error al deshacer"); }
  };

  const confirmPicking = async (peso = null) => {
    if (!currentItem) return;
    try {
      const currentScanned = (currentItem.qty_scanned || 0) + 1;
      const targetQty = currentItem.quantity_total;
      const isFinished = currentScanned >= targetQty;
      const payload = { id_sesion: sessionData.session_id, id_producto_original: currentItem.product_id, nombre_producto_original: currentItem.name, accion: "recolectado", peso_real: peso };
      if(isFinished) queueAction(payload); 
      else queueAction(payload);

      if (isFinished) { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); closeAllModals(); } 
      else { if (navigator.vibrate) navigator.vibrate(100); }
      
      updateLocalSessionState(currentItem.product_id, currentScanned, isFinished ? "recolectado" : "pendiente");
      if (!isFinished) setCurrentItem((prev) => ({ ...prev, qty_scanned: currentScanned }));
      else setCurrentItem(null);
    } catch (e) { closeAllModals(); }
  };

  const confirmSubstitution = (newItem, qty) => {
    queueAction({
      id_sesion: sessionData.session_id,
      id_producto_original: currentItem.product_id,
      nombre_producto_original: currentItem.name,
      accion: "sustituido",
      datos_sustituto: { id: newItem.id, name: newItem.name, price: newItem.price },
      cantidad_afectada: qty || 1
    });
    
    updateLocalSessionState(currentItem.product_id, currentItem.quantity_total, "sustituido", { name: newItem.name, price: newItem.price });
    closeAllModals();
    alert("🔄 Sustitución registrada");
  };

  const updateLocalSessionState = (prodId, qty, status, sustituto = null) => {
    if (!sessionData) return;
    const newItems = sessionData.items.map((i) => {
      if (i.product_id === prodId) return { ...i, qty_scanned: qty, status: status, sustituto: sustituto || i.sustituto };
      return i;
    });
    const newSessionData = { ...sessionData, items: newItems };
    setSessionData(newSessionData);
    localStorage.setItem("session_active_cache", JSON.stringify(newSessionData));
  };

  const handleManualValidation = async (inputCode) => {
    if (!isOnline) {
      if (window.confirm("⚠️ Estás Offline. Validación local deshabilitada. ¿Forzar recolección?")) {
        setShowManualModal(false);
        if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking();
        return;
      }
      return;
    }
    if (!currentItem) return;
    try {
      const res = await axios.post("https://backend-woocommerce.vercel.app/api/orders/validar-codigo", { input_code: inputCode, expected_sku: currentItem.sku });
      if (res.data.valid) { setShowManualModal(false); if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking(); } 
      else { alert("❌ Código incorrecto."); }
    } catch (e) { alert("Error de conexión"); }
  };

  const handleScanMatch = (code) => {
    if (scanOverrideCallback) {
        scanOverrideCallback(code);
        setScanOverrideCallback(null);
        setIsScanning(false);
        return;
    }
    if (!currentItem) return;
    const c = code.trim().toUpperCase();
    const sku = (currentItem.sku || "").trim().toUpperCase();
    const ean = (currentItem.barcode || "").trim().toUpperCase();
    if (c === sku || c === ean || (ean && ean.endsWith(c))) confirmPicking();
    else {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      alert(`Código ${c} no coincide.`);
    }
  };

  const handleRequestScan = (callback) => {
      setScanOverrideCallback(() => callback);
      setIsScanning(true);
  };

  const handleFinish = async () => {
    if (pendingSync > 0) { alert(`⚠️ Tienes ${pendingSync} acciones pendientes.`); return; }
    if (!window.confirm("¿Finalizar sesión completa?")) return;
    
    const finalId = sessionData.session_id;
    localStorage.setItem("waiting_for_audit_id", finalId);
    setCompletedSessionId(finalId);

    try {
      // Notificamos al backend que se "cerró" el picking, pero el estado sigue en espera de auditoría
      // Opcional: podrías tener un estado 'esperando_auditoria' en DB, pero con 'en_proceso' y el flag local basta.
      // El cambio real de estado lo hace el auditor.
      
      setSessionData(null); 
      setShowSuccessQR(true);
    } catch (e) { alert("Error al finalizar."); }
  };

  const closeAllModals = () => {
    setIsScanning(false);
    setShowWeightModal(false);
    setShowManualModal(false);
    setShowSubModal(false);
    setCurrentItem(null);
    setScanOverrideCallback(null);
  };

  const pendingItems = sessionData?.items.filter((i) => i.status === "pendiente") || [];
  const doneItems = sessionData?.items.filter((i) => i.status !== "pendiente") || [];
  const currentList = activeZone === "pendientes" ? pendingItems : doneItems;

  if (loading) return <div className="ec-picker-centered"><div className="ec-spinner"></div><p>Conectando...</p></div>;

  // ✅ PANTALLA DE BLOQUEO CON QR (SIN BOTÓN DE SALIDA)
  if (showSuccessQR && completedSessionId) {
      return (
          <div className="ec-picker-centered" style={{background: '#10b981', color:'white'}}>
              <FaCheckCircle size={60} style={{marginBottom:20}} />
              <h2>¡Ruta Finalizada!</h2>
              <p>Muestra este código al auditor.</p>
              
              <div style={{background:'white', padding:20, borderRadius:16, margin:'30px 0', boxShadow: '0 10px 25px rgba(0,0,0,0.2)'}}>
                  <QRCode value={completedSessionId} size={220} />
              </div>
              <p style={{fontSize:'0.9rem', fontWeight:'bold', fontFamily:'monospace', background:'rgba(0,0,0,0.1)', padding:'5px 10px', borderRadius:8}}>
                  ID: {completedSessionId.slice(0,8)}
              </p>

              <div style={{marginTop:40, display:'flex', flexDirection:'column', alignItems:'center', gap:10}}>
                  <div style={{display:'flex', alignItems:'center', gap:10, fontSize:'1.1rem', fontWeight:'bold'}}>
                      <FaLock />
                      <span>Bloqueado por seguridad</span>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:8, fontSize:'0.9rem', opacity:0.9}}>
                      <FaSpinner className="ec-spin" />
                      Esperando aprobación de salida...
                  </div>
              </div>
          </div>
      );
  }

  if (!sessionData) return <div className="ec-picker-centered"><FaShoppingBasket size={50} color="#cbd5e1" style={{ marginBottom: 20 }} /><h3>Sin asignación</h3><button onClick={() => window.location.reload()} className="ec-scan-btn" style={{width:"auto", padding:"10px 30px"}}>Actualizar</button></div>;

  return (
    <div className="ec-picker-main-layout">
      <div className={`ec-status-bar ${isOnline ? "online" : "offline"}`}>
        {isOnline ? <span>{pendingSync > 0 ? <><FaSync className="ec-spin"/> Subiendo...</> : <><FaWifi/> Conectado</>}</span> : <span><FaExclamationTriangle/> Offline ({pendingSync})</span>}
      </div>
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
            <div style={{ fontWeight: "bold", marginTop: 5 }}>{doneItems.length} / {sessionData.items.length} Items</div>
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
          <div className={`ec-zone-tab ${activeZone === "pendientes" ? "active" : ""}`} onClick={() => setActiveZone("pendientes")}>Pendientes ({pendingItems.length})</div>
          <div className={`ec-zone-tab ${activeZone === "canasta" ? "active" : ""}`} onClick={() => setActiveZone("canasta")}>En Canasta ({doneItems.length})</div>
        </div>
      </header>

      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="popLayout">
          {currentList.length > 0 ? (
            currentList.map((item) => (
              <ProductCard key={item.product_id} item={item} orderMap={orderIndexMap} isCompleted={activeZone === "canasta"} onAction={handleCardAction} />
            ))
          ) : (
            <div className="ec-empty-state"><p>{activeZone === "pendientes" ? "¡Ruta Completada! 🎉" : "Tu canasta está vacía."}</p></div>
          )}
        </AnimatePresence>
        <div className="ec-spacer"></div>
      </div>

      {pendingItems.length === 0 && (
        <div className="ec-fab-container">
          <button className="ec-fab-finish" onClick={handleFinish}>
            <div className="ec-fab-content"><FaCheck size={24} /><span>TERMINAR RUTA</span></div>
            <div className="ec-fab-arrow"><FaArrowRight /></div>
          </button>
        </div>
      )}

      <EscanerBarras isScanning={isScanning} setIsScanning={setIsScanning} onScan={handleScanMatch} />
      
      <ManualEntryModal isOpen={showManualModal} onClose={() => setShowManualModal(false)} onConfirm={handleManualValidation} />
      
      <WeightModal isOpen={showWeightModal} item={currentItem} onClose={() => { setShowWeightModal(false); setCurrentItem(null); }} onConfirm={confirmPicking} />
      
      <SubstituteModal 
        isOpen={showSubModal} 
        originalItem={currentItem} 
        missingQty={missingQtyForSub}
        onClose={() => { setShowSubModal(false); setCurrentItem(null); }} 
        onConfirmSubstitute={confirmSubstitution} 
        onRequestScan={handleRequestScan} 
      />
      
      <ClientsModal isOpen={showClientsModal} orders={sessionData.orders_info} onClose={() => setShowClientsModal(false)} />
    </div>
  );
};

export default VistaPicker;