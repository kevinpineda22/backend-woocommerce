import { describe, it, expect } from 'vitest';
import { detectMeat, detectFruver } from './categoryDetection';

// =============================================
// Tests para categoryDetection.js (PRODUCCIÓN)
//
// Reglas:
//   1. unidad_medida decide si es pesable
//   2. Categorías solo distinguen carne vs fruver
//   3. Pesable + categoría carne → carnicería
//   4. Pesable + NO categoría carne → fruver
//   5. NO pesable → ni carne ni fruver
// =============================================

// --- Helpers ---

const meatItem = (categorias, unidad = 'LB') => ({
  categorias_reales: categorias,
  unidad_medida: unidad,
});

const fruverItem = (unidad = 'KG', categorias = ['Fruver']) => ({
  categorias_reales: categorias,
  unidad_medida: unidad,
});

const normalItem = (categorias = ['Abarrotes'], unidad = 'UND') => ({
  categorias_reales: categorias,
  unidad_medida: unidad,
});

// =============================================
// detectMeat
// =============================================

describe('detectMeat', () => {
  describe('debería detectar carnicería (pesable + categoría carne)', () => {
    it('Carnicería con LB', () => {
      expect(detectMeat(meatItem(['Carnicería']))).toBe(true);
    });

    it('Pollo con KG', () => {
      expect(detectMeat(meatItem(['Pollo'], 'KG'))).toBe(true);
    });

    it('Pescadería con LIBRA', () => {
      expect(detectMeat(meatItem(['Pescadería'], 'LIBRA'))).toBe(true);
    });

    it('Carnes y Embutidos con kilo', () => {
      expect(detectMeat(meatItem(['Carnes y Embutidos'], 'kilo'))).toBe(true);
    });

    it('múltiples categorías, una de carne', () => {
      expect(detectMeat(meatItem(['Ofertas', 'Pollo', 'Destacados']))).toBe(true);
    });
  });

  describe('debería detectar por distintos formatos de categorías', () => {
    it('categorias (array de {name})', () => {
      const item = {
        categorias: [{ name: 'Carnicería' }],
        unidad_medida: 'LB',
      };
      expect(detectMeat(item)).toBe(true);
    });

    it('categories (SubstituteModal)', () => {
      const item = {
        categories: [{ name: 'Pollo' }],
        unidad_medida: 'LB',
      };
      expect(detectMeat(item)).toBe(true);
    });
  });

  describe('debería detectar todos los keywords de carne', () => {
    const keywords = [
      'carne', 'carnes', 'pollo', 'pollos', 'pescado', 'pescados',
      'res', 'cerdo', 'carnicería', 'carniceria', 'embutido', 'embutidos',
      'chorizo', 'pezuña', 'costilla', 'chuleta', 'lomo', 'tocino',
      'morrillo', 'pechuga', 'alas', 'salchicha', 'salchichas',
      'pescaderia', 'pescadería', 'marisco', 'mariscos',
      'camaron', 'camarones',
    ];

    keywords.forEach((keyword) => {
      it(`keyword: "${keyword}"`, () => {
        expect(detectMeat(meatItem([keyword]))).toBe(true);
      });
    });
  });

  describe('NO debería detectar como carnicería', () => {
    it('categoría de carne PERO sin unidad pesable (UND)', () => {
      expect(detectMeat({ categorias_reales: ['Carnicería'], unidad_medida: 'UND' })).toBe(false);
    });

    it('categoría de carne SIN unidad de medida', () => {
      expect(detectMeat({ categorias_reales: ['Carnicería'] })).toBe(false);
    });

    it('unidad pesable PERO sin categoría de carne', () => {
      expect(detectMeat(fruverItem('KG', ['Fruver']))).toBe(false);
    });

    it('producto normal (Abarrotes, UND)', () => {
      expect(detectMeat(normalItem())).toBe(false);
    });

    it('item null', () => {
      expect(detectMeat(null)).toBe(false);
    });

    it('item vacío', () => {
      expect(detectMeat({})).toBe(false);
    });
  });
});

// =============================================
// detectFruver
// =============================================

describe('detectFruver', () => {
  describe('debería detectar fruver (pesable + NO carne)', () => {
    it('Fruver con KG', () => {
      expect(detectFruver(fruverItem('KG'))).toBe(true);
    });

    it('Frutas con kg (minúscula)', () => {
      expect(detectFruver(fruverItem('kg', ['Frutas']))).toBe(true);
    });

    it('Verduras con kilo', () => {
      expect(detectFruver(fruverItem('kilo', ['Verduras']))).toBe(true);
    });

    it('con LB (también es pesable)', () => {
      expect(detectFruver(fruverItem('LB', ['Fruver']))).toBe(true);
    });

    it('con LIBRA', () => {
      expect(detectFruver(fruverItem('LIBRA', ['Hortalizas']))).toBe(true);
    });

    it('con kl', () => {
      expect(detectFruver(fruverItem('kl', ['Legumbres']))).toBe(true);
    });
  });

  describe('debería detectar como fruver: pesable sin categoría específica', () => {
    it('categoría "Ofertas" con KG → fruver (no es carne)', () => {
      expect(detectFruver({ categorias_reales: ['Ofertas'], unidad_medida: 'KG' })).toBe(true);
    });

    it('sin categorías pero con KG → fruver', () => {
      expect(detectFruver({ unidad_medida: 'KG' })).toBe(true);
    });
  });

  describe('CARNICERÍA tiene prioridad sobre fruver', () => {
    it('pesable + categoría carne → NO es fruver', () => {
      expect(detectFruver(meatItem(['Carnicería']))).toBe(false);
    });

    it('KG + categoría carne → NO es fruver', () => {
      expect(detectFruver(meatItem(['Pollo'], 'KG'))).toBe(false);
    });
  });

  describe('NO debería detectar como fruver', () => {
    it('AZUCAR X 1 KG con unidad UND → NO es fruver', () => {
      const item = {
        name: 'AZUCAR X 1 KG',
        categorias_reales: ['Abarrotes', 'Granos'],
        unidad_medida: 'UND',
      };
      expect(detectFruver(item)).toBe(false);
    });

    it('ARROZ X 5 KG con unidad UND → NO es fruver', () => {
      const item = {
        name: 'ARROZ X 5 KG',
        categorias_reales: ['Abarrotes'],
        unidad_medida: 'UND',
      };
      expect(detectFruver(item)).toBe(false);
    });

    it('producto con unidad LITRO', () => {
      expect(detectFruver({ unidad_medida: 'LITRO' })).toBe(false);
    });

    it('producto con unidad UND', () => {
      expect(detectFruver({ unidad_medida: 'UND' })).toBe(false);
    });

    it('producto sin unidad de medida', () => {
      expect(detectFruver({ categorias_reales: ['Fruver'] })).toBe(false);
    });

    it('item null', () => {
      expect(detectFruver(null)).toBe(false);
    });

    it('item vacío', () => {
      expect(detectFruver({})).toBe(false);
    });
  });
});

// =============================================
// Reglas de negocio
// =============================================

describe('Clasificación mutuamente excluyente', () => {
  it('un producto NUNCA debería ser carne Y fruver a la vez', () => {
    const items = [
      meatItem(['Carnicería']),
      meatItem(['Pollo'], 'KG'),
      fruverItem('KG', ['Fruver']),
      fruverItem('LB', ['Frutas']),
      normalItem(),
      { unidad_medida: 'KG' },
      {},
    ];

    items.forEach((item) => {
      expect(detectMeat(item) && detectFruver(item)).toBe(false);
    });
  });
});

describe('Productos NO pesables nunca son carne ni fruver', () => {
  it('producto con categoría carne pero unidad UND', () => {
    const item = { categorias_reales: ['Carnicería'], unidad_medida: 'UND' };
    expect(detectMeat(item)).toBe(false);
    expect(detectFruver(item)).toBe(false);
  });

  it('producto con categoría fruver pero sin unidad', () => {
    const item = { categorias_reales: ['Fruver'] };
    expect(detectMeat(item)).toBe(false);
    expect(detectFruver(item)).toBe(false);
  });

  it('producto sin unidad de medida', () => {
    expect(detectMeat({ name: 'Pollo asado' })).toBe(false);
    expect(detectFruver({ name: 'Manzana' })).toBe(false);
  });
});
