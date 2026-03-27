import React, { useState, useEffect, useRef } from "react";
import { FaBoxOpen, FaExclamationTriangle } from "react-icons/fa";
import "../Modals.css";

// --- MODAL DE CANTIDAD MASIVA ---
const BulkQtyModal = ({ isOpen, item, onClose, onConfirm }) => {
  const [qty, setQty] = useState("");
  const [bulkError, setBulkError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && item) {
      const remaining = item.quantity_total - (item.qty_scanned || 0);
      setQty(remaining.toString());
      setBulkError("");
      setTimeout(() => inputRef.current?.select(), 100);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const remaining = item.quantity_total - (item.qty_scanned || 0);

  const handleSubmit = () => {
    const val = parseInt(qty);
    if (isNaN(val) || val <= 0) {
      setBulkError("❌ Ingresa un número válido mayor a 0.");
      inputRef.current?.focus();
      return;
    }
    if (val > remaining) {
      setBulkError(
        `❌ Máximo permitido: ${remaining} unidades. Ingresaste ${val}.`,
      );
      inputRef.current?.focus();
      return;
    }
    setBulkError("");
    onConfirm(val);
  };

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content ec-modal-content--narrow">
        <div className="modal-header-center">
          <FaBoxOpen size={48} color="#f59e0b" />
          <h3 className="modal-header-title">¿Cuántas unidades encontraste?</h3>
          <p className="modal-header-subtitle">
            Múltiples unidades detectadas.
            <br />
            Llevas:{" "}
            <strong className="modal-qty-highlight">
              {item.qty_scanned || 0} / {item.quantity_total}
            </strong>
          </p>
        </div>
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="number"
            className="ec-manual-input bulk-input-qty"
            value={qty}
            min={1}
            max={remaining}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>
        <p className="bulk-max-hint">
          Máximo permitido:{" "}
          <strong className="bulk-max-value">{remaining}</strong>
        </p>
        {bulkError && (
          <div className="wm-error-alert wm-error-alert--mt">
            <div className="wm-error-icon">
              <FaExclamationTriangle />
            </div>
            <div>{bulkError}</div>
          </div>
        )}
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            ✕ Cancelar
          </button>
          <button
            className="ec-reason-btn ec-reason-btn--warning"
            onClick={handleSubmit}
          >
            ✅ Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkQtyModal;
