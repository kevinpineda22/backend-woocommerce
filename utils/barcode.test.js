import { describe, it, expect } from 'vitest';
import {
  isWeighableBarcode,
  isValidEAN13,
  calcularDigitoVerificador,
  extractGS1Prefix,
  extractItemCode,
  extractWeight,
  buildFruverBarcode,
} from './barcode';

describe('isWeighableBarcode', () => {
  it('debería retornar true para barcodes que empiezan con 29', () => {
    expect(isWeighableBarcode('2900089005003')).toBe(true);
    expect(isWeighableBarcode('2915134005001')).toBe(true);
  });

  it('debería retornar false para barcodes que no empiezan con 29', () => {
    expect(isWeighableBarcode('5901234567890')).toBe(false);
    expect(isWeighableBarcode('1234567890123')).toBe(false);
  });

  it('debería retornar false para input inválido', () => {
    expect(isWeighableBarcode(null)).toBe(false);
    expect(isWeighableBarcode(undefined)).toBe(false);
    expect(isWeighableBarcode('')).toBe(false);
    expect(isWeighableBarcode(12345)).toBe(false);
  });
});

describe('isValidEAN13', () => {
  it('debería retornar true para EAN-13 válidos (13 dígitos)', () => {
    expect(isValidEAN13('2900089005003')).toBe(true);
    expect(isValidEAN13('5901234567890')).toBe(true);
  });

  it('debería retornar false para longitud incorrecta', () => {
    expect(isValidEAN13('290008900500')).toBe(false);  // 12 dígitos
    expect(isValidEAN13('29000890050031')).toBe(false); // 14 dígitos
  });

  it('debería retornar false para caracteres no numéricos', () => {
    expect(isValidEAN13('290008900500a')).toBe(false);
    expect(isValidEAN13('29000890050-3')).toBe(false);
  });

  it('debería retornar false para input inválido', () => {
    expect(isValidEAN13(null)).toBe(false);
    expect(isValidEAN13(undefined)).toBe(false);
    expect(isValidEAN13('')).toBe(false);
    expect(isValidEAN13(2900089005003)).toBe(false);
  });
});

describe('calcularDigitoVerificador', () => {
  it('debería calcular el dígito verificador correctamente', () => {
    // 2900089 + 00500 = 290008900500 (12 dígitos) → check = 3
    expect(calcularDigitoVerificador('290008900500')).toBe('3');
  });

  it('debería retornar null para input con longitud != 12', () => {
    expect(calcularDigitoVerificador('29000890050')).toBe(null);   // 11
    expect(calcularDigitoVerificador('2900089005003')).toBe(null); // 13
  });

  it('debería retornar null para input inválido', () => {
    expect(calcularDigitoVerificador(null)).toBe(null);
    expect(calcularDigitoVerificador('')).toBe(null);
    expect(calcularDigitoVerificador('29000890050a')).toBe(null);
  });
});

describe('extractGS1Prefix', () => {
  it('debería extraer los primeros 7 dígitos del barcode', () => {
    expect(extractGS1Prefix('2900089005003')).toBe('2900089');
    expect(extractGS1Prefix('2915134010001')).toBe('2915134');
  });

  it('debería retornar null para barcodes inválidos', () => {
    expect(extractGS1Prefix('5901234567890')).toBe(null); // no empieza con 29
    expect(extractGS1Prefix('2900089')).toBe(null);       // no es EAN-13
    expect(extractGS1Prefix(null)).toBe(null);
  });
});

describe('extractItemCode', () => {
  it('debería extraer el código de item (5 dígitos después de "29")', () => {
    // Item 5106 → código SIESA "00089"
    expect(extractItemCode('2900089005003')).toBe('00089');
    // Item 15134
    expect(extractItemCode('2915134010001')).toBe('15134');
  });

  it('debería retornar null para barcodes inválidos', () => {
    expect(extractItemCode('5901234567890')).toBe(null);
    expect(extractItemCode(null)).toBe(null);
  });
});

describe('extractWeight', () => {
  it('debería extraer el peso en gramos (posiciones 7-11)', () => {
    // 2900089 | 00500 | 3 → peso = 500 gramos
    expect(extractWeight('2900089005003')).toBe(500);
    // 2915134 | 01000 | X → peso = 1000 gramos
    expect(extractWeight('2915134010001')).toBe(1000);
  });

  it('debería retornar 0 si el peso es cero', () => {
    expect(extractWeight('2900089000003')).toBe(0);
  });

  it('debería retornar null para barcodes que no empiezan con 29', () => {
    expect(extractWeight('5901234567890')).toBe(null);
  });

  it('debería retornar null para EAN-13 inválidos', () => {
    expect(extractWeight('29000890050')).toBe(null);     // muy corto
    expect(extractWeight('290008900500312')).toBe(null);  // muy largo
  });

  it('debería retornar null para input inválido', () => {
    expect(extractWeight(null)).toBe(null);
    expect(extractWeight(undefined)).toBe(null);
    expect(extractWeight('')).toBe(null);
    expect(extractWeight(2900089005003)).toBe(null);
  });
});

describe('buildFruverBarcode', () => {
  it('debería construir un EAN-13 válido a partir de prefijo y peso', () => {
    // Prefijo "2900089", peso 500g → "2900089" + "00500" + check digit
    const result = buildFruverBarcode('2900089', 500);
    expect(result).toBe('2900089005003');
    expect(result.length).toBe(13);
  });

  it('debería rellenar el peso con ceros a la izquierda', () => {
    // Peso 50g → "00050"
    const result = buildFruverBarcode('2900089', 50);
    expect(result).toMatch(/^290008900050\d$/);
    expect(result.length).toBe(13);
  });

  it('debería manejar pesos grandes', () => {
    // Peso 12500g (12.5 kg) → "2900089" + "12500" + check
    const result = buildFruverBarcode('2900089', 12500);
    expect(result).toBe('2900089125008');
    expect(result.length).toBe(13);
  });

  it('debería retornar null para prefijo inválido', () => {
    expect(buildFruverBarcode('290008', 500)).toBe(null);    // 6 dígitos
    expect(buildFruverBarcode('5900089', 500)).toBe(null);   // no empieza con 29
    expect(buildFruverBarcode(null, 500)).toBe(null);
    expect(buildFruverBarcode('', 500)).toBe(null);
  });

  it('debería retornar null para peso inválido', () => {
    expect(buildFruverBarcode('2900089', -1)).toBe(null);
    expect(buildFruverBarcode('2900089', 100000)).toBe(null); // > 99999
    expect(buildFruverBarcode('2900089', 'abc')).toBe(null);
  });

  it('el barcode generado debería ser reversible con extractWeight', () => {
    const barcode = buildFruverBarcode('2915134', 750);
    expect(extractWeight(barcode)).toBe(750);
    expect(extractGS1Prefix(barcode)).toBe('2915134');
    expect(extractItemCode(barcode)).toBe('15134');
  });
});
