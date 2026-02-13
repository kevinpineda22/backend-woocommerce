import React, { useState, useEffect } from "react";
import { FaRunning, FaMapMarkerAlt, FaEye, FaClock, FaLayerGroup } from "react-icons/fa";
import "./PedidosAdmin.css";

// --- COMPONENTE CRONÓMETRO INTERNO ---
const SessionTimer = ({ startTime }) => {
    const [elapsed, setElapsed] = useState("00:00:00");
    const [isLong, setIsLong] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            const start = new Date(startTime).getTime();
            const now = new Date().getTime();
            const diff = now - start;

            if (diff < 0) return;

            // CORRECCIÓN MATEMÁTICA: Eliminamos el "% 24" para mostrar horas totales
            const hours = Math.floor(diff / (1000 * 60 * 60)); 
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            setElapsed(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
            
            // Alerta si lleva más de 45 minutos
            if (hours > 0 || minutes >= 45) setIsLong(true);

        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    return (
        <div className={`pa-timer ${isLong ? 'danger' : ''}`}>
            <FaClock /> {elapsed}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const ActiveSessionsView = ({ sessions, onViewDetail }) => {
  
  // 1. ESTADO VACÍO
  if (!sessions || sessions.length === 0) {
    return (
      <div className="pedidos-empty-list-container">
        <FaRunning size={50} style={{ marginBottom: 20, opacity: 0.5 }} />
        <h3>Todo tranquilo por aquí.</h3>
        <p>No hay pickers en ruta en este momento.</p>
      </div>
    );
  }

  // 2. GRID DE TARJETAS
  return (
    <div className="pa-dashboard-grid">
      {sessions.map((session) => (
        <div key={session.session_id} className="pa-dashboard-card">
          
          {/* HEADER (Picker + Timer) */}
          <div className="pa-card-header">
            <div className="pa-picker-info">
              <div className="pa-avatar">
                {session.picker_name ? session.picker_name.charAt(0).toUpperCase() : "?"}
              </div>
              <div>
                <h4>{session.picker_name}</h4>
                <span className="pa-session-id">#{session.session_id.slice(0, 6)}</span>
              </div>
            </div>
            {/* Aquí se usa el componente corregido */}
            <SessionTimer startTime={session.start_time} />
          </div>

          {/* BARRA DE PROGRESO */}
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

          {/* TRAZABILIDAD DE PEDIDOS (CHIPS) */}
          <div className="pa-batch-summary">
             <div className="pa-bs-header">
                <FaLayerGroup size={12} color="#64748b"/>
                <span>Batch de {session.orders_count} pedidos:</span>
             </div>
             <div className="pa-bs-list">
                {session.order_ids && session.order_ids.map(id => (
                    <span key={id} className="pa-bs-chip">
                        #{id}
                    </span>
                ))}
             </div>
          </div>

          {/* ESTADÍSTICAS RÁPIDAS */}
          <div className="pa-stats-grid">
            <div className="pa-stat-box">
              <span className="pa-stat-num">
                {session.completed_items - session.substituted_items}
              </span>
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

          {/* UBICACIÓN ACTUAL */}
          <div className="pa-location-badge">
            <FaMapMarkerAlt /> {session.current_location}
          </div>

          {/* BOTÓN DE ACCIÓN */}
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