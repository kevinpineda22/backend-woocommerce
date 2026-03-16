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
  FaWeightHanging,
  FaSearchPlus,
} from "react-icons/fa";
import { getOrderStyle, formatPrice } from "../utils/pickerConstants";
import { isWeighable as isWeighableFn } from "../utils/isWeighable";
import "./ProductCard.css";

export const ProductCard = ({ item, orderMap, onAction, isCompleted, onImageZoom, animDelay = 0 }) => {
  const scannedRaw = item.qty_scanned || 0;
  const total = item.quantity_total;

  const scanned = Math.min(scannedRaw, total);
  const remaining = Math.max(0, total - scanned);

  const isPartial = scanned > 0 && scanned < total;
  const isFullySubstituted = item.status === "sustituido" && scanned === 0;
  const isMixed = scanned > 0 && item.sustituto;
  const isShortPick = isCompleted && scanned < total && !item.sustituto;

  const isWeighable = useMemo(() => isWeighableFn(item), [item]);

  const isMultipack = useMemo(() => {
    if (!item) return false;
    const uom = item.unidad_medida ? item.unidad_medida.toUpperCase() : "";
    return uom.startsWith("P") && !isNaN(uom.substring(1));
  }, [item]);

  const multipackQty = useMemo(() => {
    if (!isMultipack) return 0;
    const qtyStr = item.unidad_medida.toUpperCase().substring(1);
    return parseInt(qtyStr) || 0;
  }, [isMultipack, item]);

  const statusIconClass = useMemo(() => {
    if (isFullySubstituted || isMixed) return "ec-card-status-icon--warning";
    if (isShortPick) return "ec-card-status-icon--danger";
    return "ec-card-status-icon--success";
  }, [isFullySubstituted, isMixed, isShortPick]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: animDelay }}
      className={[
        "ec-product-card",
        isCompleted ? "completed" : "",
        isPartial ? "partial-scan" : "",
        isFullySubstituted ? "sustituido-card" : "",
        isMixed ? "mixed-card" : "",
        isShortPick ? "short-pick-mode" : "",
        isMultipack && !isCompleted ? "multipack-card" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`ec-img-wrapper ${item.image_src ? "ec-img-zoomable" : ""}`}
        onClick={() => item.image_src && onImageZoom && onImageZoom(item.image_src, item.name)}
      >
        {item.image_src ? (
          <>
            <img src={item.image_src} className="ec-prod-img" alt="" />
            <span className="ec-zoom-icon"><FaSearchPlus /></span>
          </>
        ) : (
          <FaBoxOpen color="#cbd5e1" size={40} />
        )}
      </div>

      <div className="ec-info-col">
        {/* FILA SUPERIOR: Pasillo + Cantidad */}
        <div className="ec-card-top-row">
          <div className="ec-card-left-info">
            <span className="ec-pasillo-badge">
              {item.pasillo === "S/N" || item.pasillo === "Otros"
                ? "GENERAL"
                : `PASILLO ${item.pasillo}`}
            </span>
            {(item.categorias_reales ||
              (item.categorias && item.categorias.length > 0)) && (
              <span className="ec-category-text">
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

        {/* ALERTA MULTIPACK */}
        {isMultipack && !isCompleted && (
          <div className="ec-multipack-alert">
            📦 ATENCIÓN: LLEVAR EMPAKE x{multipackQty}
          </div>
        )}

        {isMixed ? (
          <div className="ec-sub-details">
            <div className="ec-sub-divider">
              <span className="ec-label-tiny ec-label-tiny--success">
                ORIGINAL:
              </span>
              <strong>{scanned} un.</strong>{" "}
              {item.name}
            </div>
            <div>
              <span className="ec-label-tiny ec-label-tiny--warning">
                SUSTITUTO:
              </span>
              <strong>{total - scanned} un.</strong>{" "}
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
              <FaArrowRight className="ec-arrow-icon-down" />
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

            {item.notas_cliente && item.notas_cliente.length > 0 && (
              <div className="ec-product-notes">
                <strong className="ec-notes-title">
                  📝 Instrucción Especial:
                </strong>
                {item.notas_cliente.map((n, i) => (
                  <div key={i} className="ec-notes-item">
                    <strong>
                      El cliente {typeof n === "object" ? n.cliente : ""} indicó:
                    </strong>{" "}
                    {typeof n === "object" ? n.nota : n}
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

        {/* Peso registrado - visible en canasta para TODOS los estados */}
        {isCompleted && item.peso_real > 0 && (
          <div className="ec-weight-registered">
            <FaWeightHanging size={14} />
            PESO REGISTRADO: {parseFloat(item.peso_real).toFixed(3)} KG
            {item.unidad_medida?.toUpperCase() === "LB" ||
            item.unidad_medida?.toUpperCase() === "LIBRA"
              ? ` (${(parseFloat(item.peso_real) * 2).toFixed(2)} LB)`
              : ""}
          </div>
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
                  <span className="ec-pickup-icon" title="Recogida en Local">
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
              <>
                <FaWeightHanging size={18} />
                <span className="ec-scan-label">PESAR</span>
              </>
            ) : (
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
              <FaBan size={12} />
              <span className="ec-btn-micro-label">NO HAY</span>
            </button>
          )}

          <div className="ec-action-row">
            {!isWeighable && (
              <button
                className="ec-alt-btn"
                onClick={() => onAction(item, "manual")}
                title="Teclado"
              >
                <FaKeyboard size={12} />
                <span className="ec-btn-micro-label">DIGITAR</span>
              </button>
            )}

            <button
              className="ec-alt-btn warning"
              onClick={() => onAction(item, "substitute")}
              title="Sustituir Total"
            >
              <FaExchangeAlt size={12} />
              <span className="ec-btn-micro-label">CAMBIAR</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="ec-action-col">
          <button
            className="ec-alt-btn ec-alt-btn--danger"
            onClick={() => onAction(item, "undo")}
            title="Devolver a pendientes"
          >
            <FaUndo />
          </button>
          <div className={`ec-card-status-icon ${statusIconClass}`}>
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
