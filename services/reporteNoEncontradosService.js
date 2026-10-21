const { supabase } = require("./supabaseClient");
const { enviarCorreo, listaCorreos } = require("./mailService");
const {
  rangoDiaColombia,
  armarReporte,
  renderAsunto,
  renderHtml,
} = require("../utils/reporteNoEncontrados");

// Tomás, líder de inventarios. Overridable (varios separados por coma).
const DESTINATARIOS_DEFAULT = "Inventarios@merkahorrosas.com";
const PAGINA = 1000; // tope de filas por request de Supabase

/** Trae los logs del día paginando: una fila por unidad, puede pasar de 1000. */
async function traerLogs({ desde, hasta }) {
  const filas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("wc_log_picking")
      .select(
        "id, id_asignacion, id_pedido, id_producto_original, nombre_producto, accion, motivo, pasillo, nombre_sustituto, sede_id, fecha_registro",
      )
      .in("accion", ["no_encontrado", "sustituido"])
      .gte("fecha_registro", desde)
      .lt("fecha_registro", hasta)
      .order("id", { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** Asignaciones de esos logs, para sacar el SKU del snapshot y el picker. */
async function traerAsignaciones(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("wc_asignaciones_pedidos")
    .select("id, nombre_picker, reporte_snapshot")
    .in("id", ids);
  if (error) throw error;
  return data || [];
}

async function traerSedes() {
  // Todas, no solo las activas: un log viejo puede ser de una sede apagada.
  const { data, error } = await supabase.from("wc_sedes").select("id, nombre");
  if (error) throw error;
  return data || [];
}

async function obtenerReporte(fecha) {
  const rango = rangoDiaColombia(fecha);
  const logs = await traerLogs(rango);
  const idsAsig = [...new Set(logs.map((l) => l.id_asignacion).filter(Boolean))];
  const [asignaciones, sedes] = await Promise.all([traerAsignaciones(idsAsig), traerSedes()]);
  return armarReporte({ logs, asignaciones, sedes, fecha });
}

/**
 * Arma y manda el reporte. Se manda también los días sin novedades: si un día
 * no llega nada, inventarios no puede distinguir "no hubo" de "se rompió".
 */
async function enviarReporte(fecha) {
  const reporte = await obtenerReporte(fecha);
  const to = listaCorreos(process.env.REPORTE_NO_ENCONTRADOS_MAIL, DESTINATARIOS_DEFAULT);
  const info = await enviarCorreo({
    to,
    subject: renderAsunto(reporte),
    html: renderHtml(reporte),
  });
  return { reporte, to, messageId: info?.messageId || null };
}

module.exports = { obtenerReporte, enviarReporte };
