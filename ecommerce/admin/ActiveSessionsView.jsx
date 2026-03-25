import React, { useState, useEffect, useCallback } from "react";
import {
  FaRunning,
  FaMapMarkerAlt,
  FaEye,
  FaClock,
  FaLayerGroup,
  FaSync,
  FaStoreAlt,
  FaSpinner,
  FaExclamationTriangle,
} from "react-icons/fa";
import { supabase } from "../../../supabaseClient";
import { useSedeContext } from "../shared/SedeContext";
import { ecommerceApi } from "../shared/ecommerceApi";
import "./ActiveSessionsView.css";

// Calcula el tiempo transcurrido desde una fecha
const useElapsed = (startTime) => {
  const [elapsed, setElapsed] = useState(null);
  useEffect(() => {
    if (!startTime) return;
    const tick = () => {
      const diff = new Date().getTime() - new Date(startTime).getTime();
      if (diff < 0) return;
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setElapsed(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  return elapsed;
};

// Muestra ambos contadores: tiempo de sesión y tiempo pickeando
const DualTimer = ({ startTime, pickingStartTime }) => {
  const sessionElapsed = useElapsed(startTime);
  const pickingElapsed = useElapsed(pickingStartTime);

  // Alerta si la sesión lleva más de 45 min
  const sessionDiff = startTime
    ? new Date().getTime() - new Date(startTime).getTime()
    : 0;
  const isLong = sessionDiff >= 45 * 60 * 1000;

  return (
    <div className="pa-dual-timer">
      <div className={`pa-timer ${isLong ? "danger" : ""}`} title="Tiempo en sesión">
        <FaClock /> {sessionElapsed || "--:--:--"}
      </div>
      <div
        className={`pa-timer picking ${pickingStartTime ? "" : "muted"}`}
        title="Tiempo pickeando"
      >
        🛒 {pickingElapsed || "Sin iniciar"}
      </div>
    </div>
  );
};

const ActiveSessionsView = ({ onViewDetail, loadingDetailId }) => {
  const { getSedeParam, isSuperAdmin } = useSedeContext();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Función de recarga (Con Cache Busting + Sede)
  const fetchSessions = useCallback(async () => {
    try {
      const sp = getSedeParam ? getSedeParam() : "";
      const res = await ecommerceApi.get(`/dashboard-activo`, {
        params: { ...Object.fromEntries(new URLSearchParams(sp)) },
      });
      setSessions(res.data);
    } catch (e) {
      console.error("Error fetching sessions:", e);
    } finally {
      setLoading(false);
    }
  }, [getSedeParam]);

  useEffect(() => {
    fetchSessions();

    // Canal principal para cambios en la base de datos
    const dbChannel = supabase
      .channel("admin-dashboard-db-changes")
      // A. Cambios estructurales (Sesiones, Asignaciones) -> Recarga completa
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_picking_sessions" },
        () => {
          console.log("🔄 Cambio en sesiones -> Recargando...");
          setTimeout(fetchSessions, 300);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_asignaciones_pedidos" },
        () => {
          console.log("🔄 Cambio en asignaciones -> Recargando...");
          setTimeout(fetchSessions, 300);
        },
      )

      // B. Cambios de Logs (Picking Real)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wc_log_picking" },
        (payload) => {
          console.log(
            "⚡ Nuevo Log Insertado -> Recargando dashboard INMEDIATAMENTE",
            payload,
          );
          fetchSessions();
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "wc_log_picking" },
        (payload) => {
          console.log(
            "⚡ Log Eliminado (Undo) -> Recargando dashboard",
            payload,
          );
          fetchSessions();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wc_log_picking" },
        () => {
          console.log("⚡ Log Actualizado -> Recargando dashboard");
          fetchSessions();
        },
      )
      .subscribe();

    // 🚀 NUEVO: Canal de BROADCAST para actualizaciones instantáneas desde los pickers
    const broadcastChannel = supabase
      .channel("dashboard-updates")
      .on("broadcast", { event: "picking_action" }, (payload) => {
        console.log("🔥 BROADCAST RECIBIDO desde picker:", payload);
        fetchSessions(); // Actualización INMEDIATA sin delay
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [fetchSessions]);

  const handleManualRefresh = () => {
    setLoading(true);
    fetchSessions();
  };

  if (loading && sessions.length === 0)
    return (
      <div className="pedidos-empty-list-container">
        <FaSpinner
          className="ec-spin"
          size={30}
          style={{ marginBottom: 12, opacity: 0.6 }}
        />
        <p>Cargando rutas en vivo...</p>
      </div>
    );

  if (!sessions || sessions.length === 0) {
    return (
      <div className="pedidos-empty-list-container">
        <FaRunning size={50} style={{ marginBottom: 20, opacity: 0.5 }} />
        <h3>Todo tranquilo por aquí.</h3>
        <p>No hay pickers en ruta en este momento.</p>
        <button
          className="pa-view-detail-btn"
          onClick={fetchSessions}
          style={{ marginTop: 20 }}
        >
          <FaSync /> Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="pa-dashboard-grid">
      <div className="pa-dashboard-refresh-bar">
        <button className="pa-view-detail-btn" onClick={handleManualRefresh}>
          <FaSync className={loading ? "ec-spin" : ""} /> Refrescar Datos
        </button>
      </div>

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
            <DualTimer
              startTime={session.start_time}
              pickingStartTime={session.picking_start_time}
            />
          </div>

          <div className="pa-progress-section">
            <div className="pa-progress-labels">
              <span>
                {session.processed_units !== undefined
                  ? `${session.processed_units} / ${session.total_units} unidades`
                  : "Progreso Global"}
              </span>
              <span>{session.progress}%</span>
            </div>
            <div className="pa-progress-bar-bg">
              <div
                className={`pa-progress-bar-fill ${session.progress === 100 ? "pa-progress-complete" : ""}`}
                style={{ width: `${session.progress}%` }}
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

          {(session.not_found_items > 0) && (
            <div className="pa-not-found-badge">
              <FaExclamationTriangle /> {session.not_found_items} producto{session.not_found_items !== 1 ? "s" : ""} cancelado{session.not_found_items !== 1 ? "s" : ""} por admin
            </div>
          )}

          <div className="pa-location-badge">
            <FaMapMarkerAlt /> {session.current_location}
          </div>

          {isSuperAdmin && session.sede_nombre && (
            <div className="pa-dashboard-card-sede">
              <FaStoreAlt size={12} /> {session.sede_nombre}
            </div>
          )}

          <button
            className="pa-view-detail-btn"
            onClick={() => onViewDetail(session)}
            disabled={loadingDetailId === session.session_id}
          >
            {loadingDetailId === session.session_id ? (
              <>
                <FaSpinner className="ec-spin" /> Cargando...
              </>
            ) : (
              <>
                <FaEye /> Ver Detalle en Vivo
              </>
            )}
          </button>
        </div>
      ))}
    </div>
  );
};

export default ActiveSessionsView;
