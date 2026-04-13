import { describe, it, expect } from "vitest";
import {
  SHIPPING_BARCODES,
  SHIPPING_LABELS,
  isPickupOrder,
  buildShippingItem,
} from "./shippingMethod";

// =============================================
// Tests para lógica de método de despacho
// Ítems virtuales SIESA: 304 (domicilio), 305 (recogida)
// =============================================

describe("isPickupOrder", () => {
  it("retorna true cuando shipping_lines tiene local_pickup", () => {
    const lines = [{ method_id: "local_pickup", method_title: "Recogida" }];
    expect(isPickupOrder(lines)).toBe(true);
  });

  it("retorna false cuando shipping_lines tiene flat_rate (domicilio)", () => {
    const lines = [{ method_id: "flat_rate", method_title: "Envío" }];
    expect(isPickupOrder(lines)).toBe(false);
  });

  it("retorna false cuando shipping_lines tiene free_shipping", () => {
    const lines = [{ method_id: "free_shipping", method_title: "Envío gratis" }];
    expect(isPickupOrder(lines)).toBe(false);
  });

  it("retorna false cuando shipping_lines está vacío", () => {
    expect(isPickupOrder([])).toBe(false);
  });

  it("retorna false cuando shipping_lines es null/undefined", () => {
    expect(isPickupOrder(null)).toBe(false);
    expect(isPickupOrder(undefined)).toBe(false);
  });

  it("retorna true si al menos una línea es local_pickup (múltiples líneas)", () => {
    const lines = [
      { method_id: "flat_rate", method_title: "Envío" },
      { method_id: "local_pickup", method_title: "Recogida" },
    ];
    expect(isPickupOrder(lines)).toBe(true);
  });
});

describe("buildShippingItem", () => {
  describe("pedido de recogida en tienda", () => {
    const pickupLines = [{ method_id: "local_pickup", method_title: "Recogida" }];

    it("genera ítem con barra 305", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.barcode).toBe("305");
    });

    it("tiene el label correcto", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.name).toBe("Recogida en tienda");
    });

    it("tiene is_shipping_method en true", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.is_shipping_method).toBe(true);
    });

    it("tiene qty 1 y price 0", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.qty).toBe(1);
      expect(item.price).toBe(0);
    });

    it("genera id con prefijo shipping-", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.id).toBe("shipping-12345");
    });

    it("sku coincide con la barra", () => {
      const item = buildShippingItem("12345", pickupLines);
      expect(item.sku).toBe(item.barcode);
      expect(item.sku).toBe(SHIPPING_BARCODES.RECOGIDA);
    });
  });

  describe("pedido a domicilio", () => {
    const domicilioLines = [{ method_id: "flat_rate", method_title: "Envío" }];

    it("genera ítem con barra 304", () => {
      const item = buildShippingItem("67890", domicilioLines);
      expect(item.barcode).toBe("304");
    });

    it("tiene el label correcto", () => {
      const item = buildShippingItem("67890", domicilioLines);
      expect(item.name).toBe("Domicilio e-commerce envío");
    });

    it("tiene is_shipping_method en true", () => {
      const item = buildShippingItem("67890", domicilioLines);
      expect(item.is_shipping_method).toBe(true);
    });
  });

  describe("sin shipping_lines (sesiones antiguas)", () => {
    it("defaultea a domicilio (304) cuando no hay shipping_lines", () => {
      const item = buildShippingItem("99999", []);
      expect(item.barcode).toBe("304");
      expect(item.name).toBe("Domicilio e-commerce envío");
    });

    it("defaultea a domicilio (304) con null", () => {
      const item = buildShippingItem("99999", null);
      expect(item.barcode).toBe("304");
    });

    it("defaultea a domicilio (304) con undefined", () => {
      const item = buildShippingItem("99999", undefined);
      expect(item.barcode).toBe("304");
    });
  });
});

describe("constantes SIESA", () => {
  it("DOMICILIO es 304", () => {
    expect(SHIPPING_BARCODES.DOMICILIO).toBe("304");
  });

  it("RECOGIDA es 305", () => {
    expect(SHIPPING_BARCODES.RECOGIDA).toBe("305");
  });

  it("labels coinciden con descripción SIESA", () => {
    expect(SHIPPING_LABELS.DOMICILIO).toBe("Domicilio e-commerce envío");
    expect(SHIPPING_LABELS.RECOGIDA).toBe("Recogida en tienda");
  });
});

describe("integración: flujo QR del manifiesto", () => {
  // Simula la lógica del ManifestSheet para verificar que el ítem de shipping
  // se emite correctamente en el QR (sin prefijo qty*)
  const simulateQrLine = (item) => {
    if (item.is_shipping_method) {
      return item.barcode; // Solo la barra, sin qty*
    }
    const qty = item.qty || 1;
    return `${qty}*${item.barcode}`;
  };

  it("producto normal genera qty*barcode", () => {
    const normalItem = { qty: 3, barcode: "7702004001234", is_shipping_method: false };
    expect(simulateQrLine(normalItem)).toBe("3*7702004001234");
  });

  it("ítem de recogida genera solo 305 (sin prefijo)", () => {
    const shippingItem = buildShippingItem("123", [{ method_id: "local_pickup" }]);
    expect(simulateQrLine(shippingItem)).toBe("305");
  });

  it("ítem de domicilio genera solo 304 (sin prefijo)", () => {
    const shippingItem = buildShippingItem("123", [{ method_id: "flat_rate" }]);
    expect(simulateQrLine(shippingItem)).toBe("304");
  });

  it("QR completo: productos + despacho al final", () => {
    const items = [
      { qty: 2, barcode: "1001UND", is_shipping_method: false },
      { qty: 1, barcode: "1002KL", is_shipping_method: false },
      buildShippingItem("555", [{ method_id: "local_pickup" }]),
    ];
    const qrLines = items.map(simulateQrLine);
    expect(qrLines).toEqual(["2*1001UND", "1*1002KL", "305"]);
    // El join con \r\n simula lo que hace ManifestSheet
    expect(qrLines.join("\r\n")).toBe("2*1001UND\r\n1*1002KL\r\n305");
  });
});

describe("integración: conteo de productos excluye shipping", () => {
  it("no cuenta el ítem de despacho en total de productos", () => {
    const items = [
      { qty: 2, name: "Arroz", is_shipping_method: false },
      { qty: 1, name: "Leche", is_shipping_method: false },
      buildShippingItem("123", [{ method_id: "flat_rate" }]),
    ];
    // Lógica del ManifestSheet: productItems = items.filter(i => !i.is_shipping_method)
    const productItems = items.filter((i) => !i.is_shipping_method);
    expect(productItems.length).toBe(2);
    const totalQty = productItems.reduce((sum, i) => sum + (i.qty || 1), 0);
    expect(totalQty).toBe(3);
  });
});

describe("integración: snapshot incluye shipping_lines", () => {
  // Simula lo que hace sessionController al crear el snapshot
  const buildSnapshot = (wooOrder) => ({
    id: wooOrder.id,
    billing: wooOrder.billing,
    shipping: wooOrder.shipping,
    shipping_lines: wooOrder.shipping_lines || [],
    line_items: wooOrder.line_items,
  });

  it("snapshot preserva shipping_lines de recogida", () => {
    const order = {
      id: 77700,
      billing: { first_name: "Test" },
      shipping: {},
      shipping_lines: [{ method_id: "local_pickup", method_title: "Recogida" }],
      line_items: [],
    };
    const snap = buildSnapshot(order);
    expect(snap.shipping_lines).toHaveLength(1);
    expect(snap.shipping_lines[0].method_id).toBe("local_pickup");
  });

  it("snapshot preserva shipping_lines de domicilio", () => {
    const order = {
      id: 77701,
      billing: {},
      shipping: {},
      shipping_lines: [{ method_id: "flat_rate", method_title: "Envío" }],
      line_items: [],
    };
    const snap = buildSnapshot(order);
    expect(snap.shipping_lines[0].method_id).toBe("flat_rate");
  });

  it("snapshot defaultea a array vacío si no hay shipping_lines", () => {
    const order = { id: 77702, billing: {}, shipping: {}, line_items: [] };
    const snap = buildSnapshot(order);
    expect(snap.shipping_lines).toEqual([]);
  });
});
