// Script de diagnóstico (solo lectura).
// Trae los últimos pedidos y reporta cualquier meta_data relacionada con
// delivery / shipping date / cutoff / fecha entrega.
// Uso: node scripts/inspect-delivery-meta.js

const WooCommerce = require("../services/wooService");

const KEYWORDS = [
  "delivery",
  "shipping_date",
  "ship_date",
  "dispatch",
  "despacho",
  "entrega",
  "fecha",
  "cutoff",
  "orddd",
  "wcdp",
  "wc_od",
  "pickup_date",
  "preferred",
  "schedule",
];

const isInteresting = (key = "") => {
  const k = String(key).toLowerCase();
  return KEYWORDS.some((w) => k.includes(w));
};

(async () => {
  try {
    const { data: orders } = await WooCommerce.get("orders", {
      per_page: 10,
      orderby: "date",
      order: "desc",
    });

    console.log(`\nPedidos inspeccionados: ${orders.length}\n`);

    const allKeys = new Set();
    const matches = [];

    for (const order of orders) {
      const meta = order.meta_data || [];
      for (const m of meta) {
        allKeys.add(m.key);
        if (isInteresting(m.key)) {
          matches.push({
            order_id: order.id,
            created: order.date_created,
            key: m.key,
            value: typeof m.value === "object" ? JSON.stringify(m.value) : m.value,
          });
        }
      }
    }

    console.log("=== META KEYS QUE COINCIDEN CON DELIVERY/CUTOFF ===");
    if (matches.length === 0) {
      console.log("(ninguna)\n");
    } else {
      for (const m of matches) {
        console.log(`- Pedido ${m.order_id} (${m.created}) | ${m.key} = ${m.value}`);
      }
    }

    console.log("\n=== TODAS las meta_data keys vistas (para referencia) ===");
    console.log([...allKeys].sort().join("\n"));
  } catch (err) {
    console.error("ERROR:", err.response?.data || err.message);
    process.exit(1);
  }
})();
