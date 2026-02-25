import { supabase } from "./supabaseClient";

/**
 * Verifica y corrige los códigos de barras contra la tabla `siesa_codigos_barras`.
 * Si un código de barras necesita un '+' al final según la tabla, se lo agrega.
 *
 * @param {string[]} barcodes - Lista de códigos de barras a verificar.
 * @returns {Promise<Object>} - Objeto con los códigos originales mapeados a los corregidos. (Ej: { "123": "123+" })
 */
export const checkSiesaBarcodes = async (barcodes) => {
  if (!barcodes || barcodes.length === 0) return {};

  try {
    // 1. Crear lista de posibles candidatos con '+'
    const potentialPlusCodes = barcodes.map((b) => `${b}+`);

    // 2. Consultar en Supabase si existen esos códigos con '+' o los originales
    // Traemos todos los códigos que coincidan con la lista original O la lista con '+'
    const allCandidates = [...barcodes, ...potentialPlusCodes];

    const { data, error } = await supabase
      .from("siesa_codigos_barras")
      .select("codigo_barras")
      .in("codigo_barras", allCandidates);

    if (error) {
      console.error("Error consultando siesa_codigos_barras:", error);
      return {};
    }

    // 3. Construir mapa de corrección
    // La prioridad es: si existe con '+', usar ese. Si no, usar el original (si existe).
    // Si no existe ninguno, se asume el original (o se podría marcar como desconocido).

    const existingCodes = new Set(data.map((item) => item.codigo_barras));
    const correctionMap = {};

    barcodes.forEach((originalCode) => {
      const plusCode = `${originalCode}+`;

      if (existingCodes.has(plusCode)) {
        correctionMap[originalCode] = plusCode;
      } else if (existingCodes.has(originalCode)) {
        correctionMap[originalCode] = originalCode;
      } else {
        // No se encontró en la tabla, mantenemos el original por defecto
        correctionMap[originalCode] = originalCode;
      }
    });

    return correctionMap;
  } catch (err) {
    console.error("Error en checkSiesaBarcodes:", err);
    return {};
  }
};
