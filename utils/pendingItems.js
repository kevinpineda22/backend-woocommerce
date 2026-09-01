/**
 * ¿Qué ítems de una sesión de picking siguen sin resolver?
 * Módulo PURO. Guardado por `utils/pendingItems.test.js`.
 *
 * Es el criterio que decide si un picker puede cerrar su sesión, así que
 * tiene que contar EXACTAMENTE lo mismo que ve en la pantalla. Cuando las
 * dos cuentas divergen, el picker queda encerrado: la app le dice 29/29 y
 * el botón de finalizar le responde que faltan productos, sin decirle
 * cuáles ni dejarlo avanzar.
 *
 * ══════════════════════════════════════════════════════════════════
 * LAS DOS REGLAS
 * ══════════════════════════════════════════════════════════════════
 *
 * 1. UN ÍTEM RETIRADO POR EL ADMIN NO ESTÁ PENDIENTE. `is_removed` en el
 *    snapshot es la marca autoritativa: el admin ya lo sacó del pedido y no
 *    hay nada que recolectar. El frontend lo excluye de su conteo
 *    (`agruparItemsParaPicking` no suma los `is_removed`), así que el
 *    backend tiene que excluirlo también o las cuentas nunca cierran.
 *
 * 2. EL LOG `eliminado_admin` SE BUSCA A NIVEL DE SESIÓN, NO DE PEDIDO.
 *    `removeItemFromSession` marca el producto como retirado en TODOS los
 *    pedidos del snapshot pero deja UN ÚNICO log colgado de una asignación
 *    cualquiera. Filtrar por `id_pedido` lo pierde en el resto de los
 *    pedidos de la sesión — y en multipicking eso es justamente lo que
 *    trababa el cierre. `syncWooService` ya había tropezado con esto.
 *
 * Las demás acciones (recolectado / sustituido / no_encontrado) sí se
 * miran por pedido: el mismo producto en dos pedidos son dos trabajos
 * distintos y cada uno necesita su propio log.
 */

// Acciones que resuelven un ítem: después de cualquiera de estas, el picker
// ya no tiene nada que hacer con él.
const ACCIONES_POR_PEDIDO = ["recolectado", "sustituido", "no_encontrado"];
const ACCION_RETIRO_ADMIN = "eliminado_admin";

/**
 * @param {Object} params
 * @param {Array} params.snapshotOrders — `snapshot_pedidos` de la sesión
 * @param {Array} params.logs — filas de `wc_log_picking` de TODA la sesión
 * @returns {{pendientes: Array<{name:string, order_id:*, product_id:*, variation_id:*}>,
 *            resumen: {total:number, retirados:number, resueltos:number}}}
 */
function findPendingItems({ snapshotOrders = [], logs = [] }) {
  // Productos retirados por el admin en CUALQUIER punto de la sesión.
  // Se indexan por id de producto porque el log no distingue pedido.
  const retiradosPorAdmin = new Set();
  (logs || []).forEach((l) => {
    if (l.accion !== ACCION_RETIRO_ADMIN) return;
    if (l.id_producto !== null && l.id_producto !== undefined)
      retiradosPorAdmin.add(String(l.id_producto));
    if (l.id_producto_original !== null && l.id_producto_original !== undefined)
      retiradosPorAdmin.add(String(l.id_producto_original));
  });

  const pendientes = [];
  let total = 0;
  let retirados = 0;

  (snapshotOrders || []).forEach((order) => {
    const logsDelPedido = (logs || []).filter(
      (l) => String(l.id_pedido) === String(order.id),
    );

    (order.line_items || []).forEach((item) => {
      total++;
      const pId = String(item.product_id);
      const vId = item.variation_id ? String(item.variation_id) : null;

      // REGLA 1 y 2: si el admin lo retiró, no está pendiente.
      const fueRetirado =
        item.is_removed === true ||
        retiradosPorAdmin.has(pId) ||
        (vId && retiradosPorAdmin.has(vId));
      if (fueRetirado) {
        retirados++;
        return;
      }

      const coincide = (l) =>
        String(l.id_producto) === pId ||
        (vId && String(l.id_producto) === vId) ||
        String(l.id_producto_original) === pId ||
        (vId && String(l.id_producto_original) === vId);

      const resuelto = logsDelPedido.some(
        (l) => coincide(l) && ACCIONES_POR_PEDIDO.includes(l.accion),
      );

      if (!resuelto) {
        pendientes.push({
          name: item.name,
          order_id: order.id,
          product_id: item.product_id,
          variation_id: item.variation_id || null,
        });
      }
    });
  });

  return {
    pendientes,
    resumen: {
      total,
      retirados,
      resueltos: total - retirados - pendientes.length,
    },
  };
}

module.exports = {
  ACCIONES_POR_PEDIDO,
  ACCION_RETIRO_ADMIN,
  findPendingItems,
};
