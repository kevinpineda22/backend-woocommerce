import { describe, it, expect } from "vitest";
import * as backend from "./siesaMatching.js";
import * as frontend from "../ecommerce/shared/siesaMatching.js";

// =====================================================================
// Red flag: si este test se rompe, alguien editó UNA de las dos copias.
//
// Backend (CJS) y frontend (ESM) tienen que coincidir exactamente en cómo
// deciden si un código corresponde a un producto. Si divergen, el picker
// acepta un código que el auditor rechaza — o al revés — y el operario
// queda trabado frente al producto correcto sin entender por qué.
//
// Es el mismo contrato que ya cubren weighableUnits, manifestPricing y
// paymentMethods. Nada vive en ecommerce/shared/ sin un test de sync.
// =====================================================================

const F120 = 185325;
const SIESA = [
  { f120_id: F120, codigo_barras: "7702004009999", unidad_medida: "UND" },
  { f120_id: F120, codigo_barras: "7702004008888+", unidad_medida: "KL" },
  { f120_id: 999, codigo_barras: "7702004007777", unidad_medida: "P25" },
];

describe("siesaMatching — backend/frontend sync", () => {
  // `default` lo agrega el interop CJS→ESM al importar el módulo del backend;
  // no es una exportación real. Se descarta de los dos lados por igual.
  const superficie = (mod) => Object.keys(mod).filter((k) => k !== "default").sort();

  it("exportan exactamente la misma superficie", () => {
    expect(superficie(frontend)).toEqual(superficie(backend));
  });

  it("REASON tiene los mismos valores en las dos copias", () => {
    expect(frontend.REASON).toEqual(backend.REASON);
  });

  it("normalizeBarcode se comporta igual", () => {
    const casos = ["7702004009999+", "  7702004009999  ", "185325p25", "", null, undefined, 7702004009999];
    casos.forEach((c) => {
      expect(frontend.normalizeBarcode(c)).toBe(backend.normalizeBarcode(c));
    });
  });

  it("normalizeUM se comporta igual", () => {
    ["UN", "unidad", "KG", "Kilo", "LIBRA", "lb", "p25", "", null, "NULL", "DEFAULT"].forEach((u) => {
      expect(frontend.normalizeUM(u)).toBe(backend.normalizeUM(u));
    });
  });

  it("barcodeVariants devuelve las mismas variantes", () => {
    ["7702004009999", "7702004009999+", "", null].forEach((c) => {
      expect(frontend.barcodeVariants(c)).toEqual(backend.barcodeVariants(c));
    });
  });

  it("parseSkuUm / isPlainF120 / isGS1Variable coinciden", () => {
    ["185325P25", "15151lb", "7702004009999", "185325", "2900089005003", "abc"].forEach((c) => {
      expect(frontend.parseSkuUm(c)).toEqual(backend.parseSkuUm(c));
      expect(frontend.isPlainF120(c)).toBe(backend.isPlainF120(c));
      expect(frontend.isGS1Variable(c)).toBe(backend.isGS1Variable(c));
      expect(frontend.isScannableInput(c)).toBe(backend.isScannableInput(c));
    });
  });

  it("buildBarcodeIndex produce el mismo índice", () => {
    expect(frontend.buildBarcodeIndex(SIESA)).toEqual(backend.buildBarcodeIndex(SIESA));
  });

  it("availableUMsFor coincide", () => {
    expect(frontend.availableUMsFor(SIESA, F120).sort()).toEqual(
      backend.availableUMsFor(SIESA, F120).sort(),
    );
  });

  it("matchScannedCode decide igual en los casos que costaron plata", () => {
    const casos = [
      // El '+' de SIESA
      { codigo: "7702004008888", f120_id_esperado: F120, um_esperada: "KL" },
      // Producto correcto, presentación distinta, UM adivinada → pasa
      { codigo: "7702004008888", f120_id_esperado: F120, um_esperada: "UND", umConfiable: false },
      // Misma situación con UM real → bloquea
      { codigo: "7702004008888", f120_id_esperado: F120, um_esperada: "UND", umConfiable: true },
      // f120_id pelado (producto sin etiqueta física)
      { codigo: "185325", f120_id_esperado: F120, um_esperada: "UND" },
      // SKU+UM digitado
      { codigo: "185325P25", f120_id_esperado: F120, um_esperada: "P25" },
      // Código de otro producto
      { codigo: "7702004007777", f120_id_esperado: F120, um_esperada: "UND" },
      // GS1 de báscula
      { codigo: "2900089005003", f120_id_esperado: F120, um_esperada: "KL" },
      // Ruido
      { codigo: "??", f120_id_esperado: F120, um_esperada: "UND" },
    ];
    casos.forEach((c) => {
      const args = { ...c, siesaRows: SIESA };
      expect(frontend.matchScannedCode(args)).toEqual(backend.matchScannedCode(args));
    });
  });

  it("resolveExpectedUM devuelve la misma confianza", () => {
    const casos = [
      { sku: "15151LB", umsDisponibles: ["LB", "KL"] },
      { umWoo: "Kl", sku: "15151", umsDisponibles: ["KL", "UND"] },
      { nombre: "Bandeja Tomate Cherry Grande", umsDisponibles: ["UND", "KL"] },
      { nombre: "Gaseosa Paca x25", umsDisponibles: ["UND", "P25"] },
      { nombre: "X", umsDisponibles: [] },
    ];
    casos.forEach((c) => {
      expect(frontend.resolveExpectedUM(c)).toEqual(backend.resolveExpectedUM(c));
    });
  });

  it("buildManifestCode produce el mismo código", () => {
    const casos = [
      { f120_id: 185325, um: "UND", barcode: "7702004009999" },
      { f120_id: 185325, um: "und", barcode: "" },
      { f120_id: 185325, um: null, barcode: "" },
      { f120_id: "SIN-SKU", um: "UND", barcode: "" },
    ];
    casos.forEach((c) => {
      expect(frontend.buildManifestCode(c)).toBe(backend.buildManifestCode(c));
    });
  });
});
