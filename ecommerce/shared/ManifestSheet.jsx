import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../../config/storage";
import { checkSiesaBarcodes } from "../../services/siesaService";
import "./ManifestSheet.css";

/**
 * Componente Reutilizable de Manifiesto de Salida
 * Diseñado para caber en UNA sola hoja por pedido.
 *
 * Layout:  Header → Cliente → QR → Tabla compacta → Grid de Barcodes
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
  const billing = order.billing || {};
  const shipping = order.shipping || {};

  // Dirección de envío (usa shipping, fallback a billing)
  const addr = shipping.address_1 || billing.address_1 || "";
  const city = shipping.city || billing.city || "";
  const state = shipping.state || billing.state || "";
  const fullAddress = [addr, city, state].filter(Boolean).join(", ");

  // Nombre del cliente
  const customerName =
    order.customer ||
    [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
    "Cliente";

  const [correctedCodes, setCorrectedCodes] = React.useState({});

  React.useEffect(() => {
    const codes = items
      .map((item) => item.barcode || item.sku || item.name)
      .filter((c) => c && c !== "N/A");

    if (codes.length > 0) {
      checkSiesaBarcodes(codes).then((map) => {
        if (map && Object.keys(map).length > 0) {
          setCorrectedCodes(map);
        }
      });
    }
  }, [items]);

  // Generar QR Value: Cantidad * Código (separado por salto de línea \r\n para simular ENTER)
  const qrValue = items
    .map((item) => {
      const qty = item.qty || item.count || 1;
      let code = item.barcode || item.sku || item.name || "N/A";

      // Aplicar corrección de Siesa (si existe)
      if (correctedCodes[code]) {
        code = correctedCodes[code];
      }

      return `${qty}*${code}`;
    })
    .join("\r\n");

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

      {/* Customer & Shipping Info */}
      <div className="manifest-customer">
        <div className="customer-row">
          <div className="customer-field">
            <span className="label">Cliente:</span>
            <span className="value">{customerName}</span>
          </div>
          {billing.phone && (
            <div className="customer-field">
              <span className="label">Tel:</span>
              <span className="value">{billing.phone}</span>
            </div>
          )}
          {billing.email && (
            <div className="customer-field">
              <span className="label">Email:</span>
              <span className="value">{billing.email}</span>
            </div>
          )}
        </div>
        <div className="customer-row">
          {fullAddress && (
            <div className="customer-field">
              <span className="label">Dirección:</span>
              <span className="value">{fullAddress}</span>
            </div>
          )}
          <div className="customer-field">
            <span className="label">Picker:</span>
            <span className="value">{pickerName}</span>
          </div>
        </div>
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

      {/* Products Table — SIN columna de barcode para ahorrar espacio */}
      <table className="manifest-table">
        <thead>
          <tr>
            <th className="col-num">#</th>
            <th className="col-qty">Cant.</th>
            <th className="col-item">Producto</th>
            <th className="col-ref">Item</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const qty = item.qty || item.count || 1;
            const isSub = item.type === "sustituido" || item.is_sub;

            return (
              <tr key={idx}>
                <td className="cell-num">{idx + 1}</td>
                <td className="cell-qty">{qty}</td>
                <td className="cell-item">
                  <span className="item-name">{item.name}</span>
                  {isSub && (
                    <span className="item-substitute-badge">🔄 SUST.</span>
                  )}
                </td>
                <td className="cell-ref">{item.sku || item.id}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Grid de Códigos de Barras — layout horizontal compacto */}
      <div className="manifest-barcodes-section">
        <div className="manifest-barcodes-title">CÓDIGOS DE BARRAS</div>
        <div className="manifest-barcodes-grid">
          {items.map((item, idx) => {
            const barcode = item.barcode || item.sku || item.id;
            const qty = item.qty || item.count || 1;
            return (
              <div key={idx} className="manifest-barcode-cell">
                <div className="manifest-barcode-font">
                  *{barcode.toString().toUpperCase()}*
                </div>
                <div className="manifest-barcode-label">
                  <span className="manifest-barcode-num">#{idx + 1}</span>
                  {barcode.toString()}{" "}
                  <span className="manifest-barcode-qty">×{qty}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ManifestSheet;
