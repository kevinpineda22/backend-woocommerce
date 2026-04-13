import React from "react";
import { FaExclamationTriangle, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import "./ConfirmModal.css";

const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDanger = false,
  isProcessing = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="ec-confirm-overlay" onClick={(e) => {
      e.stopPropagation();
      onCancel(); // Opcional: Cerrar el modal de confirm si tocan fuera
    }}>
      <div className="ec-confirm-content" onClick={(e) => e.stopPropagation()}>
        <div className={`ec-confirm-icon-wrap ${isDanger ? "danger" : "warning"}`}>
          <FaExclamationTriangle size={36} />
        </div>
        
        <h3 className="ec-confirm-title">{title}</h3>
        <p className="ec-confirm-message">{message}</p>
        
        <div className="ec-confirm-actions">
          <button 
            className="ec-confirm-cancel" 
            onClick={onCancel}
            disabled={isProcessing}
          >
            <FaTimes /> {cancelText}
          </button>
          <button 
            className={`ec-confirm-accept ${isDanger ? "danger" : "primary"}`} 
            onClick={onConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? <FaSpinner className="ec-spin" /> : <FaCheck />} {isProcessing ? "Procesando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
