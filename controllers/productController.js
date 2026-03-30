const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");

// Multi-sede WooCommerce (WordPress Multisite)
const { getWooClient } = require("../services/wooMultiService");

// ✅ HELPER: Obtener códigos de barras desde SIESA (un barcode EAN-13 preferido por f120_id)
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras, unidad_medida")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    const barcodeMap = {};
    barcodes.forEach((bc) => {
      const code = (bc.codigo_barras || "").toString().trim();
      const cleaned = code.replace(/\+$/, "");
      if (!cleaned || cleaned.length < 8) return;
      if (cleaned.toUpperCase().startsWith("M") || cleaned.toUpperCase().startsWith("N")) return;
      if (!/^\d+\+?$/.test(code)) return;

      // Priorizar EAN-13
      if (!barcodeMap[bc.f120_id] || cleaned.length === 13) {
        barcodeMap[bc.f120_id] = cleaned;
      }
    });

    return barcodeMap;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

// ✅ Consulta SIESA para obtener el código GS1 real (prefijo "29") de un producto pesable.
exports.getBaseEanFruver = async (req, res) => {
  const { sku } = req.params;
  if (!sku) return res.status(400).json({ error: "SKU requerido" });

  const numericMatch = sku.match(/^(\d+)/);
  const numericSku = numericMatch ? numericMatch[1] : sku.split("-")[0];

  if (!numericSku || isNaN(parseInt(numericSku))) {
    return res.status(400).json({ error: "SKU no contiene un f120_id numérico válido." });
  }

  try {
    const { data: siesaRows, error } = await supabase
      .from("siesa_codigos_barras")
      .select("codigo_barras, unidad_medida")
      .eq("f120_id", parseInt(numericSku));

    if (error) {
      console.error("Error consultando SIESA para base EAN fruver:", error);
    }

    let gs1Code = null;
    if (siesaRows && siesaRows.length > 0) {
      const gs1Row = siesaRows.find((row) => {
        const code = (row.codigo_barras || "").toString().trim().replace(/\+$/, "");
        return code.startsWith("29") && /^\d+$/.test(code);
      });
      if (gs1Row) {
        gs1Code = gs1Row.codigo_barras.toString().trim().replace(/\+$/, "");
      }
    }

    if (gs1Code) {
      return res.status(200).json({ baseEAN: gs1Code, source: "siesa" });
    }

    const baseEAN = "29" + numericSku.padStart(5, "0").slice(-5);
    return res.status(200).json({ baseEAN, source: "generated" });
  } catch (err) {
    console.error("Error en getBaseEanFruver:", err);
    const baseEAN = "29" + numericSku.padStart(5, "0").slice(-5);
    return res.status(200).json({ baseEAN, source: "fallback" });
  }
};

// ✅ BÚSQUEDA INTELIGENTE DE SUSTITUTOS
// Busca por: nombre, SKU/item, código de barras (SIESA)
// Devuelve stock real incluso para productos con variaciones
exports.searchProduct = async (req, res) => {
  const { query, original_id } = req.query;
  try {
    let products = [];

    // Multi-sede: usar el cliente WC de la sede actual
    const prodClient = await getWooClient(req.sedeId);

    // === SUGERENCIAS AUTOMÁTICAS (sin query, con original_id) ===
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

    // === BÚSQUEDA MANUAL ===
    } else if (query) {
      const cleanQuery = query.trim();
      const isNumeric = /^\d+$/.test(cleanQuery);
      let found = false;

      // ✅ RUTA 1: Si es numérico → buscar por SKU en WooCommerce Y por barcode en SIESA
      if (isNumeric) {
        const [skuResponse, siesaResponse] = await Promise.all([
          // Buscar por SKU directo en WooCommerce
          prodClient.get("products", {
            sku: cleanQuery,
            status: "publish",
          }).catch(() => ({ data: [] })),
          // Buscar por código de barras exacto en SIESA (con y sin +)
          supabase
            .from("siesa_codigos_barras")
            .select("f120_id")
            .or(`codigo_barras.eq.${cleanQuery},codigo_barras.eq.${cleanQuery}+`)
            .limit(5)
            .then((r) => r.data || [])
            .catch(() => []),
        ]);

        const skuResults = skuResponse.data || [];
        if (skuResults.length > 0) {
          products = skuResults;
          found = true;
        }

        // Si barcode encontrado en SIESA, buscar por f120_id como SKU en WooCommerce
        if (!found && siesaResponse.length > 0) {
          const f120Ids = [...new Set(siesaResponse.map((r) => r.f120_id))];
          for (const f120Id of f120Ids) {
            try {
              const { data: wooProducts } = await prodClient.get("products", {
                sku: String(f120Id),
                status: "publish",
              });
              if (wooProducts && wooProducts.length > 0) {
                products.push(...wooProducts);
                found = true;
              }
            } catch (e) {
              console.warn(`Error buscando f120_id ${f120Id} en WC:`, e.message);
            }
          }
        }
      }

      // ✅ RUTA 2: Búsqueda por texto (nombre del producto)
      if (!found) {
        const { data: searchResults } = await prodClient.get("products", {
          search: cleanQuery,
          per_page: 20,
          status: "publish",
        });

        if (searchResults && searchResults.length > 0) {
          products = searchResults;
        } else if (/^[a-zA-Z0-9\-]+$/.test(cleanQuery)) {
          // Último intento: búsqueda exacta por SKU alfanumérico
          const { data: skuResults } = await prodClient.get("products", {
            sku: cleanQuery,
            status: "publish",
          });
          if (skuResults && skuResults.length > 0) {
            products = skuResults;
          }
        }
      }

      // Deduplicar por ID
      const seen = new Set();
      products = products.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    }

    // ✅ REEMPLAZAR PRODUCTOS VARIABLES CON SUS VARIACIONES
    // En lugar de sumar stock (que es impreciso), mostrar cada variación como producto separado
    const variableProducts = products.filter((p) => p.type === "variable");
    const expandedProducts = [...products.filter((p) => p.type !== "variable")];

    if (variableProducts.length > 0) {
      await Promise.all(
        variableProducts.map(async (vp) => {
          try {
            const { data: variations } = await prodClient.get(
              `products/${vp.id}/variations`,
              { per_page: 100 },
            );
            if (variations && variations.length > 0) {
              // Agregar cada variación como producto separado
              variations.forEach((v) => {
                if (v.status === "publish") {
                  expandedProducts.push(v);
                }
              });
            }
          } catch (e) {
            console.warn(
              `Error obteniendo variaciones de producto ${vp.id}:`,
              e.message,
            );
          }
        }),
      );
    }

    // Reemplazar products con la lista expandida
    products = expandedProducts;

    // ✅ OBTENER CÓDIGOS DE BARRAS DE SIESA
    const skuList = Array.from(
      new Set(
        products.map((p) => parseInt(p.sku)).filter((sku) => !isNaN(sku)),
      ),
    );
    const barcodeMapSiesa = await getBarcodesFromSiesa(skuList);

    const results = products
      .map((p) => {
        // Para variaciones, obtener unidad_medida de attributes; para productos simples, de meta_data
        let unidadMedida = null;
        if (p.attributes && Array.isArray(p.attributes)) {
          // Es una variación: buscar en attributes (ej: "Presentación: Dúo")
          const presentationAttr = p.attributes.find(
            (a) =>
              a.name?.toLowerCase().includes("presentación") ||
              a.slug?.includes("presentacion"),
          );
          if (presentationAttr) {
            unidadMedida = presentationAttr.option;
          }
        }
        // Si no encontró en attributes, buscar en meta_data
        if (!unidadMedida) {
          unidadMedida =
            p.meta_data?.find((m) => m.key === "pa_unidad-de-medida-aproximado")
              ?.display_value || null;
        }

        return {
          id: p.id,
          name: p.name,
          price: p.price,
          image: p.images?.[0]?.src || null,
          stock: p.stock_quantity ?? 0,
          sku: p.sku,
          categories: p.categories,
          unidad_medida: unidadMedida,
          // ✅ PRIORIDAD: SIESA > WooCommerce meta_data > SKU
          barcode:
            barcodeMapSiesa[parseInt(p.sku)] ||
            p.meta_data?.find((m) =>
              ["ean", "barcode", "_ean", "_barcode"].includes(
                m.key.toLowerCase(),
              ),
            )?.value ||
            p.sku,
        };
      })
      .slice(0, 15);

    res.status(200).json(results);
  } catch (error) {
    console.error("Error searchProduct:", error.message || error);
    res.status(500).json({
      error: `Error al buscar productos: ${error.message || "Servicio no disponible"}`,
    });
  }
};
