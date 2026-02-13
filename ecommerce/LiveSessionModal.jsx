import React, { useState, useMemo, useEffect, useCallback } from "react";
import axios from "axios";
import { supabase } from "../../supabaseClient"; // ✅ Importamos Supabase
import {
  FaLayerGroup,
  FaUserFriends,
  FaListUl,
  FaBox,
  FaExclamationTriangle,
  FaClock,
  FaCheck,
  FaTrash,
  FaTrashRestore,
  FaSync,
} from "react-icons/fa";
import "./LiveSessionModal.css";

const ORDER_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899"];

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

export const LiveSessionModal = ({ sessionDetail, onClose }) => {
  const [viewMode, setViewMode] = useState("batch");
  const [showTrash, setShowTrash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // ✅ ESTADO LOCAL PARA DATOS EN TIEMPO REAL
  const [localRouteData, setLocalRouteData] = useState(
    sessionDetail?.routeData,
  );
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // ✅ ESTRATEGIA OPTIMIZADA: REALTIME SUPABASE
  // Reemplazamos polling de 4s por suscripción a cambios

  const refreshRouteData = useCallback(async () => {
    if (!sessionDetail?.sessionInfo?.picker_id) return;
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${sessionDetail.sessionInfo.picker_id}&include_removed=true`,
      );
      if (res.data) {
        setLocalRouteData(res.data);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error("Error refreshing live data:", e);
    }
  }, [sessionDetail]);

  useEffect(() => {
    if (!sessionDetail?.sessionInfo) return;

    // 1. Cargar datos iniciales
    refreshRouteData();

    // 2. Suscribirse a logs de picking (Acciones del picker en esta sesión)
    // Nota: Filtramos log_picking por los IDs de asignación si pudiéramos,
    // pero como sessionDetail.routeData puede cambiar,
    // una estrategia segura es escuchar TOODOS los logs y filtrar o simplemente refrescar.
    // Para no saturar, escucharemos la tabla wc_log_picking globalmente pero
    // podríamos refinar a `filter: "id_pedido=in.(...)"` si tuviéramos la lista plana.

    // Mejor estrategia: Escuchar cambios en wc_log_picking donde id_asignacion corresponda a esta sesión.
    // Como Supabase realtime filters son limitados en "IN", escucharemos todo y refrescaremos.
    // OJO: Si hay MUCHOS pickers, esto dispararía refrescos constantes.
    // Mejor: Obtener los Ids de asignación de esta sesión

    const channel = supabase
      .channel(`live-session-${sessionDetail.sessionInfo.session_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wc_log_picking",
          // No podemos filtrar fácil por "asignacion id" dinámico sin reiniciar el canal.
          // Asumimos el costo de refrescar si CUALQUIER log entra.
          // Optimización futura: Backend devuelve channel ID específico.
        },
        () => {
          console.log(
            "⚡ Acción de picking detectada -> Refrescando Admin Live View",
          );
          refreshRouteData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wc_picking_sessions",
          filter: `id=eq.${sessionDetail.sessionInfo.session_id}`,
        },
        () => {
          console.log(
            "⚡ Estado de sesión cambió -> Refrescando Admin Live View",
          );
          refreshRouteData();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionDetail, refreshRouteData]);

  if (!sessionDetail || !localRouteData) return null;
  const { sessionInfo } = sessionDetail;
  // Usamos los datos locales actualizados
  const routeData = localRouteData;

  const activeItems = useMemo(
    () => routeData.items.filter((i) => !i.is_removed),
    [routeData],
  );
  const removedItems = useMemo(
    () => routeData.items.filter((i) => i.is_removed),
    [routeData],
  );
  const displayItems = showTrash ? removedItems : activeItems;

  const handleAdminDelete = async (item) => {
    if (!window.confirm(`¿ANULAR "${item.name}"?`)) return;
    setIsProcessing(true);
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/admin-remove-item",
        {
          id_sesion: sessionInfo.session_id,
          id_producto: item.product_id,
        },
      );
      // Forzamos actualización inmediata
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${sessionInfo.picker_id}&include_removed=true`,
      );
      setLocalRouteData(res.data);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminRestore = async (item) => {
    if (!window.confirm(`¿RESTAURAR "${item.name}"?`)) return;
    setIsProcessing(true);
    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/admin-restore-item",
        {
          id_sesion: sessionInfo.session_id,
          id_producto: item.product_id,
        },
      );
      // Forzamos actualización inmediata
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${sessionInfo.picker_id}&include_removed=true`,
      );
      setLocalRouteData(res.data);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getOrderColor = (id) =>
    ORDER_COLORS[
      routeData.orders_info.findIndex((o) => o.id === id) % ORDER_COLORS.length
    ];
  const getOrderLetter = (id) =>
    String.fromCharCode(
      65 + routeData.orders_info.findIndex((o) => o.id === id),
    );

  const getItemsByOrder = () => {
    const map = {};
    routeData.orders_info.forEach(
      (o, i) =>
        (map[o.id] = {
          ...o,
          color: ORDER_COLORS[i % 5],
          letter: String.fromCharCode(65 + i),
          items: [],
          stats: { total: 0, done: 0 },
        }),
    );
    activeItems.forEach((item) => {
      item.pedidos_involucrados.forEach((ped) => {
        if (map[ped.id_pedido]) {
          map[ped.id_pedido].items.push({ ...item, qty: ped.cantidad });
          map[ped.id_pedido].stats.total++;
          if (["recolectado", "sustituido"].includes(item.status))
            map[ped.id_pedido].stats.done++;
        }
      });
    });
    return map;
  };

  return (
    <div className="lsm-overlay" onClick={onClose}>
      <div className="lsm-content" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="lsm-header">
          <div className="lsm-header-info">
            <div className="lsm-icon-box">
              <FaListUl />
            </div>
            <div className="lsm-title">
              <h2>Ruta de {sessionInfo.picker_name}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span>
                  <FaClock style={{ marginRight: 5 }} />{" "}
                  {new Date(sessionInfo.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                  <FaSync className="ec-spin" /> Live
                </span>
              </div>
            </div>
          </div>

          <div className="lsm-controls-group">
            <div className="lsm-view-toggle">
              <button
                className={`lsm-toggle-btn ${viewMode === "batch" && !showTrash ? "active" : ""}`}
                onClick={() => {
                  setViewMode("batch");
                  setShowTrash(false);
                }}
              >
                <FaLayerGroup /> Activos ({activeItems.length})
              </button>
              <button
                className={`lsm-toggle-btn ${viewMode === "orders" ? "active" : ""}`}
                onClick={() => {
                  setViewMode("orders");
                  setShowTrash(false);
                }}
              >
                <FaUserFriends /> Pedidos
              </button>
            </div>
            <button
              className={`lsm-trash-toggle ${showTrash ? "active" : ""}`}
              onClick={() => {
                setShowTrash(true);
                setViewMode("batch");
              }}
              title="Ver anulados"
            >
              <FaTrash /> ({removedItems.length})
            </button>
          </div>
          <button className="lsm-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* BODY */}
        <div className="lsm-body">
          {/* VISTA BATCH */}
          {viewMode === "batch" && (
            <>
              {displayItems.length === 0 && (
                <div className="lsm-empty-state">
                  {showTrash
                    ? "Papelera vacía."
                    : "¡Todo listo! No hay items pendientes."}
                </div>
              )}
              {displayItems.map((item, idx) => {
                const hasSub = !!item.sustituto;
                // Si tiene sustituto, forzamos visualmente el estado amarillo para alertar
                const displayStatus =
                  hasSub && !showTrash ? "sustituido" : item.status;

                return (
                  <div
                    key={idx}
                    className={`lsm-item-card ${showTrash ? "removed-mode" : displayStatus}`}
                  >
                    <div className="lsm-item-img">
                      {item.image_src ? (
                        <img
                          src={item.image_src}
                          alt=""
                          style={showTrash ? { filter: "grayscale(100%)" } : {}}
                        />
                      ) : (
                        <FaBox color="#cbd5e1" />
                      )}
                    </div>
                    <div className="lsm-item-content">
                      <div
                        className="lsm-item-name"
                        style={
                          showTrash
                            ? {
                                textDecoration: "line-through",
                                color: "#ef4444",
                              }
                            : {}
                        }
                      >
                        {item.name}
                      </div>
                      <div className="lsm-item-meta">
                        <span className="lsm-pasillo-badge">
                          {item.pasillo === "Otros"
                            ? "General"
                            : `Pasillo ${item.pasillo}`}
                        </span>

                        {!hasSub ? (
                          <span>
                            <strong>{item.quantity_total}</strong> un. total
                          </span>
                        ) : (
                          <div className="lsm-sub-breakdown">
                            {item.qty_scanned > 0 && (
                              <div className="lsm-sub-row original">
                                <FaCheck size={10} /> {item.qty_scanned}{" "}
                                Originales
                              </div>
                            )}
                            <div className="lsm-sub-row warning">
                              <FaExclamationTriangle size={10} />{" "}
                              {item.sustituto.qty ||
                                item.quantity_total -
                                  (item.qty_scanned || 0)}{" "}
                              {item.sustituto.name}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {showTrash ? (
                      <button
                        className="lsm-restore-btn"
                        onClick={() => handleAdminRestore(item)}
                        disabled={isProcessing}
                      >
                        <FaTrashRestore /> Restaurar
                      </button>
                    ) : (
                      <>
                        <div className="lsm-orders-dots">
                          {item.pedidos_involucrados.map((p, i) => (
                            <div
                              key={i}
                              className="lsm-dot"
                              style={{ background: getOrderColor(p.id_pedido) }}
                            >
                              {getOrderLetter(p.id_pedido)}
                            </div>
                          ))}
                        </div>
                        {item.status === "pendiente" && (
                          <button
                            className="lsm-delete-btn"
                            onClick={() => handleAdminDelete(item)}
                            disabled={isProcessing}
                          >
                            <FaTrash />
                          </button>
                        )}
                        <div className={`lsm-status-badge ${item.status}`}>
                          {item.status}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* VISTA ORDERS (Aquí es donde se arreglaron los estilos) */}
          {viewMode === "orders" && !showTrash && (
            <div className="live-orders-container">
              {Object.entries(getItemsByOrder()).map(([id, data]) => (
                <div key={id} className="lsm-order-group">
                  <div className="lsm-og-header">
                    <div>
                      <strong style={{ fontSize: "1.1rem", color: "#1e293b" }}>
                        {data.customer}
                      </strong>
                      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        Pedido #{id}
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: "700",
                        color:
                          data.stats.done === data.stats.total
                            ? "#10b981"
                            : "#64748b",
                      }}
                    >
                      {data.stats.done}/{data.stats.total}
                    </span>
                  </div>
                  <div className="lsm-sub-list">
                    {data.items.map((it, k) => {
                      const hasSub = !!it.sustituto;
                      return (
                        <div key={k} className="lsm-sub-item">
                          <div
                            className={`lsm-mini-status ${it.status === "recolectado" && !hasSub ? "done" : hasSub ? "sub" : "pend"}`}
                          >
                            {it.status === "recolectado" && !hasSub && (
                              <FaCheck />
                            )}
                            {hasSub && <FaExclamationTriangle />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{ fontWeight: "600", color: "#334155" }}
                            >
                              {it.name}
                            </div>

                            {!hasSub ? (
                              <div
                                style={{ fontSize: "0.8rem", color: "#94a3b8" }}
                              >
                                Cant: <strong>{it.qty}</strong>
                              </div>
                            ) : (
                              <div className="lsm-sub-breakdown extended">
                                <div className="lsm-sub-header">
                                  Solicitado: <strong>{it.qty} un.</strong>
                                </div>

                                {it.quantity_total === it.qty ? (
                                  <div className="lsm-sub-rows-container">
                                    {it.qty_scanned > 0 && (
                                      <div className="lsm-sub-row original">
                                        <FaCheck size={10} />
                                        <span>
                                          <strong>{it.qty_scanned}</strong>{" "}
                                          Originales
                                        </span>
                                      </div>
                                    )}
                                    <div className="lsm-sub-row warning">
                                      <FaExclamationTriangle size={10} />
                                      <span>
                                        <strong>
                                          {it.sustituto.qty ||
                                            it.quantity_total -
                                              (it.qty_scanned || 0)}
                                        </strong>{" "}
                                        x {it.sustituto.name}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="lsm-shared-warning">
                                    ⚠️ Sustitución en Lote Compartido
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div
                            style={{ fontWeight: "700", fontSize: "0.9rem" }}
                          >
                            {formatPrice(it.price)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
