/**
 * SELECTOR DE SEDE
 *
 * Dropdown reutilizable para cambiar de sede.
 * Solo visible para super_admins o admins con acceso multi-sede.
 *
 * USO:
 *   import { SedeSelector } from './SedeSelector';
 *   <SedeSelector />
 */

import React, { useState } from "react";
import { useSedeContext } from "./SedeContext";
import "./SedeSelector.css";

export const SedeSelector = ({ compact = false }) => {
  const { sedeActual, sedes, isSuperAdmin, isMultiSede, cambiarSede, loading } =
    useSedeContext();
  const [isOpen, setIsOpen] = useState(false);

  // No mostrar si no hay múltiples sedes
  if (!isMultiSede || loading) return null;

  // Si NO es super admin, solo mostrar la sede actual como badge (sin dropdown)
  if (!isSuperAdmin) {
    return (
      <div className="sede-badge">
        <span className="sede-badge-dot" />
        <span className="sede-badge-text">
          {sedeActual?.nombre || "Sin sede"}
        </span>
      </div>
    );
  }

  // Super Admin: Dropdown completo
  return (
    <div className={`sede-selector ${compact ? "sede-selector--compact" : ""}`}>
      <button
        className="sede-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="sede-selector-icon">🏪</span>
        <span className="sede-selector-label">
          {sedeActual ? sedeActual.nombre : "Todas las sedes"}
        </span>
        <span className={`sede-selector-arrow ${isOpen ? "open" : ""}`}>▼</span>
      </button>

      {isOpen && (
        <>
          <div
            className="sede-selector-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="sede-selector-dropdown">
            {/* Opción "Todas" */}
            <button
              className={`sede-selector-option ${!sedeActual ? "active" : ""}`}
              onClick={() => {
                cambiarSede(null);
                setIsOpen(false);
              }}
            >
              <span className="sede-option-icon">🌐</span>
              <div className="sede-option-info">
                <span className="sede-option-name">Todas las sedes</span>
                <span className="sede-option-desc">Vista global</span>
              </div>
            </button>

            <div className="sede-selector-divider" />

            {/* Lista de sedes */}
            {sedes.map((sede) => (
              <button
                key={sede.id}
                className={`sede-selector-option ${sedeActual?.id === sede.id ? "active" : ""}`}
                onClick={() => {
                  cambiarSede(sede);
                  setIsOpen(false);
                }}
              >
                <span className="sede-option-icon">🏬</span>
                <div className="sede-option-info">
                  <span className="sede-option-name">{sede.nombre}</span>
                  <span className="sede-option-desc">
                    {sede.ciudad || sede.slug}
                  </span>
                </div>
                {sedeActual?.id === sede.id && (
                  <span className="sede-option-check">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default SedeSelector;
