import { describe, it, expect } from "vitest";
import {
  isValidSiesaBarcode,
  cleanSiesaCode,
  normalizeUnitMeasure,
  inferUnitMeasureFromName,
  buildBarcodeSkuUm,
  isSkuUmFormat,
  resolveManifestBarcode,
} from "./barcodeFilter";

// =============================================
// isValidSiesaBarcode — FILTRO CRÍTICO
// Bug original: filtro excluía códigos SKU+UM y cortos,
// dejando solo EAN-13 (causó venta de paca a precio de unidad)
// =============================================

describe("isValidSiesaBarcode", () => {
  describe("códigos que DEBEN pasar (fix del bug)", () => {
    it("permite SKU+UM format (185325P25, 185325UND)", () => {
      expect(isValidSiesaBarcode("185325P25")).toBe(true);
      expect(isValidSiesaBarcode("185325UND")).toBe(true);
      expect(isValidSiesaBarcode("17050UND")).toBe(true);
      expect(isValidSiesaBarcode("1039UND")).toBe(true);
    });

    it("permite EAN-13 estándar", () => {
      expect(isValidSiesaBarcode("7709138700037")).toBe(true);
      expect(isValidSiesaBarcode("8719200453012")).toBe(true);
    });

    it("permite códigos cortos numéricos (>= 4 chars)", () => {
      expect(isValidSiesaBarcode("17050")).toBe(true);
      expect(isValidSiesaBarcode("185325")).toBe(true);
      expect(isValidSiesaBarcode("185326")).toBe(true);
      expect(isValidSiesaBarcode("1556")).toBe(true);
    });

    it("permite códigos con + al final", () => {
      expect(isValidSiesaBarcode("17050+")).toBe(true);
      expect(isValidSiesaBarcode("185325+")).toBe(true);
    });

    it("permite GS1 pesables (prefijo 29)", () => {
      expect(isValidSiesaBarcode("2915167004953")).toBe(true);
      expect(isValidSiesaBarcode("2900103019207")).toBe(true);
    });
  });

  describe("códigos que DEBEN ser rechazados", () => {
    it("rechaza prefijo M seguido de dígitos", () => {
      expect(isValidSiesaBarcode("M7709138700037")).toBe(false);
      expect(isValidSiesaBarcode("M111")).toBe(false);
    });

    it("rechaza prefijo N seguido de dígitos", () => {
      expect(isValidSiesaBarcode("N7709138700037")).toBe(false);
      expect(isValidSiesaBarcode("N12345")).toBe(false);
    });

    it("rechaza códigos demasiado cortos (< 4 chars)", () => {
      expect(isValidSiesaBarcode("111")).toBe(false);
      expect(isValidSiesaBarcode("12")).toBe(false);
      expect(isValidSiesaBarcode("1")).toBe(false);
    });

    it("rechaza input vacío/nulo", () => {
      expect(isValidSiesaBarcode(null)).toBe(false);
      expect(isValidSiesaBarcode(undefined)).toBe(false);
      expect(isValidSiesaBarcode("")).toBe(false);
    });

    it("rechaza códigos con caracteres especiales", () => {
      expect(isValidSiesaBarcode("ABC-123")).toBe(false);
      expect(isValidSiesaBarcode("12.34.56")).toBe(false);
    });
  });

  describe("caso real: Arroz Congo f120_id=185325", () => {
    it("acepta 185325+ (UND con +)", () => {
      expect(isValidSiesaBarcode("185325+")).toBe(true);
    });
    it("acepta 185326 (P25, 6 dígitos)", () => {
      expect(isValidSiesaBarcode("185326")).toBe(true);
    });
    it("acepta 7709138700037 (EAN-13 UND)", () => {
      expect(isValidSiesaBarcode("7709138700037")).toBe(true);
    });
    it("rechaza M7709138700037 (prefijo M)", () => {
      expect(isValidSiesaBarcode("M7709138700037")).toBe(false);
    });
    it("acepta 185325P25 (SKU+UM)", () => {
      expect(isValidSiesaBarcode("185325P25")).toBe(true);
    });
    it("acepta 185325UND (SKU+UM)", () => {
      expect(isValidSiesaBarcode("185325UND")).toBe(true);
    });
  });

  describe("caso real: Bolsa Mora f120_id=17050", () => {
    it("acepta 17050+ (UND con +)", () => {
      expect(isValidSiesaBarcode("17050+")).toBe(true);
    });
    it("rechaza 111 (demasiado corto, < 4)", () => {
      expect(isValidSiesaBarcode("111")).toBe(false);
    });
    it("rechaza M111 (prefijo M y corto)", () => {
      expect(isValidSiesaBarcode("M111")).toBe(false);
    });
    it("acepta 17050UND (SKU+UM)", () => {
      expect(isValidSiesaBarcode("17050UND")).toBe(true);
    });
  });
});

// =============================================
// cleanSiesaCode
// =============================================

describe("cleanSiesaCode", () => {
  it("quita + del final", () => {
    expect(cleanSiesaCode("185325+")).toBe("185325");
    expect(cleanSiesaCode("17050+")).toBe("17050");
  });

  it("no modifica códigos sin +", () => {
    expect(cleanSiesaCode("185325P25")).toBe("185325P25");
    expect(cleanSiesaCode("7709138700037")).toBe("7709138700037");
  });

  it("maneja input vacío/nulo", () => {
    expect(cleanSiesaCode(null)).toBe("");
    expect(cleanSiesaCode(undefined)).toBe("");
    expect(cleanSiesaCode("")).toBe("");
  });
});

// =============================================
// normalizeUnitMeasure — Normalización canónica
// =============================================

describe("normalizeUnitMeasure", () => {
  it("normaliza variantes de UNIDAD", () => {
    expect(normalizeUnitMeasure("UN")).toBe("UND");
    expect(normalizeUnitMeasure("UNIDAD")).toBe("UND");
    expect(normalizeUnitMeasure("UND")).toBe("UND");
  });

  it("normaliza variantes de KILO", () => {
    expect(normalizeUnitMeasure("KG")).toBe("KL");
    expect(normalizeUnitMeasure("KILO")).toBe("KL");
    expect(normalizeUnitMeasure("KL")).toBe("KL");
  });

  it("normaliza variantes de LIBRA", () => {
    expect(normalizeUnitMeasure("LB")).toBe("LB");
    expect(normalizeUnitMeasure("LIBRA")).toBe("LB");
  });

  it("maneja vacío como DEFAULT", () => {
    expect(normalizeUnitMeasure("")).toBe("DEFAULT");
    expect(normalizeUnitMeasure(null)).toBe("DEFAULT");
    expect(normalizeUnitMeasure(undefined)).toBe("DEFAULT");
  });

  it("preserva packs tal cual", () => {
    expect(normalizeUnitMeasure("P25")).toBe("P25");
    expect(normalizeUnitMeasure("P6")).toBe("P6");
    expect(normalizeUnitMeasure("P12")).toBe("P12");
  });
});

// =============================================
// inferUnitMeasureFromName — FUNCIÓN CRÍTICA
// Bug original: no detectaba "Paca x25", defaulteaba a availableUMs[0]
// =============================================

describe("inferUnitMeasureFromName", () => {
  describe("detección dinámica de packs", () => {
    it('detecta "Paca x25" → P25', () => {
      const result = inferUnitMeasureFromName(
        "Arroz Congo de Oro 500 g - Paca x25",
        ["UND", "P25"],
      );
      expect(result.um).toBe("P25");
      expect(result.confident).toBe(true);
    });

    it('detecta "Pack X 12" → P12', () => {
      const result = inferUnitMeasureFromName("Galletas Oreo Pack X 12", [
        "UND",
        "P12",
      ]);
      expect(result.um).toBe("P12");
      expect(result.confident).toBe(true);
    });

    it('detecta "Caja de 6" → P6', () => {
      const result = inferUnitMeasureFromName("Cerveza en Caja de 6 und", [
        "UND",
        "P6",
      ]);
      expect(result.um).toBe("P6");
      expect(result.confident).toBe(true);
    });

    it('detecta "Bulto 25" → P25', () => {
      const result = inferUnitMeasureFromName(
        "Cemento Bulto 25 kg presentación",
        ["UND", "P25"],
      );
      expect(result.um).toBe("P25");
      expect(result.confident).toBe(true);
    });

    it('detecta "Display 24" → P24', () => {
      const result = inferUnitMeasureFromName("Chicle Display 24 unidades", [
        "UND",
        "P24",
      ]);
      expect(result.um).toBe("P24");
      expect(result.confident).toBe(true);
    });
  });

  describe("detección estática por keywords", () => {
    it('detecta "X 18" en nombre → P18', () => {
      const result = inferUnitMeasureFromName(
        "Papel higiénico Nube Maxi rollo X 18 R 396 g",
        ["UND", "P18"],
      );
      expect(result.um).toBe("P18");
      expect(result.confident).toBe(true);
    });

    it('detecta "Kilo" → KL', () => {
      const result = inferUnitMeasureFromName("Tomate de Arbol Kilo - Kg", [
        "UND",
        "KL",
      ]);
      expect(result.um).toBe("KL");
      expect(result.confident).toBe(true);
    });

    it('detecta "Libra" → LB', () => {
      const result = inferUnitMeasureFromName("Molida Especial Kilo - Lb", [
        "UND",
        "LB",
      ]);
      expect(result.um).toBe("LB");
      expect(result.confident).toBe(true);
    });

    it('detecta "Duo" → P2', () => {
      const result = inferUnitMeasureFromName("Jabón Dove Dúo Pack", [
        "UND",
        "P2",
      ]);
      expect(result.um).toBe("P2");
      expect(result.confident).toBe(true);
    });

    it('detecta "SIXPACK" → P6', () => {
      const result = inferUnitMeasureFromName("Cerveza Club Colombia Sixpack", [
        "UND",
        "P6",
      ]);
      expect(result.um).toBe("P6");
      expect(result.confident).toBe(true);
    });

    it('detecta "Docena" → P12', () => {
      const result = inferUnitMeasureFromName("Huevos Docena", ["UND", "P12"]);
      expect(result.um).toBe("P12");
      expect(result.confident).toBe(true);
    });
  });

  describe("fallback sin confianza", () => {
    it("sin pista en nombre → UND con confident=false si disponible", () => {
      const result = inferUnitMeasureFromName("Arroz Congo de Oro 500 g", [
        "UND",
        "P25",
      ]);
      expect(result.um).toBe("UND");
      expect(result.confident).toBe(false);
    });

    it("sin pista y sin UND → primera UM con confident=false", () => {
      const result = inferUnitMeasureFromName("Producto Genérico", [
        "P6",
        "P12",
      ]);
      expect(result.um).toBe("P6");
      expect(result.confident).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("una sola UM → la retorna con confident=true", () => {
      const result = inferUnitMeasureFromName("Bolsa Mora Unidad", ["UND"]);
      expect(result.um).toBe("UND");
      expect(result.confident).toBe(true);
    });

    it("lista vacía → null sin confianza", () => {
      const result = inferUnitMeasureFromName("Producto", []);
      expect(result.um).toBe(null);
      expect(result.confident).toBe(false);
    });

    it("nombre vacío → fallback sin confianza", () => {
      const result = inferUnitMeasureFromName("", ["UND", "P25"]);
      expect(result.um).toBe("UND");
      expect(result.confident).toBe(false);
    });

    it("nombre null → fallback sin confianza", () => {
      const result = inferUnitMeasureFromName(null, ["UND", "P25"]);
      expect(result.um).toBe("UND");
      expect(result.confident).toBe(false);
    });
  });

  describe("caso real: NO confundir arroz unidad vs paca", () => {
    it('"Arroz Congo de Oro 500 g" SIN "Paca" → UND (no P25)', () => {
      const result = inferUnitMeasureFromName("Arroz Congo de Oro 500 g", [
        "UND",
        "P25",
      ]);
      // Sin Paca en el nombre → debe dar UND, NO P25
      expect(result.um).toBe("UND");
      expect(result.confident).toBe(false);
    });

    it('"Arroz Congo de Oro 500 g - Paca x25" → P25', () => {
      const result = inferUnitMeasureFromName(
        "Arroz Congo de Oro 500 g - Paca x25",
        ["UND", "P25"],
      );
      expect(result.um).toBe("P25");
      expect(result.confident).toBe(true);
    });
  });
});

// =============================================
// buildBarcodeSkuUm
// =============================================

describe("buildBarcodeSkuUm", () => {
  it("construye formato correcto para UND", () => {
    expect(buildBarcodeSkuUm(17050, "UND")).toBe("17050UND");
    expect(buildBarcodeSkuUm(185325, "UND")).toBe("185325UND");
  });

  it("construye formato correcto para packs", () => {
    expect(buildBarcodeSkuUm(185325, "P25")).toBe("185325P25");
    expect(buildBarcodeSkuUm(1039, "P6")).toBe("1039P6");
  });

  it("construye formato correcto para pesables", () => {
    expect(buildBarcodeSkuUm(103, "KL")).toBe("103KL");
    expect(buildBarcodeSkuUm(15134, "LB")).toBe("15134LB");
  });

  it("normaliza UM antes de construir", () => {
    expect(buildBarcodeSkuUm(185325, "UNIDAD")).toBe("185325UND");
    expect(buildBarcodeSkuUm(185325, "KG")).toBe("185325KL");
    expect(buildBarcodeSkuUm(185325, "LIBRA")).toBe("185325LB");
  });

  it("maneja f120_id como string", () => {
    expect(buildBarcodeSkuUm("185325", "P25")).toBe("185325P25");
  });

  it("retorna vacío para input inválido", () => {
    expect(buildBarcodeSkuUm(NaN, "UND")).toBe("");
    expect(buildBarcodeSkuUm("abc", "UND")).toBe("");
  });

  it("omite UM DEFAULT", () => {
    expect(buildBarcodeSkuUm(17050, "")).toBe("17050");
    expect(buildBarcodeSkuUm(17050, null)).toBe("17050");
  });
});

// =============================================
// isSkuUmFormat — Detecta formato dígitos+letras
// =============================================

describe("isSkuUmFormat", () => {
  it("detecta formatos SKU+UM válidos", () => {
    expect(isSkuUmFormat("185325P25")).toBe(true);
    expect(isSkuUmFormat("185325UND")).toBe(true);
    expect(isSkuUmFormat("17050UND")).toBe(true);
    expect(isSkuUmFormat("1039P6")).toBe(true);
    expect(isSkuUmFormat("103KL")).toBe(true);
  });

  it("rechaza solo dígitos (EAN, SKU desnudo)", () => {
    expect(isSkuUmFormat("7709138700037")).toBe(false);
    expect(isSkuUmFormat("185325")).toBe(false);
    expect(isSkuUmFormat("17050")).toBe(false);
  });

  it("rechaza GS1 pesables", () => {
    expect(isSkuUmFormat("2900103019207")).toBe(false);
  });

  it("rechaza input vacío/nulo", () => {
    expect(isSkuUmFormat(null)).toBe(false);
    expect(isSkuUmFormat(undefined)).toBe(false);
    expect(isSkuUmFormat("")).toBe(false);
  });
});

// =============================================
// resolveManifestBarcode — Prioridad de resolución para manifiesto
// =============================================

describe("resolveManifestBarcode", () => {
  describe("prioridad 1: GS1 pesable ya construido", () => {
    it("usa GS1-29 si ya presente en barcode", () => {
      const result = resolveManifestBarcode({
        barcode: "2915167004953",
        sku: "15167",
        unidad_medida: "LB",
      });
      expect(result).toBe("2915167004953");
    });
  });

  describe("prioridad 3: barcode ya en formato SKU+UM", () => {
    it('usa "185325P25" directo si ya está en el barcode', () => {
      const result = resolveManifestBarcode({
        barcode: "185325P25",
        sku: "185325",
        unidad_medida: "P25",
      });
      expect(result).toBe("185325P25");
    });

    it('usa "17050UND" directo si ya está en el barcode', () => {
      const result = resolveManifestBarcode({
        barcode: "17050UND",
        sku: "17050",
        unidad_medida: "UND",
      });
      expect(result).toBe("17050UND");
    });
  });

  describe("prioridad 4: construir SKU+UM desde datos del item", () => {
    it('construye "185325P25" desde SKU + UM cuando barcode es EAN erróneo', () => {
      const result = resolveManifestBarcode({
        barcode: "7709138700037",
        sku: "185325",
        unidad_medida: "P25",
      });
      // barcode es solo dígitos → no es SKU+UM → construye desde sku + um
      expect(result).toBe("185325P25");
    });

    it('construye "17050UND" desde SKU + UM cuando barcode es solo SKU', () => {
      const result = resolveManifestBarcode({
        barcode: "17050",
        sku: "17050",
        unidad_medida: "UND",
      });
      expect(result).toBe("17050UND");
    });
  });

  describe("caso real completo: Arroz Paca x25", () => {
    it("SIN fix previo (barcode=7709138700037, um=P25) → construye 185325P25", () => {
      const result = resolveManifestBarcode({
        barcode: "7709138700037",
        sku: "185325",
        unidad_medida: "P25",
      });
      expect(result).toBe("185325P25");
    });

    it("CON fix (barcode=185325P25) → usa directo", () => {
      const result = resolveManifestBarcode({
        barcode: "185325P25",
        sku: "185325",
        unidad_medida: "P25",
      });
      expect(result).toBe("185325P25");
    });
  });

  describe("caso real: Bolsa Mora 17050", () => {
    it("construye 17050UND cuando barcode es solo dígitos", () => {
      const result = resolveManifestBarcode({
        barcode: "17050",
        sku: "17050",
        unidad_medida: "UND",
      });
      expect(result).toBe("17050UND");
    });
  });

  describe("shipping items (no deben modificarse)", () => {
    it("retorna barcode directo para shipping (sin UM)", () => {
      const result = resolveManifestBarcode({
        barcode: "304",
        sku: "304",
        unidad_medida: "",
      });
      // Sin UM → cae a barcode directo: "304"
      expect(result).toBe("304");
    });
  });

  describe("productos pesables NO deben generar SKU+UM", () => {
    it("retorna barcode directo para KL (no construye SKUKL)", () => {
      const result = resolveManifestBarcode({
        barcode: "2900103019207",
        sku: "103",
        unidad_medida: "KL",
      });
      expect(result).toBe("2900103019207");
    });
  });
});
