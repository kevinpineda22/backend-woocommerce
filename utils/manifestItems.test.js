import { describe, it, expect } from "vitest";
import { buildManifestItems } from "./manifestItems";
import { buildShippingItem } from "./shippingMethod";

// =====================================================================
// Guarda de regresión del manifiesto / QR de salida.
//
// Los bloques REGRESIÓN corresponden a productos que la caja leyó
// duplicados o que nunca leyó. Si uno se pone rojo, el bug volvió.
//
// Formato de línea QR (ver utils/shippingMethod.test.js):
//   "<qty>*<codigo>"   o solo "<codigo>" para el ítem de despacho.
// =====================================================================

const qrLine = (item) =>
  item.is_shipping_method
    ? item.barcode
    : `${item.qty}*${item.codigo_manifiesto}`;

// Solo entran al QR los ítems con código resoluble.
const qrDeSesion = (items) => items.filter((i) => i.codigo_manifiesto).map(qrLine);

// ---------------------------------------------------------------------
// REGRESIÓN — duplicación de productos variables
// ---------------------------------------------------------------------
describe("REGRESIÓN — una línea de pedido emite UNA sola línea de QR", () => {
  const ordersData = [
    {
      id: 900,
      items: [
        {
          id: 5,
          product_id: 111,
          variation_id: 222,
          sku: "185325",
          name: "Bandeja Tomate Cherry Grande",
          quantity: 2,
        },
      ],
    },
  ];
  // products_map indexa la MISMA entrada bajo los dos ids: así llega del
  // controller, y así hacía que el QR emitiera el producto dos veces.
  const detalle = { unidad_medida: "UND", unidad_medida_confiable: true, barcode: "7702004009999" };
  const productDetailsMap = { 111: detalle, 222: { ...detalle } };

  it("un producto VARIABLE ya no sale duplicado", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap });
    expect(items).toHaveLength(1);
    expect(qrDeSesion(items)).toEqual(["2*7702004009999"]);
  });

  it("la clave identifica la línea dentro de su pedido", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap });
    expect(items[0].key).toBe("900-5");
  });

  it("un producto simple sigue emitiendo una línea", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Simple", quantity: 1 }] },
      ],
      productDetailsMap: { 111: detalle },
    });
    expect(qrDeSesion(items)).toEqual(["1*7702004009999"]);
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — el mismo producto en dos pedidos
// ---------------------------------------------------------------------
describe("REGRESIÓN — el mismo producto en dos pedidos emite DOS líneas", () => {
  const detalle = { unidad_medida: "UND", unidad_medida_confiable: true, barcode: "7702004009999" };
  const ordersData = [
    { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 2 }] },
    { id: 901, items: [{ id: 9, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 5 }] },
  ];

  it("no colapsa: cada pedido conserva su cantidad", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap: { 111: detalle } });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.qty)).toEqual([2, 5]);
    // Antes `products_map` guardaba una sola entrada y ganaba el último
    // pedido: el primero se facturaba con la cantidad del segundo.
  });

  it("el mismo código en pedidos DISTINTOS no es colisión", () => {
    const { warnings } = buildManifestItems({ ordersData, productDetailsMap: { 111: detalle } });
    expect(warnings.colisiones).toEqual([]);
    // La caja factura pedido por pedido: es correcto.
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — colisiones dentro del mismo pedido
// ---------------------------------------------------------------------
describe("REGRESIÓN — dos líneas que emitirían el mismo código se REPORTAN", () => {
  it("una colisión dentro del pedido queda registrada, no silenciada", () => {
    const { warnings } = buildManifestItems({
      ordersData: [
        {
          id: 900,
          items: [
            { id: 5, product_id: 331, variation_id: 0, sku: "185325", name: "Cherry Bandeja", quantity: 1 },
            { id: 6, product_id: 332, variation_id: 0, sku: "185325", name: "Cherry Canastilla", quantity: 1 },
          ],
        },
      ],
      productDetailsMap: {
        331: { unidad_medida: "UND", barcode: null },
        332: { unidad_medida: "UND", barcode: null },
      },
    });
    expect(warnings.colisiones).toHaveLength(1);
    expect(warnings.colisiones[0].codigo).toBe("185325UND");
    expect(warnings.colisiones[0].items).toEqual(["900-5", "900-6"]);
    // Antes las dos líneas salían iguales y el POS leía UN solo producto.
  });

  it("el MISMO producto en dos líneas NO es colisión", () => {
    // Caso real, pedido 81399: "Cascara Kilo - 500g" partido por WooCommerce
    // en dos líneas de qty 1. El QR emite el código dos veces y la caja suma
    // bien. Avisar acá entrena a la gente a ignorar el aviso — y entonces la
    // colisión de verdad tampoco se ve.
    const { warnings } = buildManifestItems({
      ordersData: [
        {
          id: 81399,
          items: [
            { id: 10293, product_id: 70658, variation_id: 72664, sku: "15140LB", name: "Cascara Kilo - 500g", quantity: 1 },
            { id: 10298, product_id: 70658, variation_id: 72664, sku: "15140LB", name: "Cascara Kilo - 500g", quantity: 1 },
          ],
        },
      ],
      productDetailsMap: {
        72664: { unidad_medida: "500g", unidad_medida_siesa: "KL", barcode: null },
      },
    });
    expect(warnings.colisiones).toEqual([]);
  });

  it("dos VARIACIONES distintas con el mismo código SÍ son colisión", () => {
    const { warnings } = buildManifestItems({
      ordersData: [
        {
          id: 900,
          items: [
            { id: 5, product_id: 70658, variation_id: 111, sku: "15140LB", name: "Cascara 500g", quantity: 1 },
            { id: 6, product_id: 70658, variation_id: 222, sku: "15140KL", name: "Cascara Kilo", quantity: 1 },
          ],
        },
      ],
      productDetailsMap: {
        111: { unidad_medida: "500g", unidad_medida_siesa: "KL", barcode: null },
        222: { unidad_medida: "Kg", unidad_medida_siesa: "KL", barcode: null },
      },
    });
    expect(warnings.colisiones).toHaveLength(1);
    expect(warnings.colisiones[0].codigo).toBe("15140KL");
    expect(warnings.colisiones[0].productos).toEqual(["Cascara 500g", "Cascara Kilo"]);
    // Acá la caja SÍ lee un solo producto: se pierde una de las dos.
  });

  it("sin colisiones el reporte viene limpio", () => {
    const { warnings } = buildManifestItems({
      ordersData: [
        {
          id: 900,
          items: [
            { id: 5, product_id: 331, variation_id: 0, sku: "185325", name: "A", quantity: 1 },
            { id: 6, product_id: 332, variation_id: 0, sku: "185326", name: "B", quantity: 1 },
          ],
        },
      ],
      productDetailsMap: {
        331: { unidad_medida: "UND", barcode: null },
        332: { unidad_medida: "UND", barcode: null },
      },
    });
    expect(warnings.colisiones).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — códigos que la caja no puede resolver
// ---------------------------------------------------------------------
describe("REGRESIÓN — nunca se emite un f120_id pelado al QR", () => {
  it("sin UM ni EAN, el ítem sale sin código y se reporta", () => {
    const { items, warnings } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 1 }] },
      ],
      productDetailsMap: { 111: { unidad_medida: null, barcode: null } },
    });
    expect(items[0].codigo_manifiesto).toBeNull();
    expect(warnings.sin_codigo).toEqual([{ key: "900-5", name: "Cherry", sku: "185325" }]);
    expect(qrDeSesion(items)).toEqual([]);
    // Antes emitía "1*185325", que la caja no reconoce como producto.
  });

  it("con EAN real se prefiere el EAN sobre el SKU+UM", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 3 }] },
      ],
      productDetailsMap: { 111: { unidad_medida: "UND", barcode: "7702004009999" } },
    });
    expect(items[0].codigo_manifiesto).toBe("7702004009999");
  });

  it("sin EAN cae a SKU+UM", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 3 }] },
      ],
      productDetailsMap: { 111: { unidad_medida: "P25", barcode: null } },
    });
    expect(items[0].codigo_manifiesto).toBe("185325P25");
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — la UM de Woo y la de SIESA son DOS COSAS DISTINTAS
// ---------------------------------------------------------------------
describe("REGRESIÓN — la presentación de Woo no se pisa con la de SIESA", () => {
  // Caso real, sesión 00281109: "Tocino Carnudo Kilo - 500g", sku 15202LB.
  // WooCommerce manda `500g` (lo que compró el cliente); SIESA solo conoce
  // `KL` (cómo está catalogado el código de barras). Pisar una con la otra
  // duplicaba el peso del GS1: kgPerUnit("500g")=0.5 vs kgPerUnit("KL")=1.0.
  const ordersData = [
    {
      id: 900,
      items: [
        { id: 5, product_id: 111, variation_id: 0, sku: "15202LB", name: "Tocino Carnudo Kilo - 500g", quantity: 2 },
      ],
    },
  ];
  const productDetailsMap = {
    111: {
      unidad_medida: "500g", // de WooCommerce — gobierna peso y cobro
      unidad_medida_siesa: "KL", // de SIESA — gobierna el código
      unidad_medida_confiable: true,
      barcode: null,
    },
  };

  it("el ítem conserva la presentación de WooCommerce", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap });
    expect(items[0].unidad_medida).toBe("500g");
    // Si esto vuelve a decir "KL", el peso del GS1 se duplica.
  });

  it("el código del manifiesto usa la presentación de SIESA", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap });
    expect(items[0].codigo_manifiesto).toBe("15202KL");
    // La caja resuelve contra SIESA, no contra la etiqueta de Woo.
  });

  it("las dos viajan por separado, nunca fusionadas", () => {
    const { items } = buildManifestItems({ ordersData, productDetailsMap });
    expect(items[0].unidad_medida).not.toBe(items[0].unidad_medida_siesa);
  });

  it("sin UM de SIESA cae a la de Woo para el código", () => {
    const { items } = buildManifestItems({
      ordersData,
      productDetailsMap: { 111: { unidad_medida: "UND", barcode: null } },
    });
    expect(items[0].codigo_manifiesto).toBe("15202UND");
  });
});

describe("la confianza de la presentación viaja al frontend", () => {
  it("una UM adivinada llega marcada como NO confiable", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 1 }] },
      ],
      productDetailsMap: { 111: { unidad_medida: "UND", unidad_medida_confiable: false, barcode: "7702004009999" } },
    });
    expect(items[0].unidad_medida_confiable).toBe(false);
  });

  it("ante la ausencia del dato, se asume NO confiable", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 111, variation_id: 0, sku: "185325", name: "Cherry", quantity: 1 }] },
      ],
      productDetailsMap: { 111: { unidad_medida: "UND", barcode: "7702004009999" } },
    });
    expect(items[0].unidad_medida_confiable).toBe(false);
    // Ante la duda NO bloquear: es la regla de utils/siesaMatching.js.
  });
});

describe("QR completo de un pedido", () => {
  it("productos + método de despacho al final", () => {
    const { items } = buildManifestItems({
      ordersData: [
        {
          id: 900,
          items: [
            { id: 5, product_id: 111, variation_id: 0, sku: "1001", name: "A", quantity: 2 },
            { id: 6, product_id: 222, variation_id: 0, sku: "1002", name: "B", quantity: 1 },
          ],
        },
      ],
      productDetailsMap: {
        111: { unidad_medida: "UND", barcode: null },
        222: { unidad_medida: "KL", barcode: null },
      },
    });
    const lineas = [
      ...qrDeSesion(items),
      qrLine(buildShippingItem("900", [{ method_id: "local_pickup" }])),
    ];
    expect(lineas).toEqual(["2*1001UND", "1*1002KL", "305"]);
    expect(lineas.join("\r\n")).toBe("2*1001UND\r\n1*1002KL\r\n305");
  });
});

describe("robustez — entradas degeneradas no rompen el manifiesto", () => {
  it("sin pedidos devuelve listas vacías", () => {
    const r = buildManifestItems({ ordersData: [], productDetailsMap: {} });
    expect(r.items).toEqual([]);
    expect(r.warnings.colisiones).toEqual([]);
  });

  it("un pedido sin items no rompe", () => {
    expect(buildManifestItems({ ordersData: [{ id: 900 }], productDetailsMap: {} }).items).toEqual([]);
  });

  it("un item sin detalle en products_map sale sin código, no explota", () => {
    const { items } = buildManifestItems({
      ordersData: [
        { id: 900, items: [{ id: 5, product_id: 999, variation_id: 0, sku: "SIN-SKU", name: "X", quantity: 1 }] },
      ],
      productDetailsMap: {},
    });
    expect(items[0].codigo_manifiesto).toBeNull();
  });
});
