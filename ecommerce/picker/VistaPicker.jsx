import React, { useState, useMemo, useCallback } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import QRCode from "react-qr-code";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaCheck,
  FaArrowRight,
  FaShoppingBasket,
  FaWifi,
  FaExclamationTriangle,
  FaSync,
  FaPhone,
  FaCheckCircle,
  FaLock,
  FaSpinner,
  FaStoreAlt,
} from "react-icons/fa";

// Componentes y Constantes
import ConfirmModal from "../shared/ConfirmModal";
import "./VistaPicker.css";
import EscanerBarras from "../../DesarrolloSurtido_API/EscanerBarras";
import {
  WeightModal,
  SubstituteModal,
  ManualEntryModal,
  ClientsModal,
  BulkQtyModal,
} from "./Modals";
import { ProductCard } from "./components/ProductCard";
import ImageZoomModal from "./components/ImageZoomModal";
import ActionModal from "./components/ActionModal";
import { SessionTimer } from "./components/SessionTimer";
import { getOrderStyle } from "./utils/pickerConstants";
import { isWeighable } from "./utils/isWeighable";

// Hooks (El Cerebro)
import { useOfflineQueue } from "./hooks/useOfflineQueue";
import { usePickerSession } from "./hooks/usePickerSession";
import { useSedeContext } from "../shared/SedeContext";

const VistaPicker = () => {
  // 1. Cargamos el cerebro (Lógica central y BD)
  const {
    loading,
    sessionData,
    pickerInfo,
    pickerSedeId,
    sedeParam,
    showSuccessQR,
    completedSessionId,
    resetSesionLocal,
    updateLocalSessionState,
    handleFinish,
    isFinishing,
    initError,
  } = usePickerSession();

  // Sede del picker
  const { sedeName } = useSedeContext();

  // 2. Cargamos el manejador Offline (Cola de acciones)
  const { isOnline, pendingSync, queueAction } =
    useOfflineQueue(resetSesionLocal);

  // 3. Estados puramente visuales (UI)
  const [activeZone, setActiveZone] = useState("pendientes");
  const [isScanning, setIsScanning] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  // Estados de Modales
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [scanOverrideCallback, setScanOverrideCallback] = useState(null);
  const [missingQtyForSub, setMissingQtyForSub] = useState(0);
  const [lastScannedBarcode, setLastScannedBarcode] = useState(null);
  const [zoomImage, setZoomImage] = useState({ src: null, name: "" });
  const [actionModal, setActionModal] = useState({
    open: false,
    title: "",
    message: "",
    icon: null,
    iconVariant: "warning",
    actions: [],
  });
  // --- UI Toasts Feedback Mejorado ---
  const [toasts, setToasts] = useState([]);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const showToast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    // Haptic feedback para cada tipo de toast
    if (navigator.vibrate) {
      if (type === "success") navigator.vibrate([50, 30, 50]);
      if (type === "error") navigator.vibrate([200, 100, 200]);
      if (type === "warning") navigator.vibrate([100, 50, 100]);
      if (type === "info") navigator.vibrate([40]);
    }
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // --- LÓGICA DE INTERACCIÓN (Botones y Acciones) ---

  const handleCardAction = (item, type) => {
    setCurrentItem(item);
    if (type === "scan") {
      if (isWeighable(item)) setShowWeightModal(true);
      else setIsScanning(true);
    } else if (type === "manual") setShowManualModal(true);
    else if (type === "substitute") {
      setMissingQtyForSub(item.quantity_total - (item.qty_scanned || 0));
      setShowSubModal(true);
    } else if (type === "undo") handleUndo(item);
    else if (type === "short_pick") handleShortPick(item);
  };

  const handleShortPick = (item) => {
    const scanned = item.qty_scanned || 0;
    const total = item.quantity_total;
    const missing = total - scanned;
    if (missing <= 0) return;

    const closeModal = () =>
      setActionModal((prev) => ({ ...prev, open: false }));

    setActionModal({
      open: true,
      title: `Faltan ${missing} unidades`,
      message: `Llevas ${scanned} de ${total}.\n¿Qué deseas hacer con las ${missing} que faltan?`,
      icon: <FaExclamationTriangle />,
      iconVariant: "warning",
      actions: [
        {
          label: "Buscar sustituto",
          variant: "primary",
          onClick: () => {
            closeModal();
            setCurrentItem(item);
            setMissingQtyForSub(missing);
            setShowSubModal(true);
          },
        },
        {
          label: "Enviar incompleto",
          variant: "danger",
          onClick: () => {
            closeModal();
            queueAction({
              id_sesion: sessionData.session_id,
              id_producto_original: item.product_id,
              nombre_producto_original: item.name,
              accion: "no_encontrado",
              cantidad_afectada: missing,
              motivo: "Stock Insuficiente",
              pasillo: item.pasillo,
            });
            updateLocalSessionState(item.product_id, scanned, "recolectado");
            showToast(`Enviado incompleto (${scanned}/${total})`, "warning");
          },
        },
      ],
    });
  };

  const handleUndo = (item) => {
    const isItemWeighable = isWeighable(item);
    const scanned = item.qty_scanned || 0;
    const total = item.quantity_total;
    const wasShortPick =
      item.status === "recolectado" && scanned > 0 && scanned < total;

    const closeModal = () =>
      setActionModal((prev) => ({ ...prev, open: false }));

    // Función que ejecuta el reset completo
    const doFullReset = () => {
      closeModal();
      if (wasShortPick) {
        queueAction({
          id_sesion: sessionData.session_id,
          id_producto_original: item.product_id,
          accion: "revert_short_pick",
          cantidad_afectada: 0,
          pasillo: item.pasillo,
        });
      }
      if (scanned > 0) {
        queueAction({
          id_sesion: sessionData.session_id,
          id_producto_original: item.product_id,
          accion: "reset",
          cantidad_afectada: 9999,
          pasillo: item.pasillo,
        });
      }
      updateLocalSessionState(item.product_id, 0, "pendiente", null);
      showToast(
        isItemWeighable
          ? "Devuelto a pendientes (peso borrado)"
          : "Devuelto a pendientes",
        "info",
      );
    };

    // Función que mantiene progreso parcial
    const doKeepProgress = () => {
      closeModal();
      if (wasShortPick) {
        queueAction({
          id_sesion: sessionData.session_id,
          id_producto_original: item.product_id,
          accion: "revert_short_pick",
          cantidad_afectada: 0,
          pasillo: item.pasillo,
        });
      }
      // Si tiene sustituto, borramos solo los logs de sustitución
      if (item.sustituto) {
        queueAction({
          id_sesion: sessionData.session_id,
          id_producto_original: item.product_id,
          accion: "reset_sustituto",
          cantidad_afectada: 0,
          pasillo: item.pasillo,
        });
      }
      // NO enviamos reset de los recolectados: se mantienen en la BD
      updateLocalSessionState(item.product_id, scanned, "parcial", null);
      showToast(
        `Devuelto a pendientes (${scanned}/${total} conservadas)`,
        "info",
      );
    };

    // ── CASO 1: Pesable (fruver/carnes) → siempre reset total ──
    if (isItemWeighable) {
      setActionModal({
        open: true,
        title: "Devolver a pendientes",
        message:
          "Se borrarán los datos de peso registrado y deberás volver a pesar el producto.",
        icon: <FaExclamationTriangle />,
        iconVariant: "warning",
        actions: [
          {
            label: "Devolver y borrar peso",
            variant: "danger",
            onClick: doFullReset,
          },
        ],
      });
      return;
    }

    // ── CASO 2: Completado (scanned >= total) → siempre reset total ──
    if (scanned >= total) {
      setActionModal({
        open: true,
        title: "Devolver a pendientes",
        message: `Se empezará la recolección desde cero (0/${total}).`,
        icon: <FaExclamationTriangle />,
        iconVariant: "warning",
        actions: [
          {
            label: "Devolver desde cero",
            variant: "danger",
            onClick: doFullReset,
          },
        ],
      });
      return;
    }

    // ── CASO 3: Parcial (0 < scanned < total) → ofrecer opciones ──
    if (scanned > 0 && scanned < total) {
      setActionModal({
        open: true,
        title: "Devolver a pendientes",
        message: `Llevas ${scanned} de ${total} unidades.\n¿Qué deseas hacer?`,
        icon: <FaExclamationTriangle />,
        iconVariant: "info",
        actions: [
          {
            label: `Mantener progreso (${scanned}/${total})`,
            variant: "primary",
            onClick: doKeepProgress,
          },
          {
            label: "Empezar desde cero (0/" + total + ")",
            variant: "danger",
            onClick: doFullReset,
          },
        ],
      });
      return;
    }

    // ── CASO 4: scanned === 0 (sustituido sin originales) ──
    setActionModal({
      open: true,
      title: "Devolver a pendientes",
      message: "El producto volverá a la lista de pendientes.",
      icon: <FaExclamationTriangle />,
      iconVariant: "warning",
      actions: [
        {
          label: "Devolver a pendientes",
          variant: "danger",
          onClick: doFullReset,
        },
      ],
    });
  };

  // Recibimos "peso" y "scannedCodeFromModal" (Si viene de cárnicos)
  const confirmPicking = async (
    peso = null,
    scannedCodeFromModal = null,
    bulkQty = null,
  ) => {
    if (!currentItem) return;
    const itemRef = currentItem;

    let qtyToProcess = 1;
    let pesoToLog = peso;

    if (peso !== null) {
      const scanned = itemRef.qty_scanned || 0;
      qtyToProcess = itemRef.quantity_total - scanned;
      pesoToLog = parseFloat((peso / qtyToProcess).toFixed(3));
    } else if (bulkQty !== null) {
      qtyToProcess = bulkQty;
    }

    const currentScanned = (itemRef.qty_scanned || 0) + qtyToProcess;
    const isFinished = currentScanned >= itemRef.quantity_total;

    // Si viene código del Modal de Cárnicos, lo usamos. Si no, usamos el escáner normal de cámara.
    const finalBarcode = scannedCodeFromModal || lastScannedBarcode;

    queueAction({
      id_sesion: sessionData.session_id,
      id_producto_original: itemRef.product_id,
      nombre_producto_original: itemRef.name,
      accion: "recolectado",
      peso_real: pesoToLog,
      cantidad_afectada: qtyToProcess,
      pasillo: itemRef.pasillo,
      codigo_barras_escaneado: finalBarcode, // ✅ Se guarda en la BD para auditoría
      // ✅ NUEVO: Datos de SIESA para reconstruir SKU correcto en el manifiesto
      f120_id_siesa: siesaData?.f120_id_siesa || null,
      unidad_medida_siesa: siesaData?.unidad_medida_siesa || null,
    });

    // Limpiar datos de SIESA después de usar
    setSiesaData(null);

    if (isFinished) {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      closeAllModals();
      setCurrentItem(null);
      showToast("¡Recolección completada! 🎉", "success");
    } else {
      if (navigator.vibrate) navigator.vibrate(100);
      setCurrentItem((prev) =>
        prev ? { ...prev, qty_scanned: currentScanned } : null,
      );
      showToast("¡Código correcto! ✅", "success");
    }

    // ✅ Le pasamos el peso exacto para que lo muestre en pantalla
    const addedWeight = peso !== null ? qtyToProcess * pesoToLog : 0;
    updateLocalSessionState(
      itemRef.product_id,
      currentScanned,
      isFinished ? "recolectado" : "parcial",
      null,
      addedWeight,
    );
    setLastScannedBarcode(null); // Limpiamos el buffer
  };

  const confirmSubstitution = (newItem, qty, finalBarcode = null) => {
    queueAction({
      id_sesion: sessionData.session_id,
      id_producto_original: currentItem.product_id,
      nombre_producto_original: currentItem.name,
      accion: "sustituido",
      datos_sustituto: {
        id: newItem.id,
        name: newItem.name,
        price: newItem.price,
      },
      cantidad_afectada: qty || 1,
      pasillo: currentItem.pasillo,
      codigo_barras_escaneado: finalBarcode || newItem.barcode || newItem.sku,
    });
    updateLocalSessionState(
      currentItem.product_id,
      currentItem.qty_scanned || 0,
      "sustituido",
      { name: newItem.name, price: newItem.price },
    );
    closeAllModals();
    showToast("🔄 Sustitución registrada", "info");
  };

  // Estado para guardar datos de SIESA validados
  const [siesaData, setSiesaData] = useState(null);

  // Helper: Parsear SKU para extraer f120_id y unidad_medida
  const parseSku = (sku) => {
    if (!sku) return { f120_id: null, unidad_medida: null };
    const cleaned = sku.replace(/-/g, ""); // Remover guiones si existen
    // Formato: 11420P6 o 11420UND o 11420KL, etc.
    // El f120_id son los dígitos al inicio, unidad_medida es lo que sigue
    const match = cleaned.match(/^(\d+)([A-Z]+\d*)$/);
    if (match) {
      return {
        f120_id: parseInt(match[1]),
        unidad_medida: match[2],
      };
    }
    return { f120_id: null, unidad_medida: null };
  };

  const handleManualValidation = async (inputCode) => {
    if (!isOnline) {
      if (window.confirm("⚠️ Estás Offline. ¿Forzar?")) {
        setLastScannedBarcode(null);
        setShowManualModal(false);
        if (isWeighable(currentItem)) setShowWeightModal(true);
        else if (currentItem.quantity_total > 4) setShowBulkModal(true);
        else confirmPicking();
      }
      return;
    }
    if (!currentItem) return;
    try {
      // Extraer f120_id y unidad_medida del SKU esperado
      const { f120_id, unidad_medida } = parseSku(currentItem.sku);

      // Si el SKU tiene estructura reconocible, usar validación SIESA mejorada
      if (f120_id && unidad_medida) {
        const res = await ecommerceApi.post(
          `/validar-codigo-siesa${sedeParam ? "?" + sedeParam : ""}`,
          {
            codigo: inputCode,
            f120_id_esperado: f120_id,
            unidad_medida_esperada: unidad_medida,
          },
        );

        if (res.data.valid) {
          // ✅ Guardar datos de SIESA para pasarlos a confirmPicking
          setSiesaData({
            f120_id_siesa: res.data.f120_id,
            unidad_medida_siesa: res.data.unidad_medida,
          });
          setLastScannedBarcode(null);
          setShowManualModal(false);
          if (isWeighable(currentItem)) setShowWeightModal(true);
          else if (currentItem.quantity_total > 4) setShowBulkModal(true);
          else confirmPicking();
        } else {
          // Mensaje de error descriptivo según el tipo de problema
          showToast(res.data.message || "❌ Código incorrecto.", "error");
        }
      } else {
        // Fallback a validación antigua si el SKU no tiene estructura conocida
        const res = await ecommerceApi.post(
          `/validar-codigo${sedeParam ? "?" + sedeParam : ""}`,
          {
            input_code: inputCode,
            expected_sku: currentItem.sku,
            expected_barcode: currentItem.barcode,
          },
        );
        if (res.data.valid) {
          setLastScannedBarcode(null);
          setShowManualModal(false);
          if (isWeighable(currentItem)) setShowWeightModal(true);
          else if (currentItem.quantity_total > 4) setShowBulkModal(true);
          else confirmPicking();
        } else showToast("❌ Código incorrecto.", "error");
      }
    } catch (e) {
      const detail =
        e.response?.data?.error || e.message || "Sin conexión al servidor";
      showToast(`❌ Error validando código: ${detail}`, "error");
    }
  };

  const handleScanMatch = (code) => {
    if (scanOverrideCallback) {
      scanOverrideCallback(code);
      setScanOverrideCallback(null);
      setIsScanning(false);
      return;
    }
    if (!currentItem) return;
    const c = code.trim().toUpperCase();
    const sku = (currentItem.sku || "").trim().toUpperCase();

    let isBarcodeMatch = false;
    if (Array.isArray(currentItem.barcode)) {
      isBarcodeMatch = currentItem.barcode.some((b) => {
        const str = (b || "").toString().toUpperCase();
        return c === str || str.endsWith(c);
      });
    } else {
      const ean = (currentItem.barcode || "").toString().trim().toUpperCase();
      isBarcodeMatch = c === ean || (ean && ean.endsWith(c));
    }

    if (c === sku || isBarcodeMatch) {
      setLastScannedBarcode(c);

      // Si piden más de 4 y no es pesable, preguntamos cantidad extra
      if (currentItem.quantity_total > 4 && !isWeighable(currentItem)) {
        setIsScanning(false);
        setShowBulkModal(true);
      } else {
        confirmPicking();
      }
    } else {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      showToast(`❌ Código ${c} no coincide.`, "error");
    }
  };

  const closeAllModals = () => {
    setIsScanning(false);
    setShowWeightModal(false);
    setShowManualModal(false);
    setShowSubModal(false);
    setShowBulkModal(false);
    setCurrentItem(null);
    setScanOverrideCallback(null);
  };

  // --- VARIABLES DERIVADAS PARA RENDERIZAR ---
  const orderIndexMap = useMemo(() => {
    if (!sessionData) return {};
    const map = {};
    sessionData.orders_info.forEach((ord, idx) => (map[ord.id] = idx));
    return map;
  }, [sessionData]);

  const pendingItems = useMemo(
    () =>
      sessionData?.items.filter((i) =>
        ["pendiente", "parcial"].includes(i.status),
      ) || [],
    [sessionData],
  );
  const doneItems = useMemo(
    () =>
      sessionData?.items.filter(
        (i) => !["pendiente", "parcial"].includes(i.status),
      ) || [],
    [sessionData],
  );
  const currentList = activeZone === "pendientes" ? pendingItems : doneItems;

  // --- RENDERIZADO CONDICIONAL ---
  if (loading)
    return (
      <div className="ec-picker-centered">
        <div className="ec-spinner"></div>
        <p>Conectando...</p>
      </div>
    );

  if (initError)
    return (
      <div className="ec-picker-centered">
        <FaExclamationTriangle
          size={50}
          color="#ef4444"
          className="ec-no-assignment-icon"
        />
        <h3>Error al iniciar</h3>
        <p className="ec-centered-message">{initError}</p>
        <button
          onClick={() => window.location.reload()}
          className="ec-scan-btn ec-no-assignment-refresh"
        >
          Reintentar
        </button>
      </div>
    );

  if (showSuccessQR && completedSessionId) {
    return (
      <div className="ec-picker-centered ec-success-screen">
        <FaCheckCircle size={60} className="ec-no-assignment-icon" />
        <h2>¡Ruta Finalizada!</h2>
        <p>Muestra este código al auditor.</p>
        <div className="ec-success-qr-box">
          <QRCode value={completedSessionId} size={220} />
        </div>
        <p className="ec-success-session-id">
          ID: {completedSessionId.slice(0, 8)}
        </p>
        <div className="ec-success-lock-section">
          <div className="ec-success-lock-title">
            <FaLock /> <span>Bloqueado por seguridad</span>
          </div>
          <div className="ec-success-lock-waiting">
            <FaSpinner className="ec-spin" /> Esperando aprobación de salida...
          </div>
        </div>
      </div>
    );
  }

  if (!sessionData)
    return (
      <div className="ec-picker-centered ec-no-assignment-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="ec-no-assignment-container"
        >
          {/* Ícono animado */}
          <div className="ec-no-assignment-icon-wrapper">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <FaShoppingBasket size={48} color="white" />
            </motion.div>
          </div>

          {/* Contenido */}
          <div className="ec-no-assignment-content">
            <h2 className="ec-no-assignment-title">Sin Ruta Asignada</h2>
            <p className="ec-no-assignment-message">
              Espera a que el supervisor te asigne una ruta de picking.
            </p>
          </div>

          {/* Info del picker */}
          {pickerInfo && (
            <div className="ec-no-assignment-info">
              <div className="ec-info-item">
                <span className="ec-info-label">Picker</span>
                <span className="ec-info-value">
                  {pickerInfo.nombre_completo || "—"}
                </span>
              </div>
              {sedeName && (
                <div className="ec-info-item">
                  <span className="ec-info-label">Sede</span>
                  <span className="ec-info-value">{sedeName}</span>
                </div>
              )}
            </div>
          )}

          {/* Indicador de verificación automática */}
          <div className="ec-no-assignment-polling">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="ec-polling-spinner"
            >
              <FaSync size={14} />
            </motion.div>
            <span>Verificando asignaciones...</span>
          </div>

          {/* Botón de acción */}
          <div className="ec-no-assignment-actions">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => window.location.reload()}
              className="ec-no-assignment-primary-btn"
            >
              <FaSync size={16} />
              <span>Actualizar</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    );

  // --- RENDERIZADO PRINCIPAL ---
  return (
    <div className="ec-picker-main-layout">
      {/* STATUS BAR */}
      <div className={`ec-status-bar ${isOnline ? "online" : "offline"}`}>
        <span className="ec-status-bar-sede">
          <FaStoreAlt size={11} /> {sedeName || "Sin sede"}
        </span>
        {isOnline ? (
          <span>
            {pendingSync > 0 ? (
              <>
                <FaSync className="ec-spin" /> Subiendo...
              </>
            ) : (
              <>
                <FaWifi /> Conectado
              </>
            )}
          </span>
        ) : (
          <span>
            <FaExclamationTriangle /> Offline ({pendingSync})
          </span>
        )}
      </div>

      {/* HEADER */}
      <header className="ec-picker-sticky-header">
        <div className="ec-header-top">
          <div className="ec-order-info">
            <span className="ec-label-sm">Ruta Activa</span>
            <div className="ec-header-session-row">
              <span className="ec-order-id">
                #{sessionData.session_id.slice(0, 6)}
              </span>
              <SessionTimer startDate={sessionData.fecha_inicio} />
            </div>
          </div>
          <div className="ec-header-actions">
            <button
              className="ec-contacts-btn"
              onClick={() => setShowClientsModal(true)}
            >
              <FaPhone /> Clientes
            </button>
            <div className="ec-header-item-count">
              {doneItems.length} / {sessionData.items.length} Items
            </div>
          </div>
        </div>

        <div className="ec-orders-legend">
          {sessionData.orders_info.map((ord, idx) => {
            const style = getOrderStyle(idx);
            return (
              <div key={ord.id} className="ec-legend-item">
                <div
                  className="ec-legend-dot"
                  style={{ background: style.color }}
                ></div>
                <span style={{ color: style.color, fontWeight: 900 }}>
                  {style.code}:
                </span>
                <span>{ord.customer.split(" ")[0]}</span>
              </div>
            );
          })}
        </div>

        {/* PROGRESS BAR */}
        <div className="ec-progress-bar-container">
          <div className="ec-progress-bar-track">
            <div
              className="ec-progress-bar-fill"
              style={{
                width: `${sessionData.items.length > 0 ? Math.round((doneItems.length / sessionData.items.length) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="ec-progress-text">
            <span>
              {doneItems.length} de {sessionData.items.length} productos
            </span>
            <span className="ec-progress-pct">
              {sessionData.items.length > 0
                ? Math.round(
                    (doneItems.length / sessionData.items.length) * 100,
                  )
                : 0}
              %
            </span>
          </div>
        </div>

        {/* NOTAS GENERALES DE CLIENTES (order-level customer_note) */}
        {sessionData.orders_info.some((o) => o.customer_note) && (
          <div className="ec-customer-notes-section">
            <strong className="ec-customer-notes-title">
              📝 Notas de los Clientes
            </strong>
            {sessionData.orders_info
              .filter((o) => o.customer_note)
              .map((ord) => (
                <div key={ord.id} className="ec-customer-note-item">
                  <strong>{ord.customer.split(" ")[0]} indicó:</strong>{" "}
                  {ord.customer_note}
                </div>
              ))}
          </div>
        )}

        <div className="ec-zones-tabs">
          <div
            className={`ec-zone-tab ${activeZone === "pendientes" ? "active" : ""}`}
            onClick={() => {
              setActiveZone("pendientes");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            📋 Pendientes{" "}
            <span className="ec-tab-count">{pendingItems.length}</span>
          </div>
          <div
            className={`ec-zone-tab ${activeZone === "canasta" ? "active" : ""}`}
            onClick={() => {
              setActiveZone("canasta");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            🛒 Canasta <span className="ec-tab-count">{doneItems.length}</span>
          </div>
        </div>
      </header>

      {/* LISTA PRODUCTOS */}
      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeZone}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="ec-list-inner"
          >
            {currentList.length > 0 ? (
              currentList.map((item, idx) => (
                <ProductCard
                  key={item.product_id}
                  item={item}
                  orderMap={orderIndexMap}
                  isCompleted={activeZone === "canasta"}
                  onAction={handleCardAction}
                  onImageZoom={(src, name) => setZoomImage({ src, name })}
                  animDelay={idx * 0.03}
                />
              ))
            ) : (
              <div className="ec-empty-state">
                {activeZone === "pendientes" ? (
                  <>
                    <div className="ec-empty-icon">🎉</div>
                    <p className="ec-empty-title">¡Ruta Completada!</p>
                    <p className="ec-empty-subtitle">
                      Todos los productos están en la canasta
                    </p>
                  </>
                ) : (
                  <>
                    <div className="ec-empty-icon">🛒</div>
                    <p className="ec-empty-title">Canasta vacía</p>
                    <p className="ec-empty-subtitle">
                      Escanea productos para agregarlos aquí
                    </p>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="ec-spacer"></div>
      </div>

      {/* FINISH BUTTON */}
      {pendingItems.length === 0 && (
        <div className="ec-fab-container">
          <button
            className="ec-fab-finish"
            onClick={() => {
              if (pendingSync > 0) {
                showToast(
                  `⚠️ Tienes ${pendingSync} sincronizaciones pendientes. Conéctate a internet.`,
                  "warning",
                );
                return;
              }
              setShowFinishConfirm(true);
            }}
            disabled={isFinishing}
          >
            <div className="ec-fab-content">
              {isFinishing ? (
                <FaSpinner className="ec-spin" size={24} />
              ) : (
                <FaCheck size={24} />
              )}
              <span>{isFinishing ? "FINALIZANDO..." : "TERMINAR RUTA"}</span>
            </div>
            <div className="ec-fab-arrow">
              <FaArrowRight />
            </div>
          </button>
        </div>
      )}

      {/* MODALS COMPARTIDOS */}
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
        onClose={() => {
          setShowWeightModal(false);
          setCurrentItem(null);
        }}
        onConfirm={confirmPicking}
        onRequestScan={(cb) => {
          setScanOverrideCallback(() => cb);
          setIsScanning(true);
        }}
      />
      <SubstituteModal
        isOpen={showSubModal}
        originalItem={currentItem}
        missingQty={missingQtyForSub}
        onClose={() => {
          setShowSubModal(false);
          setCurrentItem(null);
        }}
        onConfirmSubstitute={confirmSubstitution}
        onRequestScan={(cb) => {
          setScanOverrideCallback(() => cb);
          setIsScanning(true);
        }}
      />
      <ClientsModal
        isOpen={showClientsModal}
        orders={sessionData.orders_info}
        onClose={() => setShowClientsModal(false)}
      />

      <BulkQtyModal
        isOpen={showBulkModal}
        item={currentItem}
        onClose={() => {
          setShowBulkModal(false);
          setCurrentItem(null);
        }}
        onConfirm={(qty) => {
          setShowBulkModal(false);
          confirmPicking(null, null, qty);
        }}
      />

      {/* --- CONFIRM MODAL FINALIZAR RUTA --- */}
      <ConfirmModal
        isOpen={showFinishConfirm}
        title="¿Finalizar recorrido?"
        message="¿Estás seguro de que deseas cerrar esta sesión de recolección y generar el código para auditoría?"
        confirmText="Sí, Terminar"
        cancelText="Volver a la canasta"
        onConfirm={async () => {
          try {
            setShowFinishConfirm(false);
            await handleFinish();
          } catch (e) {
            const detail =
              e.response?.data?.error || e.message || "Error desconocido";
            showToast(`Error al finalizar la sesión: ${detail}`, "error");
          }
        }}
        onCancel={() => setShowFinishConfirm(false)}
        isProcessing={isFinishing}
      />

      {/* --- ACTION MODAL (Short Pick / Undo) --- */}
      <ActionModal
        isOpen={actionModal.open}
        title={actionModal.title}
        message={actionModal.message}
        icon={actionModal.icon}
        iconVariant={actionModal.iconVariant}
        actions={actionModal.actions}
        onClose={() => setActionModal((prev) => ({ ...prev, open: false }))}
      />

      {/* --- IMAGE ZOOM LIGHTBOX --- */}
      <ImageZoomModal
        isOpen={!!zoomImage.src}
        imageSrc={zoomImage.src}
        productName={zoomImage.name}
        onClose={() => setZoomImage({ src: null, name: "" })}
      />

      {/* --- FLOATING TOASTS NOTIFICATIONS --- */}
      <div className="ec-toasts-container">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 40, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`ec-toast ${t.type}`}
            >
              {t.type === "success" && "✅ "}
              {t.type === "error" && "❌ "}
              {t.type === "warning" && "⚠️ "}
              {t.type === "info" && "ℹ️ "}
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default VistaPicker;
