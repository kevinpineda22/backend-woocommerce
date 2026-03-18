import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../../config/storage";
import {
  checkSiesaBarcodes,
  convertItemsToBarcodes,
} from "../../../services/siesaService";
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
  const isFruverOrMeat = (itemName) => {
    if (!itemName) return false;
    const name = itemName.toLowerCase();
    // Fruver (pasillo 14)
    const fruverKeywords = [
      "fruta", "verdura", "hortaliza", "fruver",
      "tomate", "cebolla", "papa", "lechuga", "zanahoria",
    ];
    // Carnes (pasillo 13)
    const meatKeywords = [
      "carne", "carnes", "pescado", "pollo", "jamón",
      "embutido", "embutidos", "mariscos", "res y cerdo",
      "carnicería", "filete", "costilla", "pechuga",
    ];
    const allKeywords = [...fruverKeywords, ...meatKeywords];
    return allKeywords.some((keyword) => name.includes(keyword));
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
      const itemName = item.name || item.original_name || "";
      const unidad_medida = item.unidad_medida || "";
      const tieneVariaciones = item.tiene_variaciones || false;

      // Detectar si es multipack (presentación especial como P6, P25, KL, LB)
      const isMP = isMultipack(unidad_medida);

      // START
      let code = item.barcode || "";

      // 1. Si lo que tenemos como código es de hecho un ITEM (<= 7 dígitos), intentamos buscar su barcode
      if (itemToBarcodeMap[code]) {
        code = itemToBarcodeMap[code];
      }

      // 2. Si todavía no es un código de barras válido, intentamos usar el SKU convertido a barcode
      if (!isValidBarcode(code) && item.sku && itemToBarcodeMap[item.sku]) {
        code = itemToBarcodeMap[item.sku];
      }

      // 3. Aplicar corrección '+' de Siesa si aplica
      if (correctedCodes[code]) {
        code = correctedCodes[code];
      }

      // Para productos con variaciones, usar SKU en lugar del código escaneado
      if ((isMP || tieneVariaciones) && item.sku) {
        code = cleanSku(item.sku);
      }

      // Solo incluir si finalmente resultó ser válido
      if (!isValidBarcode(code) && !isMP && !tieneVariaciones) {
        omittedItems.push(item);
        return [];
      }

      // ✅ FRUVER Y CARNES: SOLO código sin multiplicador
      // También detectar por código GS1 de peso variable (empieza con "2", 13-14 dígitos)
      const cleanCodeForGS1 = code.toString().replace(/\+$/, "");
      const isGS1VariableWeight =
        /^\d{13,14}$/.test(cleanCodeForGS1) && cleanCodeForGS1.startsWith("2");

      if (isFruverOrMeat(itemName) || isGS1VariableWeight) {
        return [code];
      }

      // ✅ PRODUCTOS CON VARIACIONES: Repetir qty líneas de "1*sku"
      // (cada línea es una presentación individual para la caja registradora)
      if (tieneVariaciones && item.sku) {
        return Array(qty).fill(`1*${cleanSku(item.sku)}`);
      }

      // ✅ PRODUCTOS SIN VARIACIONES: qty*sku (una sola línea)
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
