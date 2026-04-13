// Cruza Woo line_items contra snapshot items usando variation_id/product_id
// El snapshot item.id tiene formato "<prodId>-<orderId>" donde prodId es variation_id si existe, si no product_id
const fs = require("fs");
const woo = JSON.parse(fs.readFileSync("tools/_debug_order_77668.json", "utf8"));
const datos = JSON.parse(
  fs.readFileSync("tools/_debug_session_77668_datos_salida.json", "utf8"),
);

const snap = datos.orders[0].items;
// Mapa por real_prod_id (variation_id o product_id)
const snapByProdId = {};
snap.forEach((s) => {
  const prodId = (s.id || "").split("-")[0];
  if (!snapByProdId[prodId]) snapByProdId[prodId] = [];
  snapByProdId[prodId].push(s);
});

console.log("===== CRUCE POR VARIATION_ID / PRODUCT_ID =====\n");
let wooSubtotalTotal = 0;
let missingSubtotal = 0;
let qtyMismatchCount = 0;

woo.line_items.forEach((w) => {
  const key = String(w.variation_id || w.product_id);
  const snapMatches = snapByProdId[key] || [];
  const snapQty = snapMatches.reduce((acc, s) => acc + (s.qty || 0), 0);
  const subtotal = parseFloat(w.total || 0);
  wooSubtotalTotal += subtotal;

  if (snapQty !== w.quantity) {
    qtyMismatchCount++;
    const perUnit = subtotal / w.quantity;
    const missing = (w.quantity - snapQty) * perUnit;
    missingSubtotal += missing;
    console.log(
      `⚠️  ${String(w.sku).padEnd(12)}  woo_qty=${w.quantity}  snap_qty=${snapQty}  precio=${w.price}  subtotal=${subtotal}  dif$=${missing}  "${(w.name || "").slice(0, 40)}"`,
    );
  }
});

console.log("\n===== PESOS DECLARADOS WOO vs QR =====\n");
woo.line_items.forEach((w) => {
  const pesoMeta = w.meta_data?.find((m) => m.key === "Peso Real Facturado");
  if (!pesoMeta) return;
  const um =
    w.meta_data?.find((m) => m.key === "pa_unidad-de-medida-aproximado")?.value ||
    "";
  const wooKg = parseFloat((pesoMeta.value || "").replace(/[^\d.]/g, "")) || 0;
  const key = String(w.variation_id || w.product_id);
  const snapItem = (snapByProdId[key] || [])[0];
  if (!snapItem) return;

  // Decodificar el peso desde el GS1 "29..."
  const bc = (snapItem.barcode || "").toString();
  let qrKg = "?";
  if (/^\d{13,14}$/.test(bc) && bc.startsWith("2")) {
    // Intentar extraer los 5 últimos chars antes del check digit (últimos 5 digits pre-check)
    const pesoStr = bc.slice(-6, -1); // 5 dígitos del peso
    qrKg = parseInt(pesoStr, 10) / 1000;
  }
  // Fallback cuando QR reconstruye: usaría qty*0.4536 para lb o qty para kl
  let fallbackKg = null;
  if (snapItem.peso_total > 0) fallbackKg = snapItem.peso_total;
  else {
    const nq = parseFloat(snapItem.qty) || 0;
    fallbackKg =
      (um || "").toLowerCase() === "lb" ? nq * 0.4536 : nq;
  }

  console.log(
    `${String(w.sku).padEnd(12)}  woo_kg=${wooKg.toString().padEnd(6)}  qr_bc_kg=${String(qrKg).padEnd(6)}  snap.peso_total=${snapItem.peso_total}  snap.qty=${snapItem.qty}  fallback_si_no_hubiera_bc=${fallbackKg.toFixed(3)}  precio_woo=${w.price}  total_woo=${w.total}  "${(w.name || "").slice(0, 35)}"`,
  );
});

console.log("\n===== DIFERENCIAS DE QTY =====");
console.log("Items con qty distinta:", qtyMismatchCount);
console.log("$ que 'faltan' en snapshot (según Woo):", Math.round(missingSubtotal));
console.log("Subtotal Woo total (lines):", Math.round(wooSubtotalTotal));
