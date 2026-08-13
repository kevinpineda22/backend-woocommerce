import { describe, it, expect } from "vitest";
import {
  CREDITO_GATEWAY as backendCreditoGateway,
  GATEWAY_LABELS as backendGateways,
  COD_MODE_LABELS as backendCodModes,
  COD_MODE_EMPTY as backendCodEmpty,
  getCodPaymentMode as backendGetCodMode,
  isCreditoOrder as backendIsCredito,
  resolvePaymentLabel as backendResolve,
} from "./paymentMethods.js";
import {
  CREDITO_GATEWAY as frontendCreditoGateway,
  GATEWAY_LABELS as frontendGateways,
  COD_MODE_LABELS as frontendCodModes,
  COD_MODE_EMPTY as frontendCodEmpty,
  getCodPaymentMode as frontendGetCodMode,
  isCreditoOrder as frontendIsCredito,
  resolvePaymentLabel as frontendResolve,
} from "../ecommerce/shared/paymentMethods.js";

// Pedidos reales capturados de WooCommerce el 2026-08-13 vía
// GET /api/orders/espiar-pedido/:id — la referencia de qué manda Woo de verdad.
const ORDER_CREDITO = {
  id: 80504,
  payment_method: "cheque",
  payment_method_title: "Crédito",
  meta_data: [
    { key: "_billing_cod_payment_mode", value: "na" },
    { key: "_billing_document", value: "890905980" },
    { key: "_billing_person_type", value: "juridica" },
  ],
};

const ORDER_COD_QR = {
  id: 80503,
  payment_method: "cod",
  payment_method_title: "Contra entrega",
  meta_data: [{ key: "_billing_cod_payment_mode", value: "qr" }],
};

const ORDER_COD_CARD = {
  id: 80502,
  payment_method: "cod",
  payment_method_title: "Contra entrega",
  meta_data: [{ key: "_billing_cod_payment_mode", value: "card" }],
};

const ORDER_COD_SIN_MODO = {
  id: 80498,
  payment_method: "cod",
  payment_method_title: "Contra entrega",
  meta_data: [],
};

// Red flag: si este bloque se rompe es porque alguien tocó UNA de las dos
// copias. El backend decide qué se guarda y el frontend qué ve el domiciliario
// en el manifiesto; si divergen, se cobra mal un pedido.
describe("paymentMethods — backend/frontend sync", () => {
  it("comparten el mismo slug de pasarela de crédito", () => {
    expect(backendCreditoGateway).toBe(frontendCreditoGateway);
  });

  it("comparten el mismo mapa de pasarelas", () => {
    expect(backendGateways).toEqual(frontendGateways);
  });

  it("comparten el mismo mapa de sub-modos", () => {
    expect(backendCodModes).toEqual(frontendCodModes);
  });

  it("comparten la misma lista de valores vacíos", () => {
    expect([...backendCodEmpty].sort()).toEqual([...frontendCodEmpty].sort());
  });

  it("resuelven idéntico sobre los pedidos reales", () => {
    for (const order of [
      ORDER_CREDITO,
      ORDER_COD_QR,
      ORDER_COD_CARD,
      ORDER_COD_SIN_MODO,
    ]) {
      expect(backendResolve(order)).toBe(frontendResolve(order));
      expect(backendIsCredito(order)).toBe(frontendIsCredito(order));
      expect(backendGetCodMode(order)).toBe(frontendGetCodMode(order));
    }
  });
});

describe("resolvePaymentLabel", () => {
  // El bug original: se leía _billing_cod_payment_mode primero, y como `na` no
  // estaba en el mapa se devolvía el string crudo "na" al manifiesto.
  it("un pedido a crédito dice 'Cliente Crédito', nunca 'na'", () => {
    expect(backendResolve(ORDER_CREDITO)).toBe("Cliente Crédito");
  });

  // La etiqueta NO puede ser "Crédito" a secas: un cajero lo lee como "tarjeta
  // de crédito" y sale a cobrar un pedido que ya está facturado a crédito.
  it("la etiqueta desambigua de 'tarjeta de crédito'", () => {
    const label = backendResolve(ORDER_CREDITO);
    expect(label).toContain("Cliente");
    expect(label).not.toBe("Crédito");
  });

  it("la pasarela gana sobre el sub-modo", () => {
    // Aunque Woo mandara basura en el sub-modo, la pasarela manda.
    const order = {
      ...ORDER_CREDITO,
      meta_data: [{ key: "_billing_cod_payment_mode", value: "cash" }],
    };
    expect(backendResolve(order)).toBe("Cliente Crédito");
  });

  it("traduce los sub-modos de contra-entrega", () => {
    expect(backendResolve(ORDER_COD_QR)).toBe("QR");
    expect(backendResolve(ORDER_COD_CARD)).toBe("Tarjeta");
  });

  it("cae al título de Woo cuando no hay sub-modo", () => {
    expect(backendResolve(ORDER_COD_SIN_MODO)).toBe("Contra entrega");
  });

  it("muestra crudo un sub-modo desconocido en vez de perder el detalle", () => {
    const order = {
      payment_method: "cod",
      payment_method_title: "Contra entrega",
      meta_data: [{ key: "_billing_cod_payment_mode", value: "nequi" }],
    };
    expect(backendResolve(order)).toBe("nequi");
  });

  it("traduce los títulos legacy sin traducir de Woo", () => {
    expect(backendResolve({ payment_method_title: "card" })).toBe("Tarjeta");
    expect(backendResolve({ payment_method_title: "cash" })).toBe("Efectivo");
  });

  it("acepta un array de meta suelto (sin datos de pasarela)", () => {
    expect(backendResolve([{ key: "_billing_cod_payment_mode", value: "qr" }])).toBe("QR");
    expect(backendResolve([{ key: "_billing_cod_payment_mode", value: "na" }])).toBe("");
  });

  it("no explota con entradas vacías", () => {
    expect(backendResolve(null)).toBe("");
    expect(backendResolve(undefined)).toBe("");
    expect(backendResolve({})).toBe("");
    expect(backendResolve([])).toBe("");
  });
});

describe("getCodPaymentMode", () => {
  it("trata 'na' como ausencia de dato", () => {
    expect(backendGetCodMode(ORDER_CREDITO)).toBeNull();
  });

  it("normaliza mayúsculas y espacios", () => {
    const order = {
      meta_data: [{ key: "_billing_cod_payment_mode", value: "  QR  " }],
    };
    expect(backendGetCodMode(order)).toBe("qr");
  });

  it("devuelve el sub-modo real de un contra-entrega", () => {
    expect(backendGetCodMode(ORDER_COD_QR)).toBe("qr");
  });
});

describe("isCreditoOrder", () => {
  it("detecta el crédito por pasarela, no por título", () => {
    expect(backendIsCredito(ORDER_CREDITO)).toBe(true);
    expect(backendIsCredito(ORDER_COD_QR)).toBe(false);
  });

  it("sigue detectando si renombran el título en el admin de Woo", () => {
    const renombrado = { ...ORDER_CREDITO, payment_method_title: "Cupo empresa" };
    expect(backendIsCredito(renombrado)).toBe(true);
  });

  it("no confunde el sub-modo 'credito' con la pasarela de crédito", () => {
    const order = {
      payment_method: "cod",
      payment_method_title: "Contra entrega",
      meta_data: [{ key: "_billing_cod_payment_mode", value: "credito" }],
    };
    expect(backendIsCredito(order)).toBe(false);
  });

  it("no explota con entradas vacías", () => {
    expect(backendIsCredito(null)).toBe(false);
    expect(backendIsCredito([])).toBe(false);
  });
});
