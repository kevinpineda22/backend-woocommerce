
const { calcLineCharge } = require('../utils/manifestPricing');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('tools/diag-79608/supabase-session-79609.json', 'utf8'));
const order = data.datos_salida.orders[0];

const productItems = (order.items || []).filter(
  (i) => !i.is_shipping_method && !i.is_removed,
);
const itemsTotal = productItems.reduce(
  (sum, item) => sum + calcLineCharge(item),
  0,
);
const shippingTotal = (order.shipping_lines || []).reduce(
  (sum, s) => sum + (parseFloat(s.total) || 0),
  0,
);
const calculatedTotal = itemsTotal + shippingTotal;

console.log('Items Total:', itemsTotal);
console.log('Shipping Total:', shippingTotal);
console.log('Calculated Total:', calculatedTotal);

// Check if any item in productItems has is_shipping_method undefined or false
const suspiciousItems = order.items.filter(i => !i.is_shipping_method);
console.log('Items without is_shipping_method count:', suspiciousItems.length);
console.log('Total items count:', order.items.length);

const shippingItem = order.items.find(i => i.is_shipping_method);
console.log('Shipping item in items list:', shippingItem);
