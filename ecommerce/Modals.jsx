import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  FaWeightHanging,
  FaExchangeAlt,
  FaTimes,
  FaSearch,
  FaBoxOpen,
  FaKeyboard,
  FaMagic // Icono para sugerencias
} from "react-icons/fa";

// --- MODAL DE INGRESO MANUAL ---
export const ManualEntryModal = ({ isOpen, onClose, onConfirm }) => {
  const [code, setCode] = useState("");
  if (!isOpen) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <h3 style={{ justifyContent: "center" }}><FaKeyboard /> Digitar Código</h3>
        <p className="ec-text-secondary">El escáner falló. Ingresa el código numérico.</p>
        <div className="ec-input-wrapper">
          <input
            type="number" className="ec-manual-input" placeholder="Ej: 770..."
            value={code} autoFocus onChange={(e) => setCode(e.target.value)}
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
  if (!isOpen || !item) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <h3 style={{ justifyContent: "center" }}><FaWeightHanging /> Ingresar Peso</h3>
        <p>Producto: <strong>{item.name}</strong></p>
        <p className="ec-text-secondary">Solicitado: ~{item.quantity_total} unidades/kg</p>
        <div className="ec-input-wrapper">
          <input
            type="number" className="ec-manual-input" placeholder="0.000" step="0.001"
            value={weight} autoFocus onChange={(e) => setWeight(e.target.value)}
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

// --- MODAL DE SUSTITUCIÓN INTELIGENTE ---
export const SubstituteModal = ({
  isOpen,
  originalItem,
  onClose,
  onConfirmSubstitute,
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]); // Lista de resultados
  const [loading, setLoading] = useState(false);
  const [isManualSearch, setIsManualSearch] = useState(false);

  // 1. Al abrir, buscar sugerencias automáticas (mismo cat + precio)
  useEffect(() => {
      if (isOpen && originalItem) {
          fetchSuggestions();
      }
      // Resetear estados al cerrar/abrir
      return () => {
          setQuery("");
          setSuggestions([]);
          setIsManualSearch(false);
      }
  }, [isOpen, originalItem]);

  const fetchSuggestions = async () => {
      setLoading(true);
      try {
          // Llamada sin query pero con original_id -> Activa modo sugerencia en backend
          const res = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?original_id=${originalItem.product_id}`
          );
          setSuggestions(res.data);
      } catch (error) {
          console.error("Error cargando sugerencias");
      } finally {
          setLoading(false);
      }
  };

  const handleManualSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    setIsManualSearch(true); // Cambiamos título UI
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?query=${query}`
      );
      setSuggestions(res.data);
    } catch (error) {
      alert("Error buscando: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !originalItem) return null;

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

        {/* Barra de Búsqueda */}
        <form onSubmit={handleManualSearch} className="ec-search-form">
          <input
            type="text"
            placeholder="Buscar otra cosa..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ec-search-input"
          />
          <button type="submit" className="ec-search-btn"><FaSearch /></button>
        </form>

        {/* Título dinámico de la lista */}
        <div className="ec-list-header">
            {isManualSearch ? (
                <span>Resultados de búsqueda:</span>
            ) : (
                <span style={{color: '#2563eb', display:'flex', alignItems:'center', gap:5}}>
                    <FaMagic /> Sugerencias Inteligentes (Misma Categoría)
                </span>
            )}
        </div>

        <div className="ec-search-results">
          {loading && <div className="ec-spin"></div>}
          
          {!loading && suggestions.length === 0 && (
            <div style={{ textAlign: "center", color: "#999", padding: 20 }}>
                {isManualSearch ? "No se encontraron productos." : "No hay sugerencias automáticas. Intenta buscar manual."}
            </div>
          )}

          {suggestions.map((prod) => (
            <div key={prod.id} className="ec-result-item">
              <div className="ec-res-img">
                {prod.image ? <img src={prod.image} alt="" /> : <FaBoxOpen color="#ccc" />}
              </div>
              <div className="ec-res-info">
                <div className="ec-res-name">{prod.name}</div>
                <div className="ec-res-price">
                  ${new Intl.NumberFormat("es-CO").format(prod.price)}
                </div>
                <div className="ec-res-stock" style={{color: prod.stock > 0 ? '#16a34a' : '#dc2626'}}>
                    {prod.stock > 0 ? `Stock: ${prod.stock}` : "Agotado"}
                </div>
              </div>
              <button
                className="ec-select-btn"
                onClick={() => {
                  if (window.confirm(`¿Sustituir con: ${prod.name}?`)) {
                    onConfirmSubstitute(prod);
                  }
                }}
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