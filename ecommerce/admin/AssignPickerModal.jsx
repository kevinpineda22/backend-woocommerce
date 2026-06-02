import React from "react";
import {
  FaUser,
  FaEnvelope,
  FaTimes,
  FaSearch,
  FaUserClock,
  FaStoreAlt,
  FaSpinner,
} from "react-icons/fa";
import "./PedidosAdmin.css";
import "./AssignPickerModal.css";

const AssignPickerModal = ({
  isOpen,
  pickers,
  onClose,
  onConfirm,
  isAssigning,
  selectedOrdersCount = 0,
}) => {
  if (!isOpen) return null;

  // Excluimos pickers inactivos del flujo de asignación: si están desactivados,
  // no deben distraer al admin que está asignando pedidos. Para reactivarlos
  // se usa la pantalla de Gestión de Pickers.
  const pickersActivos = pickers.filter(
    (p) => p.estado_picker !== "inactivo",
  );

  // Ordenamiento: disponibles primero, luego ocupados, finalmente por nombre.
  const sortedPickers = [...pickersActivos].sort((a, b) => {
    if (a.estado_picker === "disponible" && b.estado_picker !== "disponible")
      return -1;
    if (a.estado_picker !== "disponible" && b.estado_picker === "disponible")
      return 1;
    return a.nombre_completo.localeCompare(b.nombre_completo);
  });

  return (
    <div className="pedidos-modal-overlay high-z" onClick={onClose}>
      <div
        className="pedidos-modal-content compact animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="pa-modal-header-custom">
          <div className="pa-modal-header-left">
            <div className="apm-header-icon">
              <FaUserClock size={24} />
            </div>
            <div>
              <h2 className="pa-modal-id">Asignar Picker</h2>
              <span className="pa-modal-date">
                Asignando {selectedOrdersCount} pedido{selectedOrdersCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button className="pa-close-btn-white" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* BODY */}
        <div
          className="pa-modal-body-custom"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div className="apm-search-bar">
            <FaSearch color="#94a3b8" />
            <span className="apm-search-bar-label">
              Lista de colaboradores ({pickersActivos.length})
            </span>
          </div>

          <div
            className="apm-list-container"
            style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {sortedPickers.map((picker) => {
              const isBusy = picker.estado_picker !== "disponible";
              const isDisabled = isBusy || isAssigning;

              return (
                <div
                  key={picker.id}
                  className={`apm-picker-card ${isBusy ? "busy" : "available"} ${isAssigning ? "disabled" : ""}`}
                  onClick={() => !isDisabled && onConfirm(picker)}
                >
                  {/* AVATAR */}
                  <div className="apm-avatar-wrapper">
                    <div className="apm-avatar">
                      {picker.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                    {/* Indicador de estado flotante */}
                    <div
                      className={`apm-status-dot ${isBusy ? "busy" : "online"}`}
                    ></div>
                  </div>

                  {/* INFO */}
                  <div className="apm-info">
                    <div className="apm-name">{picker.nombre_completo}</div>
                    <div className="apm-email">
                      <FaEnvelope size={10} className="apm-email-icon" />
                      {picker.email}
                    </div>
                    {picker.wc_sedes?.nombre && (
                      <div className="apm-picker-sede-tag">
                        <FaStoreAlt size={9} /> {picker.wc_sedes.nombre}
                      </div>
                    )}
                  </div>

                  {/* BADGE DE ACCIÓN */}
                  <div className="apm-action">
                    {isBusy ? (
                      <span className="apm-badge busy">OCUPADO</span>
                    ) : isAssigning ? (
                      <span className="apm-badge loading">
                        <FaSpinner className="ec-spin" /> ASIGNANDO
                      </span>
                    ) : (
                      <span className="apm-badge available">ASIGNAR</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* FOOTER */}
          <div className="pa-modal-footer-custom">
            <button
              className="pa-btn-secondary apm-footer-cancel"
              onClick={onClose}
              disabled={isAssigning}
            >
              Cancelar Operación
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignPickerModal;
