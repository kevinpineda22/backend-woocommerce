import { describe, it, expect } from "vitest";

const { obtenerInfoPasillo, SEDES_CONFIG, SEDE_DEFAULT, CATEGORIAS } =
  await import("./mapeadorPasillos");

// =============================================
// Tests para mapeadorPasillos.js (PRODUCCIÓN)
// Validar que el mapeo de categorías → pasillos
// funciona correctamente para cada sede.
// =============================================

// Helper: crear categorías WooCommerce
const cat = (...names) => names.map((name) => ({ name }));

describe("Configuración", () => {
  it("SEDE_DEFAULT debería ser copacabana-plaza", () => {
    expect(SEDE_DEFAULT).toBe("copacabana-plaza");
  });

  it("copacabana-plaza debería existir en SEDES_CONFIG", () => {
    expect(SEDES_CONFIG["copacabana-plaza"]).toBeDefined();
  });

  it("copacabana-plaza debería tener 14 pasillos", () => {
    expect(SEDES_CONFIG["copacabana-plaza"].pasillos.length).toBe(14);
  });

  it("CATEGORIAS debería tener todas las secciones", () => {
    const secciones = [
      "bebe_adulto_cereales",
      "cafe_aromaticas",
      "cuidado_personal",
      "aseo_hogar",
      "aseo_ropa",
      "refrigerados_carnes_licores",
      "gaseosas_mecato_fruver",
      "bebidas_pasabocas",
      "huevos_atunes_pastas",
      "arroz_azucar_granos",
      "harinas_aceites",
      "reposteria_leche",
      "galletas_avenas",
      "mascotas_implementos",
    ];
    secciones.forEach((s) => expect(CATEGORIAS[s]).toBeDefined());
  });
});

describe("obtenerInfoPasillo — Copacabana Plaza", () => {
  const sede = "copacabana-plaza";

  describe("categorías → pasillo correcto", () => {
    it("Arroz → P1", () => {
      expect(obtenerInfoPasillo(cat("Arroz"), "", sede).pasillo).toBe("1");
    });

    it("Huevos → P2", () => {
      expect(obtenerInfoPasillo(cat("Huevos"), "", sede).pasillo).toBe("2");
    });

    it("Aceites → P3", () => {
      expect(obtenerInfoPasillo(cat("Aceites"), "", sede).pasillo).toBe("3");
    });

    it("Repostería → P4", () => {
      expect(obtenerInfoPasillo(cat("Reposteria"), "", sede).pasillo).toBe("4");
    });

    it("Galletas → P5", () => {
      expect(obtenerInfoPasillo(cat("Galletas"), "", sede).pasillo).toBe("5");
    });

    it("Café → P6", () => {
      expect(obtenerInfoPasillo(cat("Cafe"), "", sede).pasillo).toBe("6");
    });

    it("Chocolate (de mesa) → P6", () => {
      expect(obtenerInfoPasillo(cat("Chocolate"), "", sede).pasillo).toBe("6");
    });

    it("Pañales → P7", () => {
      expect(obtenerInfoPasillo(cat("Pañales"), "", sede).pasillo).toBe("7");
    });

    it("Cuidado Personal → P8", () => {
      expect(
        obtenerInfoPasillo(cat("Cuidado Personal"), "", sede).pasillo,
      ).toBe("8");
    });

    it("Aseo del Hogar → P9", () => {
      expect(obtenerInfoPasillo(cat("Aseo del Hogar"), "", sede).pasillo).toBe(
        "9",
      );
    });

    it("Detergente → P10", () => {
      expect(obtenerInfoPasillo(cat("Detergente"), "", sede).pasillo).toBe(
        "10",
      );
    });

    it("Mascotas → P11", () => {
      expect(obtenerInfoPasillo(cat("Mascotas"), "", sede).pasillo).toBe("11");
    });

    it("Bebidas → P12", () => {
      expect(obtenerInfoPasillo(cat("Bebidas"), "", sede).pasillo).toBe("12");
    });

    it("Carnicería → P13", () => {
      expect(obtenerInfoPasillo(cat("Carniceria"), "", sede).pasillo).toBe(
        "13",
      );
    });

    it("Fruver → P14", () => {
      expect(obtenerInfoPasillo(cat("Fruver"), "", sede).pasillo).toBe("14");
    });
  });

  describe("orden de ruta (serpentina)", () => {
    it("P2 debería ser el primer pasillo (prioridad 1)", () => {
      const info = obtenerInfoPasillo(cat("Huevos"), "", sede);
      expect(info.prioridad).toBe(1);
    });

    it("P1 debería ser el segundo pasillo (prioridad 2)", () => {
      const info = obtenerInfoPasillo(cat("Arroz"), "", sede);
      expect(info.prioridad).toBe(2);
    });

    it("P14 debería ser el último pasillo (prioridad 14)", () => {
      const info = obtenerInfoPasillo(cat("Fruver"), "", sede);
      expect(info.prioridad).toBe(14);
    });
  });
});

describe("obtenerInfoPasillo — Matching inteligente", () => {
  it("debería hacer match con acentos (Carnicería → carniceria)", () => {
    expect(obtenerInfoPasillo(cat("Carnicería")).pasillo).toBe("13");
  });

  it("debería hacer match case-insensitive", () => {
    expect(obtenerInfoPasillo(cat("ARROZ")).pasillo).toBe("1");
    expect(obtenerInfoPasillo(cat("arroz")).pasillo).toBe("1");
  });

  it("debería preferir match más específico (key más larga)", () => {
    // "bebidas en polvo" (16 chars) debería ganar sobre "bebidas" (7 chars)
    expect(obtenerInfoPasillo(cat("Bebidas en polvo")).pasillo).toBe("7");
  });

  it('debería ignorar categoría "Despensa"', () => {
    // "Despensa" se filtra, cae al fallback por nombre
    const info = obtenerInfoPasillo(cat("Despensa"), "Arroz Diana");
    expect(info.pasillo).toBe("1");
  });

  it('debería ignorar "Lácteos, Huevos y Refrigerados"', () => {
    const info = obtenerInfoPasillo(
      cat("Lácteos, Huevos y Refrigerados", "Yogurt"),
    );
    expect(info.pasillo).toBe("13");
  });
});

describe("obtenerInfoPasillo — Fallback por nombre de producto", () => {
  it("sin categorías pero con nombre → busca en nombre", () => {
    const info = obtenerInfoPasillo([], "Arroz Diana x 5 kg");
    expect(info.pasillo).toBe("1");
  });

  it("sin categorías ni nombre → Otros", () => {
    const info = obtenerInfoPasillo([], "");
    expect(info.pasillo).toBe("Otros");
    expect(info.prioridad).toBe(99);
  });

  it("categorías no reconocidas → Otros", () => {
    const info = obtenerInfoPasillo(cat("Categoría Inventada"));
    expect(info.pasillo).toBe("Otros");
  });
});

describe("obtenerInfoPasillo — Jerarquía de categorías WooCommerce", () => {
  it("debería preferir subcategorías (parent > 0) sobre padres", () => {
    const categorias = [
      { name: "Mercado", parent: 0 },
      { name: "Arroz", parent: 42 },
    ];
    const info = obtenerInfoPasillo(categorias);
    expect(info.pasillo).toBe("1");
  });

  it("si solo tiene categoría padre, la usa", () => {
    const categorias = [{ name: "Carniceria", parent: 0 }];
    const info = obtenerInfoPasillo(categorias);
    expect(info.pasillo).toBe("13");
  });
});

describe("obtenerInfoPasillo — Multi-sede", () => {
  it("sede desconocida debería usar fallback (copacabana-plaza)", () => {
    const info = obtenerInfoPasillo(cat("Arroz"), "", "sede-inexistente");
    expect(info.pasillo).toBe("1"); // Copacabana layout
  });

  it("sin sede debería usar fallback (copacabana-plaza)", () => {
    const info = obtenerInfoPasillo(cat("Arroz"));
    expect(info.pasillo).toBe("1");
  });

  it("sede vacía debería usar fallback", () => {
    const info = obtenerInfoPasillo(cat("Arroz"), "", "");
    expect(info.pasillo).toBe("1");
  });
});

describe("obtenerInfoPasillo — Desambiguación por nombre de producto", () => {
  const sede = "copacabana-plaza";

  it('categoría "Pastas y Harinas" + producto "Spaghetti" → P2 (pastas)', () => {
    const info = obtenerInfoPasillo(
      cat("Pastas y Harinas"),
      "Spaghetti #5 500g",
      sede,
    );
    expect(info.pasillo).toBe("2");
  });

  it('categoría "Pastas y Harinas" + producto "Harina" → P3 (harinas)', () => {
    const info = obtenerInfoPasillo(
      cat("Pastas y Harinas"),
      "Harina de Trigo Ramo 1kg",
      sede,
    );
    expect(info.pasillo).toBe("3");
  });

  it('categoría "Pastas y Harinas" + producto "Harina Precocida PAN" → P3', () => {
    const info = obtenerInfoPasillo(
      cat("Pastas y Harinas"),
      "Harina Precocida PAN 1kg",
      sede,
    );
    expect(info.pasillo).toBe("3");
  });

  it('categoría "Pastas y Harinas" + producto "Pasta Doria Fusilli" → P2', () => {
    const info = obtenerInfoPasillo(
      cat("Pastas y Harinas"),
      "Pasta Doria Fusilli 250g",
      sede,
    );
    expect(info.pasillo).toBe("2");
  });

  it("categoría ambigua sin nombre → usa key más larga como fallback", () => {
    const info = obtenerInfoPasillo(cat("Pastas y Harinas"), "", sede);
    // "harinas" (7) > "pastas" (6) → P3
    expect(info.pasillo).toBe("3");
  });

  it("categoría no ambigua sigue funcionando igual", () => {
    expect(
      obtenerInfoPasillo(cat("Arroz"), "Arroz Diana 5kg", sede).pasillo,
    ).toBe("1");
    expect(
      obtenerInfoPasillo(cat("Huevos"), "Huevos AAA x30", sede).pasillo,
    ).toBe("2");
    expect(
      obtenerInfoPasillo(cat("Detergente"), "Fab Limón 1kg", sede).pasillo,
    ).toBe("10");
  });
});

describe("obtenerInfoPasillo — Chocolate: mesa (P6) vs golosinas (P13)", () => {
  const sede = "copacabana-plaza";

  it("Chocolate (categoría sola) → P6 con el café", () => {
    expect(obtenerInfoPasillo(cat("Chocolate"), "", sede).pasillo).toBe("6");
  });

  it("Chocolates y dulces → P13 (key más larga gana)", () => {
    expect(
      obtenerInfoPasillo(cat("Chocolates y dulces"), "", sede).pasillo,
    ).toBe("13");
  });

  it("Golosinas de chocolate → P13", () => {
    expect(
      obtenerInfoPasillo(cat("Golosinas de chocolate"), "", sede).pasillo,
    ).toBe("13");
  });

  it("Golosinas → P13", () => {
    expect(obtenerInfoPasillo(cat("Golosinas"), "", sede).pasillo).toBe("13");
  });
});

describe("obtenerInfoPasillo — Edge cases", () => {
  it("categorías null", () => {
    const info = obtenerInfoPasillo(null, "Arroz");
    expect(info.pasillo).toBe("1");
  });

  it("categorías vacías con nombre vacío", () => {
    const info = obtenerInfoPasillo([], "");
    expect(info.pasillo).toBe("Otros");
  });

  it("categoría con name null", () => {
    const info = obtenerInfoPasillo([{ name: null }], "Galletas");
    expect(info.pasillo).toBe("5");
  });
});
