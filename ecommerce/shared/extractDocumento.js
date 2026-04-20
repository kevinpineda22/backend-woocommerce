const DOC_META_KEYS = [
  "_billing_document",
  "_billing_dni",
  "_billing_cedula",
  "_billing_nit",
  "billing_document",
  "cedula",
  "documento",
];

export function extractDocumento(orderOrMeta) {
  const meta = Array.isArray(orderOrMeta)
    ? orderOrMeta
    : orderOrMeta?.meta_data;
  if (!meta || !Array.isArray(meta)) return "";
  const found = meta.find((m) => DOC_META_KEYS.includes(m.key));
  return found?.value || "";
}
