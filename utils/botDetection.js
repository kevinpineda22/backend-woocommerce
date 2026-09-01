// Detección heurística de pedidos generados por bots, sin I/O.
//
// El 2026-08 entraron al checkout pedidos como el #81334/#81339/#81375: nombres
// de cliente que son cadenas aleatorias ("ganoacRfitohNzCCDwGSGxeA"), empresa
// "Kineiaquou LLC", cédula "HpcyoJqRXuEJwIFqTFbPKX", teléfono con formato
// gringo y dirección impronunciable. Todos eligieron la pasarela Crédito —
// justamente la que no cobra nada — por $300k-$433k cada uno.
//
// Un bot puede falsificar cualquier campo por separado, pero no puede
// falsificar TODOS de forma coherente: un humano de Copacabana escribe una
// cédula numérica, un celular que empieza por 3 y una dirección con números.
// Por eso esto NO es un booleano sino un puntaje: cada señal suma, y solo el
// conjunto acusa. Así un cliente real con un dato raro (sin cédula, empresa
// extranjera legítima) no queda marcado por una sola coincidencia.
//
// Esto AVISA, nunca bloquea: el pedido igual se lista, con su marca de riesgo.
// La decisión de cancelar es humana.

// Sufijos societarios que no existen en Colombia (acá es S.A.S., S.A., LTDA).
// Un "LLC" en una tienda de barrio antioqueña es dato generado por librería.
const SUFIJOS_EXTRANJEROS = /\b(LLC|L\.L\.C|INC|GMBH|LTD|PLC|S\.?R\.?L)\b/i;

// Dominios de correo de proveedores de internet gringos. Señal DÉBIL por sí
// sola (un cliente real puede tener un @rogers.com), fuerte acompañada.
const DOMINIOS_ISP_EXTRANJEROS = new Set([
  "verizon.net",
  "rogers.com",
  "comcast.net",
  "att.net",
  "sbcglobal.net",
  "bellsouth.net",
  "cox.net",
  "charter.net",
  "aol.com",
  "juno.com",
  "earthlink.net",
  "optonline.net",
  "shaw.ca",
  "sympatico.ca",
]);

const VOCALES = new Set(["a", "e", "i", "o", "u"]);

// Quita tildes y ñ para que "Hincapié" o "Muñoz" se midan como el resto.
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ¿Esta palabra parece generada al azar y no escrita por una persona?
//
// Tres firmas delatan a un generador de cadenas:
//   1. Saltos de caja en mitad de la palabra ("ganoacRfitoh") — nadie teclea así.
//   2. Proporción de vocales fuera de rango. El español ronda 0.40-0.50;
//      "Nqqrwmr" da 0.00 y "Kineiaquou" da 0.70.
//   3. Rachas largas de consonantes seguidas, imposibles de pronunciar.
//
// Solo se evalúan palabras de 8+ letras: en cortas el ruido estadístico
// convierte apellidos reales en falsos positivos.
function esPalabraAleatoria(palabra, minLongitud = 8) {
  const limpia = normalizar(palabra).replace(/[^A-Za-z]/g, "");
  if (limpia.length < minLongitud) return false;

  let saltosDeCaja = 0;
  let vocales = 0;
  let rachaConsonantes = 0;
  let rachaMaxima = 0;

  for (let i = 0; i < limpia.length; i++) {
    const c = limpia[i];
    // minúscula seguida de MAYÚSCULA: "acR", "ohN". Un nombre en mayúscula
    // sostenida ("JOHAN SANCHEZ") no dispara esto, y es correcto que no lo haga.
    if (i > 0 && c === c.toUpperCase() && c !== c.toLowerCase()) {
      const previo = limpia[i - 1];
      if (previo === previo.toLowerCase() && previo !== previo.toUpperCase()) {
        saltosDeCaja++;
      }
    }
    if (VOCALES.has(c.toLowerCase())) {
      vocales++;
      rachaConsonantes = 0;
    } else {
      rachaConsonantes++;
      if (rachaConsonantes > rachaMaxima) rachaMaxima = rachaConsonantes;
    }
  }

  const proporcionVocales = vocales / limpia.length;
  return (
    saltosDeCaja >= 3 ||
    proporcionVocales < 0.2 ||
    proporcionVocales > 0.65 ||
    rachaMaxima >= 5
  );
}

// ¿Alguna palabra del texto parece aleatoria? Se mira palabra por palabra
// porque "Juan VZdpaYVbpWJyy" debe acusar igual que la cadena sola.
function tienePalabraAleatoria(texto, minLongitud = 8) {
  return String(texto || "")
    .split(/\s+/)
    .some((p) => esPalabraAleatoria(p, minLongitud));
}

// Cédula o NIT colombiano: solo dígitos, entre 6 y 12.
// Ausente != inválido. Muchos clientes reales no lo llenan, y castigar el vacío
// llenaría la lista de falsos positivos.
function documentoInvalido(documento) {
  const valor = String(documento || "").trim();
  if (!valor) return false;
  return !/^\d{6,12}$/.test(valor);
}

// Teléfono colombiano: celular de 10 dígitos que arranca en 3, fijo de 7, o
// fijo nacional de 10 que arranca en 60. Se ignora el indicativo +57.
function telefonoNoColombiano(telefono) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (!digitos) return false;
  const sinIndicativo =
    digitos.startsWith("57") && digitos.length > 10 ? digitos.slice(2) : digitos;
  if (sinIndicativo.length === 7) return false;
  if (sinIndicativo.length === 10) {
    return !(sinIndicativo.startsWith("3") || sinIndicativo.startsWith("60"));
  }
  return true;
}

// Una dirección real casi siempre trae número ("Calle 50 #40-20", "Cra 45 #12").
// Una dirección sin un solo dígito Y con forma impronunciable es de generador.
// Se exige ausencia de dígitos primero para no tocar direcciones reales raras.
function direccionAleatoria(direccion) {
  const valor = String(direccion || "").trim();
  if (!valor || /\d/.test(valor)) return false;
  return tienePalabraAleatoria(valor, 6);
}

function dominioIspExtranjero(email) {
  const dominio = String(email || "").split("@")[1];
  return dominio ? DOMINIOS_ISP_EXTRANJEROS.has(dominio.toLowerCase()) : false;
}

// Peso de cada señal. Están calibrados para que NINGUNA sola llegue al umbral:
// hacen falta al menos dos señales independientes para marcar un pedido.
const SENALES = [
  {
    codigo: "nombre_aleatorio",
    peso: 40,
    texto: "Nombre de cliente con forma de cadena generada al azar",
  },
  {
    codigo: "documento_invalido",
    peso: 30,
    texto: "Documento no es una cédula/NIT colombiano (6-12 dígitos)",
  },
  {
    codigo: "empresa_extranjera",
    peso: 25,
    texto: "Empresa con sufijo societario extranjero (LLC/Inc/Ltd)",
  },
  {
    codigo: "telefono_no_colombiano",
    peso: 20,
    texto: "Teléfono no tiene formato colombiano",
  },
  {
    codigo: "direccion_aleatoria",
    peso: 20,
    texto: "Dirección sin numeración y con forma generada",
  },
  {
    codigo: "email_isp_extranjero",
    peso: 10,
    texto: "Correo de un proveedor de internet extranjero",
  },
];

const PESOS = new Map(SENALES.map((s) => [s.codigo, s]));

// A partir de 50 puntos el pedido se marca. Con los pesos de arriba eso obliga
// a que coincidan mínimo dos señales fuertes, o una fuerte con dos débiles.
const UMBRAL_SOSPECHOSO = 50;

// Lee el documento de identidad del meta_data de WooCommerce.
function extraerDocumento(order) {
  const meta = (order?.meta_data || []).find(
    (m) => m.key === "_billing_document",
  );
  return meta?.value || null;
}

// Evalúa un pedido crudo de WooCommerce.
// Devuelve { sospechoso, puntaje, senales: [{codigo, peso, texto}] }.
function evaluarRiesgoBot(order) {
  const billing = order?.billing || {};
  const shipping = order?.shipping || {};
  const codigos = [];

  const nombre = `${billing.first_name || ""} ${billing.last_name || ""} ${shipping.first_name || ""} ${shipping.last_name || ""}`;
  if (tienePalabraAleatoria(nombre)) codigos.push("nombre_aleatorio");

  if (documentoInvalido(extraerDocumento(order))) {
    codigos.push("documento_invalido");
  }

  const empresa = `${billing.company || ""} ${shipping.company || ""}`;
  if (SUFIJOS_EXTRANJEROS.test(empresa)) codigos.push("empresa_extranjera");

  if (telefonoNoColombiano(billing.phone)) {
    codigos.push("telefono_no_colombiano");
  }

  if (
    direccionAleatoria(billing.address_1) ||
    direccionAleatoria(shipping.address_1)
  ) {
    codigos.push("direccion_aleatoria");
  }

  if (dominioIspExtranjero(billing.email)) codigos.push("email_isp_extranjero");

  const senales = codigos.map((c) => PESOS.get(c));
  const puntaje = senales.reduce((suma, s) => suma + s.peso, 0);

  return {
    sospechoso: puntaje >= UMBRAL_SOSPECHOSO,
    puntaje,
    senales,
  };
}

module.exports = {
  UMBRAL_SOSPECHOSO,
  evaluarRiesgoBot,
  esPalabraAleatoria,
  documentoInvalido,
  telefonoNoColombiano,
  direccionAleatoria,
  dominioIspExtranjero,
};
