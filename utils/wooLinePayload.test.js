import { describe, it, expect } from "vitest";
import { buildLineItemsPayload } from "./wooLinePayload";

// =====================================================================
// Acá se decide QUÉ SE LE COBRA AL CLIENTE. Cada test es plata real.
//
// Los bloques REGRESIÓN corresponden a bugs que llegaron a facturas de
// clientes. Si uno se pone rojo, el bug volvió: arreglá el código, no el test.
// =====================================================================

const CHERRY = { id: 1, product_id: 111, variation_id: 0, quantity: 2, price: "4500", name: "Tomate Cherry", sku: "185325UND" };
const CHONTO = { id: 2, product_id: 222, variation_id: 0, quantity: 1, price: "3000", name: "Tomate Chonto", sku: "185326UND" };

const pedido = (items) => ({ line_items: items });
const find = (payload, lineId) => payload.find((l) => l.id === lineId);
const nuevos = (payload) => payload.filter((l) => l.product_id !== undefined);

describe("caso normal — todo recolectado", () => {
  it("no manda cambios cuando se recolectó exactamente lo pedido", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY, CHONTO]),
      logs: [
        { accion: "recolectado", id_producto: 111 },
        { accion: "recolectado", id_producto: 111 },
        { accion: "recolectado", id_producto: 222 },
      ],
    });
    expect(lineItems).toEqual([]);
    // Payload vacío = el pedido de Woo queda intacto. Correcto.
  });
});

describe("ítem no encontrado — la línea se queda, el cobro baja", () => {
  it("cobra solo lo entregado y deja el meta NO ENTREGADO", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [
        { accion: "recolectado", id_producto: 111 },
        { accion: "no_encontrado", id_producto: 111 },
      ],
    });
    const linea = find(lineItems, 1);
    expect(linea.quantity).toBe(2); // la línea NO se borra: el cliente ve qué pidió
    expect(linea.total).toBe("4500.00"); // se cobra 1 de 2
    expect(linea.meta_data[0]).toEqual({
      key: "NO ENTREGADO",
      value: "1 de 2 sin existencias",
    });
  });

  it("sin ninguna unidad recolectada el cobro queda en $0", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [
        { accion: "no_encontrado", id_producto: 111 },
        { accion: "no_encontrado", id_producto: 111 },
      ],
    });
    expect(find(lineItems, 1).total).toBe("0.00");
  });
});

describe("pesables — la convención de unidad decide el factor", () => {
  const YUCA_KL = { id: 1, product_id: 111, variation_id: 0, quantity: 1, price: "3000", name: "Yuca", sku: "15150KL" };
  const CARNE_LB = { id: 1, product_id: 111, variation_id: 0, quantity: 1, price: "9000", name: "Carne", sku: "15151LB" };

  it("KL cobra price × peso", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([YUCA_KL]),
      logs: [{ accion: "recolectado", id_producto: 111, peso_real: 1.5 }],
    });
    expect(find(lineItems, 1).total).toBe("4500.00"); // 3000 × 1.5
  });

  it("LB cobra price × 2 × peso — el bug que cobró la mitad", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CARNE_LB]),
      logs: [{ accion: "recolectado", id_producto: 111, peso_real: 0.5 }],
    });
    expect(find(lineItems, 1).total).toBe("9000.00"); // 9000 × 2 × 0.5
  });

  it("un pesable con faltantes factura solo el peso y deja constancia", () => {
    const CARNE_2 = { ...CARNE_LB, quantity: 2 };
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CARNE_2]),
      logs: [
        { accion: "recolectado", id_producto: 111, peso_real: 0.5 },
        { accion: "no_encontrado", id_producto: 111 },
      ],
    });
    const linea = find(lineItems, 1);
    expect(linea.total).toBe("9000.00");
    expect(linea.meta_data[0].key).toBe("NO ENTREGADO");
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — sustituto duplicado en la factura
// ---------------------------------------------------------------------
describe("REGRESIÓN — un sustituto que YA está en el pedido no se duplica", () => {
  it("se SUMA a la línea existente en vez de crear una segunda", () => {
    const { lineItems, resumen } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY, CHONTO]),
      logs: [
        // Falta 1 Cherry, se reemplaza por Chonto (que ya está en el pedido)
        { accion: "sustituido", id_producto: 111, id_producto_final: 222, precio_nuevo: 3000 },
        { accion: "recolectado", id_producto: 111 },
        { accion: "recolectado", id_producto: 222 },
      ],
    });

    // No hay línea NUEVA para el producto 222
    expect(nuevos(lineItems).find((l) => l.product_id === 222)).toBeUndefined();
    // La línea existente de Chonto sube de 1 a 2
    expect(find(lineItems, 2).quantity).toBe(2);
    expect(resumen.sustitutos_fusionados).toBe(1);
    expect(resumen.sustitutos_nuevos).toBe(0);
  });

  it("la línea original pierde la unidad sustituida", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY, CHONTO]),
      logs: [
        { accion: "sustituido", id_producto: 111, id_producto_final: 222, precio_nuevo: 3000 },
        { accion: "recolectado", id_producto: 111 },
      ],
    });
    expect(find(lineItems, 1).quantity).toBe(1); // pedía 2, se sustituyó 1
  });

  it("dos sustituciones hacia el mismo producto existente suman las dos", () => {
    const CHERRY_3 = { ...CHERRY, quantity: 3 };
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY_3, CHONTO]),
      logs: [
        { accion: "sustituido", id_producto: 111, id_producto_final: 222, precio_nuevo: 3000 },
        { accion: "sustituido", id_producto: 111, id_producto_final: 222, precio_nuevo: 3000 },
      ],
    });
    expect(find(lineItems, 2).quantity).toBe(3); // 1 original + 2 sustituidas
  });

  it("la fusión no deja un total viejo calculado para la cantidad anterior", () => {
    const CHONTO_NF = { ...CHONTO, quantity: 2 };
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY, CHONTO_NF]),
      logs: [
        // Chonto tuvo un faltante (genera total) y ADEMÁS recibe un sustituto
        { accion: "recolectado", id_producto: 222 },
        { accion: "no_encontrado", id_producto: 222 },
        { accion: "sustituido", id_producto: 111, id_producto_final: 222, precio_nuevo: 3000 },
      ],
    });
    const linea = find(lineItems, 2);
    expect(linea.total).toBeUndefined(); // se borró para que Woo recotice
    expect(linea.subtotal).toBeUndefined();
  });
});

describe("REGRESIÓN — el precio prometido del sustituto llega a Woo", () => {
  it("un sustituto NUEVO viaja con su total, no a precio de catálogo", () => {
    const { lineItems, resumen } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [
        { accion: "sustituido", id_producto: 111, id_producto_final: 999, precio_nuevo: 2500 },
        { accion: "sustituido", id_producto: 111, id_producto_final: 999, precio_nuevo: 2500 },
      ],
    });
    const nuevo = nuevos(lineItems).find((l) => l.product_id === 999);
    expect(nuevo.quantity).toBe(2);
    expect(nuevo.total).toBe("5000.00"); // 2500 × 2
    expect(resumen.sustitutos_nuevos).toBe(1);
  });

  it("sin precio registrado se deja que Woo cotice (no se inventa un total)", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [{ accion: "sustituido", id_producto: 111, id_producto_final: 999, precio_nuevo: 0 }],
    });
    const nuevo = nuevos(lineItems).find((l) => l.product_id === 999);
    expect(nuevo.total).toBeUndefined();
  });

  it("sustitución TOTAL borra la línea original", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHONTO]), // qty 1
      logs: [{ accion: "sustituido", id_producto: 222, id_producto_final: 999, precio_nuevo: 2500 }],
    });
    expect(find(lineItems, 2).quantity).toBe(0);
  });
});

describe("retiro del admin", () => {
  it("la línea sale del pedido", () => {
    const { lineItems, resumen } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY, CHONTO]),
      logs: [{ accion: "recolectado", id_producto: 222 }],
      adminRemovals: [{ id_producto: 111 }],
    });
    expect(find(lineItems, 1).quantity).toBe(0);
    expect(resumen.eliminados).toBe(1);
  });
});

describe("variaciones — los logs traen variation_id, Woo indexa por línea", () => {
  const VARIABLE = { id: 7, product_id: 111, variation_id: 333, quantity: 2, price: "5000", name: "Gaseosa", sku: "1039P2" };

  it("un log con variation_id encuentra su línea", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([VARIABLE]),
      logs: [{ accion: "no_encontrado", id_producto: 333 }, { accion: "recolectado", id_producto: 333 }],
    });
    expect(find(lineItems, 7).total).toBe("5000.00");
  });

  it("un log con el product_id PADRE también la encuentra", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([VARIABLE]),
      logs: [{ accion: "no_encontrado", id_producto: 111 }, { accion: "recolectado", id_producto: 111 }],
    });
    expect(find(lineItems, 7).total).toBe("5000.00");
  });
});

describe("robustez — entradas degeneradas no revientan el cierre de auditoría", () => {
  it("pedido sin líneas devuelve payload vacío", () => {
    expect(buildLineItemsPayload({ wooOrder: {}, logs: [] }).lineItems).toEqual([]);
  });

  it("logs de un producto que no está en el pedido se ignoran", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [{ accion: "recolectado", id_producto: 88888 }],
    });
    expect(lineItems).toEqual([]);
  });

  it("acciones desconocidas no alteran nada", () => {
    const { lineItems } = buildLineItemsPayload({
      wooOrder: pedido([CHERRY]),
      logs: [{ accion: "auditoria_finalizada", id_producto: 0 }],
    });
    expect(lineItems).toEqual([]);
  });
});
