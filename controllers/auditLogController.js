/**
 * AUDIT LOG CONTROLLER
 *
 * Lee wc_audit_log para el panel de Auditoría.
 * Soporta filtros por actor, acción, entidad, sede y rango de fechas.
 */

const { supabase } = require("../services/supabaseClient");

// Límite máximo de registros por página (defensivo: evita cargas enormes).
const MAX_LIMIT = 200;

/**
 * Parsea y sanitiza parámetros de paginación.
 * Pura: no toca DB ni request.
 */
function parsePagination(page, limit) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
}

/**
 * Construye el objeto de paginación para la respuesta.
 */
function buildPaginationResponse(pageNum, limitNum, count) {
  return {
    page: pageNum,
    limit: limitNum,
    total: count || 0,
    total_pages: count ? Math.ceil(count / limitNum) : 0,
  };
}

/**
 * Mapea un row de wc_audit_log a la forma de respuesta del API.
 */
function mapAuditEvent(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    actor_type: row.actor_type,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    sede_id: row.sede_id,
    sede_nombre: row.wc_sedes?.nombre || null,
    metadata: row.metadata || {},
  };
}

/**
 * Deduplica y ordena una lista de acciones.
 */
function deduplicateActions(data) {
  return [...new Set((data || []).map((r) => r.action))].sort();
}

exports.listAuditEvents = async (req, res) => {
  try {
    const {
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      date_from,
      date_to,
      q, // búsqueda por nombre de actor o texto libre
      page = "1",
      limit = "50",
    } = req.query;

    const { pageNum, limitNum, offset } = parsePagination(page, limit);

    let query = supabase
      .from("wc_audit_log")
      .select(
        "id, created_at, actor_type, actor_id, actor_name, action, entity_type, entity_id, sede_id, metadata, wc_sedes(nombre)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (req.sedeId) query = query.eq("sede_id", req.sedeId);
    if (actor_type) query = query.eq("actor_type", actor_type);
    if (actor_id) query = query.eq("actor_id", actor_id);
    if (action) query = query.eq("action", action);
    if (entity_type) query = query.eq("entity_type", entity_type);
    if (entity_id) query = query.eq("entity_id", entity_id);
    if (date_from) query = query.gte("created_at", date_from);
    if (date_to) query = query.lte("created_at", date_to);
    if (q && q.trim()) {
      query = query.ilike("actor_name", `%${q.trim()}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const events = (data || []).map(mapAuditEvent);

    res.status(200).json({
      events,
      pagination: buildPaginationResponse(pageNum, limitNum, count),
    });
  } catch (error) {
    console.error("Error listAuditEvents:", error.message);
    res
      .status(500)
      .json({
        error: `Error al listar eventos de auditoría: ${error.message}`,
      });
  }
};

exports.getAuditActions = async (_req, res) => {
  try {
    // Devuelve lista de acciones distintas para poblar el dropdown de filtros.
    const { data, error } = await supabase
      .from("wc_audit_log")
      .select("action")
      .limit(500);
    if (error) throw error;

    const unique = deduplicateActions(data);
    res.status(200).json(unique);
  } catch (error) {
    console.error("Error getAuditActions:", error.message);
    res
      .status(500)
      .json({ error: `Error al listar acciones: ${error.message}` });
  }
};

// Exportar helpers puros para testing
exports._parsePagination = parsePagination;
exports._buildPaginationResponse = buildPaginationResponse;
exports._mapAuditEvent = mapAuditEvent;
exports._deduplicateActions = deduplicateActions;
exports._MAX_LIMIT = MAX_LIMIT;
