import { describe, it, expect } from "vitest";
import {
  WEIGHABLE_UNITS as frontendUnits,
  isWeighableUnit as frontendIsWeighable,
  kgPerUnit as frontendKg,
} from "../ecommerce/shared/weighableUnits.js";
import {
  WEIGHABLE_UNITS as backendUnits,
  isWeighableUnit as backendIsWeighable,
  kgPerUnit as backendKg,
} from "./weighableUnits.js";

// Red flag: si este test se rompe es porque alguien cambió UNA de las dos listas.
// WooCommerce usa `display_value` para la unidad y si las listas divergen el picker
// silenciosamente deja de pedir peso en los productos con la unidad nueva.
describe("weighableUnits — backend/frontend sync", () => {
  it("both lists have the same units", () => {
    expect([...backendUnits].sort()).toEqual([...frontendUnits].sort());
  });

  it("isWeighableUnit behaves identically on both sides", () => {
    const cases = [
      "KL", "kl", "kg", "KG", "kilo", "LIBRA", "lb", "500g", "500GR",
      "UND", "und", "p25", "", null, undefined,
    ];
    cases.forEach((c) => {
      expect(backendIsWeighable(c)).toBe(frontendIsWeighable(c));
    });
  });

  it("kgPerUnit returns same factor on both sides", () => {
    ["KL", "kg", "LB", "libra", "500g", "500gr", "UND"].forEach((u) => {
      expect(backendKg(u)).toBe(frontendKg(u));
    });
  });

  it("recognizes the new 500g display_value from WooCommerce", () => {
    expect(backendIsWeighable("500g")).toBe(true);
    expect(frontendIsWeighable("500g")).toBe(true);
  });
});
