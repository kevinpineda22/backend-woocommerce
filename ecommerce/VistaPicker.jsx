import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCheck, FaBoxOpen, FaArrowRight, FaShoppingBasket, FaBarcode, 
  FaExchangeAlt, FaKeyboard, FaWifi, FaExclamationTriangle, FaSync,
  FaUndo, FaPhone, FaClock
} from "react-icons/fa";
import "./VistaPicker.css";
// REVISA LA RUTA DE TU ESCANER
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras"; 
import { WeightModal, SubstituteModal, ManualEntryModal, ClientsModal } from "./Modals";

const ORDER_COLORS = [
    { code: 'A', color: '#3b82f6', bg: '#eff6ff' },
    { code: 'B', color: '#f97316', bg: '#fff7ed' },
    { code: 'C', color: '#8b5cf6', bg: '#f5f3ff' },
    { code: 'D', color: '#10b981', bg: '#ecfdf5' },
    { code: 'E', color: '#ec4899', bg: '#fdf2f8' },
];

const getOrderStyle = (orderIndex) => ORDER_COLORS[orderIndex % ORDER_COLORS.length];

// --- CRONÓMETRO SIMPLE ---
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
            const hours = Math.floor((diff / (1000 * 60 * 60)));

            setElapsed(
                `${hours > 0 ? hours + ':' : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        }, 1000);
        return () => clearInterval(interval);
    }, [startDate]);

    return (
        <div className="ec-timer-badge">
            <FaClock /> {elapsed}
        </div>
    );
};

const ProductCard = ({ item, orderMap, onAction, isCompleted }) => {
  const scanned = item.qty_scanned || 0;
  const total = item.quantity_total;
  const remaining = total - scanned;
  const isPartial = scanned > 0 && scanned < total;
  const isSubstituted = item.status === 'sustituido' && item.sustituto;

  const formatPrice = (p) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p);

  return (
    <motion.div layout className={`ec-product-card ${isCompleted ? 'completed' : ''} ${isPartial ? 'partial-scan' : ''} ${isSubstituted ? 'sustituido-card' : ''}`}>
      <div className="ec-img-wrapper">
        {item.image_src ? <img src={item.image_src} className="ec-prod-img" alt="" /> : <FaBoxOpen color="#ccc" size={30} />}
        <span className="ec-qty-badge-img">{total}</span>
      </div>

      <div className="ec-info-col">
        <span className="ec-pasillo-badge">
            {item.pasillo === "S/N" || item.pasillo === "Otros" ? "GENERAL" : `PASILLO ${item.pasillo}`}
        </span>
        
        {isSubstituted ? (
            <div className="ec-sub-details">
                <div className="ec-original-row">
                    <span className="ec-label-tiny">PIDIÓ:</span>
                    <span className="ec-text-crossed">{item.name}</span>
                </div>
                <div className="ec-arrow-down"><FaArrowRight style={{transform: 'rotate(90deg)', fontSize: '0.8rem', color:'#f59e0b'}}/></div>
                <div className="ec-final-row">
                    <span className="ec-label-tiny">LLEVAS:</span>
                    <span className="ec-text-final">{item.sustituto.name}</span>
                    <span className="ec-price-final">{formatPrice(item.sustituto.price)}</span>
                </div>
            </div>
        ) : (
            <>
                <h4 className="ec-prod-name">{item.name}</h4>
                <div className="ec-price-tag">{item.price > 0 ? formatPrice(item.price) : ""}</div>
            </>
        )}
        
        <div className="ec-req-list">
            {item.pedidos_involucrados.map((ped, idx) => {
                const orderIdx = orderMap[ped.id_pedido] || 0;
                const style = getOrderStyle(orderIdx);
                return (
                    <div key={idx} className="ec-req-badge" style={{borderLeftColor: style.color}}>
                        <span className="ec-req-letter" style={{color: style.color}}>{style.code}</span>
                        <span className="ec-req-qty">{ped.cantidad} un.</span>
                        <span className="ec-req-name">{ped.nombre_cliente.split(' ')[0]}</span>
                    </div>
                )
            })}
        </div>
      </div>

      {!isCompleted ? (
          <div className="ec-action-col">
             <button className={`ec-scan-btn ${isPartial ? 'active-partial' : ''}`} onClick={() => onAction(item, "scan")}>
                {isPartial ? (
                    <div className="ec-scan-progress">
                        <span className="ec-scan-prog-nums">{scanned}/{total}</span>
                        <span className="ec-scan-prog-label">FALTAN {remaining}</span>
                    </div>
                ) : (<><FaBarcode /><span className="ec-scan-label">SCAN</span></>)}
             </button>
             <div style={{display:'flex', gap:5}}>
                 <button className="ec-alt-btn" onClick={() => onAction(item, "manual")} title="Teclado"><FaKeyboard size={14} /></button>
                 <button className="ec-alt-btn warning" onClick={() => onAction(item, "substitute")} title="Sustituir"><FaExchangeAlt size={14} /></button>
             </div>
          </div>
      ) : (
          <div className="ec-action-col">
              <button 
                  className="ec-alt-btn" 
                  style={{color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2'}}
                  onClick={() => { if(window.confirm("¿Devolver a pendientes?")) onAction(item, "undo"); }}
                  title="Devolver a pendientes"
              >
                  <FaUndo />
              </button>
              <div style={{marginTop:5, color: isSubstituted ? '#d97706' : '#16a34a'}}>
                  {isSubstituted ? <FaExchangeAlt /> : <FaCheck />}
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
  
  // Modales
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false); // NUEVO

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        let email = localStorage.getItem("correo_empleado") || localStorage.getItem("picker_email") || "juan@test.com";
        
        let me = null;
        try {
            const { data: pickers } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pickers?email=${email}`);
            if(pickers && pickers.length > 0) {
                me = pickers[0];
                localStorage.setItem("picker_info_cache", JSON.stringify(me)); 
            }
        } catch (err) { me = JSON.parse(localStorage.getItem("picker_info_cache")); }

        if (!me) { alert("Usuario no encontrado."); setLoading(false); return; }
        setPickerInfo(me);

        try {
            const { data: session } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${me.id}`);
            setSessionData(session);
            localStorage.setItem("session_active_cache", JSON.stringify(session));
        } catch (err) {
            const cachedSession = localStorage.getItem("session_active_cache");
            if (cachedSession) setSessionData(JSON.parse(cachedSession));
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    init();
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
      const syncInterval = setInterval(async () => {
          const queue = JSON.parse(localStorage.getItem("offline_actions_queue") || "[]");
          setPendingSync(queue.length);
          if (queue.length === 0 || !navigator.onLine) return;
          const action = queue[0];
          try {
              await axios.post("https://backend-woocommerce.vercel.app/api/orders/registrar-accion", action);
              const newQueue = queue.slice(1);
              localStorage.setItem("offline_actions_queue", JSON.stringify(newQueue));
              setPendingSync(newQueue.length);
          } catch (error) { console.error("Error sync", error); }
      }, 5000); 
      return () => clearInterval(syncInterval);
  }, []);

  const queueAction = (payload) => {
      const queue = JSON.parse(localStorage.getItem("offline_actions_queue") || "[]");
      queue.push(payload);
      localStorage.setItem("offline_actions_queue", JSON.stringify(queue));
      setPendingSync(queue.length);
  };

  const orderIndexMap = useMemo(() => {
      if(!sessionData) return {};
      const map = {};
      sessionData.orders_info.forEach((ord, idx) => { map[ord.id] = idx; });
      return map;
  }, [sessionData]);

  const handleCardAction = (item, type) => {
      setCurrentItem(item);
      if (type === "scan") {
          if (isWeighable(item)) setShowWeightModal(true);
          else setIsScanning(true);
      }
      else if (type === "manual") setShowManualModal(true);
      else if (type === "substitute") setShowSubModal(true);
      else if (type === "undo") handleUndo(item);
  };

  const isWeighable = (item) => {
      const txt = (item.name + " " + (item.categorias?.[0]?.name || "")).toLowerCase();
      return txt.includes("kg") || txt.includes("gramos") || txt.includes("fruver") || txt.includes("carniceria");
  };

  const handleUndo = async (item) => {
      try {
          const payload = { id_sesion: sessionData.session_id, id_producto_original: item.product_id, accion: "reset" };
          queueAction(payload);
          setSessionData(prev => ({
              ...prev,
              items: prev.items.map(i => {
                  if (i.product_id === item.product_id) return { ...i, qty_scanned: 0, status: 'pendiente', sustituto: null };
                  return i;
              })
          }));
          const cached = JSON.parse(localStorage.getItem("session_active_cache"));
          if(cached) {
              const newItems = cached.items.map(i => {
                  if (i.product_id === item.product_id) return { ...i, qty_scanned: 0, status: 'pendiente', sustituto: null };
                  return i;
              });
              localStorage.setItem("session_active_cache", JSON.stringify({ ...cached, items: newItems }));
          }
      } catch (e) { alert("Error al deshacer"); }
  };

  const confirmPicking = async (peso = null) => {
      if (!currentItem) return;
      try {
          const currentScanned = (currentItem.qty_scanned || 0) + 1;
          const targetQty = currentItem.quantity_total;
          const isFinished = currentScanned >= targetQty;
          if (isFinished) {
              const payload = { id_sesion: sessionData.session_id, id_producto_original: currentItem.product_id, nombre_producto_original: currentItem.name, accion: "recolectado", peso_real: peso };
              queueAction(payload);
              if(navigator.vibrate) navigator.vibrate([100, 50, 100]); 
              closeAllModals();
          } else { if(navigator.vibrate) navigator.vibrate(100); }
          updateLocalSessionState(currentItem.product_id, currentScanned, isFinished ? 'recolectado' : 'pendiente');
          if (!isFinished) setCurrentItem(prev => ({ ...prev, qty_scanned: currentScanned }));
          else setCurrentItem(null);
      } catch (e) { alert("Error local: " + e.message); closeAllModals(); }
  };

  const confirmSubstitution = (newItem) => {
      const payload = { id_sesion: sessionData.session_id, id_producto_original: currentItem.product_id, nombre_producto_original: currentItem.name, accion: "sustituido", datos_sustituto: { id: newItem.id, name: newItem.name, price: newItem.price } };
      queueAction(payload);
      setSessionData(prev => ({ ...prev, items: prev.items.map(i => { if (i.product_id === currentItem.product_id) { return { ...i, qty_scanned: currentItem.quantity_total, status: 'sustituido', sustituto: { name: newItem.name, price: newItem.price } }; } return i; }) }));
      closeAllModals();
      alert("🔄 Sustitución registrada");
  };

  const updateLocalSessionState = (prodId, qty, status) => {
      if(!sessionData) return;
      const newItems = sessionData.items.map(i => { if (i.product_id === prodId) return { ...i, qty_scanned: qty, status: status }; return i; });
      const newSessionData = { ...sessionData, items: newItems };
      setSessionData(newSessionData);
      localStorage.setItem("session_active_cache", JSON.stringify(newSessionData));
  };

  const handleManualValidation = async (inputCode) => {
      if (!isOnline) {
          if(window.confirm("⚠️ Estás Offline. No podemos validar contra SIESA. ¿Estás seguro?")) { setShowManualModal(false); if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking(); return; } return;
      }
      if(!currentItem) return;
      try {
          const res = await axios.post("https://backend-woocommerce.vercel.app/api/orders/validar-codigo", { input_code: inputCode, expected_sku: currentItem.sku });
          if (res.data.valid) { setShowManualModal(false); if (isWeighable(currentItem)) setShowWeightModal(true); else confirmPicking(); } else { alert("❌ Código incorrecto."); }
      } catch (e) { alert("Error de conexión"); }
  };

  const handleScanMatch = (code) => {
      if(!currentItem) return;
      const c = code.trim().toUpperCase();
      const sku = (currentItem.sku || "").trim().toUpperCase();
      const ean = (currentItem.barcode || "").trim().toUpperCase();
      if(c === sku || c === ean || (ean && ean.endsWith(c))) confirmPicking();
      else { if(navigator.vibrate) navigator.vibrate([200, 100, 200]); alert(`Código ${c} no coincide.`); }
  };

  const handleFinish = async () => {
      if(pendingSync > 0) { alert(`⚠️ Tienes ${pendingSync} acciones pendientes de subir.`); return; }
      if(!window.confirm("¿Finalizar sesión completa?")) return;
      try {
          await axios.post("https://backend-woocommerce.vercel.app/api/orders/finalizar-sesion", { id_sesion: sessionData.session_id, id_picker: pickerInfo.id });
          localStorage.removeItem("session_active_cache"); localStorage.removeItem("offline_actions_queue"); window.location.reload();
      } catch (e) { alert("Error al finalizar"); }
  };

  const closeAllModals = () => { setIsScanning(false); setShowWeightModal(false); setShowManualModal(false); setShowSubModal(false); setCurrentItem(null); };

  const pendingItems = sessionData?.items.filter(i => i.status === 'pendiente') || [];
  const doneItems = sessionData?.items.filter(i => i.status !== 'pendiente') || [];
  const currentList = activeZone === "pendientes" ? pendingItems : doneItems;

  if (loading) return <div className="ec-picker-centered"><div className="ec-spinner"></div><p>Cargando ruta...</p></div>;
  if (!sessionData) return (<div className="ec-picker-centered"><FaShoppingBasket size={50} color="#cbd5e1" style={{marginBottom:20}} /><h3>Sin asignación</h3><button onClick={() => window.location.reload()} className="ec-scan-btn" style={{width:'auto', padding:'10px 30px', gap:10}}><FaArrowRight/> Recargar</button></div>);

  return (
    <div className="ec-picker-main-layout">
      <div className={`ec-status-bar ${isOnline ? 'online' : 'offline'}`}>{isOnline ? <span>{pendingSync > 0 ? <><FaSync className="ec-spin"/> Sincronizando...</> : <><FaWifi /> En línea</>}</span> : <span><FaExclamationTriangle /> Modo Offline ({pendingSync})</span>}</div>
      <header className="ec-picker-sticky-header">
        <div className="ec-header-top">
            <div className="ec-order-info">
                <span className="ec-label-sm">Sesión Activa</span>
                {/* AQUI ESTÁ EL CRONÓMETRO INTEGRADO */}
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <span className="ec-order-id">#{sessionData.session_id.slice(0,6)}</span>
                    <SessionTimer startDate={sessionData.fecha_inicio} />
                </div>
            </div>
            <div style={{textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                <button className="ec-contacts-btn" onClick={() => setShowClientsModal(true)}>
                    <FaPhone /> Contactos
                </button>
                <div style={{fontWeight:'bold', marginTop:5}}>{doneItems.length} / {sessionData.items.length} Items</div>
            </div>
        </div>
        <div className="ec-orders-legend">{sessionData.orders_info.map((ord, idx) => { const style = getOrderStyle(idx); return (<div key={ord.id} className="ec-legend-item"><div className="ec-legend-dot" style={{background: style.color}}></div><span style={{color: style.color, fontWeight:900}}>{style.code}:</span><span>{ord.customer.split(' ')[0]}</span></div>) })}</div>
        <div className="ec-zones-tabs"><div className={`ec-zone-tab ${activeZone === 'pendientes' ? 'active' : ''}`} onClick={() => setActiveZone('pendientes')}>Pendientes ({pendingItems.length})</div><div className={`ec-zone-tab ${activeZone === 'canasta' ? 'active' : ''}`} onClick={() => setActiveZone('canasta')}>En Canasta ({doneItems.length})</div></div>
      </header>
      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="popLayout">{currentList.length > 0 ? (currentList.map(item => (<ProductCard key={item.product_id} item={item} orderMap={orderIndexMap} isCompleted={activeZone === 'canasta'} onAction={handleCardAction} />))) : (<div className="ec-empty-state"><p>{activeZone === 'pendientes' ? '¡Todo Listo!' : 'Nada recogido aún.'}</p></div>)}</AnimatePresence><div className="ec-spacer"></div>
      </div>
      {pendingItems.length === 0 && (<div className="ec-fab-container"><button className="ec-fab-finish" onClick={handleFinish}><div className="ec-fab-content"><FaCheck size={24} /><span>FINALIZAR SESIÓN</span></div><div className="ec-fab-arrow"><FaArrowRight /></div></button></div>)}
      <EscanerBarras isScanning={isScanning} setIsScanning={setIsScanning} onScan={handleScanMatch} /><ManualEntryModal isOpen={showManualModal} onClose={() => setShowManualModal(false)} onConfirm={handleManualValidation} /><WeightModal isOpen={showWeightModal} item={currentItem} onClose={() => {setShowWeightModal(false); setCurrentItem(null)}} onConfirm={confirmPicking} /><SubstituteModal isOpen={showSubModal} originalItem={currentItem} onClose={() => {setShowSubModal(false); setCurrentItem(null)}} onConfirmSubstitute={confirmSubstitution} />
      
      {/* NUEVO MODAL DE CLIENTES */}
      <ClientsModal isOpen={showClientsModal} orders={sessionData.orders_info} onClose={() => setShowClientsModal(false)} />
    </div>
  );
};

export default VistaPicker;