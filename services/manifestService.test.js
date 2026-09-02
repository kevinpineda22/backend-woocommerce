import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================
// POR QUÉ EXISTE ESTE TEST
//
// El QR del historial admin es la fuente de verdad del manifiesto. Este
// test fija ese contrato para que el picker pueda consumir la MISMA
// función sin que nadie la haga divergir después.
//
// Lo que pinea, en orden de cuánto cuesta si se rompe:
//   1. En el QR SOLO van códigos reales de SIESA. Un producto sin fila
//      sale con `codigo_manifiesto: null` y reportado — NUNCA con el SKU
//      disfrazado de código, que es lo que la caja rechaza.
//   2. UNA entrada por línea de pedido real. `products_map` escribe la
//      misma entrada bajo product_id y variation_id: recorrerlo duplicaba
//      los productos variables.
//   3. El picker no paga el roundtrip de categorías a WooCommerce.
// =============================================================

// `vi.mock` se hoistea por encima de las declaraciones del módulo, así que el
// estado compartido con los mocks tiene que crearse con `vi.hoisted` o la
// factory ve un objeto distinto al que escribe el `beforeEach`.
const estado = vi.hoisted(() => ({ tablaData: {}, wooCalls: [] }));

vi.mock("./supabaseClient.js", () => {
  // Builder encadenable Y awaitable: cada método devuelve el mismo objeto,
  // y el `await` final resuelve { data, error } según la tabla.
  const makeBuilder = (tabla) => {
    const resolver = () => ({
      data: estado.tablaData[tabla] ?? [],
      error: estado.tablaData[`${tabla}__error`] ?? null,
    });
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => Promise.resolve({ ...resolver(), data: estado.tablaData[`${tabla}__single`] ?? null }),
      maybeSingle: () => Promise.resolve({ ...resolver(), data: estado.tablaData[`${tabla}__single`] ?? null }),
      then: (onOk, onErr) => Promise.resolve(resolver()).then(onOk, onErr),
    };
    return builder;
  };
  return { supabase: { from: (tabla) => makeBuilder(tabla) } };
});

vi.mock("./wooMultiService.js", () => ({
  getWooClient: async (sedeId) => {
    estado.wooCalls.push(sedeId);
    return { get: async () => ({ data: [] }) };
  },
}));

const { buildSessionManifest, ManifestError } = await import(
  "./manifestService"
);

const SESSION_ID = "11111111-2222-3333-4444-555555555555";

// Un pedido con dos líneas:
//   - línea 1: producto VARIABLE (variation_id) con código real en SIESA
//   - línea 2: producto SIN ninguna fila en SIESA
const snapshotBase = () => [
  {
    id: 9001,
    billing: { first_name: "Ana", last_name: "Pérez" },
    line_items: [
      {
        id: 501,
        name: "Tocino Carnudo Kilo - 500g",
        sku: "4908",
        product_id: 700,
        variation_id: 701,
        quantity: 1,
        price: "20000",
        subtotal: "20000",
        total: "20000",
        meta_data: [
          { key: "pa_unidad-de-medida-aproximado", display_value: "500g" },
        ],
      },
      {
        id: 502,
        name: "Bandeja Fruver Propia",
        sku: "9999",
        product_id: 800,
        variation_id: 0,
        quantity: 2,
        price: "5000",
        subtotal: "10000",
        total: "10000",
        meta_data: [],
      },
    ],
  },
];

beforeEach(() => {
  estado.wooCalls = [];
  estado.tablaData = {
    wc_picking_sessions__single: {
      id: SESSION_ID,
      sede_id: "sede-norte",
      fecha_inicio: "2026-09-01T10:00:00Z",
      fecha_fin: "2026-09-01T12:00:00Z",
      estado: "pendiente_auditoria",
      ids_pedidos: [9001],
      snapshot_pedidos: snapshotBase(),
      datos_salida: null,
      wc_pickers: { nombre_completo: "Juan Picker", email: "juan@x.com" },
    },
    wc_asignaciones_pedidos: [],
    wc_log_picking: [],
    // Solo el 4908 existe en SIESA. El 9999 no tiene ninguna fila.
    siesa_codigos_barras: [
      { f120_id: 4908, codigo_barras: "7701234567890", unidad_medida: "KL" },
    ],
  };
});

describe("buildSessionManifest — solo códigos REALES en el QR", () => {
  it("emite el código real de SIESA cuando el producto lo tiene", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });
    const linea = r.manifest_items.find((i) => i.line_item_id === 501);
    expect(linea.codigo_manifiesto).toBe("7701234567890");
  });

  it("NUNCA fabrica el código desde el SKU: sin fila SIESA va null", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });
    const linea = r.manifest_items.find((i) => i.line_item_id === 502);

    expect(linea.codigo_manifiesto).toBeNull();
    // El bug que llegó a la caja: emitir "9999" (el f120_id) como código.
    expect(linea.codigo_manifiesto).not.toBe("9999");
  });

  it("reporta el ítem sin código en vez de omitirlo en silencio", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });

    expect(r.manifest_warnings.sin_codigo).toHaveLength(1);
    expect(r.manifest_warnings.sin_codigo[0].sku).toBe("9999");
  });
});

describe("buildSessionManifest — una entrada por línea de pedido", () => {
  it("no duplica el producto variable pese a estar dos veces en products_map", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });

    // products_map tiene 3 claves (700, 701, 800); el manifiesto, 2 ítems.
    expect(Object.keys(r.products_map).length).toBeGreaterThan(
      r.manifest_items.length,
    );
    expect(r.manifest_items).toHaveLength(2);
  });

  it("identifica cada ítem por pedido + línea", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });
    expect(r.manifest_items.map((i) => i.key)).toEqual([
      "9001-501",
      "9001-502",
    ]);
  });

  it("el mismo producto en dos pedidos distintos NO colapsa en uno", async () => {
    const dos = snapshotBase();
    dos.push({
      ...dos[0],
      id: 9002,
      line_items: [{ ...dos[0].line_items[0], id: 601 }],
    });
    estado.tablaData.wc_picking_sessions__single.snapshot_pedidos = dos;
    estado.tablaData.wc_picking_sessions__single.ids_pedidos = [9001, 9002];

    const r = await buildSessionManifest({ sessionId: SESSION_ID });

    expect(r.manifest_items).toHaveLength(3);
    // Mismo código en pedidos distintos NO es colisión: la caja factura
    // pedido por pedido.
    expect(r.manifest_warnings.colisiones).toHaveLength(0);
  });
});

describe("buildSessionManifest — presentación", () => {
  it("no pisa la unidad de medida de Woo con la de SIESA", async () => {
    const r = await buildSessionManifest({ sessionId: SESSION_ID });
    const linea = r.manifest_items.find((i) => i.line_item_id === 501);

    // Woo dice 500g (gobierna peso y cobro), SIESA solo conoce KL.
    // Pisar una con otra duplica el peso del GS1.
    expect(linea.unidad_medida).toBe("500g");
    expect(linea.unidad_medida_siesa).toBe("KL");
  });
});

describe("buildSessionManifest — costo para el picker", () => {
  it("con incluirCategorias:false no llama a WooCommerce", async () => {
    await buildSessionManifest({
      sessionId: SESSION_ID,
      incluirCategorias: false,
    });
    expect(estado.wooCalls).toHaveLength(0);
  });

  it("con incluirCategorias:true sí consulta categorías", async () => {
    await buildSessionManifest({
      sessionId: SESSION_ID,
      incluirCategorias: true,
    });
    expect(estado.wooCalls.length).toBeGreaterThan(0);
  });

  it("usa la sede de la SESIÓN, no la del header", async () => {
    await buildSessionManifest({
      sessionId: SESSION_ID,
      sedeId: "sede-del-header",
      incluirCategorias: true,
    });
    // El SELECT no pedía `sede_id`, así que siempre caía al header y una
    // sesión de otra sede consultaba el WooCommerce equivocado.
    expect(estado.wooCalls[0]).toBe("sede-norte");
  });
});

describe("buildSessionManifest — errores", () => {
  it("sin session_id devuelve 400", async () => {
    await expect(buildSessionManifest({ sessionId: null })).rejects.toThrow(
      ManifestError,
    );
    await expect(
      buildSessionManifest({ sessionId: null }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("ID corto que no matchea devuelve 404", async () => {
    estado.tablaData.wc_picking_sessions = [{ id: SESSION_ID }];
    await expect(
      buildSessionManifest({ sessionId: "ZZZZ" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("resuelve el ID corto contra las sesiones recientes", async () => {
    estado.tablaData.wc_picking_sessions = [{ id: SESSION_ID }];
    const r = await buildSessionManifest({ sessionId: "11111111" });
    expect(r.metadata.session_id).toBe(SESSION_ID);
  });
});
