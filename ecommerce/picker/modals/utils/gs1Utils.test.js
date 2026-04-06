import { describe, it, expect } from 'vitest';
import {
  calcularDigitoVerificador,
  isGS1Variable,
  extractGS1Prefix,
  extractGS1Sku,
  extractWeightFromGS1,
  toKgForValidation,
  validateWeightTolerance,
  GS1_WEIGHT_TOLERANCE_KG,
} from './gs1Utils';

// =============================================
// Tests para el código REAL de producción
// gs1Utils.js — usado por WeightModal.jsx
// =============================================

describe('calcularDigitoVerificador', () => {
  it('debería calcular el check digit para un código fruver de 12 dígitos', () => {
    // Item 5106, código SIESA "2900089", peso 500g
    // 2900089 + 00500 = 290008900500 (12 dígitos) → check = 3
    expect(calcularDigitoVerificador('290008900500')).toBe('3');
  });

  it('debería calcular el check digit para un código carnicería de 12 dígitos', () => {
    // Item 15134, código SIESA "2915134", peso 1000g
    // 2915134 + 01000 = 291513401000 (12 dígitos)
    expect(calcularDigitoVerificador('291513401000')).not.toBeNull();
  });

  it('debería calcular el check digit para un código de 13 dígitos (EAN-14)', () => {
    expect(calcularDigitoVerificador('2900089005003')).not.toBeNull();
  });

  it('debería retornar null para códigos muy cortos (< 12)', () => {
    expect(calcularDigitoVerificador('29000890050')).toBeNull();
  });

  it('debería retornar null para códigos muy largos (> 13)', () => {
    expect(calcularDigitoVerificador('29000890050031')).toBeNull();
  });

  it('debería retornar null para códigos con letras', () => {
    expect(calcularDigitoVerificador('29000890050a')).toBeNull();
  });

  it('debería retornar un dígito entre 0 y 9', () => {
    const result = calcularDigitoVerificador('290008900500');
    expect(Number(result)).toBeGreaterThanOrEqual(0);
    expect(Number(result)).toBeLessThanOrEqual(9);
  });
});

describe('isGS1Variable', () => {
  it('debería retornar true para EAN-13 que empieza con 2', () => {
    expect(isGS1Variable('2900089005003')).toBe(true);
    expect(isGS1Variable('2915134010001')).toBe(true);
  });

  it('debería retornar true para EAN-14 que empieza con 2', () => {
    expect(isGS1Variable('29001340050031')).toBe(true);
  });

  it('debería retornar false para códigos que no empiezan con 2', () => {
    expect(isGS1Variable('5901234567890')).toBe(false);
    expect(isGS1Variable('1234567890123')).toBe(false);
  });

  it('debería retornar false para longitud incorrecta', () => {
    expect(isGS1Variable('290008900500')).toBe(false);   // 12 dígitos
    expect(isGS1Variable('290008900')).toBe(false);       // 9 dígitos
    expect(isGS1Variable('290013400500312')).toBe(false); // 15 dígitos
  });

  it('debería retornar false para input vacío o null', () => {
    expect(isGS1Variable('')).toBe(false);
    expect(isGS1Variable(null)).toBe(false);
    expect(isGS1Variable(undefined)).toBe(false);
  });

  it('debería retornar false para códigos con caracteres no numéricos', () => {
    expect(isGS1Variable('290008900500a')).toBe(false);
  });
});

describe('extractGS1Prefix', () => {
  it('debería extraer los primeros 7 dígitos', () => {
    expect(extractGS1Prefix('2900089005003')).toBe('2900089');
    expect(extractGS1Prefix('2915134010001')).toBe('2915134');
  });

  it('debería funcionar igual para EAN-13 y EAN-14', () => {
    // Siempre son los primeros 7 dígitos
    expect(extractGS1Prefix('29001340050031')).toBe('2900134');
  });
});

describe('extractGS1Sku', () => {
  it('debería extraer el item/PLU (posiciones 2-7) para fruver', () => {
    // Item 5106 → código SIESA tiene "00089" en posiciones 2-7
    expect(extractGS1Sku('2900089005003')).toBe('00089');
  });

  it('debería extraer el item/PLU para carnicería', () => {
    // Item 15134 → "15134" en posiciones 2-7
    expect(extractGS1Sku('2915134010001')).toBe('15134');
  });
});

describe('extractWeightFromGS1', () => {
  describe('EAN-13 (13 dígitos)', () => {
    it('debería extraer peso en Kg desde posiciones 7-12', () => {
      // 2900089 | 00500 | 3 → 500 gramos = 0.5 Kg
      expect(extractWeightFromGS1('2900089005003')).toBeCloseTo(0.5);
    });

    it('debería extraer 1 Kg (1000 gramos)', () => {
      // 2900089 | 01000 | X → 1000 gramos = 1.0 Kg
      const sinCheck = '290008901000';
      const check = calcularDigitoVerificador(sinCheck);
      const barcode = sinCheck + check;
      expect(extractWeightFromGS1(barcode)).toBeCloseTo(1.0);
    });

    it('debería extraer 1 libra (500 gramos) como 0.5 Kg', () => {
      // Picker digita 500g → 0.5 Kg
      expect(extractWeightFromGS1('2900089005003')).toBeCloseTo(0.5);
    });

    it('debería extraer peso grande (12.5 Kg = 12500g)', () => {
      const sinCheck = '290008912500';
      const check = calcularDigitoVerificador(sinCheck);
      const barcode = sinCheck + check;
      expect(extractWeightFromGS1(barcode)).toBeCloseTo(12.5);
    });
  });

  it('debería retornar 0 para códigos no GS1', () => {
    expect(extractWeightFromGS1('5901234567890')).toBe(0);
    expect(extractWeightFromGS1('1234567890123')).toBe(0);
  });

  it('debería retornar 0 para peso cero en el barcode', () => {
    // 2900089 | 00000 | X → 0 gramos
    const sinCheck = '290008900000';
    const check = calcularDigitoVerificador(sinCheck);
    const barcode = sinCheck + check;
    expect(extractWeightFromGS1(barcode)).toBe(0);
  });

  it('debería retornar 0 para input inválido', () => {
    expect(extractWeightFromGS1('')).toBe(0);
    expect(extractWeightFromGS1('abc')).toBe(0);
    expect(extractWeightFromGS1('2900089')).toBe(0);
  });
});

describe('toKgForValidation', () => {
  it('debería retornar el mismo valor para KG', () => {
    expect(toKgForValidation(2, 'KG')).toBe(2);
    expect(toKgForValidation(1.5, 'Kg')).toBe(1.5);
  });

  it('debería dividir por 2 para LB (libras)', () => {
    // 1 LB ≈ 0.5 Kg en la lógica del sistema
    expect(toKgForValidation(2, 'LB')).toBe(1);
    expect(toKgForValidation(1, 'LIBRA')).toBe(0.5);
  });

  it('debería tratar unidad null/undefined como KG', () => {
    expect(toKgForValidation(3, null)).toBe(3);
    expect(toKgForValidation(3, undefined)).toBe(3);
  });
});

describe('validateWeightTolerance', () => {
  it('debería aceptar peso exacto', () => {
    const result = validateWeightTolerance(0.5, 0.5);
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('debería aceptar peso dentro de tolerancia (+50g)', () => {
    // Solicitado: 0.5 Kg, real: 0.545 Kg (dentro de ±0.05)
    const result = validateWeightTolerance(0.545, 0.5);
    expect(result.valid).toBe(true);
  });

  it('debería aceptar peso dentro de tolerancia (-50g)', () => {
    // Solicitado: 0.5 Kg, real: 0.455 Kg (dentro de ±0.05)
    const result = validateWeightTolerance(0.455, 0.5);
    expect(result.valid).toBe(true);
  });

  it('debería rechazar peso por encima de la tolerancia', () => {
    // Solicitado: 0.5 Kg, real: 0.560 Kg (excede +0.05)
    const result = validateWeightTolerance(0.560, 0.5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Máximo permitido');
  });

  it('debería rechazar peso por debajo de la tolerancia', () => {
    // Solicitado: 0.5 Kg, real: 0.440 Kg (excede -0.05)
    const result = validateWeightTolerance(0.440, 0.5);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Mínimo permitido');
  });

  it('debería aceptar peso en el límite exacto de tolerancia', () => {
    // Solicitado: 1.0 Kg, real: 1.05 Kg (exactamente en el borde)
    const result = validateWeightTolerance(1.05, 1.0);
    expect(result.valid).toBe(true);
  });

  it('la tolerancia debería ser ±50g (0.05 Kg)', () => {
    expect(GS1_WEIGHT_TOLERANCE_KG).toBe(0.05);
  });
});

describe('Flujo completo: Fruver (construir barcode)', () => {
  it('debería simular el flujo completo del WeightModal para fruver', () => {
    // Simula: Item 5106, código SIESA "2900089", picker digita 500g
    const prefix = '2900089';
    const pesoDigitado = 500;

    // 1. Pad del peso a 5 dígitos
    const pesoStr = Math.round(pesoDigitado).toString().padStart(5, '0');
    expect(pesoStr).toBe('00500');

    // 2. Concatenar sin check digit
    const sinCheck = `${prefix}${pesoStr}`;
    expect(sinCheck).toBe('290008900500');
    expect(sinCheck.length).toBe(12);

    // 3. Calcular check digit
    const check = calcularDigitoVerificador(sinCheck);
    expect(check).toBe('3');

    // 4. Barcode final
    const barcodeFinal = `${sinCheck}${check}`;
    expect(barcodeFinal).toBe('2900089005003');
    expect(barcodeFinal.length).toBe(13);

    // 5. Verificar que es GS1 variable válido
    expect(isGS1Variable(barcodeFinal)).toBe(true);

    // 6. Extraer peso del barcode generado (debe ser el mismo)
    const pesoExtraido = extractWeightFromGS1(barcodeFinal);
    expect(pesoExtraido).toBeCloseTo(0.5); // 500g = 0.5 Kg

    // 7. Extraer prefix y SKU
    expect(extractGS1Prefix(barcodeFinal)).toBe('2900089');
    expect(extractGS1Sku(barcodeFinal)).toBe('00089');
  });
});

describe('Flujo completo: Carnicería (escanear y validar)', () => {
  it('debería simular el flujo completo del WeightModal para carnicería', () => {
    // Simula: Item 15134, la báscula generó la etiqueta, picker la escanea
    const etiquetaEscaneada = '2915134010001';

    // 1. Validar que es GS1 variable
    expect(isGS1Variable(etiquetaEscaneada)).toBe(true);

    // 2. Extraer el prefix para validar contra el producto esperado
    const prefix = extractGS1Prefix(etiquetaEscaneada);
    expect(prefix).toBe('2915134');

    // 3. Extraer el SKU/PLU para comparar con el item del pedido
    const sku = extractGS1Sku(etiquetaEscaneada);
    expect(sku).toBe('15134');

    // 4. Validar que el SKU coincide con el item esperado
    const itemEsperado = '15134';
    const skuMatch = sku === itemEsperado || parseInt(sku).toString() === itemEsperado;
    expect(skuMatch).toBe(true);

    // 5. Extraer peso de la etiqueta (la báscula lo puso)
    const pesoKg = extractWeightFromGS1(etiquetaEscaneada);
    expect(pesoKg).toBeCloseTo(1.0); // 01000g = 1.0 Kg
  });

  it('debería rechazar etiqueta de producto incorrecto', () => {
    // Picker escanea etiqueta de item 15134, pero el pedido pide item 15200
    const etiquetaEscaneada = '2915134010001';
    const itemEsperado = '15200';

    const sku = extractGS1Sku(etiquetaEscaneada);
    const skuMatch = sku === itemEsperado || parseInt(sku).toString() === itemEsperado;
    expect(skuMatch).toBe(false); // NO coincide → picker debe buscar el producto correcto
  });
});
