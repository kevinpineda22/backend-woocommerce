import React, { useState, useEffect, useCallback } from "react";
import {
  FaRunning,
  FaMapMarkerAlt,
  FaEye,
  FaClock,
  FaLayerGroup,
} from "react-icons/fa";
import { supabase } from "../../supabaseClient";
import axios from "axios";
import "./PedidosAdmin.css";

const SessionTimer = ({ startTime }) => {
  const [elapsed, setElapsed] = useState("00:00:00");
  const [isLong, setIsLong] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const start = new Date(startTime).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      if (diff < 0) return;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setElapsed(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      );
      if (hours > 0 || minutes >= 45) setIsLong(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className={`pa-timer ${isLong ? "danger" : ""}`}>
      <FaClock /> {elapsed}
    </div>
  );
};

const ActiveSessionsView = ({ onViewDetail }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Función de recarga (Con Cache Busting)
  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/dashboard-activo?t=${Date.now()}`,
      );
      setSessions(res.data);
    } catch (e) {
      console.error("Error fetching sessions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();

    const channel = supabase
      .channel("admin-dashboard-ultra-fast")
      // A. Cambios estructurales (Sesiones, Asignaciones) -> Recarga completa
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_picking_sessions" },
        () => {
          console.log("🔄 Cambio en sesiones -> Recargando...");
          setTimeout(fetchSessions, 500);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_asignaciones_pedidos" },
        () => {
          console.log("🔄 Cambio en asignaciones -> Recargando...");
          setTimeout(fetchSessions, 500);
        },
      )

      // B. Cambios de Logs (Picking Real) -> Recarga inteligente
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_log_picking" },
        (payload) => {
          console.log(`⚡ Actividad Picker detectada (${payload.eventType})`);

          // 1. Disparamos la recarga real del servidor con un delay de seguridad
          // Esto da tiempo a que el INSERT se propague y sea visible para la query del dashboard
          setTimeout(() => {
            fetchSessions();
          }, 500);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSessions]);

  if (loading && sessions.length === 0)
    return (
      <div className="pedidos-empty-list-container">
        <p>Cargando rutas en vivo...</p>
      </div>
    );

  if (!sessions || sessions.length === 0) {
    return (
      <div className="pedidos-empty-list-container">
        <FaRunning size={50} style={{ marginBottom: 20, opacity: 0.5 }} />
        <h3>Todo tranquilo por aquí.</h3>
        <p>No hay pickers en ruta en este momento.</p>
      </div>
    );
  }

  return (
    <div className="pa-dashboard-grid">
      {sessions.map((session) => (
        <div key={session.session_id} className="pa-dashboard-card">
          <div className="pa-card-header">
            <div className="pa-picker-info">
              <div className="pa-avatar">
                {session.picker_name
                  ? session.picker_name.charAt(0).toUpperCase()
                  : "?"}
              </div>
              <div>
                <h4>{session.picker_name}</h4>
                <span className="pa-session-id">
                  #{session.session_id.slice(0, 6)}
                </span>
              </div>
            </div>
            <SessionTimer startTime={session.start_time} />
          </div>

          <div className="pa-progress-section">
            <div className="pa-progress-labels">
              <span>Progreso Global</span>
              <span>{session.progress}%</span>
            </div>
            <div className="pa-progress-bar-bg">
              <div
                className="pa-progress-bar-fill"
                style={{
                  width: `${session.progress}%`,
                  background: session.progress === 100 ? "#10b981" : "#3b82f6",
                }}
              ></div>
            </div>
          </div>

          <div className="pa-batch-summary">
            <div className="pa-bs-header">
              <FaLayerGroup size={12} color="#64748b" />
              <span>Batch de {session.orders_count} pedidos:</span>
            </div>
            <div className="pa-bs-list">
              {session.order_ids &&
                session.order_ids.map((id) => (
                  <span key={id} className="pa-bs-chip">
                    #{id}
                  </span>
                ))}
            </div>
          </div>

          <div className="pa-stats-grid">
            <div className="pa-stat-box">
              <span className="pa-stat-num">{session.completed_items}</span>
              <span className="pa-stat-label">✅ Listos</span>
            </div>
            <div className="pa-stat-box warning">
              <span className="pa-stat-num">{session.substituted_items}</span>
              <span className="pa-stat-label">🔄 Cambios</span>
            </div>
            <div className="pa-stat-box pending">
              <span className="pa-stat-num">
                {session.total_items - session.completed_items}
              </span>
              <span className="pa-stat-label">⏳ Faltan</span>
            </div>
          </div>

          <div className="pa-location-badge">
            <FaMapMarkerAlt /> {session.current_location}
          </div>

          <button
            className="pa-view-detail-btn"
            onClick={() => onViewDetail(session)}
          >
            <FaEye /> Ver Detalle en Vivo
          </button>
        </div>
      ))}
    </div>
  );
};

export default ActiveSessionsView;
