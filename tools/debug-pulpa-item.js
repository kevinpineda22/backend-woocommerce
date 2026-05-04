/**
 * Debug específico del item problemático: Pulpa el Trebol
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const path = require("path");
const { supabase } = require(
  path.join(__dirname, "..", "services", "supabaseClient.js"),
);
const { calcLineCharge, classifyWeighable } = require(
  path.join(__dirname, "..", "utils", "manifestPricing.js"),
);

const ORDER_ID = 79609;

(async () => {
  try {
    const { data: sessions } = await supabase
      .from("wc_picking_sessions")
      .select("id, datos_salida")
      .contains("ids_pedidos", [ORDER_ID])
      .order("fecha_fin", { ascending: false })
      .limit(1);

    const order = sessions[0].datos_salida.orders.find(
      (o) => String(o.id) === String(ORDER_ID),
    );
    const item = order.items.find((i) => i.name && i.name.includes("Pulpa"));

    console.log("═".repeat(80));
    console.log("ITEM PROBLEMÁTICO: Pulpa el Trebol");
    console.log("═".repeat(80));
    console.log("\n📦 DATOS COMPLETOS:");
    console.log(JSON.stringify(item, null, 2));

    console.log("\n" + "═".repeat(80));
    console.log("ANÁLISIS:");
    console.log("═".repeat(80));

    const sku = item.sku_final || item.sku || "";
    const um = (item.unidad_medida || "").toUpperCase();
    const qty = item.qty || item.count || 1;
    const price = parseFloat(item.price) || parseFloat(item.line_total) || 0;
    const peso = parseFloat(item.peso_total) || 0;
    const stored = parseFloat(item.line_total || 0);

    console.log(`SKU:              ${sku}`);
    console.log(`Nombre:           ${item.name}`);
    console.log(`Unidad medida:    ${um}`);
    console.log(`Qty:              ${qty}`);
    console.log(`Price:            $${price.toLocaleString()}`);
    console.log(`Peso total:       ${peso}kg`);
    console.log(`Line total (DB):  $${stored.toLocaleString()}`);

    const classification = classifyWeighable(item);
    console.log(`\n🔍 Clasificación:  ${classification || "NO PESABLE"}`);

    // Simular cálculo paso a paso
    console.log("\n📊 CÁLCULO PASO A PASO:");

    if (peso > 0 && classification) {
      console.log(
        `  1. Tiene peso (${peso}kg) y clasificación (${classification})`,
      );
      console.log(`  2. Es producto PESABLE`);
      if (classification === "kg") {
        const calc = price * peso;
        console.log(
          `  3. Fórmula KL: price × peso = $${price} × ${peso} = $${calc.toLocaleString()}`,
        );
      } else if (classification === "half") {
        const calc = price * 2 * peso;
        console.log(
          `  3. Fórmula LB: price × 2 × peso = $${price} × 2 × ${peso} = $${calc.toLocaleString()}`,
        );
      }
    } else {
      const calc = price * qty;
      console.log(
        `  1. No es pesable (peso=${peso}, classification=${classification})`,
      );
      console.log(
        `  2. Fórmula estándar: price × qty = $${price} × ${qty} = $${calc.toLocaleString()}`,
      );
    }

    const result = calcLineCharge(item);
    console.log(`\n✅ calcLineCharge devuelve: $${result.toLocaleString()}`);
    console.log(`❌ Debería ser:              $${stored.toLocaleString()}`);
    console.log(
      `⚠️  Diferencia:              $${(result - stored).toLocaleString()}`,
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
