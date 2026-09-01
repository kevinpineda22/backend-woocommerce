import { describe, it, expect } from "vitest";
import { findPendingItems } from "./pendingItems";

// =====================================================================
// Guarda del criterio que deja (o no) cerrar una sesión de picking.
//
// Si este conteo no coincide con el de la pantalla, el picker queda
// encerrado: la app le dice 29/29 y el botón le responde que faltan
// productos. El caso testigo es la sesión real 4a0bc0b3.
// =====================================================================

const item = (id, name, extra = {}) => ({
  product_id: id,
  variation_id: null,
  name,
  ...extra,
});

const log = (accion, id_producto, id_pedido) => ({
  accion,
  id_producto,
  id_producto_original: id_producto,
  id_pedido,
});

describe("caso base", () => {
  const snapshotOrders = [
    { id: 900, line_items: [item(1, "Yuca"), item(2, "Arroz")] },
  ];

  it("todo recolectado deja cerrar", () => {
    const { pendientes, resumen } = findPendingItems({
      snapshotOrders,
      logs: [log("recolectado", 1, 900), log("recolectado", 2, 900)],
    });
    expect(pendientes).toEqual([]);
    expect(resumen).toEqual({ total: 2, retirados: 0, resueltos: 2 });
  });

  it("un ítem sin tocar bloquea, y se dice cuál", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("recolectado", 1, 900)],
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].name).toBe("Arroz");
  });

  it("no_encontrado y sustituido también resuelven", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("no_encontrado", 1, 900), log("sustituido", 2, 900)],
    });
    expect(pendientes).toEqual([]);
  });

  it("una acción que no resuelve nada no cuenta", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("reset", 1, 900), log("recolectado", 2, 900)],
    });
    expect(pendientes.map((p) => p.name)).toEqual(["Yuca"]);
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — 29/29 y no deja finalizar
// ---------------------------------------------------------------------
describe("REGRESIÓN — el ítem retirado por el admin NO está pendiente", () => {
  // Sesión real 4a0bc0b3: multipicking de 2 pedidos, 32 ítems, 3 retirados
  // por el admin. El picker veía 29 tarjetas, completaba 29/29, y el cierre
  // le respondía "aún tienes productos pendientes" — los 3 retirados.
  //
  // `removeItemFromSession` marca is_removed en TODOS los pedidos del
  // snapshot pero deja el log eliminado_admin colgado de UN solo pedido.
  const snapshotOrders = [
    {
      id: 81015,
      line_items: [item(1, "Chuzo de Contramuslo", { is_removed: true }), item(2, "Yuca")],
    },
    {
      id: 81016,
      line_items: [item(1, "Chuzo de Contramuslo", { is_removed: true }), item(3, "Arroz")],
    },
  ];
  // El log del retiro quedó SOLO en el pedido 81015.
  const logs = [
    log("eliminado_admin", 1, 81015),
    log("recolectado", 2, 81015),
    log("recolectado", 3, 81016),
  ];

  it("la sesión se puede cerrar", () => {
    const { pendientes } = findPendingItems({ snapshotOrders, logs });
    expect(pendientes).toEqual([]);
  });

  it("los retirados se cuentan aparte, no como resueltos", () => {
    const { resumen } = findPendingItems({ snapshotOrders, logs });
    expect(resumen).toEqual({ total: 4, retirados: 2, resueltos: 2 });
    // 4 ítems en el snapshot, el picker solo vio 2 tarjetas.
  });

  it("basta el log de retiro aunque el snapshot no traiga is_removed", () => {
    // Snapshot viejo, sin la marca: el log a nivel de SESIÓN alcanza.
    const sinMarca = [
      { id: 81015, line_items: [item(1, "Chuzo"), item(2, "Yuca")] },
      { id: 81016, line_items: [item(1, "Chuzo"), item(3, "Arroz")] },
    ];
    const { pendientes } = findPendingItems({ snapshotOrders: sinMarca, logs });
    expect(pendientes).toEqual([]);
    // Antes se filtraba el log por id_pedido: el 81016 no lo veía y quedaba
    // un pendiente fantasma que nadie podía resolver desde la app.
  });

  it("basta is_removed aunque el log de retiro no exista", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("recolectado", 2, 81015), log("recolectado", 3, 81016)],
    });
    expect(pendientes).toEqual([]);
  });

  it("el retiro reconocido por variation_id también cuenta", () => {
    const conVar = [
      {
        id: 900,
        line_items: [{ product_id: 10, variation_id: 55, name: "Gaseosa Dúo" }],
      },
    ];
    const { pendientes } = findPendingItems({
      snapshotOrders: conVar,
      logs: [log("eliminado_admin", 55, 999)], // otro pedido, y por variación
    });
    expect(pendientes).toEqual([]);
  });
});

describe("multipicking — cada pedido necesita su propio trabajo", () => {
  // El mismo producto en dos pedidos son DOS trabajos: recolectar uno no
  // resuelve el otro. Solo el retiro del admin es de alcance sesión.
  const snapshotOrders = [
    { id: 900, line_items: [item(1, "Yuca")] },
    { id: 901, line_items: [item(1, "Yuca")] },
  ];

  it("recolectar en un pedido NO resuelve el otro", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("recolectado", 1, 900)],
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].order_id).toBe(901);
  });

  it("con un log por pedido, cierra", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders,
      logs: [log("recolectado", 1, 900), log("recolectado", 1, 901)],
    });
    expect(pendientes).toEqual([]);
  });
});

describe("variaciones — el log puede traer el id del padre o el de la variación", () => {
  const snapshotOrders = [
    { id: 900, line_items: [{ product_id: 10, variation_id: 55, name: "Gaseosa Dúo" }] },
  ];

  it("log por variation_id resuelve", () => {
    expect(
      findPendingItems({ snapshotOrders, logs: [log("recolectado", 55, 900)] }).pendientes,
    ).toEqual([]);
  });

  it("log por product_id padre también resuelve", () => {
    expect(
      findPendingItems({ snapshotOrders, logs: [log("recolectado", 10, 900)] }).pendientes,
    ).toEqual([]);
  });
});

describe("robustez — nada de esto debe encerrar a un picker", () => {
  it("sesión sin snapshot no bloquea", () => {
    expect(findPendingItems({ snapshotOrders: [], logs: [] }).pendientes).toEqual([]);
    expect(findPendingItems({}).pendientes).toEqual([]);
  });

  it("un pedido sin line_items no bloquea", () => {
    expect(findPendingItems({ snapshotOrders: [{ id: 900 }], logs: [] }).pendientes).toEqual([]);
  });

  it("ids numéricos y string se comparan igual", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders: [{ id: "900", line_items: [item(1, "Yuca")] }],
      logs: [{ accion: "recolectado", id_producto: "1", id_pedido: 900 }],
    });
    expect(pendientes).toEqual([]);
  });

  it("un log con id_pedido null no resuelve por pedido, pero tampoco rompe", () => {
    const { pendientes } = findPendingItems({
      snapshotOrders: [{ id: 900, line_items: [item(1, "Yuca")] }],
      logs: [{ accion: "recolectado", id_producto: 1, id_pedido: null }],
    });
    expect(pendientes).toHaveLength(1);
  });
});
