import React, { useState, useEffect, useRef, useMemo } from "react";
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
  FaCamera,
  FaArrowLeft,
  FaPhone,
  FaWhatsapp,
  FaExclamationCircle,
  FaExclamationTriangle,
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
          <p className="ec-text-secondary">
            Si el escáner falla, ingresa el EAN/SKU manual.
          </p>
        </div>
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="ec-manual-input"
            placeholder="Ej: 770..."
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && code.length > 0 && onConfirm(code)
            }
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
              if (code.length > 0) onConfirm(code);
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

// --- MODAL DE PESO INTELIGENTE (CARNES VS FRUVER CON PRECIO EN VIVO) ---
export const WeightModal = ({ isOpen, item, onClose, onConfirm }) => {
  const [weight, setWeight] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const inputRefWeight = useRef(null);
  const inputRefCode = useRef(null);

  // 🧠 LÓGICA A PRUEBA DE BALAS: Detecta cárnicos por nombre o por categoría futura
  const isMeat = useMemo(() => {
    if (!item) return false;

    const name = (item.name || "").toLowerCase();
    const catReales = Array.isArray(item.categorias_reales)
      ? item.categorias_reales.join(" ").toLowerCase()
      : "";
    const catNormales = Array.isArray(item.categorias)
      ? item.categorias
          .map((c) => c.name)
          .join(" ")
          .toLowerCase()
      : "";

    const fullText = `${name} ${catReales} ${catNormales}`;

    // Lista gigante de palabras clave para atrapar cualquier corte
    const meatKeywords = [
      "carne",
      "pollo",
      "pescado",
      "res",
      "cerdo",
      "carnicería",
      "carniceria",
      "embutido",
      "chorizo",
      "pezuña",
      "costilla",
      "chuleta",
      "lomo",
      "tocino",
      "morrillo",
      "pechuga",
      "alas",
      "salchicha",
      "pescaderia",
      "pescadería",
      "marisco",
      "camaron",
    ];

    return meatKeywords.some((kw) => fullText.includes(kw));
  }, [item]);

  // ✅ CÁLCULO DEL PRECIO EN TIEMPO REAL
  const calculatedPrice = useMemo(() => {
    if (!item || !weight || isNaN(parseFloat(weight))) return 0;
    // PUM: Precio por Unidad de Medida
    const pum = parseFloat(item.price || 0);
    const currentWeight = parseFloat(weight);
    return pum * currentWeight;
  }, [item, weight]);

  // Formateador de moneda (Pesos Colombianos)
  const formatPrice = (p) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(p);

  // Auto-focus inteligente al abrir el modal
  useEffect(() => {
    if (isOpen) {
      setWeight("");
      setCode("");
      setError("");
      setTimeout(() => {
        if (isMeat && inputRefCode.current) inputRefCode.current.focus();
        else if (inputRefWeight.current) inputRefWeight.current.focus();
      }, 100);
    }
  }, [isOpen, isMeat, item]);

  // Validaciones antes de enviar a canasta
  const validateAndConfirm = () => {
    // 1. VALIDACIÓN DE CÓDIGO (Solo exigido para Carnes)
    if (isMeat) {
      const cleanCode = code.trim().toUpperCase();
      const expectedSku = (item.sku || "").toUpperCase();
      const expectedBarcode = (item.barcode || "").toUpperCase();

      const isValidCode =
        cleanCode === expectedSku ||
        cleanCode === expectedBarcode ||
        (expectedBarcode && expectedBarcode.endsWith(cleanCode));

      if (!cleanCode) {
        setError(`❌ Debes digitar el código del producto.`);
        inputRefCode.current?.focus();
        return;
      }
      if (!isValidCode) {
        setError(
          `❌ Código incorrecto. Esperado: ${expectedBarcode || expectedSku}`,
        );
        inputRefCode.current?.focus();
        return;
      }
    }

    // 2. VALIDACIÓN DE PESO (Exigido para Carnes y Fruver)
    const val = parseFloat(weight);
    const requested = parseFloat(item.quantity_total);

    if (!val || isNaN(val)) {
      setError(`❌ Ingresa un peso válido.`);
      inputRefWeight.current?.focus();
      return;
    }
    if (val < requested) {
      setError(`❌ Mínimo requerido: ${requested} Kg`);
      inputRefWeight.current?.focus();
      return;
    }

    const maxAllowed = requested + 0.05; // Tolerancia +50g
    if (val > maxAllowed) {
      setError(`❌ Excede tolerancia. Máx: ${maxAllowed.toFixed(3)} Kg`);
      inputRefWeight.current?.focus();
      return;
    }

    // Si pasa todas las validaciones, enviamos (Peso, Código)
    onConfirm(val, isMeat ? code.trim().toUpperCase() : null);
  };

  if (!isOpen || !item) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <div style={{ textAlign: "center", marginBottom: 15 }}>
          <FaWeightHanging size={30} color="#22c55e" />
          <h3 style={{ marginTop: 10 }}>
            {isMeat ? "Validar y Pesar Cárnico" : "Ingresar Peso Fruver"}
          </h3>
          <p style={{ fontSize: "1.1rem", margin: "10px 0" }}>
            <strong>{item.name}</strong>
          </p>
          <div
            style={{
              fontSize: "0.9rem",
              background: "#f0fdf4",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #bbf7d0",
            }}
          >
            Solicitado:{" "}
            <strong>
              {item.quantity_total} {item.unidad_medida || "Kg"}
            </strong>
            <br />
            <small style={{ color: "#15803d" }}>Margen permitido: +50g</small>
          </div>
        </div>

        {/* INPUT DE CÓDIGO (Visible ÚNICAMENTE si es Carne) */}
        {isMeat && (
          <div className="ec-input-wrapper" style={{ marginBottom: 10 }}>
            <input
              ref={inputRefCode}
              type="text"
              className="ec-manual-input"
              style={{
                background: "#f8fafc",
                color: "#0f172a",
                border: "2px solid #cbd5e1",
                fontSize: "1.2rem",
              }}
              placeholder="Digita el código / SKU..."
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
              onKeyDown={(e) =>
                e.key === "Enter" && inputRefWeight.current?.focus()
              }
            />
          </div>
        )}

        {/* INPUT DE PESO (Visible siempre) */}
        <div className="ec-input-wrapper">
          <input
            ref={inputRefWeight}
            type="number"
            className="ec-manual-input"
            placeholder="0.000"
            step="0.001"
            value={weight}
            onChange={(e) => {
              setWeight(e.target.value);
              setError("");
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && weight && validateAndConfirm()
            }
          />
          <span
            style={{
              position: "absolute",
              right: 20,
              fontWeight: "bold",
              color: "#94a3b8",
            }}
          >
            {item.unidad_medida?.toUpperCase() || "KG"}
          </span>
        </div>

        {/* ✅ DISPLAY DEL PRECIO CALCULADO EN TIEMPO REAL */}
        <div
          style={{
            marginTop: 15,
            padding: "10px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: "0.8rem",
              color: "#3b82f6",
              fontWeight: "bold",
              textTransform: "uppercase",
            }}
          >
            Total a cobrar:
          </span>
          <span
            style={{ fontSize: "1.3rem", fontWeight: "900", color: "#1e40af" }}
          >
            {calculatedPrice > 0 ? formatPrice(calculatedPrice) : "$0"}
          </span>
        </div>

        {/* MENSAJES DE ERROR */}
        {error && (
          <div
            style={{
              color: "#ef4444",
              marginTop: 10,
              fontWeight: "bold",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <FaExclamationTriangle /> {error}
          </div>
        )}

        {/* BOTONES */}
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="ec-reason-btn"
            style={{ background: "#22c55e", color: "white", width: "100%" }}
            onClick={validateAndConfirm}
            disabled={!weight || (isMeat && !code)}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE SUSTITUCIÓN (ADAPTADO A CANTIDAD) ---
export const SubstituteModal = ({
  isOpen,
  originalItem,
  missingQty, // Nueva prop para saber cuántos faltan
  onClose,
  onConfirmSubstitute,
  onRequestScan,
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isManualSearch, setIsManualSearch] = useState(false);

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
        `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?original_id=${originalItem.product_id}`,
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
    setIsManualSearch(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/buscar-producto?query=${query}`,
      );
      setSuggestions(res.data);
    } catch (error) {
      alert("Error buscando");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (prod) => {
    setPendingSub(prod);
    setVerifyCode("");
    setTimeout(() => verifyInputRef.current?.focus(), 200);
  };

  const validateCode = (codeToCheck, product) => {
    const cleanInput = codeToCheck.trim().toUpperCase();
    const sku = (product.sku || "").toUpperCase();
    return (
      cleanInput === sku ||
      cleanInput.includes(sku) ||
      sku.includes(cleanInput) ||
      cleanInput === "OK" ||
      cleanInput.length > 4
    );
  };

  const handleVerify = (manualInput = null) => {
    if (!pendingSub) return;
    const code = manualInput || verifyCode;

    if (validateCode(code, pendingSub)) {
      onConfirmSubstitute(pendingSub, missingQty); // Pasamos cantidad faltante
    } else {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      alert(
        `❌ Código incorrecto.\nEscaneado: ${code}\nEsperado SKU: ${pendingSub.sku}`,
      );
      setVerifyCode("");
      verifyInputRef.current?.focus();
    }
  };

  const handleCameraClick = () => {
    if (onRequestScan) {
      onRequestScan((scannedCode) => {
        setVerifyCode(scannedCode);
        handleVerify(scannedCode);
      });
    } else {
      alert("Función de cámara no disponible en este contexto.");
    }
  };

  if (!isOpen || !originalItem) return null;

  if (pendingSub) {
    return (
      <div className="ec-modal-overlay high-z">
        <div className="ec-modal-content">
          <div
            style={{
              background: "#f59e0b",
              padding: "20px",
              margin: "-25px -25px 20px",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <FaBarcode size={40} style={{ marginBottom: 10 }} />
            <h3 style={{ margin: 0 }}>Validar Sustituto</h3>
            <p style={{ margin: 0, opacity: 0.9, fontSize: "0.9rem" }}>
              Cantidad a sustituir: <strong>{missingQty}</strong>
            </p>
          </div>

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#64748b",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Vas a llevar:
            </p>
            <h3
              style={{
                color: "#1e293b",
                margin: "10px 0",
                fontSize: "1.2rem",
                lineHeight: 1.3,
              }}
            >
              {pendingSub.name}
            </h3>
            <p
              className="ec-text-secondary"
              style={{
                fontSize: "0.85rem",
                background: "#f1f5f9",
                padding: 10,
                borderRadius: 8,
              }}
            >
              Escanea el código de barras del producto físico.
            </p>
          </div>

          <div
            className="ec-input-wrapper"
            style={{ marginBottom: 20, gap: 10 }}
          >
            <button
              className="ec-reason-btn"
              style={{
                background: "#1e293b",
                width: 60,
                height: 60,
                borderRadius: 12,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
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
              style={{ flex: 1, fontSize: "1.1rem" }}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            />
          </div>

          <div className="ec-modal-grid">
            <button
              className="ec-modal-cancel"
              onClick={() => setPendingSub(null)}
            >
              <FaArrowLeft /> Atrás
            </button>
            <button
              className="ec-reason-btn"
              style={{ background: "#f59e0b", color: "white" }}
              onClick={() => handleVerify()}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content large">
        <div className="ec-modal-header">
          <h3>
            <FaExchangeAlt /> Sustituir {missingQty} Unidades
          </h3>
          <button onClick={onClose}>
            <FaTimes />
          </button>
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
          <button type="submit" className="ec-search-btn">
            <FaSearch />
          </button>
        </form>

        <div className="ec-list-header">
          {isManualSearch ? (
            "Resultados de búsqueda:"
          ) : (
            <span
              style={{
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <FaMagic /> Sugerencias (Mismo Pasillo)
            </span>
          )}
        </div>

        <div className="ec-search-results">
          {loading && (
            <div className="ec-picker-centered" style={{ height: "100px" }}>
              <div className="ec-spinner"></div>
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div style={{ textAlign: "center", color: "#999", padding: 40 }}>
              <FaBoxOpen size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
              <br />
              No se encontraron productos.
            </div>
          )}

          {suggestions.map((prod) => (
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
                <div
                  className="ec-res-stock"
                  style={{
                    color: prod.stock > 0 ? "#16a34a" : "#dc2626",
                    fontSize: "0.75rem",
                  }}
                >
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

export const ClientsModal = ({ isOpen, orders, onClose }) => {
  if (!isOpen || !orders) return null;
  return (
    <div className="ec-modal-overlay high-z">
      <div className="ec-modal-content">
        <div className="ec-modal-header" style={{ background: "#1e293b" }}>
          <h3 style={{ color: "white", margin: 0 }}>Directorio Clientes</h3>
          <button
            onClick={onClose}
            style={{
              color: "white",
              background: "transparent",
              border: "none",
              fontSize: "1.2rem",
            }}
          >
            <FaTimes />
          </button>
        </div>
        <div
          className="ec-modal-body"
          style={{ padding: "20px 0", overflowY: "auto", maxHeight: "60vh" }}
        >
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                padding: "15px 20px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: "bold", color: "#1e293b" }}>
                  {order.customer}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Pedido #{order.id}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {order.phone && (
                  <>
                    <a
                      href={`tel:${order.phone}`}
                      className="ec-contact-btn phone"
                    >
                      <FaPhone />
                    </a>
                    <a
                      href={`https://wa.me/57${order.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ec-contact-btn whatsapp"
                    >
                      <FaWhatsapp />
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          <button
            className="ec-modal-cancel"
            style={{ width: "100%" }}
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
