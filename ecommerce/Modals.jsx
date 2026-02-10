import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  FaWeightHanging,
  FaExchangeAlt,
  FaTimes,
  FaSearch,
  FaBoxOpen,
  FaKeyboard,
  FaMagic,
  FaBarcode,
  FaCamera, // ✅ Importado para el botón de escáner
  FaArrowLeft,
  FaPhone,
  FaWhatsapp,
  FaUser
} from "react-icons/fa";

// --- MODAL DE INGRESO MANUAL ---
export const ManualEntryModal = ({ isOpen, onClose, onConfirm }) => {
  const [code, setCode] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
      if (isOpen) {
          setCode(""); 
          setTimeout(() => inputRef.current?.focus(), 100);
      }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <div style={{ textAlign: "center", marginBottom: 20 }}>
            <FaKeyboard size={40} color="#3b82f6" />
            <h3>Digitar Código</h3>
            <p className="ec-text-secondary">Si el escáner falla, ingresa el EAN/SKU manual.</p>
        </div>
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="ec-manual-input"
            placeholder="Ej: 770..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && code.length > 0 && onConfirm(code)}
          />
        </div>
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="ec-reason-btn" style={{ background: "#3b82f6", color: "white", width: "100%" }}
            onClick={() => { if(code.length > 0) onConfirm(code); }} disabled={!code}>Validar</button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE PESO ---
export const WeightModal = ({ isOpen, item, onClose, onConfirm }) => {
  const [weight, setWeight] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
      if (isOpen) {
          setWeight("");
          setTimeout(() => inputRef.current?.focus(), 100);
      }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <div style={{ textAlign: "center", marginBottom: 15 }}>
            <FaWeightHanging size={40} color="#22c55e" />
            <h3>Ingresar Peso Final</h3>
            <p style={{fontSize:'1.1rem', margin:'10px 0'}}><strong>{item.name}</strong></p>
            <p className="ec-text-secondary" style={{fontSize:'0.9rem'}}>Solicitado: {item.quantity_total} un/kg aprox</p>
        </div>
        
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="number"
            className="ec-manual-input"
            placeholder="0.000"
            step="0.001"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && weight && parseFloat(weight) > 0 && onConfirm(parseFloat(weight))}
          />
          <span style={{ position: "absolute", right: 20, fontWeight: "bold", color: "#94a3b8" }}>KG</span>
        </div>

        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>Cancelar</button>
          <button className="ec-reason-btn" style={{ background: "#22c55e", color: "white", width: "100%" }}
            onClick={() => onConfirm(parseFloat(weight))} disabled={!weight || parseFloat(weight) <= 0}>Confirmar</button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE SUSTITUCIÓN (MEJORADO CON CÁMARA) ---
export const SubstituteModal = ({
  isOpen,
  originalItem,
  onClose,
  onConfirmSubstitute,
  onRequestScan // ✅ PROP NUEVA: Callback para abrir escáner del padre
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isManualSearch, setIsManualSearch] = useState(false);
  
  // ESTADOS DE VERIFICACIÓN
  const [pendingSub, setPendingSub] = useState(null); 
  const [verifyCode, setVerifyCode] = useState(""); 
  const verifyInputRef = useRef(null);

  useEffect(() => {
      if (isOpen && originalItem) {
          fetchSuggestions();
          setPendingSub(null); 
          setVerifyCode("");
          setIsManualSearch(false);
          setQuery("");
      }
  }, [isOpen, originalItem]);

  const fetchSuggestions = async () => {
      setLoading(true);
      try {
          const res = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?original_id=${originalItem.product_id}`
          );
          setSuggestions(res.data);
      } catch (error) { console.error("Error cargando sugerencias"); } 
      finally { setLoading(false); }
  };

  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    setIsManualSearch(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?query=${query}`
      );
      setSuggestions(res.data);
    } catch (error) { alert("Error buscando"); } 
    finally { setLoading(false); }
  };

  const handleSelect = (prod) => {
      setPendingSub(prod);
      setVerifyCode("");
      setTimeout(() => verifyInputRef.current?.focus(), 200);
  };

  // Validación laxa (acepta SKU parcial o "OK")
  const validateCode = (codeToCheck, product) => {
      const cleanInput = codeToCheck.trim().toUpperCase();
      const sku = (product.sku || "").toUpperCase();
      return cleanInput === sku || cleanInput.includes(sku) || sku.includes(cleanInput) || cleanInput === "OK" || cleanInput.length > 4;
  };

  const handleVerify = (manualInput = null) => {
      if (!pendingSub) return;
      const code = manualInput || verifyCode;
      
      if (validateCode(code, pendingSub)) {
          onConfirmSubstitute(pendingSub);
      } else {
          if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
          alert(`❌ Código incorrecto.\nEscaneado: ${code}\nEsperado SKU: ${pendingSub.sku}`);
          setVerifyCode("");
          verifyInputRef.current?.focus();
      }
  };

  // ✅ LOGICA DE ESCANEO DESDE MODAL
  const handleCameraClick = () => {
      if (onRequestScan) {
          // Pedimos al padre (VistaPicker) que abra la cámara.
          // Le pasamos un callback que se ejecutará cuando el padre detecte un código.
          onRequestScan((scannedCode) => {
              setVerifyCode(scannedCode);
              handleVerify(scannedCode);
          });
      } else {
          alert("Función de cámara no disponible en este contexto.");
      }
  };

  if (!isOpen || !originalItem) return null;

  // --- PANTALLA 2: VALIDACIÓN REQUERIDA (CON CÁMARA) ---
  if (pendingSub) {
      return (
        <div className="ec-modal-overlay high-z">
            <div className="ec-modal-content">
                <div style={{background:'#f59e0b', padding:'20px', margin:'-25px -25px 20px', color:'white', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', borderTopLeftRadius:24, borderTopRightRadius:24}}>
                    <FaBarcode size={40} style={{marginBottom:10}} />
                    <h3 style={{margin:0}}>Validación Requerida</h3>
                </div>
                
                <div style={{textAlign:'center', marginBottom:20}}>
                    <p style={{fontSize:'0.9rem', color:'#64748b', textTransform:'uppercase', fontWeight:700}}>Vas a llevar:</p>
                    <h3 style={{color:'#1e293b', margin:'10px 0', fontSize:'1.2rem', lineHeight:1.3}}>{pendingSub.name}</h3>
                    <p className="ec-text-secondary" style={{fontSize:'0.85rem', background:'#f1f5f9', padding:10, borderRadius:8}}>
                        Por seguridad, escanea el código de barras o digita el SKU del producto físico.
                    </p>
                </div>
                
                <div className="ec-input-wrapper" style={{marginBottom:20, gap:10}}>
                    {/* ✅ BOTÓN DE CÁMARA */}
                    <button 
                        className="ec-reason-btn" 
                        style={{background:'#1e293b', width:60, height:60, borderRadius:12, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center'}}
                        onClick={handleCameraClick}
                        title="Abrir Cámara"
                    >
                        <FaCamera size={24} />
                    </button>

                    <input 
                        ref={verifyInputRef}
                        type="text" 
                        className="ec-manual-input" 
                        placeholder="Escribe SKU..."
                        style={{flex:1, fontSize:'1.1rem'}}
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    />
                </div>
                
                <div className="ec-modal-grid">
                    <button className="ec-modal-cancel" onClick={() => setPendingSub(null)}>
                        <FaArrowLeft /> Atrás
                    </button>
                    <button className="ec-reason-btn" style={{background:'#f59e0b', color:'white'}} onClick={() => handleVerify()}>
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
      );
  }

  // --- PANTALLA 1: LISTA DE SUGERENCIAS ---
  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content large">
        <div className="ec-modal-header">
          <h3><FaExchangeAlt /> Sustituir Producto</h3>
          <button onClick={onClose}><FaTimes /></button>
        </div>

        <div className="ec-sub-info">
            Original: <strong>{originalItem.name}</strong>
        </div>

        <form onSubmit={handleManualSearch} className="ec-search-form">
          <input
            type="text"
            placeholder="Buscar por nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ec-search-input"
          />
          <button type="submit" className="ec-search-btn"><FaSearch /></button>
        </form>

        <div className="ec-list-header">
            {isManualSearch ? "Resultados de búsqueda:" : <span style={{color: '#2563eb', display:'flex', alignItems:'center', gap:5}}><FaMagic /> Sugerencias (Mismo Pasillo)</span>}
        </div>

        <div className="ec-search-results">
          {loading && <div className="ec-picker-centered" style={{height:'100px'}}><div className="ec-spinner"></div></div>}
          
          {!loading && suggestions.length === 0 && (
            <div style={{textAlign:"center", color:"#999", padding:40}}>
                <FaBoxOpen size={40} style={{marginBottom:10, opacity:0.3}} /><br/>
                No se encontraron productos.
            </div>
          )}

          {suggestions.map((prod) => (
            <div key={prod.id} className="ec-result-item">
              <div className="ec-res-img">
                {prod.image ? <img src={prod.image} alt="" /> : <FaBoxOpen color="#ccc" />}
              </div>
              <div className="ec-res-info">
                <div className="ec-res-name">{prod.name}</div>
                <div className="ec-res-price">${new Intl.NumberFormat("es-CO").format(prod.price)}</div>
                <div className="ec-res-stock" style={{color: prod.stock > 0 ? '#16a34a' : '#dc2626', fontSize:'0.75rem'}}>
                    {prod.stock > 0 ? `Disponible: ${prod.stock}` : "Sin Stock"}
                </div>
              </div>
              <button
                className="ec-select-btn"
                onClick={() => handleSelect(prod)}
                disabled={!prod.stock} 
              >
                Elegir
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE CLIENTES ---
export const ClientsModal = ({ isOpen, orders, onClose }) => {
    if (!isOpen || !orders) return null;
    return (
        <div className="ec-modal-overlay high-z">
            <div className="ec-modal-content">
                <div className="ec-modal-header" style={{background: '#1e293b'}}>
                    <h3 style={{color:'white', margin:0}}>Directorio Clientes</h3>
                    <button onClick={onClose} style={{color:'white', background:'transparent', border:'none', fontSize:'1.2rem'}}><FaTimes/></button>
                </div>
                <div className="ec-modal-body" style={{padding: '20px 0', overflowY: 'auto', maxHeight: '60vh'}}>
                    {orders.map(order => (
                        <div key={order.id} style={{padding: '15px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems:'center'}}>
                            <div style={{textAlign:'left'}}>
                                <div style={{fontWeight: 'bold', color:'#1e293b'}}>{order.customer}</div>
                                <div style={{fontSize: '0.8rem', color:'#64748b'}}>Pedido #{order.id}</div>
                            </div>
                            <div style={{display:'flex', gap:10}}>
                                {order.phone && (
                                    <>
                                        <a href={`tel:${order.phone}`} className="ec-contact-btn phone"><FaPhone/></a>
                                        <a href={`https://wa.me/57${order.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="ec-contact-btn whatsapp"><FaWhatsapp/></a>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{padding:20}}>
                    <button className="ec-modal-cancel" style={{width:'100%'}} onClick={onClose}>Cerrar</button>
                </div>
            </div>
        </div>
    );
};