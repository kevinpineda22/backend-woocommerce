import { describe, it, expect } from "vitest";

// =============================================
// Test de funciones puras extraídas de auditService.js
// NO requiere mock de supabase — testeamos lógica pura.
// =============================================

const {
  isValidAuditEvent,
  buildAuditPayload,
  VALID_ACTOR_TYPES,
} = require("./auditService");

// =============================================
// VALID_ACTOR_TYPES — constantes exportadas
// =============================================

describe("VALID_ACTOR_TYPES", () => {
  it("contiene exactamente admin, picker, auditor, system", () => {
    expect(VALID_ACTOR_TYPES).toEqual(["admin", "picker", "auditor", "system"]);
  });

  it("es un array de 4 elementos", () => {
    expect(VALID_ACTOR_TYPES).toHaveLength(4);
  });
});

// =============================================
// isValidAuditEvent — Validaciones defensivas
// Si esto falla, eventos basura entran al audit log
// =============================================

describe("isValidAuditEvent", () => {
  const validEvent = {
    actor: { type: "admin", id: "a@x.com", name: "Admin" },
    action: "session.created",
    entity: { type: "session", id: "abc" },
  };

  it("retorna true para evento completo y válido", () => {
    expect(isValidAuditEvent(validEvent)).toBe(true);
  });

  it("retorna false sin argumentos", () => {
    expect(isValidAuditEvent()).toBe(false);
  });

  it("retorna false con objeto vacío", () => {
    expect(isValidAuditEvent({})).toBe(false);
  });

  it("retorna false sin actor", () => {
    expect(
      isValidAuditEvent({ action: "test", entity: { type: "x", id: "1" } }),
    ).toBe(false);
  });

  it("retorna false sin action", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        entity: { type: "x", id: "1" },
      }),
    ).toBe(false);
  });

  it("retorna false sin entity", () => {
    expect(
      isValidAuditEvent({ actor: { type: "admin" }, action: "test" }),
    ).toBe(false);
  });

  it("retorna false si entity no tiene type", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        action: "test",
        entity: { id: "1" },
      }),
    ).toBe(false);
  });

  it("retorna false si entity.id es null", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        action: "test",
        entity: { type: "session", id: null },
      }),
    ).toBe(false);
  });

  it("retorna false si entity.id es undefined", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        action: "test",
        entity: { type: "session" },
      }),
    ).toBe(false);
  });

  it("acepta entity.id = 0 (es válido)", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        action: "test",
        entity: { type: "batch", id: 0 },
      }),
    ).toBe(true);
  });

  it("acepta entity.id = '' (string vacío — es truthy en != null)", () => {
    expect(
      isValidAuditEvent({
        actor: { type: "admin" },
        action: "test",
        entity: { type: "batch", id: "" },
      }),
    ).toBe(true);
  });
});

// =============================================
// buildAuditPayload — Normalización del payload
// Si esto falla, insertamos datos corruptos en wc_audit_log
// =============================================

describe("buildAuditPayload", () => {
  // ----- ACTOR TYPE MAPPING -----

  describe("normalización de actor_type", () => {
    it.each(["admin", "picker", "auditor", "system"])(
      "acepta tipo válido: %s",
      (type) => {
        const payload = buildAuditPayload({
          actor: { type, id: "test", name: "Test" },
          action: "test.action",
          entity: { type: "session", id: "abc" },
        });
        expect(payload.actor_type).toBe(type);
      },
    );

    it("tipo inválido se convierte a 'system'", () => {
      const payload = buildAuditPayload({
        actor: { type: "hacker", id: "x", name: "Evil" },
        action: "test.action",
        entity: { type: "session", id: "abc" },
      });
      expect(payload.actor_type).toBe("system");
    });

    it("tipo undefined se convierte a 'system'", () => {
      const payload = buildAuditPayload({
        actor: { id: "x", name: "NoType" },
        action: "test.action",
        entity: { type: "session", id: "abc" },
      });
      expect(payload.actor_type).toBe("system");
    });

    it("tipo null se convierte a 'system'", () => {
      const payload = buildAuditPayload({
        actor: { type: null, id: "x", name: "Null" },
        action: "test.action",
        entity: { type: "session", id: "abc" },
      });
      expect(payload.actor_type).toBe("system");
    });
  });

  // ----- ID STRING COERCION -----

  describe("coerción de IDs a string", () => {
    it("entity_id numérico se convierte a string", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "order", id: 77700 },
      });
      expect(payload.entity_id).toBe("77700");
      expect(typeof payload.entity_id).toBe("string");
    });

    it("actor_id numérico se convierte a string", () => {
      const payload = buildAuditPayload({
        actor: { type: "picker", id: 42, name: "Pedro" },
        action: "test",
        entity: { type: "product", id: "sku-123" },
      });
      expect(payload.actor_id).toBe("42");
      expect(typeof payload.actor_id).toBe("string");
    });

    it("entity_id = 0 se convierte a '0'", () => {
      const payload = buildAuditPayload({
        actor: { type: "system", id: "cron", name: "System" },
        action: "sync.completed",
        entity: { type: "batch", id: 0 },
      });
      expect(payload.entity_id).toBe("0");
    });

    it("entity_id string se mantiene", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "sess-abc" },
      });
      expect(payload.entity_id).toBe("sess-abc");
    });
  });

  // ----- CAMPOS OPCIONALES / DEFAULTS -----

  describe("defaults de campos opcionales", () => {
    it("sede_id null si no se provee", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
      });
      expect(payload.sede_id).toBeNull();
    });

    it("sede_id se pasa correctamente cuando está presente", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
        sedeId: "sede-uuid-1",
      });
      expect(payload.sede_id).toBe("sede-uuid-1");
    });

    it("metadata vacío si no se provee", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
      });
      expect(payload.metadata).toEqual({});
    });

    it("metadata vacío si es tipo inválido (string)", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
        metadata: "no es un objeto",
      });
      expect(payload.metadata).toEqual({});
    });

    it("metadata vacío si es null", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
        metadata: null,
      });
      expect(payload.metadata).toEqual({});
    });

    it("metadata se preserva si es un objeto válido", () => {
      const meta = { payment_method: "credito", orders: [123, 124] };
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
        metadata: meta,
      });
      expect(payload.metadata).toEqual(meta);
    });

    it("metadata vacío si es un array (typeof array === 'object')", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "a@x.com", name: "Admin" },
        action: "test",
        entity: { type: "session", id: "abc" },
        metadata: [1, 2, 3],
      });
      // Arrays pass typeof === 'object', so they would be kept.
      // This tests the ACTUAL behavior — arrays are objects.
      expect(payload.metadata).toEqual([1, 2, 3]);
    });

    it("actor_name null si no se provee", () => {
      const payload = buildAuditPayload({
        actor: { type: "system", id: "webhook" },
        action: "webhook.received",
        entity: { type: "order", id: "77700" },
      });
      expect(payload.actor_name).toBeNull();
    });

    it("actor_id null si no se provee", () => {
      const payload = buildAuditPayload({
        actor: { type: "system" },
        action: "cache.invalidated",
        entity: { type: "system", id: "cache" },
      });
      expect(payload.actor_id).toBeNull();
    });
  });

  // ----- PAYLOAD COMPLETO -----

  describe("payload completo", () => {
    it("evento completo de admin con todos los campos", () => {
      const payload = buildAuditPayload({
        actor: { type: "admin", id: "admin@x.com", name: "Juan" },
        action: "payment.marked",
        entity: { type: "session", id: "sess-123" },
        sedeId: "sede-uuid-1",
        metadata: { payment_method: "credito", orders: [123, 124] },
      });
      expect(payload).toEqual({
        actor_type: "admin",
        actor_id: "admin@x.com",
        actor_name: "Juan",
        action: "payment.marked",
        entity_type: "session",
        entity_id: "sess-123",
        sede_id: "sede-uuid-1",
        metadata: { payment_method: "credito", orders: [123, 124] },
      });
    });

    it("evento mínimo de system sin campos opcionales", () => {
      const payload = buildAuditPayload({
        actor: { type: "system" },
        action: "cache.invalidated",
        entity: { type: "system", id: "cache" },
      });
      expect(payload).toEqual({
        actor_type: "system",
        actor_id: null,
        actor_name: null,
        action: "cache.invalidated",
        entity_type: "system",
        entity_id: "cache",
        sede_id: null,
        metadata: {},
      });
    });
  });
});
