import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { supabase } from "../../supabaseClient";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  FaClock,
  FaCheck,
  FaBoxOpen,
  FaArrowRight,
  FaArrowLeft,
  FaUndo,
  FaShoppingBasket,
  FaClipboardList,
  FaBarcode,
  FaExclamationTriangle,
} from "react-icons/fa";
import "./VistaPicker.css";
// IMPORTAMOS TU COMPONENTE DE ESCANER EXISTENTE (SIN MODIFICARLO)
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras";

// --- COMPONENTE SWIPE CARD (Interactivo) ---
const SwipeCard = ({ item, onSwipe }) => {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

  const scaleRight = useTransform(x, [50, 150], [0.5, 1.2]);
  const scaleLeft = useTransform(x, [-150, -50], [1.2, 0.5]);
  const bgRightOpacity = useTransform(x, [0, 150], [0, 1]);
  const bgLeftOpacity = useTransform(x, [-150, 0], [1, 0]);

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 120) {
      if (navigator.vibrate) navigator.vibrate(50);
      onSwipe(item.id, "picked");
    } else if (info.offset.x < -120) {
      if (navigator.vibrate) navigator.vibrate(50);
      onSwipe(item.id, "request-removal");
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className="ec-swipe-wrapper"
    >
      {/* Fondo RETIRAR */}
      <motion.div
        className="ec-swipe-background left"
        style={{ opacity: bgLeftOpacity }}
      >
        <motion.div
          style={{
            scale: scaleLeft,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>RETIRAR</span>
          <div className="icon-circle danger">
            <FaUndo size={24} color="white" />
          </div>
        </motion.div>
      </motion.div>

      {/* Fondo AGREGAR */}
      <motion.div
        className="ec-swipe-background right"
        style={{ opacity: bgRightOpacity }}
      >
        <motion.div
          style={{
            scale: scaleRight,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div className="icon-circle success">
            <FaCheck size={24} color="white" />
          </div>
          <span>ESCANEAR</span>
        </motion.div>
      </motion.div>

      {/* TARJETA */}
      <motion.div
        className="ec-product-card"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        style={{ x, rotate, opacity }}
        whileTap={{ scale: 0.98, cursor: "grabbing" }}
      >
        <div className="ec-img-large-wrapper">
          {item.image_src ? (
            <img
              src={item.image_src}
              alt={item.name}
              className="ec-prod-img-large"
            />
          ) : (
            <div className="ec-no-img">
              <FaBoxOpen />
            </div>
          )}
        </div>

        <div className="ec-info">
          <div className="ec-badges">
            <span className="ec-badge-pasillo">
              {item.pasillo === "S/N" || item.pasillo === "Otros"
                ? "General"
                : `📍 Pasillo ${item.pasillo}`}
            </span>
            {item.categorias?.[0] && (
              <span className="ec-badge-cat">{item.categorias[0]}</span>
            )}
          </div>

          <h4 className="ec-name-large">{item.name}</h4>

          <div className="ec-sku-container">
            {item.sku && (
              <div className="ec-sku sku-badge">
                <small>SKU:</small> {item.sku}
              </div>
            )}
            {item.barcode && (
              <div className="ec-sku barcode-badge">
                <FaBarcode style={{ marginRight: 4 }} /> {item.barcode}
              </div>
            )}
          </div>
        </div>

        <div className="ec-qty-wrapper-large">
          <span className="ec-qty-label">LLEVAR</span>
          <div className="ec-qty-circle-large">{item.quantity}</div>
          <span className="ec-unit">UND</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

// --- COMPONENTE ITEM COMPLETADO ---
const CompletedCard = ({
  item,
  onUndo,
  onRecover,
  type = "picked",
  reason,
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    className={`ec-product-card compact ${
      type === "removed" ? "removed-item" : "completed"
    }`}
  >
    <div className="ec-img-small-wrapper">
      {item.image_src ? (
        <img src={item.image_src} className="ec-prod-img" alt={item.name} />
      ) : (
        <FaBoxOpen />
      )}
    </div>
    <div className="ec-info completed-text">
      <h4 className="ec-name-compact">{item.name}</h4>
      <span className={`ec-status-label ${type}`}>
        {type === "removed"
          ? reason
            ? `🚫 ${reason}`
            : "Retirado"
          : "✅ Recogido"}
      </span>
    </div>
    <div className="ec-card-actions">
      {type === "removed" && (
        <button
          className="ec-btn-icon recover"
          onClick={() => onRecover(item.id)}
          title="Recuperar"
        >
          <FaCheck />
        </button>
      )}
      <button
        className="ec-btn-icon undo"
        onClick={() => onUndo(item.id)}
        title="Deshacer"
      >
        <FaUndo />
      </button>
    </div>
  </motion.div>
);

// --- OVERLAY DE CONFIRMACIÓN MANUAL (PORTAL) ---
// Este componente se muestra SOBRE el escáner si el código de barras falla
const ManualConfirmOverlay = ({
  isOpen,
  onConfirm,
  itemName,
  isProcessing,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="ec-manual-overlay-container">
      <div className="ec-manual-glass-panel">
        <span className="ec-manual-title">¿Problemas escaneando?</span>
        <div className="ec-manual-item-name">{itemName}</div>
        <button
          onClick={onConfirm}
          className="ec-manual-confirm-btn"
          disabled={isProcessing}
        >
          {isProcessing ? (
            <FaSync className="ec-spin" />
          ) : (
            <>
              <FaClipboardList /> Confirmar Manualmente
            </>
          )}
        </button>
        <div className="ec-manual-hint">
          <FaExclamationTriangle color="#f59e0b" /> Se registrará como
          validación manual
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- COMPONENTE PRINCIPAL ---
const VistaPicker = () => {
  const [loading, setLoading] = useState(true);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [pickerStatus, setPickerStatus] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [pickedItems, setPickedItems] = useState({});
  const [removedReasons, setRemovedReasons] = useState({});
  const [pendingRemoval, setPendingRemoval] = useState(null);

  // Escáner y Validación
  const [isScanning, setIsScanning] = useState(false);
  const [itemToScan, setItemToScan] = useState(null);
  const [scanSuccessMsg, setScanSuccessMsg] = useState(null);
  const [isValidating, setIsValidating] = useState(false); // Spinner interno de validación

  const [activeTab, setActiveTab] = useState("pending");
  const [timer, setTimer] = useState("00:00:00");
  const [userEmail, setUserEmail] = useState("");
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);

  // 1. Inicialización
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams(window.location.search);
        let emailToUse = params.get("email");
        if (!emailToUse) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) emailToUse = user.email;
        }
        if (!emailToUse)
          emailToUse =
            localStorage.getItem("picker_email") ||
            localStorage.getItem("correo_empleado");

        if (!emailToUse) {
          setLoading(false);
          return;
        }
        setUserEmail(emailToUse);

        const statusRes = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/pickers?email=${encodeURIComponent(
            emailToUse
          )}`
        );
        const me = statusRes.data[0];

        if (me && me.id_pedido_actual) {
          setPickerStatus(me);
          const orderRes = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/${me.id_pedido_actual}`
          );
          setCurrentOrder(orderRes.data);

          // Sesión y Timer
          const storageKeyItems = `picker_items_${me.id_pedido_actual}`;
          const savedItems = localStorage.getItem(storageKeyItems);
          if (savedItems) setPickedItems(JSON.parse(savedItems));
          else {
            const initial = {};
            orderRes.data.line_items.forEach((i) => (initial[i.id] = false));
            setPickedItems(initial);
          }

          const savedTime = localStorage.getItem(
            `picker_timer_${me.id_pedido_actual}`
          );
          if (savedTime) {
            setStartTime(parseInt(savedTime));
          } else {
            const now = Date.now();
            setStartTime(now);
            localStorage.setItem(`picker_timer_${me.id_pedido_actual}`, now);
          }
          setIsSessionLoaded(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Timer
  useEffect(() => {
    if (!startTime) return;
    const i = setInterval(() => {
      const diff = Math.max(0, Date.now() - startTime);
      const h = Math.floor(diff / 3600000)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((diff % 3600000) / 60000)
        .toString()
        .padStart(2, "0");
      const s = Math.floor((diff % 60000) / 1000)
        .toString()
        .padStart(2, "0");
      setTimer(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(i);
  }, [startTime]);

  // Persistencia Local + Ping Progreso al Servidor
  useEffect(() => {
    if (isSessionLoaded && pickerStatus?.id_pedido_actual && currentOrder) {
      // 1. Guardar en LocalStorage (backup offline)
      localStorage.setItem(
        `picker_items_${pickerStatus.id_pedido_actual}`,
        JSON.stringify(pickedItems)
      );

      // 2. Enviar Ping al Servidor (Throttle 5s para no saturar)
      const timerId = setTimeout(() => {
        // Recalculamos stats básicos para el reporte
        const completed = [];
        const removed = [];
        const pending = [];

        currentOrder.line_items.forEach((item) => {
          const s = pickedItems[item.id];
          if (s === "picked") completed.push({ id: item.id });
          else if (s === "removed") removed.push({ id: item.id });
          else pending.push({ id: item.id });
        });

        // Enviamos el snapshot ligero
        axios
          .post(
            "https://backend-woocommerce.vercel.app/api/orders/update-progress",
            {
              id_pedido: pickerStatus.id_pedido_actual,
              reporte_items: {
                recolectados: completed,
                retirados: removed,
                pendientes: pending,
              },
            }
          )
          .catch((err) => console.error("Error updating progress cloud", err));
      }, 2000); // 2 segundos de debounce es suficiente para UX fluida admin

      return () => clearTimeout(timerId);
    }
  }, [pickedItems, isSessionLoaded, pickerStatus, currentOrder]);

  // --- LÓGICA DE ESCANEO Y VALIDACIÓN (BASE DE DATOS) ---
  const handleScanMatch = useCallback(
    async (decodedText) => {
      if (!itemToScan || isValidating) return; // Evitar doble submit

      const scanned = (decodedText || "").trim().toUpperCase();
      const expectedSku = (itemToScan.sku || "").trim().toUpperCase(); // F120_ID en Siesa usualmente
      const expectedBarcode = (itemToScan.barcode || "").trim().toUpperCase();

      // 1. Validación Local Rápida (WooCommerce)
      const isLocalMatch =
        (expectedBarcode && scanned === expectedBarcode) ||
        (expectedSku && scanned === expectedSku);

      if (isLocalMatch) {
        handleSuccessScan();
        return;
      }

      // 2. Validación Remota (Supabase: siesa_codigos_barras)
      // Buscamos si el código escaneado pertenece al ID (SKU) del item actual
      setIsValidating(true);
      try {
        // Asumimos que itemToScan.sku contiene el ID f120_id numérico o string
        // Si sku es "123", buscamos en f120_id = 123
        const { data, error } = await supabase
          .from("siesa_codigos_barras")
          .select("id")
          .eq("codigo_barras", scanned)
          .eq("f120_id", itemToScan.sku) // Comparamos contra el ID del item
          .maybeSingle();

        if (data && !error) {
          handleSuccessScan();
        } else {
          alert(
            `❌ Código incorrecto o no asignado al producto.\nEscaneado: ${scanned}`
          );
        }
      } catch (error) {
        console.error("Error validando barras:", error);
        alert("Error de conexión al validar código de barras.");
      } finally {
        setIsValidating(false);
      }
    },
    [itemToScan, isValidating]
  );

  const handleSuccessScan = () => {
    setPickedItems((prev) => ({ ...prev, [itemToScan.id]: "picked" }));
    setScanSuccessMsg(`¡${itemToScan.name} verificado!`);
    setTimeout(() => setScanSuccessMsg(null), 2500);
    setItemToScan(null);
    setIsScanning(false);
  };

  const handleManualConfirm = () => {
    if (!itemToScan) return;
    if (
      window.confirm(
        `¿Confirmar "${itemToScan.name}" manualmente? Esto quedará registrado.`
      )
    ) {
      setPickedItems((prev) => ({ ...prev, [itemToScan.id]: "picked" }));
      setItemToScan(null);
      setIsScanning(false);
    }
  };

  // Handlers UI
  const handleSwipe = (id, action) => {
    if (action === "request-removal") {
      setPendingRemoval({ id });
    } else if (action === "picked") {
      const item = currentOrder?.line_items?.find((i) => i.id === id);
      // Siempre abrimos escáner si es 'picked' para intentar validar
      setItemToScan(item);
      setIsScanning(true);
    } else {
      setPickedItems((prev) => ({ ...prev, [id]: action }));
    }
  };

  const confirmRemoval = (reason) => {
    if (pendingRemoval) {
      setRemovedReasons((p) => ({ ...p, [pendingRemoval.id]: reason }));
      setPickedItems((p) => ({ ...p, [pendingRemoval.id]: "removed" }));
      setPendingRemoval(null);
    }
  };

  // Cálculo de Stats
  const { stats, groupedItems } = useMemo(() => {
    if (!currentOrder)
      return {
        stats: { total: 0, picked: 0, removed: 0 },
        groupedItems: { pendingGroups: [], completed: [], removed: [] },
      };
    let p = 0,
      r = 0;
    const res = { pending: [], completed: [], removed: [] };

    currentOrder.line_items.forEach((item) => {
      const s = pickedItems[item.id];
      if (s === "picked") {
        p++;
        res.completed.push(item);
      } else if (s === "removed") {
        r++;
        res.removed.push(item);
      } else res.pending.push(item);
    });

    const grouped = {};
    res.pending.forEach((item) => {
      const k =
        item.pasillo === "S/N" || item.pasillo === "Otros"
          ? "GENERAL"
          : `PASILLO ${item.pasillo}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(item);
    });

    return {
      stats: { total: currentOrder.line_items.length, picked: p, removed: r },
      groupedItems: {
        ...res,
        pendingGroups: Object.entries(grouped).map(([k, v]) => ({
          title: k,
          items: v,
        })),
      },
    };
  }, [currentOrder, pickedItems]);

  const handleFinish = async () => {
    if (!window.confirm("¿Finalizar pedido?")) return;
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/finalizar-picking",
        {
          id_pedido: currentOrder.id,
          id_picker: pickerStatus.id,
          reporte_items: {
            recolectados: groupedItems.completed.map((i) => ({
              id: i.id,
              qty: i.quantity,
              name: i.name,
            })),
            retirados: groupedItems.removed.map((i) => ({
              id: i.id,
              reason: removedReasons[i.id],
              name: i.name,
            })),
            pendientes: groupedItems.pending.map((i) => ({
              id: i.id,
              name: i.name,
            })),
          },
        }
      );
      localStorage.removeItem(`picker_items_${currentOrder.id}`);
      localStorage.removeItem(`picker_timer_${currentOrder.id}`); // <--- Limpiar timer también
      alert("¡Pedido completado!");
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading)
    return (
      <div className="ec-picker-centered-view">
        <div className="ec-picker-spinner"></div>
        <p>Cargando pedido...</p>
      </div>
    );
  if (!currentOrder)
    return (
      <div className="ec-picker-centered-view">
        <h3>Sin pedidos</h3>
      </div>
    );

  return (
    <div className="ec-picker-main-layout">
      {/* HEADER */}
      <header className="ec-picker-sticky-header">
        <div className="ec-header-top">
          <div className="ec-order-info">
            <span className="ec-label-sm">Pedido</span>
            <span className="ec-order-id">#{currentOrder.id}</span>
          </div>
          <div className="ec-timer-container">
            <FaClock className="ec-timer-icon" /> {timer}
          </div>
        </div>
        <div className="ec-progress-container">
          <div className="ec-progress-bar">
            <motion.div
              className="ec-progress-fill"
              initial={{ width: 0 }}
              animate={{
                width: `${
                  ((stats.picked + stats.removed) / stats.total) * 100
                }%`,
              }}
              transition={{ type: "spring", stiffness: 50 }}
            />
          </div>
          <div className="ec-progress-text">
            <span>
              {stats.picked + stats.removed} de {stats.total} productos
            </span>
            <span>
              {Math.round(((stats.picked + stats.removed) / stats.total) * 100)}
              %
            </span>
          </div>
        </div>
        <div className="ec-tabs-modern">
          <button
            className={`ec-tab-pill ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            Pendientes{" "}
            <span className="ec-badge-count">
              {stats.total - stats.picked - stats.removed}
            </span>
          </button>
          <button
            className={`ec-tab-pill ${
              activeTab === "completed" ? "active" : ""
            }`}
            onClick={() => setActiveTab("completed")}
          >
            Listos{" "}
            <span className="ec-badge-count success">{stats.picked}</span>
          </button>
          <button
            className={`ec-tab-pill ${activeTab === "removed" ? "active" : ""}`}
            onClick={() => setActiveTab("removed")}
          >
            Retirados{" "}
            <span className="ec-badge-count danger">{stats.removed}</span>
          </button>
        </div>
      </header>

      {/* LISTA */}
      <div className="ec-picker-scroll-container">
        <AnimatePresence mode="popLayout">
          {activeTab === "pending" &&
            (groupedItems.pendingGroups.length > 0 ? (
              groupedItems.pendingGroups.map((g, i) => (
                <motion.div
                  key={g.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="ec-aisle-section"
                >
                  <div className="ec-aisle-header">
                    <span className="ec-aisle-icon">📍</span> {g.title}
                  </div>
                  {g.items.map((item) => (
                    <SwipeCard
                      key={item.id}
                      item={item}
                      onSwipe={handleSwipe}
                    />
                  ))}
                </motion.div>
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="ec-empty-tab"
              >
                <FaCheck size={60} color="#22c55e" />
                <h3>¡Todo listo!</h3>
              </motion.div>
            ))}
          {activeTab === "completed" &&
            groupedItems.completed.map((item) => (
              <CompletedCard
                key={item.id}
                item={item}
                onUndo={(id) => setPickedItems((p) => ({ ...p, [id]: false }))}
              />
            ))}
          {activeTab === "removed" &&
            groupedItems.removed.map((item) => (
              <CompletedCard
                key={item.id}
                item={item}
                type="removed"
                reason={removedReasons[item.id]}
                onUndo={(id) => setPickedItems((p) => ({ ...p, [id]: false }))}
                onRecover={(id) => {
                  setPickedItems((p) => ({ ...p, [id]: "picked" }));
                  setRemovedReasons((p) => {
                    const c = { ...p };
                    delete c[id];
                    return c;
                  });
                }}
              />
            ))}
        </AnimatePresence>
        <div className="ec-spacer-bottom"></div>
      </div>

      {/* ESCÁNER Y COMPONENTES FLOTANTES */}
      <EscanerBarras
        isScanning={isScanning}
        setIsScanning={setIsScanning}
        onScan={handleScanMatch}
      />

      {/* Botón Manual Flotante - Z-Index alto controlado por CSS */}
      <ManualConfirmOverlay
        isOpen={isScanning && itemToScan}
        onConfirm={handleManualConfirm}
        itemName={itemToScan?.name}
        isProcessing={isValidating}
      />

      {/* Modal Retiro */}
      {pendingRemoval && (
        <div className="ec-modal-overlay">
          <motion.div
            className="ec-modal-content"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h3>⚠️ Confirmar Retiro</h3>
            <div className="ec-modal-grid">
              <button
                className="ec-reason-btn danger"
                onClick={() => confirmRemoval("No encontrado")}
              >
                <span>🔍</span> No existe
              </button>
              <button
                className="ec-reason-btn warning"
                onClick={() => confirmRemoval("Agotado")}
              >
                <span>📉</span> Agotado
              </button>
              <button
                className="ec-reason-btn neutral"
                onClick={() => confirmRemoval("Cancelado Cliente")}
              >
                <span>🚫</span> Cancela Cliente
              </button>
              <button
                className="ec-reason-btn neutral"
                onClick={() => confirmRemoval("Mala Calidad")}
              >
                <span>🥀</span> Mala Calidad
              </button>
            </div>
            <button
              className="ec-modal-cancel"
              onClick={() => setPendingRemoval(null)}
            >
              Volver
            </button>
          </motion.div>
        </div>
      )}

      {/* Toast Éxito */}
      {scanSuccessMsg &&
        createPortal(
          <motion.div
            className="ec-scan-success-toast"
            initial={{ y: -50, x: "-50%" }}
            animate={{ y: 0, x: "-50%" }}
            exit={{ y: -50, x: "-50%" }}
          >
            <div className="ec-scan-success-icon">
              <FaCheck />
            </div>
            {scanSuccessMsg}
          </motion.div>,
          document.body
        )}

      {/* FAB Finish */}
      <AnimatePresence>
        {stats.picked + stats.removed === stats.total && stats.total > 0 && (
          <motion.div
            className="ec-fab-container"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
          >
            <button className="ec-fab-finish" onClick={handleFinish}>
              <div className="ec-fab-content">
                <FaShoppingBasket size={24} />
                <span>FINALIZAR PEDIDO</span>
              </div>
              <div className="ec-fab-arrow">
                <FaArrowRight />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VistaPicker;
