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