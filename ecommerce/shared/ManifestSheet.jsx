import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../../config/storage";
import {
  checkSiesaBarcodes,
  convertItemsToBarcodes,
} from "../../../services/siesaService";
import { calcularDigitoVerificador } from "../picker/modals/utils/gs1Utils";
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

  const [correctedCodes, setCorrectedCodes] = React.useState({});
  const [itemToBarcodeMap, setItemToBarcodeMap] = React.useState({});
  const [showFullDetails, setShowFullDetails] = React.useState(true);

  React.useEffect(() => {
    // 1. Corregir códigos SIESA que falte el "+" (sólo para códigos presumiblemente códigos de barras)
    const barcodesToFix = items
      .map((item) => item.barcode || item.sku || item.name)
      .filter(
        (c) =>
          c &&
          c !== "N/A" &&
          c !== "ADMIN_OVERRIDE" &&
          c.length >= 8 &&
          c.length < 13,
      );

    if (barcodesToFix.length > 0) {
      checkSiesaBarcodes(barcodesToFix).then((map) => {
        if (map && Object.keys(map).length > 0) {
          setCorrectedCodes(map);
        }
      });
    }

    // 2. Convertir Items (4 a 7 caracteres numéricos) escaneados manualmente a su código de barras real
    const itemsToConvert = items
      .flatMap((item) => [item.barcode, item.sku])
      .filter((c) => c && typeof c === "string" && /^\d{1,7}$/.test(c.trim()));

    if (itemsToConvert.length > 0) {
      convertItemsToBarcodes(itemsToConvert).then((map) => {
        if (map && Object.keys(map).length > 0) {
          setItemToBarcodeMap(map);
        }
      });
    }
  }, [items]);

  // Helper: Limpiar SKU removiendo guiones
  const cleanSku = (sku) => {
    if (!sku) return "";
    return sku.toString().replace(/-/g, "");
  };

  // Helper: Validar si un código es un barcode real (8+ dígitos numéricos, opcionalmente con '+' al final)
  const isValidBarcode = (code) => {
    if (!code || code === "N/A" || code === "ADMIN_OVERRIDE") return false;
    const cleaned = code.toString().trim().replace(/\+$/, "");
    return /^\d+$/.test(cleaned) && cleaned.length >= 8;
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
      let code = item.barcode || "";
      if (itemToBarcodeMap[code]) code = itemToBarcodeMap[code];
      if (!isValidBarcode(code) && item.sku && itemToBarcodeMap[item.sku])
        code = itemToBarcodeMap[item.sku];
      if (correctedCodes[code]) code = correctedCodes[code];
      if ((isMP || tieneVariaciones) && item.sku) code = cleanSku(item.sku);
      if (!isValidBarcode(code) && !isMP && !tieneVariaciones) {
        omittedItems.push(item);
        return [];
      }
      // ✅ FRUVER/CARNES: Reconstruir SIEMPRE con prefijo "29"
      // Formato: 29 + item(tal cual) + 0(separador) + peso(5 dígitos) + checkDigit
      const cleanCodeGS1 = code.toString().replace(/\+$/, "");
      const numericSku = (item.sku || "").match(/^(\d+)/)?.[1];

      // Detectar si ya es GS1 válido con "29"
      const isAlreadyGS1_29 =
        /^\d{13,14}$/.test(cleanCodeGS1) && cleanCodeGS1.startsWith("29");

      // Detectar si el código es un código SIESA de fruver/pesable con prefijo "00"
      // Patrón: "00" + SKU + "0" + peso(5) + check(1) → empieza con "00" y contiene el SKU
      const isSiesaFruverCode =
        numericSku &&
        /^\d{12,14}$/.test(cleanCodeGS1) &&
        cleanCodeGS1.startsWith("00") &&
        cleanCodeGS1.includes(numericSku);

      // Aplica si: unidad pesable, O ya tiene "29", O es código SIESA con "00" que contiene el SKU
      if (isWeighableProduct(unidad_medida) || isAlreadyGS1_29 || isSiesaFruverCode) {
        // Si ya tiene prefijo "29" correcto, usarlo tal cual
        if (isAlreadyGS1_29) {
          return [cleanCodeGS1];
        }

        // Reconstruir el código con prefijo "29" usando el SKU del producto
        if (numericSku) {
          // Extraer el peso del código existente
          // El SKU aparece en el código, después viene separador "0" + peso(5 dígitos)
          let pesoStr = "00000";
          const skuIdx = cleanCodeGS1.indexOf(numericSku);
          if (skuIdx >= 0) {
            const afterSku = cleanCodeGS1.substring(skuIdx + numericSku.length);
            // afterSku: "0" + peso(5) + [check(1)]
            if (afterSku.length >= 6) {
              pesoStr = afterSku.substring(1, 6);
            }
          }

          // Construir: "29" + item(tal cual, sin padding) + "0" + peso(5) + checkDigit
          const codigoSinCheck = "29" + numericSku + "0" + pesoStr.padStart(5, "0");
          const checkDigit = calcularDigitoVerificador(codigoSinCheck);
          if (checkDigit) {
            return [`${codigoSinCheck}${checkDigit}`];
          }
        }

        // Fallback: código tal cual
        return [cleanCodeGS1];
      }
      if (tieneVariaciones && item.sku) {
        return Array(qty).fill(`1*${cleanSku(item.sku)}`);
      }
      return [`${qty}*${code}`];
    })
    .filter(Boolean)
    .join("\r\n");

  return (
    <div className={`manifest-sheet ${densityClass}`.trim()}>
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
            background: showFullDetails ? "#f1f5f9" : "#3b82f6",
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
            background: showFullDetails ? "#3b82f6" : "#f1f5f9",
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
          <QRCode value={qrValue} size={showFullDetails ? 100 : 250} />
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
                marginTop: "10px",
                padding: "8px 12px",
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                color: "#b91c1c",
                fontSize: "0.80rem",
                textAlign: "left",
              }}
            >
              <strong>⚠️ Advertencia:</strong> Se omitieron{" "}
              {omittedItems.length} producto(s) del QR por no contar con un
              código de barras válido en el sistema.
            </div>
          )}
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
                <th className="col-ref">Item</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = item.qty || item.count || 1;
                const isSub = item.type === "sustituido" || item.is_sub;

                // En la tabla SÍ mostramos el item (SKU/ID) como referencia visual
                const getValidCode = () => {
                  if (item.barcode && item.barcode !== "ADMIN_OVERRIDE")
                    return item.barcode;
                  if (item.sku && item.sku !== "ADMIN_OVERRIDE")
                    return cleanSku(item.sku); // Sin guiones
                  if (item.id && item.id !== "ADMIN_OVERRIDE") return item.id;
                  return "";
                };

                const rawCode = getValidCode();

                const displayCode =
                  rawCode && correctedCodes[rawCode]
                    ? correctedCodes[rawCode]
                    : rawCode;

                return (
                  <React.Fragment key={idx}>
                    {/* Si es sustituto, mostramos primero la fila del original tachado */}
                    {isSub && item.original_name && (
                      <tr className="manifest-row-original-replaced">
                        <td className="cell-num"></td>
                        <td className="cell-qty">
                          <span className="original-qty-badge">−{qty}</span>
                        </td>
                        <td className="cell-item" colSpan={2}>
                          <div className="original-replaced-info">
                            <span className="original-icon">✕</span>
                            <span className="original-name-strikethrough">
                              {item.original_name}
                            </span>
                            <span className="original-replaced-label">
                              PRODUCTO ORIGINAL RETIRADO
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Fila del producto (normal o sustituto) */}
                    <tr className={isSub ? "manifest-row-substitute" : ""}>
                      <td className="cell-num">{idx + 1}</td>
                      <td className="cell-qty">{qty}</td>
                      <td className="cell-item">
                        <span className="item-name">{item.name}</span>
                        {isSub && (
                          <span className="item-substitute-badge">
                            ↳ SUSTITUTO
                          </span>
                        )}
                      </td>
                      <td className="cell-ref">
                        {displayCode}
                        {rawCode && correctedCodes[rawCode] && (
                          <span
                            className="manifest-code-corrected-dot"
                            title="Código ajustado (+)"
                          >
                            ●
                          </span>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Resumen de sustituciones */}
          {items.some((i) => i.is_sub || i.type === "sustituido") && (
            <div className="manifest-substitutions-summary">
              <div className="substitutions-summary-title">
                ⚠ RESUMEN DE SUSTITUCIONES
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

          {/* Grid de Códigos de Barras — layout horizontal compacto */}
          <div className="manifest-barcodes-section">
            <div className="manifest-barcodes-title">CÓDIGOS DE BARRAS</div>
            <div className="manifest-barcodes-grid">
              {items.map((item, idx) => {
                // Mostrar item (SKU/ID) en la grilla visual
                const getValidCode = () => {
                  if (item.barcode && item.barcode !== "ADMIN_OVERRIDE")
                    return item.barcode;
                  if (item.sku && item.sku !== "ADMIN_OVERRIDE")
                    return cleanSku(item.sku); // Sin guiones
                  if (item.id && item.id !== "ADMIN_OVERRIDE") return item.id;
                  return "";
                };

                const barcode = getValidCode();
                const qty = item.qty || item.count || 1;

                return (
                  <div key={idx} className="manifest-barcode-cell">
                    <div className="manifest-barcode-font">
                      *{barcode.toString().toUpperCase()}*
                    </div>
                    <div className="manifest-barcode-label">
                      <span className="manifest-barcode-num">#{idx + 1}</span>
                      <span
                        className="manifest-barcode-text"
                        title={barcode.toString()}
                      >
                        {barcode.toString()}
                      </span>
                      <span className="manifest-barcode-qty">×{qty}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ManifestSheet;
