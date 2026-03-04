/**
 * CONFIGURACIÓN MULTI-SEDE
 *
 * Este archivo centraliza toda la lógica de detección y manejo de sedes.
 * Aquí defines:
 *   1. Qué campos de meta_data buscar en pedidos de WooCommerce
 *   2. Cómo mapear esos valores a tus sedes en Supabase
 *   3. Cache en memoria para evitar consultas repetitivas
 */

const { supabase } = require("./supabaseClient");

// ============================================================
// 1. CONFIGURACIÓN DE DETECCIÓN DE SEDE EN PEDIDOS WOOCOMMERCE
// ============================================================
// Lista ORDENADA de campos meta_data a buscar en un pedido de WooCommerce.
// El sistema probará cada uno en orden hasta encontrar un valor.
// ⚠️ IMPORTANTE: Debes ajustar estos nombres según tu plugin de multisede.
//    Usa GET /api/orders/espiar-pedido/:id para descubrir el nombre real.
const WOO_SEDE_META_KEYS = [
  "_sede",
  "sede",
  "_branch",
  "branch",
  "_pickup_location",
  "pickup_location_id",
  "pickup_location",
  "_store_location",
  "store_location",
  "_delivery_location",
  "_local",
  "local",
  "_sucursal",
  "sucursal",
  // Plugins comunes de multisede WooCommerce:
  "_wcfmmp_order_store", // WCFM Marketplace
  "_dokan_vendor_id", // Dokan
  "ywraq_vendor_id", // YITH
  "_wc_pickup_store", // WC Pickup Store
];

// ============================================================
// 2. CACHE EN MEMORIA DE SEDES (evita consultas repetidas)
// ============================================================
let sedesCache = null;
let sedesCacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Obtener todas las sedes activas (con cache en memoria)
 */
async function getAllSedes() {
  const now = Date.now();
  if (sedesCache && now < sedesCacheExpiry) {
    return sedesCache;
  }

  const { data, error } = await supabase
    .from("wc_sedes")
    .select("*")
    .eq("activa", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error obteniendo sedes:", error);
    return sedesCache || []; // Devolver cache viejo si hay error
  }

  sedesCache = data;
  sedesCacheExpiry = now + CACHE_TTL_MS;
  return data;
}

/**
 * Obtener una sede por su ID
 */
async function getSedeById(sedeId) {
  if (!sedeId) return null;
  const sedes = await getAllSedes();
  return sedes.find((s) => s.id === sedeId) || null;
}

/**
 * Obtener una sede por su slug
 */
async function getSedeBySlug(slug) {
  if (!slug) return null;
  const sedes = await getAllSedes();
  return sedes.find((s) => s.slug === slug) || null;
}

/**
 * Invalidar cache (llamar cuando se modifican sedes)
 */
function invalidateSedeCache() {
  sedesCache = null;
  sedesCacheExpiry = 0;
}

// ============================================================
// 3. DETECCIÓN DE SEDE EN UN PEDIDO DE WOOCOMMERCE
// ============================================================

/**
 * Extrae el identificador de sede de un pedido de WooCommerce.
 * Busca en meta_data, shipping, billing y campos personalizados.
 *
 * @param {Object} wooOrder - Pedido completo de la API de WooCommerce
 * @returns {string|null} - Valor del meta_data que identifica la sede, o null
 */
function extractSedeFromOrder(wooOrder) {
  if (!wooOrder) return null;

  // A. Buscar en meta_data del pedido
  if (wooOrder.meta_data && Array.isArray(wooOrder.meta_data)) {
    for (const metaKey of WOO_SEDE_META_KEYS) {
      const found = wooOrder.meta_data.find(
        (m) => m.key === metaKey || m.key === metaKey.replace(/^_/, ""),
      );
      if (found && found.value) {
        return String(found.value).trim();
      }
    }
  }

  // B. Buscar en fee_lines (algunos plugins usan esto)
  if (wooOrder.fee_lines && Array.isArray(wooOrder.fee_lines)) {
    for (const fee of wooOrder.fee_lines) {
      if (fee.meta_data) {
        for (const metaKey of WOO_SEDE_META_KEYS) {
          const found = fee.meta_data.find((m) => m.key === metaKey);
          if (found && found.value) return String(found.value).trim();
        }
      }
    }
  }

  // C. Buscar en shipping_lines (local_pickup con ubicación)
  if (wooOrder.shipping_lines && Array.isArray(wooOrder.shipping_lines)) {
    for (const ship of wooOrder.shipping_lines) {
      // Algunos plugins guardan la sede en el instance_id o en meta_data de shipping
      if (ship.meta_data) {
        const locationMeta = ship.meta_data.find(
          (m) =>
            m.key === "pickup_location" ||
            m.key === "_pickup_location" ||
            m.key === "sede",
        );
        if (locationMeta && locationMeta.value) {
          return String(locationMeta.value).trim();
        }
      }
    }
  }

  return null; // No se encontró metadata de sede
}

/**
 * Resuelve el sede_id (UUID de Supabase) a partir de un valor de WooCommerce.
 * Compara el valor extraído contra el woo_meta_match de cada sede.
 *
 * @param {string} wooSedeValue - Valor crudo extraído del pedido (ej: "norte", "sede-1", "123")
 * @returns {Promise<string|null>} - UUID de la sede en Supabase, o null
 */
async function resolveSedeId(wooSedeValue) {
  if (!wooSedeValue) return null;

  const sedes = await getAllSedes();
  const normalizedValue = wooSedeValue.toLowerCase().trim();

  for (const sede of sedes) {
    const match = sede.woo_meta_match || {};

    // Comparación 1: meta_value exacto
    if (
      match.meta_value &&
      match.meta_value.toLowerCase().trim() === normalizedValue
    ) {
      return sede.id;
    }

    // Comparación 2: slug de la sede
    if (sede.slug.toLowerCase() === normalizedValue) {
      return sede.id;
    }

    // Comparación 3: nombre de la sede (parcial)
    if (
      sede.nombre.toLowerCase().includes(normalizedValue) ||
      normalizedValue.includes(sede.nombre.toLowerCase())
    ) {
      return sede.id;
    }

    // Comparación 4: meta_values como array (si el campo tiene múltiples valores)
    if (match.meta_values && Array.isArray(match.meta_values)) {
      if (
        match.meta_values.some(
          (v) => v.toLowerCase().trim() === normalizedValue,
        )
      ) {
        return sede.id;
      }
    }
  }

  console.warn(
    `⚠️ [SEDE] No se pudo resolver sede para valor WooCommerce: "${wooSedeValue}"`,
  );
  return null;
}

/**
 * Función completa: Extrae y resuelve la sede de un pedido WooCommerce.
 *
 * @param {Object} wooOrder - Pedido completo de la API de WooCommerce
 * @returns {Promise<{sede_id: string|null, sede_raw_value: string|null}>}
 */
async function getSedeFromWooOrder(wooOrder) {
  const rawValue = extractSedeFromOrder(wooOrder);
  const sedeId = await resolveSedeId(rawValue);

  return {
    sede_id: sedeId,
    sede_raw_value: rawValue,
  };
}

// ============================================================
// 4. HELPER: Obtener sede_id del picker
// ============================================================
async function getPickerSedeId(pickerId) {
  if (!pickerId) return null;

  const { data, error } = await supabase
    .from("wc_pickers")
    .select("sede_id")
    .eq("id", pickerId)
    .single();

  if (error || !data) return null;
  return data.sede_id;
}

/**
 * Obtener sede_id de un usuario por su email (buscando en profiles)
 */
async function getUserSedeId(email) {
  if (!email) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("sede_id")
    .eq("correo", email)
    .maybeSingle();

  if (error || !data) return null;
  return data.sede_id;
}

module.exports = {
  WOO_SEDE_META_KEYS,
  getAllSedes,
  getSedeById,
  getSedeBySlug,
  invalidateSedeCache,
  extractSedeFromOrder,
  resolveSedeId,
  getSedeFromWooOrder,
  getPickerSedeId,
  getUserSedeId,
};
