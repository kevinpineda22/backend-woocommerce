import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FaWeightHanging,
  FaCamera,
  FaExclamationTriangle,
  FaSpinner,
} from "react-icons/fa";
import { ecommerceApi } from "../../shared/ecommerceApi";
import { detectMeat, detectFruver } from "./utils/categoryDetection";
import {
  calcularDigitoVerificador,
  isGS1Variable,
  extractWeightFromGS1,
  toKgForValidation,
  validateWeightTolerance,
  formatCOP,
} from "./utils/gs1Utils";
import "../Modals.css";

// --- MODAL DE PESO INTELIGENTE (CARNES VS FRUVER CON PRECIO EN VIVO) ---
const WeightModal = ({ isOpen, item, onClose, onConfirm, onRequestScan }) => {
  const [weight, setWeight] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [meatLabel, setMeatLabel] = useState("");

  const inputRefWeight = useRef(null);
  const inputRefCode = useRef(null);
  const inputRefMeatLabel = useRef(null);

  // Estados para validación estricta y Fruver
  const [isCodeValidated, setIsCodeValidated] = useState(false);
  const [baseEanFruver, setBaseEanFruver] = useState(null);
  const [loadingBaseEan, setLoadingBaseEan] = useState(false);

  const isMeat = useMemo(() => detectMeat(item), [item]);
  const isFruver = useMemo(() => detectFruver(item), [item]);

  // ✅ CÁLCULO DEL PRECIO EN TIEMPO REAL
  const calculatedPrice = useMemo(() => {
    if (!item) return 0;
    const pum = parseFloat(item.price || 0);
    const unidad = (item.unidad_medida || "KG").toUpperCase();

    let weightInDisplayUnits = 0;

    if (isFruver) {
      if (!weight || isNaN(parseFloat(weight))) return 0;
      weightInDisplayUnits = parseFloat(weight) / 1000;
    } else if (isMeat) {
      if (meatLabel && isGS1Variable(meatLabel)) {
        const weightInKg = extractWeightFromGS1(meatLabel);
        weightInDisplayUnits =
          unidad === "LB" || unidad === "LIBRA" ? weightInKg * 2 : weightInKg;
      } else {
        weightInDisplayUnits = parseFloat(item.quantity_total) || 1;
      }
    }

    return pum * weightInDisplayUnits;
  }, [item, weight, meatLabel, isFruver, isMeat]);

  // Auto-focus inteligente al abrir el modal y carga EAN Base Fruver
  useEffect(() => {
    if (isOpen) {
      setWeight("");
      setCode("");
      setError("");
      setIsCodeValidated(false);
      setBaseEanFruver(null);
      setMeatLabel("");

      // Si es Fruver, buscamos su código GS1 "29" directamente en SIESA
      if (isFruver && item?.sku) {
        setLoadingBaseEan(true);
        ecommerceApi
          .get(`/producto/base-ean-fruver/${item.sku}`)
          .then((res) => {
            if (res.data && res.data.baseEAN) {
              setBaseEanFruver(res.data.baseEAN);
              // Auto-validar: el código viene de SIESA, no necesita validación manual
              setCode(res.data.baseEAN);
              setIsCodeValidated(true);
              // Focus directo al peso
              setTimeout(() => {
                if (inputRefWeight.current) inputRefWeight.current.focus();
              }, 150);
            }
          })
          .catch(() => {
            // Si falla SIESA, el picker verá el error al intentar confirmar
          })
          .finally(() => {
            setLoadingBaseEan(false);
          });
      }

      // Para carnes, focus al input de código
      if (isMeat) {
        setTimeout(() => {
          if (inputRefCode.current) inputRefCode.current.focus();
        }, 100);
      }
    }
  }, [isOpen, isMeat, isFruver, item]);

  // Validación INICIAL del SKU/EAN antes de permitir pesar
  const handleValidateCode = async (scannedCode = null) => {
    if (!item) return;
    const actualCode = typeof scannedCode === "string" ? scannedCode : code;
    const rawCode = actualCode.trim().toUpperCase();
    let cleanCode = rawCode;
    const expectedSku = (item.sku || "").toUpperCase();
    const expectedBarcode = item.barcode || "";
    const unidad = (item.unidad_medida || "").toUpperCase();

    // Si digitan el código corto, le agregamos el sufijo esperado
    if (unidad === "LB" || unidad === "LIBRA") {
      if (!cleanCode.endsWith("-LB")) cleanCode += "-LB";
    } else if (unidad === "KL" || unidad === "KILO" || unidad === "KG") {
      if (!cleanCode.endsWith("-KL")) cleanCode += "-KL";
    }

    let isValidCode = false;
    let isFastPass = false;

    if (isMeat) {
      if (isGS1Variable(rawCode)) {
        // Formato GS1: 29(item5digitos)[0padding](peso5digitos)(check1digito)
        const gs1Prefix = rawCode.substring(0, 7);
        const gs1Sku = rawCode.substring(2, 7);

        // Verificar si el prefijo coincide con algún barcode conocido del producto
        const barcodes = Array.isArray(expectedBarcode)
          ? expectedBarcode
          : [expectedBarcode];
        let prefixMatch = barcodes.some((b) => {
          if (!b) return false;
          const bStr = b.toString().toUpperCase().replace(/\+$/, "");
          if (bStr.startsWith("2") && bStr.length >= 7) {
            return gs1Prefix === bStr.substring(0, 7);
          }
          return false;
        });

        // También comparar PLU contra el SKU del producto
        const skuMatch =
          gs1Sku === expectedSku ||
          parseInt(gs1Sku).toString() === expectedSku ||
          gs1Sku === expectedSku.split("-")[0] ||
          parseInt(gs1Sku).toString() === expectedSku.split("-")[0];

        // Si no hubo match local, validar contra SIESA en el backend
        if (!prefixMatch && !skuMatch) {
          try {
            const skuNumeric = expectedSku.match(/^(\d+)/)?.[1];
            const f120Id = skuNumeric ? parseInt(skuNumeric) : null;
            const umEsperada = item.unidad_medida?.toUpperCase() || "LB";

            if (f120Id) {
              const res = await ecommerceApi.post(`/validar-codigo-siesa`, {
                codigo: rawCode,
                f120_id_esperado: f120Id,
                unidad_medida_esperada: umEsperada,
              });
              if (res.data.valid) {
                prefixMatch = true;
              }
            }
          } catch (e) {
            console.warn("Error validando GS1 en backend:", e.message);
          }
        }

        if (prefixMatch || skuMatch) {
          isValidCode = true;
          isFastPass = true;
        }
      }

      if (!isFastPass) {
        setError(
          `❌ Debes escanear o digitar la etiqueta GS1 completa (13 o 14 dígitos). Asegúrate de que corresponda al producto correcto.`,
        );
        setIsCodeValidated(false);
        if (inputRefCode.current) inputRefCode.current.focus();
        return;
      }
    } else {
      // Soporte robusto paramétrico (Array o String) desde SIESA
      const checkBarcodeMath = (barcode) => {
        if (!barcode) return false;
        const b = barcode.toString().toUpperCase();
        return rawCode === b || cleanCode === b || b.endsWith(rawCode);
      };

      const barcodeMatches = Array.isArray(expectedBarcode)
        ? expectedBarcode.some(checkBarcodeMath)
        : checkBarcodeMath(expectedBarcode);

      // Para Fruver: aceptar el f120_id base
      const expectedNumeric = expectedSku.match(/^(\d+)/)?.[1] || "";
      const isBaseIdMatch =
        isFruver && /^\d+$/.test(rawCode) && rawCode === expectedNumeric;

      isValidCode =
        rawCode === expectedSku ||
        cleanCode === expectedSku ||
        barcodeMatches ||
        isBaseIdMatch;
    }

    if (!rawCode) {
      setError(`❌ Digita el código o ítem del producto.`);
      inputRefCode.current?.focus();
      return;
    }

    if (isValidCode) {
      if (cleanCode !== rawCode && cleanCode === expectedSku)
        setCode(cleanCode);

      setError("");
      setIsCodeValidated(true);

      if (isFastPass) {
        setMeatLabel(rawCode);
      } else {
        setTimeout(() => {
          if (isFruver) inputRefWeight.current?.focus();
        }, 100);
      }
    } else {
      setError(`❌ Código incorrecto. Verifica el ítem.`);
      setIsCodeValidated(false);
      inputRefCode.current?.focus();
    }
  };

  // Validaciones FINALES antes de enviar a canasta
  const validateAndConfirm = () => {
    if (!isCodeValidated) {
      setError(`❌ Primero debes validar el código del producto.`);
      inputRefCode.current?.focus();
      return;
    }

    if (isFruver && !baseEanFruver) {
      setError(
        `❌ Este producto no tiene código de peso registrado. Contacta al supervisor.`,
      );
      return;
    }

    let finalCodeToSave = code.trim().toUpperCase();
    let finalWeight = 0;

    // --- RAMA FRUVER ---
    if (isFruver) {
      const valGramos = parseFloat(weight);

      if (!valGramos || isNaN(valGramos) || valGramos <= 0) {
        setError(`❌ Ingresa un peso válido en gramos.`);
        inputRefWeight.current?.focus();
        return;
      }

      finalWeight = valGramos / 1000;

      if (!baseEanFruver) {
        setError(`❌ No se encontró código GS1 en SIESA para este producto.`);
        return;
      }

      // Usar el prefijo GS1 real de SIESA (ej: "2900002" para item 4736)
      // Formato final: prefijo(7d) + peso(5d) + check(1d) = 13 dígitos (EAN-13)
      const gs1Prefix = baseEanFruver.replace(/\+$/, "");
      const pesoGramosStr = Math.round(valGramos).toString().padStart(5, "0");
      const codigoSinCheck = `${gs1Prefix}${pesoGramosStr}`;
      const checkDigit = calcularDigitoVerificador(codigoSinCheck);

      if (checkDigit) {
        finalCodeToSave = `${codigoSinCheck}${checkDigit}`;
      } else {
        setError(`❌ Error generando código GS1. Prefijo: ${gs1Prefix}, Peso: ${pesoGramosStr}`);
        return;
      }
    }
    // --- RAMA CARNICERÍA ---
    else if (isMeat) {
      if (!meatLabel || meatLabel.length < 8) {
        setError(
          "❌ Debes escanear la etiqueta generada por la báscula de carnicería.",
        );
        inputRefMeatLabel.current?.focus();
        return;
      }
      finalCodeToSave = meatLabel.trim().toUpperCase();

      if (isGS1Variable(finalCodeToSave)) {
        const extracted = extractWeightFromGS1(finalCodeToSave);
        finalWeight =
          extracted > 0 ? extracted : parseFloat(item.quantity_total) || 1;
      } else {
        finalWeight = parseFloat(item.quantity_total) || 1;
      }
    }

    onConfirm(finalWeight, finalCodeToSave);
  };

  if (!isOpen || !item) return null;

  return (
    <div className="ec-modal-overlay wm-modal">
      <div className="ec-modal-content">
        {/* HEADER */}
        <div className="wm-header">
          <FaWeightHanging size={40} className="wm-header-icon" />
          <h3>{isMeat ? "Validar y Pesar Cárnico" : "Digitar Peso"}</h3>
          <p className="wm-product-name">{item.name}</p>
          <div className="wm-request-badge">
            Solicitado:{" "}
            <strong>
              {item.quantity_total} {item.unidad_medida || "Kg"}
              {(item.unidad_medida || "").toUpperCase() === "LB" ||
              (item.unidad_medida || "").toUpperCase() === "LIBRA"
                ? ` (≈ ${Math.round(parseFloat(item.quantity_total) * 500)}g)`
                : ` (≈ ${Math.round(parseFloat(item.quantity_total) * 1000)}g)`}
            </strong>
          </div>
          {isFruver && loadingBaseEan && (
            <p className="wm-info-loading">
              <FaSpinner className="ec-spin" /> Configurando producto...
            </p>
          )}
          {isFruver && !loadingBaseEan && !baseEanFruver && (
            <div className="wm-error-alert">
              <div className="wm-error-icon"><FaExclamationTriangle /></div>
              <div>No se encontró código GS1 en SIESA para este producto. Contacta al supervisor.</div>
            </div>
          )}
        </div>

        {/* CARNES: Input de código GS1 (escaneo manual) */}
        {isMeat && (
          <div className="wm-step-section">
            <label className="wm-step-label">
              Paso Único: Escanear o Digitar Etiqueta GS1
            </label>
            <div className="wm-input-row">
              <button
                className="wm-camera-btn"
                disabled={isCodeValidated}
                onClick={() => {
                  if (!isCodeValidated && onRequestScan) {
                    onRequestScan((scannedVal) => {
                      setCode(scannedVal);
                      setTimeout(() => handleValidateCode(scannedVal), 150);
                    });
                  }
                }}
                title="Abrir Cámara"
              >
                <FaCamera size={22} />
              </button>
              <input
                ref={inputRefCode}
                type="text"
                className={`wm-code-input ${isCodeValidated ? "validated" : ""} ${!isCodeValidated && code.length > 0 ? "has-button" : ""}`}
                placeholder="Ej: 2915132001000"
                value={code}
                disabled={isCodeValidated}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCodeValidated) handleValidateCode();
                }}
              />
              {!isCodeValidated && code.length > 0 && (
                <button className="wm-validate-btn" onClick={handleValidateCode}>
                  Validar
                </button>
              )}
            </div>

            {/* Feedback explícito de éxito GS1 */}
            {isCodeValidated && meatLabel && (
              <div className="wm-gs1-success-feedback">
                <div className="wm-gs1-icon">✅</div>
                <div className="wm-gs1-details">
                  <span className="wm-gs1-title">Etiqueta GS1 Aprobada</span>
                  <span className="wm-gs1-code">{meatLabel}</span>
                  <span className="wm-gs1-extracted-weight">
                    Peso Extraído:{" "}
                    <strong>
                      {isGS1Variable(meatLabel)
                        ? extractWeightFromGS1(meatLabel).toFixed(3)
                        : "0.000"}{" "}
                      Kg
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FRUVER: Prefijo GS1 bloqueado + Input de peso concatenado */}
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
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) =>
                    e.key === "Enter" && weight && validateAndConfirm()
                  }
                />
                <span className="wm-concat-weight-unit">g</span>
              </div>
              <div className="wm-concat-separator">+</div>
              <div className="wm-concat-check" title="Dígito verificador (auto)">
                {(() => {
                  if (!weight || isNaN(parseFloat(weight)) || parseFloat(weight) <= 0) return "?";
                  const prefix = baseEanFruver.replace(/\+$/, "");
                  const pesoStr = Math.round(parseFloat(weight)).toString().padStart(5, "0");
                  const sinCheck = `${prefix}${pesoStr}`;
                  const chk = calcularDigitoVerificador(sinCheck);
                  return chk || "?";
                })()}
              </div>
            </div>

            {/* Preview del código final concatenado */}
            {weight && !isNaN(parseFloat(weight)) && parseFloat(weight) > 0 && (
              <div className="wm-concat-preview">
                <span className="wm-concat-preview-label">Código final:</span>
                <span className="wm-concat-preview-code">
                  {(() => {
                    const prefix = baseEanFruver.replace(/\+$/, "");
                    const pesoStr = Math.round(parseFloat(weight)).toString().padStart(5, "0");
                    const sinCheck = `${prefix}${pesoStr}`;
                    const chk = calcularDigitoVerificador(sinCheck);
                    return chk ? `${sinCheck}${chk}` : sinCheck;
                  })()}
                </span>
              </div>
            )}

          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="wm-error-alert">
            <div className="wm-error-icon">
              <FaExclamationTriangle />
            </div>
            <div>{error}</div>
          </div>
        )}

        {/* BOTONES */}
        <div className="wm-action-grid">
          <button className="wm-btn-cancel" onClick={onClose}>
            ✕ Cancelar
          </button>
          <button
            className="wm-btn-confirm"
            onClick={validateAndConfirm}
            disabled={
              !isCodeValidated ||
              (isFruver && !weight) ||
              (isMeat && !meatLabel)
            }
          >
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default WeightModal;
