/**
 * MIDDLEWARE MULTI-SEDE
 *
 * Extrae el contexto de sede de cada petición HTTP y lo adjunta al request.
 *
 * Fuentes (en orden de prioridad):
 *   1. Header: X-Sede-ID (UUID directo)
 *   2. Query param: ?sede_id=UUID
 *   3. Query param: ?sede_slug=slug
 *
 * Resultado:
 *   - req.sedeId: UUID de la sede activa (o null para super_admin sin filtro)
 *   - req.sedeName: Nombre de la sede (para logs)
 *   - req.isAllSedes: true si el usuario quiere ver TODAS las sedes
 */

const {
  getSedeById,
  getSedeBySlug,
  getAllSedes,
} = require("../services/sedeConfig");

const sedeMiddleware = async (req, res, next) => {
  try {
    // 1. Intentar obtener sede_id de múltiples fuentes
    let sedeId = req.headers["x-sede-id"] || req.query.sede_id || null;
    const sedeSlug = req.query.sede_slug || null;

    // Si viene "todas" o "all", es modo super admin (sin filtro)
    if (
      sedeId === "todas" ||
      sedeId === "all" ||
      sedeSlug === "todas" ||
      sedeSlug === "all"
    ) {
      req.sedeId = null;
      req.sedeName = "Todas las Sedes";
      req.isAllSedes = true;
      return next();
    }

    // 2. Si viene un slug, resolver a UUID
    if (!sedeId && sedeSlug) {
      const sede = await getSedeBySlug(sedeSlug);
      if (sede) {
        sedeId = sede.id;
      }
    }

    // 3. Validar que la sede existe
    if (sedeId) {
      const sede = await getSedeById(sedeId);
      if (sede) {
        req.sedeId = sede.id;
        req.sedeName = sede.nombre;
        req.isAllSedes = false;
      } else {
        // Sede no encontrada, pero no bloqueamos la petición
        // (podría ser una petición legacy sin sede)
        req.sedeId = null;
        req.sedeName = null;
        req.isAllSedes = false;
      }
    } else {
      req.sedeId = null;
      req.sedeName = null;
      req.isAllSedes = false;
    }

    next();
  } catch (error) {
    console.error("Error en sedeMiddleware:", error);
    // No bloqueamos la petición si falla el middleware
    req.sedeId = null;
    req.sedeName = null;
    req.isAllSedes = false;
    next();
  }
};

module.exports = { sedeMiddleware };
