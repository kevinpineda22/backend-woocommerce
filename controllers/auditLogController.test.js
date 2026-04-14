import { describe, it, expect } from "vitest";

// =============================================
// Test de funciones puras extraídas de auditLogController.js
// NO requiere mock de supabase — testeamos lógica pura.
// =============================================

const {
  _parsePagination: parsePagination,
  _buildPaginationResponse: buildPaginationResponse,
  _mapAuditEvent: mapAuditEvent,
  _deduplicateActions: deduplicateActions,
  _MAX_LIMIT: MAX_LIMIT,
} = require("../controllers/auditLogController");

// =============================================
// MAX_LIMIT — constante defensiva
// =============================================

describe("MAX_LIMIT", () => {
  it("es 200", () => {
    expect(MAX_LIMIT).toBe(200);
  });
});

// =============================================
// parsePagination — sanitiza page/limit
// Si esto falla, rangos rotos van a Supabase
// =============================================

describe("parsePagination", () => {
  it("defaults: page=1, limit=50 si no se pasan args", () => {
    const { pageNum, limitNum, offset } = parsePagination();
    expect(pageNum).toBe(1);
    expect(limitNum).toBe(50);
    expect(offset).toBe(0);
  });

  it("parsea strings numéricos correctamente", () => {
    const { pageNum, limitNum, offset } = parsePagination("3", "25");
    expect(pageNum).toBe(3);
    expect(limitNum).toBe(25);
    expect(offset).toBe(50); // (3-1) * 25
  });

  it("limit no puede exceder MAX_LIMIT (200)", () => {
    const { limitNum } = parsePagination("1", "500");
    expect(limitNum).toBe(200);
  });

  it("page mínimo es 1 incluso si envían 0", () => {
    const { pageNum } = parsePagination("0", "50");
    expect(pageNum).toBe(1);
  });

  it("page mínimo es 1 con negativo", () => {
    const { pageNum } = parsePagination("-5", "50");
    expect(pageNum).toBe(1);
  });

  it("limit con valor '0' usa default 50 (parseInt('0') es falsy → || 50)", () => {
    const { limitNum } = parsePagination("1", "0");
    expect(limitNum).toBe(50);
  });

  it("limit mínimo es 1 con negativo", () => {
    const { limitNum } = parsePagination("1", "-10");
    expect(limitNum).toBe(1);
  });

  it("NaN en page → default 1", () => {
    const { pageNum } = parsePagination("abc", "50");
    expect(pageNum).toBe(1);
  });

  it("NaN en limit → default 50", () => {
    const { limitNum } = parsePagination("1", "xyz");
    expect(limitNum).toBe(50);
  });

  it("undefined en ambos → defaults", () => {
    const { pageNum, limitNum } = parsePagination(undefined, undefined);
    expect(pageNum).toBe(1);
    expect(limitNum).toBe(50);
  });

  it("calcula offset correctamente para page 5, limit 20", () => {
    const { offset } = parsePagination("5", "20");
    expect(offset).toBe(80); // (5-1) * 20
  });

  it("offset es 0 para page 1", () => {
    const { offset } = parsePagination("1", "100");
    expect(offset).toBe(0);
  });
});

// =============================================
// buildPaginationResponse — respuesta de API
// =============================================

describe("buildPaginationResponse", () => {
  it("construye respuesta correcta con datos", () => {
    const res = buildPaginationResponse(2, 25, 150);
    expect(res).toEqual({
      page: 2,
      limit: 25,
      total: 150,
      total_pages: 6, // ceil(150/25)
    });
  });

  it("total_pages redondea hacia arriba", () => {
    const res = buildPaginationResponse(1, 50, 51);
    expect(res.total_pages).toBe(2); // ceil(51/50)
  });

  it("total_pages = 1 si exactamente 1 página", () => {
    const res = buildPaginationResponse(1, 50, 50);
    expect(res.total_pages).toBe(1);
  });

  it("total y total_pages = 0 si count es 0", () => {
    const res = buildPaginationResponse(1, 50, 0);
    expect(res.total).toBe(0);
    expect(res.total_pages).toBe(0);
  });

  it("total y total_pages = 0 si count es null", () => {
    const res = buildPaginationResponse(1, 50, null);
    expect(res.total).toBe(0);
    expect(res.total_pages).toBe(0);
  });

  it("total y total_pages = 0 si count es undefined", () => {
    const res = buildPaginationResponse(1, 50, undefined);
    expect(res.total).toBe(0);
    expect(res.total_pages).toBe(0);
  });
});

// =============================================
// mapAuditEvent — transforma row de DB a API
// =============================================

describe("mapAuditEvent", () => {
  it("mapea todos los campos de un row completo", () => {
    const row = {
      id: 1,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "admin",
      actor_id: "admin@x.com",
      actor_name: "Juan",
      action: "session.created",
      entity_type: "session",
      entity_id: "sess-1",
      sede_id: "sede-uuid",
      metadata: { orders: [100] },
      wc_sedes: { nombre: "Copacabana" },
    };
    const evt = mapAuditEvent(row);
    expect(evt).toEqual({
      id: 1,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "admin",
      actor_id: "admin@x.com",
      actor_name: "Juan",
      action: "session.created",
      entity_type: "session",
      entity_id: "sess-1",
      sede_id: "sede-uuid",
      sede_nombre: "Copacabana",
      metadata: { orders: [100] },
    });
  });

  it("sede_nombre es null si wc_sedes es null (join vacío)", () => {
    const row = {
      id: 2,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "system",
      actor_id: null,
      actor_name: null,
      action: "cache.invalidated",
      entity_type: "system",
      entity_id: "cache",
      sede_id: null,
      metadata: null,
      wc_sedes: null,
    };
    const evt = mapAuditEvent(row);
    expect(evt.sede_nombre).toBeNull();
    expect(evt.metadata).toEqual({});
  });

  it("metadata default {} si es null en DB", () => {
    const row = {
      id: 3,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "picker",
      actor_id: "p1",
      actor_name: "Pedro",
      action: "item.picked",
      entity_type: "product",
      entity_id: "sku-1",
      sede_id: "s1",
      metadata: null,
      wc_sedes: { nombre: "Centro" },
    };
    expect(mapAuditEvent(row).metadata).toEqual({});
  });

  it("preserva metadata si existe", () => {
    const meta = { weight: 1.5, unit: "kg" };
    const row = {
      id: 4,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "picker",
      actor_id: "p1",
      actor_name: "Pedro",
      action: "item.weighed",
      entity_type: "product",
      entity_id: "sku-2",
      sede_id: "s1",
      metadata: meta,
      wc_sedes: { nombre: "Centro" },
    };
    expect(mapAuditEvent(row).metadata).toEqual(meta);
  });

  it("no incluye wc_sedes en la salida (solo sede_nombre)", () => {
    const row = {
      id: 5,
      created_at: "2026-04-10T10:00:00Z",
      actor_type: "admin",
      actor_id: "a1",
      actor_name: "Admin",
      action: "test",
      entity_type: "session",
      entity_id: "s1",
      sede_id: "sede-1",
      metadata: {},
      wc_sedes: { nombre: "Norte" },
    };
    const evt = mapAuditEvent(row);
    expect(evt).not.toHaveProperty("wc_sedes");
    expect(evt.sede_nombre).toBe("Norte");
  });
});

// =============================================
// deduplicateActions — lista única y ordenada
// =============================================

describe("deduplicateActions", () => {
  it("deduplica y ordena acciones", () => {
    const data = [
      { action: "session.created" },
      { action: "item.picked" },
      { action: "session.created" },
      { action: "payment.marked" },
      { action: "item.picked" },
    ];
    expect(deduplicateActions(data)).toEqual([
      "item.picked",
      "payment.marked",
      "session.created",
    ]);
  });

  it("retorna array vacío con data vacía", () => {
    expect(deduplicateActions([])).toEqual([]);
  });

  it("retorna array vacío con null", () => {
    expect(deduplicateActions(null)).toEqual([]);
  });

  it("retorna array vacío con undefined", () => {
    expect(deduplicateActions(undefined)).toEqual([]);
  });

  it("una sola acción", () => {
    expect(deduplicateActions([{ action: "solo.una" }])).toEqual(["solo.una"]);
  });

  it("ordena alfabéticamente", () => {
    const data = [
      { action: "z.last" },
      { action: "a.first" },
      { action: "m.middle" },
    ];
    expect(deduplicateActions(data)).toEqual(["a.first", "m.middle", "z.last"]);
  });
});
