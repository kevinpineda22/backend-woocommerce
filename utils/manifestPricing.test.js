import { describe, it, expect } from "vitest";
import {
  calcLineCharge as backendCalc,
  classifyWeighable as backendClassify,
} from "./manifestPricing.js";
import {
  calcLineCharge as frontendCalc,
  classifyWeighable as frontendClassify,
} from "../ecommerce/shared/manifestPricing.js";

// Red flag: si este archivo se rompe es porque alguien tocó UNA de las dos
// copias de las reglas de precio. Ya pasó una vez —el picking cobraba la mitad
// en LB/500GR— y no se detectó hasta que la plata faltó en caja. El backend
// decide cuánto se sincroniza a WooCommerce y el frontend qué monto se le
// muestra al cliente: si divergen, se cobra mal.

const casos = [
  {
    nombre: "producto por unidad",
    item: { price: 3500, quantity: 2, meta_data: [] },
  },
  {
    nombre: "pesable en kilos con peso registrado",
    item: {
      price: 12000,
      quantity: 1,
      meta_data: [
        { key: "unidad_medida", value: "KL" },
        { key: "peso_real", value: "1.5" },
      ],
    },
  },
  {
    nombre: "pesable en libras (el caso que cobró de menos)",
    item: {
      price: 8000,
      quantity: 2,
      meta_data: [
        { key: "unidad_medida", value: "LB" },
        { key: "peso_real", value: "1" },
      ],
    },
  },
  {
    nombre: "pesable en 500GR",
    item: {
      price: 6000,
      quantity: 3,
      meta_data: [
        { key: "unidad_medida", value: "500GR" },
        { key: "peso_real", value: "0.5" },
      ],
    },
  },
  {
    nombre: "pesable sin peso registrado (cae a precio unitario)",
    item: {
      price: 9000,
      quantity: 1,
      meta_data: [{ key: "unidad_medida", value: "KL" }],
    },
  },
  {
    nombre: "cantidad cero",
    item: { price: 5000, quantity: 0, meta_data: [] },
  },
  {
    nombre: "item vacío",
    item: {},
  },
];

describe("manifestPricing — backend/frontend sync", () => {
  it.each(casos)("calcLineCharge coincide: $nombre", ({ item }) => {
    expect(backendCalc(item)).toBe(frontendCalc(item));
  });

  it.each(casos)("classifyWeighable coincide: $nombre", ({ item }) => {
    expect(backendClassify(item)).toEqual(frontendClassify(item));
  });

  it("ambas copias exportan las mismas funciones", () => {
    expect(typeof backendCalc).toBe(typeof frontendCalc);
    expect(typeof backendClassify).toBe(typeof frontendClassify);
  });
});
