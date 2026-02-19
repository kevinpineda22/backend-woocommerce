import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../config/storage";
import "./ManifestSheet.css";

/**
 * Componente Reutilizable de Manifiesto de Salida
 *
 * @param {Object} props
 * @param {Object} props.order - Datos del pedido { id, customer, items }
 * @param {string} props.timestamp - Fecha/hora de emisión
 * @param {string} props.pickerName - Nombre del picker
 * @param {number} props.orderIndex - Índice del pedido (para keys)
 * @param {string} props.densityClass - Clase de densidad (opcional: compact, very-compact, ultra-compact)
 */
const ManifestSheet = ({
  order,
  timestamp,
  pickerName = "Personal WMS",
  orderIndex = 0,
  densityClass = "",
}) => {
  const items = order.items || [];
  const orderId = order.id;

  // Generar QR Value
  const qrValue = JSON.stringify(
    items.map((item) => [
      item.barcode || item.sku || item.name,
      item.qty || item.count || 1,
    ]),
  );

  return (
    <div className={`manifest-sheet ${densityClass}`.trim()}>
      {/* Header */}
      <div className="manifest-header">
        <div className="manifest-logo">
          <img
            src={getAssetUrl("logoMK.webp")}
            alt="Logo Merkahorro"
            className="manifest-logo-img"
          />
          <span className="manifest-title">MANIFIESTO DE SALIDA</span>
        </div>
        <div className="manifest-info">
          <h2>Orden #{orderId?.toString().slice(0, 6)}</h2>
          <p>{new Date(timestamp).toLocaleString()}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="manifest-customer">
        <div className="customer-field">
          <span className="label">Picker:</span>
          <span className="value">{pickerName}</span>
        </div>
        {order.customer && (
          <div className="customer-field">
            <span className="label">Cliente:</span>
            <span className="value">{order.customer}</span>
          </div>
        )}
      </div>

      {/* QR Code Section */}
      <div className="manifest-qr-section">
        <div className="qr-wrapper">
          <QRCode value={qrValue} size={100} />
        </div>
        <div className="qr-info">
          <h4>CERTIFICADO DE SALIDA</h4>
          <p>{items.length} productos verificados</p>
        </div>
      </div>

      {/* Products Table */}
      <table className="manifest-table">
        <thead>
          <tr>
            <th className="col-qty">Cant.</th>
            <th className="col-item">Producto</th>
            <th className="col-barcode">Código</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const barcode = item.barcode || item.sku || item.id;
            const itemName = item.name;
            const qty = item.qty || item.count || 1;
            const isSub = item.type === "sustituido" || item.is_sub;

            return (
              <tr key={idx}>
                {/* Cantidad */}
                <td className="cell-qty">{qty}</td>

                {/* Producto */}
                <td className="cell-item">
                  <div className="item-name">{itemName}</div>
                  {isSub && (
                    <div className="item-substitute-badge">🔄 SUSTITUTO</div>
                  )}
                  <div className="item-sku">REF: {item.sku || item.id}</div>
                </td>

                {/* Código de Barras */}
                <td className="cell-barcode">
                  <div className="product-barcode">
                    *{barcode.toString().toUpperCase()}*
                  </div>
                  <div className="barcode-number">{barcode.toString()}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ManifestSheet;
