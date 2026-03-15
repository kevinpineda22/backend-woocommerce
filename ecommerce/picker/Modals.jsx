import React, { useState, useEffect, useRef, useMemo } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
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
  FaSpinner,
} from "react-icons/fa";
import "./Modals.css";

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
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <FaKeyboard size={48} color="#3b82f6" />
          <h3 style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 12 }}>
            Digitar Código
          </h3>
          <p
            className="ec-text-secondary"
            style={{ fontSize: "1.05rem", lineHeight: 1.5 }}
          >
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
            // 🛡️ ANTI-BUG: Prevenir espacios fantasmas y saltos de línea al escribir o pegar
            onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
            onPaste={(e) => {
              e.preventDefault();
              const pastedText = e.clipboardData
                .getData("text")
                .replace(/\s+/g, "");
              setCode(pastedText);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              code.trim().length > 0 &&
              onConfirm(code.trim())
            }
          />
        </div>
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            ✕ Cancelar
          </button>
          <button
            className="ec-reason-btn"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "white",
              width: "100%",
            }}
            onClick={() => {
              if (code.trim().length > 0) onConfirm(code.trim());
            }}
            disabled={!code.trim()}
          >
            ✅ Validar
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MODAL DE PESO INTELIGENTE (CARNES VS FRUVER CON PRECIO EN VIVO) ---
export const WeightModal = ({
  isOpen,
  item,
  onClose,
  onConfirm,
  onRequestScan,
}) => {
  const [weight, setWeight] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [meatLabel, setMeatLabel] = useState(""); // ✅ NUEVO: Para código final de la báscula de carnes

  const inputRefWeight = useRef(null);
  const inputRefCode = useRef(null);
  const inputRefMeatLabel = useRef(null); // ✅ NUEVO

  // Estados para validación estricta y Fruver
  const [isCodeValidated, setIsCodeValidated] = useState(false);
  const [baseEanFruver, setBaseEanFruver] = useState(null);
  const [loadingBaseEan, setLoadingBaseEan] = useState(false);

  // Algoritmo EAN-13
  const calcularDigitoVerificador = (codigo12) => {
    if (codigo12.length !== 12) return null;
    let sumaImpares = 0;
    let sumaPares = 0;
    for (let i = 0; i < 12; i++) {
      const digito = parseInt(codigo12[i]);
      if ((i + 1) % 2 !== 0)
        sumaImpares += digito; // Impar
      else sumaPares += digito; // Par
    }
    const total = sumaImpares + sumaPares * 3;
    const siguienteDecena = Math.ceil(total / 10) * 10;
    return (siguienteDecena - total).toString();
  };

  // 🧠 LÓGICA A PRUEBA DE BALAS: Detecta cárnicos SOLO por categoría, no por nombre
  const isMeat = useMemo(() => {
    if (!item) return false;

    const catReales = Array.isArray(item.categorias_reales)
      ? item.categorias_reales.join(" ").toLowerCase()
      : "";
    const catNormales = Array.isArray(item.categorias)
      ? item.categorias
          .map((c) => c.name)
          .join(" ")
          .toLowerCase()
      : "";

    // Dividimos por espacios, comas, guiones, etc para comparar palabras exactas
    const categoriesWords = `${catReales} ${catNormales}`.split(/[\s,.-]+/);

    // Lista gigante de palabras clave para atrapar cualquier corte en las categorías
    const meatKeywords = [
      "carne",
      "carnes",
      "pollo",
      "pollos",
      "pescado",
      "pescados",
      "res",
      "cerdo",
      "carnicería",
      "carniceria",
      "embutido",
      "embutidos",
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
      "salchichas",
      "pescaderia",
      "pescadería",
      "marisco",
      "mariscos",
      "camaron",
      "camarones",
    ];

    // Ahora verificamos con palabras exactas, evitando problemas con "lico-res" (res)
    return categoriesWords.some((word) => meatKeywords.includes(word));
  }, [item]);

  // Detección de Fruver
  const isFruver = useMemo(() => {
    if (!item || isMeat) return false;

    const catReales = Array.isArray(item.categorias_reales)
      ? item.categorias_reales.join(" ").toLowerCase()
      : "";
    const catNormales = Array.isArray(item.categorias)
      ? item.categorias
          .map((c) => c.name)
          .join(" ")
          .toLowerCase()
      : "";

    const categoriesWords = `${catReales} ${catNormales}`.split(/[\s,.-]+/);
    const fruverKeywords = [
      "fruver",
      "fruta",
      "frutas",
      "verdura",
      "verduras",
      "hortaliza",
      "hortalizas",
      "legumbre",
      "legumbres",
    ];

    const isWeighableUnit =
      item.unidad_medida &&
      ["kl", "kg", "kilo", "lb", "libra"].includes(
        item.unidad_medida.toLowerCase(),
      );
    return (
      isWeighableUnit || categoriesWords.some((w) => fruverKeywords.includes(w))
    );
  }, [item, isMeat]);

  // ✅ CÁLCULO DEL PRECIO EN TIEMPO REAL
  const calculatedPrice = useMemo(() => {
    if (!item) return 0;
    const pum = parseFloat(item.price || 0);
    const unidad = (item.unidad_medida || "KG").toUpperCase();

    // Multiplicador base (ej: si piden libras, hay que convertir porque la báscula siempre pesa en KG/Gramos nativos)
    let weightInDisplayUnits = 0;

    if (isFruver) {
      if (!weight || isNaN(parseFloat(weight))) return 0;
      weightInDisplayUnits = parseFloat(weight); // Fruver digita kilos, asumimos que eso quiere la app.
    } else if (isMeat) {
      // Extraer peso solo si es un código GS1 de peso variable (empieza por 2 y tiene 13 o 14 dígitos)
      if (
        meatLabel &&
        (meatLabel.length === 13 || meatLabel.length === 14) &&
        /^\d+$/.test(meatLabel) &&
        meatLabel.startsWith("2")
      ) {
        // El peso siempre son los 5 dígitos antes del dígito verificador final
        const startIdx = meatLabel.length === 13 ? 7 : 8;
        const endIdx = meatLabel.length === 13 ? 12 : 13;
        const pesoGramos = parseInt(meatLabel.substring(startIdx, endIdx));
        if (!isNaN(pesoGramos)) {
          const weightInKg = pesoGramos / 1000;
          // Si en Siesa el precio está por LIBRA (LB), convertimos los KG de la báscula a Libras (1KG = 2 Libras colombianas)
          weightInDisplayUnits =
            unidad === "LB" || unidad === "LIBRA" ? weightInKg * 2 : weightInKg;
        }
      } else {
        weightInDisplayUnits = parseFloat(item.quantity_total) || 1; // Base si no ha escaneado la etiqueta o es unidad
      }
    }

    return pum * weightInDisplayUnits;
  }, [item, weight, meatLabel, isFruver, isMeat]);

  // Formateador de moneda (Pesos Colombianos)
  const formatPrice = (p) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(p);

  // Auto-focus inteligente al abrir el modal y carga EAN Base Fruver
  useEffect(() => {
    if (isOpen) {
      setWeight("");
      setCode("");
      setError("");
      setIsCodeValidated(false);
      setBaseEanFruver(null);
      setMeatLabel(""); // ✅ LIMPIAMOS

      // Si es Fruver, buscamos su código base EAN en BD
      if (isFruver && item?.sku) {
        setLoadingBaseEan(true);
        ecommerceApi
          .get(`/producto/base-ean-fruver/${item.sku}`)
          .then((res) => {
            if (res.data && res.data.baseEAN) {
              setBaseEanFruver(res.data.baseEAN);
            }
          })
          .catch((err) => {
            setError(
              `❌ No se encontró Código Base EAN para este Fruver (SKU: ${item.sku})`,
            );
          })
          .finally(() => {
            setLoadingBaseEan(false);
          });
      }

      setTimeout(() => {
        // Ahora TODOS (Carnes y Fruver) deben validar código primero
        if (inputRefCode.current) inputRefCode.current.focus();
      }, 100);
    }
  }, [isOpen, isMeat, isFruver, item]);

  // Validación INICIAL del SKU/EAN antes de permitir pesar
  const handleValidateCode = (scannedCode = null) => {
    if (!item) return;
    const actualCode = typeof scannedCode === "string" ? scannedCode : code;
    const rawCode = actualCode.trim().toUpperCase();
    let cleanCode = rawCode;
    const expectedSku = (item.sku || "").toUpperCase();
    const expectedBarcode = item.barcode || "";
    const unidad = (item.unidad_medida || "").toUpperCase();

    // Si digitan el código corto (ej. 12345), le agregamos el sufijo esperado para compararlo con el SKU real (ej. 12345-LB)
    if (unidad === "LB" || unidad === "LIBRA") {
      if (!cleanCode.endsWith("-LB")) cleanCode += "-LB";
    } else if (unidad === "KL" || unidad === "KILO" || unidad === "KG") {
      if (!cleanCode.endsWith("-KL")) cleanCode += "-KL";
    }

    let isValidCode = false;
    let isFastPass = false;

    if (isMeat) {
      if (
        (rawCode.length === 13 || rawCode.length === 14) &&
        /^\d+$/.test(rawCode) &&
        rawCode.startsWith("2")
      ) {
        const gs1Sku =
          rawCode.length === 13
            ? rawCode.substring(1, 6)
            : rawCode.substring(2, 7);
        if (
          gs1Sku === expectedSku ||
          parseInt(gs1Sku).toString() === expectedSku ||
          gs1Sku === expectedSku.split("-")[0] ||
          parseInt(gs1Sku).toString() === expectedSku.split("-")[0]
        ) {
          const startIdx = rawCode.length === 13 ? 7 : 8;
          const endIdx = rawCode.length === 13 ? 12 : 13;
          const pesoGramos = parseInt(rawCode.substring(startIdx, endIdx));
          const extractedWeight =
            !isNaN(pesoGramos) && pesoGramos > 0 ? pesoGramos / 1000 : 0;

          const requested = parseFloat(item.quantity_total);
          const unidad = (item.unidad_medida || "KG").toUpperCase();
          const requestedInKgForValidation =
            unidad === "LB" || unidad === "LIBRA" ? requested / 2 : requested;

          const minAllowed = requestedInKgForValidation - 0.05;
          const maxAllowed = requestedInKgForValidation + 0.05;

          if (extractedWeight < minAllowed) {
            setError(
              `❌ Mínimo permitido: ${minAllowed.toFixed(3)} Kg (Etiqueta escaneada indica: ${extractedWeight.toFixed(3)} Kg)`,
            );
            setIsCodeValidated(false);
            if (inputRefCode.current) inputRefCode.current.focus();
            return;
          }
          if (extractedWeight > maxAllowed) {
            setError(
              `❌ Máximo permitido: ${maxAllowed.toFixed(3)} Kg (Excedido por ${((extractedWeight - maxAllowed) * 1000).toFixed(0)}g)`,
            );
            setIsCodeValidated(false);
            if (inputRefCode.current) inputRefCode.current.focus();
            return;
          }

          isValidCode = true;
          isFastPass = true;
        }
      }

      if (!isFastPass) {
        setError(
          `❌ Debes escanear o digitar la etiqueta GS1 completa (13 o 14 dígitos).`,
        );
        setIsCodeValidated(false);
        if (inputRefCode.current) inputRefCode.current.focus();
        return;
      }
    } else {
      // ✅ NUEVO: Soporte robusto paramétrico (Array o String) desde SIESA
      const checkBarcodeMath = (barcode) => {
        if (!barcode) return false;
        const b = barcode.toString().toUpperCase();
        return rawCode === b || cleanCode === b || b.endsWith(rawCode);
      };

      const barcodeMatches = Array.isArray(expectedBarcode)
        ? expectedBarcode.some(checkBarcodeMath)
        : checkBarcodeMath(expectedBarcode);

      isValidCode =
        rawCode === expectedSku || cleanCode === expectedSku || barcodeMatches;
    }

    if (!rawCode) {
      setError(`❌ Digita el código o ítem del producto.`);
      inputRefCode.current?.focus();
      return;
    }

    if (isValidCode) {
      if (cleanCode !== rawCode && cleanCode === expectedSku)
        setCode(cleanCode); // Si uso el sufijo para emparejar el SKU, actualizamos el texto de input

      setError("");
      setIsCodeValidated(true);

      if (isFastPass) {
        setMeatLabel(rawCode); // Guardamos la etiqueta completa para extraer el peso
        // No avanzamos el focus a ningún lado, ya tiene todo para enviar.
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
      setError(`❌ Bloqueado: No se encontró Base EAN para este producto.`);
      return;
    }

    let finalCodeToSave = code.trim().toUpperCase();
    let finalWeight = 0;

    // --- RAMA FRUVER ---
    if (isFruver) {
      const val = parseFloat(weight);

      if (!val || isNaN(val)) {
        setError(`❌ Ingresa un peso válido.`);
        inputRefWeight.current?.focus();
        return;
      }

      finalWeight = val;
      if (baseEanFruver) {
        const pesoGramos = Math.round(val * 1000)
          .toString()
          .padStart(5, "0");
        const codigoSinCheck = `${baseEanFruver}${pesoGramos}`;
        const checkDigit = calcularDigitoVerificador(codigoSinCheck);
        if (checkDigit) {
          finalCodeToSave = `${codigoSinCheck}${checkDigit}`;
          console.log("🍏 EAN Fruver Generado Exitosamente:", finalCodeToSave);
        }
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

      // Intentar extraer el peso (los últimos 5 dígitos antes del verificador), SIEMPRE QUE sea EAN GS1 de peso variable (inicia con 2)
      if (
        (finalCodeToSave.length === 13 || finalCodeToSave.length === 14) &&
        /^\d+$/.test(finalCodeToSave) &&
        finalCodeToSave.startsWith("2")
      ) {
        const startIdx = finalCodeToSave.length === 13 ? 7 : 8;
        const endIdx = finalCodeToSave.length === 13 ? 12 : 13;
        const pesoGramos = parseInt(
          finalCodeToSave.substring(startIdx, endIdx),
        );
        if (!isNaN(pesoGramos) && pesoGramos > 0) {
          finalWeight = pesoGramos / 1000;
        } else {
          finalWeight = parseFloat(item.quantity_total) || 1;
        }
      } else {
        finalWeight = parseFloat(item.quantity_total) || 1;
      }
    }

    // --- VALIDACIÓN GLOBAL DE TOLERANCIAS DE PESO (Aplica a Fruver y Cárnicos) ---
    const requested = parseFloat(item.quantity_total);
    // Si el item se mide en Libras, la cantidad solicitada (ej. 1 LB) en realidad pesa 0.5 Kg para la báscula.
    // Debemos convertir 'requested' a Kilos para compararlo justamente contra el finalWeight (que siempre está en Kg sacados de la etiqueta)
    const unidad = (item.unidad_medida || "KG").toUpperCase();
    const requestedInKgForValidation =
      unidad === "LB" || unidad === "LIBRA" ? requested / 2 : requested;

    const minAllowed = requestedInKgForValidation - 0.05; // Tolerancia -50g
    const maxAllowed = requestedInKgForValidation + 0.05; // Tolerancia +50g

    if (finalWeight < minAllowed) {
      setError(`❌ Mínimo permitido: ${minAllowed.toFixed(3)} Kg`);
      if (isFruver) inputRefWeight.current?.focus();
      else if (isMeat) inputRefMeatLabel.current?.focus();
      return;
    }
    if (finalWeight > maxAllowed) {
      setError(
        `❌ Máximo permitido: ${maxAllowed.toFixed(3)} Kg (Excedido por ${((finalWeight - maxAllowed) * 1000).toFixed(0)}g)`,
      );
      if (isFruver) inputRefWeight.current?.focus();
      else if (isMeat) inputRefMeatLabel.current?.focus();
      return;
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
          <h3>{isMeat ? "Validar y Pesar Cárnico" : "Ingresar Peso Fruver"}</h3>
          <p className="wm-product-name">{item.name}</p>
          <div className="wm-request-badge">
            Solicitado:{" "}
            <strong>
              {item.quantity_total} {item.unidad_medida || "Kg"}
            </strong>
            <small>Margen permitido: ±50g</small>
          </div>
          {loadingBaseEan && (
            <p className="wm-info-loading">
              <FaSpinner className="ec-spin" /> Buscando configuración EAN
              Fruver...
            </p>
          )}
        </div>

        {/* PASO 1 / PASO ÚNICO: INPUT DE CÓDIGO */}
        <div className="wm-step-section">
          <label className="wm-step-label">
            {isMeat
              ? "Paso Único: Escanear o Digitar Etiqueta GS1"
              : "Paso 1: Digitar SKU"}
          </label>
          <div className="wm-input-row">
            {isMeat && (
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
            )}
            <input
              ref={inputRefCode}
              type="text"
              className={`wm-code-input ${isCodeValidated ? "validated" : ""} ${!isCodeValidated && code.length > 0 ? "has-button" : ""}`}
              placeholder={isMeat ? "Ej: 2915132001000" : "Ej: 12345"}
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

          {/* ✅ NUEVO: Feedback explícito de éxito GS1 */}
          {isMeat && isCodeValidated && meatLabel && (
            <div className="wm-gs1-success-feedback">
              <div className="wm-gs1-icon">✅</div>
              <div className="wm-gs1-details">
                <span className="wm-gs1-title">Etiqueta GS1 Aprobada</span>
                <span className="wm-gs1-code">{meatLabel}</span>
                <span className="wm-gs1-extracted-weight">
                  Peso Extraído:{" "}
                  <strong>
                    {(() => {
                      if (
                        (meatLabel.length === 13 || meatLabel.length === 14) &&
                        meatLabel.startsWith("2")
                      ) {
                        const startIdx = meatLabel.length === 13 ? 7 : 8;
                        const endIdx = meatLabel.length === 13 ? 12 : 13;
                        const pesoGramos = parseInt(
                          meatLabel.substring(startIdx, endIdx),
                        );
                        if (!isNaN(pesoGramos))
                          return (pesoGramos / 1000).toFixed(3);
                      }
                      return "0.000";
                    })()}{" "}
                    Kg
                  </strong>
                </span>
              </div>
            </div>
          )}
          {meatLabel && meatLabel.length >= 13 && false && (
            <div className="wm-fastpass-price">
              💰 Total a cobrar: <strong>{formatPrice(calculatedPrice)}</strong>
            </div>
          )}
        </div>

        {/* PASO 2: INPUT DE PESO (Solo Fruver) */}
        {isFruver && (
          <div
            className={`wm-step-section ${!isCodeValidated ? "disabled" : ""}`}
          >
            <label className="wm-step-label">Paso 2: Digitar Peso (Kg)</label>
            <div className="wm-input-row">
              <input
                ref={inputRefWeight}
                type="number"
                className="wm-weight-input"
                placeholder="Ej: 0.500"
                step="0.001"
                value={weight}
                disabled={!isCodeValidated}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && weight && validateAndConfirm()
                }
              />
              <span className="wm-weight-unit">
                {item.unidad_medida?.toUpperCase() || "KG"}
              </span>
            </div>
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

  // ✅ NUEVOS ESTADOS PARA FRUVER Y CARNES
  const [subWeight, setSubWeight] = useState("");
  const [subMeatLabel, setSubMeatLabel] = useState("");
  const [isSubCodeValidated, setIsSubCodeValidated] = useState(false);
  const [baseEanFruver, setBaseEanFruver] = useState(null);
  const [subError, setSubError] = useState("");
  const [searchError, setSearchError] = useState("");

  const inputRefWeight = useRef(null);
  const inputRefMeatLabel = useRef(null);

  const isFruver = useMemo(() => {
    if (!pendingSub) return false;

    const isUnitKg =
      pendingSub.unidad_medida &&
      ["kl", "kg", "kilo", "lb", "libra"].includes(
        pendingSub.unidad_medida.toLowerCase(),
      );

    const categoriesWords = (
      (pendingSub.categories?.map((c) => c.name).join(" ") || "") +
      " " +
      (pendingSub.categorias_reales?.join(" ") || "")
    )
      .toLowerCase()
      .split(/[\s,.-]+/);

    const fruverKeywords = [
      "fruver",
      "fruta",
      "frutas",
      "verdura",
      "verduras",
      "hortaliza",
      "hortalizas",
      "legumbre",
      "legumbres",
    ];

    return isUnitKg || categoriesWords.some((w) => fruverKeywords.includes(w));
  }, [pendingSub]);

  const isMeat = useMemo(() => {
    if (!pendingSub || isFruver) return false;

    const categoriesWords = (
      (pendingSub.categories?.map((c) => c.name).join(" ") || "") +
      " " +
      (pendingSub.categorias_reales?.join(" ") || "")
    )
      .toLowerCase()
      .split(/[\s,.-]+/);

    const meatKeywords = [
      "carne",
      "carnes",
      "pollo",
      "pollos",
      "pescado",
      "pescados",
      "res",
      "cerdo",
      "carnicería",
      "carniceria",
      "embutido",
      "embutidos",
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
      "salchichas",
      "pescaderia",
      "pescadería",
      "marisco",
      "mariscos",
      "camaron",
      "camarones",
    ];

    return categoriesWords.some((w) => meatKeywords.includes(w));
  }, [pendingSub, isFruver]);

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
      if (
        (cleanCode.length === 13 || cleanCode.length === 14) &&
        /^\d+$/.test(cleanCode) &&
        cleanCode.startsWith("2")
      ) {
        const gs1Sku =
          cleanCode.length === 13
            ? cleanCode.substring(1, 6)
            : cleanCode.substring(2, 7);
        if (
          gs1Sku === expectedSku ||
          parseInt(gs1Sku).toString() === expectedSku ||
          gs1Sku === expectedSku.split("-")[0] ||
          parseInt(gs1Sku).toString() === expectedSku.split("-")[0]
        ) {
          const startIdx = cleanCode.length === 13 ? 7 : 8;
          const endIdx = cleanCode.length === 13 ? 12 : 13;
          const pesoGramos = parseInt(cleanCode.substring(startIdx, endIdx));
          const extractedWeight =
            !isNaN(pesoGramos) && pesoGramos > 0 ? pesoGramos / 1000 : 0;

          const requested = parseFloat(missingQty);
          const unidad = (pendingSub.unidad_medida || "KG").toUpperCase();
          const requestedInKgForValidation =
            unidad === "LB" || unidad === "LIBRA" ? requested / 2 : requested;

          const minAllowed = requestedInKgForValidation - 0.05;
          const maxAllowed = requestedInKgForValidation + 0.05;

          if (extractedWeight < minAllowed) {
            setSubError(
              `❌ Mínimo permitido: ${minAllowed.toFixed(3)} Kg (Etiqueta indica: ${extractedWeight.toFixed(3)} Kg)`,
            );
            setIsSubCodeValidated(false);
            setVerifyCode("");
            setTimeout(() => verifyInputRef.current?.focus(), 100);
            return;
          }
          if (extractedWeight > maxAllowed) {
            setSubError(
              `❌ Máximo permitido: ${maxAllowed.toFixed(3)} Kg (Excedido por ${((extractedWeight - maxAllowed) * 1000).toFixed(0)}g)`,
            );
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
        setVerifyCode(expectedSuffixCode); // Feedback visual
      }

      if (isFastPass) {
        setVerifyCode(cleanCode);
        setSubMeatLabel(cleanCode); // Alimentamos directamente el Paso 2 invisible
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
        `❌ Código incorrecto.\nEscaneado: ${code}\nEsperado SKU: ${pendingSub.sku}`,
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
              {/* ✅ NUEVO: Feedback explícito de éxito GS1 en Sustituto */}
              {isMeat && isSubCodeValidated && subMeatLabel && (
                <div
                  className="wm-gs1-success-feedback"
                  style={{ marginBottom: 16 }}
                >
                  <div className="wm-gs1-icon">✅</div>
                  <div className="wm-gs1-details">
                    <span className="wm-gs1-title">Sustituto Aprobado</span>
                    <span className="wm-gs1-code">{subMeatLabel}</span>
                    <span className="wm-gs1-extracted-weight">
                      Peso Extraído:{" "}
                      <strong>
                        {(() => {
                          if (
                            (subMeatLabel.length === 13 ||
                              subMeatLabel.length === 14) &&
                            subMeatLabel.startsWith("2")
                          ) {
                            const startIdx = subMeatLabel.length === 13 ? 7 : 8;
                            const endIdx = subMeatLabel.length === 13 ? 12 : 13;
                            const pesoGramos = parseInt(
                              subMeatLabel.substring(startIdx, endIdx),
                            );
                            if (!isNaN(pesoGramos))
                              return (pesoGramos / 1000).toFixed(3);
                          }
                          return "0.000";
                        })()}{" "}
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
              className="wm-btn-confirm"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                boxShadow: "0 4px 16px rgba(245,158,11,0.35)",
              }}
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

        <form
          onSubmit={handleManualSearch}
          className="ec-search-form"
          style={{ display: "flex", gap: "8px" }}
        >
          <button
            type="button"
            className="wm-camera-btn"
            onClick={handleCameraClickSearch}
            title="Escanear producto"
            style={{
              borderRadius: "12px",
              padding: "0 16px",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "white",
              border: "none",
              cursor: "pointer",
              minWidth: "52px",
              minHeight: "52px",
            }}
          >
            <FaCamera size={22} />
          </button>
          <input
            type="text"
            placeholder="Nombre, código o item..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ec-search-input"
            style={{ flex: 1 }}
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
          {searchError && (
            <div className="wm-error-alert" style={{ margin: "0 0 10px" }}>
              <div className="wm-error-icon">
                <FaExclamationTriangle />
              </div>
              <div>{searchError}</div>
            </div>
          )}
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

// --- MODAL DE CANTIDAD MASIVA ---
export const BulkQtyModal = ({ isOpen, item, onClose, onConfirm }) => {
  const [qty, setQty] = useState("");
  const [bulkError, setBulkError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && item) {
      const remaining = item.quantity_total - (item.qty_scanned || 0);
      setQty(remaining.toString());
      setBulkError("");
      setTimeout(() => inputRef.current?.select(), 100);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const remaining = item.quantity_total - (item.qty_scanned || 0);

  const handleSubmit = () => {
    const val = parseInt(qty);
    if (isNaN(val) || val <= 0) {
      setBulkError("❌ Ingresa un número válido mayor a 0.");
      inputRef.current?.focus();
      return;
    }
    if (val > remaining) {
      setBulkError(
        `❌ Máximo permitido: ${remaining} unidades. Ingresaste ${val}.`,
      );
      inputRef.current?.focus();
      return;
    }
    setBulkError("");
    onConfirm(val);
  };

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content" style={{ maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <FaBoxOpen size={48} color="#f59e0b" />
          <h3 style={{ fontSize: "1.3rem", fontWeight: 800, marginTop: 12 }}>
            ¿Cuántas unidades encontraste?
          </h3>
          <p
            className="ec-text-secondary"
            style={{ fontSize: "1.05rem", lineHeight: 1.5 }}
          >
            Múltiples unidades detectadas.
            <br />
            Llevas:{" "}
            <strong style={{ color: "#1e293b", fontSize: "1.15rem" }}>
              {item.qty_scanned || 0} / {item.quantity_total}
            </strong>
          </p>
        </div>
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="number"
            className="ec-manual-input"
            style={{
              textAlign: "center",
              fontSize: "2rem",
              letterSpacing: "2px",
            }}
            value={qty}
            min={1}
            max={remaining}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>
        <p
          style={{
            textAlign: "center",
            fontSize: "0.9rem",
            color: "#64748b",
            margin: "10px 0 0",
            fontWeight: 600,
          }}
        >
          Máximo permitido:{" "}
          <strong style={{ color: "#f59e0b" }}>{remaining}</strong>
        </p>
        {bulkError && (
          <div className="wm-error-alert" style={{ marginTop: 10 }}>
            <div className="wm-error-icon">
              <FaExclamationTriangle />
            </div>
            <div>{bulkError}</div>
          </div>
        )}
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            ✕ Cancelar
          </button>
          <button
            className="ec-reason-btn"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "white",
              width: "100%",
            }}
            onClick={handleSubmit}
          >
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};
