/**
 * Comparador preciso: Factura POS vs WooCommerce - Pedido 79609
 */
const path = require("path");
const session = require(
  path.join(__dirname, "diag-79608", "supabase-session-79609.json"),
);
const receipt = require(
  path.join(__dirname, "diag-79608", "receipt-79609-data.js"),
);
const { calcLineCharge } = require(
  path.join(__dirname, "..", "utils", "manifestPricing.js"),
);

const ORDER_ID = 79609;
const order = session.datos_salida.orders.find(
  (o) => String(o.id) === String(ORDER_ID),
);
const wmsItems = order.items.filter(
  (i) => !i.is_shipping_method && !i.is_removed,
);

console.log("═".repeat(100));
console.log(
  "  ANÁLISIS FINAL: FACTURA POS vs WOOCOMMERCE — Pedido #" + ORDER_ID,
);
console.log("═".repeat(100));
console.log("");

// Crear mapa de items WMS por SKU
const wmsMap = new Map();
wmsItems.forEach((item) => {
  const sku = String(item.sku_final || item.sku || "").replace(/[^0-9]/g, "");
  if (sku) wmsMap.set(sku, item);
});

const discrepancies = [];
let totalPosItems = 0;
let totalWmsItems = 0;
let matchCount = 0;
let mismatchCount = 0;

console.log("COMPARACIÓN DETALLADA:");
console.log("─".repeat(100));

receipt.lines.forEach((posLine) => {
  const posSku = String(posLine.sku).replace(/[^0-9]/g, "");
  const wmsItem = wmsMap.get(posSku);

  if (!wmsItem) {
    console.log(
      `⚠️  ${posLine.name} (SKU: ${posLine.sku}) - NO ENCONTRADO EN WMS`,
    );
    totalPosItems += posLine.net;
    return;
  }

  const wmsCharge = calcLineCharge(wmsItem);
  const delta = wmsCharge - posLine.net;

  totalPosItems += posLine.net;
  totalWmsItems += wmsCharge;

  if (Math.abs(delta) > 1) {
    mismatchCount++;
    const isPesable = parseFloat(wmsItem.peso_total || 0) > 0;
    const um = (wmsItem.unidad_medida || "").toUpperCase();

    // Calcular precios unitarios
    let posUnitPrice, wmsUnitPrice, priceUnit;
    if (isPesable && posLine.qty) {
      if (um === "KL") {
        posUnitPrice = Math.round(posLine.net / posLine.qty);
        wmsUnitPrice = parseFloat(wmsItem.price);
        priceUnit = "/kg";
      } else if (um === "LB") {
        posUnitPrice = Math.round(posLine.net / posLine.qty / 2);
        wmsUnitPrice = parseFloat(wmsItem.price);
        priceUnit = "/500g";
      } else {
        posUnitPrice = posLine.unit_price;
        wmsUnitPrice = parseFloat(wmsItem.price);
        priceUnit = "";
      }
    } else {
      posUnitPrice = posLine.unit_price;
      wmsUnitPrice = parseFloat(wmsItem.price);
      priceUnit = "/und";
    }

    const priceDelta = wmsUnitPrice - posUnitPrice;

    console.log(`\n${isPesable ? "⚖️" : "📦"} ${posLine.name}`);
    console.log(`   SKU: ${posLine.sku} | Qty: ${posLine.qty} ${um}`);
    console.log(
      `   POS:  $${posUnitPrice.toLocaleString()}${priceUnit} → Total: $${posLine.net.toLocaleString()}`,
    );
    console.log(
      `   Woo:  $${wmsUnitPrice.toLocaleString()}${priceUnit} → Total: $${wmsCharge.toLocaleString()}`,
    );
    console.log(
      `   Δ Precio: ${priceDelta > 0 ? "+" : ""}$${priceDelta.toLocaleString()}${priceUnit} | Δ Total: ${delta > 0 ? "+" : ""}$${Math.round(delta).toLocaleString()}`,
    );

    discrepancies.push({
      name: posLine.name,
      sku: posLine.sku,
      posPrice: posUnitPrice,
      wmsPrice: wmsUnitPrice,
      priceDelta,
      totalDelta: delta,
      unit: priceUnit,
    });
  } else {
    matchCount++;
  }
});

console.log("\n" + "═".repeat(100));
console.log("RESUMEN:");
console.log("═".repeat(100));
console.log(`  Items coincidentes:        ${matchCount}`);
console.log(`  Items con diferencia:      ${mismatchCount}`);
console.log("");
console.log(`  Total POS (items):         $${totalPosItems.toLocaleString()}`);
console.log(`  Total Woo (items):         $${totalWmsItems.toLocaleString()}`);
console.log(
  `  Diferencia items:          ${totalWmsItems - totalPosItems > 0 ? "+" : ""}$${(totalWmsItems - totalPosItems).toLocaleString()}`,
);
console.log("");
console.log(
  `  Factura POS real:          $${receipt.receipt_total.toLocaleString()}`,
);
console.log(
  `  Woo items + shipping:      $${(totalWmsItems + receipt.domicilio).toLocaleString()}`,
);
console.log(
  `  Diferencia TOTAL:          ${totalWmsItems + receipt.domicilio - receipt.receipt_total > 0 ? "+" : ""}$${(totalWmsItems + receipt.domicilio - receipt.receipt_total).toLocaleString()}`,
);

if (discrepancies.length > 0) {
  console.log("\n" + "═".repeat(100));
  console.log("PRODUCTOS CON DIFERENCIAS DE PRECIO (ordenados por impacto):");
  console.log("═".repeat(100));

  discrepancies
    .sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
    .forEach((item, idx) => {
      const symbol = item.totalDelta > 0 ? "🔴" : "🟢";
      console.log(`\n${symbol} ${idx + 1}. ${item.name} (${item.sku})`);
      console.log(
        `   POS: $${item.posPrice.toLocaleString()}${item.unit}  →  Woo: $${item.wmsPrice.toLocaleString()}${item.unit}`,
      );
      console.log(
        `   Δ Precio: ${item.priceDelta > 0 ? "+" : ""}$${item.priceDelta.toLocaleString()}${item.unit}`,
      );
      console.log(
        `   Impacto: ${item.totalDelta > 0 ? "+" : ""}$${Math.round(item.totalDelta).toLocaleString()} (Woo ${item.totalDelta > 0 ? "MÁS CARO" : "MÁS BARATO"})`,
      );
    });

  const totalImpact = discrepancies.reduce((sum, d) => sum + d.totalDelta, 0);
  console.log("\n" + "─".repeat(100));
  console.log(
    `IMPACTO TOTAL DE DIFERENCIAS: ${totalImpact > 0 ? "+" : ""}$${Math.round(totalImpact).toLocaleString()}`,
  );

  console.log("\n" + "═".repeat(100));
  console.log("💡 ACCIÓN RECOMENDADA:");
  console.log("═".repeat(100));
  console.log("\nSincronizar precios entre WooCommerce y POS/SIESA:");

  const toIncrease = discrepancies
    .filter((d) => d.totalDelta > 0)
    .sort((a, b) => b.totalDelta - a.totalDelta);
  const toDecrease = discrepancies
    .filter((d) => d.totalDelta < 0)
    .sort((a, b) => a.totalDelta - b.totalDelta);

  if (toIncrease.length > 0) {
    console.log(
      "\n🔴 Productos MÁS CAROS en Woo (bajar precio en Woo o subir en POS):",
    );
    toIncrease.forEach((d) => {
      console.log(
        `   - ${d.name}: Woo $${d.wmsPrice.toLocaleString()}${d.unit} → POS $${d.posPrice.toLocaleString()}${d.unit} (impacto: +$${Math.round(d.totalDelta).toLocaleString()})`,
      );
    });
  }

  if (toDecrease.length > 0) {
    console.log(
      "\n🟢 Productos MÁS BARATOS en Woo (subir precio en Woo o bajar en POS):",
    );
    toDecrease.forEach((d) => {
      console.log(
        `   - ${d.name}: Woo $${d.wmsPrice.toLocaleString()}${d.unit} → POS $${d.posPrice.toLocaleString()}${d.unit} (impacto: $${Math.round(d.totalDelta).toLocaleString()})`,
      );
    });
  }
} else {
  console.log(
    "\n✅ ¡Perfecto! Todos los productos tienen precios idénticos entre WooCommerce y POS.",
  );
}

console.log("\n" + "═".repeat(100));
