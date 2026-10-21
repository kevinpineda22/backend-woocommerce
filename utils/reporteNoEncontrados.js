/**
 * reporteNoEncontrados.js — Lógica pura del reporte diario a inventarios.
 *
 * Cada noche se le manda a inventarios lo que el picker no encontró en la sala
 * (y lo que tuvo que sustituir) para que revisen y ajusten el inventario: si el
 * sistema decía que había y en la góndola no estaba, hay un descuadre.
 *
 * Sin I/O acá: el service trae las filas y este módulo solo agrupa y arma el
 * HTML, para poder testearlo sin Supabase.
 *
 * Tres cosas que este agrupado tiene que respetar:
 *   1. `wc_log_picking` guarda UNA FILA POR UNIDAD (`Array(qty).fill(...)` en
 *      actionController). 6 filas iguales = 6 unidades, no 6 reportes.
 *   2. "El día" es el día en Colombia (UTC-5), no el de Vercel (UTC).
 *   3. Un "no encontrado" revertido por el picker ya no está en la tabla: el
 *      reporte refleja el estado al momento de correr, por eso corre de noche.
 */

const OFFSET_COLOMBIA = "-05:00"; // Colombia no tiene horario de verano

/** Fecha YYYY-MM-DD en Colombia para un instante dado. */
function fechaColombia(instante = new Date()) {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** ¿Es un YYYY-MM-DD que existe en el calendario? */
function esFechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/**
 * Rango [desde, hasta) en ISO UTC que cubre el día completo en Colombia.
 * 2026-10-21 → 2026-10-21T05:00:00.000Z … 2026-10-22T05:00:00.000Z
 */
function rangoDiaColombia(fecha) {
  if (!esFechaValida(fecha)) throw new Error(`Fecha inválida: ${fecha}`);
  const desde = new Date(`${fecha}T00:00:00${OFFSET_COLOMBIA}`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

/**
 * Busca la línea del pedido en el snapshot de la asignación. El log guarda en
 * `id_producto_original` el product_id o el variation_id de la línea.
 */
function buscarLinea(snapshot, idProducto) {
  const items = snapshot?.line_items || [];
  const id = String(idProducto);
  return (
    items.find((i) => i.variation_id && String(i.variation_id) === id) ||
    items.find((i) => String(i.product_id) === id) ||
    null
  );
}

const contar = (mapa, clave) => mapa.set(clave, (mapa.get(clave) || 0) + 1);

const ordenarConteo = (mapa) =>
  Array.from(mapa, ([nombre, veces]) => ({ nombre, veces })).sort(
    (a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre),
  );

/**
 * Agrupa los logs del día por sede y producto.
 *
 * @param {object}   p
 * @param {Array}    p.logs         filas de wc_log_picking (no_encontrado | sustituido)
 * @param {Array}    p.asignaciones { id, nombre_picker, reporte_snapshot }
 * @param {Array}    p.sedes        { id, nombre }
 * @param {string}   p.fecha        YYYY-MM-DD (Colombia)
 */
function armarReporte({ logs = [], asignaciones = [], sedes = [], fecha }) {
  const asigPorId = new Map(asignaciones.map((a) => [String(a.id), a]));
  const sedePorId = new Map(sedes.map((s) => [String(s.id), s.nombre]));
  const porSede = new Map();

  for (const log of logs) {
    if (log.accion !== "no_encontrado" && log.accion !== "sustituido") continue;

    const sedeNombre =
      sedePorId.get(String(log.sede_id)) || (log.sede_id ? `Sede ${log.sede_id}` : "Sin sede");
    if (!porSede.has(sedeNombre)) {
      porSede.set(sedeNombre, { sede: sedeNombre, no_encontrados: new Map(), sustituidos: new Map() });
    }
    const grupo = porSede.get(sedeNombre);
    const destino = log.accion === "no_encontrado" ? grupo.no_encontrados : grupo.sustituidos;

    const asig = asigPorId.get(String(log.id_asignacion));
    const linea = buscarLinea(asig?.reporte_snapshot, log.id_producto_original);
    const clave = String(log.id_producto_original);

    if (!destino.has(clave)) {
      destino.set(clave, {
        id_producto: log.id_producto_original,
        nombre: log.nombre_producto || linea?.name || "Sin nombre",
        sku: linea?.sku || null,
        pasillo: log.pasillo || "General",
        unidades: 0,
        pedidos: new Set(),
        pickers: new Set(),
        motivos: new Map(),
        sustitutos: new Map(),
      });
    }
    const p = destino.get(clave);
    p.unidades += 1; // una fila = una unidad
    if (log.id_pedido) p.pedidos.add(String(log.id_pedido));
    if (asig?.nombre_picker) p.pickers.add(asig.nombre_picker);
    if (!p.sku && linea?.sku) p.sku = linea.sku;
    if (log.accion === "no_encontrado") contar(p.motivos, log.motivo || "Sin motivo");
    else contar(p.sustitutos, log.nombre_sustituto || "Sin nombre");
  }

  const cerrar = (mapa) =>
    Array.from(mapa.values())
      .map((p) => ({
        ...p,
        pedidos: Array.from(p.pedidos).sort(),
        pickers: Array.from(p.pickers).sort(),
        motivos: ordenarConteo(p.motivos),
        sustitutos: ordenarConteo(p.sustitutos),
      }))
      .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre));

  const sedesReporte = Array.from(porSede.values())
    .map((g) => ({
      sede: g.sede,
      no_encontrados: cerrar(g.no_encontrados),
      sustituidos: cerrar(g.sustituidos),
    }))
    .sort((a, b) => a.sede.localeCompare(b.sede));

  const suma = (lista) => lista.reduce((s, p) => s + p.unidades, 0);
  const totales = {
    productos_no_encontrados: sedesReporte.reduce((s, g) => s + g.no_encontrados.length, 0),
    unidades_no_encontradas: sedesReporte.reduce((s, g) => s + suma(g.no_encontrados), 0),
    productos_sustituidos: sedesReporte.reduce((s, g) => s + g.sustituidos.length, 0),
    unidades_sustituidas: sedesReporte.reduce((s, g) => s + suma(g.sustituidos), 0),
  };

  return { fecha, sedes: sedesReporte, totales, sin_novedades: sedesReporte.length === 0 };
}

// =============================================================================
// HTML del correo — tablas con estilos en línea (Outlook ignora <style>).
// =============================================================================

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const TH = 'style="text-align:left;padding:6px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:12px"';
const TD = 'style="padding:6px 8px;border:1px solid #e5e7eb;font-size:13px;vertical-align:top"';
const TD_NUM = 'style="padding:6px 8px;border:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:bold;vertical-align:top"';

const listaConteo = (items) =>
  items.map((i) => (i.veces > 1 ? `${esc(i.nombre)} (${i.veces})` : esc(i.nombre))).join("<br>");

function fechaLarga(fecha) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T00:00:00Z`));
}

function tablaNoEncontrados(productos) {
  if (!productos.length) return '<p style="font-size:13px;color:#6b7280">Sin productos no encontrados.</p>';
  const filas = productos
    .map(
      (p) => `<tr>
<td ${TD}>${esc(p.sku || "—")}</td>
<td ${TD}>${esc(p.nombre)}</td>
<td ${TD}>${esc(p.pasillo)}</td>
<td ${TD_NUM}>${p.unidades}</td>
<td ${TD}>${listaConteo(p.motivos)}</td>
<td ${TD}>${p.pedidos.map((id) => `#${esc(id)}`).join(", ")}</td>
<td ${TD}>${p.pickers.map(esc).join(", ")}</td>
</tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;margin-bottom:16px">
<tr><th ${TH}>Código</th><th ${TH}>Producto</th><th ${TH}>Pasillo</th><th ${TH}>Unidades</th><th ${TH}>Motivo</th><th ${TH}>Pedidos</th><th ${TH}>Picker</th></tr>
${filas}</table>`;
}

function tablaSustituidos(productos) {
  if (!productos.length) return "";
  const filas = productos
    .map(
      (p) => `<tr>
<td ${TD}>${esc(p.sku || "—")}</td>
<td ${TD}>${esc(p.nombre)}</td>
<td ${TD}>${esc(p.pasillo)}</td>
<td ${TD_NUM}>${p.unidades}</td>
<td ${TD}>${listaConteo(p.sustitutos)}</td>
<td ${TD}>${p.pedidos.map((id) => `#${esc(id)}`).join(", ")}</td>
</tr>`,
    )
    .join("");
  return `<p style="font-size:13px;margin:12px 0 6px"><strong>Sustituidos</strong> — el producto pedido no estaba y se entregó otro en su lugar:</p>
<table style="border-collapse:collapse;width:100%;margin-bottom:16px">
<tr><th ${TH}>Código</th><th ${TH}>Producto pedido</th><th ${TH}>Pasillo</th><th ${TH}>Unidades</th><th ${TH}>Se entregó</th><th ${TH}>Pedidos</th></tr>
${filas}</table>`;
}

function renderAsunto(reporte) {
  const { totales } = reporte;
  if (reporte.sin_novedades) return `Picking ecommerce ${reporte.fecha}: sin productos no encontrados`;
  const n = totales.productos_no_encontrados;
  if (n === 0) return `Picking ecommerce ${reporte.fecha}: ${totales.productos_sustituidos} sustituidos para revisar`;
  return `Picking ecommerce ${reporte.fecha}: ${n} ${n === 1 ? "producto no encontrado" : "productos no encontrados"} para revisar`;
}

function renderHtml(reporte) {
  const { totales } = reporte;
  const encabezado = `<h2 style="margin:0 0 4px;font-size:18px">Productos no encontrados en el picking</h2>
<p style="margin:0 0 16px;font-size:13px;color:#4b5563">${esc(fechaLarga(reporte.fecha))} · pedidos del ecommerce</p>`;

  if (reporte.sin_novedades) {
    return `<div style="font-family:Arial,sans-serif;color:#111827">${encabezado}
<p style="font-size:14px">Hoy ningún picker reportó productos no encontrados ni sustituidos.</p></div>`;
  }

  const resumen = `<p style="font-size:14px;margin:0 0 16px">
<strong>${totales.productos_no_encontrados}</strong> productos no encontrados (${totales.unidades_no_encontradas} unidades) y
<strong>${totales.productos_sustituidos}</strong> sustituidos (${totales.unidades_sustituidas} unidades).
Se vendieron en la tienda en línea pero el picker no los encontró: revise la existencia física y, si corresponde, haga el ajuste de inventario.</p>`;

  const secciones = reporte.sedes
    .map(
      (g) => `<h3 style="font-size:15px;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #b45309">${esc(g.sede)}</h3>
${tablaNoEncontrados(g.no_encontrados)}
${tablaSustituidos(g.sustituidos)}`,
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;color:#111827">${encabezado}${resumen}${secciones}
<p style="font-size:11px;color:#6b7280;margin-top:24px">Correo automático del sistema de picking. Un producto que el picker marcó y después corrigió no aparece aquí.</p></div>`;
}

module.exports = {
  fechaColombia,
  esFechaValida,
  rangoDiaColombia,
  buscarLinea,
  armarReporte,
  renderAsunto,
  renderHtml,
};
