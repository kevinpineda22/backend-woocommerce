/**
 * FUENTE ÚNICA DE VERDAD DEL MANIFIESTO / QR DE SALIDA.
 *
 * ══════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 * ══════════════════════════════════════════════════════════════════
 *
 * Había DOS caminos distintos para llegar a un código de barras:
 *
 *   1. `getSessionLogsDetail` (historial admin) → `manifest_items`, que
 *      resuelve presentación contra SIESA, elige entre códigos REALES y
 *      devuelve `null` cuando el producto no tiene ninguno.
 *   2. `getSessionActive` (pantalla del picker) → `items[].barcode`, que
 *      cuando SIESA no tenía fila caía a `[item.barcode || item.sku]`,
 *      o sea: EMITÍA EL SKU COMO SI FUERA UN CÓDIGO DE BARRAS.
 *
 * El segundo camino es exactamente el bug que ya llegó a la caja: el POS
 * no entiende un f120_id suelto ni un código fabricado, y rechazaba todas
 * las líneas menos las de fruver (que viajan por el GS1 de báscula).
 *
 * El QR del historial admin es la referencia correcta. Este módulo lo saca
 * del controlador para que picker y admin consuman LA MISMA función y no
 * puedan volver a divergir.
 *
 * El pipeline se movió tal cual estaba: `getSessionLogsDetail` sigue
 * devolviendo el mismo payload, byte por byte.
 */

import { supabase } from "./supabaseClient.js";
import { getWooClient } from "./wooMultiService.js";
import { isWeighableUnit } from "../utils/weighableUnits.js";
// Fuente única de verdad para códigos SIESA, presentaciones y códigos de
// manifiesto. Guardada por utils/siesaMatching.test.js — no reimplementar
// esta lógica acá adentro: cada copia divergió y trabó auditorías.
import {
  normalizeBarcode,
  normalizeUM,
  buildBarcodeIndex,
  availableUMsFor,
  resolveExpectedUM,
  buildManifestCode,
  findGs1Base,
} from "../utils/siesaMatching.js";
import { buildManifestItems } from "../utils/manifestItems.js";

/**
 * Error con código HTTP para que el controlador traduzca sin adivinar.
 */
export class ManifestError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ManifestError";
    this.status = status;
  }
}

/**
 * Construye el payload completo de auditoría/manifiesto de una sesión.
 *
 * @param {Object}  params
 * @param {string}  params.sessionId          — id completo o corto (>=1 char)
 * @param {string}  [params.sedeId]           — sede del request (fallback)
 * @param {boolean} [params.incluirCategorias] — trae categorías reales de Woo.
 *   Solo alimentan `products_map` para la detección fruver del AUDITOR; el
 *   manifiesto no las usa. El picker las apaga para no pagar un roundtrip a
 *   WooCommerce desde el celular.
 * @returns {Promise<Object>} payload idéntico al de /historial-detalle
 */
export async function buildSessionManifest({
  sessionId,
  sedeId = null,
  incluirCategorias = true,
}) {
  let session_id = sessionId;

  if (!session_id) throw new ManifestError("Falta session_id", 400);

  // Detección ID Corto
  if (session_id.length < 30) {
    const { data: recents } = await supabase
      .from("wc_picking_sessions")
      .select("id")
      .order("fecha_inicio", { ascending: false })
      .limit(100);
    const match = (recents || []).find((s) => s.id.startsWith(session_id));
    if (!match)
      throw new ManifestError("Sesión no encontrada (ID Corto).", 404);
    session_id = match.id;
  }

  const { data: sessionInfo, error: sessError } = await supabase
    .from("wc_picking_sessions")
    .select(
      `id, sede_id, fecha_inicio, fecha_fin, estado, ids_pedidos, snapshot_pedidos, datos_salida, wc_pickers!wc_picking_sessions_picker_fkey(nombre_completo, email)`,
    )
    .eq("id", session_id)
    .single();

  if (sessError || !sessionInfo)
    throw new Error("Error obteniendo info de la sesión");

  let ordersData = [];
  let productDetailsMap = {};

  const processOrderData = (orderList) => {
    return orderList.map((o) => {
      if (o.line_items) {
        o.line_items.forEach((item) => {
          const imgUrl =
            item.image?.src ||
            (item.image && item.image.length > 0 ? item.image[0].src : null);
          const unitMeta = item.meta_data?.find(
            (m) => m.key === "pa_unidad-de-medida-aproximado",
          );
          const unitMeasure = unitMeta ? unitMeta.display_value : null;
          // catalog_price: precio de catálogo por unidad/kg (sin ajuste de peso)
          // effective_price: total cobrado / cantidad pedida (lo que realmente se factura)
          // Para productos pesables: total = catalog_price × peso_real_kg
          // Para productos normales: effective_price = catalog_price (sin diferencia)
          const catalogPrice = parseFloat(item.price) || 0;
          const lineSubtotal = parseFloat(item.subtotal) || 0;
          const lineTotal = parseFloat(item.total) || 0;
          const effectivePrice =
            item.quantity > 0 ? lineTotal / item.quantity : catalogPrice;
          const effectiveSubtotal =
            item.quantity > 0 ? lineSubtotal / item.quantity : catalogPrice;

          // ⚠️ `productDetailsMap` es un índice de CONSULTA por id, no la
          // lista del manifiesto: la misma entrada se escribe bajo
          // `product_id` y bajo `variation_id`, y el mismo producto pedido
          // por dos clientes colapsa en una sola clave (gana el último).
          // Para el QR / manifiesto usar `manifest_items`, que tiene una
          // entrada por línea de pedido real.
          const detalle = {
            name: item.name,
            image: imgUrl,
            sku: item.sku,
            price: effectivePrice,
            catalog_price: catalogPrice,
            subtotal: effectiveSubtotal,
            line_total: effectivePrice,
            unidad_medida: unitMeasure,
            pedidos_involucrados: [],
          };

          const previo =
            productDetailsMap[item.variation_id || item.product_id];
          const historial = previo?.pedidos_involucrados || [];
          detalle.pedidos_involucrados = [
            ...historial,
            { order_id: o.id, qty: item.quantity, price: effectivePrice },
          ];
          // Deja visible que este producto viene de varios pedidos con
          // precios distintos: antes se pisaba en silencio.
          detalle._precio_ambiguo = detalle.pedidos_involucrados.some(
            (p) => p.price !== effectivePrice,
          );

          productDetailsMap[item.product_id] = detalle;
          if (item.variation_id)
            productDetailsMap[item.variation_id] = { ...detalle };
        });
      }
      return {
        id: o.id,
        customer:
          (o.billing?.first_name + " " + o.billing?.last_name).trim() ||
          "Cliente",
        phone: o.billing?.phone,
        email: o.billing?.email,
        billing: o.billing,
        shipping: o.shipping,
        shipping_lines: o.shipping_lines || [],
        meta_data: o.meta_data || [],
        total: o.total || null,
        total_items:
          o.line_items?.reduce((acc, i) => acc + i.quantity, 0) || 0,
        date_created: o.date_created,
        customer_note: o.customer_note,
        items: o.line_items || [],
      };
    });
  };

  if (
    sessionInfo.snapshot_pedidos &&
    sessionInfo.snapshot_pedidos.length > 0
  ) {
    ordersData = processOrderData(sessionInfo.snapshot_pedidos);
  } else {
    try {
      // Multi-sede: usar cliente WC de la sede de la sesión
      const detailClient = await getWooClient(
        sessionInfo.sede_id || sedeId,
      );
      const wooProms = sessionInfo.ids_pedidos.map((id) =>
        detailClient.get(`orders/${id}`),
      );
      const wooRes = await Promise.all(wooProms);
      ordersData = processOrderData(wooRes.map((r) => r.data));
    } catch (e) {
      ordersData = sessionInfo.ids_pedidos.map((id) => ({
        id,
        customer: "#" + id,
        total_items: 0,
      }));
    }
  }

  const { data: assignments } = await supabase
    .from("wc_asignaciones_pedidos")
    .select("id")
    .eq("id_sesion", session_id);
  const assignIds = assignments.map((a) => a.id);

  let logs = [];
  if (assignIds.length > 0) {
    const { data: ls, error: logError } = await supabase
      .from("wc_log_picking")
      .select("*, wc_asignaciones_pedidos(nombre_picker)")
      .in("id_asignacion", assignIds)
      .order("fecha_registro", { ascending: true });

    if (logError) throw logError;
    logs = ls;

    try {
      const missingIds = new Set();
      logs.forEach((l) => {
        if (
          l.es_sustituto &&
          l.id_producto_final &&
          !productDetailsMap[l.id_producto_final]
        ) {
          missingIds.add(l.id_producto_final);
        }
      });
      if (missingIds.size > 0) {
        const subClient = await getWooClient(
          sessionInfo.sede_id || sedeId,
        );
        const { data: subProds } = await subClient.get(
          `products?include=${Array.from(missingIds).join(",")}&per_page=100`,
        );
        if (subProds) {
          subProds.forEach((p) => {
            const catalogPrice = parseFloat(p.price) || 0;
            productDetailsMap[p.id] = {
              name: p.name,
              image: p.images[0]?.src,
              sku: p.sku,
              price: catalogPrice,
              catalog_price: catalogPrice,
              subtotal: catalogPrice,
              line_total: catalogPrice,
              unidad_medida:
                (p.attributes || []).find((a) =>
                  a.name.toLowerCase().includes("unidad"),
                )?.options[0] || "UND",
            };
          });
        }
      }
    } catch (e) {}
  }

  // ✅ CÓDIGOS DE BARRAS DESDE SIESA
  // Se traen TODAS las filas de cada f120_id involucrado. La resolución de
  // presentación se hace después contra ese universo completo (ver
  // utils/siesaMatching.js): no se pre-filtra por unidad de medida, porque
  // esa unidad puede ser justamente el dato equivocado.
  const f120IdOnlySet = new Set();
  Object.values(productDetailsMap).forEach((p) => {
    const f120_id = parseInt(p.sku);
    if (!isNaN(f120_id)) f120IdOnlySet.add(f120_id);
  });

  // 🔧 TAMBIÉN incluir f120_ids de los barcodes que el picker escaneó
  // Esto cubre el caso donde el SKU de WooCommerce no coincide con el f120_id de SIESA
  const scannedBarcodes = [
    ...new Set(
      logs
        .filter((l) => l.codigo_barras_escaneado)
        .map((l) => l.codigo_barras_escaneado.toString().trim()),
    ),
  ];
  if (scannedBarcodes.length > 0) {
    try {
      const { data: scannedSiesa } = await supabase
        .from("siesa_codigos_barras")
        .select("f120_id")
        .in("codigo_barras", scannedBarcodes);
      if (scannedSiesa) {
        scannedSiesa.forEach((bc) => f120IdOnlySet.add(bc.f120_id));
      }
    } catch (e) {
      console.warn(
        "⚠️ Error buscando f120_ids de barcodes escaneados:",
        e.message,
      );
    }
  }

  // Todas las presentaciones que SIESA conoce de cada f120_id.
  // Paginar para evitar el límite default de 1000 filas de Supabase.
  const f120IdArray = Array.from(f120IdOnlySet);
  let allSiesaBarcodes = [];
  let siesaError = null;
  const BATCH_SIZE = 500;
  for (let i = 0; i < f120IdArray.length; i += BATCH_SIZE) {
    const batch = f120IdArray.slice(i, i + BATCH_SIZE);
    const { data: batchData, error: batchError } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras, unidad_medida")
      .in("f120_id", batch)
      .limit(10000);
    if (batchError) {
      siesaError = batchError;
      break;
    }
    if (batchData) allSiesaBarcodes = allSiesaBarcodes.concat(batchData);
  }

  if (siesaError) {
    console.error(
      "⚠️ Error trayendo códigos SIESA para la auditoría:",
      siesaError.message,
    );
  }

  // =================================================================
  // RESOLUCIÓN DE PRESENTACIÓN Y CÓDIGO DE BARRAS POR PRODUCTO
  //
  // Toda la decisión vive en `utils/siesaMatching.js`. Antes había una
  // copia local de `inferUnitMeasureFromName` acá, con dos problemas
  // graves que trababan auditorías:
  //
  //   1. La confianza de la inferencia se calculaba y se TIRABA. Una UM
  //      adivinada sobre el nombre del producto salía al frontend
  //      indistinguible de un dato real, y después invalidaba el código
  //      correcto del producto correcto.
  //   2. El fallback era `availableUMs[0]`: el orden que devolviera
  //      Postgres. La misma sesión podía pedir distinta presentación en
  //      dos consultas.
  //
  // Ahora cada producto viaja con `unidad_medida_confiable`, y el
  // validador solo bloquea por presentación cuando eso es `true`.
  // =================================================================
  Object.keys(productDetailsMap).forEach((productId) => {
    const detalle = productDetailsMap[productId];
    const f120_id = parseInt(detalle.sku, 10);
    if (isNaN(f120_id)) {
      detalle.unidad_medida_confiable = false;
      detalle.unidad_medida_fuente = "sin_sku";
      detalle.barcode_sku_um = null;
      return;
    }

    const umsDisponibles = availableUMsFor(allSiesaBarcodes || [], f120_id);

    const resuelta = resolveExpectedUM({
      umWoo: detalle.unidad_medida,
      sku: detalle.sku,
      nombre: detalle.name || "",
      umsDisponibles,
    });

    // ⚠️ DOS UNIDADES DE MEDIDA DISTINTAS. No confundirlas: hacerlo cambia
    // cuánta plata se cobra.
    //
    //   `unidad_medida`       — la de WooCommerce. Describe la PRESENTACIÓN
    //     FÍSICA que compró el cliente (500g, Kg, Und). Gobierna el peso
    //     (`kgPerUnit`) y el cobro (`calcLineCharge`). NO SE TOCA.
    //   `unidad_medida_siesa` — cómo está catalogado el CÓDIGO DE BARRAS en
    //     SIESA. Solo sirve para matchear códigos y armar el código del
    //     manifiesto.
    //
    // Caso real que lo probó (sesión 00281109, "Tocino Carnudo Kilo - 500g"):
    // Woo manda `500g`, SIESA solo conoce `KL`. Pisar la de Woo con la de
    // SIESA duplicaba el peso del GS1 — `kgPerUnit("500g")` es 0.5 y
    // `kgPerUnit("KL")` es 1.0.
    detalle.unidad_medida_siesa = resuelta.um;
    detalle.unidad_medida_confiable = resuelta.confiable;
    detalle.unidad_medida_fuente = resuelta.fuente;
    detalle.unidades_disponibles = umsDisponibles;

    // Código de barras: preferir el de la presentación resuelta; si no
    // hay, cualquiera del producto sirve para MOSTRAR (la validación ya
    // no depende de este campo, compara contra SIESA completo).
    const filasDelProducto = (allSiesaBarcodes || []).filter(
      (bc) => bc.f120_id === f120_id,
    );
    const deLaPresentacion = filasDelProducto.find(
      (bc) => normalizeUM(bc.unidad_medida) === normalizeUM(resuelta.um),
    );
    const elegida = deLaPresentacion || filasDelProducto[0] || null;
    detalle.barcode = elegida ? normalizeBarcode(elegida.codigo_barras) : null;

    // Todos los códigos válidos del producto: el auditor acepta cualquiera.
    detalle.barcodes_producto = filasDelProducto
      .map((bc) => normalizeBarcode(bc.codigo_barras))
      .filter(Boolean);

    // Código para el manifiesto/QR: se ELIGE entre los códigos que el
    // producto realmente tiene en `siesa_codigos_barras`. En el QR solo van
    // códigos de barras reales — la caja no entiende un ítem suelto ni un
    // código fabricado. Si el producto no tiene ninguno, queda en null y el
    // manifiesto lo reporta para digitarlo a mano.
    // Base GS1 REAL de SIESA para pesables ("2900061"), no fabricada desde
    // el SKU: el prefijo real no es 29+f120_id. Sin esto el manifiesto
    // inventaba un código que la caja no puede resolver.
    detalle.gs1_base = findGs1Base(filasDelProducto, f120_id);

    detalle.barcode_sku_um = buildManifestCode({
      f120_id,
      um: resuelta.um,
      barcode: detalle.barcode,
      siesaRows: filasDelProducto,
    });
  });

  // ✅ OBTENER CATEGORÍAS REALES para detección fruver/carnicería en auditor
  try {
    const productIdsForCat = Object.keys(productDetailsMap)
      .map(Number)
      .filter((id) => !isNaN(id));
    if (incluirCategorias && productIdsForCat.length > 0) {
      const catClient = await getWooClient(sessionInfo.sede_id || sedeId);
      const { data: productsWithCats } = await catClient.get("products", {
        include: productIdsForCat.join(","),
        per_page: 100,
        _fields: "id,categories",
      });
      if (productsWithCats) {
        productsWithCats.forEach((p) => {
          if (p.categories && productDetailsMap[p.id]) {
            productDetailsMap[p.id].categorias_reales = p.categories
              .map((c) => c.name)
              .filter((n) => n !== "Uncategorized");
          }
        });
      }
    }
  } catch (e) {
    console.warn(
      "⚠️ No se pudieron obtener categorías para auditor:",
      e.message,
    );
  }

  // 🔧 CAMBIO DE ESTRATEGIA:
  // Enviar TODOS los logs y productos como están (sin filtrar)
  // El filtrado se hace en el FRONTEND (VistaAuditor)
  // que decidirá qué mostrar en "Por verificar" vs "Productos confiables"

  // Identificar productos PESABLES (fruver/carnes) para marcar en el frontend
  Object.entries(productDetailsMap).forEach(([id, detail]) => {
    if (isWeighableUnit(detail.unidad_medida)) {
      detail._isWeighable = true; // Marcar para que frontend lo detecte
    }
  });

  // Enviar TODOS los logs sin filtrar
  const auditableLogs = logs;

  // Índice de códigos para la validación local del auditor.
  // Claves NORMALIZADAS (sin el '+' de SIESA, que ninguna etiqueta física
  // trae) y valor en LISTA: un mismo EAN puede estar registrado para varias
  // presentaciones y el mapa plano anterior se quedaba con la última.
  const auditBarcodeIndex = buildBarcodeIndex(allSiesaBarcodes || []);
  const auditBarcodeMap = {};
  Object.entries(auditBarcodeIndex).forEach(([code, entries]) => {
    auditBarcodeMap[code] = {
      f120_id: entries[0].f120_id,
      unidad_medida: entries[0].unidad_medida,
      presentaciones: entries,
    };
  });

  // Ítems canónicos del manifiesto/QR — UNA entrada por línea de pedido.
  // `products_map` NO sirve para esto (duplica variaciones y colapsa el
  // mismo producto pedido por dos clientes). Ver utils/manifestItems.js.
  const { items: manifestItems, warnings: manifestWarnings } =
    buildManifestItems({ ordersData, productDetailsMap });

  if (manifestWarnings.colisiones.length > 0) {
    console.warn(
      `⚠️ [MANIFIESTO] ${manifestWarnings.colisiones.length} colisión(es) de código en la sesión ${sessionInfo.id}:`,
      JSON.stringify(manifestWarnings.colisiones),
    );
  }
  if (manifestWarnings.sin_codigo.length > 0) {
    console.warn(
      `⚠️ [MANIFIESTO] ${manifestWarnings.sin_codigo.length} ítem(s) sin código resoluble en la sesión ${sessionInfo.id}`,
    );
  }


  return {
    metadata: {
      session_id: sessionInfo.id,
      picker_name: sessionInfo.wc_pickers?.nombre_completo || "Sin Asignar",
      picker_email: sessionInfo.wc_pickers?.email || "",
      start_time: sessionInfo.fecha_inicio,
      end_time: sessionInfo.fecha_fin,
      status: sessionInfo.estado,
      total_orders: sessionInfo.ids_pedidos.length,
    },
    orders_info: ordersData,
    products_map: productDetailsMap,
    // ⬇️ Usar ESTO para el QR, no `products_map`.
    manifest_items: manifestItems,
    manifest_warnings: manifestWarnings,
    audit_barcode_index: auditBarcodeIndex,
    audit_barcode_map: auditBarcodeMap,
    logs: auditableLogs, // 🔧 TODOS los logs sin filtrar (frontend decide qué validar)
    final_snapshot: sessionInfo.datos_salida || null,
  };
}

