/**
 * Reporte de precios WooCommerce para pedido 79609
 * Muestra todos los productos con sus precios y calcula cuáles tienen mayor impacto en el total
 */
const path = require("path");
const session = require(path.join(__dirname, "supabase-session-79609.json"));
const { calcLineCharge } = require(
  path.join(__dirname, "..", "..", "utils", "manifestPricing.js"),
);

const ORDER_ID = 79609;
const order = session.datos_salida.orders.find(
  (o) => String(o.id) === String(ORDER_ID),
);
const items = order.items.filter((i) => !i.is_shipping_method && !i.is_removed);

console.log("═".repeat(100));
console.log("  REPORTE DE PRECIOS WooCommerce — Pedido #" + ORDER_ID);
console.log("═".repeat(100));
console.log("");
console.log("ITEMS (ordenados por precio unitario de mayor a menor):");
console.log("─".repeat(100));

// Ordenar por precio unitario descendente
const sortedItems = [...items].sort((a, b) => {
  const priceA = parseFloat(a.price) || parseFloat(a.line_total) || 0;
  const priceB = parseFloat(b.price) || parseFloat(b.line_total) || 0;
  return priceB - priceA;
});

sortedItems.forEach((item, idx) => {
  const sku = item.sku_final || item.sku || "?";
  const um = (item.unidad_medida || "UND").toUpperCase();
  const qty = item.qty || item.count || 1;
  const peso = parseFloat(item.peso_total) || 0;
  const price = parseFloat(item.price) || parseFloat(item.line_total) || 0;
  const lineTotal = calcLineCharge(item);

  const isPesable = peso > 0 && ["KL", "LB", "500GR"].includes(um);
  const flag = isPesable ? "⚖️" : "📦";

  // Para pesables mostrar precio por unidad de peso
  let priceDisplay = "";
  if (isPesable) {
    if (um === "KL") {
      priceDisplay = `$${price.toLocaleString()}/kg`;
    } else if (um === "LB") {
      priceDisplay = `$${price.toLocaleString()}/500g`;
    }
  } else {
    priceDisplay = `$${price.toLocaleString()}/und`;
  }

  console.log(`${flag} #${String(idx + 1).padStart(2)} ${item.name}`);
  console.log(
    `    SKU: ${sku.padEnd(15)} | Precio Woo: ${priceDisplay.padEnd(15)} | Qty: ${String(qty).padStart(5)} ${um.padEnd(5)} ${peso > 0 ? `(${peso}kg)` : ""}`,
  );
  console.log(`    Total línea: $${lineTotal.toLocaleString()}`);
  console.log("");
});

const itemsTotal = items.reduce((sum, item) => sum + calcLineCharge(item), 0);
const shipping = (order.shipping_lines || []).reduce(
  (s, sh) => s + (parseFloat(sh.total) || 0),
  0,
);
const grandTotal = itemsTotal + shipping;

console.log("═".repeat(100));
console.log("RESUMEN:");
console.log(`  Subtotal items:    $${itemsTotal.toLocaleString()}`);
console.log(`  Shipping:          $${shipping.toLocaleString()}`);
console.log(`  TOTAL PEDIDO:      $${grandTotal.toLocaleString()}`);
console.log("═".repeat(100));
console.log("");
console.log("🔍 PRODUCTOS CON MAYOR IMPACTO EN EL TOTAL (top 10):");
console.log("─".repeat(100));

const topItems = [...items]
  .map((item) => ({
    name: item.name,
    sku: item.sku_final || item.sku,
    total: calcLineCharge(item),
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 10);

topItems.forEach((item, idx) => {
  console.log(
    `  ${idx + 1}. $${item.total.toLocaleString().padStart(7)} — ${item.name} (${item.sku})`,
  );
});

console.log("");
console.log("═".repeat(100));
console.log("📋 Siguiente paso:");
console.log(
  "  1. Completar receipt-79609-template.js con los datos de la factura física",
);
console.log("  2. Ejecutar: node tools/diag-79608/compare-79609-vs-pos.js");
console.log("═".repeat(100));
