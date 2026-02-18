const WooCommerce = require("../services/wooService");

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

    const results = products.map((p) => ({
        id: p.id, 
        name: p.name, 
        price: p.price, 
        image: p.images[0]?.src || null, 
        stock: p.stock_quantity, 
        sku: p.sku, 
        categories: p.categories,
        barcode: p.meta_data?.find((m) => 
          ["ean", "barcode", "_ean", "_barcode"].includes(m.key.toLowerCase())
        )?.value || ""  // ✅ AGREGAR código de barras
    })).slice(0, 10);

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Error búsqueda" });
  }
};