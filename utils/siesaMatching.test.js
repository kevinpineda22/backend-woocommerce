import { describe, it, expect } from "vitest";
import {
  REASON,
  normalizeBarcode,
  barcodeVariants,
  normalizeUM,
  parseSkuUm,
  isPlainF120,
  isGS1Variable,
  stripMNPrefix,
  buildBarcodeIndex,
  availableUMsFor,
  matchScannedCode,
  resolveExpectedUM,
  buildManifestCode,
  findGs1Base,
  buildWeighableCode,
} from "./siesaMatching";

// =====================================================================
// Guarda de regresión de la validación de códigos en picking y auditoría.
//
// Cada bloque REGRESIÓN corresponde a un defecto real que trabó a una
// auditora frente a un producto correcto. Si uno de estos tests se pone
// rojo, el bug volvió: NO lo ajustes, arreglá el código.
//
// Caso testigo: "Bandeja Tomate Cherry Grande" (f120_id 185325), un
// producto SIN código de barras pegado físicamente.
// =====================================================================

const F120_CHERRY = 185325;

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------
describe("normalizeBarcode", () => {
  it("quita el '+' final que usa SIESA y que ninguna etiqueta física tiene", () => {
    expect(normalizeBarcode("7702004009999+")).toBe("7702004009999");
    expect(normalizeBarcode("7702004009999")).toBe("7702004009999");
  });

  it("las dos formas del mismo código normalizan igual", () => {
    expect(normalizeBarcode("7702004009999+")).toBe(
      normalizeBarcode("  7702004009999  "),
    );
  });

  it("es tolerante con null, undefined y números", () => {
    expect(normalizeBarcode(null)).toBe("");
    expect(normalizeBarcode(undefined)).toBe("");
    expect(normalizeBarcode(7702004009999)).toBe("7702004009999");
  });

  it("normaliza a mayúsculas para los SKU+UM", () => {
    expect(normalizeBarcode("185325p25")).toBe("185325P25");
  });
});

describe("barcodeVariants", () => {
  it("consulta SIESA con y sin '+' para no perder la fila", () => {
    expect(barcodeVariants("7702004009999")).toEqual([
      "7702004009999",
      "7702004009999+",
    ]);
  });

  it("un código que ya trae '+' no genera '++'", () => {
    expect(barcodeVariants("7702004009999+")).toEqual([
      "7702004009999",
      "7702004009999+",
    ]);
  });

  it("un código vacío no genera consultas basura", () => {
    expect(barcodeVariants("")).toEqual([]);
    expect(barcodeVariants(null)).toEqual([]);
  });
});

describe("normalizeUM", () => {
  it("unifica los alias de SIESA", () => {
    expect(normalizeUM("UN")).toBe("UND");
    expect(normalizeUM("unidad")).toBe("UND");
    expect(normalizeUM("KG")).toBe("KL");
    expect(normalizeUM("Kilo")).toBe("KL");
    expect(normalizeUM("LIBRA")).toBe("LB");
  });

  it("vacío, null y 'NULL' colapsan en DEFAULT", () => {
    expect(normalizeUM("")).toBe("DEFAULT");
    expect(normalizeUM(null)).toBe("DEFAULT");
    expect(normalizeUM("NULL")).toBe("DEFAULT");
  });

  it("deja intactas las presentaciones de paca", () => {
    expect(normalizeUM("p25")).toBe("P25");
  });
});

describe("clasificación del input", () => {
  it("distingue un f120_id pelado de un EAN", () => {
    expect(isPlainF120("185325")).toBe(true);
    expect(isPlainF120("7702004009999")).toBe(false); // 13 dígitos: es un EAN
  });

  it("reconoce el GS1 de báscula por longitud y prefijo", () => {
    expect(isGS1Variable("2900089005003")).toBe(true);
    expect(isGS1Variable("7702004009999")).toBe(false); // no arranca en 2
  });

  it("parsea SKU+UM", () => {
    expect(parseSkuUm("185325P25")).toEqual({ f120_id: 185325, um: "P25" });
    expect(parseSkuUm("15151lb")).toEqual({ f120_id: 15151, um: "LB" });
    expect(parseSkuUm("7702004009999")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 1 — producto sin código de barras físico
// ---------------------------------------------------------------------
describe("REGRESIÓN 1 — el producto sin etiqueta física ahora se puede auditar", () => {
  const siesa = [
    { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "UND" },
  ];
  const base = {
    f120_id_esperado: F120_CHERRY,
    um_esperada: "UND",
    siesaRows: siesa,
  };

  it("digitar el f120_id que muestra la pantalla VALIDA", () => {
    const r = matchScannedCode({ ...base, codigo: "185325" });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe(REASON.F120_MANUAL);
  });

  it("deja rastro explícito de que se validó a mano", () => {
    const r = matchScannedCode({ ...base, codigo: "185325" });
    expect(r.advertencia).toContain("Validado a mano");
    // `reason` viaja al log: queda auditable quién validó sin escanear.
  });

  it("el f120_id de OTRO producto sigue rechazado", () => {
    const r = matchScannedCode({ ...base, codigo: "999111" });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(REASON.WRONG_PRODUCT);
  });

  it("se puede apagar la salida manual sin tocar el resto", () => {
    const r = matchScannedCode({ ...base, codigo: "185325", allowF120Manual: false });
    expect(r.valid).toBe(false);
  });

  it("ruido de teclado sigue siendo inválido", () => {
    expect(matchScannedCode({ ...base, codigo: "abc-??" }).reason).toBe(
      REASON.MALFORMED,
    );
    expect(matchScannedCode({ ...base, codigo: "" }).reason).toBe(REASON.MALFORMED);
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 2 — el '+' de SIESA
// ---------------------------------------------------------------------
describe("REGRESIÓN 2 — el '+' de SIESA ya no bloquea el lector", () => {
  const siesa = [
    { f120_id: F120_CHERRY, codigo_barras: "7702004009999+", unidad_medida: "UND" },
  ];
  const base = { f120_id_esperado: F120_CHERRY, um_esperada: "UND", siesaRows: siesa };

  it("escanear la etiqueta física (sin '+') VALIDA", () => {
    const r = matchScannedCode({ ...base, codigo: "7702004009999" });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe(REASON.EXACT);
  });

  it("el caso inverso también: SIESA sin '+', input con '+'", () => {
    const r = matchScannedCode({
      codigo: "7702004009999+",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "UND",
      siesaRows: [
        { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "UND" },
      ],
    });
    expect(r.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 2b — el prefijo M/N de los códigos internos de SIESA
// ---------------------------------------------------------------------
describe("REGRESIÓN 2b — el prefijo M/N de SIESA no bloquea", () => {
  // Caso real (sesión 00281109): SIESA guarda "M7703910061224" para los
  // Huevos Avinal. Ninguna etiqueta física lleva la M, y el frontend ya hacía
  // `stripMN()` antes de mandar nada al POS. Pero el flujo real es que alguien
  // consulte la base, vea el código CON la M y lo dicte tal cual.
  const F120_HUEVOS = 4908;
  const siesa = [
    { f120_id: F120_HUEVOS, codigo_barras: "M7703910061224", unidad_medida: "UND" },
    { f120_id: F120_HUEVOS, codigo_barras: "7703910061224", unidad_medida: "UND" },
  ];
  const base = {
    f120_id_esperado: F120_HUEVOS,
    um_esperada: "UND",
    siesaRows: siesa,
  };

  it("el código dictado desde la base, CON la M, valida", () => {
    const r = matchScannedCode({ ...base, codigo: "M7703910061224" });
    expect(r.valid).toBe(true);
  });

  it("el código escaneado de la etiqueta, sin M, también valida", () => {
    expect(matchScannedCode({ ...base, codigo: "7703910061224" }).valid).toBe(true);
  });

  it("funciona aunque SIESA SOLO tenga la fila con M", () => {
    const r = matchScannedCode({
      ...base,
      codigo: "7703910061224",
      siesaRows: [siesa[0]],
    });
    expect(r.valid).toBe(true);
  });

  it("quitar la M no convierte otro producto en válido", () => {
    const r = matchScannedCode({ ...base, codigo: "M9999999999999" });
    expect(r.valid).toBe(false);
  });

  it("stripMNPrefix solo actúa sobre M/N seguidos de dígito", () => {
    expect(stripMNPrefix("M7703910061224")).toBe("7703910061224");
    expect(stripMNPrefix("N123")).toBe("123");
    expect(stripMNPrefix("7703910061224")).toBe("7703910061224");
    expect(stripMNPrefix("MAX123")).toBe("MAX123"); // no es prefijo, es texto
    expect(stripMNPrefix("")).toBe("");
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 3 — código repetido en varias filas
// ---------------------------------------------------------------------
describe("REGRESIÓN 3 — un código en varias filas ya no revienta la validación", () => {
  // El mismo EAN registrado para dos presentaciones: normal en SIESA.
  // Antes `.single()` devolvía error y se traducía a "no encontrado".
  const siesa = [
    { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "UND" },
    { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "KL" },
  ];

  it("valida contra CUALQUIERA de las filas del producto correcto", () => {
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "UND",
      siesaRows: siesa,
    });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe(REASON.EXACT);
  });

  it("valida igual si la UM esperada es la otra fila", () => {
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "KL",
      siesaRows: siesa,
    });
    expect(r.valid).toBe(true);
  });

  it("un código compartido con OTRO producto no valida por contagio", () => {
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: 777,
      um_esperada: "UND",
      siesaRows: siesa,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(REASON.WRONG_PRODUCT);
    expect(r.codigo_existe).toBe(true); // el código existe, pero no es de este producto
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 4 — la UM adivinada no bloquea
// ---------------------------------------------------------------------
describe("REGRESIÓN 4 — una UM inferida NO invalida un código correcto", () => {
  const siesa = [
    { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "KL" },
  ];

  it("el escenario exacto que reportó la encargada ahora pasa", () => {
    // La UM esperada (UND) salió de adivinar sobre el nombre: umConfiable=false
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "UND",
      umConfiable: false,
      siesaRows: siesa,
    });
    expect(r.valid).toBe(true);
    expect(r.reason).toBe(REASON.PRODUCT_OK_UM_DIFF);
    expect(r.unidad_medida).toBe("KL"); // se corrige con el dato REAL de SIESA
  });

  it("pero avisa: la discrepancia no se esconde", () => {
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "UND",
      umConfiable: false,
      siesaRows: siesa,
    });
    expect(r.advertencia).toContain("UND");
    expect(r.advertencia).toContain("KL");
  });

  it("cuando la UM SÍ es un dato real, la presentación vuelve a bloquear", () => {
    const r = matchScannedCode({
      codigo: "7702004009999",
      f120_id_esperado: F120_CHERRY,
      um_esperada: "UND",
      umConfiable: true,
      siesaRows: siesa,
    });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(REASON.WRONG_UM);
    // Esto protege el caso legítimo: paca de 25 vs unidad suelta.
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN 5 — el índice ya no pierde filas
// ---------------------------------------------------------------------
describe("REGRESIÓN 5 — buildBarcodeIndex conserva TODAS las presentaciones", () => {
  it("un EAN compartido por dos UM guarda las dos", () => {
    const idx = buildBarcodeIndex([
      { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "UND" },
      { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "KL" },
    ]);
    expect(idx["7702004009999"]).toHaveLength(2);
    expect(idx["7702004009999"].map((e) => e.unidad_medida).sort()).toEqual(["KL", "UND"]);
  });

  it("las variantes con y sin '+' caen en la MISMA clave normalizada", () => {
    const idx = buildBarcodeIndex([
      { f120_id: F120_CHERRY, codigo_barras: "7702004009999+", unidad_medida: "UND" },
    ]);
    expect(idx["7702004009999"]).toBeDefined();
    expect(Object.keys(idx)).toHaveLength(1); // una sola clave, no dos
  });

  it("filas idénticas repetidas no inflan el índice", () => {
    const row = { f120_id: F120_CHERRY, codigo_barras: "7702004009999", unidad_medida: "UND" };
    expect(buildBarcodeIndex([row, { ...row }])["7702004009999"]).toHaveLength(1);
  });

  it("availableUMsFor lista las presentaciones reales del producto", () => {
    const rows = [
      { f120_id: F120_CHERRY, codigo_barras: "1", unidad_medida: "UND" },
      { f120_id: F120_CHERRY, codigo_barras: "2", unidad_medida: "KG" },
      { f120_id: 999, codigo_barras: "3", unidad_medida: "LB" },
    ];
    expect(availableUMsFor(rows, F120_CHERRY).sort()).toEqual(["KL", "UND"]);
  });
});

// ---------------------------------------------------------------------
// resolveExpectedUM — de dónde salió la unidad de medida
// ---------------------------------------------------------------------
describe("resolveExpectedUM — la confianza es explícita, no implícita", () => {
  it("el sufijo del SKU es dato duro (mismo criterio que manifestPricing)", () => {
    const r = resolveExpectedUM({ sku: "15151LB", umsDisponibles: ["LB", "KL"] });
    expect(r).toEqual({ um: "LB", confiable: true, fuente: "sku" });
  });

  it("la UM de WooCommerce vale si SIESA la reconoce", () => {
    const r = resolveExpectedUM({ umWoo: "Kl", sku: "15151", umsDisponibles: ["KL", "UND"] });
    expect(r).toEqual({ um: "KL", confiable: true, fuente: "woo" });
  });

  it("si SIESA solo conoce una presentación, no hay nada que adivinar", () => {
    const r = resolveExpectedUM({ nombre: "Bandeja Tomate Cherry", umsDisponibles: ["UND"] });
    expect(r).toEqual({ um: "UND", confiable: true, fuente: "siesa_unica" });
  });

  it("un keyword real en el nombre sí es confiable", () => {
    const r = resolveExpectedUM({ nombre: "Gaseosa Paca x25", umsDisponibles: ["UND", "P25"] });
    expect(r).toEqual({ um: "P25", confiable: true, fuente: "nombre" });
  });

  it("EL CASO CLAVE: sin evidencia, la UM queda marcada NO confiable", () => {
    const r = resolveExpectedUM({
      nombre: "Bandeja Tomate Cherry Grande",
      umsDisponibles: ["UND", "KL"],
    });
    expect(r.confiable).toBe(false);
    expect(r.fuente).toBe("fallback");
    // Sigue devolviendo una UM para poder MOSTRARLA, pero nunca bloquea.
  });

  it("el fallback es DETERMINISTA: no depende del orden que devuelva Postgres", () => {
    const a = resolveExpectedUM({ nombre: "Bandeja X", umsDisponibles: ["P6", "KL"] });
    const b = resolveExpectedUM({ nombre: "Bandeja X", umsDisponibles: ["KL", "P6"] });
    expect(a.um).toBe(b.um);
    // Antes daba P6 o KL según el orden de las filas: la misma auditoría
    // pedía distinta presentación en dos corridas.
  });
});

// ---------------------------------------------------------------------
// buildManifestCode — nada de f120_id pelado en el QR
// ---------------------------------------------------------------------
describe("buildManifestCode — en el QR solo van códigos de barras REALES", () => {
  // Regla del negocio: la caja lee códigos de `siesa_codigos_barras`. No
  // entiende un ítem (el f120_id suelto) ni un código fabricado. Esta función
  // ELIGE entre los códigos que el producto tiene; nunca inventa uno.
  //
  // Fabricarlos fue un error real: cuando el producto no tenía esa fila, la
  // caja rechazaba la línea. En producción "no pasaba ningún producto, solo
  // el fruver" — que va por el GS1 de peso variable, otra ruta.
  const filas = [
    { f120_id: 185325, codigo_barras: "185325", unidad_medida: "UND" },
    { f120_id: 185325, codigo_barras: "185325UND", unidad_medida: "UND" },
    { f120_id: 185325, codigo_barras: "7702004009999", unidad_medida: "UND" },
    { f120_id: 185325, codigo_barras: "185325P25", unidad_medida: "P25" },
    { f120_id: 999, codigo_barras: "7702004000000", unidad_medida: "UND" },
  ];

  it("elige el SKU+UM de la presentación, porque existe en la tabla", () => {
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", siesaRows: filas }),
    ).toBe("185325UND");
  });

  it("respeta la presentación pedida", () => {
    expect(
      buildManifestCode({ f120_id: 185325, um: "P25", siesaRows: filas }),
    ).toBe("185325P25");
  });

  it("nunca emite el f120_id pelado aunque esté en la tabla", () => {
    // "185325" ES una fila de SIESA, pero es el ítem, no un código de barras.
    const soloItem = [
      { f120_id: 185325, codigo_barras: "185325", unidad_medida: "UND" },
    ];
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", siesaRows: soloItem }),
    ).toBeNull();
  });

  it("usa el EAN cuando la presentación no tiene SKU+UM", () => {
    const soloEan = [
      { f120_id: 185325, codigo_barras: "185325", unidad_medida: "UND" },
      { f120_id: 185325, codigo_barras: "7702004009999", unidad_medida: "UND" },
    ];
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", siesaRows: soloEan }),
    ).toBe("7702004009999");
  });

  it("NO inventa un código que el producto no tiene", () => {
    // Sin filas no hay nada que emitir: antes fabricaba "185325UND" y la caja
    // lo rechazaba.
    expect(buildManifestCode({ f120_id: 185325, um: "UND", siesaRows: [] })).toBeNull();
  });

  it("no toma prestado el código de otro producto", () => {
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", siesaRows: [filas[4]] }),
    ).toBeNull();
  });

  it("acepta el código ya resuelto del ítem como último recurso", () => {
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", barcode: "7702004009999" }),
    ).toBe("7702004009999");
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", barcode: "185325UND" }),
    ).toBe("185325UND");
  });

  it("descarta un ítem pelado también en el último recurso", () => {
    expect(
      buildManifestCode({ f120_id: 185325, um: "UND", barcode: "185325" }),
    ).toBeNull();
  });

  it("sin f120_id numérico y sin código utilizable devuelve null", () => {
    expect(buildManifestCode({ f120_id: "SIN-SKU", um: "UND", barcode: "" })).toBeNull();
  });
});

// ---------------------------------------------------------------------
// REGRESIÓN — el prefijo GS1 de báscula sale de SIESA, no se fabrica
// ---------------------------------------------------------------------
describe("REGRESIÓN — findGs1Base / buildWeighableCode no inventan códigos", () => {
  // Caso real: Naranja Extra Kilo, f120 5073. El manifiesto construía
  // "29" + SKU = 2950730..., pero SIESA guarda 2900061. Ese prefijo no
  // existía y la caja no podía resolver la línea.
  const filas = [
    { f120_id: 5073, codigo_barras: "0050730050730", unidad_medida: "KL" },
    { f120_id: 5073, codigo_barras: "61", unidad_medida: "KL" },
    { f120_id: 5073, codigo_barras: "5073+", unidad_medida: "KL" },
    { f120_id: 5073, codigo_barras: "5073KL", unidad_medida: "KL" },
    { f120_id: 5073, codigo_barras: "2900061", unidad_medida: "KL" },
    { f120_id: 999, codigo_barras: "2900082", unidad_medida: "KL" },
  ];

  it("encuentra la base real de SIESA, no la fabricada desde el SKU", () => {
    expect(findGs1Base(filas, 5073)).toBe("2900061");
    expect(findGs1Base(filas, 5073)).not.toBe("2950730");
  });

  it("no toma prestada la base de otro producto", () => {
    expect(findGs1Base(filas, 12345)).toBeNull();
  });

  it("devuelve null si el producto no tiene base 29", () => {
    expect(findGs1Base([filas[0], filas[1]], 5073)).toBeNull();
    // Sin base no se emite nada: el manifiesto lo reporta para digitar.
  });

  it("ignora códigos que empiezan en 29 pero no son prefijo de 7", () => {
    const raros = [
      { f120_id: 7, codigo_barras: "2900061123456", unidad_medida: "KL" },
      { f120_id: 7, codigo_barras: "2998UND", unidad_medida: "UND" },
    ];
    expect(findGs1Base(raros, 7)).toBeNull();
  });

  it("arma el EAN-13 de peso variable con dígito verificador válido", () => {
    const code = buildWeighableCode("2900061", 1.5);
    expect(code).toHaveLength(13);
    expect(code.startsWith("2900061")).toBe(true);
    expect(code.slice(7, 12)).toBe("01500"); // 1.5 kg = 1500 g
  });

  it("el dígito verificador es el estándar GS1", () => {
    // 2900061 + 01500 -> se recalcula y debe coincidir
    const code = buildWeighableCode("2900061", 1.5);
    const cuerpo = code.slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cuerpo[i], 10) * ((12 - i) % 2 === 1 ? 3 : 1);
    }
    expect(code[12]).toBe(String((10 - (sum % 10)) % 10));
  });

  it("rechaza una base inválida en vez de emitir basura", () => {
    expect(buildWeighableCode("2950730123", 1)).toBeNull();
    expect(buildWeighableCode("", 1)).toBeNull();
    expect(buildWeighableCode(null, 1)).toBeNull();
  });

  it("rechaza pesos imposibles", () => {
    expect(buildWeighableCode("2900061", 0)).toBeNull();
    expect(buildWeighableCode("2900061", -1)).toBeNull();
    expect(buildWeighableCode("2900061", 200)).toBeNull(); // 200 kg > 99999 g
  });
});
