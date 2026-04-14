import React, { useState, useMemo, useEffect, useCallback } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import { supabase } from "../../../supabaseClient";
import ConfirmModal from "../shared/ConfirmModal";
import { AnimatePresence, motion } from "framer-motion";
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
  FaSpinner,
  FaExchangeAlt,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaStickyNote,
  FaTruck,
  FaIdCard,
  FaCity,
  FaCopy,
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

  // -- NUEVOS ESTADOS DE EXPERIENCIA UX --
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    type: null,
    item: null,
  });
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

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

    // --- 1. Eventos de la Base de Datos (Seguridad) ---
    const dbChannel = supabase
      .channel(`live-session-admin-db-${sessionDetail.sessionInfo.session_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wc_log_picking" },
        () => refreshRouteData(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wc_log_picking" },
        () => refreshRouteData(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "wc_log_picking" },
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

    // --- 2. Eventos Broadcast (Velocidad Instantánea) ---
    // Usamos el canal privado de la sesión para evitar colisiones con el global del Dashboard
    const broadcastChannel = supabase
      .channel(`session-${sessionDetail.sessionInfo.session_id}`)
      .on("broadcast", { event: "picking_action" }, (payload) => {
        // Se recibe la actividad fresca del picker al instante
        refreshRouteData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
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

  const isWeighable = (item) => {
    // Igual que el picker: solo la unidad de medida del pedido WooCommerce determina
    // si es pesable. Si el cliente pidió KL/KG/LB → pesable. Si pidió UND o no tiene → no pesable.
    // Productos como embutidos (salchichón, chorizo) vendidos por unidad NO son pesables.
    return (
      item.unidad_medida &&
      ["kl", "kg", "kilo", "lb", "libra"].includes(
        item.unidad_medida.toLowerCase(),
      )
    );
  };

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

  // --- ACCIONES DEL ADMIN ENLAZADAS AL CONFIRM MODAL ---
  const handleAdminActionExecute = async () => {
    if (!confirmConfig.item || !confirmConfig.type) return;
    const { type, item } = confirmConfig;
    setIsProcessing(true);
    const empleado = JSON.parse(localStorage.getItem("empleado_info") || "{}");
    const adminName = empleado.nombre || "Admin";
    const adminEmail = localStorage.getItem("correo_empleado") || "";
    const commonBody = {
      id_sesion: sessionInfo.session_id,
      id_producto: item.variation_id || item.product_id,
      admin_name: adminName,
      admin_email: adminEmail,
    };
    try {
      if (type === "delete") {
        await ecommerceApi.post("/admin-remove-item", commonBody);
        showToast(`Anulado: ${item.name}`, "success");
      } else if (type === "restore") {
        await ecommerceApi.post("/admin-restore-item", commonBody);
        showToast(`Restaurado: ${item.name}`, "info");
      } else if (type === "pick") {
        await ecommerceApi.post("/admin-force-pick", commonBody);
        showToast(`Recolectado a la fuerza: ${item.name}`, "success");
      }
      await refreshRouteData();
      await notifyPickerInstantly(); // ⚡ Disparo en tiempo real
    } catch (error) {
      showToast(
        "Error: " + (error.response?.data?.error || error.message),
        "error",
      );
    } finally {
      setIsProcessing(false);
      setConfirmConfig({ isOpen: false, type: null, item: null });
    }
  };

  const handleAdminDelete = (item) =>
    setConfirmConfig({ isOpen: true, type: "delete", item });
  const handleAdminRestore = (item) =>
    setConfirmConfig({ isOpen: true, type: "restore", item });
  const handleAdminPick = (item) =>
    setConfirmConfig({ isOpen: true, type: "pick", item });

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
                            : hasSub
                              ? {
                                  textDecoration: "line-through",
                                  color: "#92400e",
                                  opacity: 0.7,
                                }
                              : {}
                        }
                      >
                        {item.name}
                      </div>
                      {/* ✅ ALERTA MULTIPACK (P6, P3, etc.) */}
                      {(() => {
                        const uom = item.unidad_medida
                          ? item.unidad_medida.toUpperCase()
                          : "";
                        const isPack =
                          uom.startsWith("P") && !isNaN(uom.substring(1));
                        const packQty = isPack
                          ? parseInt(uom.substring(1)) || 0
                          : 0;
                        return isPack ? (
                          <div
                            style={{
                              background: "#9333ea",
                              color: "white",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              fontWeight: "900",
                              fontSize: "0.85rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              marginTop: "4px",
                              boxShadow: "0 2px 4px rgba(147,51,234,0.3)",
                            }}
                          >
                            📦 EMPAQUE x{packQty}
                          </div>
                        ) : null;
                      })()}
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
                        {!hasSub && (
                          <span>
                            <strong>{item.quantity_total}</strong>{" "}
                            {item.unidad_medida || "un."}
                          </span>
                        )}
                      </div>
                      {hasSub && (
                        <div className="lsm-substitution-block">
                          <div className="lsm-sub-arrow-container">
                            <div className="lsm-sub-arrow-line" />
                            <div className="lsm-sub-arrow-badge">
                              <FaExchangeAlt size={10} />
                              <span>SUSTITUIDO POR</span>
                            </div>
                            <div className="lsm-sub-arrow-line" />
                          </div>
                          <div className="lsm-sub-product">
                            <div className="lsm-sub-product-name">
                              {item.sustituto.name}
                            </div>
                            <div className="lsm-sub-product-details">
                              {item.sustituto.price > 0 && (
                                <span className="lsm-sub-product-price">
                                  {formatPrice(item.sustituto.price)}
                                </span>
                              )}
                              <span className="lsm-sub-product-qty">
                                {item.sustituto.qty ||
                                  item.quantity_total -
                                    (item.qty_scanned || 0)}{" "}
                                de {item.quantity_total} sustituidas
                              </span>
                            </div>
                            {item.qty_scanned > 0 && (
                              <div
                                className="lsm-sub-row original"
                                style={{ marginTop: 4 }}
                              >
                                <FaCheck size={10} /> {item.qty_scanned} de{" "}
                                {item.quantity_total} originales OK
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {showTrash ? (
                      <button
                        className="lsm-restore-btn"
                        onClick={() => handleAdminRestore(item)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <FaSpinner className="ec-spin" />
                        ) : (
                          <FaTrashRestore />
                        )}{" "}
                        Restaurar
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
                        {["pendiente", "parcial"].includes(item.status) && (
                          <div className="lsm-actions-wrapper">
                            {!isWeighable(item) && (
                              <button
                                className="lsm-pick-btn"
                                onClick={() => handleAdminPick(item)}
                                disabled={isProcessing}
                                title="Pasar a canasta (Forzar)"
                              >
                                {isProcessing ? (
                                  <FaSpinner className="ec-spin" />
                                ) : (
                                  <FaCheck />
                                )}
                              </button>
                            )}
                            <button
                              className="lsm-delete-btn"
                              style={{ marginRight: 0 }}
                              onClick={() => handleAdminDelete(item)}
                              disabled={isProcessing}
                              title="Anular producto"
                            >
                              {isProcessing ? (
                                <FaSpinner className="ec-spin" />
                              ) : (
                                <FaTrash />
                              )}
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

                  {/* DATOS DEL CLIENTE */}
                  <div className="lsm-customer-info">
                    {data.phone && (
                      <div className="lsm-ci-row">
                        <FaPhone size={11} />
                        <a href={`tel:${data.phone}`}>{data.phone}</a>
                        <button
                          className="lsm-ci-copy"
                          onClick={() => {
                            navigator.clipboard.writeText(data.phone);
                          }}
                          title="Copiar"
                        >
                          <FaCopy size={10} />
                        </button>
                      </div>
                    )}
                    {data.email && (
                      <div className="lsm-ci-row">
                        <FaEnvelope size={11} />
                        <a href={`mailto:${data.email}`}>{data.email}</a>
                        <button
                          className="lsm-ci-copy"
                          onClick={() => {
                            navigator.clipboard.writeText(data.email);
                          }}
                          title="Copiar"
                        >
                          <FaCopy size={10} />
                        </button>
                      </div>
                    )}
                    {data.billing?.company && (
                      <div className="lsm-ci-row">
                        <FaCity size={11} />
                        <span>{data.billing.company}</span>
                      </div>
                    )}
                    {data.billing?.address_1 && (
                      <div className="lsm-ci-row">
                        <FaMapMarkerAlt size={11} />
                        <span>
                          {data.billing.address_1}
                          {data.billing.address_2
                            ? `, ${data.billing.address_2}`
                            : ""}
                          {data.billing.city ? ` — ${data.billing.city}` : ""}
                          {data.billing.state ? `, ${data.billing.state}` : ""}
                        </span>
                      </div>
                    )}
                    {data.shipping?.address_1 &&
                      data.shipping.address_1 !== data.billing?.address_1 && (
                        <div className="lsm-ci-row">
                          <FaTruck size={11} />
                          <span>
                            {data.shipping.first_name
                              ? `${data.shipping.first_name} ${data.shipping.last_name || ""} — `
                              : ""}
                            {data.shipping.address_1}
                            {data.shipping.address_2
                              ? `, ${data.shipping.address_2}`
                              : ""}
                            {data.shipping.city
                              ? ` — ${data.shipping.city}`
                              : ""}
                          </span>
                        </div>
                      )}
                    {data.customer_note && (
                      <div className="lsm-ci-row lsm-ci-note">
                        <FaStickyNote size={11} />
                        <span>{data.customer_note}</span>
                      </div>
                    )}
                    {data.total && (
                      <div className="lsm-ci-row">
                        <strong style={{ marginLeft: 2 }}>Total:</strong>
                        <span style={{ fontWeight: 700 }}>
                          {formatPrice(data.total)}
                        </span>
                      </div>
                    )}
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
                            {hasSub && <FaExchangeAlt />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: "600",
                                color: hasSub ? "#92400e" : "#334155",
                                textDecoration: hasSub
                                  ? "line-through"
                                  : "none",
                              }}
                            >
                              {it.name}
                            </div>
                            {/* PESO EN EL ADMIN PEDIDOS */}
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
                              <div className="lsm-substitution-block compact">
                                <div className="lsm-sub-arrow-container compact">
                                  <div className="lsm-sub-arrow-badge compact">
                                    <FaExchangeAlt size={9} />
                                    <span>SUSTITUIDO POR</span>
                                  </div>
                                </div>
                                <div className="lsm-sub-product compact">
                                  <div className="lsm-sub-product-name">
                                    {it.sustituto.name}
                                  </div>
                                  <div className="lsm-sub-product-details">
                                    {it.sustituto.price > 0 && (
                                      <span className="lsm-sub-product-price">
                                        {formatPrice(it.sustituto.price)}
                                      </span>
                                    )}
                                    <span className="lsm-sub-product-qty">
                                      {it.sustituto.qty ||
                                        it.quantity_total -
                                          (it.qty_scanned || 0)}{" "}
                                      de {it.qty} sustituidas
                                    </span>
                                  </div>
                                  {it.qty_scanned > 0 && (
                                    <div
                                      className="lsm-sub-row original"
                                      style={{
                                        marginTop: 3,
                                        fontSize: "0.75rem",
                                      }}
                                    >
                                      <FaCheck size={9} /> {it.qty_scanned} de{" "}
                                      {it.qty} originales OK
                                    </div>
                                  )}
                                </div>
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

      {/* MODAL DE CONFIRMACIÓN */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={
          confirmConfig.type === "delete"
            ? "⚠️ Anular Producto"
            : confirmConfig.type === "restore"
              ? "🔄 Restaurar a Canasta"
              : confirmConfig.type === "pick"
                ? "✅ Forzar Recolección"
                : ""
        }
        message={
          confirmConfig.item
            ? `¿Estás completamente seguro que deseas realizar esta acción sobre "${confirmConfig.item.name}"?`
            : ""
        }
        isDanger={confirmConfig.type === "delete"}
        onConfirm={handleAdminActionExecute}
        onCancel={() =>
          setConfirmConfig({ isOpen: false, type: null, item: null })
        }
        confirmText={
          confirmConfig.type === "delete"
            ? "Sí, Anular"
            : confirmConfig.type === "restore"
              ? "Sí, Restaurar"
              : confirmConfig.type === "pick"
                ? "Sí, Forzar y Recolectar"
                : "Confirmar"
        }
        isProcessing={isProcessing}
      />

      {/* NOTIFICACIONES TOAST */}
      <div
        style={{
          position: "fixed",
          bottom: "30px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          pointerEvents: "none",
        }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{
                background:
                  t.type === "success"
                    ? "#10b981"
                    : t.type === "error"
                      ? "#ef4444"
                      : "#3b82f6",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: "20px",
                fontSize: "14px",
                fontWeight: "600",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
