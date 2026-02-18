const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");

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
      
      // Filtrar códigos válidos:
      // 1. Eliminar códigos que terminen en '+'
      // 2. Eliminar códigos que empiecen con 'M' o 'N'
      // 3. Eliminar códigos con letras mezcladas
      const validCodes = codes.filter(code => {
        const cleaned = (code || "").toString().trim().toUpperCase();
        if (!cleaned || cleaned.length < 8) return false;
        if (cleaned.endsWith("+")) return false;
        if (cleaned.startsWith("M") || cleaned.startsWith("N")) return false;
        // Solo aceptar códigos numéricos puros
        return /^\d+$/.test(cleaned);
      });

      // Priorizar códigos EAN-13 (13 dígitos), luego cualquier código válido
      const ean13 = validCodes.find(c => c.length === 13);
      const firstValid = validCodes[0];
      
      barcodeMap[productId] = ean13 || firstValid || null;
    });

    return barcodeMap;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

exports.searchProduct = async (req, res) => {
  const { query, original_id } = req.query;
  try {
    let products = [];

    // SMART SUBSTITUTION
    if (original_id && !query) {
      const { data: original } = await WooCommerce.get(`products/${original_id}`);
      const originalPrice = parseFloat(original.price || 0);
      const validCategories = (original.categories || []).filter(c => c.name !== "Uncategorized" && c.slug !== "sin-categoria");
      const categoryIds = validCategories.map(c => c.id).join(",");

      let masterKeyword = original.name.trim().split(" ")[0].replace(/[^a-zA-Z0-9]/g, "");
      if (masterKeyword.length <= 3) masterKeyword = original.name.trim();

      const searchParams = { search: masterKeyword, per_page: 50, status: "publish", stock_status: "instock" };
      if (categoryIds) searchParams.category = categoryIds;

      const { data: searchResults } = await WooCommerce.get("products", searchParams);

      const minPrice = originalPrice * 0.6;
      const maxPrice = originalPrice * 1.4;

      products = searchResults.filter((p) => {
        if (p.id === parseInt(original_id)) return false;
        const pPrice = parseFloat(p.price || 0);
        if (originalPrice > 0 && pPrice > 0 && (pPrice < minPrice || pPrice > maxPrice)) return false;
        return true;
      });

      products.sort((a, b) => Math.abs(parseFloat(a.price||0) - originalPrice) - Math.abs(parseFloat(b.price||0) - originalPrice));

    } else if (query) {
      const { data: searchResults } = await WooCommerce.get("products", { search: query, per_page: 20, status: "publish", stock_status: "instock" });
      products = searchResults;
    }

    // ✅ OBTENER CÓDIGOS DE BARRAS DE SIESA
    const productIds = products.map(p => p.id);
    const barcodeMapSiesa = await getBarcodesFromSiesa(productIds);

    const results = products.map((p) => ({
        id: p.id, 
        name: p.name, 
        price: p.price, 
        image: p.images[0]?.src || null, 
        stock: p.stock_quantity, 
        sku: p.sku, 
        categories: p.categories,
        // ✅ PRIORIDAD: SIESA > WooCommerce meta_data > SKU
        barcode: barcodeMapSiesa[p.id] || p.meta_data?.find((m) => 
          ["ean", "barcode", "_ean", "_barcode"].includes(m.key.toLowerCase())
        )?.value || p.sku
    })).slice(0, 10);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Error búsqueda" });
  }
};