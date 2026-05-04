/**
 * Script completo de análisis para pedido 79609
 * Trae datos de WooCommerce y Supabase, genera reporte de precios
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", "..", ".env"),
});
const path = require("path");
const fs = require("fs");
const WooCommerce = require(
  path.join(__dirname, "..", "..", "services", "wooService.js"),
);
const { supabase } = require(
  path.join(__dirname, "..", "..", "services", "supabaseClient.js"),
);
const { calcLineCharge } = require(
  path.join(__dirname, "..", "..", "utils", "manifestPricing.js"),
);

const ORDER_ID = 79609;

(async () => {
  try {
    // 1. Traer de WooCommerce
    console.log(`📡 Trayendo pedido #${ORDER_ID} desde WooCommerce...`);
    const wooOrder = await WooCommerce.get(`orders/${ORDER_ID}`);
    const wooPath = path.join(__dirname, `woo-order-${ORDER_ID}.json`);
    fs.writeFileSync(wooPath, JSON.stringify(wooOrder.data, null, 2));
    console.log(`✅ WooCommerce guardado en: ${wooPath}`);

    // 2. Traer de Supabase
    console.log(`\n🔍 Buscando sesión que procesó el pedido #${ORDER_ID}...`);
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        "id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida",
      )
      .contains("ids_pedidos", [ORDER_ID])
      .order("fecha_fin", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      throw new Error(`No se encontró sesión para el pedido #${ORDER_ID}`);
    }

    const session = sessions[0];
    const sessionPath = path.join(
      __dirname,
      `supabase-session-${ORDER_ID}.json`,
    );
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    console.log(`✅ Sesión guardada en: ${sessionPath}`);
    console.log(`   Estado: ${session.estado} | Fecha: ${session.fecha_fin}`);

    // 3. Generar reporte de precios
    const order = session.datos_salida.orders.find(
      (o) => String(o.id) === String(ORDER_ID),
    );
    const items = order.items.filter(
      (i) => !i.is_shipping_method && !i.is_removed,
    );

    console.log("\n" + "═".repeat(100));
    console.log("  REPORTE DE PRECIOS WooCommerce — Pedido #" + ORDER_ID);
    console.log("═".repeat(100));
    console.log("");
    console.log("PRODUCTOS (ordenados por precio unitario):");
    console.log("─".repeat(100));

    const sortedItems = [...items].sort((a, b) => {
      const priceA = parseFloat(a.price) || parseFloat(a.line_total) || 0;
      const priceB = parseFloat(b.price) || parseFloat(b.line_total) || 0;
      return priceB - priceA;
    });

    sortedItems.forEach((item, idx) => {
      const sku = item.sku_final || item.sku || "?";
      const um = (item.unidad_medida || "UND").toUpperCase();
      const qty = item.qty || item.count || 1;
      const peso = parseFloat(item.peso_total) || 0;
      const price = parseFloat(item.price) || parseFloat(item.line_total) || 0;
      const lineTotal = calcLineCharge(item);

      const isPesable = peso > 0 && ["KL", "LB", "500GR"].includes(um);
      const flag = isPesable ? "⚖️" : "📦";

      let priceDisplay = "";
      if (isPesable) {
        if (um === "KL") {
          priceDisplay = `$${price.toLocaleString()}/kg`;
        } else if (um === "LB") {
          priceDisplay = `$${price.toLocaleString()}/500g`;
        }
      } else {
        priceDisplay = `$${price.toLocaleString()}/und`;
      }

      console.log(`${flag} ${item.name}`);
      console.log(
        `    SKU: ${sku.padEnd(15)} | Precio: ${priceDisplay.padEnd(15)} | Qty: ${qty} ${um} ${peso > 0 ? `(${peso}kg)` : ""} | Total: $${lineTotal.toLocaleString()}`,
      );
      if (idx < sortedItems.length - 1) console.log("");
    });

    const itemsTotal = items.reduce(
      (sum, item) => sum + calcLineCharge(item),
      0,
    );
    const shipping = (order.shipping_lines || []).reduce(
      (s, sh) => s + (parseFloat(sh.total) || 0),
      0,
    );

    console.log("\n" + "═".repeat(100));
    console.log("TOTALES:");
    console.log(`  Subtotal items:    $${itemsTotal.toLocaleString()}`);
    console.log(`  Shipping:          $${shipping.toLocaleString()}`);
    console.log(
      `  TOTAL WMS:         $${(itemsTotal + shipping).toLocaleString()}`,
    );
    console.log("═".repeat(100));

    console.log("\n📋 Para comparar con la factura física:");
    console.log(
      "  1. Completar tools/diag-79608/receipt-79609-template.js con los datos de la factura POS",
    );
    console.log("  2. Ejecutar: node tools/diag-79608/compare-79609-vs-pos.js");
    console.log("");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
