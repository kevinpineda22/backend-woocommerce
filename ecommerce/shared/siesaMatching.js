/**
 * ⚠️ ESPEJO ESM de `utils/siesaMatching.js` del backend (CommonJS).
 *    Guardado por `utils/siesaMatching.sync.test.js` en el repo backend:
 *    si las dos copias divergen, ese test falla. Al editar una, editá la otra.
 *
 * FUENTE ÚNICA DE VERDAD para resolver un código escaneado contra SIESA.
 *
 * Antes esta lógica estaba copiada en cuatro lugares con cuatro reglas
 * distintas (`_validateSiesaCode`, `loadBarcodesForAudit`, `auditBarcodeMap`,
 * `getBarcodesFromSiesaByUnitMeasure`). Cada copia normalizaba distinto y
 * cada divergencia trababa a un auditor frente a un producto correcto.
 *
 * ══════════════════════════════════════════════════════════════════
 * LAS TRES REGLAS QUE SOSTIENEN ESTE MÓDULO
 * ══════════════════════════════════════════════════════════════════
 *
 * 1. EL f120_id MANDA. La unidad de medida NO bloquea salvo que sea un
 *    dato real. Cuando la UM esperada viene de `inferUnitMeasureFromName`
 *    (una adivinanza sobre el nombre del producto) NO puede invalidar un
 *    código que apunta al producto correcto: devuelve `advertencia`.
 *
 * 2. UN CÓDIGO PUEDE ESTAR EN VARIAS FILAS. El mismo EAN registrado para
 *    UND y para KL es normal en SIESA. Nunca usar `.single()`: se evalúan
 *    TODAS las coincidencias y basta con que una apunte al producto.
 *
 * 3. EL '+' NO EXISTE PARA EL LECTOR. SIESA guarda algunos códigos con '+'
 *    final; ninguna etiqueta física lo tiene. Se normaliza SIEMPRE de los
 *    dos lados antes de comparar.
 *
 * Módulo PURO: sin I/O, sin supabase. Recibe las filas ya consultadas.
 */

import { isWeighableUnit } from "./weighableUnits.js";

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------

/**
 * Normaliza un código de barras para comparación: trim, mayúsculas y
 * sin el '+' final que usa SIESA. Es la ÚNICA forma válida de comparar
 * dos códigos en todo el sistema.
 * @param {string|number} code
 * @returns {string}
 */
function normalizeBarcode(code) {
  if (code === null || code === undefined) return "";
  return code.toString().trim().toUpperCase().replace(/\+$/, "");
}

/**
 * Devuelve las variantes con las que hay que consultar SIESA para un código
 * escaneado: la cruda y la que lleva '+'. Se usa en el `.in()` de supabase.
 * @param {string|number} code
 * @returns {string[]}
 */
function barcodeVariants(code) {
  const clean = normalizeBarcode(code);
  if (!clean) return [];
  return [clean, `${clean}+`];
}

/**
 * Normaliza una unidad de medida al formato canónico de SIESA.
 * @param {string} um
 * @returns {string} UND | KL | LB | P6 | ... | DEFAULT
 */
function normalizeUM(um) {
  const n = (um || "").toString().toUpperCase().trim();
  if (n === "UN" || n === "UNIDAD") return "UND";
  if (n === "KG" || n === "KILO") return "KL";
  if (n === "LB" || n === "LIBRA") return "LB";
  if (n === "" || n === "NULL" || n === "DEFAULT") return "DEFAULT";
  return n;
}

// ---------------------------------------------------------------------
// Clasificación del input
// ---------------------------------------------------------------------

/**
 * Parsea un código con formato SKU+UM ("185325P25" → { f120_id, um }).
 * @param {string} code
 * @returns {{ f120_id: number, um: string }|null}
 */
function parseSkuUm(code) {
  const clean = normalizeBarcode(code);
  const m = clean.match(/^(\d+)([A-Z]+\d*)$/);
  if (!m) return null;
  return { f120_id: parseInt(m[1], 10), um: normalizeUM(m[2]) };
}

/**
 * ¿El input es un f120_id pelado? (solo dígitos, corto para ser un EAN).
 * Un EAN real tiene 8+ dígitos; un f120_id de este catálogo tiene 1-7.
 * @param {string} code
 * @returns {boolean}
 */
function isPlainF120(code) {
  return /^\d{1,7}$/.test(normalizeBarcode(code));
}

/**
 * ¿El input es un GS1 de peso variable? (13-14 dígitos, prefijo "2").
 * @param {string} code
 * @returns {boolean}
 */
function isGS1Variable(code) {
  const clean = normalizeBarcode(code);
  return /^\d{13,14}$/.test(clean) && clean.startsWith("2");
}

/**
 * ¿El input tiene forma de código escaneable? Cualquier cosa que no sea
 * esto es ruido de teclado, no un producto.
 * @param {string} code
 * @returns {boolean}
 */
function isScannableInput(code) {
  const clean = stripMNPrefix(normalizeBarcode(code));
  if (!clean) return false;
  return /^\d{1,}$/.test(clean) || /^\d+[A-Z]+\d*$/.test(clean);
}

/**
 * Quita el prefijo M/N que SIESA usa en algunos códigos internos.
 * Ninguna etiqueta física lo lleva y la caja no lo acepta — el frontend ya
 * hacía `stripMN()` antes de mandar nada al POS. Se contempla acá porque el
 * flujo real es que alguien consulte la base, vea `M7703910061224` y lo
 * dicte tal cual: rechazarlo manda a la persona de vuelta a la base.
 * @param {string} code — ya normalizado
 * @returns {string}
 */
function stripMNPrefix(code) {
  if (!code) return "";
  return /^[MN]\d/.test(code) ? code.substring(1) : code;
}

// ---------------------------------------------------------------------
// Índice de filas SIESA
// ---------------------------------------------------------------------

/**
 * Construye el índice de códigos que consume el auditor.
 *
 * Clave: código NORMALIZADO. Valor: LISTA de presentaciones.
 * Es una lista y no un objeto a propósito: el mapa anterior era last-wins
 * y perdía en silencio la mitad de las filas cuando un EAN estaba
 * registrado para dos unidades de medida.
 *
 * @param {Array<{f120_id:number, codigo_barras:string, unidad_medida:string}>} rows
 * @returns {Object<string, Array<{f120_id:number, unidad_medida:string}>>}
 */
function buildBarcodeIndex(rows) {
  const index = {};
  (rows || []).forEach((row) => {
    const code = normalizeBarcode(row.codigo_barras);
    if (!code) return;
    const entry = {
      f120_id: row.f120_id,
      unidad_medida: normalizeUM(row.unidad_medida),
    };
    if (!index[code]) index[code] = [];
    const dup = index[code].some(
      (e) => e.f120_id === entry.f120_id && e.unidad_medida === entry.unidad_medida,
    );
    if (!dup) index[code].push(entry);
  });
  return index;
}

/**
 * Todas las presentaciones (UM) que SIESA conoce para un f120_id.
 * @param {Array} rows
 * @param {number} f120_id
 * @returns {string[]}
 */
function availableUMsFor(rows, f120_id) {
  const set = new Set();
  (rows || []).forEach((r) => {
    if (r.f120_id === f120_id) set.add(normalizeUM(r.unidad_medida));
  });
  return Array.from(set);
}

// ---------------------------------------------------------------------
// LA decisión
// ---------------------------------------------------------------------

const REASON = {
  EXACT: "exact", // código + presentación coinciden
  PRODUCT_OK_UM_DIFF: "product_ok_um_diff", // producto correcto, UM distinta
  SKU_UM: "sku_um", // se digitó el SKU+UM
  F120_MANUAL: "f120_manual", // se digitó el f120_id (producto sin etiqueta)
  GS1: "gs1", // etiqueta de báscula
  WRONG_PRODUCT: "wrong_product", // el código es de otro producto
  WRONG_UM: "wrong_um", // presentación incorrecta y la UM es confiable
  NOT_FOUND: "not_found", // el código no existe en SIESA
  MALFORMED: "malformed", // el input no parece un código
};

/**
 * Resuelve si un código escaneado corresponde al producto esperado.
 *
 * @param {Object} params
 * @param {string} params.codigo               — lo que se escaneó o digitó
 * @param {number} params.f120_id_esperado     — SKU numérico del producto en pantalla
 * @param {string} params.um_esperada          — unidad de medida esperada
 * @param {boolean} [params.umConfiable=false] — ¿la UM es un DATO o una inferencia?
 *        false → una UM distinta NO bloquea, solo advierte (REGLA 1).
 * @param {Array} params.siesaRows             — filas de siesa_codigos_barras
 *        del f120_id esperado Y de los códigos consultados.
 * @param {boolean} [params.allowF120Manual=true] — permitir digitar el f120_id
 *        para productos sin código de barras pegado.
 *
 * @returns {{valid:boolean, reason:string, message:string,
 *            f120_id:number|null, unidad_medida:string|null,
 *            advertencia:string|null, codigo_existe:boolean}}
 */
function matchScannedCode({
  codigo,
  f120_id_esperado,
  um_esperada,
  umConfiable = false,
  siesaRows = [],
  allowF120Manual = true,
}) {
  const crudo = normalizeBarcode(codigo);
  // Se prueban las dos formas: tal cual y sin el prefijo M/N de SIESA.
  // `crudo` primero, porque el índice puede tener la fila CON la M.
  const clean = crudo;
  const sinMN = stripMNPrefix(crudo);
  const f120Esperado = parseInt(f120_id_esperado, 10);
  const umEsperada = normalizeUM(um_esperada);

  const fail = (reason, message, extra = {}) => ({
    valid: false,
    reason,
    message,
    f120_id: null,
    unidad_medida: null,
    advertencia: null,
    codigo_existe: false,
    ...extra,
  });
  const ok = (reason, message, f120_id, unidad_medida, advertencia = null) => ({
    valid: true,
    reason,
    message,
    f120_id,
    unidad_medida,
    advertencia,
    codigo_existe: true,
  });

  if (!clean || !isScannableInput(clean)) {
    return fail(
      REASON.MALFORMED,
      "Código inválido. Escanea el código de barras del producto.",
    );
  }
  if (isNaN(f120Esperado)) {
    return fail(
      REASON.MALFORMED,
      "Este producto no tiene un SKU numérico: no se puede validar por código.",
    );
  }

  // ── RUTA A: el código está en SIESA (regla 2: TODAS las coincidencias) ──
  const hits = (siesaRows || []).filter((r) => {
    const c = normalizeBarcode(r.codigo_barras);
    return c === clean || c === sinMN || stripMNPrefix(c) === sinMN;
  });

  if (hits.length > 0) {
    const delProducto = hits.filter((h) => h.f120_id === f120Esperado);

    if (delProducto.length === 0) {
      return fail(
        REASON.WRONG_PRODUCT,
        "El código pertenece a un producto diferente.",
        { codigo_existe: true, f120_id_encontrado: hits[0].f120_id },
      );
    }

    const umsDelProducto = delProducto.map((h) => normalizeUM(h.unidad_medida));
    if (umsDelProducto.includes(umEsperada) || umEsperada === "DEFAULT") {
      return ok(
        REASON.EXACT,
        "Código validado correctamente.",
        f120Esperado,
        umsDelProducto.includes(umEsperada) ? umEsperada : umsDelProducto[0],
      );
    }

    // Producto correcto, presentación distinta.
    // REGLA 1: solo bloquea si la UM esperada es un dato real.
    if (umConfiable) {
      return fail(
        REASON.WRONG_UM,
        `El código que escaneaste es para ${umsDelProducto[0]}, pero se esperaba ${umEsperada}.`,
        {
          codigo_existe: true,
          f120_id_coincide: true,
          unidad_medida_encontrada: umsDelProducto[0],
          unidad_medida_esperada: umEsperada,
        },
      );
    }
    return ok(
      REASON.PRODUCT_OK_UM_DIFF,
      "Código validado (producto correcto).",
      f120Esperado,
      umsDelProducto[0],
      `La presentación esperada (${umEsperada}) no es un dato confirmado; SIESA registra ${umsDelProducto.join(", ")}.`,
    );
  }

  // ── RUTA B: GS1 de peso variable — se compara el prefijo de 7 dígitos ──
  if (isGS1Variable(sinMN)) {
    const prefijo = sinMN.substring(0, 7);
    const match = (siesaRows || []).some((r) => {
      if (r.f120_id !== f120Esperado) return false;
      const c = normalizeBarcode(r.codigo_barras);
      return c.startsWith("2") && c.length >= 7 && c.substring(0, 7) === prefijo;
    });
    if (match) {
      return ok(REASON.GS1, "Código GS1 validado correctamente.", f120Esperado, umEsperada);
    }
    return fail(REASON.WRONG_PRODUCT, "El código GS1 no corresponde a este producto.");
  }

  // ── RUTA C: SKU+UM digitado ("185325P25") ──
  const skuUm = parseSkuUm(sinMN);
  if (skuUm) {
    if (skuUm.f120_id !== f120Esperado) {
      return fail(REASON.WRONG_PRODUCT, "El SKU no corresponde a este producto.");
    }
    const umsConocidas = availableUMsFor(siesaRows, f120Esperado);
    if (
      skuUm.um === umEsperada ||
      umEsperada === "DEFAULT" ||
      !umConfiable ||
      umsConocidas.includes(skuUm.um)
    ) {
      const advertencia =
        skuUm.um !== umEsperada && umEsperada !== "DEFAULT"
          ? `Presentación digitada ${skuUm.um}; la esperada era ${umEsperada}.`
          : null;
      return ok(REASON.SKU_UM, "SKU validado correctamente.", f120Esperado, skuUm.um, advertencia);
    }
    return fail(
      REASON.WRONG_UM,
      `Presentación incorrecta: digitaste ${skuUm.um}, pero se esperaba ${umEsperada}.`,
      { codigo_existe: true, f120_id_coincide: true },
    );
  }

  // ── RUTA D: f120_id pelado — la salida para productos SIN etiqueta física ──
  //
  // Sin esto, un producto que no tiene código pegado (bandejas de fruver,
  // empaques propios) es IMPOSIBLE de auditar: no hay nada que escanear.
  // Se permite y se DEJA RASTRO (`reason: f120_manual`) para que quede
  // auditable quién validó a mano y sobre qué producto.
  if (allowF120Manual && isPlainF120(sinMN)) {
    if (parseInt(sinMN, 10) === f120Esperado) {
      return ok(
        REASON.F120_MANUAL,
        "Producto validado por SKU interno (sin código de barras físico).",
        f120Esperado,
        umEsperada === "DEFAULT" ? null : umEsperada,
        "Validado a mano por SKU: este producto no tiene código de barras físico.",
      );
    }
    return fail(REASON.WRONG_PRODUCT, "El SKU no corresponde a este producto.");
  }

  return fail(REASON.NOT_FOUND, "Código no encontrado en el sistema.");
}

// ---------------------------------------------------------------------
// Resolución de la UM esperada — con CONFIANZA explícita
// ---------------------------------------------------------------------

const UM_NAME_PATTERNS = {
  P2: ["DÚO", "DUO", "2UN", "X2", "DUPLO"],
  P3: ["TRÍO", "TRIO", "3UN", "X3", "TRIPLO"],
  P4: ["CUATRO", "4UN", "X4"],
  P6: ["SEIS", "SIX", "6UN", "X6", "SIXPACK"],
  P10: ["DIEZ", "10UN", "X10"],
  P12: ["DOCE", "12UN", "X12", "DOCENA"],
  P18: ["DIECIOCHO", "18UN", "X18"],
  P24: ["VEINTICUATRO", "24UN", "X24"],
  P25: ["PACA", "VEINTICINCO", "25UN", "X25"],
  P30: ["TREINTA", "30UN", "X30"],
  P48: ["48UN", "X48"],
  UND: ["UNIDAD", "UNITARIO", "INDIVIDUAL"],
  KL: ["KILO", "KG"],
  LB: ["LIBRA"],
};

/**
 * Resuelve la unidad de medida de un producto DECLARANDO de dónde salió.
 *
 * El `confiable` es el corazón del fix: cuando es `false`, la UM es una
 * suposición y NO puede invalidar un código (ver REGLA 1). Antes esta
 * distinción existía dentro de `inferUnitMeasureFromName` pero se perdía
 * al salir de la función, y una adivinanza terminaba bloqueando auditorías.
 *
 * @param {Object} params
 * @param {string} [params.umWoo]        — `pa_unidad-de-medida-aproximado` de WooCommerce
 * @param {string} [params.sku]          — SKU del ítem ("15151LB" → LB)
 * @param {string} [params.nombre]       — nombre del producto (para inferir)
 * @param {string[]} [params.umsDisponibles] — UMs que SIESA conoce para el f120_id
 * @returns {{um:string|null, confiable:boolean, fuente:string}}
 */
function resolveExpectedUM({ umWoo, sku, nombre, umsDisponibles = [] }) {
  const disponibles = umsDisponibles.map(normalizeUM).filter((u) => u && u !== "DEFAULT");

  // 1. El sufijo del SKU es el dato más fuerte (mismo criterio que manifestPricing).
  const skuSuffix = (sku || "").toString().trim().toUpperCase().match(/[A-Z]+\d*$/)?.[0];
  if (skuSuffix) {
    const um = normalizeUM(skuSuffix);
    if (disponibles.length === 0 || disponibles.includes(um)) {
      return { um, confiable: true, fuente: "sku" };
    }
  }

  // 2. La UM declarada en WooCommerce, si SIESA la reconoce.
  const umw = normalizeUM(umWoo);
  if (umw && umw !== "DEFAULT") {
    if (disponibles.length === 0 || disponibles.includes(umw)) {
      return { um: umw, confiable: true, fuente: "woo" };
    }
  }

  // 3. SIESA conoce una sola presentación: no hay nada que adivinar.
  if (disponibles.length === 1) {
    return { um: disponibles[0], confiable: true, fuente: "siesa_unica" };
  }

  // 4. Inferencia por nombre: solo es confiable si un keyword hizo match REAL.
  const n = (nombre || "").toUpperCase();
  const dyn =
    n.match(/(?:PACA|PACK|BULTO|BOLSA|CAJA|DISPLAY)\s*(?:X|DE)?\s*(\d+)/i) ||
    n.match(/X\s*(\d+)\s*(?:UN|UND|H|R|\b)/i);
  if (dyn && disponibles.includes(`P${dyn[1]}`)) {
    return { um: `P${dyn[1]}`, confiable: true, fuente: "nombre" };
  }
  for (const [um, kws] of Object.entries(UM_NAME_PATTERNS)) {
    if (disponibles.includes(um) && kws.some((k) => n.includes(k))) {
      return { um, confiable: true, fuente: "nombre" };
    }
  }

  // 5. Sin evidencia. Se elige un default para poder MOSTRAR algo,
  //    pero queda marcado como NO confiable: nunca debe bloquear.
  if (disponibles.length === 0) {
    return { um: umw !== "DEFAULT" ? umw : null, confiable: false, fuente: "ninguna" };
  }
  const fallback = disponibles.includes("UND") ? "UND" : disponibles.slice().sort()[0];
  return { um: fallback, confiable: false, fuente: "fallback" };
}

/**
 * Código para el manifiesto/QR de un ítem. Devuelve `null` cuando no puede
 * construir un código resoluble en el POS, en vez de emitir un f120_id pelado
 * que la caja no reconoce.
 * @param {{f120_id:number|string, um:string, barcode:string}} item
 * @returns {string|null}
 */
function buildManifestCode({ f120_id, um, barcode }) {
  const ean = normalizeBarcode(barcode);
  if (/^\d{8,}$/.test(ean)) return ean;
  const id = parseInt(f120_id, 10);
  if (isNaN(id)) return null;
  const u = normalizeUM(um);
  if (!u || u === "DEFAULT") return null;
  return `${id}${u}`;
}

export {
  REASON,
  normalizeBarcode,
  barcodeVariants,
  normalizeUM,
  parseSkuUm,
  isPlainF120,
  isGS1Variable,
  isScannableInput,
  stripMNPrefix,
  buildBarcodeIndex,
  availableUMsFor,
  matchScannedCode,
  resolveExpectedUM,
  buildManifestCode,
  isWeighableUnit,
};
