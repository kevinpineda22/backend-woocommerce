import React, { useState, useEffect, useRef } from "react";
import { FaKeyboard } from "react-icons/fa";
import "../Modals.css";

const ManualEntryModal = ({ isOpen, onClose, onConfirm }) => {
  const [code, setCode] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCode("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="ec-modal-overlay">
      <div className="ec-modal-content">
        <div className="modal-header-center">
          <FaKeyboard size={48} color="#3b82f6" />
          <h3 className="modal-header-title">Digitar Código</h3>
          <p className="modal-header-subtitle">
            Si el escáner falla, ingresa el EAN/SKU manual.
          </p>
        </div>
        <div className="ec-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="ec-manual-input"
            placeholder="Ej: 770..."
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
            onPaste={(e) => {
              e.preventDefault();
              const pastedText = (e.clipboardData || window.clipboardData)
                .getData("text")
                .replace(/\s+/g, "");
              setCode(pastedText);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              code.trim().length > 0 &&
              onConfirm(code.trim())
            }
          />
        </div>
        <div className="ec-modal-grid">
          <button className="ec-modal-cancel" onClick={onClose}>
            ✕ Cancelar
          </button>
          <button
            className="ec-reason-btn ec-reason-btn--primary"
            onClick={() => {
              if (code.trim().length > 0) onConfirm(code.trim());
            }}
            disabled={!code.trim()}
          >
            ✅ Validar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualEntryModal;
