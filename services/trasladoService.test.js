import { describe, it, expect, vi } from "vitest";

// =============================================
// Test de funciones puras de trasladoService.js
// NO requiere mock de supabase ni cliente Woo — red/DB inyectadas.
// =============================================

const {
  validateTrasladoRequest,
  isSameSede,
  summarizeOrder,
  filterOrderMetaData,
  buildOrderMetaData,
  buildCustomerNote,
  buildClonePayload,
  filterOrderNotes,
  checkStockDestino,
  resolveCustomerDestino,
} = require("./trasladoService");

// =============================================
// validateTrasladoRequest — Guardas 400 del request
// =============================================

describe("validateTrasladoRequest", () => {
  const bodyValido = {
    order_id: 80446,
    sede_destino_id: "uuid-norte",
    motivo: "Cliente vive más cerca de Norte",
    admin_name: "Juan Pérez",
  };

  it("devuelve 0 errores con body completo", () => {
    expect(validateTrasladoRequest(bodyValido)).toHaveLength(0);
  });

  it("falla sin order_id", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, order_id: undefined });
    expect(errors).toContain("Falta order_id");
  });

  it("falla con order_id 0", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, order_id: 0 });
    expect(errors).toContain("Falta order_id");
  });

  it("falla sin sede_destino_id", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, sede_destino_id: "" });
    expect(errors).toContain("Falta sede_destino_id");
  });

  it("falla sin motivo", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, motivo: "" });
    expect(errors).toContain("El motivo es obligatorio");
  });

  it("falla con motivo de solo espacios", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, motivo: "   " });
    expect(errors).toContain("El motivo es obligatorio");
  });

  it("falla sin admin_name", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, admin_name: undefined });
    expect(errors).toContain("El nombre del admin es obligatorio");
  });

  it("falla con admin_name de solo espacios", () => {
    const errors = validateTrasladoRequest({ ...bodyValido, admin_name: "  " });
    expect(errors).toContain("El nombre del admin es obligatorio");
  });

  it("acumula múltiples errores", () => {
    const errors = validateTrasladoRequest({});
    expect(errors).toEqual([
      "Falta order_id",
      "Falta sede_destino_id",
      "El motivo es obligatorio",
      "El nombre del admin es obligatorio",
    ]);
  });

  it("devuelve todos los errores si el body es null/undefined", () => {
    expect(validateTrasladoRequest(null)).toHaveLength(4);
    expect(validateTrasladoRequest(undefined)).toHaveLength(4);
  });
});

// =============================================
// isSameSede — Comparación de sedes
// =============================================

describe("isSameSede", () => {
  it("retorna true con el mismo UUID", () => {
    expect(isSameSede("uuid-a", "uuid-a")).toBe(true);
  });

  it("retorna false con UUIDs distintos", () => {
    expect(isSameSede("uuid-a", "uuid-b")).toBe(false);
  });

  it("es case-insensitive", () => {
    expect(isSameSede("UUID-A", "uuid-a")).toBe(true);
  });

  it("retorna false con valores null/undefined", () => {
    expect(isSameSede(null, "uuid-a")).toBe(false);
    expect(isSameSede("uuid-a", undefined)).toBe(false);
    expect(isSameSede(null, null)).toBe(false);
  });
});

// =============================================
// summarizeOrder — Resumen para el paso 1 del modal
// =============================================

describe("summarizeOrder", () => {
  const pedido = {
    id: 80446,
    status: "processing",
    total: "185000.00",
    payment_method: "cod",
    billing: { first_name: "Ana", last_name: "Gómez" },
    line_items: [{ product_id: 1 }, { product_id: 2 }, { product_id: 3 }],
  };

  it("arma el resumen completo", () => {
    expect(summarizeOrder(pedido)).toEqual({
      cliente: "Ana Gómez",
      items: 3,
      total: "185000.00",
      payment_method: "cod",
    });
  });

  it("usa fallback de cliente sin nombre", () => {
    const order = { ...pedido, billing: {} };
    expect(summarizeOrder(order).cliente).toBe("Cliente sin nombre");
  });

  it("cuenta 0 items si no hay line_items", () => {
    const order = { ...pedido, line_items: undefined };
    expect(summarizeOrder(order).items).toBe(0);
  });

  it("retorna null si no hay pedido", () => {
    expect(summarizeOrder(null)).toBeNull();
    expect(summarizeOrder(undefined)).toBeNull();
  });
});

// =============================================
// filterOrderMetaData — SOLO las 4 keys de preparación
// =============================================

describe("filterOrderMetaData", () => {
  it("conserva SOLO las 4 keys permitidas", () => {
    const meta = [
      { key: "pa_unidad-de-medida-aproximado", value: "1kg" },
      { key: "pa_presentacion", value: "Bolsa x6" },
      { key: "Nota de preparación", value: "Cortar en trozos" },
      { key: "_wcfx_item_note", value: "Regalo" },
      { key: "otra_meta", value: "no debe viajar" },
      { key: "_sede", value: "centro" },
      { key: "price", value: "5000" },
    ];
    expect(filterOrderMetaData(meta)).toEqual([
      { key: "pa_unidad-de-medida-aproximado", value: "1kg" },
      { key: "pa_presentacion", value: "Bolsa x6" },
      { key: "Nota de preparación", value: "Cortar en trozos" },
      { key: "_wcfx_item_note", value: "Regalo" },
    ]);
  });

  it("retorna [] con array vacío", () => {
    expect(filterOrderMetaData([])).toEqual([]);
  });

  it("retorna [] si no es array", () => {
    expect(filterOrderMetaData(null)).toEqual([]);
    expect(filterOrderMetaData(undefined)).toEqual([]);
    expect(filterOrderMetaData("meta")).toEqual([]);
  });

  it("preserva valores no-string (números)", () => {
    const meta = [{ key: "pa_presentacion", value: 6 }];
    expect(filterOrderMetaData(meta)).toEqual([{ key: "pa_presentacion", value: 6 }]);
  });
});

// =============================================
// buildOrderMetaData — billing del origen + branch destino + trazabilidad
// =============================================

describe("buildOrderMetaData", () => {
  const ordenOrigen = {
    meta_data: [
      { key: "_billing_cod_payment_mode", value: "contra_entrega" },
      { key: "_billing_document", value: "1020304050" },
      { key: "_billing_person_type", value: "persona_natural" },
      { key: "_sede", value: "centro" }, // no debe copiarse
    ],
  };
  const sedeOrigen = { id: "uuid-centro", nombre: "Centro", slug: "centro" };
  const sedeDestino = {
    id: "uuid-norte",
    nombre: "Norte",
    slug: "norte",
    woo_meta_match: { meta_value: "norte" },
  };

  it("copia las 3 metas de facturación COD del origen", () => {
    const meta = buildOrderMetaData({
      order: ordenOrigen,
      sedeOrigen,
      sedeDestino,
      orderIdOrigen: 80446,
    });
    expect(meta).toContainEqual({ key: "_billing_cod_payment_mode", value: "contra_entrega" });
    expect(meta).toContainEqual({ key: "_billing_document", value: "1020304050" });
    expect(meta).toContainEqual({ key: "_billing_person_type", value: "persona_natural" });
  });

  it("usa woo_meta_match.meta_value de la sede destino para _mkh_lite_branch_name", () => {
    const meta = buildOrderMetaData({
      order: ordenOrigen,
      sedeOrigen,
      sedeDestino,
      orderIdOrigen: 80446,
    });
    expect(meta).toContainEqual({ key: "_mkh_lite_branch_name", value: "norte" });
  });

  it("hace fallback al slug si la sede destino no tiene woo_meta_match", () => {
    const sedeSinMatch = { id: "uuid-norte", nombre: "Norte", slug: "norte" };
    const meta = buildOrderMetaData({
      order: ordenOrigen,
      sedeOrigen,
      sedeDestino: sedeSinMatch,
      orderIdOrigen: 80446,
    });
    expect(meta).toContainEqual({ key: "_mkh_lite_branch_name", value: "norte" });
  });

  it("arma _mkh_transferred_from con el formato del design", () => {
    const meta = buildOrderMetaData({
      order: ordenOrigen,
      sedeOrigen,
      sedeDestino,
      orderIdOrigen: 80446,
    });
    expect(meta).toContainEqual({
      key: "_mkh_transferred_from",
      value: "Centro (pedido #80446)",
    });
  });

  it("omite metas de origen ausentes o vacías", () => {
    const order = { meta_data: [{ key: "_billing_document", value: "" }] };
    const meta = buildOrderMetaData({
      order,
      sedeOrigen,
      sedeDestino,
      orderIdOrigen: 5,
    });
    expect(meta.find((m) => m.key === "_billing_cod_payment_mode")).toBeUndefined();
    expect(meta.find((m) => m.key === "_billing_document")).toBeUndefined();
  });

  it("el orden respeta: billing origen → branch → transferred_from", () => {
    const meta = buildOrderMetaData({
      order: ordenOrigen,
      sedeOrigen,
      sedeDestino,
      orderIdOrigen: 80446,
    });
    expect(meta.map((m) => m.key)).toEqual([
      "_billing_cod_payment_mode",
      "_billing_document",
      "_billing_person_type",
      "_mkh_lite_branch_name",
      "_mkh_transferred_from",
    ]);
  });
});

// =============================================
// buildCustomerNote — Nota de cliente del clon
// =============================================

describe("buildCustomerNote", () => {
  it("preserva la nota original sin agregar anotaciones de traslado", () => {
    const nota = buildCustomerNote({ customerNote: "Dejar en portería" });
    expect(nota).toBe("Dejar en portería");
    expect(nota).not.toContain("trasladado desde");
    expect(nota).not.toContain("pedido original");
  });

  it("sin nota original devuelve string vacío", () => {
    const nota = buildCustomerNote({ customerNote: "" });
    expect(nota).toBe("");
  });

  it("limpia anotaciones de traslado heredadas de clonaciones previas", () => {
    const nota = buildCustomerNote({
      customerNote:
        "PEDIDO DE PRUEBA\n\n" +
        "Este pedido fue trasladado desde Girardota (pedido original #80063) por Johan Sanchez. Motivo: Traslado de prueba.\n\n" +
        "Este pedido fue trasladado desde Copacabana Plaza (pedido original #80447) por Johan Sanchez. Motivo: S",
    });
    expect(nota).toBe("PEDIDO DE PRUEBA");
    expect(nota).not.toContain("trasladado desde");
    expect(nota).not.toContain("pedido original");
  });

  it("no rompe con campos faltantes", () => {
    const nota = buildCustomerNote({});
    expect(nota).toBe("");
  });
});

// =============================================
// buildClonePayload — Precios forzados, cod, processing, notas filtradas
// =============================================

describe("buildClonePayload", () => {
  const pedidoOrigen = {
    id: 80446,
    status: "processing",
    total: "185000.00",
    payment_method: "cod",
    payment_method_title: "Contra entrega",
    customer_id: 123,
    customer_note: "Dejar en portería",
    billing: {
      first_name: "Ana",
      last_name: "Gómez",
      phone: "3001234567",
      address_1: "Calle 1 #2-3",
      city: "Medellín",
    },
    shipping: { first_name: "Ana", last_name: "Gómez", address_1: "Calle 1 #2-3" },
    meta_data: [
      { key: "_billing_cod_payment_mode", value: "contra_entrega" },
      { key: "_sede", value: "centro" },
    ],
    line_items: [
      {
        product_id: 100,
        variation_id: 0,
        quantity: 2,
        price: "25000",
        total: "50000",
        meta_data: [
          { key: "pa_unidad-de-medida-aproximado", value: "1kg" },
          { key: "_stock", value: "no-copiar" },
        ],
      },
      {
        product_id: 200,
        variation_id: 300,
        quantity: 1,
        price: "135000",
        total: "135000",
        meta_data: [{ key: "Nota de preparación", value: "Fragil" }],
      },
    ],
    shipping_lines: [
      { method_id: "local_pickup", method_title: "Recoge en tienda", total: "0" },
    ],
  };
  const sedeOrigen = { nombre: "Centro", slug: "centro" };
  const sedeDestino = { nombre: "Norte", slug: "norte", woo_meta_match: { meta_value: "norte" } };

  it("fuerza status processing, payment cod y total_tax 0", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan Pérez",
      motivo: "Traslado",
      orderIdOrigen: 80446,
    });
    expect(payload.status).toBe("processing");
    expect(payload.payment_method).toBe("cod");
    expect(payload.total_tax).toBe("0");
  });

  it("copia el customer_id del origen por compatibilidad si no se pasa customerId", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan",
      motivo: "m",
      orderIdOrigen: 80446,
    });
    expect(payload.customer_id).toBe(123);
  });

  it("usa customerId resuelto (por email en destino) cuando se pasa", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan",
      motivo: "m",
      orderIdOrigen: 80446,
      customerId: 999,
    });
    expect(payload.customer_id).toBe(999);
  });

  it("fuerza price/total de ORIGEN por línea y filtra las metas de línea", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan",
      motivo: "m",
      orderIdOrigen: 80446,
    });
    expect(payload.line_items).toEqual([
      {
        product_id: 100,
        variation_id: 0,
        quantity: 2,
        price: "25000",
        total: "50000",
        meta_data: [{ key: "pa_unidad-de-medida-aproximado", value: "1kg" }],
      },
      {
        product_id: 200,
        variation_id: 300,
        quantity: 1,
        price: "135000",
        total: "135000",
        meta_data: [{ key: "Nota de preparación", value: "Fragil" }],
      },
    ]);
  });

  it("copia billing/shipping completos y shipping_lines", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan",
      motivo: "m",
      orderIdOrigen: 80446,
    });
    expect(payload.billing.first_name).toBe("Ana");
    expect(payload.billing.address_1).toBe("Calle 1 #2-3");
    expect(payload.shipping.city).toBeUndefined(); // tal cual viene del origen
    expect(payload.shipping_lines).toEqual([
      { method_id: "local_pickup", method_title: "Recoge en tienda", total: "0" },
    ]);
  });

  it("incluye customer_note original (sin bloque de traslado) y metas de pedido con destino", () => {
    const payload = buildClonePayload({
      order: pedidoOrigen,
      sedeOrigen,
      sedeDestino,
      adminName: "Juan Pérez",
      motivo: "Traslado",
      orderIdOrigen: 80446,
    });
    expect(payload.customer_note).toBe("Dejar en portería");
    expect(payload.customer_note).not.toContain("pedido original #80446");
    expect(payload.meta_data).toContainEqual({
      key: "_mkh_lite_branch_name",
      value: "norte",
    });
    expect(payload.meta_data).toContainEqual({
      key: "_mkh_transferred_from",
      value: "Centro (pedido #80446)",
    });
  });
});

// =============================================
// filterOrderNotes — Filtrado de notas autogeneradas
// =============================================

describe("filterOrderNotes", () => {
  it("escenario spec R4: 1 nota del cliente + 2 autogeneradas → solo la del cliente", () => {
    const notas = [
      { id: 1, author: "customer", customer_note: true, note: "Por favor llamar antes de entregar" },
      { id: 2, author: "system", customer_note: false, note: "Email sent to admin@x.com" },
      { id: 3, author: "system", customer_note: false, note: "Niveles de inventario reducidos: Arroz 5kg" },
    ];
    const filtradas = filterOrderNotes(notas);
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].id).toBe(1);
  });

  it("descarta notas con autor system", () => {
    const notas = [
      { author: "system", customer_note: false, note: "Estado del pedido cambiado" },
      { author: "WooCommerce", customer_note: false, note: "Pedido actualizado" },
      { author: "customer", customer_note: false, note: "Hola, quiero cambiar la entrega" },
    ];
    const filtradas = filterOrderNotes(notas);
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].note).toBe("Hola, quiero cambiar la entrega");
  });

  it("descarta las autogeneradas ES listadas en el contrato", () => {
    const notas = [
      { author: "admin", note: "Niveles de inventario reducidos: Leche" },
      { author: "admin", note: "Email enviado a cliente" },
      { author: "admin", note: "Pedido actualizado por el cliente" },
      { author: "admin", note: "Estado del pedido cambiado de pending a processing" },
      { author: "admin", note: "Pagos que se harán contra entrega" },
      { author: "admin", note: "Mantenimiento en inventario ejecutado" },
    ];
    expect(filterOrderNotes(notas)).toHaveLength(0);
  });

  it("descarta las variantes EN", () => {
    const notas = [
      { author: "system", note: "Stock levels reduced: Rice 5kg" },
      { author: "admin", note: "Order updated" },
      { author: "admin", note: "Order status changed from pending to processing" },
      { author: "admin", note: "Payments to be made" },
    ];
    expect(filterOrderNotes(notas)).toHaveLength(0);
  });

  it("preserva notas del cliente aunque el texto parezca autogenerado", () => {
    const notas = [
      { author: "customer", customer_note: true, note: "Email: avisar al llegar" },
      { author: "customer", customer_note: true, note: "Niveles de inventario reducidos" },
    ];
    expect(filterOrderNotes(notas)).toHaveLength(2);
  });

  it("descarta notas sin contenido", () => {
    const notas = [
      { author: "customer", note: "" },
      { author: "system", note: null },
      { author: "customer", note: "Nota válida" },
    ];
    const filtradas = filterOrderNotes(notas);
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].note).toBe("Nota válida");
  });

  it("retorna [] si no es array", () => {
    expect(filterOrderNotes(null)).toEqual([]);
    expect(filterOrderNotes("notas")).toEqual([]);
  });
});

// =============================================
// checkStockDestino — Warnings de stock pre-clon
// =============================================

describe("checkStockDestino", () => {
  it("reporta item_missing para producto ausente en destino", async () => {
    const fetchProducts = vi.fn(async () => [{ id: 100, manage_stock: true, stock_quantity: 10 }]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 999, variation_id: 0, quantity: 1, name: "Faltante" }],
      fetchProducts,
    });
    expect(warnings).toEqual([
      {
        tipo: "item_missing",
        product_id: 999,
        variation_id: 0,
        nombre: "Faltante",
        stock: null,
        qty: 1,
      },
    ]);
  });

  it("reporta item_missing para variación ausente en destino", async () => {
    const fetchProducts = vi.fn(async (endpoint) => (endpoint.startsWith("products/") ? [] : []));
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 200, variation_id: 300, quantity: 1, name: "Var" }],
      fetchProducts,
    });
    expect(warnings[0]).toMatchObject({
      tipo: "item_missing",
      product_id: 200,
      variation_id: 300,
    });
  });

  it("reporta stock_unavailable con stock_quantity 0", async () => {
    const fetchProducts = vi.fn(async () => [
      { id: 100, manage_stock: true, stock_quantity: 0, name: "Arroz 5kg" },
    ]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz 5kg" }],
      fetchProducts,
    });
    expect(warnings[0]).toMatchObject({
      tipo: "stock_unavailable",
      product_id: 100,
      stock: 0,
      qty: 2,
    });
  });

  it("reporta stock_unavailable con stock negativo", async () => {
    const fetchProducts = vi.fn(async () => [
      { id: 100, manage_stock: true, stock_quantity: -3, name: "Arroz 5kg" },
    ]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz 5kg" }],
      fetchProducts,
    });
    expect(warnings[0].tipo).toBe("stock_unavailable");
  });

  it("reporta stock_unavailable si el destino no maneja stock (spec R2)", async () => {
    const fetchProducts = vi.fn(async () => [
      { id: 100, manage_stock: false, stock_quantity: null, name: "Arroz 5kg" },
    ]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz 5kg" }],
      fetchProducts,
    });
    expect(warnings[0]).toMatchObject({
      tipo: "stock_unavailable",
      product_id: 100,
      stock: null,
    });
  });

  it("reporta stock_insufficient cuando el stock no alcanza", async () => {
    const fetchProducts = vi.fn(async () => [
      { id: 100, manage_stock: true, stock_quantity: 3, name: "Arroz 5kg" },
    ]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 5, name: "Arroz 5kg" }],
      fetchProducts,
    });
    expect(warnings[0]).toMatchObject({
      tipo: "stock_insufficient",
      product_id: 100,
      stock: 3,
      qty: 5,
    });
  });

  it("NO genera warning con stock suficiente", async () => {
    const fetchProducts = vi.fn(async () => [
      { id: 100, manage_stock: true, stock_quantity: 10, name: "Arroz 5kg" },
    ]);
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz 5kg" }],
      fetchProducts,
    });
    expect(warnings).toEqual([]);
  });

  it("consulta variaciones con el endpoint del producto padre", async () => {
    const fetchProducts = vi.fn(async (endpoint) => {
      if (endpoint === "products/200/variations") {
        return [{ id: 300, manage_stock: true, stock_quantity: 5 }];
      }
      return [];
    });
    await checkStockDestino({
      lineItems: [{ product_id: 200, variation_id: 300, quantity: 1, name: "Papel x6" }],
      fetchProducts,
    });
    expect(fetchProducts).toHaveBeenCalledWith("products/200/variations", {
      include: [300],
      per_page: 100,
      _fields: "id,manage_stock,stock_quantity",
    });
  });

  it("consulta simples con include y _fields", async () => {
    const fetchProducts = vi.fn(async () => []);
    await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz" }],
      fetchProducts,
    });
    expect(fetchProducts).toHaveBeenCalledWith("products", {
      include: [100],
      per_page: 100,
      _fields: "id,manage_stock,stock_quantity,stock_status,name",
    });
  });

  it("clasifica un mix de líneas correctamente", async () => {
    const fetchProducts = vi.fn(async (endpoint, params) => {
      if (endpoint === "products") {
        return params.include.map((id) => {
          const stock = { 100: 2, 300: 8 }[id];
          return { id, manage_stock: true, stock_quantity: stock };
        });
      }
      return [{ id: 301, manage_stock: true, stock_quantity: 4 }]; // variación
    });
    const warnings = await checkStockDestino({
      lineItems: [
        { product_id: 100, variation_id: 0, quantity: 2, name: "Arroz" }, // stock 2 = qty 2 → ok
        { product_id: 200, variation_id: 301, quantity: 5, name: "Papel" }, // stock 4 < 5 → insuficiente
        { product_id: 300, variation_id: 0, quantity: 8, name: "Aceite" }, // stock 8 → ok
      ],
      fetchProducts,
    });
    expect(warnings).toEqual([
      {
        tipo: "stock_insufficient",
        product_id: 200,
        variation_id: 301,
        nombre: "Papel",
        stock: 4,
        qty: 5,
      },
    ]);
  });

  it("retorna [] con lineItems vacío o sin fetchProducts", async () => {
    expect(await checkStockDestino({ lineItems: [], fetchProducts: vi.fn() })).toEqual([]);
    expect(
      await checkStockDestino({ lineItems: [{ product_id: 1 }], fetchProducts: null }),
    ).toEqual([]);
  });

  it("si fetchProducts falla, no inventa warnings (no bloquea el traslado)", async () => {
    const fetchProducts = vi.fn(async () => {
      throw new Error("timeout");
    });
    const warnings = await checkStockDestino({
      lineItems: [{ product_id: 100, variation_id: 0, quantity: 2, name: "Arroz" }],
      fetchProducts,
    });
    expect(warnings).toEqual([]);
  });
});

// =============================================
// resolveCustomerDestino — cliente por email en la sede destino
// =============================================

describe("resolveCustomerDestino", () => {
  it("usa el id del cliente si existe con ese email en destino", async () => {
    const customerId = await resolveCustomerDestino({
      order: { billing: { email: "  ANA@x.com " } },
      fetchCustomerByEmail: async (email) => {
        expect(email).toBe("ana@x.com"); // normalizado (trim + lowercase)
        return [{ id: 999, email: "ana@x.com" }];
      },
    });
    expect(customerId).toBe(999);
  });

  it("devuelve 0 (invitado) si el cliente no existe en destino", async () => {
    const customerId = await resolveCustomerDestino({
      order: { billing: { email: "nadie@x.com" } },
      fetchCustomerByEmail: async () => [],
    });
    expect(customerId).toBe(0);
  });

  it("devuelve 0 si el pedido no tiene email de billing", async () => {
    const customerId = await resolveCustomerDestino({
      order: { billing: { first_name: "Ana" } },
      fetchCustomerByEmail: vi.fn(),
    });
    expect(customerId).toBe(0);
  });

  it("devuelve 0 si la consulta al destino falla (no bloquea el traslado)", async () => {
    const customerId = await resolveCustomerDestino({
      order: { billing: { email: "ana@x.com" } },
      fetchCustomerByEmail: async () => {
        throw new Error("timeout");
      },
    });
    expect(customerId).toBe(0);
  });
});
