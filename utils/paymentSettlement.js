// Reglas de liquidación de pagos, sin I/O — el controlador pone la base de datos.
//
// El sistema responde DOS preguntas distintas que antes compartían un solo campo
// y por eso se trababan entre sí:
//
//   1. ¿Cómo se resuelve el cobro?  → `wc_asignaciones_pedidos.metodo_pago`
//      Se define en la entrega. Es lo que cierra la sesión operativa.
//   2. ¿Ya entró la plata?           → `wc_asignaciones_pedidos.fecha_pago`
//      Para efectivo/QR/datáfono es el mismo instante. Para crédito puede ser
//      30 días después, y lo marca cartera.
//
// Un pedido a crédito queda entonces con `metodo_pago='credito'` y
// `fecha_pago=NULL`: la sesión cierra y entra a los reportes, pero la deuda
// sigue visible y cobrable. Sin esto, un solo pedido a crédito dejaba a TODA su
// sesión fuera del recaudo, arrastrando a los pedidos que sí se cobraron.

const { isCreditoOrder } = require("./paymentMethods");

// Valor de `metodo_pago` para un pedido a crédito.
const CREDITO_METHOD = "credito";

// Quién figura como responsable cuando la resolución la hace el sistema.
const SYSTEM_ACTOR = "Sistema (pasarela Crédito)";

// Métodos que se cobran en el momento de la entrega: al registrarlos, la plata
// ya entró, así que llevan `fecha_pago`.
function settlesImmediately(metodoPago) {
  return metodoPago !== CREDITO_METHOD;
}

// Fecha de cobro que corresponde a un método recién registrado.
// El crédito nace debiendo: se cobra después, desde cartera.
function paymentDateFor(metodoPago, now) {
  return settlesImmediately(metodoPago) ? now : null;
}

// IDs de los pedidos del snapshot que llegaron con la pasarela Crédito.
function findCreditoOrderIds(snapshotOrders) {
  if (!Array.isArray(snapshotOrders)) return [];
  return snapshotOrders.filter((o) => isCreditoOrder(o)).map((o) => o.id);
}

// La sesión se puede cerrar cuando TODOS sus pedidos tienen método definido.
// Ojo: mira `metodo_pago`, no `fecha_pago` — un crédito sin cobrar ya está
// resuelto a efectos operativos.
function allSettled(asignaciones) {
  return (
    Array.isArray(asignaciones) &&
    asignaciones.length > 0 &&
    asignaciones.every((a) => a.metodo_pago !== null && a.metodo_pago !== undefined)
  );
}

// Resumen que se guarda en `wc_picking_sessions.metodo_pago`: el método único
// si todos coinciden, o "mixto".
function summarizeSessionMethod(asignaciones) {
  const metodos = [...new Set((asignaciones || []).map((a) => a.metodo_pago))];
  return metodos.length === 1 ? metodos[0] : "mixto";
}

module.exports = {
  CREDITO_METHOD,
  SYSTEM_ACTOR,
  settlesImmediately,
  paymentDateFor,
  findCreditoOrderIds,
  allSettled,
  summarizeSessionMethod,
};
