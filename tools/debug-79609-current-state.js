/**
 * Debug: Ver el estado actual exacto del pedido 79609 en Supabase
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
    console.log("🔍 Obteniendo estado actual del pedido #" + ORDER_ID);

    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select("id, datos_salida")
      .contains("ids_pedidos", [ORDER_ID])
      .order("fecha_fin", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      console.log("❌ No se encontró sesión");
      return;
    }

    const session = sessions[0];
    const order = session.datos_salida.orders.find(
      (o) => String(o.id) === String(ORDER_ID),
    );

    console.log("\n" + "═".repeat(80));
    console.log("DATOS GUARDADOS EN datos_salida.orders[" + ORDER_ID + "]:");
    console.log("═".repeat(80));

    // Total almacenado en el campo order.total
    console.log(
      "\n📊 CAMPO order.total: $" +
        (order.total
          ? parseFloat(order.total).toLocaleString()
          : "NO DEFINIDO"),
    );

    // Items
    const allItems = order.items || [];
    const regularItems = allItems.filter(
      (i) => !i.is_shipping_method && !i.is_removed,
    );
    const shippingItems = allItems.filter((i) => i.is_shipping_method);
    const removedItems = allItems.filter((i) => i.is_removed);

    console.log("\n📦 ITEMS:");
    console.log(`   Total items: ${allItems.length}`);
    console.log(`   - Productos: ${regularItems.length}`);
    console.log(`   - Shipping: ${shippingItems.length}`);
    console.log(`   - Removidos: ${removedItems.length}`);

    // Calcular con calcLineCharge (lo correcto)
    const itemsTotal = regularItems.reduce(
      (sum, item) => sum + calcLineCharge(item),
      0,
    );
    console.log(
      `\n💰 SUBTOTAL ITEMS (calcLineCharge): $${itemsTotal.toLocaleString()}`,
    );

    // Ver qué tienen los shipping_lines
    console.log("\n🚚 SHIPPING:");
    if (order.shipping_lines && order.shipping_lines.length > 0) {
      order.shipping_lines.forEach((sh) => {
        console.log(
          `   - ${sh.method_title}: $${parseFloat(sh.total || 0).toLocaleString()}`,
        );
      });
      const shippingTotal = order.shipping_lines.reduce(
        (s, sh) => s + parseFloat(sh.total || 0),
        0,
      );
      console.log(`   Total shipping: $${shippingTotal.toLocaleString()}`);
    } else {
      console.log("   No hay shipping_lines definidos");
    }

    // Ver los items marcados como shipping
    if (shippingItems.length > 0) {
      console.log("\n🚚 ITEMS MARCADOS COMO SHIPPING:");
      shippingItems.forEach((item) => {
        const lineTotal = parseFloat(item.line_total || item.price || 0);
        console.log(`   - ${item.name}: $${lineTotal.toLocaleString()}`);
      });
    }

    // Ver fees
    console.log("\n💵 FEES:");
    if (order.fee_lines && order.fee_lines.length > 0) {
      order.fee_lines.forEach((fee) => {
        console.log(
          `   - ${fee.name}: $${parseFloat(fee.total || 0).toLocaleString()}`,
        );
      });
    } else {
      console.log("   No hay fees");
    }

    // Calcular total como lo hace el frontend
    const shipping = (order.shipping_lines || []).reduce(
      (s, sh) => s + parseFloat(sh.total || 0),
      0,
    );
    const fees = (order.fee_lines || []).reduce(
      (s, f) => s + parseFloat(f.total || 0),
      0,
    );
    const calculatedTotal = itemsTotal + shipping + fees;

    console.log("\n" + "═".repeat(80));
    console.log("CÁLCULO DETALLADO:");
    console.log("═".repeat(80));
    console.log(`  Items:             $${itemsTotal.toLocaleString()}`);
    console.log(`  Shipping:          $${shipping.toLocaleString()}`);
    console.log(`  Fees:              $${fees.toLocaleString()}`);
    console.log("  " + "─".repeat(40));
    console.log(`  TOTAL CALCULADO:   $${calculatedTotal.toLocaleString()}`);
    console.log(
      `  order.total:       $${order.total ? parseFloat(order.total).toLocaleString() : "NO DEFINIDO"}`,
    );

    if (order.total) {
      const diff = parseFloat(order.total) - calculatedTotal;
      if (Math.abs(diff) > 1) {
        console.log(
          `  ⚠️  DIFERENCIA:    ${diff > 0 ? "+" : ""}$${diff.toLocaleString()}`,
        );
      }
    }

    console.log("\n" + "═".repeat(80));
    console.log("DIAGNÓSTICO:");
    console.log("═".repeat(80));
    console.log(`  Esperado (según migración): $410.900`);
    console.log(`  Manifiesto muestra:         $433.100`);
    console.log(`  Historial muestra:          $439.100`);
    console.log(
      `  Total calculado ahora:      $${calculatedTotal.toLocaleString()}`,
    );

    console.log("\n💡 Revisando cada item individual:");
    console.log("─".repeat(80));

    regularItems.slice(0, 5).forEach((item, idx) => {
      const stored = parseFloat(item.line_total || 0);
      const correct = calcLineCharge(item);
      const diff = stored - correct;

      console.log(`${idx + 1}. ${item.name}`);
      console.log(
        `   Guardado: $${stored.toLocaleString()} | Correcto: $${correct.toLocaleString()} | Diff: ${diff > 0 ? "+" : ""}$${Math.round(diff).toLocaleString()}`,
      );
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
