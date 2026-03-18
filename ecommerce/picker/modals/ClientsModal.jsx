import React from "react";
import { FaTimes, FaPhone, FaWhatsapp } from "react-icons/fa";
import "../Modals.css";

const ClientsModal = ({ isOpen, orders, onClose }) => {
  if (!isOpen || !orders) return null;
  return (
    <div className="ec-modal-overlay high-z">
      <div className="ec-modal-content">
        <div className="ec-modal-header ec-modal-header--dark">
          <h3>Directorio Clientes</h3>
          <button onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        <div className="ec-modal-body--scroll">
          {orders.map((order) => (
            <div key={order.id} className="clients-order-row">
              <div className="clients-order-info">
                <div className="clients-order-name">{order.customer}</div>
                <div className="clients-order-id">Pedido #{order.id}</div>
              </div>
              <div className="clients-order-actions">
                {order.phone && (
                  <>
                    <a
                      href={`tel:${order.phone}`}
                      className="ec-contact-btn phone"
                    >
                      <FaPhone />
                    </a>
                    <a
                      href={`https://wa.me/57${order.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ec-contact-btn whatsapp"
                    >
                      <FaWhatsapp />
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="ec-modal-footer">
          <button
            className="ec-modal-cancel ec-modal-cancel--full"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientsModal;
