const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "controllers", "actionController.js");
let content = fs.readFileSync(filePath, "utf8");

// Función auxiliar para encontrar el índice de la línea "exports.validateCodeForAuditor"
const validateCodeForAuditorIndex = content.indexOf("exports.validateCodeForAuditor");

if (validateCodeForAuditorIndex === -1) {
  console.error("validateCodeForAuditor no encontrado");
  process.exit(1);
}

// Reemplazar el bloque try-catch de validateCodeWithSiesa
// Buscar desde "try {" hasta "}" que cierra el catch
const validateCodeWithSiesaIndex = content.indexOf("exports.validateCodeWithSiesa");
const tryIndex = content.indexOf("try {", validateCodeWithSiesaIndex);
const catchStartIndex = content.indexOf("} catch (error) {", tryIndex);
const catchEndIndex = content.indexOf("};", catchStartIndex) + 2;

const newValidateCodeWithSiesa = `  try {
    const result = await _validateSiesaCode(codigo, f120_id_esperado, unidad_medida_esperada, { allowGS1: true });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeWithSiesa:", error.message);
    return res.status(500).json({ valid: false, message: "Error al validar código", error: error.message });
  }`;

content = content.substring(0, tryIndex) + newValidateCodeWithSiesa + content.substring(catchEndIndex);

// Ahora hacer lo mismo para validateCodeForAuditor
// Es más complicado porque necesito encontrar dónde comienza y dónde termina

// Encontrar el siguiente "exports.validateCodeForAuditor"
const validateCodeForAuditorNewIndex = content.indexOf("exports.validateCodeForAuditor");
const tryIndexAuditor = content.indexOf("try {", validateCodeForAuditorNewIndex);
const catchStartIndexAuditor = content.indexOf("} catch (error) {", tryIndexAuditor);
const catchEndIndexAuditor = content.indexOf("};", catchStartIndexAuditor) + 2;

const newValidateCodeForAuditor = `  try {
    const result = await _validateSiesaCode(codigo, f120_id_esperado, unidad_medida_esperada, { allowGS1: false });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeForAuditor:", error.message);
    return res.status(500).json({ valid: false, message: "Error al validar código", error: error.message });
  }`;

content = content.substring(0, tryIndexAuditor) + newValidateCodeForAuditor + content.substring(catchEndIndexAuditor);

fs.writeFileSync(filePath, content, "utf8");
console.log("✅ Refactor completado");
