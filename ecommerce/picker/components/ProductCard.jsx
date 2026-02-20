import React from "react";
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`ec-product-card ${isCompleted ? "completed" : ""} ${isPartial ? "partial-scan" : ""} ${isFullySubstituted ? "sustituido-card" : ""} ${isMixed ? "mixed-card" : ""} ${isShortPick ? "short-pick-mode" : ""}`}
    >
      <div className="ec-img-wrapper">
        {item.image_src ? (
          <img src={item.image_src} className="ec-prod-img" alt="" />
        ) : (
          <FaBoxOpen color="#ccc" size={30} />
        )}
        <span className="ec-qty-badge-img">
          {total} {item.unidad_medida ? item.unidad_medida.toUpperCase() : "un"}
        </span>
      </div>

      <div className="ec-info-col">
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-start", marginBottom: "2px" }}>
          <span
            className="ec-pasillo-badge"
            style={{ background: "#2563eb", color: "white", padding: "4px 10px", fontSize: "0.8rem", boxShadow: "0 2px 4px rgba(37,99,235,0.3)" }}
          >
            {item.pasillo === "S/N" || item.pasillo === "Otros" ? "GENERAL" : `PASILLO ${item.pasillo}`}
          </span>
        </div>

        {isMixed ? (
          <div className="ec-sub-details">
            <div style={{ borderBottom: "1px dashed #ccc", paddingBottom: 4, marginBottom: 4 }}>
              <span className="ec-label-tiny" style={{ color: "#16a34a" }}>ORIGINAL:</span>
              <span style={{ fontWeight: "bold" }}>{scanned} un.</span> {item.name}
            </div>
            <div>
              <span className="ec-label-tiny" style={{ color: "#d97706" }}>SUSTITUTO:</span>
              <span style={{ fontWeight: "bold" }}>{total - scanned} un.</span> {item.sustituto.name}
            </div>
          </div>
        ) : isFullySubstituted ? (
          <div className="ec-sub-details">
            <div className="ec-original-row">
              <span className="ec-label-tiny">PIDIÓ:</span>
              <span className="ec-text-crossed">{item.name}</span>
            </div>
            <div className="ec-arrow-down">
              <FaArrowRight style={{ transform: "rotate(90deg)", fontSize: "0.8rem", color: "#f59e0b" }} />
            </div>
            <div className="ec-final-row">
              <span className="ec-label-tiny">LLEVAS:</span>
              <span className="ec-text-final">{item.sustituto.name}</span>
              <span className="ec-price-final">{formatPrice(item.sustituto.price)}</span>
            </div>
          </div>
        ) : (
          <>
            <h4 className="ec-prod-name">{item.name}</h4>
            <div className="ec-price-tag">
              {item.price > 0 ? formatPrice(item.price) : ""} {item.unidad_medida && `/ ${item.unidad_medida}`}
            </div>

            {/* NOTAS DEL CLIENTE */}
            {item.notas_cliente && item.notas_cliente.length > 0 && (
              <div style={{ background: "#fef08a", borderLeft: "4px solid #eab308", padding: "6px 10px", marginTop: "8px", borderRadius: "6px", fontSize: "0.85rem", color: "#854d0e" }}>
                <strong style={{ display: "block", marginBottom: "3px", textTransform: "uppercase", fontSize: "0.7rem" }}>
                  📝 Instrucción Especial:
                </strong>
                {item.notas_cliente.map((nota, i) => (
                  <div key={i} style={{ marginBottom: "3px" }}>{nota}</div>
                ))}
              </div>
            )}

            {isShortPick && (
              <div className="short-pick-alert">
                <FaExclamationTriangle /> Se encontraron solo {scanned} de {total}
              </div>
            )}
          </>
        )}

        <div className="ec-req-list">
          {item.pedidos_involucrados.map((ped, idx) => {
            const orderIdx = orderMap[ped.id_pedido] || 0;
            const style = getOrderStyle(orderIdx);
            return (
              <div key={idx} className="ec-req-badge" style={{ borderLeftColor: style.color }}>
                <span className="ec-req-letter" style={{ color: style.color }}>{style.code}</span>
                <span className="ec-req-qty">{ped.cantidad} {item.unidad_medida || "un."}</span>
                <span className="ec-req-name">{ped.nombre_cliente.split(" ")[0]}</span>
                {ped.is_pickup && (
                  <span title="Recogida en Local" style={{ marginLeft: "auto", fontSize: "1rem" }}>🚶‍♂️</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!isCompleted ? (
        <div className="ec-action-col">
          <button className={`ec-scan-btn ${isPartial ? "active-partial" : ""}`} onClick={() => onAction(item, "scan")}>
            {isPartial ? (
              <div className="ec-scan-progress">
                <span className="ec-scan-prog-nums">{scanned}/{total}</span>
                <span className="ec-scan-prog-label">FALTAN {remaining}</span>
              </div>
            ) : (
              <><FaBarcode /><span className="ec-scan-label">SCAN</span></>
            )}
          </button>
          {isPartial && (
            <button className="ec-short-btn" onClick={() => onAction(item, "short_pick")} title="Faltan Unidades"><FaBan /></button>
          )}
          <div style={{ display: "flex", gap: 5 }}>
            <button className="ec-alt-btn" onClick={() => onAction(item, "manual")} title="Teclado"><FaKeyboard size={14} /></button>
            <button className="ec-alt-btn warning" onClick={() => onAction(item, "substitute")} title="Sustituir Total"><FaExchangeAlt size={14} /></button>
          </div>
        </div>
      ) : (
        <div className="ec-action-col">
          <button
            className="ec-alt-btn"
            style={{ color: "#dc2626", borderColor: "#fca5a5", background: "#fef2f2" }}
            onClick={() => { if (window.confirm("¿Devolver a pendientes?")) onAction(item, "undo"); }}
            title="Devolver a pendientes"
          >
            <FaUndo />
          </button>
          <div style={{ marginTop: 5, color: isFullySubstituted || isMixed ? "#d97706" : isShortPick ? "#ef4444" : "#16a34a" }}>
            {isFullySubstituted || isMixed ? <FaExchangeAlt /> : isShortPick ? <FaExclamationTriangle /> : <FaCheck />}
          </div>
        </div>
      )}
    </motion.div>
  );
};