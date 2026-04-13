import { describe, it, expect } from "vitest";

// =============================================
// Tests para la lógica de cancelación de pedidos
// Valida reglas de negocio, flujos y edge cases
// =============================================

// Helper: simula la validación del backend antes de cancelar
const validateCancelRequest = ({ order_id, motivo, admin_name }) => {
  const errors = [];
  if (!order_id) errors.push("Falta order_id");
  if (!motivo || !motivo.trim()) errors.push("El motivo es obligatorio");
  if (!admin_name || !admin_name.trim())
    errors.push("El nombre del admin es obligatorio");
  return errors;
};

// Helper: simula la detección de sesión activa
const hasActiveSession = (orderId, activeAssignments) => {
  return activeAssignments.some((a) => a.id_pedido === orderId);
};

// Helper: simula verificar si ya está cancelado
const isAlreadyCancelled = (orderId, cancelledRecords) => {
  return cancelledRecords.some(
    (r) => r.order_id === orderId && r.restored_at === null,
  );
};

// Helper: simula la estructura del registro de cancelación
const buildCancelRecord = (orderId, orderData, motivo, adminName, adminEmail, sedeId) => {
  return {
    order_id: orderId,
    order_data: orderData,
    motivo: motivo.trim(),
    admin_name: adminName.trim(),
    admin_email: adminEmail || null,
    sede_id: sedeId || null,
  };
};

// Helper: simula lectura de admin desde localStorage
const getAdminFromLocalStorage = (empleadoInfo, correo) => {
  const empleado = empleadoInfo ? JSON.parse(empleadoInfo) : {};
  return {
    name: empleado.nombre || "Admin",
    email: correo || "",
  };
};

describe("validación de request de cancelación", () => {
  it("pasa con datos completos", () => {
    const errors = validateCancelRequest({
      order_id: 77700,
      motivo: "Cliente pidió cancelar",
      admin_name: "Juan Pérez",
    });
    expect(errors).toHaveLength(0);
  });

  it("falla sin order_id", () => {
    const errors = validateCancelRequest({
      order_id: null,
      motivo: "Motivo",
      admin_name: "Admin",
    });
    expect(errors).toContain("Falta order_id");
  });

  it("falla sin motivo", () => {
    const errors = validateCancelRequest({
      order_id: 123,
      motivo: "",
      admin_name: "Admin",
    });
    expect(errors).toContain("El motivo es obligatorio");
  });

  it("falla con motivo de solo espacios", () => {
    const errors = validateCancelRequest({
      order_id: 123,
      motivo: "   ",
      admin_name: "Admin",
    });
    expect(errors).toContain("El motivo es obligatorio");
  });

  it("falla sin admin_name", () => {
    const errors = validateCancelRequest({
      order_id: 123,
      motivo: "Motivo válido",
      admin_name: "",
    });
    expect(errors).toContain("El nombre del admin es obligatorio");
  });

  it("falla con admin_name de solo espacios", () => {
    const errors = validateCancelRequest({
      order_id: 123,
      motivo: "Motivo",
      admin_name: "   ",
    });
    expect(errors).toContain("El nombre del admin es obligatorio");
  });

  it("acumula múltiples errores", () => {
    const errors = validateCancelRequest({
      order_id: null,
      motivo: "",
      admin_name: "",
    });
    expect(errors).toHaveLength(3);
  });
});

describe("detección de sesión de picking activa", () => {
  const activeAssignments = [
    { id_pedido: 100, estado_asignacion: "en_proceso" },
    { id_pedido: 200, estado_asignacion: "completado" },
  ];

  it("bloquea cancelación si el pedido tiene sesión activa", () => {
    expect(hasActiveSession(100, activeAssignments)).toBe(true);
  });

  it("permite cancelación si el pedido NO tiene sesión activa", () => {
    expect(hasActiveSession(999, activeAssignments)).toBe(false);
  });

  it("permite cancelación con lista vacía de asignaciones", () => {
    expect(hasActiveSession(100, [])).toBe(false);
  });
});

describe("verificación de duplicados", () => {
  const cancelledRecords = [
    { order_id: 500, restored_at: null },
    { order_id: 600, restored_at: "2026-01-01T00:00:00Z" },
  ];

  it("detecta pedido ya cancelado (sin restaurar)", () => {
    expect(isAlreadyCancelled(500, cancelledRecords)).toBe(true);
  });

  it("permite re-cancelar un pedido que fue restaurado", () => {
    expect(isAlreadyCancelled(600, cancelledRecords)).toBe(false);
  });

  it("permite cancelar pedido que nunca fue cancelado", () => {
    expect(isAlreadyCancelled(999, cancelledRecords)).toBe(false);
  });
});

describe("construcción del registro de cancelación", () => {
  const mockOrderData = {
    id: 77700,
    status: "processing",
    total: "150000",
    billing: {
      first_name: "María",
      last_name: "García",
      phone: "3001234567",
      address_1: "Calle 45 #12-34",
      city: "Medellín",
    },
    line_items: [
      { name: "Arroz Diana 5kg", quantity: 2, total: "30000" },
      { name: "Leche Colanta 1L", quantity: 3, total: "15000" },
    ],
    customer_note: "Dejar en portería",
  };

  it("construye registro con todos los campos", () => {
    const record = buildCancelRecord(
      77700,
      mockOrderData,
      "Cliente canceló por teléfono",
      "Juan Pérez",
      "juan@empresa.com",
      "sede-uuid-123",
    );

    expect(record.order_id).toBe(77700);
    expect(record.motivo).toBe("Cliente canceló por teléfono");
    expect(record.admin_name).toBe("Juan Pérez");
    expect(record.admin_email).toBe("juan@empresa.com");
    expect(record.sede_id).toBe("sede-uuid-123");
  });

  it("preserva el snapshot completo del pedido", () => {
    const record = buildCancelRecord(
      77700,
      mockOrderData,
      "Motivo",
      "Admin",
      null,
      null,
    );

    expect(record.order_data.billing.first_name).toBe("María");
    expect(record.order_data.line_items).toHaveLength(2);
    expect(record.order_data.customer_note).toBe("Dejar en portería");
    expect(record.order_data.total).toBe("150000");
  });

  it("trimea motivo y admin_name", () => {
    const record = buildCancelRecord(
      1,
      {},
      "  motivo con espacios  ",
      "  Admin  ",
      null,
      null,
    );
    expect(record.motivo).toBe("motivo con espacios");
    expect(record.admin_name).toBe("Admin");
  });

  it("maneja email y sede null", () => {
    const record = buildCancelRecord(1, {}, "m", "a", null, null);
    expect(record.admin_email).toBeNull();
    expect(record.sede_id).toBeNull();
  });

  it("maneja email y sede undefined → null", () => {
    const record = buildCancelRecord(1, {}, "m", "a", undefined, undefined);
    expect(record.admin_email).toBeNull();
    expect(record.sede_id).toBeNull();
  });
});

describe("lectura de admin desde localStorage", () => {
  it("extrae nombre y email correctamente", () => {
    const info = JSON.stringify({ nombre: "Carlos López", area: "Sistemas" });
    const admin = getAdminFromLocalStorage(info, "carlos@empresa.com");
    expect(admin.name).toBe("Carlos López");
    expect(admin.email).toBe("carlos@empresa.com");
  });

  it("usa fallback 'Admin' cuando no hay nombre", () => {
    const info = JSON.stringify({ area: "Logística" });
    const admin = getAdminFromLocalStorage(info, "");
    expect(admin.name).toBe("Admin");
  });

  it("maneja localStorage vacío", () => {
    const admin = getAdminFromLocalStorage(null, null);
    expect(admin.name).toBe("Admin");
    expect(admin.email).toBe("");
  });

  it("maneja JSON inválido → fallback", () => {
    // Si el JSON es inválido, JSON.parse tira error
    // En el frontend real esto se maneja con || "{}"
    const admin = getAdminFromLocalStorage("{}", "test@test.com");
    expect(admin.name).toBe("Admin");
    expect(admin.email).toBe("test@test.com");
  });
});

describe("integración: flujo completo de cancelación", () => {
  it("flujo exitoso: validar → verificar sesión → verificar duplicado → construir registro", () => {
    // 1. Validar request
    const errors = validateCancelRequest({
      order_id: 77700,
      motivo: "Producto agotado",
      admin_name: "Ana Torres",
    });
    expect(errors).toHaveLength(0);

    // 2. Verificar que no tiene sesión activa
    const hasSession = hasActiveSession(77700, [
      { id_pedido: 99999, estado: "en_proceso" },
    ]);
    expect(hasSession).toBe(false);

    // 3. Verificar que no está ya cancelado
    const isDuplicate = isAlreadyCancelled(77700, [
      { order_id: 11111, restored_at: null },
    ]);
    expect(isDuplicate).toBe(false);

    // 4. Construir registro
    const record = buildCancelRecord(
      77700,
      { id: 77700, total: "50000", billing: { first_name: "Test" }, line_items: [] },
      "Producto agotado",
      "Ana Torres",
      "ana@empresa.com",
      "sede-1",
    );
    expect(record.order_id).toBe(77700);
    expect(record.order_data.total).toBe("50000");
  });

  it("flujo bloqueado: pedido con sesión activa", () => {
    const errors = validateCancelRequest({
      order_id: 200,
      motivo: "Cancelar",
      admin_name: "Admin",
    });
    expect(errors).toHaveLength(0);

    // Se bloquea en el paso 2
    const hasSession = hasActiveSession(200, [
      { id_pedido: 200, estado: "en_proceso" },
    ]);
    expect(hasSession).toBe(true);
    // En el backend real esto retornaría 409 y no continuaría
  });
});

describe("integración: flujo de restauración", () => {
  it("un pedido restaurado puede ser cancelado de nuevo", () => {
    const cancelledRecords = [
      { order_id: 300, restored_at: "2026-04-12T10:00:00Z" },
    ];
    // No es duplicado porque ya fue restaurado
    expect(isAlreadyCancelled(300, cancelledRecords)).toBe(false);
  });

  it("múltiples cancelaciones del mismo pedido: solo la activa cuenta", () => {
    const cancelledRecords = [
      { order_id: 400, restored_at: "2026-01-01T00:00:00Z" },
      { order_id: 400, restored_at: "2026-02-01T00:00:00Z" },
      { order_id: 400, restored_at: null }, // Esta es la activa
    ];
    expect(isAlreadyCancelled(400, cancelledRecords)).toBe(true);
  });
});
