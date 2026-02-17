import React from "react";
import QRCode from "react-qr-code";
import "./ManifestInvoiceModal.css";

/**
 * Modal de Factura/Manifiesto de Salida
 * Muestra el certificado de auditoría con QR y detalle de productos
 */
const ManifestInvoiceModal = ({ manifestData, onClose }) => {
  if (!manifestData) return null;

  const handlePrint = () => {
    window.print();
  };

  const orders = Array.isArray(manifestData.orders)
    ? manifestData.orders
    : manifestData.items
      ? [
          {
            id: manifestData.order_id || manifestData.session_id,
            customer: manifestData.customer,
            items: manifestData.items,
          },
        ]
      : [];

  const getDensityClass = (count) => {
    if (count > 40) return "ultra-compact";
    if (count > 25) return "very-compact";
    if (count > 15) return "compact";
    return "";
  };

  return (
    <div className="invoice-mode-layout">
      {/* Botones de Acción (no imprimibles) */}
      <div className="invoice-actions no-print">
        <button className="invoice-btn-close" onClick={onClose}>
          ❌ CERRAR
        </button>
        <button className="invoice-btn-print" onClick={handlePrint}>
          🖨️ IMPRIMIR
        </button>
        {densityClass && (
          <div className="density-indicator">
            📦 {itemCount} productos - Modo{" "}
            {densityClass === "ultra-compact"
              ? "Ultra Compacto"
              : densityClass === "very-compact"
                ? "Muy Compacto"
                : "Compacto"}
          </div>
        )}
      </div>

      {/* Hoja de Factura */}
      {orders.map((order, orderIndex) => {
        const items = order.items || [];
        const itemCount = items.length;
        const densityClass = getDensityClass(itemCount);
        const orderId = order.order_id || order.id || manifestData.session_id;

        return (
          <div key={orderIndex} className={`invoice-sheet ${densityClass}`}>
            {/* Header */}
            <div className="inv-sheet-header">
              <div className="sheet-logo">MANIFIESTO SALIDA</div>
              <div className="sheet-info">
                <h2>Orden #{orderId?.toString().slice(0, 6)}</h2>
                <p>{new Date(manifestData.timestamp).toLocaleString()}</p>
              </div>
            </div>

            {/* Información del Cliente/Responsable */}
            <div className="sheet-customer">
              <strong>Responsable:</strong> {manifestData.picker} <br />
              {order.customer && (
                <>
                  <strong>Cliente:</strong> {order.customer} <br />
                </>
              )}
              <strong>Total Items:</strong> {itemCount}
            </div>

            {/* Sección QR Code */}
            <div className="master-code-section">
              <div className="qr-wrapper">
                <QRCode
                  value={JSON.stringify(
                    items.map((x) => [x.sku || x.name, x.qty || x.count || 0]),
                  )}
                  size={80}
                />
              </div>
              <div className="code-info">
                <h4>CERTIFICADO DIGITAL</h4>
                <p>Auditoría completada exitosamente.</p>
              </div>
            </div>

            {/* Tabla de Productos */}
            <table className="invoice-table">
              <thead>
                <tr>
                  <th className="col-qty">Cant</th>
                  <th className="col-item">Item</th>
                  <th className="col-barcode">Escáner</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    {/* Cantidad */}
                    <td className="cell-qty">{item.qty || item.count || 0}</td>

                    {/* Información del Producto */}
                    <td className="cell-item">
                      <div className="item-name">{item.name}</div>

                      {(item.type === "sustituido" || item.is_sub) && (
                        <div className="item-substitute-badge">
                          🔄 Artículo Sustituto
                        </div>
                      )}

                      <div className="item-sku">SKU: {item.sku || "N/A"}</div>
                    </td>

                    {/* Código de Barras */}
                    <td className="cell-barcode">
                      <div className="product-barcode-render">
                        {item.sku
                          ? `*${item.sku.toUpperCase()}*`
                          : `*${item.id}*`}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer */}
            <div className="sheet-footer">
              <div className="cut-line">
                - - - - - - FIN DEL DOCUMENTO - - - - - -
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ManifestInvoiceModal;
