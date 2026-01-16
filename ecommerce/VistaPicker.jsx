import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { supabase } from "../../supabaseClient";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  FaClock,
  FaCheck,
  FaMapMarkerAlt,
  FaBoxOpen,
  FaArrowRight,
  FaArrowLeft,
  FaUndo,
  FaShoppingBasket,
  FaSync,
  FaClipboardList,
  FaUserClock,
} from "react-icons/fa";
import "./VistaPicker.css";
import EscanerBarras from "../DesarrolloSurtido_API/EscanerBarras";

// --- COMPONENTE SWIPEABLE ---
const SwipeCard = ({ item, onSwipe }) => {
  const x = useMotionValue(0);
  // Aumentamos el rango de opacidad para que no desaparezca tan rápido
  // Ahora require arrastrar más para desaparecer visualmente del todo
  const opacity = useTransform(x, [-250, 0, 250], [0.5, 1, 0.5]);

  // Backgrounds opacity: empiezan a verse antes, pero se validan más lejos
  // Ajuste para que se vea claro la intención
  const rightBgOpacity = useTransform(x, [50, 150], [0, 1]);
  const leftBgOpacity = useTransform(x, [-150, -50], [1, 0]);

  const handleDragEnd = (event, info) => {
    // Aumentada la sensibilidad requerida: de 100 a 170 pixels
    // Esto evita falsos positivos al scrollear verticalmente o tocar sin querer.
    if (info.offset.x > 170) {
      onSwipe(item.id, "picked");
    } else if (info.offset.x < -170) {
      // CAMBIO: Ahora pasamos 'request-removal' para abrir modal
      onSwipe(item.id, "request-removal");
    }
  };

  // Reset position (si no se deslizó lo suficiente) se maneja solo porque x está vinculado al drag
  // Pero framer motion 'drag' reseteará la posición visualmente si no hay onDragEnd que lo elimine del DOM
  // Aquí la lógica de desaparición la maneja el padre al cambiar state.

  return (
    <div className="ec-swipe-wrapper">
      {/* Background Left: Removed */}
      <motion.div
        className="ec-swipe-background left"
        style={{
          opacity: leftBgOpacity,
          backgroundColor: "#ef4444",
          justifyContent: "flex-end",
          paddingRight: 20,
        }}
      >
        <span>RETIRAR</span>
        <FaUndo size={30} color="white" style={{ marginLeft: 10 }} />
      </motion.div>

      {/* Background Right: Picked */}
      <motion.div
        className="ec-swipe-background right"
        style={{
          opacity: rightBgOpacity,
          backgroundColor: "#22c55e",
          justifyContent: "flex-start",
          paddingLeft: 20,
        }}
      >
        <FaCheck size={30} color="white" style={{ marginRight: 10 }} />
        <span>AGREGAR</span>
      </motion.div>

      <motion.div
        className="ec-product-card"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        style={{ x, opacity }}
        whileTap={{ cursor: "grabbing" }}
      >
        <div className="ec-img-wrapper">
          {item.image_src ? (
            <img src={item.image_src} alt={item.name} className="ec-prod-img" />
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
                : `Pasillo ${item.pasillo}`}
            </span>
            <span className="ec-badge-cat">
              {item.categorias?.[0] || "General"}
            </span>
          </div>
          <h4 className="ec-name">{item.name}</h4>
          <div
            className="ec-sku-container"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              marginTop: "4px",
              alignItems: "flex-start",
            }}
          >
            {item.sku ? (
              <div
                className="ec-sku"
                style={{
                  background: "#e0e7ff",
                  color: "#3730a3",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                }}
              >
                Item: {item.sku}
              </div>
            ) : null}

            {item.barcode ? (
              <div
                className="ec-sku"
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                }}
              >
                Codigo de barras: {item.barcode}
              </div>
            ) : (
              <div
                className="ec-sku"
                style={{
                  background: "#f1f5f9",
                  color: "#94a3b8",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  fontSize: "0.7rem",
                  fontStyle: "italic",
                }}
              >
                Sin Codigo de barras
              </div>
            )}
          </div>
        </div>

        <div className="ec-qty-wrapper">
          <div className="ec-qty-circle">{item.quantity}</div>
          <span className="ec-unit">UND</span>
        </div>
      </motion.div>
    </div>
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
  <div
    className={`ec-product-card ${
      type === "removed" ? "removed-item" : "completed"
    }`}
  >
    <div className="ec-img-wrapper grayscale">
      {item.image_src ? (
        <img src={item.image_src} className="ec-prod-img" alt={item.name} />
      ) : (
        <FaBoxOpen />
      )}
    </div>
    <div className="ec-info completed-text">
      <h4 className="ec-name">{item.name}</h4>
      <span className="ec-picked-label">
        {type === "removed"
          ? reason
            ? `Retirado: ${reason}`
            : "Retirado"
          : "Recogido"}
      </span>
    </div>
    <div style={{ display: "flex", gap: "0" }}>
      {type === "removed" && (
        <button
          className="ec-btn-undo"
          onClick={() => onRecover(item.id)}
          style={{ color: "var(--ec-success)" }}
          title="Recuperar (Mover a Agregados)"
        >
          <FaCheck />
        </button>
      )}
      <button
        className="ec-btn-undo"
        onClick={() => onUndo(item.id)}
        title="Deshacer (Volver a Pendientes)"
      >
        <FaUndo />
      </button>
    </div>
  </div>
);

// --- COMPONENTE OVERLAY MANUAL (Portal) ---
const ManualConfirmOverlay = ({ isOpen, onConfirm, itemName }) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "80px", // Mover arriba para liberar controles de zoom abajo
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483647, // Mismo Z-Index máximo para estar a la par con Escaner
        width: "90%",
        maxWidth: "340px",
        textAlign: "center",
      }}
    >
      <button
        onClick={onConfirm}
        style={{
          width: "100%",
          padding: "16px",
          background: "var(--ec-success)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: "16px",
          color: "white",
          fontSize: "16px",
          fontWeight: "bold",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        <FaClipboardList />
        Confirmar Manualmente
      </button>
      <div
        style={{
          marginTop: "8px",
          color: "rgba(255,255,255,0.7)",
          fontSize: "12px",
          background: "rgba(0,0,0,0.5)",
          padding: "4px 8px",
          borderRadius: "4px",
          display: "inline-block",
        }}
      >
        O escanea el código de <b>{itemName}</b>
      </div>
    </div>,
    document.body
  );
};

const VistaPicker = () => {
  const [loading, setLoading] = useState(true);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [pickerStatus, setPickerStatus] = useState(null);
  const [startTime, setStartTime] = useState(null); // Nuevo estado para el inicio real
  const [pickedItems, setPickedItems] = useState({}); // { [id]: 'picked' | 'removed' | false }
  const [removedReasons, setRemovedReasons] = useState({}); // { [id]: 'motivo' }
  const [pendingRemoval, setPendingRemoval] = useState(null); // { id: 123 } para modal

  // Estados para Escaner
  const [isScanning, setIsScanning] = useState(false);
  const [itemToScan, setItemToScan] = useState(null);

  const [activeTab, setActiveTab] = useState("pending");
  const [timer, setTimer] = useState("00:00:00");
  const [userEmail, setUserEmail] = useState("");
  const [isSessionLoaded, setIsSessionLoaded] = useState(false); // [NEW] Flag to prevent overwriting storage

  // 1. Carga Inicial
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

        // 1. Buscamos email en distintos lugares (Orden de Prioridad Ajustado)
        const params = new URLSearchParams(window.location.search);
        let emailToUse = params.get("email");

        // PRIORIDAD ALTA: Usuario autenticado en Supabase
        // Esto evita que si estás logueado con tu cuenta personal, veas órdenes de un usuario "kiosco" guardado en localStorage
        if (!emailToUse) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) emailToUse = user.email;
        }

        // FALLBACK: LocalStorage (Solo si no hay usuario autenticado ni params)
        if (!emailToUse) emailToUse = localStorage.getItem("picker_email");
        if (!emailToUse) emailToUse = localStorage.getItem("correo_empleado");

        if (!emailToUse) {
          setLoading(false);
          return;
        }
        setUserEmail(emailToUse);

        // 2. Obtener Perfil Picker
        const statusRes = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/pickers?email=${encodeURIComponent(
            emailToUse
          )}`
        );
        const me = statusRes.data[0];

        if (me && me.id_pedido_actual) {
          setPickerStatus(me);

          // 3. Obtener Asignación REAL para el tiempo correcto (Fix Timer)
          const { data: assignmentData } = await supabase
            .from("wc_asignaciones_pedidos")
            .select("fecha_inicio")
            .eq("id_pedido", me.id_pedido_actual)
            .eq("estado_asignacion", "en_proceso")
            .maybeSingle();

          let finalStartTime = null;

          if (assignmentData && assignmentData.fecha_inicio) {
            let serverDate = new Date(assignmentData.fecha_inicio).getTime();
            const now = Date.now();

            // Fix Timezone / Futuro
            if (serverDate > now) {
              console.warn(
                "Detectada fecha futura (posible error TZ). Ajustando a ahora."
              );
              serverDate = now;
            }

            if (!isNaN(serverDate)) {
              finalStartTime = serverDate;
            }
          }

          // [MODIFIED] Check local storage for timer fallback if server calc failed or as a secondary check
          const storageKeyTime = `picker_timer_${me.id_pedido_actual}`;
          const savedStartTime = localStorage.getItem(storageKeyTime);

          if (finalStartTime) {
            setStartTime(finalStartTime);
            // Sync storage with server truth
            localStorage.setItem(storageKeyTime, finalStartTime.toString());
          } else if (savedStartTime && !isNaN(parseInt(savedStartTime))) {
            // Fallback to local storage if server didn't return a valid start time
            console.log("Usando tiempo de inicio guardado localmente");
            setStartTime(parseInt(savedStartTime));
          } else {
            // Fallback final: Iniciar YA
            console.warn(
              "No se encontró fecha_inicio válida, usando tiempo actual."
            );
            const now = Date.now();
            setStartTime(now);
            localStorage.setItem(storageKeyTime, now.toString());
          }

          // 4. Obtener Pedido WooCommerce
          const orderRes = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/${me.id_pedido_actual}`
          );
          setCurrentOrder(orderRes.data);

          // Inicializar items (esto podría persistirse en LocalStorage para no perder avance al refrescar)
          // [MODIFIED] Check local storage first
          const storageKeyItems = `picker_items_${me.id_pedido_actual}`;
          const storageKeyReasons = `picker_reasons_${me.id_pedido_actual}`;

          const savedItems = localStorage.getItem(storageKeyItems);
          const savedReasons = localStorage.getItem(storageKeyReasons);

          if (savedItems) {
            try {
              setPickedItems(JSON.parse(savedItems));
            } catch (err) {
              console.error("Error parsing saved items", err);
              // Fallback initialization
              const initialPicked = {};
              orderRes.data.line_items.forEach(
                (i) => (initialPicked[i.id] = false)
              );
              setPickedItems(initialPicked);
            }
          } else {
            const initialPicked = {};
            orderRes.data.line_items.forEach(
              (i) => (initialPicked[i.id] = false)
            );
            setPickedItems(initialPicked);
          }

          if (savedReasons) {
            try {
              setRemovedReasons(JSON.parse(savedReasons));
            } catch (err) {
              console.error("Error parsing saved reasons", err);
            }
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

  // 2. Lógica del Temporizador (Usando startTime real)
  useEffect(() => {
    if (!startTime) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = now - startTime;

      // Permitimos que muestre 00:00:00 si es negativo por desincronización
      const safeDiff = Math.max(0, diff);

      const h = Math.floor(safeDiff / 3600000);
      const m = Math.floor((safeDiff % 3600000) / 60000);
      const s = Math.floor((safeDiff % 60000) / 1000);
      setTimer(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
          .toString()
          .padStart(2, "0")}`
      );
    };

    updateTimer(); // Iniciar inmediatamente
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // [NEW] 2.1 Persistencia de sesión
  useEffect(() => {
    if (isSessionLoaded && pickerStatus && pickerStatus.id_pedido_actual) {
      const storageKeyItems = `picker_items_${pickerStatus.id_pedido_actual}`;
      const storageKeyReasons = `picker_reasons_${pickerStatus.id_pedido_actual}`;

      // Note: Timer is saved only on init currently, or we could update it here if needed,
      // but start time usually doesn't change during session.

      localStorage.setItem(storageKeyItems, JSON.stringify(pickedItems));
      localStorage.setItem(storageKeyReasons, JSON.stringify(removedReasons));
    }
  }, [isSessionLoaded, pickerStatus, pickedItems, removedReasons]);

  const handleScanMatch = useCallback(
    (decodedText) => {
      if (!itemToScan) return;

      const scanned = (decodedText || "").trim().toUpperCase();
      const expectedSku = (itemToScan.sku || "").trim().toUpperCase();
      const expectedBarcode = (itemToScan.barcode || "").trim().toUpperCase();

      // Validamos contra cualquiera de los dos (Barcode tiene prioridad lógica pero aceptamos ambos)
      const isMatch =
        (expectedBarcode && scanned === expectedBarcode) ||
        (expectedSku && scanned === expectedSku);

      if (isMatch) {
        setPickedItems((prev) => ({ ...prev, [itemToScan.id]: "picked" }));
        setItemToScan(null);
      } else {
        alert(
          `Código incorrecto.\nEscaneado: ${scanned}\nEsperaba Codigo de barras: ${
            expectedBarcode || "N/A"
          }\nO Item: ${expectedSku}`
        );
      }
      setIsScanning(false);
    },
    [itemToScan]
  );

  const handleManualConfirm = () => {
    if (!itemToScan) return;
    if (
      window.confirm(
        `¿Confirmar "${itemToScan.name}" manualmente sin escanear?`
      )
    ) {
      setPickedItems((prev) => ({ ...prev, [itemToScan.id]: "picked" }));
      setItemToScan(null);
      setIsScanning(false);
    }
  };

  const handleSwipe = (id, action) => {
    // action: 'picked' | 'removed' | 'request-removal'
    if (action === "request-removal") {
      setPendingRemoval({ id });
    } else if (action === "picked") {
      // Buscar item para validar SKU
      const item = currentOrder?.line_items?.find((i) => i.id === id);
      if (item && item.sku) {
        setItemToScan(item);
        setIsScanning(true);
      } else {
        // Fallback si no tiene SKU
        if (
          window.confirm(
            "El producto no tiene código SKU para validar. ¿Confirmar recolección manual?"
          )
        ) {
          setPickedItems((prev) => ({ ...prev, [id]: "picked" }));
        }
      }
    } else {
      setPickedItems((prev) => ({ ...prev, [id]: action }));
    }
  };

  const confirmRemoval = (reason) => {
    if (pendingRemoval) {
      setRemovedReasons((prev) => ({ ...prev, [pendingRemoval.id]: reason }));
      setPickedItems((prev) => ({ ...prev, [pendingRemoval.id]: "removed" }));
      setPendingRemoval(null); // Close modal
    }
  };

  const handleUndo = (id) => {
    setPickedItems((prev) => ({ ...prev, [id]: false }));
    setRemovedReasons((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleRecover = (id) => {
    // Mover directamente a Agregados (Picked) y limpiar motivo
    setPickedItems((prev) => ({ ...prev, [id]: "picked" }));
    setRemovedReasons((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleFinish = async () => {
    // 1. Verificar si quedan pendientes (Total procesado vs Total real)
    const processedCount = stats.picked + stats.removed;
    const hasPending = stats.total - processedCount > 0;

    if (hasPending) {
      // En caso de forzar finalización, los pendientes se marcan como retirados/omitted
      // Podríamos pedir motivo o asumir "No encontrado"
      if (
        !window.confirm(
          `Tienes ${
            stats.total - processedCount
          } productos PENDIENTES. ¿Deseas marcarlos como RETIRADOS y finalizar?`
        )
      ) {
        return;
      }
    } else {
      if (!window.confirm("¿Finalizar pedido y liberar turno?")) return;
    }

    try {
      // 2. Construir Reporte
      const reporte = {
        recolectados: [],
        retirados: [],
        pendientes: [],
      };

      currentOrder.line_items.forEach((item) => {
        const status = pickedItems[item.id];
        const simpleItem = {
          id: item.id,
          sku: item.sku,
          name: item.name,
          qty: item.quantity,
          reason: removedReasons[item.id] || null, // Añadir motivo
        };

        if (status === "picked") {
          reporte.recolectados.push(simpleItem);
        } else if (status === "removed") {
          reporte.retirados.push(simpleItem);
        } else {
          // Pendientes forzados
          reporte.retirados.push({
            ...simpleItem,
            reason: "No encontrado (Forzado)",
          });
        }
      });

      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/finalizar-picking",
        {
          id_pedido: currentOrder.id,
          id_picker: pickerStatus.id,
          reporte_items: reporte,
        }
      );

      // [NEW] Clear local storage for this order
      localStorage.removeItem(`picker_items_${currentOrder.id}`);
      localStorage.removeItem(`picker_reasons_${currentOrder.id}`);
      localStorage.removeItem(`picker_timer_${currentOrder.id}`);

      alert("¡Pedido Completado! Excelente trabajo.");
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  // 4. Agrupación y Filtrado
  const { pendingGroups, completedList, removedList, stats } = useMemo(() => {
    if (!currentOrder)
      return {
        pendingGroups: [],
        completedList: [],
        removedList: [],
        stats: { total: 0, picked: 0, removed: 0 },
      };

    const pendingMap = new Map();
    const completed = [];
    const removed = [];

    currentOrder.line_items.forEach((item) => {
      const status = pickedItems[item.id];
      if (status === "picked") {
        completed.push(item);
      } else if (status === "removed") {
        removed.push(item);
      } else {
        // Pending
        const pasilloKey =
          item.pasillo === "S/N" || item.pasillo === "Otros"
            ? "OTROS / GENERAL"
            : `PASILLO ${item.pasillo}`;

        if (!pendingMap.has(pasilloKey)) pendingMap.set(pasilloKey, []);
        pendingMap.get(pasilloKey).push(item);
      }
    });

    return {
      pendingGroups: Array.from(pendingMap.entries()).map(([k, v]) => ({
        title: k,
        items: v,
      })),
      completedList: completed,
      removedList: removed,
      stats: {
        total: currentOrder.line_items.length,
        picked: completed.length,
        removed: removed.length,
      },
    };
  }, [currentOrder, pickedItems]);

  // --- RENDER ---
  if (!userEmail) {
    if (loading) {
      return (
        <div className="ec-picker-centered-view">
          <div className="ec-picker-spinner"></div>
          <p>Identificando usuario...</p>
        </div>
      );
    }
    return (
      <div className="ec-picker-centered-view">
        <h3>⛔ Acceso no identificado</h3>
        <p>No se pudo detectar tu cuenta de picker.</p>
        <p style={{ fontSize: "0.9rem", color: "#95a5a6", marginTop: 5 }}>
          Inicia sesión en Admin o usa el enlace directo.
        </p>
        <button
          onClick={() => (window.location.href = "/acceso")}
          style={{
            marginTop: "20px",
            background: "var(--ec-primary)",
            color: "white",
            border: "none",
            padding: "12px 24px",
            borderRadius: "12px",
            fontSize: "1rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <FaArrowLeft /> Volver al inicio
        </button>
      </div>
    );
  }

  if (loading)
    return (
      <div className="ec-picker-centered-view">
        <div className="ec-picker-spinner"></div>
        <p>Cargando pedido...</p>
      </div>
    );

  if (!currentOrder) return <EmptyScreen />;

  return (
    <div className="ec-picker-main-layout">
      {/* Header Fijo */}
      <header className="ec-picker-sticky-header">
        <div className="ec-picker-header-row">
          <div className="ec-picker-order-badge">#{currentOrder.id}</div>
          <div className="ec-picker-timer-pill">
            <FaClock /> {timer}
          </div>
        </div>

        {/* TABS */}
        <div className="ec-tabs">
          <button
            className={`ec-tab ${activeTab === "removed" ? "active" : ""}`}
            onClick={() => setActiveTab("removed")}
          >
            Retirados ({stats.removed})
          </button>
          <button
            className={`ec-tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
            style={{
              borderLeft: "1px solid #e2e8f0",
              borderRight: "1px solid #e2e8f0",
            }}
          >
            Pendient. ({stats.total - stats.picked - stats.removed})
          </button>
          <button
            className={`ec-tab ${activeTab === "completed" ? "active" : ""}`}
            onClick={() => setActiveTab("completed")}
          >
            Agregados ({stats.picked})
          </button>
        </div>

        <div className="ec-picker-progress-track">
          <div
            className="ec-picker-progress-fill"
            style={{
              width: `${((stats.picked + stats.removed) / stats.total) * 100}%`,
            }}
          ></div>
          <span className="ec-picker-progress-label">
            {stats.picked + stats.removed} / {stats.total} Productos
          </span>
        </div>
      </header>

      {/* Contenido Scrollable */}
      <div className="ec-picker-scroll-container">
        {activeTab === "pending" &&
          (pendingGroups.length > 0 ? (
            pendingGroups.map((group, idx) => (
              <div key={idx} className="ec-picker-aisle-group">
                <div className="ec-picker-aisle-header">
                  <span className="ec-picker-aisle-title">{group.title}</span>
                  <span className="ec-picker-aisle-count">
                    {group.items.length} items
                  </span>
                </div>
                <div className="ec-picker-aisle-items">
                  {group.items.map((item) => (
                    <SwipeCard
                      key={item.id}
                      item={item}
                      onSwipe={handleSwipe}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="ec-empty-tab">
              <FaCheck size={50} color="#22c55e" />
              <p>No tienes pendientes.</p>
            </div>
          ))}

        {activeTab === "completed" && (
          <div className="ec-completed-list">
            {completedList.length > 0 ? (
              completedList.map((item) => (
                <CompletedCard
                  key={item.id}
                  item={item}
                  onUndo={handleUndo}
                  type="picked"
                />
              ))
            ) : (
              <div className="ec-empty-tab">
                <p>Aún no has agregado productos.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "removed" && (
          <div className="ec-completed-list">
            {removedList.length > 0 ? (
              removedList.map((item) => (
                <CompletedCard
                  key={item.id}
                  item={item}
                  onUndo={handleUndo}
                  onRecover={handleRecover}
                  type="removed"
                  reason={removedReasons[item.id]}
                />
              ))
            ) : (
              <div className="ec-empty-tab">
                <p>No has retirado ningún producto.</p>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 80 }}></div>
      </div>

      <EscanerBarras
        isScanning={isScanning}
        setIsScanning={setIsScanning}
        onScan={handleScanMatch}
      />

      <ManualConfirmOverlay
        isOpen={isScanning && itemToScan}
        onConfirm={handleManualConfirm}
        itemName={itemToScan?.name || "producto"}
      />

      {/* MODAL DE MOTIVO DE RETIRO */}
      {pendingRemoval && (
        <div className="ec-modal-overlay">
          <div className="ec-modal-content">
            <h3>Motivo del Retiro</h3>
            <p>¿Por qué no se puede recolectar este producto?</p>
            <div className="ec-modal-options">
              <button
                className="ec-modal-option"
                style={{ background: "#e74c3c", color: "white" }}
                onClick={() => confirmRemoval("No encontrado")}
              >
                🔍 No encontrado
              </button>
              <button
                className="ec-modal-option"
                style={{ background: "#f39c12", color: "white" }}
                onClick={() => confirmRemoval("Agotado")}
              >
                📉 Agotado
              </button>
              <button
                className="ec-modal-option"
                style={{ background: "#7f8c8d", color: "white" }}
                onClick={() => confirmRemoval("Cancelado por Cliente")}
              >
                🚫 El cliente lo canceló
              </button>
            </div>
            <button
              className="ec-modal-cancel"
              onClick={() => setPendingRemoval(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Botón Flotante */}
      {stats.picked + stats.removed === stats.total && stats.total > 0 && (
        <div className="ec-picker-fab-wrapper">
          <button
            className="ec-picker-fab-btn ec-picker-ready"
            onClick={handleFinish}
          >
            <span className="ec-picker-fab-icon">
              <FaShoppingBasket />
            </span>
            <span className="ec-reco-btn-text">FINALIZAR PEDIDO</span>
            <FaArrowRight />
          </button>
        </div>
      )}
    </div>
  );
};

// PANTALLA VACÍA ACTUALIZADA
const EmptyScreen = () => (
  <motion.div
    className="ec-empty-state-container"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <div className="ec-empty-illustration">
      <FaClipboardList className="ec-empty-icon-main" />
      <div className="ec-empty-icon-badge">
        <FaUserClock />
      </div>
    </div>

    <h2 className="ec-empty-title">¡Todo listo por ahora!</h2>
    <p className="ec-empty-description">
      No tienes pedidos asignados en este momento. El administrador te asignará
      un nuevo pedido pronto.
    </p>

    <button
      onClick={() => window.location.reload()}
      className="ec-picker-btn-primary ec-btn-large"
    >
      <FaSync className="ec-spin" style={{ marginRight: 10 }} />
      Actualizar estado
    </button>

    <button
      onClick={() => (window.location.href = "/acceso")}
      style={{
        marginTop: "20px",
        background: "transparent",
        color: "var(--ec-text-muted)",
        border: "none",
        fontSize: "1rem",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <FaArrowLeft /> Volver al inicio
    </button>
  </motion.div>
);

export default VistaPicker;
