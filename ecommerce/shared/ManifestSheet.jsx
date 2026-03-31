import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../../config/storage";
import { calcularDigitoVerificador } from "../picker/modals/utils/gs1Utils";
import "./ManifestSheet.css";

/**
 * Componente Reutilizable de Manifiesto de Salida
 * Diseñado para caber en UNA sola hoja por pedido.
 *
 * Layout:  Header → Cliente → QR → Tabla compacta
 */
const ManifestSheet = ({
  order,
  timestamp,
  pickerName = "Personal WMS",
  orderIndex = 0,
  densityClass = "",
  sedeName = null,
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

  const [showFullDetails, setShowFullDetails] = React.useState(false);

  // Helper: Limpiar SKU removiendo guiones
  const cleanSku = (sku) => {
    if (!sku) return "";
    return sku.toString().replace(/-/g, "");
  };

  // Helper: Eliminar prefijo M/N de códigos — la caja registradora no los acepta
  const stripMN = (code) => {
    if (!code || typeof code !== "string") return code;
    const upper = code.trim().toUpperCase();
    if (upper.startsWith("M") || upper.startsWith("N"))
      return code.substring(1);
    return code;
  };

  // Helper: Validar si un código es aceptable para la caja
  const isValidBarcode = (code) => {
    if (!code || code === "N/A" || code === "ADMIN_OVERRIDE") return false;
    return code.toString().trim().length > 0;
  };

  // Helper: Detectar si un producto es multipack (presentación especial)
  const isMultipack = (unidad_medida) => {
    if (!unidad_medida) return false;
    const uom = unidad_medida.toUpperCase();
    // P6, P25, KL, LB, etc. (no "UN" = unidad)
    return /^[A-Z]+\d+$/.test(uom) && uom !== "UN";
  };

  // Helper: Detectar si un producto es fruver o carnes (usan peso, no cantidad)
  // Se basa en unidad de medida pesable, NUNCA en el nombre del producto.
  const WEIGHABLE_UNITS = ["kl", "kg", "kilo", "lb", "libra"];

  const isWeighableProduct = (unidadMedida) => {
    if (!unidadMedida) return false;
    return WEIGHABLE_UNITS.includes(unidadMedida.toLowerCase());
  };

  // Helper: obtener código válido para mostrar en la tabla
  const getDisplayCode = (item) => {
    const qty = item.qty || item.count || 1;

    // Prioridad 1: Si el barcode ya es un GS1 "29" válido, usarlo tal cual
    if (item.barcode && item.barcode !== "ADMIN_OVERRIDE") {
      const cleaned = item.barcode.toString().trim().replace(/\+$/, "");
      if (/^\d{13,14}$/.test(cleaned) && cleaned.startsWith("29")) {
        return cleaned;
      }
    }
    // Prioridad 2: Para pesables sin GS1 pre-construido, construir desde SKU + peso
    if (isWeighableProduct(item.unidad_medida)) {
      const numSku = (item.sku || "").match(/^(\d+)/)?.[1];
      if (numSku) {
        const um = (item.unidad_medida || "KG").toUpperCase();
        let pesoKg = parseFloat(item.peso_total) || 0;
        if (!pesoKg || pesoKg <= 0 || isNaN(pesoKg)) {
          const numericQty = parseFloat(qty) || 0;
          pesoKg =
            um === "LB" || um === "LIBRA" ? numericQty * 0.4536 : numericQty;
        }
        if (!isNaN(pesoKg) && pesoKg > 0) {
          const pesoGramos = Math.round(pesoKg * 1000);
          const pesoStr = pesoGramos.toString().padStart(5, "0");
          const skuPadded =
            numSku.length < 4 ? numSku.padStart(4, "0") : numSku;
          const separator = skuPadded.length <= 4 ? "0" : "";
          const sinCheck = "29" + skuPadded + separator + pesoStr;
          const chk = calcularDigitoVerificador(sinCheck);
          if (chk) return `${sinCheck}${chk}`;
        }
      }
    }
    if (item.barcode && item.barcode !== "ADMIN_OVERRIDE")
      return stripMN(item.barcode);
    if (item.sku && item.sku !== "ADMIN_OVERRIDE") return cleanSku(item.sku);
    if (item.id && item.id !== "ADMIN_OVERRIDE") return item.id;
    return "";
  };

  // Generar QR Value: Cantidad * Código de Barras (separado por salto de línea \r\n para simular ENTER)
  // REGLAS:
  // 1. Fruver/Carnes: SOLO código (sin multiplicador)
  // 2. Productos CON variaciones: 1*sku repetido qty veces (salto de línea entre cada uno)
  // 3. Productos SIN variaciones: qty*sku (una sola línea)
  const omittedItems = [];

  const qrValue = items
    .flatMap((item) => {
      const qty = item.qty || item.count || 1;
      const unidad_medida = item.unidad_medida || "";
      const tieneVariaciones = item.tiene_variaciones || false;
      const isMP = isMultipack(unidad_medida);
      let code = stripMN(item.barcode || "");
      if ((isMP || tieneVariaciones) && item.sku) code = cleanSku(item.sku);
      // Fallback: si no hay barcode válido, construir desde SKU + unidad_medida (ej: "1039UND")
      // ⚠️ SKU de variaciones WooCommerce puede ser "1039-UND" → extraer solo la parte numérica
      if (!isValidBarcode(code) && item.sku) {
        const numSku = ((item.sku || "").match(/^(\d+)/) || [])[1] || "";
        const um = (unidad_medida || "").toUpperCase();
        if (numSku && um) {
          code = `${numSku}${um}`;
        } else if (numSku) {
          code = numSku;
        }
      }
      if (
        !isValidBarcode(code) &&
        !isMP &&
        !tieneVariaciones &&
        !isWeighableProduct(unidad_medida)
      ) {
        omittedItems.push(item);
        return [];
      }
      // FRUVER/CARNES: Construir código GS1 de peso variable — SIEMPRE EAN-13
      const cleanCodeGS1 = code.toString().replace(/\+$/, "");
      const numericSku = (item.sku || "").match(/^(\d+)/)?.[1];
      const isAlreadyGS1_29 =
        /^\d{13,14}$/.test(cleanCodeGS1) && cleanCodeGS1.startsWith("29");

      if (isWeighableProduct(unidad_medida) || isAlreadyGS1_29) {
        if (isAlreadyGS1_29) {
          return [cleanCodeGS1];
        }

        if (numericSku) {
          const um = (unidad_medida || "KG").toUpperCase();
          let pesoKg = parseFloat(item.peso_total) || 0;
          if (!pesoKg || pesoKg <= 0 || isNaN(pesoKg)) {
            const numericQty = parseFloat(qty) || 0;
            pesoKg =
              um === "LB" || um === "LIBRA" ? numericQty * 0.4536 : numericQty;
          }

          if (isNaN(pesoKg) || pesoKg <= 0) {
            omittedItems.push(item);
            return [];
          }

          const pesoGramos = Math.round(pesoKg * 1000);
          const pesoStr = pesoGramos.toString().padStart(5, "0");
          const skuPadded =
            numericSku.length < 4 ? numericSku.padStart(4, "0") : numericSku;

          const separator = skuPadded.length <= 4 ? "0" : "";
          const codigoSinCheck = "29" + skuPadded + separator + pesoStr;
          const checkDigit = calcularDigitoVerificador(codigoSinCheck);
          if (checkDigit) {
            return [`${codigoSinCheck}${checkDigit}`];
          }
        }

        if (/^\d{8,14}$/.test(cleanCodeGS1)) {
          return [cleanCodeGS1];
        }
        omittedItems.push(item);
        return [];
      }
      if (tieneVariaciones && item.sku) {
        return Array(qty).fill(`1*${cleanSku(item.sku)}`);
      }
      return [`${qty}*${code}`];
    })
    .filter(Boolean)
    .join("\r\n");

  // Calcular total de items
  const totalQty = items.reduce(
    (sum, item) => sum + (item.qty || item.count || 1),
    0,
  );

  return (
    <div
      className={`manifest-sheet ${densityClass} ${!showFullDetails ? "qr-only-mode" : ""}`.trim()}
    >
      {/* Toggle View Mode (Only visible on screen, not in print) */}
      <div
        className="manifest-controls no-print"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "15px",
          gap: "10px",
        }}
      >
        <button
          style={{
            padding: "8px 16px",
            background: showFullDetails ? "#f1f5f9" : "#1e293b",
            color: showFullDetails ? "#475569" : "white",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
          onClick={() => setShowFullDetails(false)}
        >
          Solo Resumen y QR
        </button>
        <button
          style={{
            padding: "8px 16px",
            background: showFullDetails ? "#1e293b" : "#f1f5f9",
            color: showFullDetails ? "white" : "#475569",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
          onClick={() => setShowFullDetails(true)}
        >
          Manifiesto Completo
        </button>
      </div>

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
          <h2>Pedido #{orderId?.toString().slice(0, 6)}</h2>
          <p>{new Date(timestamp).toLocaleString()}</p>
        </div>
      </div>

      {/* Meta Info Wrapper: Customer Info on Left, QR on Right */}
      <div
        className={`manifest-meta-wrapper ${!showFullDetails ? "manifest-meta-qr-only" : ""}`}
      >
        {/* Customer & Shipping Info */}
        <div className="manifest-customer">
          <div className="manifest-customer-row">
            <div className="manifest-customer-field">
              <span className="manifest-field-label">Cliente:</span>
              <span className="manifest-field-value">{customerName}</span>
            </div>
            {billing.phone && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Tel:</span>
                <span className="manifest-field-value">{billing.phone}</span>
              </div>
            )}
            {billing.email && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Email:</span>
                <span className="manifest-field-value">{billing.email}</span>
              </div>
            )}
          </div>
          <div className="manifest-customer-row">
            {fullAddress && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Dirección:</span>
                <span className="manifest-field-value">{fullAddress}</span>
              </div>
            )}
            <div className="manifest-customer-field">
              <span className="manifest-field-label">Picker:</span>
              <span className="manifest-field-value">{pickerName}</span>
            </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div
          className={`manifest-qr-section ${!showFullDetails ? "manifest-qr-only" : ""}`}
        >
          <div className="qr-wrapper">
            <QRCode value={qrValue} size={showFullDetails ? 100 : 480} />
          </div>
          <div className="qr-info">
            <h4>CERTIFICADO DE SALIDA</h4>
            <p>
              {items.length - omittedItems.length} de {items.length} productos
              incluidos en el QR
            </p>
            {omittedItems.length > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "6px 10px",
                  background: "#fef2f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "4px",
                  color: "#b91c1c",
                  fontSize: "0.75rem",
                  textAlign: "left",
                }}
              >
                <strong>Advertencia:</strong> {omittedItems.length} producto(s)
                omitidos del QR:
                <ul style={{ margin: "3px 0 0 16px", paddingLeft: 0 }}>
                  {omittedItems.map((item, idx) => (
                    <li key={idx}>
                      {item.name} {item.qty && `(x${item.qty})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFullDetails && (
        <>
          {/* Products Table */}
          <table className="manifest-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-qty">Cant.</th>
                <th className="col-item">Producto</th>
                <th className="col-ref">Código</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = item.qty || item.count || 1;
                const isSub = item.type === "sustituido" || item.is_sub;

                const displayCode = getDisplayCode(item);

                return (
                  <React.Fragment key={idx}>
                    {/* Si es sustituto, mostramos primero la fila del original tachado */}
                    {isSub && item.original_name && (
                      <tr className="manifest-row-original-replaced">
                        <td className="cell-num"></td>
                        <td className="cell-qty">
                          <span className="original-qty-badge">-{qty}</span>
                        </td>
                        <td className="cell-item" colSpan={2}>
                          <div className="original-replaced-info">
                            <span className="original-name-strikethrough">
                              {item.original_name}
                            </span>
                            <span className="original-replaced-label">
                              RETIRADO
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Fila del producto (normal o sustituto) */}
                    <tr className={isSub ? "manifest-row-substitute" : ""}>
                      <td className="cell-num">{idx + 1}</td>
                      <td className="cell-qty">
                        {qty}
                        {isWeighableProduct(item.unidad_medida) && (
                          <span
                            style={{
                              fontSize: "0.7em",
                              marginLeft: 2,
                              color: "#64748b",
                            }}
                          >
                            {(item.unidad_medida || "KG").toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="cell-item">
                        <span className="item-name">{item.name}</span>
                        {isSub && (
                          <span className="item-substitute-badge">
                            SUSTITUTO
                          </span>
                        )}
                      </td>
                      <td className="cell-ref">{displayCode}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Footer con total */}
          <div className="manifest-footer">
            <div className="manifest-footer-total">
              <span>Total:</span> {items.length} productos / {totalQty} unidades
            </div>
          </div>

          {/* Resumen de sustituciones */}
          {items.some((i) => i.is_sub || i.type === "sustituido") && (
            <div className="manifest-substitutions-summary">
              <div className="substitutions-summary-title">
                RESUMEN DE SUSTITUCIONES
              </div>
              <div className="substitutions-summary-list">
                {items
                  .filter((i) => i.is_sub || i.type === "sustituido")
                  .map((item, idx) => (
                    <div key={idx} className="substitution-summary-row">
                      <span className="sub-summary-original">
                        {item.original_name || "Producto original"}
                      </span>
                      <span className="sub-summary-arrow">→</span>
                      <span className="sub-summary-new">{item.name}</span>
                      <span className="sub-summary-qty">
                        ×{item.qty || item.count || 1}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ManifestSheet;
