import React from "react";
import { FaUser, FaEnvelope, FaTimes, FaSearch, FaUserClock } from "react-icons/fa";
import "./PedidosAdmin.css";

const AssignPickerModal = ({ isOpen, pickers, onClose, onConfirm }) => {
  if (!isOpen) return null;

  // 1. Lógica de Ordenamiento: Disponibles primero, luego por nombre
  const sortedPickers = [...pickers].sort((a, b) => {
    // Primero estado: disponible gana
    if (a.estado_picker === 'disponible' && b.estado_picker !== 'disponible') return -1;
    if (a.estado_picker !== 'disponible' && b.estado_picker === 'disponible') return 1;
    // Si empate en estado, por nombre
    return a.nombre_completo.localeCompare(b.nombre_completo);
  });

  return (
    <div className="pedidos-modal-overlay high-z" onClick={onClose}>
      {/* Añadimos la clase 'compact' para que este modal sea más angosto que el de pedidos */}
      <div className="pedidos-modal-content compact animate-fade-in" onClick={(e) => e.stopPropagation()}>
        
        {/* HEADER */}
        <div className="pa-modal-header-custom">
          <div className="pa-modal-header-left">
             <div className="apm-header-icon">
                <FaUserClock size={24} />
             </div>
             <div>
                <h2 className="pa-modal-id">Asignar Picker</h2>
                <span className="pa-modal-date">Selecciona un colaborador disponible</span>
             </div>
          </div>
          <button className="pa-close-btn-white" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* BODY */}
        <div className="pa-modal-body-custom">
          {/* Barra de búsqueda decorativa (puedes hacerla funcional si tienes muchos pickers) */}
          <div className="apm-search-bar">
             <FaSearch color="#94a3b8"/>
             <span style={{color: '#94a3b8', fontSize: '0.9rem'}}>Lista de colaboradores ({pickers.length})</span>
          </div>

          <div className="apm-list-container">
            {sortedPickers.map((picker) => {
              const isBusy = picker.estado_picker !== 'disponible';
              
              return (
                <div 
                  key={picker.id} 
                  className={`apm-picker-card ${isBusy ? 'busy' : 'available'}`}
                  onClick={() => !isBusy && onConfirm(picker)}
                >
                  {/* AVATAR */}
                  <div className="apm-avatar-wrapper">
                    <div className="apm-avatar">
                      {picker.nombre_completo.charAt(0).toUpperCase()}
                    </div>
                    {/* Indicador de estado flotante */}
                    <div className={`apm-status-dot ${isBusy ? 'busy' : 'online'}`}></div>
                  </div>
                  
                  {/* INFO */}
                  <div className="apm-info">
                    <div className="apm-name">{picker.nombre_completo}</div>
                    <div className="apm-email">
                       <FaEnvelope size={10} style={{marginRight:5}}/> 
                       {picker.email}
                    </div>
                  </div>

                  {/* BADGE DE ACCIÓN */}
                  <div className="apm-action">
                    {isBusy ? (
                        <span className="apm-badge busy">OCUPADO</span>
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
             <button className="pa-btn-secondary" onClick={onClose} style={{width:'100%'}}>
                Cancelar Operación
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignPickerModal;