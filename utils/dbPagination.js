/**
 * Helpers de paginación para Supabase / PostgREST.
 *
 * Motivo: un filtro `.in("col", ids)` con muchos IDs tiene DOS trampas:
 *   1. querystring gigante que puede reventar por límite de URL.
 *   2. el server corta en ~1000 filas por defecto → truncado SILENCIOSO
 *      (métricas y totales sub-reportados sin ningún error).
 *
 * `fetchByIdsChunked` parte los IDs en tandas y pagina cada tanda con .range(),
 * devolviendo TODAS las filas.
 */

const { supabase } = require("../services/supabaseClient");

const IN_CHUNK = 100; // IDs por request en filtros .in()
const PAGE = 1000; // filas por página al paginar resultados

/**
 * Trae todas las filas de `table` donde `column` está en `ids`, sin truncar.
 *
 * El orden (si se pasa) se aplica por página. Como cada valor de `column` cae
 * en una sola tanda, el orden queda consistente DENTRO de cada grupo de `column`
 * (que es lo que necesitan los agrupamientos por id_asignacion / id_sesion).
 *
 * @param {string} table
 * @param {string} select  columnas PostgREST
 * @param {string} column  columna del filtro .in()
 * @param {Array}  ids     valores a buscar
 * @param {{column:string, ascending?:boolean}|null} order
 * @returns {Promise<Array>}
 */
async function fetchByIdsChunked(table, select, column, ids, order = null) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    let from = 0;
    for (;;) {
      let q = supabase
        .from(table)
        .select(select)
        .in(column, chunk)
        .range(from, from + PAGE - 1);
      if (order) {
        q = q.order(order.column, { ascending: order.ascending !== false });
      }
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }
  return out;
}

module.exports = { fetchByIdsChunked };
