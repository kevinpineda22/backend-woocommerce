import React, { useState, useEffect, useCallback, useRef } from "react";
import { FaSync, FaFilter, FaUserCircle, FaStoreAlt } from "react-icons/fa";
import { supabase } from "../../../supabaseClient";
import { ecommerceApi } from "../shared/ecommerceApi";
import { useSedeContext } from "../shared/SedeContext";
import "./AuditLogView.css";

// Mapa de acciones técnicas → label legible para humanos.
const ACTION_LABELS = {
  "session.created": { label: "📋 Sesión creada", color: "blue" },
  "session.completed": { label: "✅ Picker finalizó sesión", color: "green" },
  "session.cancelled": { label: "🚫 Sesión cancelada", color: "red" },
  "session.audited": { label: "🔎 Auditoría aprobada", color: "purple" },
  "payment.marked": { label: "💰 Pago registrado", color: "green" },
  "item.picked": { label: "📦 Producto recolectado", color: "green" },
  "item.substituted": { label: "🔄 Producto sustituido", color: "amber" },
  "item.not_found": { label: "❌ Producto no encontrado", color: "red" },
  "item.reset": { label: "↩️  Acción deshecha", color: "slate" },
  "item.revert_short_pick": { label: "↩️  Stock revertido", color: "slate" },
  "item.reset_sustituto": {
    label: "↩️  Sustitución revertida",
    color: "slate",
  },
  "item.removed": { label: "🗑️ Item anulado por admin", color: "red" },
  "item.restored": { label: "♻️ Item restaurado por admin", color: "blue" },
  "item.force_picked": {
    label: "✋ Item aprobado manualmente",
    color: "amber",
  },
  "order.cancelled": { label: "🛑 Pedido cancelado", color: "red" },
  "order.restored": { label: "♻️ Pedido restaurado", color: "blue" },
  "sede.created": { label: "🏪 Sede creada", color: "blue" },
  "sede.updated": { label: "🏪 Sede actualizada", color: "blue" },
  "sede.deactivated": { label: "🏪 Sede desactivada", color: "red" },
};

const ACTOR_TYPE_LABELS = {
  admin: "👔 Admin",
  picker: "🏃 Picker",
  auditor: "🔍 Auditor",
  system: "⚙️ Sistema",
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

// Arma una frase legible con los datos del evento y su metadata.
const buildSentence = (evt) => {
  const actor = evt.actor_name || evt.actor_id || "Alguien";
  const meta = evt.metadata || {};

  switch (evt.action) {
    case "session.created":
      return `${actor} asignó ${(meta.orders || []).length} pedido(s) al picker ${meta.picker_name || meta.picker_id || "?"}.`;
    case "session.completed":
      return `${actor} finalizó el picking de ${(meta.orders || []).length} pedido(s).`;
    case "session.cancelled":
      return `${actor} canceló su sesión de picking.`;
    case "session.audited":
      return `${actor} aprobó la auditoría de ${(meta.orders || []).length} pedido(s).`;
    case "payment.marked":
      return `${actor} registró pago (${meta.payment_method || "?"}) para ${(meta.orders || []).length} pedido(s).`;
    case "item.picked":
      return `${actor} recolectó ${meta.cantidad || 1}x "${meta.nombre_producto || meta.id_producto}".`;
    case "item.substituted":
      return `${actor} sustituyó "${meta.nombre_producto || meta.id_producto}" por "${meta.sustituto?.name || "?"}".`;
    case "item.not_found":
      return `${actor} marcó "${meta.nombre_producto || meta.id_producto}" como no encontrado${meta.motivo ? ` — ${meta.motivo}` : ""}.`;
    case "item.removed":
      return `${actor} anuló "${meta.nombre_producto || meta.id_producto}" de la sesión.`;
    case "item.restored":
      return `${actor} restauró el item ${meta.id_producto} a la sesión.`;
    case "item.force_picked":
      return `${actor} aprobó manualmente ${meta.cantidad || 1}x item ${meta.id_producto}.`;
    case "order.cancelled":
      return `${actor} canceló el pedido #${evt.entity_id}${meta.motivo ? ` — ${meta.motivo}` : ""}.`;
    case "order.restored":
      return `${actor} restauró el pedido #${evt.entity_id}.`;
    case "sede.created":
      return `${actor} creó la sede "${meta.nombre || evt.entity_id}".`;
    case "sede.updated":
      return `${actor} actualizó la sede ${evt.entity_id} (campos: ${(meta.changes || []).join(", ") || "—"}).`;
    case "sede.deactivated":
      return `${actor} desactivó la sede ${evt.entity_id}.`;
    default:
      return `${actor} → ${evt.action}`;
  }
};

const AuditLogView = () => {
  const { getSedeParam, sedeId } = useSedeContext();

  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [availableActions, setAvailableActions] = useState([]);

  const [filters, setFilters] = useState({
    actor_type: "",
    action: "",
    entity_type: "",
    q: "",
    date_from: "",
    date_to: "",
  });

  const fetchEvents = useCallback(
    async (page = 1) => {
      setLoading(true);
      const sedeParam = getSedeParam();
      const params = { ...Object.fromEntries(new URLSearchParams(sedeParam)) };
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      params.page = page;
      params.limit = 50;

      try {
        const res = await ecommerceApi.get("/audit-log", { params });
        setEvents(res.data.events || []);
        setPagination(
          res.data.pagination || { page, limit: 50, total: 0, total_pages: 0 },
        );
      } catch (e) {
        console.error("Error cargando auditoría:", e);
      } finally {
        setLoading(false);
      }
    },
    [filters, getSedeParam],
  );

  // Carga inicial de acciones disponibles para el dropdown.
  useEffect(() => {
    ecommerceApi
      .get("/audit-log/actions")
      .then((res) => setAvailableActions(res.data || []))
      .catch(() => setAvailableActions([]));
  }, []);

  useEffect(() => {
    fetchEvents(1);
  }, [fetchEvents]);

  // ── Realtime: suscripción a INSERT en wc_audit_log ──
  const fetchEventsRef = useRef(fetchEvents);
  fetchEventsRef.current = fetchEvents;
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;

  useEffect(() => {
    const channel = supabase
      .channel("audit-log-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wc_audit_log" },
        (payload) => {
          const row = payload.new;
          // Si hay filtro de sede, ignorar eventos de otras sedes
          if (sedeId && row.sede_id && row.sede_id !== sedeId) return;
          console.log("⚡ [AUDIT RT] Nuevo evento:", row.action);
          // Solo refrescar si estamos en página 1 (los nuevos van arriba)
          if (paginationRef.current.page === 1) {
            fetchEventsRef.current(1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sedeId]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      actor_type: "",
      action: "",
      entity_type: "",
      q: "",
      date_from: "",
      date_to: "",
    });
  };

  return (
    <>
      <header className="pedidos-layout-header">
        <div>
          <h1>📋 Auditoría del Sistema</h1>
          <div className="pedidos-header-quote">
            Timeline de todos los movimientos: quién hizo qué, cuándo y dónde.
          </div>
        </div>
        <button
          onClick={() => fetchEvents(pagination.page)}
          className="pedidos-admin-refresh-btn"
        >
          <FaSync /> Refrescar
        </button>
      </header>

      <div className="pedidos-layout-body">
        {/* FILTROS */}
        <div className="audit-filters">
          <div className="audit-filter-group">
            <label>
              <FaFilter /> Actor
            </label>
            <select
              value={filters.actor_type}
              onChange={(e) => handleFilterChange("actor_type", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="admin">Admin</option>
              <option value="picker">Picker</option>
              <option value="auditor">Auditor</option>
              <option value="system">Sistema</option>
            </select>
          </div>

          <div className="audit-filter-group">
            <label>Acción</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange("action", e.target.value)}
            >
              <option value="">Todas</option>
              {availableActions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]?.label || a}
                </option>
              ))}
            </select>
          </div>

          <div className="audit-filter-group">
            <label>Entidad</label>
            <select
              value={filters.entity_type}
              onChange={(e) =>
                handleFilterChange("entity_type", e.target.value)
              }
            >
              <option value="">Todas</option>
              <option value="session">Sesión</option>
              <option value="order">Pedido</option>
              <option value="sede">Sede</option>
            </select>
          </div>

          <div className="audit-filter-group">
            <label>Desde</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange("date_from", e.target.value)}
            />
          </div>

          <div className="audit-filter-group">
            <label>Hasta</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange("date_to", e.target.value)}
            />
          </div>

          <div className="audit-filter-group audit-filter-group--grow">
            <label>Buscar actor</label>
            <input
              type="text"
              placeholder="Nombre (ej: Juan)"
              value={filters.q}
              onChange={(e) => handleFilterChange("q", e.target.value)}
            />
          </div>

          <button
            onClick={handleClearFilters}
            className="audit-btn-clear"
            title="Limpiar filtros"
          >
            Limpiar
          </button>
        </div>

        {/* TABLA */}
        {loading ? (
          <div className="history-loading-state">
            <div className="pedidos-spinner-large" />
            <p>Cargando eventos de auditoría...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="history-empty-state">
            <p>📭 No hay eventos con estos filtros</p>
          </div>
        ) : (
          <div className="audit-table-container">
            <table className="audit-table">
              <thead>
                <tr>
                  <th style={{ width: "180px" }}>Fecha/Hora</th>
                  <th style={{ width: "110px" }}>Rol</th>
                  <th style={{ width: "180px" }}>Actor</th>
                  <th>Evento</th>
                  <th style={{ width: "140px" }}>Sede</th>
                  <th style={{ width: "110px" }}>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => {
                  const actionMeta = ACTION_LABELS[evt.action] || {
                    label: evt.action,
                    color: "slate",
                  };
                  return (
                    <tr key={evt.id}>
                      <td className="audit-cell-time">
                        {formatDateTime(evt.created_at)}
                      </td>
                      <td>
                        <span
                          className={`audit-actor-type audit-actor-type--${evt.actor_type}`}
                        >
                          {ACTOR_TYPE_LABELS[evt.actor_type] || evt.actor_type}
                        </span>
                      </td>
                      <td className="audit-cell-actor">
                        <FaUserCircle /> {evt.actor_name || evt.actor_id || "—"}
                      </td>
                      <td>
                        <div
                          className={`audit-event-badge audit-event-badge--${actionMeta.color}`}
                        >
                          {actionMeta.label}
                        </div>
                        <div className="audit-event-sentence">
                          {buildSentence(evt)}
                        </div>
                      </td>
                      <td>
                        {evt.sede_nombre ? (
                          <span className="hv-sede-tag">
                            <FaStoreAlt size={10} /> {evt.sede_nombre}
                          </span>
                        ) : (
                          <span className="hv-text-muted">—</span>
                        )}
                      </td>
                      <td className="audit-cell-entity">
                        <div className="audit-entity-type">
                          {evt.entity_type}
                        </div>
                        <div className="audit-entity-id" title={evt.entity_id}>
                          {String(evt.entity_id).length > 10
                            ? `…${String(evt.entity_id).slice(-8)}`
                            : evt.entity_id}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* PAGINACIÓN */}
            {pagination.total_pages > 1 && (
              <div className="audit-pagination">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchEvents(pagination.page - 1)}
                >
                  ← Anterior
                </button>
                <span>
                  Página {pagination.page} de {pagination.total_pages} ·{" "}
                  {pagination.total} eventos
                </span>
                <button
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => fetchEvents(pagination.page + 1)}
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default AuditLogView;
