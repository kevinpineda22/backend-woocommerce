/**
 * Comparador final: Factura POS vs Manifiesto WMS (corregido)
 * Identifica productos con diferencias de precio entre catálogos
 */
const path = require("path");
const session = require(path.join(__dirname, "supabase-session-79609.json"));
const { calcLineCharge } = require(
  path.join(__dirname, "..", "..", "utils", "manifestPricing.js"),
);

// Importar datos de la factura física
let receipt;
try {
  receipt = require(path.join(__dirname, "receipt-79609-template.js"));
} catch (err) {
  console.error("❌ Error: No se pudo cargar receipt-79609-template.js");
  console.error(
    "   Asegúrate de haber completado el template con los datos de la factura física.",
  );
  process.exit(1);
}

const ORDER_ID = 79609;
const order = session.datos_salida.orders.find(
  (o) => String(o.id) === String(ORDER_ID),
);
const wmsItems = order.items.filter(
  (i) => !i.is_shipping_method && !i.is_removed,
);

console.log("═".repeat(100));
console.log(
  "  COMPARACIÓN: FACTURA POS vs MANIFIESTO WMS — Pedido #" + ORDER_ID,
);
console.log("═".repeat(100));
console.log("");

// Normalizar SKU para matching
function normalizeSku(sku) {
  if (!sku) return "";
  return String(sku)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

// Crear mapa de items WMS por SKU normalizado
const wmsMap = new Map();
wmsItems.forEach((item) => {
  const sku = normalizeSku(item.sku_final || item.sku);
  if (sku) wmsMap.set(sku, item);
});

// Comparar línea por línea
const discrepancies = [];
let totalPosSoloItems = 0;
let totalWmsSoloItems = 0;

console.log("COMPARACIÓN POR PRODUCTO:");
console.log("─".repeat(100));

receipt.lines.forEach((posLine, idx) => {
  const posSku = normalizeSku(posLine.sku);
  const wmsItem = wmsMap.get(posSku);

  if (!wmsItem) {
    console.log(
      `⚠️  #${idx + 1} NO ENCONTRADO EN WMS: ${posLine.name} (SKU: ${posLine.sku})`,
    );
    console.log(`    Factura POS: $${posLine.net.toLocaleString()}`);
    console.log("");
    totalPosSoloItems += posLine.net;
    return;
  }

  const wmsCharge = calcLineCharge(wmsItem);
  const delta = wmsCharge - posLine.net;

  totalPosSoloItems += posLine.net;
  totalWmsSoloItems += wmsCharge;

  // Solo mostrar si hay diferencia significativa
  if (Math.abs(delta) > 1) {
    const um = (wmsItem.unidad_medida || "").toUpperCase();
    const peso = parseFloat(wmsItem.peso_total) || 0;
    const isPesable = peso > 0;

    // Calcular precios unitarios para comparar
    let posUnitPrice, wmsUnitPrice, priceUnit;
    if (isPesable) {
      if (um === "KL") {
        posUnitPrice = Math.round(posLine.net / peso);
        wmsUnitPrice = parseFloat(wmsItem.price);
        priceUnit = "/kg";
      } else if (um === "LB") {
        posUnitPrice = Math.round(posLine.net / peso / 2);
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

    console.log(`${isPesable ? "⚖️" : "📦"} #${idx + 1} ${posLine.name}`);
    console.log(
      `    SKU: ${posLine.sku}  |  ${posLine.qty} ${um}${isPesable ? ` (${peso}kg)` : ""}`,
    );
    console.log(`    Precio unitario:`);
    console.log(
      `      POS: $${posUnitPrice.toLocaleString()}${priceUnit}  →  Total: $${posLine.net.toLocaleString()}`,
    );
    console.log(
      `      WMS: $${wmsUnitPrice.toLocaleString()}${priceUnit}  →  Total: $${wmsCharge.toLocaleString()}`,
    );
    console.log(
      `    Diferencia precio: ${priceDelta > 0 ? "+" : ""}$${priceDelta.toLocaleString()}${priceUnit}`,
    );
    console.log(
      `    Diferencia total: ${delta > 0 ? "+" : ""}$${delta.toLocaleString()}`,
    );
    console.log("");

    discrepancies.push({
      name: posLine.name,
      sku: posLine.sku,
      posPrice: posUnitPrice,
      wmsPrice: wmsUnitPrice,
      priceDelta,
      totalDelta: delta,
      unit: priceUnit,
    });
  }
});

console.log("═".repeat(100));
console.log("RESUMEN:");
console.log("─".repeat(100));
console.log(
  `  Factura POS (items):       $${totalPosSoloItems.toLocaleString()}`,
);
console.log(
  `  Manifiesto WMS (items):    $${totalWmsSoloItems.toLocaleString()}`,
);
console.log(
  `  Delta items:               ${totalWmsSoloItems - totalPosSoloItems > 0 ? "+" : ""}$${(totalWmsSoloItems - totalPosSoloItems).toLocaleString()}`,
);
console.log("");

if (receipt.domicilio) {
  console.log(
    `  Domicilio:                 $${receipt.domicilio.toLocaleString()}`,
  );
  console.log(
    `  Total POS con envío:       $${(totalPosSoloItems + receipt.domicilio).toLocaleString()}`,
  );
}

if (receipt.bolsas) {
  console.log(
    `  Bolsas:                    $${receipt.bolsas.toLocaleString()}`,
  );
}

console.log("═".repeat(100));
console.log("");

if (discrepancies.length > 0) {
  console.log(
    "🔍 PRODUCTOS CON DIFERENCIAS DE PRECIO (ordenados por impacto):",
  );
  console.log("─".repeat(100));

  discrepancies
    .sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
    .forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.name} (${item.sku})`);
      console.log(
        `     POS: $${item.posPrice.toLocaleString()}${item.unit}  →  WMS: $${item.wmsPrice.toLocaleString()}${item.unit}`,
      );
      console.log(
        `     Delta: ${item.priceDelta > 0 ? "+" : ""}$${item.priceDelta.toLocaleString()}${item.unit}  (impacto: ${item.totalDelta > 0 ? "+" : ""}$${Math.round(item.totalDelta).toLocaleString()})`,
      );
      console.log("");
    });

  const totalImpact = discrepancies.reduce((sum, d) => sum + d.totalDelta, 0);
  console.log("─".repeat(100));
  console.log(
    `  IMPACTO TOTAL DE DIFERENCIAS DE PRECIO: ${totalImpact > 0 ? "+" : ""}$${Math.round(totalImpact).toLocaleString()}`,
  );
  console.log("═".repeat(100));
  console.log("");
  console.log("💡 ACCIÓN RECOMENDADA:");
  console.log(
    "   Sincronizar precios entre WooCommerce y SIESA/POS para estos productos:",
  );
  discrepancies.forEach((d) => {
    console.log(
      `   - ${d.name} (${d.sku}): ajustar a $${d.posPrice.toLocaleString()}${d.unit}`,
    );
  });
} else {
  console.log("✅ No se encontraron diferencias de precio entre catálogos.");
  console.log(
    "   Todos los productos tienen precios consistentes entre WooCommerce y POS.",
  );
}

console.log("");
console.log("═".repeat(100));
