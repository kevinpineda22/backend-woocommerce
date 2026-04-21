/**
 * Wrapper histórico: la lógica real vive en `ecommerce/shared/weighableUnits.js`
 * (única fuente de verdad). Este archivo se mantiene para no romper imports.
 */

import { isWeighableUnit, kgPerUnit as sharedKgPerUnit } from "../../shared/weighableUnits";

export const isWeighable = (item) => isWeighableUnit(item?.unidad_medida);

export const kgPerUnit = sharedKgPerUnit;
