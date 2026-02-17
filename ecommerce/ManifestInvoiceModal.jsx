import React from "react";
import ManifestSheet from "./ManifestSheet";
import "./ManifestInvoiceModal.css";

/**
 * Modal de Factura/Manifiesto de Salida
 * Muestra el certificado de auditoría con QR y detalle de productos
 */
const ManifestInvoiceModal = ({ manifestData, onClose }) => {
  if (!manifestData) return null;

  const [selectedOrderIndex, setSelectedOrderIndex] = React.useState(0);

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

  const currentOrder = orders[selectedOrderIndex];
  const itemCount = currentOrder?.items?.length || 0;
  const densityClass = getDensityClass(itemCount);

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

      {/* Selector de Pedidos (si hay múltiples) */}
      {orders.length > 1 && (
        <div className="order-selector no-print">
          <div className="order-selector-label">Seleccionar Pedido:</div>
          <div className="order-selector-buttons">
            {orders.map((order, idx) => (
              <button
                key={idx}
                className={`order-selector-btn ${idx === selectedOrderIndex ? "active" : ""}`}
                onClick={() => setSelectedOrderIndex(idx)}
              >
                #{order.id?.toString().slice(0, 6) || `Pedido ${idx + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hoja de Factura */}
      {currentOrder &&
        (() => {
          const items = currentOrder.items || [];
          const orderId =
            currentOrder.order_id || currentOrder.id || manifestData.session_id;

          // Normalizar items para ManifestSheet
          const normalizedItems = items.map((item) => ({
            id: item.id || item.sku,
            name: item.name,
            sku: item.sku || item.id,
            barcode: item.barcode || item.sku || item.id, // ✅ Usa barcode de SIESA
            qty: item.qty || item.count || 0,
            count: item.count,
            type: item.type,
            is_sub: item.type === "sustituido" || item.is_sub,
          }));

          return (
            <ManifestSheet
              key={selectedOrderIndex}
              order={{
                id: orderId,
                customer: currentOrder.customer,
                items: normalizedItems,
              }}
              timestamp={manifestData.timestamp}
              pickerName={manifestData.picker || "Sistema WMS"}
              orderIndex={selectedOrderIndex}
              densityClass={densityClass}
            />
          );
        })()}
    </div>
  );
};

export default ManifestInvoiceModal;
