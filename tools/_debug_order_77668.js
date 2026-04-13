// Script de diagnostico temporal - pedido #77668
// Uso: node tools/_debug_order_77668.js
// Intenta en la tienda default (WC_URL). Si falla, el pedido esta en otra sede.

const WooCommerce = require("../services/wooService");

const ORDER_ID = 77668;

async function main() {
  try {
    const { data: order } = await WooCommerce.get(`orders/${ORDER_ID}`);

    console.log("===== ORDEN =====");
    console.log("ID:", order.id);
    console.log("Status:", order.status);
    console.log("Customer:", order.billing?.first_name, order.billing?.last_name);
    console.log("Total Woo:", order.total, order.currency);
    console.log("Subtotal tax:", order.total_tax);
    console.log("Shipping total:", order.shipping_total);
    console.log("Discount total:", order.discount_total);
    console.log("Cart tax:", order.cart_tax);
    console.log("Fees total:", (order.fee_lines || []).reduce((s, f) => s + parseFloat(f.total || 0), 0));
    console.log("Line items:", order.line_items.length);
    console.log();

    // Meta data relevante (sede, etc.)
    console.log("===== META DATA DEL PEDIDO =====");
    (order.meta_data || []).forEach((m) => {
      if (!/^_/.test(m.key) || /sede|branch|pickup|location|store/i.test(m.key)) {
        console.log(`  ${m.key}:`, JSON.stringify(m.value).slice(0, 120));
      }
    });
    console.log();

    console.log("===== LINE ITEMS (detalle) =====");
    let sumLineTotals = 0;
    let sumLineSubtotals = 0;
    order.line_items.forEach((li, i) => {
      const total = parseFloat(li.total || 0);
      const subtotal = parseFloat(li.subtotal || 0);
      const tax = parseFloat(li.total_tax || 0);
      sumLineTotals += total + tax;
      sumLineSubtotals += subtotal;

      // Meta data del item (peso, unidad_medida, etc.)
      const metaSummary = {};
      (li.meta_data || []).forEach((m) => {
        if (/peso|weight|unidad|medida|barcode|ean|sku/i.test(m.key)) {
          metaSummary[m.key] = m.value;
        }
      });

      console.log(
        `${String(i + 1).padStart(2, " ")}. [${li.id}] qty=${li.quantity}  sku=${li.sku || "(no-sku)"}  ` +
          `name="${(li.name || "").slice(0, 50)}"  ` +
          `price=${li.price}  subtotal=${subtotal}  total=${total}  tax=${tax}`
      );
      if (li.variation_id) console.log(`     variation_id=${li.variation_id} product_id=${li.product_id}`);
      if (Object.keys(metaSummary).length)
        console.log("     meta:", JSON.stringify(metaSummary));
    });
    console.log();
    console.log("Suma line_total+tax:", sumLineTotals);
    console.log("Suma subtotales:    ", sumLineSubtotals);
    console.log("Total Woo declarado:", order.total);

    // Dump completo por si queremos revisar
    require("fs").writeFileSync(
      "tools/_debug_order_77668.json",
      JSON.stringify(order, null, 2)
    );
    console.log("\nDump completo en tools/_debug_order_77668.json");
  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
    process.exit(1);
  }
}

main();
