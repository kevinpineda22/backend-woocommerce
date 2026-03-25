/**
 * Test: Validar fix de generación GS1 para el manifiesto de salida
 * Ejecutar: node test-gs1-fix.js
 */

// Copiar la función calcularDigitoVerificador (misma lógica que gs1Utils.js)
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

// Lógica NUEVA de generación GS1
const WEIGHABLE_UNITS = ["kl", "kg", "kilo", "lb", "libra"];
const isWeighableProduct = (u) => u && WEIGHABLE_UNITS.includes(u.toLowerCase());

function generarCodigoGS1_NUEVO(item) {
  const qty = item.qty || 1;
  const unidad_medida = item.unidad_medida || "";
  const numericSku = (item.sku || "").match(/^(\d+)/)?.[1];

  if (!isWeighableProduct(unidad_medida) || !numericSku) {
    return { code: null, error: "No es pesable o sin SKU numérico" };
  }

  const um = (unidad_medida || "KG").toUpperCase();
  let pesoKg = parseFloat(item.peso_total) || 0;
  if (!pesoKg || pesoKg <= 0 || isNaN(pesoKg)) {
    const numericQty = parseFloat(qty) || 0;
    pesoKg = (um === "LB" || um === "LIBRA") ? numericQty * 0.4536 : numericQty;
  }

  if (isNaN(pesoKg) || pesoKg <= 0) {
    return { code: null, error: "Peso inválido (NaN o 0)" };
  }

  const pesoGramos = Math.round(pesoKg * 1000);
  const pesoStr = pesoGramos.toString().padStart(5, "0");
  const skuPadded = numericSku.length < 4 ? numericSku.padStart(4, "0") : numericSku;

  // FIX: Sin separador "0" para SKU de 5 dígitos
  const separator = skuPadded.length <= 4 ? "0" : "";
  const codigoSinCheck = "29" + skuPadded + separator + pesoStr;
  const checkDigit = calcularDigitoVerificador(codigoSinCheck);

  return {
    code: checkDigit ? `${codigoSinCheck}${checkDigit}` : null,
    sinCheck: codigoSinCheck,
    checkDigit,
    detalles: { numericSku, skuPadded, separator, pesoKg, pesoGramos, pesoStr },
  };
}

// Lógica VIEJA (la que producía los bugs)
function generarCodigoGS1_VIEJO(item) {
  const qty = item.qty || 1;
  const unidad_medida = item.unidad_medida || "";
  const numericSku = (item.sku || "").match(/^(\d+)/)?.[1];

  if (!isWeighableProduct(unidad_medida) || !numericSku) {
    return { code: null, error: "No es pesable o sin SKU numérico" };
  }

  const um = (unidad_medida || "KG").toUpperCase();
  let pesoKg = item.peso_total || 0;
  if (!pesoKg || pesoKg <= 0) {
    pesoKg = (um === "LB" || um === "LIBRA") ? qty * 0.4536 : qty;
  }

  const pesoGramos = Math.round(pesoKg * 1000);
  const pesoStr = pesoGramos.toString().padStart(5, "0");

  // BUG: Siempre agrega "0" separador → 14 dígitos para SKU de 5
  const codigoSinCheck = "29" + numericSku + "0" + pesoStr;
  const checkDigit = calcularDigitoVerificador(codigoSinCheck);

  return {
    code: checkDigit ? `${codigoSinCheck}${checkDigit}` : codigoSinCheck,
    sinCheck: codigoSinCheck,
    checkDigit,
    detalles: { numericSku, pesoKg, pesoGramos, pesoStr },
  };
}

// ═══════════════════════════════════════
// CASOS DE PRUEBA — datos del QR malo
// ═══════════════════════════════════════

console.log("═══════════════════════════════════════════════");
console.log("  TEST: Fix generación GS1 para manifiesto");
console.log("═══════════════════════════════════════════════\n");

const testCases = [
  // ═══ CASO REAL DEL USER ═══
  {
    label: "CASO REAL: CEBOLLA DE HUEVO PELADA — item 181192, 7LB",
    descripcion: "Resultado malo: 29192LB003550NAN. Item real: 181192, pedido: 7LB",
    item: { sku: "181192", unidad_medida: "LB", peso_total: 0, qty: 7 },
  },
  {
    label: "CASO REAL variante: SKU corto '192' (si SIESA devuelve esto)",
    descripcion: "Posible SKU SIESA sin el prefijo 181",
    item: { sku: "192", unidad_medida: "LB", peso_total: 0, qty: 7 },
  },
  {
    label: "CASO REAL variante: SKU='192LB' (unidad dentro del SKU)",
    descripcion: "Si el SKU en WooCommerce incluye la unidad",
    item: { sku: "192LB", unidad_medida: "LB", peso_total: 0, qty: 7 },
  },
  {
    label: "CASO REAL: con peso_total real del picker (3.55 kg)",
    descripcion: "Si el picker registró peso_total = 3.55",
    item: { sku: "181192", unidad_medida: "LB", peso_total: 3.55, qty: 7 },
  },
  // ═══ BUG 1: SKU 5 dígitos ═══
  {
    label: "BUG 1: Código de 14 dígitos (SKU 5 dígitos)",
    descripcion: "Resultado malo: 2915168009855 — la caja lo rechaza. Sin un cero (291516809855) pasa bien.",
    item: { sku: "15168", unidad_medida: "KL", peso_total: 9.855, qty: 9.855 },
  },
  // ═══ OTROS CÓDIGOS DEL QR REAL ═══
  {
    label: "QR real: SKU 15141 (KL) — fue 2915141014506 en el QR",
    descripcion: "Verificar si coincide",
    item: { sku: "15141", unidad_medida: "KL", peso_total: 1.4506, qty: 1 },
  },
  {
    label: "QR real: SKU 5065 (KL) — fue 2950650009992 en el QR",
    descripcion: "Verificar si coincide",
    item: { sku: "5065", unidad_medida: "KL", peso_total: 0.999, qty: 0.999 },
  },
  {
    label: "QR real: SKU 15168 (KL) — fue 2915168009855 (14 dígitos, malo)",
    descripcion: "El que la caja rechazó",
    item: { sku: "15168", unidad_medida: "KL", peso_total: 0, qty: 9.855 },
  },
  {
    label: "QR real: SKU 51060 — fue 2951060020003 en el QR",
    descripcion: "Verificar si coincide",
    item: { sku: "51060", unidad_medida: "KL", peso_total: 2.0, qty: 2 },
  },
  // ═══ CASOS EDGE ═══
  {
    label: "Edge: peso_total undefined",
    descripcion: "peso_total no viene del auditor",
    item: { sku: "5065", unidad_medida: "KL", peso_total: undefined, qty: 2 },
  },
  {
    label: "Edge: qty como string '7'",
    descripcion: "qty viene como string del JSON",
    item: { sku: "181192", unidad_medida: "LB", peso_total: 0, qty: "7" },
  },
  {
    label: "Edge: SKU 6 dígitos (181192)",
    descripcion: "SKU más largo de lo normal",
    item: { sku: "181192", unidad_medida: "KL", peso_total: 2.5, qty: 2.5 },
  },
];

testCases.forEach((tc, i) => {
  console.log(`\n─── Test ${i + 1}: ${tc.label} ───`);
  console.log(`    ${tc.descripcion}`);
  console.log(`    Item: sku="${tc.item.sku}" unidad="${tc.item.unidad_medida}" peso_total=${tc.item.peso_total} qty=${tc.item.qty}`);

  const viejo = generarCodigoGS1_VIEJO(tc.item);
  const nuevo = generarCodigoGS1_NUEVO(tc.item);

  console.log(`\n    VIEJO: ${viejo.code || "(null)"} ${viejo.error || ""}`);
  if (viejo.code) {
    console.log(`           sinCheck="${viejo.sinCheck}" (${viejo.sinCheck.length} chars) check=${viejo.checkDigit} → total ${viejo.code.length} dígitos`);
    console.log(`           ${JSON.stringify(viejo.detalles)}`);
  }

  console.log(`    NUEVO: ${nuevo.code || "(omitido del QR)"} ${nuevo.error || ""}`);
  if (nuevo.code) {
    console.log(`           sinCheck="${nuevo.sinCheck}" (${nuevo.sinCheck.length} chars) check=${nuevo.checkDigit} → total ${nuevo.code.length} dígitos`);
    console.log(`           ${JSON.stringify(nuevo.detalles)}`);
  }

  const fixed = viejo.code !== nuevo.code;
  console.log(`    ${fixed ? "✅ CORREGIDO" : "⬜ Sin cambio"} ${nuevo.code ? `→ EAN-${nuevo.code.length}` : "→ Omitido (se muestra advertencia)"}`);
});

console.log("\n═══════════════════════════════════════════════");
console.log("  FIN DEL TEST");
console.log("═══════════════════════════════════════════════\n");
