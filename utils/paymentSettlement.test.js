import { describe, it, expect } from "vitest";
import {
  CREDITO_METHOD,
  settlesImmediately,
  paymentDateFor,
  findCreditoOrderIds,
  allSettled,
  summarizeSessionMethod,
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
