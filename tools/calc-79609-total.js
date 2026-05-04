const fs = require('fs');
const path = require('path');
const { calcLineCharge } = require('../utils/manifestPricing');

const wooOrderStr = fs.readFileSync(path.join(__dirname, 'diag-79608', 'woo-order-79609.json'), 'utf-8');
const wooOrder = JSON.parse(wooOrderStr);

const supabaseSessionStr = fs.readFileSync(path.join(__dirname, 'diag-79608', 'supabase-session-79609.json'), 'utf-8');
const supabaseSession = JSON.parse(supabaseSessionStr);

// We want to simulate what the auditor outputs (generateOutputData) and the manifest calculation.
// Let's get the final snapshot from supabase session
const finalSnapshot = Array.isArray(supabaseSession) ? supabaseSession[0].datos_salida : supabaseSession.datos_salida;

if (finalSnapshot && finalSnapshot.orders) {
  finalSnapshot.orders.forEach(order => {
    let itemsTotal = 0;
    order.items.forEach(item => {
      if (!item.is_removed && !item.is_shipping_method) {
        // apply calcLineCharge
        const lineCharge = calcLineCharge(item);
        itemsTotal += lineCharge;
        console.log(`Item: ${item.name} | qty: ${item.qty} | peso: ${item.peso_total} | um: ${item.unidad_medida} | price: ${item.price} | line_total: ${item.line_total} -> Charge: ${lineCharge}`);
      }
    });
    console.log(`\nItems Total: ${itemsTotal}`);
    const shipping = order.items.find(i => i.is_shipping_method)?.price || 6000;
    console.log(`Shipping: ${shipping}`);
    console.log(`Manifest Grand Total: ${itemsTotal + shipping}`);
  });
} else {
  console.log("No datos_salida found.");
}
