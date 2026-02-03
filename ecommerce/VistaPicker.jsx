import React, { useState, useEffect } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCheck, FaBoxOpen, FaArrowRight, FaShoppingBasket, FaBarcode, FaExchangeAlt, FaKeyboard
} from "react-icons/fa";
import "./VistaPicker.css";
// REVISA LA RUTA DE TU ESCANER SI ES NECESARIO
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras"; 
import { WeightModal, SubstituteModal, ManualEntryModal } from "./Modals";

// --- COMPONENTE TARJETA DE PRODUCTO ---
const SwipeCard = ({ item, onSwipe, onManualInput }) => {
  return (
    <motion.div 
      layout 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className="ec-product-card"
    >
      <div className="ec-img-large-wrapper">
        {item.image_src ? <img src={item.image_src} alt={item.name} className="ec-prod-img-large" /> : <div className="ec-no-img"><FaBoxOpen /></div>}
      </div>
      
      <div className="ec-info">
        <div className="ec-badges">
          <span className="ec-badge-pasillo">{item.pasillo === "S/N" || item.pasillo === "Otros" ? "General" : `Pasillo ${item.pasillo}`}</span>
          {item.categorias?.[0] && <span className="ec-badge-cat">{item.categorias[0].name}</span>}
        </div>
        
        <h4 className="ec-name-large">{item.name}</h4>
        
        {/* DETALLE DEL BATCH: QUIÉN PIDIÓ QUÉ */}
        <div className="ec-batch-detail">
            {item.pedidos_involucrados.map((ped, idx) => (
                <div key={idx} className="ec-batch-row">
                    <span className="ec-batch-qty">{ped.cantidad}x</span>
                    <span className="ec-batch-client">{ped.nombre_cliente}</span>
                </div>
            ))}
        </div>

        <div className="ec-sku-container">
           {item.barcode && <div className="barcode-badge"><FaBarcode /> {item.barcode}</div>}
        </div>
      </div>

      <div className="ec-actions-col">
         {/* BOTÓN PRINCIPAL: ESCANEAR */}
         <button className="ec-big-btn success" onClick={() => onSwipe(item, "picked")}>
            <div className="ec-qty-circle-large">{item.quantity_total}</div>
            <span className="ec-btn-label">ESCANEAR</span>
         </button>
         
         {/* BOTÓN MANUAL (SI FALLA EL ESCANER) */}
         <button className="ec-small-btn neutral" onClick={() => onManualInput(item)} style={{background: '#f1f5f9', color: '#475569'}}>
            <FaKeyboard />
         </button>

         {/* BOTÓN SECUNDARIO: SUSTITUIR */}
         <button className="ec-small-btn warning" onClick={() => onSwipe(item, "substitute")}>
            <FaExchangeAlt />
         </button>
      </div>
    </motion.div>
  );
};

// --- VISTA PRINCIPAL ---
const VistaPicker = () => {
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null); 
  const [pickerInfo, setPickerInfo] = useState(null);
  
  // Estados de flujo
  const [isScanning, setIsScanning] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  
  // Modales
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Inicialización
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        // 1. Obtener email del picker (Del Auth o LocalStorage)
        let email = localStorage.getItem("picker_email"); 
        
        // 2. Obtener ID del picker
        const { data: pickers } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pickers?email=${email}`);
        
        if(!pickers || pickers.length === 0) { 
            alert("Usuario no encontrado en base de datos de pickers."); 
            setLoading(false);
            return; 
        }
        
        const me = pickers[0];
        setPickerInfo(me);

        // 3. Obtener Sesión Activa
        const { data: session } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${me.id}`);
        setSessionData(session); 

      } catch (e) {
        console.error("Error cargando sesión:", e);
        // 404 es esperado si no tiene sesión asignada
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // --- LÓGICA DE ACCIONES ---

  // 1. Manejador de clics en la tarjeta
  const handleItemAction = (item, actionType) => {
      setCurrentItem(item);
      
      if (actionType === "substitute") {
          setShowSubModal(true);
          return;
      }

      // Check de Pesables
      const nameLower = item.name.toLowerCase();
      const catsLower = item.categorias?.map(c => c.name.toLowerCase()).join(" ") || "";
      
      const isWeighable = nameLower.includes("kg") || 
                          nameLower.includes("gramos") ||
                          nameLower.includes("libra") ||
                          catsLower.includes("fruver") ||
                          catsLower.includes("carnes");

      if (isWeighable) {
          setShowWeightModal(true);
      } else {
          setIsScanning(true);
      }
  };

  // 2. Handler para abrir ingreso manual
  const handleManualInputTrigger = (item) => {
      setCurrentItem(item);
      setShowManualModal(true);
  };

  // 3. VALIDACIÓN MANUAL ROBUSTA (CONSULTA A SIESA)
  const handleManualValidation = async (inputCode) => {
      if(!currentItem) return;

      const cleanInput = inputCode.trim();
      const expectedSku = (currentItem.sku || "").toString().trim(); // El SKU de Woo debe ser el f120_id

      if (!expectedSku) {
          alert("Error: Este producto no tiene ID/SKU para validar.");
          return;
      }

      try {
          // Consultamos al backend si el código pertenece al item
          const res = await axios.post("https://backend-woocommerce.vercel.app/api/orders/validar-codigo", {
              input_code: cleanInput,
              expected_sku: expectedSku
          });

          if (res.data.valid) {
              // ÉXITO: Coincide con SIESA
              setShowManualModal(false);
              
              // Verificamos si es pesable para mostrar el siguiente paso
              const nameLower = currentItem.name.toLowerCase();
              const isWeighable = nameLower.includes("kg") || nameLower.includes("gramos") || nameLower.includes("fruver");

              if (isWeighable) {
                  setShowWeightModal(true);
              } else {
                  confirmPicking();
              }
          } else {
              alert("❌ Código incorrecto.\nNo coincide con la base de datos maestra (SIESA).");
          }
      } catch (error) {
          console.error(error);
          alert("Error de conexión validando el código.");
      }
  };

  // 4. Confirmar Picking (Guardar en BD)
  const confirmPicking = async (peso = null) => {
      try {
          await axios.post("https://backend-woocommerce.vercel.app/api/orders/registrar-accion", {
              id_sesion: sessionData.session_id,
              id_producto_original: currentItem.product_id,
              nombre_producto_original: currentItem.name,
              accion: "recolectado",
              peso_real: peso
          });
          
          updateLocalItemStatus(currentItem.product_id, "recolectado");
          
          setIsScanning(false);
          setShowWeightModal(false);
          setCurrentItem(null);
          
          if(navigator.vibrate) navigator.vibrate(200);
      } catch (error) {
          alert("Error guardando: " + error.message);
      }
  };

  // 5. Confirmar Sustitución
  const confirmSubstitution = async (newItem) => {
      try {
          await axios.post("https://backend-woocommerce.vercel.app/api/orders/registrar-accion", {
              id_sesion: sessionData.session_id,
              id_producto_original: currentItem.product_id,
              nombre_producto_original: currentItem.name,
              accion: "sustituido",
              datos_sustituto: {
                  id: newItem.id,
                  name: newItem.name,
                  price: newItem.price
              }
          });

          updateLocalItemStatus(currentItem.product_id, "sustituido");
          setShowSubModal(false);
          setCurrentItem(null);
          alert("🔄 Sustitución registrada");
      } catch (error) {
          alert("Error registrando sustituto: " + error.message);
      }
  };

  // Helper UI
  const updateLocalItemStatus = (prodId, status) => {
      setSessionData(prev => ({
          ...prev,
          items: prev.items.map(i => i.product_id === prodId ? { ...i, status: status } : i)
      }));
  };

  // Validación de Escáner (Local rápida)
  const handleScanMatch = (code) => {
      if(!currentItem) return;
      const cleanedCode = code.trim().toUpperCase();
      const itemSku = (currentItem.sku || "").trim().toUpperCase();
      const itemEan = (currentItem.barcode || "").trim().toUpperCase();

      if (cleanedCode === itemSku || cleanedCode === itemEan) {
          confirmPicking();
      } else {
          // Si falla el escáner local, sugerimos usar el botón manual que valida contra SIESA
          alert(`Código leído (${cleanedCode}) no coincide con el registro básico. Usa el botón de teclado para validar contra SIESA.`);
      }
  };

  const handleFinishSession = async () => {
      if(!window.confirm("¿Estás seguro de finalizar la sesión?")) return;
      try {
          await axios.post("https://backend-woocommerce.vercel.app/api/orders/finalizar-sesion", {
              id_sesion: sessionData.session_id,
              id_picker: pickerInfo.id
          });
          alert("¡Excelente trabajo! Sesión finalizada.");
          setSessionData(null); 
          window.location.reload();
      } catch (error) {
          alert("Error finalizando: " + error.message);
      }
  };

  const pendingItems = sessionData?.items.filter(i => i.status === 'pendiente') || [];
  const completedItems = sessionData?.items.filter(i => i.status !== 'pendiente') || [];

  if (loading) return <div className="ec-picker-centered-view"><div className="ec-picker-spinner"></div><p>Cargando sesión...</p></div>;
  
  if (!sessionData) return (
      <div className="ec-picker-centered-view">
          <FaShoppingBasket size={50} color="#cbd5e1" style={{marginBottom: 20}} />
          <h3>No tienes una sesión activa</h3>
          <p>Ve al administrador y asigna pedidos a tu usuario.</p>
          <button onClick={() => window.location.reload()} className="ec-big-btn success" style={{marginTop: 30, width: 'auto', padding: '10px 30px'}}>
             <span className="ec-btn-label" style={{fontSize: '1rem'}}>RECARGAR</span>
          </button>
      </div>
  );

  return (
    <div className="ec-picker-main-layout">
      {/* HEADER */}
      <header className="ec-picker-sticky-header">
        <div className="ec-header-top">
            <div className="ec-order-info">
                <span className="ec-label-sm">Sesión Activa</span>
                <span className="ec-order-id">#{sessionData.session_id.slice(0,8)}</span>
            </div>
            <div className="ec-timer-container">
                <small>{sessionData.orders_info.length} Pedidos</small>
            </div>
        </div>
        <div className="ec-progress-container">
            <div className="ec-progress-bar">
                <motion.div 
                    className="ec-progress-fill" 
                    animate={{ width: `${(completedItems.length / sessionData.items.length) * 100}%` }} 
                />
            </div>
            <div className="ec-progress-text">
                <span>{completedItems.length} de {sessionData.items.length} items</span>
            </div>
        </div>
      </header>

      {/* LISTA DE ITEMS */}
      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="popLayout">
            {pendingItems.length > 0 ? (
                pendingItems.map(item => (
                    <SwipeCard 
                        key={item.product_id} 
                        item={item} 
                        onSwipe={handleItemAction} 
                        onManualInput={handleManualInputTrigger} 
                    />
                ))
            ) : (
                <div className="ec-empty-tab">
                    <FaCheck size={60} color="#22c55e" style={{marginBottom: 20}} />
                    <h3>¡Todo Recogido!</h3>
                    <p>Ya puedes finalizar la sesión.</p>
                </div>
            )}
        </AnimatePresence>
        <div className="ec-spacer-bottom"></div>
      </div>

      {/* BOTÓN FINALIZAR */}
      {pendingItems.length === 0 && (
          <div className="ec-fab-container">
              <button className="ec-fab-finish" onClick={handleFinishSession}>
                  <div className="ec-fab-content">
                      <FaCheck size={24} />
                      <span>FINALIZAR SESIÓN</span>
                  </div>
                  <div className="ec-fab-arrow"><FaArrowRight /></div>
              </button>
          </div>
      )}

      {/* COMPONENTES FLOTANTES */}
      <EscanerBarras 
        isScanning={isScanning} 
        setIsScanning={setIsScanning} 
        onScan={handleScanMatch} 
      />

      <ManualEntryModal 
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onConfirm={handleManualValidation}
      />

      <WeightModal 
        isOpen={showWeightModal} 
        item={currentItem} 
        onClose={() => { setShowWeightModal(false); setCurrentItem(null); }} 
        onConfirm={confirmPicking} 
      />

      <SubstituteModal 
        isOpen={showSubModal}
        originalItem={currentItem}
        onClose={() => { setShowSubModal(false); setCurrentItem(null); }}
        onConfirmSubstitute={confirmSubstitution}
      />

    </div>
  );
};

export default VistaPicker;