/**
 * repair-datos-salida.js
 *
 * Repara el campo `datos_salida` de sesiones de picking en Supabase.
 *
 * Qué corrige:
 *   1. Item de envío (is_shipping_method) con price: 0
 *      → Lee el total de shipping_lines del mismo order en el snapshot
 *   2. Items de producto con price: 0 o precio incorrecto
 *      → Re-fetches desde WooCommerce: effectivePrice = total / quantity
 *        (este es el precio post-ajuste de peso, exacto para facturación)
 *
 * Uso:
 *   node tools/repair-datos-salida.js <SESSION_ID> [SESSION_ID2 ...]
 *
 *   Si no se pasan SESSION_IDs, lista las últimas 20 sesiones con datos_salida
 *   y pregunta cuáles reparar (dry-run si se pasa --dry-run).
 *
 * Ejemplos:
 *   node tools/repair-datos-salida.js 1c1f76cc-1c57-4a50-b274-3633ae7dd67a
 *   node tools/repair-datos-salida.js 1c1f76cc-... abc123-... --dry-run
 *   node tools/repair-datos-salida.js --all --dry-run
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL_SESSIONS = args.includes("--all");
const SESSION_IDS = args.filter((a) => !a.startsWith("--"));

// ─── WooCommerce: importar el cliente multi-sede para poder consultar por sede ───
const { getWooClient } = require("../services/wooMultiService");

// ──────────────────────────────────────────────────────────────────────────────

async function fetchWooOrder(sedeId, orderId) {
  try {
    const client = await getWooClient(sedeId);
    const { data } = await client.get(`orders/${orderId}`);
    return data;
  } catch (e) {
    console.warn(
      `  ⚠️  No se pudo obtener pedido ${orderId} de WooCommerce: ${e.message}`,
    );
    return null;
  }
}

function buildSkuPriceMaps(wooOrder) {
  const skuEffective = {};
  const skuCatalog = {};
  if (!wooOrder?.line_items) return { skuEffective, skuCatalog };

  wooOrder.line_items.forEach((item) => {
    const effPrice =
      item.quantity > 0
        ? parseFloat(item.total) / item.quantity
        : parseFloat(item.price);
    const catPrice = parseFloat(item.price);
    if (item.sku) {
      skuEffective[item.sku] = effPrice;
      skuCatalog[item.sku] = catPrice;
    }
  });
  return { skuEffective, skuCatalog };
}

async function repairSession(session) {
  const snapshot = session.datos_salida;
  if (!snapshot?.orders?.length) {
    console.log(`  ↳ Sin orders en datos_salida, saltando.`);
    return false;
  }

  let changed = false;

  for (const order of snapshot.orders) {
    console.log(`  📦 Pedido #${order.id}`);

    // 1. Calcular total de shipping desde shipping_lines del snapshot
    const shippingPrice = (order.shipping_lines || []).reduce(
      (sum, s) => sum + (parseFloat(s.total) || 0),
      0,
    );

    // 2. Obtener precios reales de WooCommerce
    const wooOrder = await fetchWooOrder(session.sede_id, order.id);
    const { skuEffective, skuCatalog } = buildSkuPriceMaps(wooOrder);

    // 3. Reparar cada item
    order.items = order.items.map((item) => {
      // ── Ítem de envío ──
      if (item.is_shipping_method) {
        if ((parseFloat(item.price) || 0) === 0 && shippingPrice > 0) {
          console.log(
            `    🚚 ${item.name}: price 0 → $${shippingPrice.toLocaleString("es-CO")}`,
          );
          changed = true;
          return { ...item, price: shippingPrice };
        }
        return item;
      }

      // ── Ítem de producto ──
      const sku = item.sku;
      const newPrice = skuEffective[sku] ?? null;
      const newCatalog = skuCatalog[sku] ?? null;

      if (newPrice === null) {
        console.log(
          `    ⚠️  SKU ${sku || "(sin sku)"} — no encontrado en WooCommerce`,
        );
        return item;
      }

      const oldPrice = parseFloat(item.price) || 0;
      const oldCatalog = parseFloat(item.catalog_price) || 0;
      const priceChanged =
        Math.abs(oldPrice - newPrice) > 0.01 ||
        Math.abs(oldCatalog - (newCatalog ?? newPrice)) > 0.01;

      if (priceChanged) {
        console.log(
          `    🔧 ${item.name.substring(0, 40)} | price: $${oldPrice.toLocaleString("es-CO")} → $${newPrice.toLocaleString("es-CO")}`,
        );
        changed = true;
      }

      return {
        ...item,
        price: newPrice,
        catalog_price: newCatalog ?? newPrice,
      };
    });
  }

  return changed;
}

async function run() {
  console.log(`\n🔧 repair-datos-salida ${DRY_RUN ? "[DRY RUN]" : ""}\n`);

  // ── Obtener sesiones a reparar ──
  let sessions;

  if (ALL_SESSIONS) {
    const { data, error } = await sb
      .from("wc_picking_sessions")
      .select("id, sede_id, estado, datos_salida")
      .not("datos_salida", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    sessions = data;
    console.log(`Encontradas ${sessions.length} sesiones con datos_salida.\n`);
  } else if (SESSION_IDS.length > 0) {
    const { data, error } = await sb
      .from("wc_picking_sessions")
      .select("id, sede_id, estado, datos_salida")
      .in("id", SESSION_IDS);
    if (error) throw new Error(error.message);
    sessions = data;
  } else {
    // Sin argumentos: listar últimas 20 para revisión
    const { data, error } = await sb
      .from("wc_picking_sessions")
      .select("id, sede_id, estado, created_at")
      .not("datos_salida", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    console.log("Últimas sesiones con datos_salida:");
    data.forEach((s) =>
      console.log(`  ${s.id}  [${s.estado}]  ${s.created_at}`),
    );
    console.log(
      "\nUso: node tools/repair-datos-salida.js <SESSION_ID> [--dry-run]",
    );
    console.log("     node tools/repair-datos-salida.js --all [--dry-run]");
    return;
  }

  if (!sessions?.length) {
    console.log("No se encontraron sesiones.");
    return;
  }

  let totalFixed = 0;

  for (const session of sessions) {
    console.log(`\n📋 Sesión ${session.id} [${session.estado}]`);

    const changed = await repairSession(session);

    if (!changed) {
      console.log(`  ✅ Sin cambios necesarios.`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  🔍 [DRY RUN] Cambios detectados — no se guardaron.`);
      continue;
    }

    const { error } = await sb
      .from("wc_picking_sessions")
      .update({ datos_salida: session.datos_salida })
      .eq("id", session.id);

    if (error) {
      console.error(`  ❌ Error al guardar: ${error.message}`);
    } else {
      console.log(`  💾 datos_salida actualizado.`);
      totalFixed++;
    }
  }

  console.log(
    `\n✔  Listo. ${totalFixed} sesión(es) reparada(s).${DRY_RUN ? " [DRY RUN — nada fue guardado]" : ""}`,
  );
}

run().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
