const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");

// Multi-sede WooCommerce (WordPress Multisite)
const { getWooClient } = require("../services/wooMultiService");

// ✅ HELPER: Obtener códigos de barras desde SIESA (con filtrado inteligente)
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    // Agrupar por producto y filtrar códigos válidos
    const barcodesByProduct = {};
    barcodes.forEach((bc) => {
      if (!barcodesByProduct[bc.f120_id]) {
        barcodesByProduct[bc.f120_id] = [];
      }
      barcodesByProduct[bc.f120_id].push(bc.codigo_barras);
    });

    // Seleccionar el mejor código de barras por producto
    const barcodeMap = {};
    Object.keys(barcodesByProduct).forEach((productId) => {
      const codes = barcodesByProduct[productId];

      // Limpiar y filtrar códigos válidos:
      // 1. Preservar '+' del final (algunos productos SIESA lo necesitan en POS)
      // 2. Eliminar códigos que empiecen con 'M' o 'N'
      // 3. Aceptar códigos numéricos puros o numéricos con '+' al final
      const validCodes = codes
        .map((code) => (code || "").toString().trim())
        .filter((cleaned) => {
          if (!cleaned || cleaned.replace(/\+$/, "").length < 8) return false;
          if (
            cleaned.toUpperCase().startsWith("M") ||
            cleaned.toUpperCase().startsWith("N")
          )
            return false;
          // Aceptar dígitos con '+' opcional al final
          return /^\d+\+?$/.test(cleaned);
        });

      // Priorizar EAN-13 (parte numérica = 13 dígitos), luego cualquier código válido
      const ean13 = validCodes.find((c) => c.replace(/\+$/, "").length === 13);
      const firstValid = validCodes[0];

      barcodeMap[productId] = ean13 || firstValid || null;
    });

    return barcodeMap;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

// ✅ NUEVO: Endpoint estricto para recuperar la base EAN de Fruver (ej: 2900002)
exports.getBaseEanFruver = async (req, res) => {
  const { sku } = req.params;
  if (!sku) return res.status(400).json({ error: "SKU requerido" });

  // Extraer solo la parte numérica del SKU (ej: "6857-LB" -> "6857")
  const numericSku = sku.split("-")[0];

  try {
    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("codigo_barras")
      .eq("f120_id", numericSku)
      .like("codigo_barras", "29%");

    if (error) throw error;
    if (!barcodes || barcodes.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró base EAN para este producto Fruver." });
    }

    // Filtramos estrictamente los códigos que tienen exactamente 7 dígitos y empiezan en 29
    const validBase = barcodes.find(
      (b) =>
        b.codigo_barras &&
        b.codigo_barras.trim().length === 7 &&
        /^\d+$/.test(b.codigo_barras.trim()),
    );

    if (validBase) {
      return res.status(200).json({ baseEAN: validBase.codigo_barras.trim() });
    } else {
      return res.status(404).json({
        error:
          "Se encontraron códigos 29, pero ninguno de exactamente 7 dígitos.",
      });
    }
  } catch (error) {
    console.error("Error obteniendo base EAN Fruver:", error);
    res.status(500).json({
      error: `Error al buscar código EAN Fruver para SKU ${sku}: ${error.message || "Servicio no disponible"}`,
    });
  }
};

exports.searchProduct = async (req, res) => {
  const { query, original_id } = req.query;
  try {
    let products = [];

    // Multi-sede: usar el cliente WC de la sede actual
    const prodClient = await getWooClient(req.sedeId);

    // SMART SUBSTITUTION
    if (original_id && !query) {
      const { data: original } = await prodClient.get(
        `products/${original_id}`,
      );
      const originalPrice = parseFloat(original.price || 0);
      const validCategories = (original.categories || []).filter(
        (c) => c.name !== "Uncategorized" && c.slug !== "sin-categoria",
      );
      const categoryIds = validCategories.map((c) => c.id).join(",");

      let masterKeyword = original.name
        .trim()
        .split(" ")[0]
        .replace(/[^a-zA-Z0-9]/g, "");
      if (masterKeyword.length <= 3) masterKeyword = original.name.trim();

      const searchParams = {
        search: masterKeyword,
        per_page: 50,
        status: "publish",
        stock_status: "instock",
      };
      if (categoryIds) searchParams.category = categoryIds;

      const { data: searchResults } = await prodClient.get(
        "products",
        searchParams,
      );

      const minPrice = originalPrice * 0.6;
      const maxPrice = originalPrice * 1.4;

      products = searchResults.filter((p) => {
        if (p.id === parseInt(original_id)) return false;
        const pPrice = parseFloat(p.price || 0);
        if (
          originalPrice > 0 &&
          pPrice > 0 &&
          (pPrice < minPrice || pPrice > maxPrice)
        )
          return false;
        return true;
      });

      products.sort(
        (a, b) =>
          Math.abs(parseFloat(a.price || 0) - originalPrice) -
          Math.abs(parseFloat(b.price || 0) - originalPrice),
      );
    } else if (query) {
      let isBarcodeSearch = false;

      // ✅ Si parece un código de barras (solo números y largo > 7), buscar en SIESA primero
      if (/^\d{7,}$/.test(query)) {
        try {
          const { data: siesaBarcodes } = await supabase
            .from("siesa_codigos_barras")
            .select("f120_id")
            .eq("codigo_barras", query)
            .limit(1);

          if (siesaBarcodes && siesaBarcodes.length > 0) {
            // Encontramos el SKU en SIESA, consultamos Woo por ese SKU (o Sku list si hay varios, usando sku del primero)
            const targetSku = siesaBarcodes[0].f120_id;
            const { data: searchResults } = await prodClient.get("products", {
              sku: targetSku,
              status: "publish",
              stock_status: "instock",
            });
            if (searchResults && searchResults.length > 0) {
              products = searchResults;
              isBarcodeSearch = true;
            }
          }
        } catch (e) {
          console.error("Error buscando por barcode en SIESA", e);
        }
      }

      // Fallback a búsqueda normal por texto si no era código de barras o no se encontró
      if (!isBarcodeSearch) {
        const { data: searchResults } = await prodClient.get("products", {
          search: query,
          per_page: 20,
          status: "publish",
          stock_status: "instock",
        });

        // Si no se encontraron por `search`, y parece un código de producto exacto (SKU), intentamos exacto
        if (searchResults.length === 0 && /^[a-zA-Z0-9]+$/.test(query)) {
          const { data: skuResults } = await prodClient.get("products", {
            sku: query,
            status: "publish",
            stock_status: "instock",
          });
          if (skuResults && skuResults.length > 0) {
            products = skuResults;
          } else {
            products = [];
          }
        } else {
          products = searchResults;
        }
      }
    }

    // ✅ OBTENER CÓDIGOS DE BARRAS DE SIESA (por SKU, no por product_id)
    const skuList = Array.from(
      new Set(
        products.map((p) => parseInt(p.sku)).filter((sku) => !isNaN(sku)),
      ),
    );
    const barcodeMapSiesa = await getBarcodesFromSiesa(skuList);

    const results = products
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.images[0]?.src || null,
        stock: p.stock_quantity,
        sku: p.sku,
        categories: p.categories,
        // ✅ PRIORIDAD: SIESA (por SKU) > WooCommerce meta_data > SKU
        barcode:
          barcodeMapSiesa[parseInt(p.sku)] ||
          p.meta_data?.find((m) =>
            ["ean", "barcode", "_ean", "_barcode"].includes(
              m.key.toLowerCase(),
            ),
          )?.value ||
          p.sku,
      }))
      .slice(0, 10);

    res.status(200).json(results);
  } catch (error) {
    console.error("Error searchProduct:", error.message || error);
    res.status(500).json({
      error: `Error al buscar productos: ${error.message || "Servicio no disponible"}`,
    });
  }
};
