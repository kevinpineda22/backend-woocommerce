import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import { supabase } from "../../../supabaseClient";
import {
  FaLayerGroup,
  FaUserFriends,
  FaListUl,
  FaBox,
  FaExclamationTriangle,
  FaClock,
  FaCheck,
  FaWeightHanging,
  FaTrash,
  FaTrashRestore,
  FaSync,
  FaStoreAlt,
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

  const [localRouteData, setLocalRouteData] = useState(
    sessionDetail?.routeData,
  );
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const refreshRouteData = useCallback(async () => {
    if (!sessionDetail?.sessionInfo?.picker_id) return;
    try {
      const res = await ecommerceApi.get(
        `/sesion-activa?id_picker=${sessionDetail.sessionInfo.picker_id}&include_removed=true`,
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
    refreshRouteData();

    const channel = supabase
      .channel(`live-session-admin-${sessionDetail.sessionInfo.session_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wc_log_picking" },
        () => refreshRouteData(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wc_picking_sessions",
          filter: `id=eq.${sessionDetail.sessionInfo.session_id}`,
        },
        () => refreshRouteData(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionDetail, refreshRouteData]);

  if (!sessionDetail || !localRouteData) return null;
  const { sessionInfo } = sessionDetail;
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

  // ⚡ CANAL DE RADIO: Avisar al Picker instantáneamente
  const notifyPickerInstantly = async () => {
    try {
      await supabase.channel(`session-${sessionInfo.session_id}`).send({
        type: "broadcast",
        event: "admin_override",
        payload: { timestamp: Date.now() },
      });
    } catch (err) {
      console.warn("No se pudo notificar al picker", err);
    }
  };

  // --- ACCIONES DEL ADMIN ---
  const handleAdminDelete = async (item) => {
    if (!window.confirm(`¿ANULAR "${item.name}"?`)) return;
    setIsProcessing(true);
    try {
      await ecommerceApi.post(
        "/admin-remove-item",
        {
          id_sesion: sessionInfo.session_id,
          id_producto: item.product_id,
        },
      );
      await refreshRouteData();
      await notifyPickerInstantly(); // ⚡ Disparo en tiempo real
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
      await ecommerceApi.post(
        "/admin-restore-item",
        {
          id_sesion: sessionInfo.session_id,
          id_producto: item.product_id,
        },
      );
      await refreshRouteData();
      await notifyPickerInstantly(); // ⚡ Disparo en tiempo real
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAdminPick = async (item) => {
    if (
      !window.confirm(
        `¿FORZAR RECOLECCIÓN de "${item.name}" y enviarlo a canasta?`,
      )
    )
      return;
    setIsProcessing(true);
    try {
      await ecommerceApi.post(
        "/admin-force-pick",
        {
          id_sesion: sessionInfo.session_id,
          id_producto: item.product_id,
        },
      );
      await refreshRouteData();
      await notifyPickerInstantly(); // ⚡ Disparo en tiempo real
    } catch (error) {
      alert("Error: " + (error.response?.data?.error || error.message));
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
                {sessionInfo.sede_nombre && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 5,
                      background: "rgba(99,102,241,0.15)",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "#a5b4fc",
                    }}
                  >
                    <FaStoreAlt size={10} /> {sessionInfo.sede_nombre}
                  </span>
                )}
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
                      {/* ✅ PESO EN EL ADMIN BATCH */}
                      {item.peso_real > 0 && (
                        <div
                          style={{
                            color: "#10b981",
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                            marginTop: 4,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <FaWeightHanging size={12} />{" "}
                          {parseFloat(item.peso_real).toFixed(3)} Kg pesados
                        </div>
                      )}
                      <div className="lsm-item-meta">
                        <span className="lsm-pasillo-badge">
                          {item.pasillo === "Otros"
                            ? "General"
                            : `Pasillo ${item.pasillo}`}
                        </span>
                        {!hasSub ? (
                          <span>
                            <strong>{item.quantity_total}</strong>{" "}
                            {item.unidad_medida || "un."}
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
                          <div className="lsm-actions-wrapper">
                            <button
                              className="lsm-pick-btn"
                              onClick={() => handleAdminPick(item)}
                              disabled={isProcessing}
                              title="Pasar a canasta (Forzar)"
                            >
                              <FaCheck />
                            </button>
                            <button
                              className="lsm-delete-btn"
                              style={{ marginRight: 0 }}
                              onClick={() => handleAdminDelete(item)}
                              disabled={isProcessing}
                              title="Anular producto"
                            >
                              <FaTrash />
                            </button>
                          </div>
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

          {/* VISTA ORDERS */}
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
                            {/* ✅ PESO EN EL ADMIN PEDIDOS */}
                            {it.peso_real > 0 && (
                              <div
                                style={{
                                  color: "#10b981",
                                  fontSize: "0.8rem",
                                  fontWeight: "bold",
                                  marginTop: 2,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <FaWeightHanging size={10} />{" "}
                                {parseFloat(it.peso_real).toFixed(3)} Kg pesados
                              </div>
                            )}
                            {!hasSub ? (
                              <div
                                style={{ fontSize: "0.8rem", color: "#94a3b8" }}
                              >
                                Cant: <strong>{it.qty}</strong>
                              </div>
                            ) : (
                              <div className="lsm-sub-breakdown extended">
                                <div className="lsm-sub-header">
                                  Solicitado:{" "}
                                  <strong>
                                    {it.qty} {it.unidad_medida || "un."}
                                  </strong>
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
