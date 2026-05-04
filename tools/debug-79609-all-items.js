/**
 * Debug: Listar TODOS los items del pedido 79609 para encontrar el problema
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const path = require("path");
const { supabase } = require(
  path.join(__dirname, "..", "services", "supabaseClient.js"),
);
const { calcLineCharge } = require(
  path.join(__dirname, "..", "utils", "manifestPricing.js"),
);

const ORDER_ID = 79609;

(async () => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select("id, datos_salida")
      .contains("ids_pedidos", [ORDER_ID])
      .order("fecha_fin", { ascending: false })
      .limit(1);

    if (error) throw error;
    const order = sessions[0].datos_salida.orders.find(
      (o) => String(o.id) === String(ORDER_ID),
    );

    console.log("TODOS LOS ITEMS DEL PEDIDO #" + ORDER_ID);
    console.log("═".repeat(100));

    let runningTotal = 0;

    order.items.forEach((item, idx) => {
      const isShipping = item.is_shipping_method;
      const isRemoved = item.is_removed;
      const storedTotal = parseFloat(item.line_total || 0);
      const calcTotal = calcLineCharge(item);

      const flag = isShipping ? "🚚" : isRemoved ? "❌" : "📦";
      const status = isShipping ? "[SHIPPING]" : isRemoved ? "[REMOVED]" : "";

      console.log(`\n${flag} #${idx + 1} ${item.name} ${status}`);
      console.log(`   SKU: ${item.sku_final || item.sku || "N/A"}`);
      console.log(`   line_total guardado: $${storedTotal.toLocaleString()}`);
      console.log(`   calcLineCharge:      $${calcTotal.toLocaleString()}`);
      console.log(`   is_shipping_method:  ${isShipping}`);
      console.log(`   is_removed:          ${isRemoved}`);

      // Solo sumar si NO es shipping y NO está removed
      if (!isShipping && !isRemoved) {
        runningTotal += calcTotal;
        console.log(`   → Acumulado: $${runningTotal.toLocaleString()}`);
      } else {
        console.log(
          `   → No se suma (${isShipping ? "es shipping" : "está removed"})`,
        );
      }
    });

    console.log("\n" + "═".repeat(100));
    console.log(
      `TOTAL ITEMS (sin shipping, sin removed): $${runningTotal.toLocaleString()}`,
    );
    console.log("═".repeat(100));
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
