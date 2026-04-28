const DOC_META_KEYS = [
  "_billing_document",
  "_billing_dni",
  "_billing_cedula",
  "_billing_nit",
  "billing_document",
  "cedula",
  "documento",
];

const COD_MODE_LABELS = {
  cash: "Efectivo",
  efectivo: "Efectivo",
  card: "Tarjeta",
  tarjeta: "Tarjeta",
  qr: "QR",
  datafono: "Datáfono",
  credito: "Crédito",
};

export function extractDocumento(orderOrMeta) {
  const meta = Array.isArray(orderOrMeta)
    ? orderOrMeta
    : orderOrMeta?.meta_data;
  if (!meta || !Array.isArray(meta)) return "";
  const found = meta.find((m) => DOC_META_KEYS.includes(m.key));
  return found?.value || "";
}

/**
 * Extrae el método de pago real desde _billing_cod_payment_mode.
 * Fallback a payment_method_title si no existe el meta.
 */
export function extractMetodoPago(orderOrMeta) {
  const meta = Array.isArray(orderOrMeta)
    ? orderOrMeta
    : orderOrMeta?.meta_data;
  if (meta && Array.isArray(meta)) {
    const codMode = meta.find((m) => m.key === "_billing_cod_payment_mode");
    if (codMode?.value) {
      const val = codMode.value.toString().toLowerCase();
      return COD_MODE_LABELS[val] || codMode.value;
    }
  }
  if (!Array.isArray(orderOrMeta) && orderOrMeta?.payment_method_title) {
    const title = orderOrMeta.payment_method_title.toString().toLowerCase();
    if (title === "card") return "Tarjeta";
    if (title === "cash") return "Efectivo";
    return orderOrMeta.payment_method_title;
  }
  return "";
}
