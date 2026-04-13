// Simula el qrValue de ManifestSheet.jsx con los datos reales del final_snapshot
// para el pedido #77668 y detecta inconsistencias.

const fs = require("fs");

const datos = JSON.parse(
  fs.readFileSync("tools/_debug_session_77668_datos_salida.json", "utf8"),
);
const wooOrder = JSON.parse(
  fs.readFileSync("tools/_debug_order_77668.json", "utf8"),
);

const items = datos.orders[0].items;

// ============ COPIA EXACTA de la lógica de ManifestSheet.jsx ============
const calcularDigitoVerificador = (codigo) => {
  if (codigo.length < 12 || codigo.length > 13) return null;
  if (!/^\d+$/.test(codigo)) return null;
  const n = codigo.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = parseInt(codigo[i]);
    const weight = (n - i) % 2 === 1 ? 3 : 1;
    sum += d * weight;
  }
  return ((10 - (sum % 10)) % 10).toString();
};

const cleanSku = (sku) =>
  !sku ? "" : sku.toString().replace(/-/g, "");
const stripMN = (code) => {
  if (!code || typeof code !== "string") return code;
  const upper = code.trim().toUpperCase();
  if (upper.startsWith("M") || upper.startsWith("N")) return code.substring(1);
  return code;
};
const isValidBarcode = (code) => {
  if (!code || code === "N/A" || code === "ADMIN_OVERRIDE") return false;
  return code.toString().trim().length > 0;
};
const isMultipack = (unidad_medida) => {
  if (!unidad_medida) return false;
  const uom = unidad_medida.toUpperCase();
  return /^[A-Z]+\d+$/.test(uom) && uom !== "UN";
};
const WEIGHABLE_UNITS = ["kl", "kg", "kilo", "lb", "libra"];
const isWeighableProduct = (um) => {
  if (!um) return false;
  return WEIGHABLE_UNITS.includes(um.toLowerCase());
};

const omittedItems = [];
const lines = [];
const perItemReport = [];

items.forEach((item, idx) => {
  const qty = item.qty || item.count || 1;
  const unidad_medida = item.unidad_medida || "";
  const tieneVariaciones = item.tiene_variaciones || false;
  const isMP = isMultipack(unidad_medida);
  let code = stripMN(item.barcode || "");
  if ((isMP || tieneVariaciones) && item.sku) code = cleanSku(item.sku);
  if (!isValidBarcode(code) && item.sku) {
    const numSku = ((item.sku || "").match(/^(\d+)/) || [])[1] || "";
    const um = (unidad_medida || "").toUpperCase();
    if (numSku && um) code = `${numSku}${um}`;
    else if (numSku) code = numSku;
  }
  let emitted = null;
  let reason = "";
  if (
    !isValidBarcode(code) &&
    !isMP &&
    !tieneVariaciones &&
    !isWeighableProduct(unidad_medida)
  ) {
    omittedItems.push(item);
    reason = "OMITIDO: sin barcode válido";
    perItemReport.push({ idx: idx + 1, item, emitted: [], reason });
    return;
  }
  const cleanCodeGS1 = code.toString().replace(/\+$/, "");
  const numericSku = (item.sku || "").match(/^(\d+)/)?.[1];
  const isAlreadyGS1_29 =
    /^\d{13,14}$/.test(cleanCodeGS1) && cleanCodeGS1.startsWith("2");

  if (isWeighableProduct(unidad_medida) || isAlreadyGS1_29) {
    if (isAlreadyGS1_29) {
      emitted = [cleanCodeGS1];
      reason = "GS1_29 directo desde barcode";
    } else if (numericSku) {
      const um = (unidad_medida || "KG").toUpperCase();
      let pesoKg = parseFloat(item.peso_total) || 0;
      if (!pesoKg || pesoKg <= 0 || isNaN(pesoKg)) {
        const numericQty = parseFloat(qty) || 0;
        pesoKg =
          um === "LB" || um === "LIBRA" ? numericQty * 0.4536 : numericQty;
      }
      if (isNaN(pesoKg) || pesoKg <= 0) {
        omittedItems.push(item);
        reason = "OMITIDO pesable: peso inválido";
        perItemReport.push({ idx: idx + 1, item, emitted: [], reason });
        return;
      }
      const pesoGramos = Math.round(pesoKg * 1000);
      const pesoStr = pesoGramos.toString().padStart(5, "0");
      const skuPadded =
        numericSku.length < 4 ? numericSku.padStart(4, "0") : numericSku;
      const separator = skuPadded.length <= 4 ? "0" : "";
      const codigoSinCheck = "29" + skuPadded + separator + pesoStr;
      const checkDigit = calcularDigitoVerificador(codigoSinCheck);
      if (checkDigit) {
        emitted = [`${codigoSinCheck}${checkDigit}`];
        reason = `GS1 construido (pesoKg=${pesoKg}, fuente=${parseFloat(item.peso_total) > 0 ? "peso_total" : "fallback_qty"})`;
      }
    } else if (/^\d{8,14}$/.test(cleanCodeGS1)) {
      emitted = [cleanCodeGS1];
      reason = "numérico 8-14 dígitos";
    }
    if (!emitted) {
      omittedItems.push(item);
      reason = "OMITIDO pesable: no se pudo construir código";
      perItemReport.push({ idx: idx + 1, item, emitted: [], reason });
      return;
    }
  } else if (tieneVariaciones && item.sku) {
    emitted = Array(qty).fill(`1*${cleanSku(item.sku)}`);
    reason = `tieneVariaciones=true → ${qty} líneas "1*SKU"`;
  } else {
    emitted = [`${qty}*${code}`];
    reason = `normal → "${qty}*${code}"`;
  }

  emitted.forEach((e) => lines.push(e));
  perItemReport.push({ idx: idx + 1, item, emitted, reason });
});

// Reporte
console.log("===== REPORTE ITEM POR ITEM =====\n");
perItemReport.forEach((r) => {
  const nm = (r.item.name || "").slice(0, 45).padEnd(45);
  const qty = String(r.item.qty).padStart(3);
  const um = String(r.item.unidad_medida || "").padEnd(5);
  const tv = r.item.tiene_variaciones ? "TV" : "  ";
  const bc = (r.item.barcode || "").slice(0, 20).padEnd(20);
  console.log(
    `${String(r.idx).padStart(2)}. qty=${qty} um=${um} ${tv} bc=${bc} sku=${(r.item.sku || "").padEnd(10)} | ${r.reason}`,
  );
  if (r.emitted.length > 0) {
    console.log(`    →  ${r.emitted.join(" | ")}`);
  }
});

console.log("\n===== RESUMEN =====");
console.log("Items en snapshot:", items.length);
console.log("Items omitidos del QR:", omittedItems.length);
if (omittedItems.length) {
  omittedItems.forEach((o) =>
    console.log(`  - ${o.name} qty=${o.qty} sku=${o.sku} bc=${o.barcode}`),
  );
}
console.log("Líneas totales en QR:", lines.length);
console.log("Longitud total (chars):", lines.join("\r\n").length);

// Cruzar snapshot contra woo line_items
console.log("\n===== COMPARACION WOO vs SNAPSHOT =====");
const wooItems = wooOrder.line_items;
const snapBySku = {};
items.forEach((i) => {
  const key = (i.sku || "").toString();
  snapBySku[key] = (snapBySku[key] || 0) + (i.qty || 0);
});
const wooBySku = {};
wooItems.forEach((i) => {
  const key = (i.sku || "").toString();
  wooBySku[key] = (wooBySku[key] || 0) + i.quantity;
});

console.log("\nItems en Woo pero NO en snapshot (o qty distinta):");
Object.keys(wooBySku).forEach((sku) => {
  const w = wooBySku[sku];
  const s = snapBySku[sku] || 0;
  if (s !== w) {
    const woo = wooItems.find((x) => x.sku === sku);
    console.log(
      `  SKU=${sku.padEnd(12)} woo=${w} snap=${s} | ${woo?.name?.slice(0, 40)} | precio=${woo?.price} subtotal=${woo?.subtotal}`,
    );
  }
});

console.log("\nItems en snapshot pero NO en Woo (raro):");
Object.keys(snapBySku).forEach((sku) => {
  if (!(sku in wooBySku)) {
    console.log(`  SKU=${sku} qty=${snapBySku[sku]}`);
  }
});

// Calcular diferencia monetaria entre Woo y snapshot
let wooTotalNoFaltantes = 0;
let wooTotalFaltantes = 0;
wooItems.forEach((w) => {
  const snap = snapBySku[w.sku] || 0;
  const subtotal = parseFloat(w.total || 0);
  if (snap === w.quantity) wooTotalNoFaltantes += subtotal;
  else if (snap === 0) wooTotalFaltantes += subtotal;
  else {
    const perUnit = subtotal / w.quantity;
    wooTotalNoFaltantes += perUnit * snap;
    wooTotalFaltantes += perUnit * (w.quantity - snap);
  }
});

console.log("\n===== TOTALES =====");
console.log("Woo total completo:", wooOrder.total);
console.log("Suma items presentes en snapshot (según precios Woo):", Math.round(wooTotalNoFaltantes));
console.log("Suma items FALTANTES en snapshot (según precios Woo):", Math.round(wooTotalFaltantes));
console.log("Reporte usuario — manifiesto (QR scan):", 2024730);
console.log("Reporte usuario — físico item x item:", 1967034);
console.log("Diferencia manifiesto vs físico:", 2024730 - 1967034);
