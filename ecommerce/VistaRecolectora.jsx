import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  FaClock,
  FaCheck,
  FaCheckCircle,
  FaSpinner,
  FaBoxOpen,
} from "react-icons/fa";
import "./VistaRecolectora.css";

const SwipeableItem = ({ item, onToggle }) => {
  const x = useMotionValue(0);
  const backgroundOpacity = useTransform(x, [-100, 0], [1, 0]);
  const isCompleted = item.picked;

  const handleDragEnd = (event, info) => {
    if (info.offset.x < -80) {
      // Swiped left enough
      // Toggle picked state
      onToggle(item.id);
    }
  };

  return (
    <div className={`reco-item-container ${isCompleted ? "completed" : ""}`}>
      {/* Background Layer (Success/Picked) */}
      <motion.div
        className="reco-swipe-bg"
        style={{ opacity: isCompleted ? 1 : backgroundOpacity }}
      >
        <FaCheck className="reco-swipe-icon" />
      </motion.div>

      {/* Foreground Card */}
      <motion.div
        className="reco-item-content"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        // If completed, we might want to slide it permanently or just color it
        animate={{ x: 0 }}
        style={{ x }}
        whileTap={{ cursor: "grabbing" }}
      >
        <img
          src={item.image_src || "https://placehold.co/60x60?text=No+Img"}
          alt={item.name}
          className="reco-item-img"
        />
        <div className="reco-item-details">
          <div className="reco-item-name">{item.name}</div>
          <div className="reco-item-meta">SKU: {item.sku || "N/A"}</div>
        </div>
        <div className="reco-item-qty">{item.quantity}</div>
      </motion.div>
    </div>
  );
};

const VistaRecolectora = () => {
  const [loading, setLoading] = useState(true);
  const [collectorStatus, setCollectorStatus] = useState(null);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [pickedItems, setPickedItems] = useState({}); // { itemId: true/false }
  const [timer, setTimer] = useState("00:00:00");

  const [userEmail, setUserEmail] = useState("");

  // Fetch Collector Status
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

        // 1. Determine user email: URL param OR LocalStorage OR Session
        const params = new URLSearchParams(window.location.search);
        let emailToUse = params.get("email");

        if (!emailToUse) {
          // Check specific recolectora email OR general employee login email
          emailToUse =
            localStorage.getItem("recolectora_email") ||
            localStorage.getItem("correo_empleado");
        }

        // Fallback: Check active Supabase session
        if (!emailToUse) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) emailToUse = user.email;
        }

        if (!emailToUse) {
          setLoading(false);
          return; // Show email input screen
        }

        setUserEmail(emailToUse);

        // 2. Get Collector Status (Active Order ID)
        const encodedEmail = encodeURIComponent(emailToUse);
        const statusRes = await axios.get(
          `https://backend-woocommerce.vercel.app/api/orders/recolectoras?email=${encodedEmail}`
        );

        // API returns an array, find the one matching our email
        const myProfile = statusRes.data.find((r) => r.email === emailToUse);

        if (myProfile && myProfile.id_pedido_actual) {
          setCollectorStatus(myProfile);
          // 3. Fetch the actual order
          const orderRes = await axios.get(
            `https://backend-woocommerce.vercel.app/api/orders/${myProfile.id_pedido_actual}`
          );
          setCurrentOrder(orderRes.data);

          // Initialize picked items from simple local state (or localStorage in refresh)
          const initialPicked = {};
          orderRes.data.line_items.forEach(
            (i) => (initialPicked[i.id] = false)
          );
          setPickedItems(initialPicked);
        } else {
          setCollectorStatus(null);
        }
      } catch (err) {
        console.error("Error loading recolectora view", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  // Timer Logic
  useEffect(() => {
    if (!collectorStatus?.fecha_inicio_orden) return;

    const interval = setInterval(() => {
      const start = new Date(collectorStatus.fecha_inicio_orden).getTime();
      const now = new Date().getTime();
      const diff = now - start;

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimer(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [collectorStatus]);

  // Grouping Logic (Mock Pasillos if not present)
  const groupedItems = useMemo(() => {
    if (!currentOrder) return {};

    const groups = {};
    currentOrder.line_items.forEach((item) => {
      // Try to find 'Pasillo' in meta_data, otherwise Random/Default
      const pasilloMeta = item.meta_data?.find(
        (m) => m.key === "pa_pasillo" || m.key === "pasillo"
      );
      const pasilloName = pasilloMeta
        ? pasilloMeta.value
        : "PASILLO GENERAL (Sin Asignar)"; // Fallback

      if (!groups[pasilloName]) groups[pasilloName] = [];
      groups[pasilloName].push({
        ...item,
        picked: pickedItems[item.id] || false,
      });
    });
    return groups;
  }, [currentOrder, pickedItems]);

  const handleToggleItem = (itemId) => {
    setPickedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const allPicked = useMemo(() => {
    if (!currentOrder) return false;
    return currentOrder.line_items.every((i) => pickedItems[i.id]);
  }, [currentOrder, pickedItems]);

  const handleFinishOrder = async () => {
    if (!window.confirm("¿Confirmar que has recolectado todos los productos?"))
      return;

    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/finalizar-recoleccion",
        {
          id_pedido: currentOrder.id,
          id_recolectora: collectorStatus.id,
        }
      );
      alert("¡Excelente trabajo! Pedido completado.");
      setCollectorStatus(null);
      setCurrentOrder(null);
    } catch (err) {
      alert("Error al finalizar: " + err.message);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const email = e.target.elements.email.value;
    if (email) {
      localStorage.setItem("recolectora_email", email);
      window.location.reload();
    }
  };

  if (!userEmail && !loading) {
    return (
      <div className="reco-container reco-loading-state">
        <h2>Identificación</h2>
        <p>Ingresa tu correo de recolectora para ver tus asignaciones.</p>
        <form
          onSubmit={handleLogin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "20px",
          }}
        >
          <input
            type="email"
            name="email"
            placeholder="ejemplo@merkahorro.com"
            style={{
              padding: "10px",
              borderRadius: "5px",
              border: "1px solid #ccc",
            }}
            required
          />
          <button
            type="submit"
            className="reco-btn-finish"
            style={{ width: "100%", background: "#3b82f6" }}
          >
            Ingresar
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="reco-container reco-loading-state">
        <div className="reco-spinner"></div>
        <h3>Cargando misión...</h3>
      </div>
    );
  }

  if (!currentOrder) {
    return (
      <div className="reco-container reco-loading-state">
        <FaBoxOpen size={50} style={{ color: "#cbd5e1", marginBottom: 20 }} />
        <h2>Sin Misión Activa</h2>
        <p>No tienes pedidos asignados en este momento.</p>
        <button
          className="reco-btn-finish"
          style={{ marginTop: 20, width: "auto", background: "#3b82f6" }}
          onClick={() => window.location.reload()}
        >
          Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="reco-container">
      {/* Sticky Header */}
      <header className="reco-header">
        <div className="reco-order-id">#{currentOrder.id}</div>
        <div className="reco-timer-card">
          <FaClock /> {timer}
        </div>
      </header>

      {/* Aisle List */}
      <div className="reco-content">
        {Object.entries(groupedItems).map(([aisleName, items]) => {
          const pickedCount = items.filter((i) => i.picked).length;
          const totalCount = items.length;
          return (
            <div key={aisleName} className="reco-aisle-section">
              <div className="reco-aisle-header">
                <span>{aisleName}</span>
                <span className="reco-aisle-progress">
                  {pickedCount}/{totalCount}
                </span>
              </div>
              <div className="reco-items-list">
                {items.map((item) => (
                  <SwipeableItem
                    key={item.id}
                    item={item}
                    onToggle={handleToggleItem}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <footer className="reco-footer">
        <button
          className="reco-btn-finish"
          disabled={!allPicked}
          onClick={handleFinishOrder}
        >
          {allPicked
            ? "Finalizar Recolección"
            : `Faltan items (${
                currentOrder.line_items.length -
                Object.values(pickedItems).filter(Boolean).length
              })`}
        </button>
      </footer>
    </div>
  );
};

export default VistaRecolectora;
