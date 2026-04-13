// Análisis profundo de siesa_codigos_barras para evaluar viabilidad de Opción B
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  // 1. Estructura y volumen general
  const { count } = await supabase
    .from("siesa_codigos_barras")
    .select("*", { count: "exact", head: true });
  console.log("===== VOLUMEN GENERAL =====");
  console.log("Total registros:", count);

  // 2. Columnas disponibles — traer 1 registro para ver shape
  const { data: sample } = await supabase
    .from("siesa_codigos_barras")
    .select("*")
    .limit(3);
  console.log("\nColumnas:", Object.keys(sample[0]));
  console.log("Sample:", JSON.stringify(sample, null, 2));

  // 3. Distribución de unidad_medida
  const { data: allRows } = await supabase
    .from("siesa_codigos_barras")
    .select("f120_id, codigo_barras, unidad_medida");

  const umCounts = {};
  allRows.forEach((r) => {
    const um = (r.unidad_medida || "NULL").toUpperCase();
    umCounts[um] = (umCounts[um] || 0) + 1;
  });
  console.log("\n===== DISTRIBUCIÓN UNIDAD_MEDIDA =====");
  Object.entries(umCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([um, c]) => console.log(`  ${um.padEnd(10)} ${c}`));

  // 4. ¿Cuántos f120_id tienen MÁS de 1 código de barras?
  const byF120 = {};
  allRows.forEach((r) => {
    if (!byF120[r.f120_id]) byF120[r.f120_id] = [];
    byF120[r.f120_id].push(r);
  });

  const totalF120 = Object.keys(byF120).length;
  const withMultiple = Object.entries(byF120).filter(([, rows]) => rows.length > 1);
  const with3Plus = withMultiple.filter(([, rows]) => rows.length >= 3);
  const with5Plus = withMultiple.filter(([, rows]) => rows.length >= 5);
  console.log("\n===== CÓDIGOS POR f120_id =====");
  console.log("Total f120_id únicos:", totalF120);
  console.log("Con 1 solo código:", totalF120 - withMultiple.length);
  console.log("Con 2+ códigos:", withMultiple.length);
  console.log("Con 3+ códigos:", with3Plus.length);
  console.log("Con 5+ códigos:", with5Plus.length);

  // 5. ¿Los múltiples códigos son por VARIACIÓN (distinta unidad_medida) o duplicados?
  let multiUm = 0; // f120_id con más de 1 unidad_medida distinta
  let sameUmMultiBc = 0; // f120_id con más de 1 barcode PARA LA MISMA unidad_medida
  const examplesSameUmMulti = [];

  Object.entries(byF120).forEach(([f120, rows]) => {
    const umSet = new Set(rows.map((r) => (r.unidad_medida || "").toUpperCase()));
    if (umSet.size > 1) multiUm++;

    // Agrupar por UM
    const byUm = {};
    rows.forEach((r) => {
      const um = (r.unidad_medida || "").toUpperCase();
      if (!byUm[um]) byUm[um] = [];
      byUm[um].push(r.codigo_barras);
    });
    Object.entries(byUm).forEach(([um, codes]) => {
      if (codes.length > 1) {
        sameUmMultiBc++;
        if (examplesSameUmMulti.length < 10) {
          examplesSameUmMulti.push({ f120, um, codes });
        }
      }
    });
  });
  console.log("\n===== VARIACIONES vs DUPLICADOS =====");
  console.log("f120_id con 2+ unidad_medida distintas (variaciones reales):", multiUm);
  console.log("Pares f120_id+UM con 2+ barcodes distintos (duplicados por UM):", sameUmMultiBc);
  if (examplesSameUmMulti.length > 0) {
    console.log("\nEjemplos de duplicados (mismo f120 + UM, múltiples barcodes):");
    examplesSameUmMulti.forEach((e) =>
      console.log(`  f120=${e.f120} UM=${e.um} → [${e.codes.join(", ")}]`),
    );
  }

  // 6. Para los items del pedido #77668 — ¿qué hay en SIESA?
  const woo = require("./_debug_order_77668.json");
  const skus77668 = [
    ...new Set(
      woo.line_items
        .map((li) => parseInt(li.sku))
        .filter((s) => !isNaN(s)),
    ),
  ];
  console.log("\n===== ITEMS PEDIDO #77668 EN SIESA =====");
  console.log("SKUs únicos del pedido:", skus77668.length);

  let sinCodigo = 0;
  let conCodigo1 = 0;
  let conCodigoN = 0;
  let conVariaciones = 0;
  const detalles = [];

  skus77668.forEach((sku) => {
    const rows = byF120[sku] || [];
    if (rows.length === 0) {
      sinCodigo++;
      detalles.push({ sku, status: "SIN_CODIGO", rows: [] });
    } else if (rows.length === 1) {
      conCodigo1++;
      detalles.push({ sku, status: "1_CODIGO", rows });
    } else {
      const ums = new Set(rows.map((r) => (r.unidad_medida || "").toUpperCase()));
      if (ums.size > 1) conVariaciones++;
      else conCodigoN++;
      detalles.push({
        sku,
        status: ums.size > 1 ? "VARIACIONES" : "MULTI_BC",
        rows,
      });
    }
  });

  console.log(`Sin código en SIESA: ${sinCodigo}`);
  console.log(`Con 1 código exacto: ${conCodigo1}`);
  console.log(`Con múltiples barcodes (misma UM): ${conCodigoN}`);
  console.log(`Con variaciones (distintas UM): ${conVariaciones}`);

  console.log("\nDetalle por SKU del pedido:");
  detalles.forEach((d) => {
    const li = woo.line_items.find((x) => parseInt(x.sku) === d.sku);
    const wooUm = (li?.sku || "").replace(/^\d+/, "") || "(sin UM)";
    const wooName = (li?.name || "").slice(0, 35);
    if (d.rows.length === 0) {
      console.log(`  ❌ f120=${d.sku} wooSku=${li?.sku} "${wooName}" → NO ESTÁ EN SIESA`);
    } else {
      const codes = d.rows
        .map((r) => `${r.codigo_barras}[${r.unidad_medida}]`)
        .join(", ");
      console.log(
        `  ${d.status === "1_CODIGO" ? "✅" : d.status === "VARIACIONES" ? "⚠️" : "🔶"} f120=${d.sku} wooSku=${li?.sku} "${wooName}" → ${codes}`,
      );
    }
  });

  // 7. Prefijos M/N — cuántos hay?
  const withM = allRows.filter(
    (r) => r.codigo_barras && /^[MN]/i.test(r.codigo_barras.toString().trim()),
  );
  console.log("\n===== PREFIJOS M/N =====");
  console.log("Códigos con prefijo M o N:", withM.length, "de", allRows.length);
  console.log(
    "Porcentaje:",
    ((withM.length / allRows.length) * 100).toFixed(1) + "%",
  );
  // Ejemplos
  console.log("Ejemplos:");
  withM.slice(0, 8).forEach((r) =>
    console.log(`  f120=${r.f120_id} bc=${r.codigo_barras} um=${r.unidad_medida}`),
  );
}

main().catch(console.error);
