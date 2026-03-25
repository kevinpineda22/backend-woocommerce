import React, { useEffect } from "react";
import { FaTimes } from "react-icons/fa";
import "./ActionModal.css";

/**
 * Modal de acciones flexible para el picker.
 * Soporta múltiples botones + cierre sin acción (X y overlay).
 *
 * @param {boolean} isOpen
 * @param {string} title
 * @param {string} message - Texto descriptivo (acepta \n)
 * @param {React.ReactNode} icon - Icono opcional en el header
 * @param {string} iconVariant - "warning" | "danger" | "info"
 * @param {Array} actions - [{ label, onClick, variant: "primary"|"danger"|"warning"|"neutral", icon }]
 * @param {function} onClose - Cerrar sin hacer nada
 */
const ActionModal = ({
  isOpen,
  title,
  message,
  icon,
  iconVariant = "warning",
  actions = [],
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="am-overlay" onClick={onClose}>
      <div className="am-content" onClick={(e) => e.stopPropagation()}>
        <button className="am-close" onClick={onClose}>
          <FaTimes />
        </button>

        {icon && (
          <div className={`am-icon-wrap am-icon--${iconVariant}`}>{icon}</div>
        )}

        <h3 className="am-title">{title}</h3>

        {message && (
          <p className="am-message">
            {message.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < message.split("\n").length - 1 && <br />}
              </span>
            ))}
          </p>
        )}

        <div
          className={`am-actions ${actions.length === 1 ? "am-actions--single" : ""}`}
        >
          {actions.map((action, idx) => (
            <button
              key={idx}
              className={`am-btn am-btn--${action.variant || "neutral"}`}
              onClick={action.onClick}
            >
              {action.icon && <span className="am-btn-icon">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
