import React from "react";
import QRCode from "react-qr-code";
import { getAssetUrl } from "../../../config/storage";
import { calcularDigitoVerificador } from "../picker/modals/utils/gs1Utils";
import { extractMetodoPago } from "./extractDocumento";
import { isWeighableUnit, kgPerUnit, cantUnitSuffix } from "./weighableUnits";
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
  const metaData = order.meta_data || [];

  // Documento / Cédula del cliente (buscar en meta_data con múltiples keys posibles)
  const docKeys = [
    "_billing_document",
    "_billing_dni",
    "_billing_cedula",
    "_billing_nit",
    "billing_document",
    "cedula",
    "documento",
  ];
  const docMeta = metaData.find((m) => docKeys.includes(m.key));
  const customerDocument = docMeta?.value || "";

  // Dirección de facturación (billing) y envío (shipping)
  const billingAddress = [billing.address_1, billing.city, billing.state]
    .filter(Boolean)
    .join(", ");
  const shippingAddress = [shipping.address_1, shipping.city, shipping.state]
    .filter(Boolean)
    .join(", ");

  // Método de pago (usa _billing_cod_payment_mode → Efectivo/QR/Datáfono/Crédito)
  const metodoPago = extractMetodoPago(order);

  // Nombre del cliente
  const customerName =
    order.customer ||
    [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
    "Cliente";

  const [showFullDetails, setShowFullDetails] = React.useState(false);

  // Sistema de ventana de escaneo con contador regresivo
  // El QR arranca oculto; el cajero lo activa cuando el escáner está en mano
  const SCAN_WINDOW_SECONDS = 5;
  const qrStorageKey = `qr_used_${orderId}`;
  const [qrVisible, setQrVisible] = React.useState(false);
  const [countdown, setCountdown] = React.useState(null);
  const [everUsed, setEverUsed] = React.useState(() => {
    try {
      return localStorage.getItem(qrStorageKey) === "1";
    } catch {
      return false;
    }
  });
  const countdownRef = React.useRef(null);

  const startScanWindow = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setQrVisible(true);
    setCountdown(SCAN_WINDOW_SECONDS);
    let remaining = SCAN_WINDOW_SECONDS;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setQrVisible(false);
        setCountdown(null);
        setEverUsed(true);
        try {
          localStorage.setItem(qrStorageKey, "1");
        } catch {
          /* safari private mode */
        }
      }
    }, 1000);
  };

  React.useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

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
  // La lista de unidades vive en shared/weighableUnits.js (única fuente de verdad).
  const isWeighableProduct = isWeighableUnit;

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
          pesoKg = numericQty * kgPerUnit(item.unidad_medida);
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
    // Prioridad 3: Si el barcode ya tiene formato SKU+UM (ej: 185325P25), usarlo
    if (item.barcode && item.barcode !== "ADMIN_OVERRIDE") {
      const cleaned = item.barcode.toString().trim().replace(/\+$/, "");
      if (/^\d+[A-Z]+\d*$/i.test(cleaned)) {
        return cleaned;
      }
    }
    // Prioridad 4: Construir SKU+UM desde los datos del item (formato caja registradora)
    if (
      item.sku &&
      item.unidad_medida &&
      !isWeighableProduct(item.unidad_medida)
    ) {
      const numSku = (item.sku || "").match(/^(\d+)/)?.[1];
      const um = (item.unidad_medida || "").toUpperCase();
      if (numSku && um) {
        return `${numSku}${um}`;
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
  // Calcular totales dinámicamente (antes del QR para disponibilidad en todo el componente)
  const productItems = items.filter(
    (i) => !i.is_shipping_method && !i.is_removed,
  );
  const totalQty = productItems.reduce(
    (sum, item) => sum + (item.qty || item.count || 1),
    0,
  );
  // Subtotal de artículos: preferir line_total (lo efectivamente cobrado por Woo,
  // ya incluye promos y ajustes de peso) y caer a price*qty solo si no viene.
  const calculatedItemsTotal = productItems.reduce((sum, item) => {
    const qty = item.qty || item.count || 1;
    const unitFinal =
      parseFloat(item.line_total) || parseFloat(item.price) || 0;
    return sum + unitFinal * qty;
  }, 0);
  const shippingTotal = (order.shipping_lines || []).reduce(
    (sum, s) => sum + (parseFloat(s.total) || 0),
    0,
  );
  // Total del pedido: si Woo nos dio order.total, ESE es el real (incluye cupones,
  // fees, impuestos, ajustes). Solo usamos el calculado como fallback.
  const wooOrderTotal = parseFloat(order.total) || 0;
  const orderTotal =
    wooOrderTotal > 0
      ? wooOrderTotal
      : calculatedItemsTotal + shippingTotal || null;

  const omittedItems = [];

  const qrValue = items
    .flatMap((item) => {
      // Ítem virtual de método de despacho: solo la barra, sin prefijo qty*
      if (item.is_shipping_method) {
        return [item.barcode];
      }
      const qty = item.qty || item.count || 1;
      const unidad_medida = item.unidad_medida || "";
      const tieneVariaciones = item.tiene_variaciones || false;
      const isMP = isMultipack(unidad_medida);
      let code = stripMN(item.barcode || "");

      // Para productos NO pesables con SKU y UM: SIEMPRE usar formato SKU+UM (ej: "185325P25")
      // Este es el formato que la caja registradora reconoce y valida contra SIESA
      if (!isWeighableProduct(unidad_medida) && item.sku && unidad_medida) {
        const numSku = ((item.sku || "").match(/^(\d+)/) || [])[1] || "";
        const um = (unidad_medida || "").toUpperCase();
        if (numSku && um) {
          code = `${numSku}${um}`;
        }
      } else if ((isMP || tieneVariaciones) && item.sku) {
        code = cleanSku(item.sku);
      }

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
        /^\d{13,14}$/.test(cleanCodeGS1) && cleanCodeGS1.startsWith("2");

      if (isWeighableProduct(unidad_medida) || isAlreadyGS1_29) {
        if (isAlreadyGS1_29) {
          return [cleanCodeGS1];
        }

        if (numericSku) {
          const um = (unidad_medida || "KG").toUpperCase();
          let pesoKg = parseFloat(item.peso_total) || 0;
          if (!pesoKg || pesoKg <= 0 || isNaN(pesoKg)) {
            const numericQty = parseFloat(qty) || 0;
            pesoKg = numericQty * kgPerUnit(unidad_medida);
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

  // Estadísticas del QR generado
  const qrLineCount = qrValue.split("\r\n").filter(Boolean).length;
  const qrIsComplex = qrValue.length > 1000; // Umbral: ~70 productos avg
  const qrExceedsCapacity = qrValue.length > 1270; // Límite aprox. de QR v40 nivel Q

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
          <div className="manifest-customer-grid">
            <div className="manifest-customer-field">
              <span className="manifest-field-label">Cliente:</span>
              <span className="manifest-field-value">{customerName}</span>
            </div>
            {customerDocument && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Documento:</span>
                <span className="manifest-field-value">{customerDocument}</span>
              </div>
            )}
            {billing.phone && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Tel:</span>
                <span className="manifest-field-value">{billing.phone}</span>
              </div>
            )}
            {billing.email && (
              <div className="manifest-customer-field manifest-email-field">
                <span className="manifest-field-label">Email:</span>
                <span className="manifest-field-value">{billing.email}</span>
              </div>
            )}
            {metodoPago && (
              <div className="manifest-customer-field">
                <span className="manifest-field-label">Pago:</span>
                <span className="manifest-field-value">{metodoPago}</span>
              </div>
            )}
            <div className="manifest-customer-field">
              <span className="manifest-field-label">Picker:</span>
              <span className="manifest-field-value">{pickerName}</span>
            </div>

            {billing.company && (
              <div className="manifest-customer-field field-company">
                <span className="manifest-field-label">Empresa:</span>
                <span className="manifest-field-value">{billing.company}</span>
              </div>
            )}

            {billingAddress && (
              <div className="manifest-customer-field field-address">
                <span className="manifest-field-label">Dir. Facturación:</span>
                <span className="manifest-field-value">{billingAddress}</span>
              </div>
            )}
            {shippingAddress && shippingAddress !== billingAddress && (
              <div className="manifest-customer-field field-address">
                <span className="manifest-field-label">Dir. Envío:</span>
                <span className="manifest-field-value">{shippingAddress}</span>
              </div>
            )}
          </div>
          {order.customer_note && (
            <div className="manifest-customer-note">
              <span className="manifest-field-label">📝 NOTA:</span>
              <span className="manifest-field-value manifest-field-note">
                {order.customer_note}
              </span>
            </div>
          )}
        </div>

        {/* QR Code Section */}
        {!showFullDetails && (
          <div className="manifest-qr-section manifest-qr-only">
            {qrVisible ? (
              /* ---- Modo solo QR + timer activo: ventana de escaneo ---- */
              <>
                <div className="qr-countdown-timer">
                  <svg viewBox="0 0 50 50" className="qr-countdown-svg">
                    <circle
                      cx="25"
                      cy="25"
                      r="22"
                      className="qr-countdown-track"
                    />
                    <circle
                      cx="25"
                      cy="25"
                      r="22"
                      className="qr-countdown-progress"
                      style={{
                        strokeDashoffset: `${138.23 * (1 - countdown / SCAN_WINDOW_SECONDS)}`,
                      }}
                    />
                  </svg>
                  <span className="qr-countdown-num">{countdown}</span>
                </div>
                <div className="qr-wrapper">
                  <QRCode value={qrValue || " "} size={480} level="Q" />
                </div>
                <div className="qr-info">
                  <div className="qr-scan-once-warning">
                    ⚠️ ESCANEAR UNA SOLA VEZ
                  </div>
                  <p>
                    {productItems.length - omittedItems.length} de{" "}
                    {productItems.length} productos —{" "}
                    <strong>{qrLineCount} entradas en el QR</strong>
                  </p>
                  {qrExceedsCapacity && (
                    <div
                      style={{
                        marginTop: "6px",
                        padding: "6px 10px",
                        background: "#fff7ed",
                        border: "1px solid #f97316",
                        borderRadius: "4px",
                        color: "#c2410c",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      ⚠️ QR muy denso ({qrValue.length} bytes). Imprimir a
                      máxima calidad.
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ---- Modo solo QR + timer inactivo: botón para activar ventana ---- */
              <div className="qr-reveal-container">
                <h4 className="qr-reveal-title">CERTIFICADO DE SALIDA</h4>
                {everUsed && (
                  <div className="qr-ever-used-badge">
                    ✅ QR procesado — se ocultó automáticamente
                  </div>
                )}
                <p className="qr-reveal-info">
                  {productItems.length - omittedItems.length} productos —{" "}
                  {qrLineCount} entradas en el QR
                </p>
                <div className="qr-scan-instructions">
                  <div className="qr-scan-step">
                    <span className="qr-step-num">1</span>
                    <span>Apunte el escáner al código QR</span>
                  </div>
                  <div className="qr-scan-step">
                    <span className="qr-step-num">2</span>
                    <span>
                      Espere el <strong>PITIDO</strong> de confirmación
                    </span>
                  </div>
                  <div className="qr-scan-step">
                    <span
                      className="qr-step-num"
                      style={{ backgroundColor: "#ca8a04", color: "white" }}
                    >
                      3
                    </span>
                    <span>
                      <strong>
                        RECUERDA NO TOCAR LA PANTALLA HASTA QUE EL ESCÁNER
                        TERMINE LA ESCRITURA DE CÓDIGOS, O LA OPERACIÓN
                      </strong>
                    </span>
                  </div>
                  <div className="qr-scan-step qr-scan-step--critical">
                    <span className="qr-step-num qr-step-num--critical">4</span>
                    <span>
                      Al sonar el pitido →{" "}
                      <strong>ALEJE el QR de inmediato</strong>
                    </span>
                  </div>
                </div>
                {qrIsComplex && (
                  <div
                    style={{
                      padding: "6px 12px",
                      background: "#fefce8",
                      border: "1px solid #fbbf24",
                      borderRadius: "4px",
                      color: "#92400e",
                      fontSize: "0.85rem",
                      width: "100%",
                      maxWidth: "460px",
                    }}
                  >
                    Pedido grande — verificar que el escáner leyó {qrLineCount}{" "}
                    entradas en SIESA.
                  </div>
                )}
                {omittedItems.length > 0 && (
                  <div
                    style={{
                      padding: "6px 12px",
                      background: "#fef2f2",
                      border: "1px solid #fca5a5",
                      borderRadius: "4px",
                      color: "#b91c1c",
                      fontSize: "0.85rem",
                      textAlign: "left",
                      width: "100%",
                      maxWidth: "460px",
                    }}
                  >
                    <strong>Advertencia:</strong> {omittedItems.length}{" "}
                    producto(s) omitidos del QR:
                    <ul style={{ margin: "3px 0 0 16px", paddingLeft: 0 }}>
                      {omittedItems.map((item, idx) => (
                        <li key={idx}>
                          {item.name} {item.qty && `(x${item.qty})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  className="qr-reveal-btn no-print"
                  onClick={startScanWindow}
                >
                  {everUsed
                    ? "🔁 Volver a mostrar QR (5 seg)"
                    : "👁️ Mostrar QR para escanear (5 seg)"}
                </button>
                <p className="qr-reveal-hint">
                  Se ocultará automáticamente en 5 segundos
                </p>
              </div>
            )}
          </div>
        )}
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
                <th className="col-price">Precio</th>
                <th className="col-ref">Código</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = item.qty || item.count || 1;
                const isSub = item.type === "sustituido" || item.is_sub;

                // Fila especial para método de despacho
                if (item.is_shipping_method) {
                  const shipPrice = parseFloat(item.price) || 0;
                  return (
                    <tr key={idx} className="manifest-row-shipping">
                      <td className="cell-num"></td>
                      <td className="cell-qty">—</td>
                      <td className="cell-item">
                        <span className="item-name item-shipping-label">
                          {item.name}
                        </span>
                        <span className="item-shipping-badge">DESPACHO</span>
                      </td>
                      <td className="cell-price">
                        {shipPrice > 0
                          ? new Intl.NumberFormat("es-CO", {
                              style: "currency",
                              currency: "COP",
                              maximumFractionDigits: 0,
                            }).format(shipPrice)
                          : "—"}
                      </td>
                      <td className="cell-ref">{item.barcode}</td>
                    </tr>
                  );
                }

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
                        <td className="cell-item" colSpan={3}>
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
                            {cantUnitSuffix(item.unidad_medida, item.name)}
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
                      <td className="cell-price">
                        {(() => {
                          const fmt = (v) =>
                            new Intl.NumberFormat("es-CO", {
                              style: "currency",
                              currency: "COP",
                              maximumFractionDigits: 0,
                            }).format(v);

                          const pesoKg = parseFloat(item.peso_total) || 0;
                          const hasRealWeight =
                            isWeighableProduct(item.unidad_medida) &&
                            pesoKg > 0;

                          // unit values provistos por VistaAuditor y dashboardController
                          const unitSubtotal = parseFloat(item.subtotal) || 0;
                          const unitFinal =
                            parseFloat(item.line_total) ||
                            parseFloat(item.price) ||
                            0;

                          const lineFinal = unitFinal * qty;

                          // Detectar promoción: subtotal_unitario > total_unitario (con margen de 1 peso)
                          const hasPromo =
                            unitSubtotal > 0 &&
                            unitFinal > 0 &&
                            unitSubtotal - unitFinal > 1;

                          if (!unitFinal)
                            return <span className="manifest-no-price">—</span>;

                          return (
                            <div
                              className={`manifest-item-price${hasRealWeight ? " manifest-item-price--weighable" : ""}${hasPromo ? " manifest-item-price--promo" : ""}`}
                            >
                              {hasPromo && (
                                <span className="manifest-base-price">
                                  {fmt(Math.round(unitSubtotal))}
                                </span>
                              )}
                              <span className="manifest-unit-price">
                                {fmt(Math.round(unitFinal))}
                              </span>
                              {qty > 1 && (
                                <span className="manifest-line-total manifest-line-total--bold">
                                  = {fmt(Math.round(lineFinal))}
                                </span>
                              )}
                              {hasPromo && (
                                <span className="manifest-promo-badge">
                                  PROMO
                                </span>
                              )}
                              {hasRealWeight && (
                                <span className="manifest-weight-detail">
                                  {pesoKg.toFixed(3)} kg pesado
                                </span>
                              )}
                            </div>
                          );
                        })()}
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
              <span>Total:</span> {productItems.length} productos / {totalQty}{" "}
              unidades
            </div>
            {orderTotal > 0 && (
              <div className="manifest-footer-order-total">
                {shippingTotal > 0 && (
                  <div className="manifest-footer-subtotals">
                    <span>
                      Subtotal artículos:{" "}
                      {new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      }).format(calculatedItemsTotal)}
                    </span>
                    <span>
                      Envío:{" "}
                      {new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: "COP",
                        maximumFractionDigits: 0,
                      }).format(shippingTotal)}
                    </span>
                  </div>
                )}
                <span className="manifest-footer-grand-total">
                  Total del Pedido:{" "}
                  {new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  }).format(orderTotal)}
                </span>
              </div>
            )}
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
