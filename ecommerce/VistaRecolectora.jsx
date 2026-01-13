import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { supabase } from "../../supabaseClient";
import { motion, useMotionValue, useTransform } from "framer-motion";
import {
  FaClock,
  FaCheck,
  FaMapMarkerAlt,
  FaBoxOpen,
  FaArrowRight,
  FaUndo,
  FaShoppingBasket,
  FaSync,
  FaClipboardList,
  FaUserClock,
} from "react-icons/fa";
import "./VistaRecolectora.css";

// --- COMPONENTE SWIPEABLE ---
const SwipeCard = ({ item, onSwipe }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, 150], [1, 0]);
  const backgroundOpacity = useTransform(x, [0, 50], [0, 1]);

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 100) {
      onSwipe(item.id);
    }
  };

  return (
    <div className="ec-swipe-wrapper">
      <motion.div
        className="ec-swipe-background"
        style={{ opacity: backgroundOpacity }}
      >
        <FaCheck size={30} color="white" />
        <span>AGREGAR AL CARRITO</span>
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
          {item.sku && <div className="ec-sku">SKU: {item.sku}</div>}
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
const CompletedCard = ({ item, onUndo }) => (
  <div className="ec-product-card completed">
    <div className="ec-img-wrapper grayscale">
      {item.image_src ? (
        <img src={item.image_src} className="ec-prod-img" alt={item.name} />
      ) : (
        <FaBoxOpen />
      )}
    </div>
    <div className="ec-info completed-text">
      <h4 className="ec-name">{item.name}</h4>
      <span className="ec-picked-label">Recogido</span>
    </div>
    <button className="ec-btn-undo" onClick={() => onUndo(item.id)}>
      <FaUndo />
    </button>
  </div>
);

const VistaRecolectora = () => {
  const [loading, setLoading] = useState(true);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [collectorStatus, setCollectorStatus] = useState(null);
  const [pickedItems, setPickedItems] = useState({});
  const [activeTab, setActiveTab] = useState("pending");
  const [timer, setTimer] = useState("00:00:00");
  const [userEmail, setUserEmail] = useState("");

  // 1. Carga Inicial
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

        // 1. Buscamos email en distintos lugares (URL, LocalStorage específico, LocalStorage general, Sesión)
        const params = new URLSearchParams(window.location.search);
        let emailToUse = params.get("email");

        if (!emailToUse) {
          emailToUse = localStorage.getItem("recolectora_email");
        }

        if (!emailToUse) {
          emailToUse = localStorage.getItem("correo_empleado");
        }

        if (!emailToUse) {
          // Fallback: Check active Supabase session
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) emailToUse = user.email;
        }

        if (!emailToUse) {
          setLoading(false);
          return;
        }
        setUserEmail(emailToUse);

        const statusRes = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/recolectoras?email=${encodeURIComponent(
            emailToUse
          )}`
        );
        const me = statusRes.data[0];

        if (me && me.id_pedido_actual) {
          setCollectorStatus(me);
          const orderRes = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/${me.id_pedido_actual}`
          );
          setCurrentOrder(orderRes.data);

          const initialPicked = {};
          orderRes.data.line_items.forEach(
            (i) => (initialPicked[i.id] = false)
          );
          setPickedItems(initialPicked);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // 2. Lógica del Temporizador
  useEffect(() => {
    if (!collectorStatus?.fecha_inicio_orden) return;

    const interval = setInterval(() => {
      const start = new Date(collectorStatus.fecha_inicio_orden).getTime();
      const now = Date.now();
      const diff = now - start;

      if (diff > 0) {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimer(
          `${h}:${m.toString().padStart(2, "0")}:${s
            .toString()
            .padStart(2, "0")}`
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [collectorStatus]);

  // 3. Manejo de Swipe/Acciones
  const handleSwipe = (id) => {
    setPickedItems((prev) => ({ ...prev, [id]: true }));
  };

  const handleUndo = (id) => {
    setPickedItems((prev) => ({ ...prev, [id]: false }));
  };

  const handleFinish = async () => {
    if (!window.confirm("¿Finalizar pedido y liberar turno?")) return;
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/finalizar-recoleccion",
        {
          id_pedido: currentOrder.id,
          id_recolectora: collectorStatus.id,
        }
      );
      alert("¡Pedido Completado! Excelente trabajo.");
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const val = e.target.elements.email.value;
    if (val) {
      localStorage.setItem("recolectora_email", val);
      window.location.reload();
    }
  };

  // 4. Agrupación y Filtrado
  const { pendingGroups, completedList, stats } = useMemo(() => {
    if (!currentOrder)
      return {
        pendingGroups: [],
        completedList: [],
        stats: { total: 0, picked: 0 },
      };

    const pendingMap = new Map();
    const completed = [];
    let pickedCount = 0;

    currentOrder.line_items.forEach((item) => {
      if (pickedItems[item.id]) {
        completed.push(item);
        pickedCount++;
      } else {
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
      stats: { total: currentOrder.line_items.length, picked: pickedCount },
    };
  }, [currentOrder, pickedItems]);

  // --- RENDER ---
  if (!userEmail) return <LoginScreen onSubmit={handleLogin} />;

  if (loading)
    return (
      <div className="ec-reco-centered-view">
        <div className="ec-reco-spinner"></div>
        <p>Cargando pedido...</p>
      </div>
    );

  if (!currentOrder) return <EmptyScreen />;

  return (
    <div className="ec-reco-main-layout">
      {/* Header Fijo */}
      <header className="ec-reco-sticky-header">
        <div className="ec-reco-header-row">
          <div className="ec-reco-order-badge">#{currentOrder.id}</div>
          <div className="ec-reco-timer-pill">
            <FaClock /> {timer}
          </div>
        </div>

        {/* TABS */}
        <div className="ec-tabs">
          <button
            className={`ec-tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            Pendientes ({stats.total - stats.picked})
          </button>
          <button
            className={`ec-tab ${activeTab === "completed" ? "active" : ""}`}
            onClick={() => setActiveTab("completed")}
          >
            Agregados ({stats.picked})
          </button>
        </div>

        {/* Barra de Progreso */}
        <div className="ec-reco-progress-track">
          <div
            className="ec-reco-progress-fill"
            style={{ width: `${(stats.picked / stats.total) * 100}%` }}
          ></div>
          <span className="ec-reco-progress-label">
            {stats.picked} / {stats.total} Productos
          </span>
        </div>
      </header>

      {/* Contenido Scrollable */}
      <div className="ec-reco-scroll-container">
        {activeTab === "pending" ? (
          pendingGroups.length > 0 ? (
            pendingGroups.map((group, idx) => (
              <div key={idx} className="ec-reco-aisle-group">
                <div className="ec-reco-aisle-header">
                  <span className="ec-reco-aisle-title">{group.title}</span>
                  <span className="ec-reco-aisle-count">
                    {group.items.length} items
                  </span>
                </div>
                <div className="ec-reco-aisle-items">
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
              <p>¡Todo listo! Revisa la pestaña Agregados.</p>
            </div>
          )
        ) : (
          <div className="ec-completed-list">
            {completedList.map((item) => (
              <CompletedCard key={item.id} item={item} onUndo={handleUndo} />
            ))}
          </div>
        )}
        <div style={{ height: 80 }}></div>
      </div>

      {/* Botón Flotante */}
      {stats.picked === stats.total && stats.total > 0 && (
        <div className="ec-reco-fab-wrapper">
          <button
            className="ec-reco-fab-btn ec-reco-ready"
            onClick={handleFinish}
          >
            <span className="ec-reco-fab-icon">
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

// Subcomponentes
const LoginScreen = ({ onSubmit }) => (
  <div className="ec-reco-centered-view">
    <h2>👋 Hola Recolectora</h2>
    <p>Ingresa tu correo para ver tu asignación actual.</p>
    <form onSubmit={onSubmit} className="ec-reco-login-form">
      <input
        name="email"
        type="email"
        placeholder="Tu correo corporativo"
        className="ec-reco-input"
        required
      />
      <button type="submit" className="ec-reco-btn-primary">
        Ingresar al Sistema
      </button>
    </form>
  </div>
);

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
      className="ec-reco-btn-primary ec-btn-large"
    >
      <FaSync className="ec-spin" style={{ marginRight: 10 }} />
      Actualizar estado
    </button>
  </motion.div>
);

export default VistaRecolectora;
