import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  FaCheck,
  FaBoxOpen,
  FaArrowRight,
  FaBarcode,
  FaExchangeAlt,
  FaKeyboard,
  FaExclamationTriangle,
  FaBan,
  FaUndo,
  FaWalking,
  FaWeightHanging, // ✅ Importamos el ícono de la báscula
} from "react-icons/fa";
import { getOrderStyle, formatPrice } from "../utils/pickerConstants";

export const ProductCard = ({ item, orderMap, onAction, isCompleted }) => {
  const scannedRaw = item.qty_scanned || 0;
  const total = item.quantity_total;

  const scanned = Math.min(scannedRaw, total);
  const remaining = Math.max(0, total - scanned);

  const isPartial = scanned > 0 && scanned < total;
  const isFullySubstituted = item.status === "sustituido" && scanned === 0;
  const isMixed = scanned > 0 && item.sustituto;
  const isShortPick = isCompleted && scanned < total && !item.sustituto;

  // 🧠 Lógica centralizada para detectar si es pesable
  const isWeighable = useMemo(() => {
    if (!item) return false;
    const txt = (
      item.name +
      " " +
      (item.categorias?.[0]?.name || "")
    ).toLowerCase();
    const isUnitPesable =
      item.unidad_medida &&
      ["kl", "kg", "kilo", "lb", "libra"].includes(
        item.unidad_medida.toLowerCase(),
      );
    return (
      isUnitPesable ||
      txt.includes("kg") ||
      txt.includes("gramos") ||
      txt.includes("fruver") ||
      txt.includes("carniceria")
    );
  }, [item]);

  // Lógica para detectar si es un multipack (P6, P3, etc.)
  const isMultipack = useMemo(() => {
    if (!item) return false;
    const uom = item.unidad_medida ? item.unidad_medida.toUpperCase() : "";
    return uom.startsWith("P") && !isNaN(uom.substring(1));
  }, [item]);

  // Si es multipack, determinar la cantidad del paquete
  const multipackQty = useMemo(() => {
    if (!isMultipack) return 0;
    const qtyStr = item.unidad_medida.toUpperCase().substring(1);
    return parseInt(qtyStr) || 0;
  }, [isMultipack, item]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`ec-product-card ${isCompleted ? "completed" : ""} ${isPartial ? "partial-scan" : ""} ${isFullySubstituted ? "sustituido-card" : ""} ${isMixed ? "mixed-card" : ""} ${isShortPick ? "short-pick-mode" : ""} ${isMultipack && !isCompleted ? "multipack-card" : ""}`}
      style={
        isMultipack && !isCompleted
          ? { border: "2px solid #9333ea", background: "#faf5ff" }
          : {}
      }
    >
      <div className="ec-img-wrapper">
        {item.image_src ? (
          <img src={item.image_src} className="ec-prod-img" alt="" />
        ) : (
          <FaBoxOpen color="#cbd5e1" size={40} />
        )}
      </div>

      <div className="ec-info-col">
        {/* FILA SUPERIOR: Pasillo + Cantidad Gigante */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              alignItems: "flex-start",
            }}
          >
            <span
              className="ec-pasillo-badge"
              style={{
                background: "#2563eb",
                color: "white",
                padding: "4px 10px",
                fontSize: "0.8rem",
                boxShadow: "0 2px 4px rgba(37,99,235,0.3)",
              }}
            >
              {item.pasillo === "S/N" || item.pasillo === "Otros"
                ? "GENERAL"
                : `PASILLO ${item.pasillo}`}
            </span>
            {(item.categorias_reales ||
              (item.categorias && item.categorias.length > 0)) && (
              <span
                style={{
                  fontSize: "0.65rem",
                  color: "#64748b",
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {(item.categorias_reales || item.categorias.map((c) => c.name))
                  .slice(0, 3)
                  .join(" • ")}
              </span>
            )}
          </div>

          <div className="ec-massive-qty-badge">
            <span className="mq-num">{total}</span>
            <span className="mq-unit">
              {item.unidad_medida ? item.unidad_medida.toUpperCase() : "UN"}
            </span>
          </div>
        </div>

        {/* ALERTA VISUAL DE EMPAQUE (MULTIPACK) */}
        {isMultipack && !isCompleted && (
          <div
            style={{
              background: "#9333ea",
              color: "white",
              padding: "8px 12px",
              borderRadius: "8px",
              fontWeight: "900",
              fontSize: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
              boxShadow: "0 4px 6px rgba(147, 51, 234, 0.3)",
              textTransform: "uppercase",
              animation: "pulse 2s infinite",
            }}
          >
            📦 ATENCIÓN: LLEVAR EMPAKE x{multipackQty}
          </div>
        )}

        {isMixed ? (
          <div className="ec-sub-details">
            <div
              style={{
                borderBottom: "1px dashed #ccc",
                paddingBottom: 4,
                marginBottom: 4,
              }}
            >
              <span className="ec-label-tiny" style={{ color: "#16a34a" }}>
                ORIGINAL:
              </span>
              <span style={{ fontWeight: "bold" }}>{scanned} un.</span>{" "}
              {item.name}
            </div>
            <div>
              <span className="ec-label-tiny" style={{ color: "#d97706" }}>
                SUSTITUTO:
              </span>
              <span style={{ fontWeight: "bold" }}>{total - scanned} un.</span>{" "}
              {item.sustituto.name}
            </div>
          </div>
        ) : isFullySubstituted ? (
          <div className="ec-sub-details">
            <div className="ec-original-row">
              <span className="ec-label-tiny">PIDIÓ:</span>
              <span className="ec-text-crossed">{item.name}</span>
            </div>
            <div className="ec-arrow-down">
              <FaArrowRight
                style={{
                  transform: "rotate(90deg)",
                  fontSize: "0.8rem",
                  color: "#f59e0b",
                }}
              />
            </div>
            <div className="ec-final-row">
              <span className="ec-label-tiny">LLEVAS:</span>
              <span className="ec-text-final">{item.sustituto.name}</span>
              <span className="ec-price-final">
                {formatPrice(item.sustituto.price)}
              </span>
            </div>
          </div>
        ) : (
          <>
            <h4 className="ec-prod-name">{item.name}</h4>
            <div className="ec-price-tag">
              {item.price > 0 ? formatPrice(item.price) : ""}{" "}
              {item.unidad_medida && `/ ${item.unidad_medida}`}
            </div>

            {/* ✅ SI TIENE PESO REGISTRADO, LO MOSTRAMOS GIGANTE EN VERDE */}
            {item.peso_real > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  background: "#dcfce7",
                  border: "1px solid #22c55e",
                  color: "#16a34a",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  fontWeight: "900",
                  fontSize: "0.9rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FaWeightHanging size={14} />
                PESO REGISTRADO: {parseFloat(item.peso_real).toFixed(3)}{" "}
                {item.unidad_medida?.toUpperCase() || "KG"}
              </div>
            )}

            {/* NOTAS DEL CLIENTE */}
            {item.notas_cliente && item.notas_cliente.length > 0 && (
              <div
                style={{
                  background: "#fef08a",
                  borderLeft: "4px solid #eab308",
                  padding: "6px 10px",
                  marginTop: "8px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  color: "#854d0e",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    marginBottom: "3px",
                    textTransform: "uppercase",
                    fontSize: "0.7rem",
                  }}
                >
                  📝 Instrucción Especial:
                </strong>
                {item.notas_cliente.map((nota, i) => (
                  <div key={i} style={{ marginBottom: "3px" }}>
                    {nota}
                  </div>
                ))}
              </div>
            )}

            {isShortPick && (
              <div className="short-pick-alert">
                <FaExclamationTriangle /> Se encontraron solo {scanned} de{" "}
                {total}
              </div>
            )}
          </>
        )}

        <div className="ec-req-list">
          {item.pedidos_involucrados.map((ped, idx) => {
            const orderIdx = orderMap[ped.id_pedido] || 0;
            const style = getOrderStyle(orderIdx);
            return (
              <div
                key={idx}
                className="ec-req-badge"
                style={{ borderLeftColor: style.color }}
              >
                <span className="ec-req-letter" style={{ color: style.color }}>
                  {style.code}
                </span>
                <span className="ec-req-qty">
                  {ped.cantidad} {item.unidad_medida || "un."}
                </span>
                <span className="ec-req-name">
                  {ped.nombre_cliente.split(" ")[0]}
                </span>
                {ped.is_pickup && (
                  <span
                    title="Recogida en Local"
                    style={{ marginLeft: "auto", fontSize: "1rem" }}
                  >
                    🚶‍♂️
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isCompleted ? (
        <div className="ec-action-col">
          <button
            className={`ec-scan-btn ${isPartial ? "active-partial" : ""}`}
            onClick={() => onAction(item, "scan")}
          >
            {isPartial ? (
              <div className="ec-scan-progress">
                <span className="ec-scan-prog-nums">
                  {scanned}/{total}
                </span>
                <span className="ec-scan-prog-label">FALTAN {remaining}</span>
              </div>
            ) : isWeighable ? (
              // ✅ Si es pesable, muestra la báscula y dice "PESAR"
              <>
                <FaWeightHanging size={18} />
                <span className="ec-scan-label">PESAR</span>
              </>
            ) : (
              // ❌ Si es un producto normal (latas de atún, etc), dice "SCAN"
              <>
                <FaBarcode size={18} />
                <span className="ec-scan-label">SCAN</span>
              </>
            )}
          </button>

          {isPartial && (
            <button
              className="ec-short-btn"
              onClick={() => onAction(item, "short_pick")}
              title="Faltan Unidades"
            >
              <FaBan />
            </button>
          )}

          <div style={{ display: "flex", gap: 5 }}>
            {/* Ocultamos el teclado si es pesable */}
            {!isWeighable && (
              <button
                className="ec-alt-btn"
                onClick={() => onAction(item, "manual")}
                title="Teclado"
              >
                <FaKeyboard size={14} />
              </button>
            )}

            <button
              className="ec-alt-btn warning"
              onClick={() => onAction(item, "substitute")}
              title="Sustituir Total"
            >
              <FaExchangeAlt size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="ec-action-col">
          <button
            className="ec-alt-btn"
            style={{
              color: "#dc2626",
              borderColor: "#fca5a5",
              background: "#fef2f2",
            }}
            onClick={() => {
              if (window.confirm("¿Devolver a pendientes?"))
                onAction(item, "undo");
            }}
            title="Devolver a pendientes"
          >
            <FaUndo />
          </button>
          <div
            style={{
              marginTop: 5,
              color:
                isFullySubstituted || isMixed
                  ? "#d97706"
                  : isShortPick
                    ? "#ef4444"
                    : "#16a34a",
            }}
          >
            {isFullySubstituted || isMixed ? (
              <FaExchangeAlt />
            ) : isShortPick ? (
              <FaExclamationTriangle />
            ) : (
              <FaCheck />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
