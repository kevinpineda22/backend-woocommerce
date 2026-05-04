/**
 * Script de migración: Actualiza pedidos 79608 y 79609 con precios corregidos
 * Recalcula totales usando calcLineCharge y actualiza datos_salida en Supabase
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

const ORDER_IDS = [79608, 79609];

async function migrateOrder(orderId) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📦 Migrando pedido #${orderId}`);
  console.log("=".repeat(80));

  try {
    // 1. Buscar la sesión
    console.log("🔍 Buscando sesión...");
    const { data: sessions, error: fetchError } = await supabase
      .from("wc_picking_sessions")
      .select("id, datos_salida")
      .contains("ids_pedidos", [orderId])
      .order("fecha_fin", { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;
    if (!sessions || sessions.length === 0) {
      console.log(`⚠️  No se encontró sesión para el pedido #${orderId}`);
      return;
    }

    const session = sessions[0];
    console.log(`✅ Sesión encontrada: ${session.id}`);

    // 2. Obtener datos_salida
    const datosSalida = session.datos_salida;
    if (!datosSalida || !datosSalida.orders) {
      console.log("⚠️  No hay datos_salida en la sesión");
      return;
    }

    // 3. Encontrar el pedido en datos_salida
    const orderIndex = datosSalida.orders.findIndex(
      (o) => String(o.id) === String(orderId),
    );
    if (orderIndex === -1) {
      console.log(`⚠️  Pedido #${orderId} no encontrado en datos_salida`);
      return;
    }

    const order = datosSalida.orders[orderIndex];
    const items = order.items.filter(
      (i) => !i.is_shipping_method && !i.is_removed,
    );

    console.log(`📊 Items a recalcular: ${items.length}`);

    // 4. Calcular totales ANTES
    const oldItemsTotal = items.reduce((sum, item) => {
      const price = parseFloat(item.price) || parseFloat(item.line_total) || 0;
      const qty = item.qty || item.count || 1;
      return sum + price * qty;
    }, 0);

    const oldShipping = (order.shipping_lines || []).reduce(
      (s, sh) => s + (parseFloat(sh.total) || 0),
      0,
    );
    const oldTotal = oldItemsTotal + oldShipping;

    // 5. Calcular totales NUEVOS con calcLineCharge
    const newItemsTotal = items.reduce(
      (sum, item) => sum + calcLineCharge(item),
      0,
    );
    const newShipping = oldShipping; // El shipping no cambia
    const newTotal = newItemsTotal + newShipping;

    console.log("\n📈 COMPARACIÓN:");
    console.log(`  Items (antes):       $${oldItemsTotal.toLocaleString()}`);
    console.log(`  Items (después):     $${newItemsTotal.toLocaleString()}`);
    console.log(
      `  Delta items:         ${newItemsTotal - oldItemsTotal > 0 ? "+" : ""}$${(newItemsTotal - oldItemsTotal).toLocaleString()}`,
    );
    console.log(`  Shipping:            $${newShipping.toLocaleString()}`);
    console.log(`  Total (antes):       $${oldTotal.toLocaleString()}`);
    console.log(`  Total (después):     $${newTotal.toLocaleString()}`);
    console.log(
      `  Delta total:         ${newTotal - oldTotal > 0 ? "+" : ""}$${(newTotal - oldTotal).toLocaleString()}`,
    );

    // 6. Actualizar datos_salida
    console.log("\n💾 Actualizando base de datos...");

    // Actualizar el total del pedido en datos_salida
    datosSalida.orders[orderIndex].total = String(newTotal);

    // Actualizar cada item con el total correcto
    datosSalida.orders[orderIndex].items = order.items.map((item) => {
      if (item.is_shipping_method || item.is_removed) {
        return item;
      }

      // Calcular el total correcto para este item
      const correctedTotal = calcLineCharge(item);

      return {
        ...item,
        line_total: String(correctedTotal),
        subtotal: String(correctedTotal), // Mantener consistencia
      };
    });

    // Guardar en Supabase
    const { error: updateError } = await supabase
      .from("wc_picking_sessions")
      .update({ datos_salida: datosSalida })
      .eq("id", session.id);

    if (updateError) throw updateError;

    console.log("✅ Base de datos actualizada correctamente");
    console.log(`   Sesión: ${session.id}`);
    console.log(
      `   Pedido #${orderId}: $${oldTotal.toLocaleString()} → $${newTotal.toLocaleString()}`,
    );
  } catch (err) {
    console.error(`❌ Error migrando pedido #${orderId}:`, err.message);
  }
}

(async () => {
  console.log("╔" + "═".repeat(78) + "╗");
  console.log(
    "║" +
      " ".repeat(20) +
      "MIGRACIÓN DE PRECIOS CORREGIDOS" +
      " ".repeat(26) +
      "║",
  );
  console.log("╚" + "═".repeat(78) + "╝");

  for (const orderId of ORDER_IDS) {
    await migrateOrder(orderId);
  }

  console.log("\n" + "═".repeat(80));
  console.log("✅ Migración completada");
  console.log("═".repeat(80));
  console.log("\n💡 Los cambios se verán reflejados en:");
  console.log("   - Vista de Historial (admin)");
  console.log("   - Manifiesto de salida (QR)");
  console.log("   - HistoryDetailModal");
  console.log("");
})();
