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
import {
  getOrderStyle,
  formatPrice,
  parseMultipack,
  getPresentationLabel,
} from "../utils/pickerConstants";
import { isWeighable } from "../utils/isWeighable";
import "./ProductCard.css";

export const ProductCard = ({
  item,
  orderMap,
  onAction,
  isCompleted,
  onImageZoom,
  animDelay = 0,
}) => {
  const scannedRaw = item.qty_scanned || 0;
  const total = item.quantity_total;

  const scanned = Math.min(scannedRaw, total);
  const remaining = Math.max(0, total - scanned);

  const isPartial = scanned > 0 && scanned < total;
  const isFullySubstituted = item.status === "sustituido" && scanned === 0;
  const isMixed = scanned > 0 && item.sustituto;
  const isShortPick = isCompleted && scanned < total && !item.sustituto;

  const itemIsWeighable = useMemo(() => isWeighable(item), [item]);

  const multipack = useMemo(
    () => parseMultipack(item.unidad_medida),
    [item.unidad_medida],
  );

  const presentationLabel = useMemo(
    () => getPresentationLabel(item.unidad_medida),
    [item.unidad_medida],
  );

  const statusIconClass = useMemo(() => {
    if (isFullySubstituted || isMixed) return "ec-card-status-icon--warning";
    if (isShortPick) return "ec-card-status-icon--danger";
    return "ec-card-status-icon--success";
  }, [isFullySubstituted, isMixed, isShortPick]);

  const singleOrderStyle =
    item.pedidos_involucrados.length === 1
      ? getOrderStyle(orderMap[item.pedidos_involucrados[0].id_pedido] || 0)
      : null;

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
        multipack.isMultipack && !isCompleted ? "multipack-card" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...(!isCompleted &&
        !isPartial &&
        !isFullySubstituted &&
        !isMixed &&
        singleOrderStyle
          ? {
              borderLeft: `6px solid ${singleOrderStyle.color}`,
              backgroundColor: singleOrderStyle.bg,
            }
          : {}),
      }}
    >
      <div
        className={`ec-img-wrapper ${item.image_src ? "ec-img-zoomable" : ""}`}
        onClick={() =>
          item.image_src &&
          onImageZoom &&
          onImageZoom(item.image_src, item.name)
        }
      >
        {item.image_src ? (
          <>
            <img src={item.image_src} className="ec-prod-img" alt="" />
            <span className="ec-zoom-icon">
              <FaSearchPlus />
            </span>
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

          <div
            className={`ec-massive-qty-badge ${multipack.isMultipack ? "ec-badge-multipack" : ""}`}
          >
            <span className="mq-num">{total}</span>
            <span className="mq-unit">{presentationLabel}</span>
          </div>
        </div>

        {/* ALERTA MULTIPACK */}
        {multipack.isMultipack && !isCompleted && (
          <div className="ec-multipack-alert">
            📦 ATENCIÓN: LLEVAR {multipack.label}
            {total > 1 && ` (${total} unidades)`}
          </div>
        )}

        {isMixed ? (
          <div className="ec-sub-details">
            <div className="ec-sub-divider">
              <span className="ec-label-tiny ec-label-tiny--success">
                ORIGINAL:
              </span>
              <strong>{scanned} un.</strong> {item.name}
            </div>
            <div>
              <span className="ec-label-tiny ec-label-tiny--warning">
                SUSTITUTO:
              </span>
              <strong>{total - scanned} un.</strong> {item.sustituto.name}
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
                      El cliente {typeof n === "object" ? n.cliente : ""}{" "}
                      indicó:
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
            {(() => {
              const u = item.unidad_medida?.toLowerCase();
              const kg = parseFloat(item.peso_real);
              if (u === "lb" || u === "libra")
                return ` (${(kg * 2).toFixed(2)} LB)`;
              if (u === "500gr" || u === "500g" || u === "500grs")
                return ` (${(kg * 2).toFixed(2)} porciones de 500g)`;
              return "";
            })()}
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
                style={{ backgroundColor: style.bg, borderColor: style.color }}
              >
                <div
                  className="ec-req-letter-circle"
                  style={{ backgroundColor: style.color }}
                >
                  {style.code}
                </div>
                <div className="ec-req-info-col">
                  <span className="ec-req-qty" style={{ color: style.color }}>
                    {ped.cantidad}{" "}
                    {(() => {
                      const u = (item.unidad_medida || "").trim().toLowerCase();
                      if (!u) return "un.";
                      if (u === "500gr" || u === "500g" || u === "500grs")
                        return "porciones de 500g";
                      if (u === "lb" || u === "libra") return "LB";
                      if (u === "kl" || u === "kg" || u === "kilo") return "KG";
                      return item.unidad_medida;
                    })()}
                  </span>
                  <span className="ec-req-name" style={{ color: style.color }}>
                    {ped.nombre_cliente.split(" ")[0]}
                  </span>
                </div>
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
            ) : itemIsWeighable ? (
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
            {!itemIsWeighable && (
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
