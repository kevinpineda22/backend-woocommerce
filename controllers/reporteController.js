const crypto = require("crypto");
const { obtenerReporte, enviarReporte } = require("../services/reporteNoEncontradosService");
const { renderAsunto, renderHtml, fechaColombia, esFechaValida } = require("../utils/reporteNoEncontrados");

/**
 * Vercel Cron llama con `Authorization: Bearer ${CRON_SECRET}`. Sin el secreto
 * configurado se rechaza todo: este endpoint manda correos.
 */
function autorizado(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const esperado = Buffer.from(`Bearer ${secreto}`);
  const recibido = Buffer.from(String(req.headers.authorization || ""));
  return recibido.length === esperado.length && crypto.timingSafeEqual(recibido, esperado);
}

/**
 * GET /api/reportes/no-encontrados
 *   ?fecha=YYYY-MM-DD  día en Colombia (default: hoy en Colombia)
 *   ?enviar=0          no manda el correo: devuelve el reporte y el HTML para revisarlo
 *
 * El cron corre a las 23:00 de Colombia (04:00 UTC) sin parámetros: reporta y manda el día.
 */
exports.reporteNoEncontrados = async (req, res) => {
  if (!autorizado(req)) return res.status(401).json({ error: "No autorizado" });

  const fecha = req.query.fecha || fechaColombia();
  if (!esFechaValida(fecha)) {
    return res.status(400).json({ error: "fecha debe ser YYYY-MM-DD" });
  }

  try {
    if (req.query.enviar === "0") {
      const reporte = await obtenerReporte(fecha);
      return res.status(200).json({
        enviado: false,
        asunto: renderAsunto(reporte),
        reporte,
        html: renderHtml(reporte),
      });
    }

    const { reporte, to, messageId } = await enviarReporte(fecha);
    console.log(
      `📧 Reporte no encontrados ${fecha} → ${to.join(",")}: ${reporte.totales.productos_no_encontrados} productos`,
    );
    return res.status(200).json({ enviado: true, fecha, to, messageId, totales: reporte.totales });
  } catch (error) {
    console.error(`Error en reporte de no encontrados ${fecha}:`, error.message);
    return res.status(500).json({ error: error.message });
  }
};
