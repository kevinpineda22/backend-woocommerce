/**
 * SYNC PASILLO CACHE  (fuente: items_siesa — SIESA, directo del ERP)
 *
 * Puebla `sf_producto_pasillos` con el pasillo ya resuelto por (producto, sede).
 * La consume el backend Sin Filas al hacer checkout para guardar el pasillo de
 * cada ítem sin conocer la lógica de categorías.
 *
 * FUENTE DE CATEGORÍAS: `items_siesa.grupo` + `items_siesa.subgrupo` (taxonomía
 * SIESA, se actualiza a diario). Reemplaza a la antigua fuente WooCommerce: ya
 * no se pega a la API de Woo (sin paginación de productos ni jerarquía de
 * categorías). `mapeadorPasillos.js` sigue siendo el motor que mapea
 * categoría→pasillo POR SEDE; solo cambió qué se le da de comer.
 *
 * Para productos con grupo/subgrupo en null, el mapeador cae al match por
 * nombre (`f120_descripcion`), igual que antes.
 *
 * Uso:
 *   node tools/syncPasilloCache.js                # puebla todas las sedes activas
 *   node tools/syncPasilloCache.js barbosa        # solo una sede (por slug)
 *   node tools/syncPasilloCache.js --dry          # MIDE cobertura, NO escribe
 *   node tools/syncPasilloCache.js --dry barbosa  # mide una sede
 *
 * Requiere el .env del backend-woocommerce (Supabase service role).
 */

const { supabase } = require("../services/supabaseClient");
const { getAllSedesSinFilas } = require("../services/sedeConfig");
const { obtenerInfoPasillo, SEDES_CONFIG } = require("./mapeadorPasillos");

const UPSERT_BATCH = 500;
const SELECT_PAGE = 1000; // Supabase limita a 1000 filas por request.

/**
 * Trae TODOS los productos activos de items_siesa, paginando de a 1000.
 * Solo los campos que necesitamos (id, descripción, grupo, subgrupo).
 */
async function fetchAllItems() {
  const items = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("items_siesa")
      .select("f120_id, f120_descripcion, grupo, subgrupo")
      .eq("activo", true)
      .range(from, from + SELECT_PAGE - 1);

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data);
    if (data.length < SELECT_PAGE) break;
    from += SELECT_PAGE;
  }

  return items;
}

async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("sf_producto_pasillos")
      .upsert(batch, { onConflict: "f120_id,sede_slug" });
    if (error) throw error;
  }
}

/**
 * Vuelca el CATÁLOGO de pasillos de la sede (id + nombre + orden) a
 * `sf_sede_pasillos`, leyendo SEDES_CONFIG (estático). Es la fuente de verdad
 * que consume el editor de mapa del panel admin.
 */
async function seedSedePasillos(slug) {
  const config = SEDES_CONFIG[slug];
  if (!config) {
    console.log(`  · catálogo de pasillos omitido (slug sin SEDES_CONFIG)`);
    return 0;
  }

  const now = new Date().toISOString();
  const rows = config.pasillos.map((def) => ({
    sede_slug: slug,
    pasillo: def.pasillo,
    nombre: def.nombre,
    pasillo_orden: config.orden_ruta[def.pasillo] || config.orden_ruta["Otros"] || 99,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("sf_sede_pasillos")
    .upsert(rows, { onConflict: "sede_slug,pasillo" });
  if (error) throw error;

  console.log(`  ✓ catálogo: ${rows.length} pasillos`);
  return rows.length;
}

/**
 * Resuelve el pasillo de cada producto para una sede y devuelve filas + stats.
 * En modo dry NO escribe nada (ni catálogo ni cache); solo mide.
 */
async function syncSede(sede, items, dry) {
  const slug = sede.slug;
  console.log(`\n▶ Sede "${slug}" (${sede.nombre})`);

  if (!dry) await seedSedePasillos(slug);

  const rows = [];
  const stats = { total: items.length, sinCategoria: 0, otros: 0, porPasillo: {} };

  for (const it of items) {
    // grupo + subgrupo como pseudo-categorías para el mapeador.
    const categorias = [it.grupo, it.subgrupo]
      .filter(Boolean)
      .map((name) => ({ name }));
    if (categorias.length === 0) stats.sinCategoria += 1;

    const { pasillo, prioridad } = obtenerInfoPasillo(
      categorias,
      it.f120_descripcion || "",
      slug,
    );
    if (pasillo === "Otros") stats.otros += 1;
    stats.porPasillo[pasillo] = (stats.porPasillo[pasillo] || 0) + 1;

    rows.push({
      f120_id: it.f120_id,
      sede_slug: slug,
      pasillo,
      pasillo_orden: prioridad,
      nombre_producto: it.f120_descripcion || null,
    });
  }

  if (!dry) {
    await upsertRows(rows);
    console.log(`  ✓ ${rows.length} upserts en sf_producto_pasillos`);
  }

  // Reporte de cobertura (clave para decidir si el mapeo es bueno).
  const pct = (n) => `${((n / Math.max(1, stats.total)) * 100).toFixed(1)}%`;
  const clasificados = stats.total - stats.otros;
  console.log(
    `  📊 ${stats.total} productos · ${clasificados} en pasillo (${pct(clasificados)}) · ` +
      `${stats.otros} "Otros" (${pct(stats.otros)}) · ${stats.sinCategoria} sin grupo/subgrupo`,
  );

  return stats;
}

function printSedeBreakdown(slug, stats) {
  const top = Object.entries(stats.porPasillo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);
  console.log(`\n   Desglose por pasillo — ${slug}:`);
  top.forEach(([pasillo, n]) => {
    console.log(`     ${String(pasillo).padEnd(8)} ${n}`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const onlySlug = args.find((a) => !a.startsWith("--")) || null;

  if (dry) {
    console.log("🔍 MODO DRY-RUN — no se escribe nada, solo se mide la cobertura.\n");
  }

  const sedes = await getAllSedesSinFilas();
  const target = onlySlug ? sedes.filter((s) => s.slug === onlySlug) : sedes;

  if (target.length === 0) {
    console.error(
      onlySlug
        ? `No se encontró una sede (activa o sf_activa) con slug "${onlySlug}".`
        : "No hay sedes para Sin Filas.",
    );
    process.exit(1);
  }

  console.log("Leyendo items_siesa (activos)…");
  const items = await fetchAllItems();
  console.log(`  · ${items.length} productos activos en items_siesa`);

  console.log(
    `\nSincronizando pasillos para ${target.length} sede(s): ${target
      .map((s) => s.slug)
      .join(", ")}`,
  );

  for (const sede of target) {
    try {
      const stats = await syncSede(sede, items, dry);
      if (dry) printSedeBreakdown(sede.slug, stats);
    } catch (err) {
      console.error(`  ✗ Falló la sede "${sede.slug}":`, err.message || err);
    }
  }

  console.log(
    dry
      ? "\n✅ Dry-run listo. Revisá el % en \"Otros\". Si es bajo, corré sin --dry para poblar."
      : "\n✅ Listo. Cache poblada desde items_siesa.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Error fatal en syncPasilloCache:", err);
  process.exit(1);
});
