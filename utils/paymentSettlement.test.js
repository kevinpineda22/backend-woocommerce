import { describe, it, expect } from "vitest";
import {
  CREDITO_METHOD,
  dedupeByOrder,
  settlesImmediately,
  paymentDateFor,
  findCreditoOrderIds,
  allSettled,
  summarizeSessionMethod,
  isPendingCartera,
} from "./paymentSettlement.js";

const NOW = "2026-08-13T14:00:00.000Z";

// Snapshot como lo guarda sessionController.js (id + pasarela + meta_data).
const ORDER_CREDITO = {
  id: 80504,
  payment_method: "cheque",
  payment_method_title: "Crédito",
  meta_data: [{ key: "_billing_cod_payment_mode", value: "na" }],
};
const ORDER_COD_QR = {
  id: 80503,
  payment_method: "cod",
  payment_method_title: "Contra entrega",
  meta_data: [{ key: "_billing_cod_payment_mode", value: "qr" }],
};
const ORDER_COD_CASH = {
  id: 80495,
  payment_method: "cod",
  payment_method_title: "Contra entrega",
  meta_data: [{ key: "_billing_cod_payment_mode", value: "cash" }],
};

describe("findCreditoOrderIds", () => {
  it("encuentra solo los pedidos con pasarela de crédito", () => {
    const snapshot = [ORDER_COD_QR, ORDER_CREDITO, ORDER_COD_CASH];
    expect(findCreditoOrderIds(snapshot)).toEqual([80504]);
  });

  it("devuelve vacío si ninguno es a crédito", () => {
    expect(findCreditoOrderIds([ORDER_COD_QR, ORDER_COD_CASH])).toEqual([]);
  });

  it("no explota con snapshot ausente", () => {
    expect(findCreditoOrderIds(null)).toEqual([]);
    expect(findCreditoOrderIds(undefined)).toEqual([]);
    expect(findCreditoOrderIds([])).toEqual([]);
  });
});

describe("paymentDateFor", () => {
  it("efectivo/qr/datáfono se cobran en el momento", () => {
    expect(paymentDateFor("efectivo", NOW)).toBe(NOW);
    expect(paymentDateFor("qr", NOW)).toBe(NOW);
    expect(paymentDateFor("datafono", NOW)).toBe(NOW);
  });

  // El corazón de la tanda B: el crédito nace debiendo.
  it("el crédito NO lleva fecha de cobro", () => {
    expect(paymentDateFor(CREDITO_METHOD, NOW)).toBeNull();
  });

  it("settlesImmediately es coherente", () => {
    expect(settlesImmediately("efectivo")).toBe(true);
    expect(settlesImmediately(CREDITO_METHOD)).toBe(false);
  });
});

describe("allSettled", () => {
  it("una sesión con todos los métodos definidos se puede cerrar", () => {
    expect(
      allSettled([{ metodo_pago: "efectivo" }, { metodo_pago: "qr" }]),
    ).toBe(true);
  });

  // Este es el arreglo del arrastre: un crédito sin cobrar NO bloquea el cierre.
  it("un crédito sin fecha_pago NO bloquea el cierre de la sesión", () => {
    expect(
      allSettled([
        { metodo_pago: "efectivo", fecha_pago: NOW },
        { metodo_pago: CREDITO_METHOD, fecha_pago: null },
      ]),
    ).toBe(true);
  });

  it("un pedido sin método sí bloquea el cierre", () => {
    expect(
      allSettled([{ metodo_pago: "efectivo" }, { metodo_pago: null }]),
    ).toBe(false);
  });

  it("una sesión sin asignaciones no se cierra", () => {
    expect(allSettled([])).toBe(false);
    expect(allSettled(null)).toBe(false);
  });
});

describe("summarizeSessionMethod", () => {
  it("método único cuando todos coinciden", () => {
    expect(
      summarizeSessionMethod([{ metodo_pago: "qr" }, { metodo_pago: "qr" }]),
    ).toBe("qr");
  });

  it("'mixto' cuando hay más de uno", () => {
    expect(
      summarizeSessionMethod([
        { metodo_pago: "qr" },
        { metodo_pago: CREDITO_METHOD },
      ]),
    ).toBe("mixto");
  });

  it("una sesión toda a crédito se resume como crédito", () => {
    expect(
      summarizeSessionMethod([
        { metodo_pago: CREDITO_METHOD },
        { metodo_pago: CREDITO_METHOD },
      ]),
    ).toBe(CREDITO_METHOD);
  });
});

describe("dedupeByOrder", () => {
  // 92 de 792 asignaciones completadas comparten pedido (reasignaciones,
  // traslados). Sin dedupe, cartera cobraría dos veces la misma deuda.
  it("se queda con la asignación más reciente por pedido", () => {
    const vieja = { id_pedido: 80305, id_sesion: "s1", fecha_fin: "2026-04-10T10:00:00Z" };
    const nueva = { id_pedido: 80305, id_sesion: "s2", fecha_fin: "2026-08-01T10:00:00Z" };
    const otro = { id_pedido: 80127, id_sesion: "s3", fecha_fin: "2026-08-05T10:00:00Z" };

    const out = dedupeByOrder([vieja, nueva, otro]);
    expect(out).toHaveLength(2);
    expect(out.find((a) => a.id_pedido === 80305).id_sesion).toBe("s2");
  });

  it("no le importa el orden de entrada", () => {
    const vieja = { id_pedido: 1, id_sesion: "vieja", fecha_fin: "2026-01-01T00:00:00Z" };
    const nueva = { id_pedido: 1, id_sesion: "nueva", fecha_fin: "2026-06-01T00:00:00Z" };
    expect(dedupeByOrder([nueva, vieja])[0].id_sesion).toBe("nueva");
    expect(dedupeByOrder([vieja, nueva])[0].id_sesion).toBe("nueva");
  });

  it("una asignación sin fecha_fin nunca le gana a una fechada", () => {
    const sinFecha = { id_pedido: 1, id_sesion: "sin", fecha_fin: null };
    const conFecha = { id_pedido: 1, id_sesion: "con", fecha_fin: "2026-01-01T00:00:00Z" };
    expect(dedupeByOrder([sinFecha, conFecha])[0].id_sesion).toBe("con");
    expect(dedupeByOrder([conFecha, sinFecha])[0].id_sesion).toBe("con");
  });

  it("deja pasar una lista ya única", () => {
    const lista = [{ id_pedido: 1 }, { id_pedido: 2 }, { id_pedido: 3 }];
    expect(dedupeByOrder(lista)).toHaveLength(3);
  });

  it("no explota con entradas vacías", () => {
    expect(dedupeByOrder(null)).toEqual([]);
    expect(dedupeByOrder([])).toEqual([]);
  });
});

describe("isPendingCartera", () => {
  it("un crédito sin cobrar es deuda viva", () => {
    expect(
      isPendingCartera({ metodo_pago: CREDITO_METHOD, fecha_pago: null }),
    ).toBe(true);
  });

  it("un crédito ya cobrado sale de cartera", () => {
    expect(
      isPendingCartera({ metodo_pago: CREDITO_METHOD, fecha_pago: NOW }),
    ).toBe(false);
  });

  it("el efectivo nunca entra a cartera", () => {
    expect(isPendingCartera({ metodo_pago: "efectivo", fecha_pago: NOW })).toBe(
      false,
    );
    // Ni siquiera si por algún motivo le faltara la fecha.
    expect(isPendingCartera({ metodo_pago: "efectivo", fecha_pago: null })).toBe(
      false,
    );
  });

  it("un pedido sin método todavía no es deuda, es un pendiente de cobro", () => {
    expect(isPendingCartera({ metodo_pago: null, fecha_pago: null })).toBe(
      false,
    );
  });

  it("no explota con entradas vacías", () => {
    expect(isPendingCartera(null)).toBe(false);
    expect(isPendingCartera(undefined)).toBe(false);
    expect(isPendingCartera({})).toBe(false);
  });
});
