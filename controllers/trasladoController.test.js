import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================
// TRASLADO CONTROLLER — tests de integración
//
// Estrategia: inyección de dependencias vía `createTrasladoController(deps)`.
// El service de traslado se usa REAL (funciones puras): el flujo completo
// guardas → clon → notas → cancel → insert → audit se cubre de punta a punta.
// Las dependencias externas (supabase, woo, sedes, audit) son fakes sin red.
//
// Por qué no vi.mock: vitest 4 solo aplica vi.mock a imports estáticos; el
// controller (CommonJS) carga sus módulos con require() y vitest no los
// intercepta. La inyección por parámetros es la costura limpia sin deps nuevas.
// =============================================

// =============================================
// Fake de Supabase: chainable por tabla + thenable
// =============================================

function makeSupabaseFake() {
  const builders = new Map(); // tabla → config de la query
  const inserted = [];

  function makeBuilder(table, config = {}) {
    const chain = {
      select: vi.fn(function () {
        return this;
      }),
      eq: vi.fn(function () {
        return this;
      }),
      not: vi.fn(function () {
        return this;
      }),
      is: vi.fn(function () {
        return this;
      }),
      order: vi.fn(function () {
        return this;
      }),
      limit: vi.fn(function () {
        return this;
      }),
      maybeSingle: vi.fn(async () => config.maybeSingle ?? { data: null, error: null }),
      single: vi.fn(async () => config.single ?? { data: null, error: null }),
      insert: vi.fn(async (rows) => {
        inserted.push({ table, rows });
        return config.insert ?? { data: rows, error: null };
      }),
    };
    // Thenable: permite `await supabase.from(...).select(...).not(...)`
    // (terminal sin método, como la query de guardSesionActiva).
    chain.then = (resolve, reject) =>
      Promise.resolve(config.awaited ?? { data: null, error: null }).then(resolve, reject);
    return chain;
  }

  const supabaseClient = {
    from: vi.fn((table) => makeBuilder(table, builders.get(table) || {})),
  };

  return {
    supabaseClient,
    inserted,
    setSupabaseTable(table, config) {
      builders.set(table, config);
    },
    clearSupabaseTables() {
      builders.clear();
      inserted.length = 0;
    },
  };
}

const supabaseFake = makeSupabaseFake();
const { supabaseClient, inserted, setSupabaseTable, clearSupabaseTables } = supabaseFake;

// =============================================
// Fakes de sedes / woo / audit
// =============================================

const getSedeById = vi.fn();
const getWooClient = vi.fn();
const getOrderFromAnySede = vi.fn();
const invalidateResponseCache = vi.fn();
const logAuditEvent = vi.fn();

// =============================================
// Controller bajo test (deps inyectadas; service REAL)
// =============================================

const { validateTraslado, ejecutarTraslado } = createController();

function createController() {
  // Importar acá para que cada describe use el mismo módulo cacheado;
  // la factory se re-ejecuta con los fakes actuales.
  // eslint-disable-next-line global-require
  const { createTrasladoController } = require("./trasladoController");
  return createTrasladoController({
    supabaseClient,
    woo: { getWooClient, getOrderFromAnySede, invalidateResponseCache },
    sedes: { getSedeById },
    audit: logAuditEvent,
  });
}

// =============================================
// Fixtures
// =============================================

const SEDE_CENTRO = {
  id: "uuid-centro",
  nombre: "Centro",
  slug: "centro",
  wc_url: "https://centro.woo.test",
  woo_meta_match: { meta_value: "centro" },
};
const SEDE_NORTE = {
  id: "uuid-norte",
  nombre: "Norte",
  slug: "norte",
  wc_url: "https://norte.woo.test",
  woo_meta_match: { meta_value: "norte" },
};
const SEDE_SIN_WC = { id: "uuid-sin-wc", nombre: "Sin Woo", slug: "sin-woo", wc_url: null };
const SEDES = [SEDE_CENTRO, SEDE_NORTE, SEDE_SIN_WC];

const pedidoProcessing = {
  id: 80446,
  status: "processing",
  customer_id: 42,
  customer_note: "Dejar en portería",
  payment_method: "cod",
  payment_method_title: "Pago contra entrega",
  billing: { first_name: "Ana", last_name: "Gómez" },
  shipping: { first_name: "Ana", last_name: "Gómez" },
  total: "185000.00",
  line_items: [
    {
      product_id: 101,
      variation_id: 0,
      quantity: 5,
      price: "20000",
      total: "100000",
      name: "Papel higiénico x6",
      meta_data: [{ key: "pa_presentacion", value: "x6" }],
    },
  ],
  shipping_lines: [{ method_id: "local_pickup", method_title: "Retiro en tienda", total: "0" }],
  meta_data: [{ key: "_mkh_lite_branch_name", value: "centro" }],
};

const bodyValido = {
  order_id: 80446,
  sede_destino_id: SEDE_NORTE.id,
  motivo: "Cliente vive más cerca de Norte",
  admin_name: "Juan Pérez",
  admin_email: "juan@x.com",
  sede_id: SEDE_CENTRO.id,
  cancelar_origen: true,
};

// =============================================
// Helpers
// =============================================

function mockRes() {
  const res = {};
  res.status = vi.fn(function (code) {
    res.statusCode = code;
    return this;
  });
  res.json = vi.fn(function (body) {
    res.body = body;
    return this;
  });
  return res;
}

function makeWooClient() {
  return {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  };
}

let wooCentro;
let wooNorte;

beforeEach(() => {
  clearSupabaseTables();
  vi.clearAllMocks();

  getSedeById.mockImplementation(async (id) => SEDES.find((s) => s.id === id) || null);
  getOrderFromAnySede.mockResolvedValue({
    order: pedidoProcessing,
    sedeId: SEDE_CENTRO.id,
    sedeName: "Centro",
  });
  invalidateResponseCache.mockImplementation(() => {});
  logAuditEvent.mockImplementation(() => {});

  // Guardas de DB por defecto: sin sesión activa, sin traslado previo.
  setSupabaseTable("wc_asignaciones_pedidos", { awaited: { data: [], error: null } });
  setSupabaseTable("wc_pedidos_trasladados", { maybeSingle: { data: null, error: null } });

  wooCentro = makeWooClient();
  wooNorte = makeWooClient();
  getWooClient.mockImplementation(async (sedeId) =>
    sedeId === SEDE_NORTE.id ? wooNorte : wooCentro,
  );
});

/** Stock de la sede destino suficiente → sin warnings de stock. */
function setupStockSuficiente() {
  wooNorte.get.mockImplementation(async (endpoint) => {
    if (endpoint === "products") {
      return {
        data: [
          { id: 101, manage_stock: true, stock_quantity: 10, stock_status: "instock", name: "Papel higiénico x6" },
        ],
      };
    }
    return { data: [] };
  });
}

// =============================================
// validateTraslado — guardas y pre-flight
// =============================================

describe("validateTraslado", () => {
  it("400 si faltan campos obligatorios", async () => {
    const req = { body: { sede_destino_id: SEDE_NORTE.id }, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("Falta order_id");
    expect(getOrderFromAnySede).not.toHaveBeenCalled();
  });

  it("400 si la sede destino no existe en wc_sedes", async () => {
    const req = { body: { ...bodyValido, sede_destino_id: "uuid-inexistente" }, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("La sede destino no tiene WooCommerce configurado.");
    expect(getOrderFromAnySede).not.toHaveBeenCalled();
  });

  it("400 si el destino no tiene wc_url (sin usar el cliente Woo fallback)", async () => {
    const req = { body: { ...bodyValido, sede_destino_id: SEDE_SIN_WC.id }, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("La sede destino no tiene WooCommerce configurado.");
    expect(getOrderFromAnySede).not.toHaveBeenCalled();
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("404 si el pedido no existe en ninguna sede", async () => {
    getOrderFromAnySede.mockResolvedValue(null);
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe("Pedido no encontrado en WooCommerce.");
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("400 si el destino es la misma sede del pedido", async () => {
    const req = { body: { ...bodyValido, sede_destino_id: SEDE_CENTRO.id }, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("El pedido ya pertenece a la sede destino.");
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("400 si el pedido no está en estado processing", async () => {
    getOrderFromAnySede.mockResolvedValue({
      order: { ...pedidoProcessing, status: "completed" },
      sedeId: SEDE_CENTRO.id,
      sedeName: "Centro",
    });
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Solo se pueden trasladar pedidos en estado processing.");
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("409 si el pedido está en una sesión de picking activa", async () => {
    setSupabaseTable("wc_asignaciones_pedidos", {
      awaited: { data: [{ id: "asg-1", id_sesion: "sess-1" }], error: null },
    });
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toContain("sesión de picking activa");
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("409 si el pedido ya fue trasladado previamente (idempotencia)", async () => {
    setSupabaseTable("wc_pedidos_trasladados", {
      maybeSingle: { data: { id: "traslado-1" }, error: null },
    });
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe("Este pedido ya fue trasladado previamente.");
    expect(getWooClient).not.toHaveBeenCalled();
  });

  it("200 feliz: valido, resumen y warnings vacíos; sin mutar nada", async () => {
    setupStockSuficiente();
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      valido: true,
      order_id: 80446,
      sede_origen: { id: SEDE_CENTRO.id, nombre: "Centro" },
      sede_destino: { id: SEDE_NORTE.id, nombre: "Norte" },
      resumen: { cliente: "Ana Gómez", items: 1, total: "185000.00", payment_method: "cod" },
      warnings: [],
    });
    // Pre-flight: NO clona, NO cancela, NO persiste.
    expect(wooNorte.post).not.toHaveBeenCalled();
    expect(wooCentro.put).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  it("200 con warnings de stock: insuficiente, faltante y agotado", async () => {
    getOrderFromAnySede.mockResolvedValue({
      order: {
        ...pedidoProcessing,
        line_items: [
          { product_id: 101, variation_id: 0, quantity: 5, price: "1000", total: "5000", name: "Papel higiénico x6", meta_data: [] },
          { product_id: 202, variation_id: 0, quantity: 1, price: "1000", total: "1000", name: "Producto inexistente", meta_data: [] },
          { product_id: 303, variation_id: 0, quantity: 2, price: "1000", total: "2000", name: "Sin gestión de stock", meta_data: [] },
        ],
      },
      sedeId: SEDE_CENTRO.id,
      sedeName: "Centro",
    });
    // El destino tiene el 101 (stock 2 < 5 pedidos) y el 303 (sin manage_stock);
    // el 202 no existe en destino.
    wooNorte.get.mockResolvedValue({
      data: [
        { id: 101, manage_stock: true, stock_quantity: 2, stock_status: "instock", name: "Papel higiénico x6" },
        { id: 303, manage_stock: false, stock_quantity: null, name: "Sin gestión de stock" },
      ],
    });

    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await validateTraslado(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valido).toBe(true);
    expect(res.body.warnings).toEqual([
      expect.objectContaining({ tipo: "stock_insufficient", product_id: 101, stock: 2, qty: 5 }),
      expect.objectContaining({ tipo: "item_missing", product_id: 202 }),
      expect.objectContaining({ tipo: "stock_unavailable", product_id: 303 }),
    ]);
  });
});

// =============================================
// ejecutarTraslado — flujo completo
// =============================================

describe("ejecutarTraslado", () => {
  it("200 feliz: clon con precios de origen, notas filtradas, cancel origen, insert completado, audit", async () => {
    setupStockSuficiente();

    wooNorte.post.mockImplementation(async (endpoint, payload) => {
      if (endpoint === "orders") return { data: { id: 80062, ...payload } };
      if (endpoint === "orders/80062/notes") return { data: { id: 1 } };
      return { data: {} };
    });

    wooCentro.get.mockResolvedValue({
      data: [
        { id: 1, note: "Hola, espero el pedido", customer_note: true, author: "Ana Gómez" },
        { id: 2, note: "Email sent to ana@x.com", customer_note: false, author: "system" },
        { id: 3, note: "Niveles de inventario reducidos: 3 unidades", customer_note: false, author: "WooCommerce" },
      ],
    });

    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await ejecutarTraslado(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      message: "Pedido #80446 trasladado a Norte (nuevo #80062).",
      order_id_origen: 80446,
      order_id_destino: 80062,
      sede_destino_id: SEDE_NORTE.id,
      estado: "completado",
      warnings: [],
    });

    // 1. Clon con precios FORZADOS de origen + metas filtradas.
    const clonCall = wooNorte.post.mock.calls.find(([endpoint]) => endpoint === "orders");
    expect(clonCall).toBeDefined();
    const payloadClon = clonCall[1];
    expect(payloadClon.status).toBe("processing");
    expect(payloadClon.payment_method).toBe("cod");
    expect(payloadClon.total_tax).toBe("0");
    expect(payloadClon.customer_id).toBe(42);
    expect(payloadClon.line_items[0]).toMatchObject({
      product_id: 101,
      price: "20000",
      total: "100000",
      meta_data: [{ key: "pa_presentacion", value: "x6" }],
    });
    expect(payloadClon.customer_note).toContain(
      "Este pedido fue trasladado desde Centro (pedido original #80446)",
    );
    expect(payloadClon.meta_data).toEqual(
      expect.arrayContaining([
        { key: "_mkh_lite_branch_name", value: "norte" },
        { key: "_mkh_transferred_from", value: "Centro (pedido #80446)" },
      ]),
    );

    // 2. Notas: solo la del cliente (author system y autogeneradas se filtran).
    expect(wooNorte.post).toHaveBeenCalledWith("orders/80062/notes", {
      note: "Hola, espero el pedido",
      customer_note: true,
    });
    expect(wooNorte.post).not.toHaveBeenCalledWith(
      "orders/80062/notes",
      expect.objectContaining({ note: expect.stringContaining("Email sent") }),
    );
    expect(wooNorte.post).not.toHaveBeenCalledWith(
      "orders/80062/notes",
      expect.objectContaining({ note: expect.stringContaining("Niveles de inventario") }),
    );

    // 3. Cancel origen.
    expect(wooCentro.put).toHaveBeenCalledWith("orders/80446", { status: "cancelled" });

    // 4. Insert en wc_pedidos_trasladados (estado completado).
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe("wc_pedidos_trasladados");
    expect(inserted[0].rows[0]).toMatchObject({
      order_id_origen: 80446,
      sede_origen_id: SEDE_CENTRO.id,
      order_id_destino: 80062,
      sede_destino_id: SEDE_NORTE.id,
      estado: "completado",
      warnings: [],
      admin_name: "Juan Pérez",
      admin_email: "juan@x.com",
      motivo: "Cliente vive más cerca de Norte",
    });

    // 5. Caché invalidada + audit order.transferred.
    expect(invalidateResponseCache).toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: "admin", id: "juan@x.com", name: "Juan Pérez" },
        action: "order.transferred",
        entity: { type: "order", id: 80446 },
        sedeId: SEDE_CENTRO.id,
        metadata: expect.objectContaining({
          order_id_destino: 80062,
          sede_destino_id: SEDE_NORTE.id,
          sede_destino_nombre: "Norte",
          cancelar_origen: true,
          motivo: "Cliente vive más cerca de Norte",
        }),
      }),
    );
  });

  it("estado pendiente_cancelar si falla la cancelación del origen (post-clon)", async () => {
    setupStockSuficiente();
    wooNorte.post.mockResolvedValue({ data: { id: 80062 } });
    wooCentro.get.mockResolvedValue({ data: [] });
    wooCentro.put.mockRejectedValue(new Error("Woo API 500"));

    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await ejecutarTraslado(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.estado).toBe("pendiente_cancelar");
    expect(res.body.order_id_destino).toBe(80062);
    expect(res.body.message).toContain("reintente la cancelación manualmente");
    expect(res.body.warnings).toEqual([
      { tipo: "cancel_origen_fallido", message: "Woo API 500" },
    ]);

    // El registro se persiste igual, con estado pendiente_cancelar.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].rows[0].estado).toBe("pendiente_cancelar");
    expect(inserted[0].rows[0].warnings).toEqual([
      { tipo: "cancel_origen_fallido", message: "Woo API 500" },
    ]);
    expect(logAuditEvent).toHaveBeenCalled();
    expect(invalidateResponseCache).toHaveBeenCalled();
  });

  it("cancelar_origen=false: clona pero NO cancela el origen", async () => {
    setupStockSuficiente();
    wooNorte.post.mockResolvedValue({ data: { id: 80062 } });

    const req = { body: { ...bodyValido, cancelar_origen: false }, sedeId: null };
    const res = mockRes();
    await ejecutarTraslado(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.estado).toBe("completado");
    expect(wooCentro.put).not.toHaveBeenCalled();
    expect(inserted[0].rows[0].estado).toBe("completado");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ cancelar_origen: false }),
      }),
    );
  });

  it("400 si Woo rechaza el clon: no persiste ni cancela el origen", async () => {
    setupStockSuficiente();
    wooNorte.post.mockRejectedValue(
      new Error("El producto 202 no existe en el destino"),
    );

    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await ejecutarTraslado(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(
      "No se pudo crear el pedido en la sede destino: El producto 202 no existe en el destino",
    );
    expect(inserted).toHaveLength(0);
    expect(wooCentro.put).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("404 si el pedido no existe (las guardas corren también al ejecutar)", async () => {
    getOrderFromAnySede.mockResolvedValue(null);
    const req = { body: bodyValido, sedeId: null };
    const res = mockRes();
    await ejecutarTraslado(req, res);

    expect(res.statusCode).toBe(404);
    expect(wooNorte.post).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });
});
