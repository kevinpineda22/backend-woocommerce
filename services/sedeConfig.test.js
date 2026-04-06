import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de supabase ANTES de importar sedeConfig
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ data: [], error: null }),
          single: () => ({ data: null, error: null }),
          maybeSingle: () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

const {
  extractSedeFromOrder,
  resolveSedeId,
  invalidateSedeCache,
  WOO_SEDE_META_KEYS,
} = await import('./sedeConfig');

// =============================================
// extractSedeFromOrder — FUNCIÓN CRÍTICA
// Si falla, las órdenes van a la sede INCORRECTA
// =============================================

describe('extractSedeFromOrder', () => {
  describe('debería extraer sede de meta_data del pedido', () => {
    it('campo "_sede"', () => {
      const order = {
        meta_data: [{ key: '_sede', value: 'norte' }],
      };
      expect(extractSedeFromOrder(order)).toBe('norte');
    });

    it('campo "sede"', () => {
      const order = {
        meta_data: [{ key: 'sede', value: 'sur' }],
      };
      expect(extractSedeFromOrder(order)).toBe('sur');
    });

    it('campo "_branch"', () => {
      const order = {
        meta_data: [{ key: '_branch', value: 'sede-centro' }],
      };
      expect(extractSedeFromOrder(order)).toBe('sede-centro');
    });

    it('campo "_pickup_location"', () => {
      const order = {
        meta_data: [{ key: '_pickup_location', value: '42' }],
      };
      expect(extractSedeFromOrder(order)).toBe('42');
    });

    it('campo "_sucursal"', () => {
      const order = {
        meta_data: [{ key: '_sucursal', value: 'principal' }],
      };
      expect(extractSedeFromOrder(order)).toBe('principal');
    });
  });

  describe('debería respetar el orden de prioridad de las keys', () => {
    it('_sede tiene prioridad sobre _branch', () => {
      const order = {
        meta_data: [
          { key: '_branch', value: 'branch-value' },
          { key: '_sede', value: 'sede-value' },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('sede-value');
    });

    it('_branch tiene prioridad sobre _pickup_location', () => {
      const order = {
        meta_data: [
          { key: '_pickup_location', value: 'pickup-value' },
          { key: '_branch', value: 'branch-value' },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('branch-value');
    });
  });

  describe('debería buscar en fee_lines si no hay meta_data', () => {
    it('encuentra sede en fee_lines', () => {
      const order = {
        meta_data: [],
        fee_lines: [
          {
            meta_data: [{ key: '_sede', value: 'fee-sede' }],
          },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('fee-sede');
    });
  });

  describe('debería buscar en shipping_lines como último recurso', () => {
    it('encuentra sede en shipping_lines con pickup_location', () => {
      const order = {
        meta_data: [],
        fee_lines: [],
        shipping_lines: [
          {
            meta_data: [{ key: 'pickup_location', value: 'shipping-sede' }],
          },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('shipping-sede');
    });

    it('encuentra sede en shipping_lines con _pickup_location', () => {
      const order = {
        meta_data: [],
        fee_lines: [],
        shipping_lines: [
          {
            meta_data: [{ key: '_pickup_location', value: 'pickup-123' }],
          },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('pickup-123');
    });

    it('encuentra sede en shipping_lines con key "sede"', () => {
      const order = {
        meta_data: [],
        fee_lines: [],
        shipping_lines: [
          {
            meta_data: [{ key: 'sede', value: 'sede-shipping' }],
          },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('sede-shipping');
    });
  });

  describe('orden de búsqueda: meta_data → fee_lines → shipping_lines', () => {
    it('meta_data tiene prioridad sobre fee_lines y shipping_lines', () => {
      const order = {
        meta_data: [{ key: '_sede', value: 'meta-sede' }],
        fee_lines: [{ meta_data: [{ key: '_sede', value: 'fee-sede' }] }],
        shipping_lines: [{ meta_data: [{ key: 'sede', value: 'ship-sede' }] }],
      };
      expect(extractSedeFromOrder(order)).toBe('meta-sede');
    });

    it('fee_lines tiene prioridad sobre shipping_lines', () => {
      const order = {
        meta_data: [],
        fee_lines: [{ meta_data: [{ key: '_sede', value: 'fee-sede' }] }],
        shipping_lines: [{ meta_data: [{ key: 'sede', value: 'ship-sede' }] }],
      };
      expect(extractSedeFromOrder(order)).toBe('fee-sede');
    });
  });

  describe('debería limpiar el valor extraído', () => {
    it('trim de espacios', () => {
      const order = {
        meta_data: [{ key: '_sede', value: '  norte  ' }],
      };
      expect(extractSedeFromOrder(order)).toBe('norte');
    });

    it('convertir número a string', () => {
      const order = {
        meta_data: [{ key: '_sede', value: 123 }],
      };
      expect(extractSedeFromOrder(order)).toBe('123');
    });
  });

  describe('debería ignorar meta_data vacía o sin valor', () => {
    it('ignora key con value vacío', () => {
      const order = {
        meta_data: [
          { key: '_sede', value: '' },
          { key: '_branch', value: 'valido' },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('valido');
    });

    it('ignora key con value null', () => {
      const order = {
        meta_data: [
          { key: '_sede', value: null },
          { key: 'sede', value: 'valido' },
        ],
      };
      expect(extractSedeFromOrder(order)).toBe('valido');
    });
  });

  describe('debería retornar null cuando no encuentra sede', () => {
    it('pedido sin meta_data relevante', () => {
      const order = {
        meta_data: [{ key: 'otro_campo', value: '123' }],
      };
      expect(extractSedeFromOrder(order)).toBeNull();
    });

    it('pedido con meta_data vacío', () => {
      const order = { meta_data: [] };
      expect(extractSedeFromOrder(order)).toBeNull();
    });

    it('pedido sin meta_data', () => {
      const order = {};
      expect(extractSedeFromOrder(order)).toBeNull();
    });

    it('pedido null', () => {
      expect(extractSedeFromOrder(null)).toBeNull();
    });

    it('pedido undefined', () => {
      expect(extractSedeFromOrder(undefined)).toBeNull();
    });

    it('pedido completamente vacío (sin fee_lines ni shipping_lines)', () => {
      const order = {
        meta_data: [],
        fee_lines: [],
        shipping_lines: [],
      };
      expect(extractSedeFromOrder(order)).toBeNull();
    });
  });

  describe('compatibilidad con plugins WooCommerce', () => {
    it('WCFM Marketplace (_wcfmmp_order_store)', () => {
      const order = {
        meta_data: [{ key: '_wcfmmp_order_store', value: 'store-42' }],
      };
      expect(extractSedeFromOrder(order)).toBe('store-42');
    });

    it('Dokan (_dokan_vendor_id)', () => {
      const order = {
        meta_data: [{ key: '_dokan_vendor_id', value: '99' }],
      };
      expect(extractSedeFromOrder(order)).toBe('99');
    });

    it('YITH (ywraq_vendor_id)', () => {
      const order = {
        meta_data: [{ key: 'ywraq_vendor_id', value: 'vendor-5' }],
      };
      expect(extractSedeFromOrder(order)).toBe('vendor-5');
    });

    it('WC Pickup Store (_wc_pickup_store)', () => {
      const order = {
        meta_data: [{ key: '_wc_pickup_store', value: 'pickup-norte' }],
      };
      expect(extractSedeFromOrder(order)).toBe('pickup-norte');
    });
  });
});

// =============================================
// WOO_SEDE_META_KEYS — Verificar que existan
// =============================================

describe('WOO_SEDE_META_KEYS', () => {
  it('debería ser un array no vacío', () => {
    expect(Array.isArray(WOO_SEDE_META_KEYS)).toBe(true);
    expect(WOO_SEDE_META_KEYS.length).toBeGreaterThan(0);
  });

  it('debería incluir las keys principales', () => {
    expect(WOO_SEDE_META_KEYS).toContain('_sede');
    expect(WOO_SEDE_META_KEYS).toContain('_branch');
    expect(WOO_SEDE_META_KEYS).toContain('_pickup_location');
    expect(WOO_SEDE_META_KEYS).toContain('_sucursal');
  });

  it('debería incluir keys de plugins comunes', () => {
    expect(WOO_SEDE_META_KEYS).toContain('_wcfmmp_order_store');
    expect(WOO_SEDE_META_KEYS).toContain('_dokan_vendor_id');
    expect(WOO_SEDE_META_KEYS).toContain('ywraq_vendor_id');
    expect(WOO_SEDE_META_KEYS).toContain('_wc_pickup_store');
  });
});

// =============================================
// extractSedeFromOrder — Detección con key sin _
// La función busca m.key === metaKey O m.key === metaKey.replace(/^_/, "")
// Esto significa que "_sede" también matchea "sede" en meta_data
// =============================================

describe('extractSedeFromOrder — matching sin underscore', () => {
  it('key "_sede" en la lista matchea meta_data con key "sede"', () => {
    // La función hace: m.key === "_sede" || m.key === "sede"
    const order = {
      meta_data: [{ key: 'sede', value: 'match-sin-underscore' }],
    };
    expect(extractSedeFromOrder(order)).toBe('match-sin-underscore');
  });

  it('key "_branch" matchea meta_data con key "branch"', () => {
    const order = {
      meta_data: [{ key: 'branch', value: 'branch-match' }],
    };
    expect(extractSedeFromOrder(order)).toBe('branch-match');
  });
});
