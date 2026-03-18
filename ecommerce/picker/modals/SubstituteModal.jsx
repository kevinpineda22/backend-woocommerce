import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FaExchangeAlt,
  FaTimes,
  FaSearch,
  FaBoxOpen,
  FaMagic,
  FaBarcode,
  FaCamera,
  FaArrowLeft,
  FaExclamationTriangle,
} from "react-icons/fa";
import { ecommerceApi } from "../../shared/ecommerceApi";
import { detectMeat, detectFruver } from "./utils/categoryDetection";
import {
  calcularDigitoVerificador,
  isGS1Variable,
  extractGS1Prefix,
  extractGS1Sku,
  extractWeightFromGS1,
  toKgForValidation,
  validateWeightTolerance,
} from "./utils/gs1Utils";
import "../Modals.css";

// --- MODAL DE SUSTITUCIÓN (ADAPTADO A CANTIDAD) ---
const SubstituteModal = ({
  isOpen,
  originalItem,
  missingQty,
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

  // Estados para Fruver y Carnes
  const [subWeight, setSubWeight] = useState("");
  const [subMeatLabel, setSubMeatLabel] = useState("");
  const [isSubCodeValidated, setIsSubCodeValidated] = useState(false);
  const [baseEanFruver, setBaseEanFruver] = useState(null);
  const [subError, setSubError] = useState("");
  const [searchError, setSearchError] = useState("");

  const inputRefWeight = useRef(null);
  const inputRefMeatLabel = useRef(null);

  const isFruver = useMemo(() => detectFruver(pendingSub), [pendingSub]);
  const isMeat = useMemo(() => detectMeat(pendingSub), [pendingSub]);

  useEffect(() => {
    if (isOpen && originalItem) {
      fetchSuggestions();
      setPendingSub(null);
      setVerifyCode("");
      setIsManualSearch(false);
      setQuery("");
      setSubWeight("");
      setSubMeatLabel("");
      setIsSubCodeValidated(false);
      setBaseEanFruver(null);
      setSubError("");
      setSearchError("");
    }
  }, [isOpen, originalItem]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setSearchError("");
    try {
      const res = await ecommerceApi.get(
        `/buscar-producto?original_id=${originalItem.product_id}`,
      );
      setSuggestions(res.data);
    } catch (error) {
      console.error("Error cargando sugerencias:", error.message || error);
      setSearchError(
        "No se pudieron cargar sugerencias. Intenta buscar manualmente.",
      );
    } finally {
      setLoading(false);
    }
  };

  const executeSearch = async (searchQuery) => {
    if (!searchQuery?.trim()) return;
    setLoading(true);
    setIsManualSearch(true);
    setSearchError("");
    try {
      const res = await ecommerceApi.get(
        `/buscar-producto?query=${encodeURIComponent(searchQuery.trim())}`,
      );
      setSuggestions(res.data);
    } catch (error) {
      const detail =
        error.response?.data?.error || error.message || "Sin conexión";
      setSearchError(`Error buscando productos: ${detail}`);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleCameraClickSearch = () => {
    if (onRequestScan) {
      onRequestScan((scannedCode) => {
        setQuery(scannedCode);
        executeSearch(scannedCode);
      });
    } else {
      setSearchError("Cámara no disponible. Digita el código manualmente.");
    }
  };

  const handleSelect = (prod) => {
    setPendingSub(prod);
    setVerifyCode("");
    setTimeout(() => verifyInputRef.current?.focus(), 200);
  };

  const validateCode = (codeToCheck, product) => {
    const rawInput = codeToCheck.trim().toUpperCase();
    let cleanInput = rawInput;
    const sku = (product.sku || "").toUpperCase();
    const unidad = (product.unidad_medida || "").toUpperCase();

    if (unidad === "LB" || unidad === "LIBRA") {
      if (!cleanInput.endsWith("-LB")) cleanInput += "-LB";
    } else if (unidad === "KL" || unidad === "KILO" || unidad === "KG") {
      if (!cleanInput.endsWith("-KL")) cleanInput += "-KL";
    }

    return (
      rawInput === sku ||
      cleanInput === sku ||
      rawInput.includes(sku) ||
      sku.includes(rawInput) ||
      cleanInput.includes(sku) ||
      sku.includes(cleanInput) ||
      rawInput === "OK" ||
      rawInput.length > 4
    );
  };

  const handleVerify = async (manualInput = null) => {
    if (!pendingSub) return;
    const code = manualInput || verifyCode;

    let isValid = false;
    let isFastPass = false;
    let cleanCode = code.trim().toUpperCase();
    const expectedSku = (pendingSub.sku || "").toUpperCase();

    // FAST-PASS PARA SUSTITUTOS CÁRNICOS:
    if (isMeat) {
      if (isGS1Variable(cleanCode)) {
        // ✅ CORREGIDO: Siempre substring(0,7) para prefijo, substring(2,7) para PLU
        const gs1Prefix = extractGS1Prefix(cleanCode);
        const gs1Sku = extractGS1Sku(cleanCode);

        // Verificar contra barcodes conocidos del sustituto
        const barcodes = Array.isArray(pendingSub.barcode) ? pendingSub.barcode : [pendingSub.barcode];
        let prefixMatch = barcodes.some((b) => {
          if (!b) return false;
          const bStr = b.toString().toUpperCase().replace(/\+$/, "");
          if (bStr.startsWith("2") && bStr.length >= 7) {
            return gs1Prefix === bStr.substring(0, 7);
          }
          return false;
        });

        const skuMatch =
          gs1Sku === expectedSku ||
          parseInt(gs1Sku).toString() === expectedSku ||
          gs1Sku === expectedSku.split("-")[0] ||
          parseInt(gs1Sku).toString() === expectedSku.split("-")[0];

        // Backend fallback si no hay match local
        if (!prefixMatch && !skuMatch) {
          try {
            const skuNumeric = expectedSku.match(/^(\d+)/)?.[1];
            const f120Id = skuNumeric ? parseInt(skuNumeric) : null;
            const umEsperada = pendingSub.unidad_medida?.toUpperCase() || "LB";

            if (f120Id) {
              const res = await ecommerceApi.post(`/validar-codigo-siesa`, {
                codigo: cleanCode,
                f120_id_esperado: f120Id,
                unidad_medida_esperada: umEsperada,
              });
              if (res.data.valid) {
                prefixMatch = true;
              }
            }
          } catch (e) {
            console.warn("Error validando GS1 sustituto en backend:", e.message);
          }
        }

        if (prefixMatch || skuMatch) {
          const extractedWeight = extractWeightFromGS1(cleanCode);
          const requested = parseFloat(missingQty);
          const requestedKg = toKgForValidation(requested, pendingSub.unidad_medida);
          const tolerance = validateWeightTolerance(extractedWeight, requestedKg);

          if (!tolerance.valid) {
            setSubError(tolerance.error);
            setIsSubCodeValidated(false);
            setVerifyCode("");
            setTimeout(() => verifyInputRef.current?.focus(), 100);
            return;
          }

          isValid = true;
          isFastPass = true;
        }
      }
      if (!isFastPass) {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setSubError(
          `❌ Escanea o digita la etiqueta GS1 completa para el cárnico.`,
        );
        setIsSubCodeValidated(false);
        setVerifyCode("");
        verifyInputRef.current?.focus();
        return;
      }
    } else {
      isValid = validateCode(code, pendingSub);
    }

    if (isValid) {
      setSubError("");
      setIsSubCodeValidated(true);

      const unidad = (pendingSub.unidad_medida || "").toUpperCase();
      let expectedSuffixCode = cleanCode;
      if (unidad === "LB" || unidad === "LIBRA") {
        if (!expectedSuffixCode.endsWith("-LB")) expectedSuffixCode += "-LB";
      } else if (unidad === "KL" || unidad === "KILO" || unidad === "KG") {
        if (!expectedSuffixCode.endsWith("-KL")) expectedSuffixCode += "-KL";
      }

      if (
        !isFastPass &&
        expectedSuffixCode !== cleanCode &&
        expectedSuffixCode === expectedSku
      ) {
        setVerifyCode(expectedSuffixCode);
      }

      if (isFastPass) {
        setVerifyCode(cleanCode);
        setSubMeatLabel(cleanCode);
      }

      // Si es Normal, terminar directamente
      if (!isFruver && !isMeat) {
        onConfirmSubstitute(
          pendingSub,
          missingQty,
          pendingSub.barcode || pendingSub.sku,
        );
        return;
      }

      if (isFastPass) {
        // No hacer focus a nada, está listo para enviar
      } else if (isFruver && pendingSub.sku) {
        try {
          const res = await ecommerceApi.get(
            `/producto/base-ean-fruver/${pendingSub.sku}`,
          );
          if (res.data?.baseEAN) {
            setBaseEanFruver(res.data.baseEAN);
          }
        } catch (e) {
          console.error("Error trayendo EAN Fruver Sustituto", e);
        }
        setTimeout(() => inputRefWeight.current?.focus(), 100);
      }
    } else {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setSubError(
        `❌ Código incorrecto. Verifica que estés escaneando el producto correcto.`,
      );
      setIsSubCodeValidated(false);
      setVerifyCode("");
      verifyInputRef.current?.focus();
    }
  };

  const validateAndConfirmSub = () => {
    if (!isSubCodeValidated) return;
    let finalCodeToSave = pendingSub.barcode || pendingSub.sku;

    if (isFruver) {
      const val = parseFloat(subWeight);
      if (!val || isNaN(val)) {
        setSubError("❌ Ingresa un peso válido.");
        inputRefWeight.current?.focus();
        return;
      }
      if (!baseEanFruver) {
        setSubError("❌ No se encontró Base EAN para este producto Fruver.");
        return;
      }
      const pesoGramos = Math.round(val * 1000)
        .toString()
        .padStart(5, "0");
      const codigoSinCheck = `${baseEanFruver}${pesoGramos}`;
      const checkDigit = calcularDigitoVerificador(codigoSinCheck);
      if (checkDigit) {
        finalCodeToSave = `${codigoSinCheck}${checkDigit}`;
      }
    } else if (isMeat) {
      if (!subMeatLabel || subMeatLabel.length < 8) {
        setSubError("❌ Escanea la etiqueta de la báscula de carnicería.");
        inputRefMeatLabel.current?.focus();
        return;
      }
      finalCodeToSave = subMeatLabel.trim().toUpperCase();
    }

    onConfirmSubstitute(pendingSub, missingQty, finalCodeToSave);
  };

  const handleCameraClick = () => {
    if (onRequestScan) {
      onRequestScan((scannedCode) => {
        setVerifyCode(scannedCode);
        handleVerify(scannedCode);
      });
    } else {
      setSubError("Cámara no disponible. Digita el código manualmente.");
    }
  };

  if (!isOpen || !originalItem) return null;

  // --- VISTA DE VERIFICACIÓN DEL SUSTITUTO SELECCIONADO ---
  if (pendingSub) {
    return (
      <div className="ec-modal-overlay high-z wm-modal">
        <div className="ec-modal-content">
          <div className="wm-sub-header">
            <FaBarcode size={40} style={{ marginBottom: 10 }} />
            <h3>Validar Sustituto</h3>
            <p>
              Cantidad a sustituir: <strong>{missingQty}</strong>
            </p>
          </div>

          <div className="wm-sub-product-info">
            <p className="wm-sub-product-label">Vas a llevar:</p>
            <h3 className="wm-sub-product-name">{pendingSub.name}</h3>
            <p className="wm-sub-product-hint">
              {isMeat
                ? "Escanea la etiqueta GS1 del producto."
                : "Escanea el código de barras del producto físico."}
            </p>
          </div>

          {subError && (
            <div className="wm-error-alert">
              <div className="wm-error-icon">
                <FaExclamationTriangle />
              </div>
              <div>{subError}</div>
            </div>
          )}

          {!isSubCodeValidated ? (
            <div className="wm-verify-row">
              <button
                className="wm-camera-btn"
                onClick={handleCameraClick}
                title="Abrir Cámara"
              >
                <FaCamera size={24} />
              </button>
              <input
                ref={verifyInputRef}
                type="text"
                className="wm-verify-input"
                placeholder={
                  isMeat ? "Escanear Etiqueta GS1" : "Digitar SKU..."
                }
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value);
                  setSubError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
            </div>
          ) : (
            <>
              {/* Feedback explícito de éxito GS1 en Sustituto */}
              {isMeat && isSubCodeValidated && subMeatLabel && (
                <div
                  className="wm-gs1-success-feedback wm-gs1-success-feedback--sub"
                >
                  <div className="wm-gs1-icon">✅</div>
                  <div className="wm-gs1-details">
                    <span className="wm-gs1-title">Sustituto Aprobado</span>
                    <span className="wm-gs1-code">{subMeatLabel}</span>
                    <span className="wm-gs1-extracted-weight">
                      Peso Extraído:{" "}
                      <strong>
                        {isGS1Variable(subMeatLabel)
                          ? extractWeightFromGS1(subMeatLabel).toFixed(3)
                          : "0.000"}{" "}
                        Kg
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {isFruver && (
                <div className="wm-step-section">
                  <label className="wm-step-label">
                    Paso 2: Digitar Peso (Kg)
                  </label>
                  <div className="wm-input-row">
                    <input
                      ref={inputRefWeight}
                      type="number"
                      className="wm-weight-input"
                      placeholder="Ej: 0.500"
                      step="0.001"
                      value={subWeight}
                      onChange={(e) => {
                        setSubWeight(e.target.value);
                        setSubError("");
                      }}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        subWeight &&
                        validateAndConfirmSub()
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="wm-action-grid">
            <button
              className="wm-btn-cancel"
              onClick={() => setPendingSub(null)}
            >
              <FaArrowLeft /> Atrás
            </button>
            <button
              className="wm-btn-confirm wm-btn-confirm--warning"
              onClick={
                !isSubCodeValidated
                  ? () => handleVerify()
                  : validateAndConfirmSub
              }
              disabled={
                isSubCodeValidated && (isFruver ? !subWeight : !subMeatLabel)
              }
            >
              ✅ Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA DE BÚSQUEDA DE SUSTITUTOS ---
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
          <button
            type="button"
            className="wm-camera-btn wm-camera-btn--blue"
            onClick={handleCameraClickSearch}
            title="Escanear producto"
          >
            <FaCamera size={22} />
          </button>
          <input
            type="text"
            placeholder="Nombre, código o item..."
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
            <span className="ec-suggestion-label">
              <FaMagic /> Sugerencias (Mismo Pasillo)
            </span>
          )}
        </div>

        <div className="ec-search-results">
          {searchError && (
            <div className="wm-error-alert wm-error-alert--mb">
              <div className="wm-error-icon">
                <FaExclamationTriangle />
              </div>
              <div>{searchError}</div>
            </div>
          )}
          {loading && (
            <div className="ec-picker-centered ec-picker-centered--inline">
              <div className="ec-spinner"></div>
            </div>
          )}

          {!loading && suggestions.length === 0 && (
            <div className="ec-search-empty">
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

export default SubstituteModal;
