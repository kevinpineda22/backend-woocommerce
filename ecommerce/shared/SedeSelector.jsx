/**
 * SELECTOR DE SEDE — Componente unificado Rol + Sede
 *
 * Integra indicador de rol y selector de sede en un solo elemento.
 * - Super Admin: Card con rol + dropdown de sedes
 * - Otros roles: Card con rol + sede asignada (sin dropdown)
 *
 * USO:
 *   import { SedeSelector } from './SedeSelector';
 *   <SedeSelector />
 *   <SedeSelector compact variant="light" />
 */

import React, { useState, useRef, useEffect } from "react";
import { useSedeContext } from "./SedeContext";
import "./SedeSelector.css";

const ROLE_ICONS = {
  ecommerce_admin_global: "👑",
  ecommerce_admin_sede: "🏪",
  ecommerce_picker: "📦",
  ecommerce_auditor: "🔍",
};

export const SedeSelector = ({ compact = false, variant = "dark" }) => {
  const {
    sedeActual,
    sedes,
    isSuperAdmin,
    isMultiSede,
    cambiarSede,
    loading,
    ecommerceRol,
    ecommerceRolLabel,
  } = useSedeContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const roleIcon = ROLE_ICONS[ecommerceRol] || "👤";

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // No mostrar si no hay múltiples sedes
  if (!isMultiSede || loading) return null;

  // ─── NO Super Admin: Card unificado (rol + sede, sin dropdown) ───
  if (!isSuperAdmin) {
    return (
      <div
        className={`ecom-sede-card ecom-sede-card--${ecommerceRol || "default"}`}
      >
        {ecommerceRolLabel && (
          <div className="ecom-sede-card-role">
            <span className="ecom-sede-card-role-icon">{roleIcon}</span>
            <span className="ecom-sede-card-role-text">
              {ecommerceRolLabel}
            </span>
          </div>
        )}
        <div className="ecom-sede-card-sede">
          <span className="ecom-sede-card-sede-dot" />
          <span className="ecom-sede-card-sede-text">
            {sedeActual?.nombre || "Sin sede"}
          </span>
        </div>
      </div>
    );
  }

  // ─── Super Admin: Card con rol + dropdown interactivo ───
  const selectorClasses = [
    "ecom-sede-selector",
    compact ? "ecom-sede-selector--compact" : "",
    `ecom-sede-selector--${variant}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={selectorClasses} ref={dropdownRef}>
      <button
        className="ecom-sede-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="ecom-sede-trigger-icon">{roleIcon}</span>
        <span className="ecom-sede-trigger-label">
          {ecommerceRolLabel && (
            <span className="ecom-sede-trigger-rol">{ecommerceRolLabel}</span>
          )}
          <span className="ecom-sede-trigger-name">
            {sedeActual ? sedeActual.nombre : "Todas las sedes"}
          </span>
        </span>
        <span
          className={`ecom-sede-trigger-arrow ${isOpen ? "ecom-sede-open" : ""}`}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="ecom-sede-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <div className="ecom-sede-dropdown" role="listbox">
            <div className="ecom-sede-dropdown-header">Cambiar sede</div>

            {/* Opción "Todas" */}
            <button
              className={`ecom-sede-option ecom-sede-option--all ${!sedeActual ? "ecom-sede-active" : ""}`}
              onClick={() => {
                cambiarSede(null);
                setIsOpen(false);
              }}
              role="option"
              aria-selected={!sedeActual}
            >
              <span className="ecom-sede-option-icon">🌐</span>
              <div className="ecom-sede-option-info">
                <span className="ecom-sede-option-name">Todas las sedes</span>
                <span className="ecom-sede-option-desc">Vista global</span>
              </div>
              <span className="ecom-sede-option-check">✓</span>
            </button>

            <div className="ecom-sede-divider" />

            {/* Lista de sedes */}
            {sedes.map((sede) => {
              const isActive = sedeActual?.id === sede.id;
              return (
                <button
                  key={sede.id}
                  className={`ecom-sede-option ${isActive ? "ecom-sede-active" : ""}`}
                  onClick={() => {
                    cambiarSede(sede);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="ecom-sede-option-icon">🏬</span>
                  <div className="ecom-sede-option-info">
                    <span className="ecom-sede-option-name">{sede.nombre}</span>
                    <span className="ecom-sede-option-desc">
                      {sede.ciudad || sede.slug}
                    </span>
                  </div>
                  <span className="ecom-sede-option-check">✓</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default SedeSelector;
