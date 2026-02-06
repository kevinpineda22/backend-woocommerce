import React from "react";
import { FaUser, FaEnvelope, FaCircle, FaTimes } from "react-icons/fa";
import "./PedidosAdmin.css"; // Usaremos el mismo archivo CSS global para mantener coherencia

const AssignPickerModal = ({ isOpen, pickers, onClose, onConfirm }) => {
  if (!isOpen) return null;

  // Ordenamos la lista: Los "disponibles" aparecen primero
  const sortedPickers = [...pickers].sort((a, b) => {
    if (a.estado_picker === 'disponible' && b.estado_picker !== 'disponible') return -1;
    if (a.estado_picker !== 'disponible' && b.estado_picker === 'disponible') return 1;
    return 0;
  });

  return (
    <div className="pedidos-modal-overlay high-z">
      <div className="pedidos-modal-content assign-modal">
        {/* HEADER DEL MODAL */}
        <div className="pedidos-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FaUser size={20} />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Asignar Picker</h2>
          </div>
          <button className="pedidos-modal-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* CUERPO DEL MODAL */}
        <div className="pedidos-modal-body" style={{ background: '#f8fafc', padding: 20 }}>
          <p style={{ marginBottom: 15, color: '#64748b', fontSize: '0.9rem' }}>
            Selecciona un colaborador para asignar los pedidos.
          </p>

          <div className="apm-list-container">
            {sortedPickers.map((picker) => {
              const isBusy = picker.estado_picker !== 'disponible';
              
              return (
                <div 
                  key={picker.id} 
                  className={`apm-picker-card ${isBusy ? 'busy' : 'available'}`}
                  onClick={() => !isBusy && onConfirm(picker)}
                >
                  {/* AVATAR (INICIAL) */}
                  <div className="apm-avatar">
                    {picker.nombre_completo.charAt(0).toUpperCase()}
                  </div>
                  
                  {/* INFO COMPLETA (NOMBRE + EMAIL) */}
                  <div className="apm-info">
                    <div className="apm-name">{picker.nombre_completo}</div>
                    <div className="apm-email">
                      <FaEnvelope size={10} style={{ marginRight: 5 }} /> 
                      {picker.email}
                    </div>
                  </div>

                  {/* BADGE DE ESTADO */}
                  <div className={`apm-status-badge ${isBusy ? 'busy' : 'available'}`}>
                    <FaCircle size={8} />
                    {isBusy ? "OCUPADO" : "LIBRE"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* FOOTER SIMPLE */}
        <div style={{ padding: 15, borderTop: '1px solid #e2e8f0', textAlign:'right', background:'white' }}>
            <button className="pedidos-btn-clear" onClick={onClose}>Cancelar Operación</button>
        </div>
      </div>
    </div>
  );
};

export default AssignPickerModal;