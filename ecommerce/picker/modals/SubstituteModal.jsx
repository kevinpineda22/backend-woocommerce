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
} from "./utils/gs1Utils";
import { isWeighable } from "../utils/isWeighable";
import { normalizeSku } from "../utils/pickerConstants";
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

  const handleSelect = async (prod) => {
    setPendingSub(prod);
    setVerifyCode("");
    setSubWeight("");
    setSubMeatLabel("");
    setIsSubCodeValidated(false);
    setBaseEanFruver(null);
    setSubError("");

    const prodIsWeighable = isWeighable(prod);

    if (!prodIsWeighable) {
      // Producto por unidad: pedir validación con código de barras normal
      setTimeout(() => verifyInputRef.current?.focus(), 200);
    } else {
      // Pesable → clasificar por unidad_medida + categoría
      const prodIsFruver = detectFruver(prod);
      const prodIsMeat = detectMeat(prod);

      if (prodIsFruver) {
        // Fruver pesable: ir directo a SIESA + peso
        setIsSubCodeValidated(true);
        if (prod.sku) {
          try {
            const res = await ecommerceApi.get(
              `/producto/base-ean-fruver/${prod.sku}`,
            );
            if (res.data?.baseEAN) {
              setBaseEanFruver(res.data.baseEAN);
            }
          } catch (e) {
            console.error("Error trayendo EAN Fruver Sustituto", e);
          }
        }
        setTimeout(() => inputRefWeight.current?.focus(), 200);
      } else if (prodIsMeat) {
        // Cárnico pesable: pedir escaneo GS1
        setTimeout(() => verifyInputRef.current?.focus(), 200);
      } else {
        // Otro pesable: pedir escaneo GS1
        setTimeout(() => verifyInputRef.current?.focus(), 200);
      }
    }
  };

  const validateCode = (codeToCheck, product) => {
    const rawInput = codeToCheck.trim().toUpperCase();
    const sku = (product.sku || "").toUpperCase();
    const unidad = (product.unidad_medida || "").toUpperCase();
    const barcode = (product.barcode || "").toString().trim().toUpperCase();
    const cleanInput = normalizeSku(rawInput, unidad);

    // Validar contra SKU y BARCODE
    const skuMatch =
      rawInput === sku ||
      cleanInput === sku ||
      rawInput.includes(sku) ||
      sku.includes(rawInput) ||
      cleanInput.includes(sku) ||
      sku.includes(cleanInput);

    const barcodeMatch =
      rawInput === barcode ||
      cleanInput === barcode ||
      rawInput.includes(barcode) ||
      barcode.includes(rawInput) ||
      cleanInput.includes(barcode) ||
      barcode.includes(cleanInput);

    return skuMatch || barcodeMatch;
  };

  const handleVerify = async (manualInput = null) => {
    if (!pendingSub) return;
    const code = manualInput || verifyCode;

    let isValid = false;
    let isFastPass = false;
    let hasDetailedError = false;
    let cleanCode = code.trim().toUpperCase();
    const expectedSku = (pendingSub.sku || "").toUpperCase();

    // FAST-PASS PARA SUSTITUTOS CÁRNICOS (solo si es pesable por unidad_medida):
    if (isMeat && isWeighable(pendingSub)) {
      if (isGS1Variable(cleanCode)) {
        // ✅ CORREGIDO: Siempre substring(0,7) para prefijo, substring(2,7) para PLU
        const gs1Prefix = extractGS1Prefix(cleanCode);
        const gs1Sku = extractGS1Sku(cleanCode);

        // Verificar contra barcodes conocidos del sustituto
        const barcodes = Array.isArray(pendingSub.barcode)
          ? pendingSub.barcode
          : [pendingSub.barcode];
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
            console.warn(
              "Error validando GS1 sustituto en backend:",
              e.message,
            );
          }
        }

        if (prefixMatch || skuMatch) {
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
      // Productos por unidad: Validar contra SIESA
      try {
        // Extraer f120_id y unidad_medida del SKU (ej: "1039P2" → f120_id=1039, um=P2)
        const skuMatch = expectedSku.match(/^(\d+)([A-Z]+\d*)$/);
        const f120Id = skuMatch ? parseInt(skuMatch[1]) : null;
        // Usar unidad_medida del SKU si está disponible, sino usar la del producto
        const umEsperada =
          (skuMatch && skuMatch[2]) || pendingSub.unidad_medida || "UND";

        if (f120Id) {
          // Usar el mismo endpoint de validación que auditor
          const res = await ecommerceApi.post(`/validar-codigo-auditor`, {
            codigo: cleanCode,
            f120_id_esperado: f120Id,
            unidad_medida_esperada: umEsperada,
          });
          isValid = res.data?.valid ?? false;

          if (!isValid) {
            setSubError(
              res.data?.message ||
                `❌ Código incorrecto. Verifica que estés escaneando el producto correcto.`,
            );
            hasDetailedError = true;
          }
        } else {
          // Fallback a validación local si no hay f120_id
          isValid = validateCode(code, pendingSub);
        }
      } catch (error) {
        console.warn("Error validando código en SIESA:", error.message);
        // Fallback a validación local en caso de error
        isValid = validateCode(code, pendingSub);
      }
    }

    if (isValid) {
      setSubError("");
      setIsSubCodeValidated(true);

      const expectedSuffixCode = normalizeSku(
        cleanCode,
        (pendingSub.unidad_medida || "").toUpperCase(),
      );

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

      // Si no es pesable (producto por unidad), terminar directamente tras validar código
      if (!isWeighable(pendingSub)) {
        onConfirmSubstitute(
          pendingSub,
          missingQty,
          pendingSub.barcode || pendingSub.sku,
        );
        return;
      }

      if (isFastPass) {
        // Carnes: listo para enviar
      }
    } else {
      // Si no hay error detallado de SIESA, mostrar genérico
      if (!hasDetailedError) {
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setSubError(
          `❌ Código incorrecto. Verifica que estés escaneando el producto correcto.`,
        );
      } else if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      setIsSubCodeValidated(false);
      setVerifyCode("");
      verifyInputRef.current?.focus();
    }
  };

  const validateAndConfirmSub = () => {
    if (!isSubCodeValidated) return;
    let finalCodeToSave = pendingSub.barcode || pendingSub.sku;

    if (isFruver) {
      const valGramos = parseFloat(subWeight);
      if (!valGramos || isNaN(valGramos) || valGramos <= 0) {
        setSubError("❌ Ingresa un peso válido en gramos.");
        inputRefWeight.current?.focus();
        return;
      }
      if (!baseEanFruver) {
        setSubError(
          "❌ No se encontró código GS1 en SIESA para este producto. Contacta al supervisor.",
        );
        return;
      }
      const gs1Prefix = baseEanFruver.replace(/\+$/, "");
      const pesoGramosStr = Math.round(valGramos).toString().padStart(5, "0");
      const codigoSinCheck = `${gs1Prefix}${pesoGramosStr}`;
      const checkDigit = calcularDigitoVerificador(codigoSinCheck);
      if (checkDigit) {
        finalCodeToSave = `${codigoSinCheck}${checkDigit}`;
      } else {
        setSubError(
          `❌ Error generando código GS1. Prefijo: ${gs1Prefix}, Peso: ${pesoGramosStr}`,
        );
        return;
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
            {!isFruver && (
              <p className="wm-sub-product-hint">
                {isMeat && isWeighable(pendingSub)
                  ? "Escanea la etiqueta GS1 del producto."
                  : "Escanea o digita el código de barras del producto."}
              </p>
            )}
          </div>

          {subError && (
            <div className="wm-error-alert">
              <div className="wm-error-icon">
                <FaExclamationTriangle />
              </div>
              <div>{subError}</div>
            </div>
          )}

          {/* PRODUCTOS POR UNIDAD Y CARNES: Escaneo / digitación de código */}
          {!isFruver && !isSubCodeValidated && (
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
                  isMeat && isWeighable(pendingSub)
                    ? "Escanear Etiqueta GS1"
                    : "Escanear código de barras"
                }
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value);
                  setSubError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              />
            </div>
          )}

          {/* CARNES PESABLES: Feedback GS1 aprobado */}
          {isMeat &&
            isWeighable(pendingSub) &&
            isSubCodeValidated &&
            subMeatLabel && (
              <div className="wm-gs1-success-feedback wm-gs1-success-feedback--sub">
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

          {/* FRUVER: Prefijo SIESA bloqueado + peso en gramos */}
          {isFruver && baseEanFruver && (
            <div className="wm-step-section">
              <label className="wm-step-label">Código de salida</label>
              <div className="wm-concat-row">
                <div className="wm-concat-prefix" title="Prefijo GS1 (SIESA)">
                  {baseEanFruver.replace(/\+$/, "")}
                </div>
                <div className="wm-concat-separator">+</div>
                <div className="wm-concat-weight-wrap">
                  <input
                    ref={inputRefWeight}
                    type="number"
                    className="wm-concat-weight-input"
                    placeholder="Peso (g)"
                    step="1"
                    value={subWeight}
                    onChange={(e) => {
                      setSubWeight(e.target.value);
                      setSubError("");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && subWeight && validateAndConfirmSub()
                    }
                  />
                  <span className="wm-concat-weight-unit">g</span>
                </div>
                <div className="wm-concat-separator">+</div>
                <div
                  className="wm-concat-check"
                  title="Dígito verificador (auto)"
                >
                  {(() => {
                    if (
                      !subWeight ||
                      isNaN(parseFloat(subWeight)) ||
                      parseFloat(subWeight) <= 0
                    )
                      return "?";
                    const prefix = baseEanFruver.replace(/\+$/, "");
                    const pesoStr = Math.round(parseFloat(subWeight))
                      .toString()
                      .padStart(5, "0");
                    const sinCheck = `${prefix}${pesoStr}`;
                    const chk = calcularDigitoVerificador(sinCheck);
                    return chk || "?";
                  })()}
                </div>
              </div>

              {/* Preview código final */}
              {subWeight &&
                !isNaN(parseFloat(subWeight)) &&
                parseFloat(subWeight) > 0 && (
                  <div className="wm-concat-preview">
                    <span className="wm-concat-preview-label">
                      Código final:
                    </span>
                    <span className="wm-concat-preview-code">
                      {(() => {
                        const prefix = baseEanFruver.replace(/\+$/, "");
                        const pesoStr = Math.round(parseFloat(subWeight))
                          .toString()
                          .padStart(5, "0");
                        const sinCheck = `${prefix}${pesoStr}`;
                        const chk = calcularDigitoVerificador(sinCheck);
                        return chk ? `${sinCheck}${chk}` : sinCheck;
                      })()}
                    </span>
                  </div>
                )}
            </div>
          )}

          {/* FRUVER: Error si no se encontró SIESA */}
          {isFruver && !baseEanFruver && (
            <div className="wm-error-alert">
              <div className="wm-error-icon">
                <FaExclamationTriangle />
              </div>
              <div>
                No se encontró código GS1 en SIESA para este producto. Contacta
                al supervisor.
              </div>
            </div>
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
                isFruver
                  ? !subWeight || !baseEanFruver
                  : isMeat && isWeighable(pendingSub)
                    ? isSubCodeValidated && !subMeatLabel
                    : !verifyCode && !isSubCodeValidated
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
