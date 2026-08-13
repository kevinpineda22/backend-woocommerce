// Fuente única de verdad para interpretar el pago de un pedido de WooCommerce.
//
// ⚠️ Este archivo está duplicado en `utils/paymentMethods.js` (CommonJS) y debe
// mantenerse en sync. `utils/paymentMethods.test.js` falla si divergen.
//
// En WooCommerce hay DOS niveles de información de pago y confundirlos es la
// causa del bug que motivó este módulo:
//
//   1. La PASARELA (`payment_method` / `payment_method_title`): lo que el
//      cliente eligió en el checkout. Hoy: "Contra entrega" (`cod`) y
//      "Crédito" (`cheque`).
//   2. El SUB-MODO de contra-entrega (`_billing_cod_payment_mode`): con qué
//      va a pagar en la puerta — efectivo, QR, datáfono.
//
// El sub-modo SOLO tiene sentido dentro de contra-entrega. Cuando la pasarela
// es otra, Woo escribe el literal `na` ("no aplica"). Leer el sub-modo primero
// —como se hacía antes— hacía que un pedido a crédito mostrara "na" en el
// manifiesto de entrega, en un pedido que justamente NO se debe cobrar.

// Pasarelas con etiqueta propia. El slug `cheque` es la pasarela nativa
// "Cheque Payments" de Woo, reutilizada y renombrada a "Crédito" para clientes
// con cupo verificado en un punto físico. El slug NO es `credito`.
export const CREDITO_GATEWAY = "cheque";

// "Cliente Crédito", nunca "Crédito" a secas: un cajero que lee "Crédito"
// puede entender "tarjeta de crédito" y salir a cobrar un pedido que no se
// cobra. La etiqueta tiene que decir de qué crédito se habla.
export const CREDITO_LABEL = "Cliente Crédito";

export const GATEWAY_LABELS = {
  [CREDITO_GATEWAY]: CREDITO_LABEL,
};

// Sub-modos de contra-entrega.
export const COD_MODE_LABELS = {
  cash: "Efectivo",
  efectivo: "Efectivo",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  qr: "QR",
  datafono: "Datáfono",
  credito: CREDITO_LABEL,
};

// Valores de `_billing_cod_payment_mode` que significan "sin dato". Woo escribe
// `na` cuando la pasarela elegida no es contra-entrega.
export const COD_MODE_EMPTY = ["na", "n/a", "no_aplica", "noaplica", "none"];

export const COD_MODE_META_KEY = "_billing_cod_payment_mode";

// Títulos legacy que Woo llegó a exponer sin traducir.
const TITLE_LABELS = {
  card: "Tarjeta",
  cash: "Efectivo",
};

function metaOf(orderOrMeta) {
  if (Array.isArray(orderOrMeta)) return orderOrMeta;
  return Array.isArray(orderOrMeta?.meta_data) ? orderOrMeta.meta_data : [];
}

// Devuelve el sub-modo de contra-entrega, o null si no aplica / no existe.
export function getCodPaymentMode(orderOrMeta) {
  const found = metaOf(orderOrMeta).find((m) => m.key === COD_MODE_META_KEY);
  if (!found?.value) return null;
  const value = found.value.toString().trim().toLowerCase();
  if (!value || COD_MODE_EMPTY.includes(value)) return null;
  return value;
}

// ¿Es un pedido a crédito (cliente con cupo)? Se decide por la pasarela, que es
// el dato que Woo controla, no por el título editable desde el admin.
export function isCreditoOrder(order) {
  if (Array.isArray(order) || !order) return false;
  const gateway = (order.payment_method || "").toString().trim().toLowerCase();
  return gateway === CREDITO_GATEWAY;
}

// Etiqueta legible del pago, en orden de precedencia:
//   1. Pasarela con etiqueta propia  → "Crédito"
//   2. Sub-modo de contra-entrega    → "Efectivo" / "QR" / "Datáfono"
//   3. Título que reporte Woo        → "Contra entrega"
export function resolvePaymentLabel(orderOrMeta) {
  const isOrder = !Array.isArray(orderOrMeta) && !!orderOrMeta;

  if (isOrder) {
    const gateway = (orderOrMeta.payment_method || "")
      .toString()
      .trim()
      .toLowerCase();
    if (GATEWAY_LABELS[gateway]) return GATEWAY_LABELS[gateway];
  }

  const codMode = getCodPaymentMode(orderOrMeta);
  // Un sub-modo desconocido se muestra crudo a propósito: es más informativo
  // que "Contra entrega", que perdería el detalle de con qué se paga.
  if (codMode) return COD_MODE_LABELS[codMode] || codMode;

  if (isOrder && orderOrMeta.payment_method_title) {
    const title = orderOrMeta.payment_method_title.toString();
    return TITLE_LABELS[title.trim().toLowerCase()] || title;
  }

  return "";
}
