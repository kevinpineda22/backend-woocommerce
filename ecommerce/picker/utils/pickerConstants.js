export const ORDER_COLORS = [
  { code: "A", color: "#3b82f6", bg: "#eff6ff" },
  { code: "B", color: "#f97316", bg: "#fff7ed" },
  { code: "C", color: "#8b5cf6", bg: "#f5f3ff" },
  { code: "D", color: "#10b981", bg: "#ecfdf5" },
  { code: "E", color: "#ec4899", bg: "#fdf2f8" },
];

export const getOrderStyle = (orderIndex) => {
  return ORDER_COLORS[orderIndex % ORDER_COLORS.length];
};

export const formatPrice = (amount) => {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
};

// --- Sufijos de unidad de medida para normalización de SKU ---
const UNIT_SUFFIXES = {
  LB: "-LB",
  LIBRA: "-LB",
  KL: "-KL",
  KILO: "-KL",
  KG: "-KL",
};

/**
 * Normaliza un código/SKU añadiendo el sufijo de unidad de medida si corresponde.
 * Evita duplicar sufijos ya presentes.
 */
export const normalizeSku = (code, unidad) => {
  const normalizedUnit = (unidad || "").toUpperCase();
  const suffix = UNIT_SUFFIXES[normalizedUnit];
  return suffix && !code.endsWith(suffix) ? code + suffix : code;
};

// País por defecto para enlaces WhatsApp
export const WHATSAPP_COUNTRY_CODE = "57";

// --- Utilidades para multipacks (P2, P6, P12...) ---
const MULTIPACK_LABELS = {
  2: "DÚO",
  3: "TRIPACK",
  4: "PACK x4",
  6: "SIXPACK",
  12: "DOCENA",
};

/**
 * Parsea una unidad de medida multipack (ej: "P6" → { isMultipack: true, qty: 6, label: "SIXPACK" }).
 */
export const parseMultipack = (unidad_medida) => {
  const uom = (unidad_medida || "").toUpperCase();
  const num = uom.startsWith("P") ? parseInt(uom.substring(1)) : NaN;
  if (isNaN(num)) return { isMultipack: false, qty: 0, label: "" };
  return {
    isMultipack: true,
    qty: num,
    label: MULTIPACK_LABELS[num] || `PACK x${num}`,
  };
};

/**
 * Devuelve la etiqueta legible para el badge de cantidad.
 */
export const getPresentationLabel = (unidad_medida) => {
  const uom = (unidad_medida || "").toUpperCase();
  if (!uom || uom === "UND" || uom === "UN") return "UN";
  if (uom === "KL" || uom === "KG") return "KILO";
  if (uom === "LB") return "LIBRA";
  if (uom === "500GR" || uom === "500G" || uom === "500GRS") return "500GR";
  const mp = parseMultipack(uom);
  if (mp.isMultipack) return mp.label;
  return uom;
};
