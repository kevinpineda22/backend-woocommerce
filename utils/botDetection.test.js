import { describe, it, expect } from "vitest";
import {
  evaluarRiesgoBot,
  esPalabraAleatoria,
  documentoInvalido,
  telefonoNoColombiano,
  direccionAleatoria,
  UMBRAL_SOSPECHOSO,
} from "./botDetection.js";

// Datos EXACTOS de los tres pedidos bot que entraron a producción en agosto
// 2026. Si el detector deja de marcarlos, este archivo falla.
const PEDIDO_81334 = {
  billing: {
    first_name: "ganoacRfitohNzCCDwGSGxeA",
    last_name: "AAGFGjQqvHNSgEcm",
    company: "Kineiaquou LLC",
    address_1: "Nqqrwmr",
    city: "Abejorral",
    country: "CO",
    email: "lolog@rogers.com",
    phone: "9226073539",
  },
  shipping: {
    first_name: "QeVjCaLBIKpqvKEKDQtqz",
    last_name: "CFpuTqrtoInJisQeiPBY",
    company: "Oypdebwws LLC",
    address_1: "Xqbisktt",
  },
  meta_data: [{ key: "_billing_document", value: "HpcyoJqRXuEJwIFqTFbPKX" }],
};

const PEDIDO_81339 = {
  billing: {
    first_name: "XlfWxSdZNkbFwaIlacpok",
    last_name: "ZgfNhhcWtSZgpnobxzeWoMGi",
    company: "Hegdzdkbe LLC",
    address_1: "Dhauksioj",
    city: "Abejorral",
    country: "CO",
    email: "kimz@ditchwitchwest.com",
    phone: "2025649607",
  },
  shipping: {
    first_name: "RAaVOXMQvbANKDFdeMX",
    last_name: "IYcatdFladaVCXEKsZyv",
    company: "Oxdker LLC",
    address_1: "Zjfzxzmgsk",
  },
  meta_data: [{ key: "_billing_document", value: "faWIUAqRzSePtGGxmPefmlcR" }],
};

const PEDIDO_81375 = {
  billing: {
    first_name: "VZdpaYVbpWJyyVzUOaVXnp",
    last_name: "XSHNUvmxOtgMRzjaoznPwRB",
    company: "Qheoicmzs LLC",
    address_1: "Twmyqmyn",
    city: "Abejorral",
    country: "CO",
    email: "dlancer@verizon.net",
    phone: "6538579661",
  },
  shipping: {
    first_name: "TyVSTIoANltngKZAfv",
    last_name: "uvbrsaEIhBMZHVeASYUQX",
    company: "Czsejhirk LLC",
    address_1: "Scubq",
  },
  meta_data: [{ key: "_billing_document", value: "NqaDSoTkBZIBWPmsa" }],
};

// Clientes reales de la tienda. Estos JAMÁS pueden marcarse: un falso positivo
// hace que un pedido bueno se cancele, y eso cuesta una venta y un cliente.
const CLIENTE_REAL = {
  billing: {
    first_name: "Johan",
    last_name: "Sánchez Vásquez",
    company: "",
    address_1: "Calle 50 #45-30 Apto 302",
    city: "Copacabana",
    country: "CO",
    email: "johan.sanchez@gmail.com",
    phone: "3012345678",
  },
  shipping: { first_name: "Johan", last_name: "Sánchez Vásquez" },
  meta_data: [{ key: "_billing_document", value: "1017234567" }],
};

const CLIENTE_REAL_MAYUSCULAS = {
  billing: {
    first_name: "MARIA FERNANDA",
    last_name: "VILLARRAGA HINCAPIÉ",
    address_1: "CRA 45 # 12 - 08",
    email: "mfvillarraga@hotmail.com",
    phone: "6045551234",
  },
  shipping: {},
  meta_data: [{ key: "_billing_document", value: "43856210" }],
};

const CLIENTE_EMPRESA_REAL = {
  billing: {
    first_name: "Distribuidora",
    last_name: "El Progreso",
    company: "Distribuidora El Progreso S.A.S.",
    address_1: "Autopista Norte Km 3 Bodega 12",
    email: "compras@elprogreso.com.co",
    phone: "3115559090",
  },
  shipping: {},
  meta_data: [{ key: "_billing_document", value: "900123456" }],
};

describe("evaluarRiesgoBot — pedidos bot reales de producción", () => {
  it.each([
    ["#81334", PEDIDO_81334],
    ["#81339", PEDIDO_81339],
    ["#81375", PEDIDO_81375],
  ])("marca el pedido %s como sospechoso", (_id, pedido) => {
    const r = evaluarRiesgoBot(pedido);
    expect(r.sospechoso).toBe(true);
    expect(r.puntaje).toBeGreaterThanOrEqual(UMBRAL_SOSPECHOSO);
  });

  it("acumula las cinco señales fuertes del pedido #81334", () => {
    const codigos = evaluarRiesgoBot(PEDIDO_81334).senales.map((s) => s.codigo);
    expect(codigos).toEqual(
      expect.arrayContaining([
        "nombre_aleatorio",
        "documento_invalido",
        "empresa_extranjera",
        "telefono_no_colombiano",
        "direccion_aleatoria",
      ]),
    );
  });
});

describe("evaluarRiesgoBot — clientes reales NO se marcan", () => {
  it.each([
    ["cliente natural", CLIENTE_REAL],
    ["cliente en mayúscula sostenida", CLIENTE_REAL_MAYUSCULAS],
    ["empresa colombiana S.A.S.", CLIENTE_EMPRESA_REAL],
  ])("no marca a un %s", (_caso, pedido) => {
    const r = evaluarRiesgoBot(pedido);
    expect(r.sospechoso).toBe(false);
    expect(r.puntaje).toBe(0);
  });

  it("un pedido sin datos de facturación no se marca", () => {
    expect(evaluarRiesgoBot({}).sospechoso).toBe(false);
  });

  it("una sola señal nunca alcanza el umbral", () => {
    // Solo el correo extranjero: 10 puntos. Marcar por esto solo sería absurdo.
    const r = evaluarRiesgoBot({
      ...CLIENTE_REAL,
      billing: { ...CLIENTE_REAL.billing, email: "johan@verizon.net" },
    });
    expect(r.puntaje).toBe(10);
    expect(r.sospechoso).toBe(false);
  });
});

describe("esPalabraAleatoria", () => {
  it("detecta saltos de caja en mitad de palabra", () => {
    expect(esPalabraAleatoria("ganoacRfitohNzCCDwGSGxeA")).toBe(true);
    expect(esPalabraAleatoria("XlfWxSdZNkbFwaIlacpok")).toBe(true);
  });

  it("detecta ausencia y exceso de vocales", () => {
    expect(esPalabraAleatoria("Zjfzxzmgsk")).toBe(true);
    expect(esPalabraAleatoria("Kineiaquou")).toBe(true);
  });

  it("no marca apellidos colombianos reales", () => {
    for (const apellido of [
      "Restrepo",
      "Villarraga",
      "Bustamante",
      "Hincapié",
      "Montoya",
      "Zapata",
      "Echavarría",
      "Gutiérrez",
    ]) {
      expect(esPalabraAleatoria(apellido), apellido).toBe(false);
    }
  });

  it("ignora palabras cortas, donde el ruido genera falsos positivos", () => {
    expect(esPalabraAleatoria("Cra")).toBe(false);
    expect(esPalabraAleatoria("Ana")).toBe(false);
  });
});

describe("documentoInvalido", () => {
  it("acepta cédulas y NITs colombianos", () => {
    expect(documentoInvalido("1017234567")).toBe(false);
    expect(documentoInvalido("900123456")).toBe(false);
    expect(documentoInvalido("43856210")).toBe(false);
  });

  it("rechaza cadenas generadas", () => {
    expect(documentoInvalido("HpcyoJqRXuEJwIFqTFbPKX")).toBe(true);
  });

  it("un documento vacío no es señal: mucha gente real no lo llena", () => {
    expect(documentoInvalido("")).toBe(false);
    expect(documentoInvalido(null)).toBe(false);
  });
});

describe("telefonoNoColombiano", () => {
  it("acepta celular, fijo local y fijo nacional", () => {
    expect(telefonoNoColombiano("3012345678")).toBe(false);
    expect(telefonoNoColombiano("6045551234")).toBe(false);
    expect(telefonoNoColombiano("5551234")).toBe(false);
    expect(telefonoNoColombiano("+57 301 234 5678")).toBe(false);
  });

  it("rechaza los teléfonos gringos de los pedidos bot", () => {
    expect(telefonoNoColombiano("9226073539")).toBe(true);
    expect(telefonoNoColombiano("2025649607")).toBe(true);
    expect(telefonoNoColombiano("6538579661")).toBe(true);
  });

  it("un teléfono vacío no es señal", () => {
    expect(telefonoNoColombiano("")).toBe(false);
  });
});

describe("direccionAleatoria", () => {
  it("no toca direcciones con numeración, que es lo normal", () => {
    expect(direccionAleatoria("Calle 50 #45-30")).toBe(false);
    expect(direccionAleatoria("Autopista Norte Km 3 Bodega 12")).toBe(false);
  });

  it("marca cadenas sin números ni forma pronunciable", () => {
    expect(direccionAleatoria("Nqqrwmr")).toBe(true);
    expect(direccionAleatoria("Zjfzxzmgsk")).toBe(true);
  });
});
