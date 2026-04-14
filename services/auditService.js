/**
 * AUDIT SERVICE
 *
 * Fire-and-forget logger para el timeline global del sistema.
 * Nunca bloquea la operación principal: si falla el insert, solo logea error
 * a consola y devuelve silenciosamente.
 *
 * Uso:
 *   const { logAuditEvent } = require("./auditService");
 *   logAuditEvent({
 *     actor: { type: "admin", id: "admin@x.com", name: "Juan" },
 *     action: "payment.marked",
 *     entity: { type: "session", id: sessionId },
 *     sedeId: req.sedeId,
 *     metadata: { payment_method: "credito", orders: [123, 124] },
 *   });
 *
 * NO se debe usar `await` — el helper ya es no-bloqueante.
 */

const { supabase } = require("./supabaseClient");

const VALID_ACTOR_TYPES = ["admin", "picker", "auditor", "system"];

// Cache in-memory para nombres de pickers (TTL: 10 min)
// Evita hacer un SELECT a wc_pickers por cada acción de picking.
const PICKER_NAME_CACHE = new Map();
const PICKER_CACHE_TTL = 10 * 60 * 1000;

async function resolvePickerName(pickerId) {
  if (!pickerId) return null;
  const cached = PICKER_NAME_CACHE.get(pickerId);
  if (cached && Date.now() - cached.at < PICKER_CACHE_TTL) {
    return cached.name;
  }
  try {
    const { data } = await supabase
      .from("wc_pickers")
      .select("nombre_completo")
      .eq("id", pickerId)
      .single();
    const name = data?.nombre_completo || null;
    PICKER_NAME_CACHE.set(pickerId, { name, at: Date.now() });
    return name;
  } catch (_) {
    return null;
  }
}

/**
 * Valida si un evento de auditoría tiene los datos mínimos para registrar.
 * @returns {boolean} true si es válido
 */
function isValidAuditEvent({ actor, action, entity } = {}) {
  return !!(actor && action && entity && entity.type && entity.id != null);
}

/**
 * Construye el payload normalizado para insertar en wc_audit_log.
 * Pura: no tiene side effects, no toca DB.
 */
function buildAuditPayload({ actor, action, entity, sedeId, metadata } = {}) {
  const actorType = VALID_ACTOR_TYPES.includes(actor.type)
    ? actor.type
    : "system";

  return {
    actor_type: actorType,
    actor_id: actor.id ? String(actor.id) : null,
    actor_name: actor.name || null,
    action: String(action),
    entity_type: String(entity.type),
    entity_id: String(entity.id),
    sede_id: sedeId || null,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  };
}

/**
 * Registra un evento en wc_audit_log.
 * @param {object} params
 * @param {object} params.actor       { type, id, name }
 * @param {string} params.action      dot-namespaced (e.g. 'session.created')
 * @param {object} params.entity      { type, id }
 * @param {string} [params.sedeId]    uuid de sede (opcional)
 * @param {object} [params.metadata]  contexto adicional (jsonb)
 */
function logAuditEvent({ actor, action, entity, sedeId, metadata } = {}) {
  // Validaciones defensivas: si no hay actor/action/entity, no registramos.
  if (!isValidAuditEvent({ actor, action, entity })) {
    console.warn("[audit] evento descartado por datos incompletos:", {
      actor,
      action,
      entity,
    });
    return;
  }

  const basePayload = buildAuditPayload({
    actor,
    action,
    entity,
    sedeId,
    metadata,
  });

  // Si es un picker sin nombre explícito, resolvemos async desde cache/DB.
  const needsResolution =
    basePayload.actor_type === "picker" &&
    !basePayload.actor_name &&
    basePayload.actor_id;

  const insert = (payload) =>
    supabase
      .from("wc_audit_log")
      .insert([payload])
      .then(({ error }) => {
        if (error) {
          console.error("[audit] insert failed:", error.message, {
            action,
            entity_type: payload.entity_type,
            entity_id: payload.entity_id,
          });
        }
      })
      .catch((err) => {
        console.error("[audit] insert threw:", err.message || err);
      });

  if (needsResolution) {
    resolvePickerName(basePayload.actor_id)
      .then((name) => insert({ ...basePayload, actor_name: name }))
      .catch(() => insert(basePayload));
  } else {
    insert(basePayload);
  }
}

module.exports = {
  logAuditEvent,
  isValidAuditEvent,
  buildAuditPayload,
  VALID_ACTOR_TYPES,
};
