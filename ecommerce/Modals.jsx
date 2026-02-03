import React, { useState } from "react";
import axios from "axios";
import {
  FaWeightHanging,
  FaExchangeAlt,
  FaTimes,
  FaSearch,
  FaBoxOpen,
  FaKeyboard
} from "react-icons/fa";

// --- MODAL DE INGRESO MANUAL (VALIDACIÓN CIEGA) ---
export const ManualEntryModal = ({ isOpen, onClose, onConfirm }) => {
  const [code, setCode] = useState("");

  if (!isOpen) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <h3 style={{ justifyContent: "center" }}>
          <FaKeyboard /> Digitar Código
        </h3>
        <p className="ec-text-secondary">
          El escáner falló. Ingresa el código de barras o ID del producto.
        </p>

        <div className="ec-input-wrapper">
          <input
            type="number" 
            className="ec-manual-input"
            placeholder="Ej: 770..."
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ec-reason-btn"
            style={{ background: "#3b82f6", color: "white", width: "100%" }}
            onClick={() => {
                if(code.length > 0) onConfirm(code);
            }}
            disabled={!code}
          >
            Validar
          </button>
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
        <h3 style={{ justifyContent: "center" }}>
          <FaWeightHanging /> Ingresar Peso
        </h3>
        <p>
          Producto: <strong>{item.name}</strong>
        </p>
        <p className="ec-text-secondary">
          Solicitado: ~{item.quantity_total} unidades/kg
        </p>

        <div className="ec-input-wrapper">
          <input
            type="number"
            className="ec-manual-input"
            placeholder="0.000"
            step="0.001"
            value={weight}
            autoFocus
            onChange={(e) => setWeight(e.target.value)}
          />
          <span
            style={{
              position: "absolute",
              right: 20,
              fontWeight: "bold",
              color: "#94a3b8",
            }}
          >
            KG
          </span>
        </div>

        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ec-reason-btn"
            style={{ background: "#22c55e", color: "white", width: "100%" }}
            onClick={() => onConfirm(parseFloat(weight))}
            disabled={!weight || parseFloat(weight) <= 0}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE SUSTITUCIÓN (BUSCADOR) ---
export const SubstituteModal = ({
  isOpen,
  originalItem,
  onClose,
  onConfirmSubstitute,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchProducts = async (e) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?query=${query}`
      );
      setResults(res.data);
    } catch (error) {
      alert("Error buscando productos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !originalItem) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content large">
        <div className="ec-modal-header">
          <h3>
            <FaExchangeAlt /> Sustituir Producto
          </h3>
          <button onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="ec-sub-info">
          Original: <strong>{originalItem.name}</strong>
          <br />
          <small>Busca una alternativa disponible en tienda:</small>
        </div>

        <form onSubmit={searchProducts} className="ec-search-form">
          <input
            type="text"
            placeholder="Buscar por nombre, marca o EAN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ec-search-input"
            autoFocus
          />
          <button type="submit" className="ec-search-btn">
            <FaSearch />
          </button>
        </form>

        <div className="ec-search-results">
          {loading && <div className="ec-spin"></div>}
          {!loading && results.length === 0 && query && (
            <p style={{ textAlign: "center", color: "#999" }}>
              No se encontraron resultados.
            </p>
          )}

          {results.map((prod) => (
            <div key={prod.id} className="ec-result-item">
              <div className="ec-res-img">
                {prod.image ? (
                  <img src={prod.image} alt="" />
                ) : (
                  <FaBoxOpen color="#ccc" />
                )}
              </div>
              <div className="ec-res-info">
                <div className="ec-res-name">{prod.name}</div>
                <div className="ec-res-price">
                  ${new Intl.NumberFormat("es-CO").format(prod.price)}
                </div>
                <div className="ec-res-stock">Stock: {prod.stock || "N/A"}</div>
              </div>
              <button
                className="ec-select-btn"
                onClick={() => {
                  if (window.confirm(`¿Sustituir con: ${prod.name}?`)) {
                    onConfirmSubstitute(prod);
                  }
                }}
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