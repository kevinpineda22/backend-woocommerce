/**
 * WOO MULTI-SERVICE — Clientes WooCommerce por sede (WordPress Multisite)
 *
 * Cada sede tiene su propio sub-sitio WooCommerce con URL independiente.
 * Las API keys (consumer_key/consumer_secret) son compartidas entre sub-sitios.
 *
 * USO:
 *   const { getWooClient, getAllWooClients, getOrderFromAnySede } = require('./wooMultiService');
 *
 *   // Para una sede específica:
 *   const client = await getWooClient(sedeId);
 *   const { data } = await client.get('orders', { status: 'processing' });
 *
 *   // Para TODAS las sedes:
 *   const allOrders = await fetchFromAllSedes('orders', { status: 'processing' });
 */

const WooCommerceRestApi = require("@woocommerce/woocommerce-rest-api").default;
require("dotenv").config();

const { getAllSedes } = require("./sedeConfig");

// Cache de clientes WooCommerce por URL (evita recrear instancias)
const clientCache = new Map();

// Cache de respuestas WooCommerce (TTL corto para evitar llamadas redundantes)
const responseCache = new Map();
const RESPONSE_CACHE_TTL = 15_000; // 15 segundos

function getCachedResponse(key) {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > RESPONSE_CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedResponse(key, data) {
  responseCache.set(key, { data, timestamp: Date.now() });
}

/** Invalida toda la caché de respuestas (llamar tras recibir webhook) */
function invalidateResponseCache() {
  responseCache.clear();
}

// ============================================================
// FACTORY: Crear/obtener cliente WooCommerce para una URL
// ============================================================
function getOrCreateClient(url) {
  if (!url) return null;

  // Normalizar URL (sin trailing slash)
  const normalizedUrl = url.replace(/\/+$/, "");

  if (clientCache.has(normalizedUrl)) {
    return clientCache.get(normalizedUrl);
  }

  const client = new WooCommerceRestApi({
    url: normalizedUrl,
    consumerKey: process.env.WC_CONSUMER_KEY,
    consumerSecret: process.env.WC_CONSUMER_SECRET,
    version: "wc/v3",
  });

  clientCache.set(normalizedUrl, client);
  return client;
}

// ============================================================
// CLIENTE DEFAULT (fallback al WC_URL original del .env)
// ============================================================
function getDefaultClient() {
  return getOrCreateClient(process.env.WC_URL);
}

// ============================================================
// CLIENTE POR SEDE_ID
// ============================================================
/**
 * Obtiene el cliente WooCommerce para una sede específica.
 * Si la sede no tiene wc_url, devuelve el cliente default.
 *
 * @param {string} sedeId - UUID de la sede
 * @returns {Promise<WooCommerceRestApi>}
 */
async function getWooClient(sedeId) {
  if (!sedeId) return getDefaultClient();

  const sedes = await getAllSedes();
  const sede = sedes.find((s) => s.id === sedeId);

  if (!sede || !sede.wc_url) {
    console.warn(
      `⚠️ [WOO-MULTI] Sede ${sedeId} sin wc_url, usando cliente default`,
    );
    return getDefaultClient();
  }

  return getOrCreateClient(sede.wc_url);
}

// ============================================================
// FETCH CACHEADO PARA UNA SEDE ESPECÍFICA
// ============================================================
async function fetchFromSede(sedeId, endpoint, params = {}) {
  const cacheKey = `sede:${sedeId || "default"}:${endpoint}:${JSON.stringify(params)}`;
  const cached = getCachedResponse(cacheKey);
  if (cached) return cached;

  const client = await getWooClient(sedeId);
  const { data } = await client.get(endpoint, params);
  setCachedResponse(cacheKey, data);
  return data;
}

// ============================================================
// TODOS LOS CLIENTES (para modo "todas las sedes")
// ============================================================
/**
 * Obtiene un array de { sedeId, sedeName, client } para TODAS las sedes activas.
 * Solo incluye sedes que tienen wc_url configurado.
 *
 * @returns {Promise<Array<{sedeId: string, sedeName: string, sedeSlug: string, client: WooCommerceRestApi}>>}
 */
async function getAllWooClients() {
  const sedes = await getAllSedes();

  return sedes
    .filter((s) => s.wc_url)
    .map((sede) => ({
      sedeId: sede.id,
      sedeName: sede.nombre,
      sedeSlug: sede.slug,
      client: getOrCreateClient(sede.wc_url),
    }));
}

// ============================================================
// FETCH DESDE TODAS LAS SEDES EN PARALELO
// ============================================================
/**
 * Ejecuta una consulta WooCommerce en TODAS las sedes en paralelo.
 * Cada resultado se tagea con _sede_id y _sede_name.
 *
 * @param {string} endpoint - Endpoint WooCommerce (ej: 'orders')
 * @param {Object} params - Parámetros de la consulta
 * @returns {Promise<Array>} - Resultados combinados de todas las sedes
 */
async function fetchFromAllSedes(endpoint, params = {}) {
  // Cache check
  const cacheKey = `all:${endpoint}:${JSON.stringify(params)}`;
  const cached = getCachedResponse(cacheKey);
  if (cached) return cached;

  const clients = await getAllWooClients();

  if (clients.length === 0) {
    console.warn("⚠️ [WOO-MULTI] No hay sedes con wc_url configurado");
    // Fallback: usar cliente default
    const defaultClient = getDefaultClient();
    if (defaultClient) {
      const { data } = await defaultClient.get(endpoint, params);
      return data;
    }
    return [];
  }

  const results = await Promise.allSettled(
    clients.map(async ({ sedeId, sedeName, client }) => {
      try {
        const { data } = await client.get(endpoint, params);
        // Tagear cada resultado con su sede de origen
        return data.map((item) => ({
          ...item,
          _sede_id: sedeId,
          _sede_name: sedeName,
        }));
      } catch (error) {
        console.error(
          `❌ [WOO-MULTI] Error obteniendo ${endpoint} de sede ${sedeName}:`,
          error.message,
        );
        return [];
      }
    }),
  );

  const combined = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  setCachedResponse(cacheKey, combined);
  return combined;
}

// ============================================================
// BUSCAR PEDIDO EN CUALQUIER SEDE (cuando no sabemos dónde está)
// ============================================================
/**
 * Intenta obtener un pedido por ID buscando en todas las sedes.
 * Útil para endpoints donde no se conoce la sede de origen.
 *
 * @param {string|number} orderId - ID del pedido en WooCommerce
 * @returns {Promise<{order: Object, sedeId: string, sedeName: string}|null>}
 */
async function getOrderFromAnySede(orderId) {
  const clients = await getAllWooClients();

  // Intentar en paralelo para velocidad
  const results = await Promise.allSettled(
    clients.map(async ({ sedeId, sedeName, client }) => {
      const { data } = await client.get(`orders/${orderId}`);
      return { order: data, sedeId, sedeName };
    }),
  );

  const found = results.find((r) => r.status === "fulfilled");
  return found ? found.value : null;
}

// ============================================================
// BUSCAR PRODUCTO EN CUALQUIER SEDE
// ============================================================
/**
 * Busca un producto por ID en la sede indicada, o fallback a cualquier sede.
 */
async function getProductFromSede(productEndpoint, params, sedeId) {
  try {
    const client = await getWooClient(sedeId);
    const { data } = await client.get(productEndpoint, params);
    return data;
  } catch (error) {
    console.error(
      `❌ [WOO-MULTI] Error buscando producto en sede ${sedeId}:`,
      error.message,
    );
    return null;
  }
}

module.exports = {
  getWooClient,
  getDefaultClient,
  getAllWooClients,
  fetchFromAllSedes,
  fetchFromSede,
  getOrderFromAnySede,
  getProductFromSede,
  getOrCreateClient,
  invalidateResponseCache,
};
