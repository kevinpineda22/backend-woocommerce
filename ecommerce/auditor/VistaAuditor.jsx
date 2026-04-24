import React, { useState, useEffect, useRef } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import { isWeighableUnit } from "../shared/weighableUnits";
import EscanerBarras from "../../DesarrolloSurtido_API/EscanerBarras";
import ManifestInvoiceModal from "../shared/ManifestInvoiceModal";
import {
  extractDocumento,
  extractMetodoPago,
} from "../shared/extractDocumento";
import { useSedeContext } from "../shared/SedeContext";
import { supabase } from "../../../supabaseClient";
import {
  FaClipboardCheck,
  FaSearch,
  FaCheck,
  FaTimes,
  FaCamera,
  FaHistory,
  FaListOl,
  FaUserCircle,
  FaDice,
  FaCheckDouble,
  FaKeyboard,
  FaExclamationTriangle,
  FaSpinner,
  FaBarcode,
  FaBoxOpen,
  FaArrowRight,
  FaFileInvoice,
  FaShieldAlt,
  FaSearchPlus,
  FaInfoCircle,
  FaExclamationCircle,
  FaArrowLeft,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import "./VistaAuditor.css";

const VistaAuditor = ({ initialSessionId = null, onClose = null }) => {
  const { sedeName } = useSedeContext();
  const [sessionId, setSessionId] = useState(initialSessionId || "");
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const isEmbedded = !!onClose;

  const [scannerMode, setScannerMode] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState("inventory");

  const [requiredItems, setRequiredItems] = useState(new Set());
  const [verifiedItems, setVerifiedItems] = useState(new Set());
  const [barcodeMap, setBarcodeMap] = useState({}); // codigo_barras → { f120_id, unidad_medida }
  const [manualVerifyCode, setManualVerifyCode] = useState("");
  const [showInvoices, setShowInvoices] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [showTrusted, setShowTrusted] = useState(false);

  const showFeedback = (type, message) => {
    if (navigator.vibrate) {
      if (type === "success") navigator.vibrate([50, 50]);
      if (type === "warning") navigator.vibrate([100]);
      if (type === "error") navigator.vibrate([200, 100, 200]);
    }
    setScanFeedback({ type, message });
    setTimeout(() => {
      setScanFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // ─── DETECCIÓN DE TIPO DE PRODUCTO (por unidad de medida del pedido WooCommerce) ───
  // Lista de unidades pesables centralizada en shared/weighableUnits.js
  const isFruverOrMeatItem = (item) => {
    // 1. Unidad de medida pesable del pedido
    if (isWeighableUnit(item.unidad_medida)) return true;

    // 2. Código GS1 de peso variable (empieza con "2", 13-14 dígitos)
    const scannedBarcodes = item._scannedBarcodes;
    if (scannedBarcodes) {
      for (const code of scannedBarcodes) {
        if (/^\d{13,14}$/.test(code) && code.startsWith("2")) return true;
      }
    }
    return false;
  };

  const requiresGS1 = (itemId) => {
    const scans = auditData?.scannedBarcodes?.[itemId];
    if (!scans) return false;
    return Array.from(scans).some(
      (code) => /^\d{13,14}$/.test(code) && code.startsWith("2"),
    );
  };

  useEffect(() => {
    if (initialSessionId) {
      fetchAuditData(initialSessionId);
      return;
    }
    const storedSession = localStorage.getItem("auditor_session_id");
    if (storedSession) {
      setSessionId(storedSession);
      fetchAuditData(storedSession);
    }
  }, [initialSessionId]);

  useEffect(() => {
    if (auditData?.meta?.session_id) {
      const stateToSave = {
        sessionId: auditData.meta.session_id,
        required: Array.from(requiredItems),
        verified: Array.from(verifiedItems),
      };
      localStorage.setItem("auditor_state", JSON.stringify(stateToSave));
    }
  }, [requiredItems, verifiedItems, auditData]);

  const handleScanSuccess = (decodedText) => {
    if (navigator.vibrate) navigator.vibrate(100);
    setTimeout(() => {
      if (scannerMode === "session") {
        setSessionId(decodedText);
        fetchAuditData(decodedText);
      } else if (scannerMode === "product" && auditData) {
        verifyProductScan(decodedText);
      }
      setScannerMode(null);
    }, 200);
  };

  const verifyProductScan = async (code) => {
    const inputCode = code.trim().toUpperCase();

    // Helper: normalizar unidad de medida para comparación
    const normalizeUM = (um) => {
      const u = (um || "").toUpperCase().trim();
      if (u === "UN" || u === "UNIDAD") return "UND";
      if (u === "KG" || u === "KILO") return "KL";
      if (u === "LIBRA") return "LB";
      if (u === "500G" || u === "500GRS") return "500GR";
      return u;
    };

    // Helper: buscar en barcodeMap con fallback "+" (scanners pueden perder el "+")
    const lookupBarcode = (c) => {
      const entry = barcodeMap[c];
      if (entry) return entry;
      // Fallback: intentar con "+" por si el scanner lo omitió
      const entryPlus = barcodeMap[c + "+"];
      if (entryPlus) return entryPlus;
      return null;
    };

    try {
      // Buscar el código EXACTO en el mapa de barcodes cargado de SIESA
      // ⚠️ No quitar "+" — "1032" y "1032+" son códigos DIFERENTES
      const barcodeEntry = lookupBarcode(inputCode);
      let f120_id = null;
      let scannedUM = null; // Unidad de medida del código escaneado

      if (barcodeEntry) {
        if (typeof barcodeEntry === "object" && barcodeEntry !== null) {
          f120_id = barcodeEntry.f120_id;
          scannedUM = barcodeEntry.unidad_medida;
        } else {
          f120_id = barcodeEntry;
        }
      }

      // Ruta 2: Parsear como SKU compuesto (ej: "1032P2" → f120=1032, um=P2)
      // Esto NO es un codigo_barras, pero es un formato válido para el auditor
      if (!f120_id) {
        const skuMatch = inputCode.match(/^(\d+)([A-Z]+\d*)$/);
        if (skuMatch) {
          const parsedF120 = parseInt(skuMatch[1]);
          const parsedUM = skuMatch[2];
          // Solo aceptar si "1032P2" existe como codigo_barras en la tabla SIESA
          const skuAsBarcode = lookupBarcode(inputCode);
          if (skuAsBarcode) {
            f120_id = skuAsBarcode.f120_id || parsedF120;
            scannedUM = skuAsBarcode.unidad_medida || parsedUM;
          } else {
            // Verificar que este f120_id+UM existe en algún item del audit
            const itemExists = auditData?.items?.some((item) => {
              const itemF120 = parseInt((item.sku || "").replace(/-/g, ""));
              return !isNaN(itemF120) && itemF120 === parsedF120;
            });
            if (itemExists) {
              f120_id = parsedF120;
              scannedUM = parsedUM;
            }
          }
        }
        // ⚠️ Solo dígitos sin letras (ej: "1032") = f120_id puro → NO es un codigo_barras válido
        // No hacer nada — dejar que caiga al error
      }

      // Fallback final: consultar el backend
      if (!f120_id) {
        try {
          const firstPendingItem = auditData?.items?.find(
            (i) =>
              requiredItems.has(String(i.id)) &&
              !verifiedItems.has(String(i.id)),
          );
          if (firstPendingItem) {
            const itemF120 = parseInt(
              (firstPendingItem.sku || "").replace(/-/g, ""),
            );
            const itemUM = (
              firstPendingItem.unidad_medida || "UND"
            ).toUpperCase();
            if (!isNaN(itemF120)) {
              const resp = await ecommerceApi.post("/validar-codigo-auditor", {
                codigo: inputCode,
                f120_id_esperado: itemF120,
                unidad_medida_esperada: itemUM,
              });
              if (resp.data?.valid && resp.data?.f120_id) {
                f120_id = resp.data.f120_id;
                scannedUM = resp.data.unidad_medida || itemUM;
              }
            }
          }
        } catch (e) {
          // Silently fall through to error below
        }
      }

      if (!f120_id) {
        showFeedback("error", `El código "${inputCode}" no existe en SIESA.`);
        return;
      }

      // Buscar el item pendiente que corresponda a este f120_id Y validar unidad_medida
      let targetItem = null;
      let umMismatchMsg = null;
      for (const itemId of requiredItems) {
        if (verifiedItems.has(itemId)) continue;
        const item = auditData.items.find(
          (i) => String(i.id) === String(itemId),
        );
        if (!item) continue;

        // 1. Match por SKU del item (sku = f120_id en WooCommerce)
        const itemF120 = parseInt((item.sku || "").replace(/-/g, ""));
        if (!isNaN(itemF120) && itemF120 === f120_id) {
          // ✅ Validar unidad_medida OBLIGATORIAMENTE
          const expectedUM = normalizeUM(item.unidad_medida);
          const actualUM = normalizeUM(scannedUM);
          // Si conocemos la UM escaneada, debe coincidir con la esperada
          if (scannedUM && actualUM && expectedUM && actualUM !== expectedUM) {
            umMismatchMsg = `❌ El código "${inputCode}" es para presentación ${actualUM}, pero se esperaba ${expectedUM}.`;
            continue;
          }
          // Si NO conocemos la UM del código escaneado, rechazar — el auditor debe usar un código específico
          if (!scannedUM && expectedUM) {
            umMismatchMsg = `❌ El código "${inputCode}" no especifica presentación. Usa un código de barras específico para ${expectedUM}.`;
            continue;
          }
          targetItem = item;
          break;
        }

        // 2. Match por barcodes que el picker escaneó para este item
        const scannedCodes = auditData.scannedBarcodes?.[item.id];
        if (scannedCodes) {
          const codes =
            scannedCodes instanceof Set
              ? Array.from(scannedCodes)
              : Object.values(scannedCodes);
          const match = codes.some((sc) => {
            const scUpper = (sc || "").trim().toUpperCase();
            const entry = lookupBarcode(scUpper);
            const scF120 = typeof entry === "object" ? entry?.f120_id : entry;
            return scF120 === f120_id;
          });
          if (match) {
            const expectedUM = normalizeUM(item.unidad_medida);
            const actualUM = normalizeUM(scannedUM);
            if (
              scannedUM &&
              actualUM &&
              expectedUM &&
              actualUM !== expectedUM
            ) {
              umMismatchMsg = `❌ El código "${inputCode}" es para presentación ${actualUM}, pero se esperaba ${expectedUM}.`;
              continue;
            }
            if (!scannedUM && expectedUM) {
              umMismatchMsg = `❌ El código "${inputCode}" no especifica presentación. Usa un código de barras específico para ${expectedUM}.`;
              continue;
            }
            targetItem = item;
            break;
          }
        }
      }

      if (!targetItem && umMismatchMsg) {
        showFeedback("error", umMismatchMsg);
        return;
      }

      if (!targetItem) {
        showFeedback(
          "error",
          `El código "${inputCode}" existe en SIESA (item ${f120_id}), pero no corresponde a ningún producto por validar.`,
        );
        return;
      }

      // Código existe en SIESA y corresponde a un item pendiente → verificado
      setVerifiedItems((prev) => new Set(prev).add(targetItem.id));
      showFeedback("success", `✅ ${targetItem.name} verificado correctamente`);
    } catch (error) {
      console.error("Error validando código:", error.message);
      showFeedback("error", `Error al validar: ${error.message}`);
      return;
    }
  };

  const handleManualVerify = () => {
    if (!manualVerifyCode.trim()) {
      showFeedback("warning", "Por favor ingresa un código manualmente.");
      return;
    }
    verifyProductScan(manualVerifyCode);
    setManualVerifyCode("");
  };

  const generateSmartSample = (
    items,
    logs,
    metadata,
    scannedBarcodesMap = {},
  ) => {
    // 🔧 LÓGICA CORRECTA: Solo incluir productos que REQUIEREN validación
    // Excluir: Frutas/verduras/carnes (pesables) que ya fueron validadas con GS1
    // Incluir: Variaciones (UND, P2, P3, P4) que deben verificarse
    const eligibleItems = items.filter((item) => {
      // Adjuntamos los barcodes escaneados para la detección
      const itemWithBarcodes = {
        ...item,
        _scannedBarcodes: scannedBarcodesMap[item.id]
          ? Array.from(scannedBarcodesMap[item.id])
          : [],
      };
      // Excluir pesables (fruver/carnes) - ya validados con GS1
      if (isFruverOrMeatItem(itemWithBarcodes)) return false;

      // Incluir variaciones que requieren validación
      return true;
    });

    const groupedByOrder = {};
    eligibleItems.forEach((item) => {
      const itemIdStr = String(item.id);
      const relatedLog = logs.find(
        (l) =>
          String(l.es_sustituto ? l.id_producto_final : l.id_producto) ===
          itemIdStr,
      );
      if (relatedLog) {
        const orderId = relatedLog.id_pedido;
        if (!groupedByOrder[orderId]) groupedByOrder[orderId] = [];
        groupedByOrder[orderId].push(item.id);
      }
    });

    const orderIds = Object.keys(groupedByOrder);
    const totalOrders = orderIds.length;
    const selectedIds = new Set();
    const SAMPLE_SIZE = totalOrders === 1 ? 3 : 2;

    orderIds.forEach((orderId) => {
      const productsInOrder = groupedByOrder[orderId];
      const shuffled = productsInOrder.sort(() => 0.5 - Math.random());
      const selection = shuffled.slice(0, SAMPLE_SIZE);
      selection.forEach((id) => selectedIds.add(id));
    });

    if (selectedIds.size === 0 && eligibleItems.length > 0) {
      selectedIds.add(eligibleItems[0].id);
    }

    return selectedIds;
  };

  const fetchAuditData = async (id) => {
    if (!id) return;
    setLoading(true);
    setErrorMsg("");
    setAuditData(null);
    setVerifiedItems(new Set());
    setScannerMode(null);

    try {
      const res = await ecommerceApi.get(`/historial-detalle?session_id=${id}`);
      const {
        metadata,
        logs,
        orders_info,
        products_map,
        audit_barcode_map,
        final_snapshot,
      } = res.data;

      if (!logs || logs.length === 0) {
        setErrorMsg("Sesión vacía o no encontrada.");
        setLoading(false);
        return;
      }

      const itemsMap = {};
      let substitutedCount = 0;
      const scannedBarcodesMap = {}; // ✅ NUEVO: Mapa de códigos escaneados por producto
      const allBarcodesSet = new Set(); // Para construir el barcodeMap universal

      logs.forEach((log) => {
        if (log.accion === "recolectado" || log.accion === "sustituido") {
          const prodId = log.es_sustituto
            ? log.id_producto_final || log.id_producto
            : log.id_producto;

          // 🚀 CLAVE MAESTRA COMPUESTA: ID Producto + ID Pedido
          // Esto evita que la yuca del pedido A se sume a la del pedido B
          const key = `${prodId}-${log.id_pedido}`;

          if (log.codigo_barras_escaneado) {
            const normalized = log.codigo_barras_escaneado
              .trim()
              .replace(/\+$/, "")
              .toUpperCase();
            if (!scannedBarcodesMap[key]) {
              scannedBarcodesMap[key] = new Set();
            }
            scannedBarcodesMap[key].add(normalized);
            allBarcodesSet.add(normalized);
          }

          if (!itemsMap[key]) {
            const prodDetail = products_map ? products_map[prodId] : null;
            itemsMap[key] = {
              id: key,
              real_prod_id: String(prodId),
              name: log.es_sustituto
                ? log.nombre_sustituto
                : log.nombre_producto,
              original_name: log.nombre_producto,
              count: 0,
              peso_total: 0,
              is_sub: log.es_sustituto,
              price: prodDetail?.price || log.precio_nuevo || 0,
              catalog_price:
                prodDetail?.catalog_price ||
                prodDetail?.price ||
                log.precio_nuevo ||
                0,
              subtotal: prodDetail?.subtotal || 0,
              line_total: prodDetail?.line_total || 0,
              order_id: log.id_pedido,
              image: prodDetail?.image || null,
              sku: prodDetail?.sku || null,
              barcode: prodDetail?.barcode || null,
              unidad_medida: prodDetail?.unidad_medida || null,
              categorias_reales: prodDetail?.categorias_reales || null,
            };
          }
          const cantAfectada = log.cantidad_afectada || 1;
          itemsMap[key].count += cantAfectada;
          if (log.peso_real) {
            itemsMap[key].peso_total +=
              parseFloat(log.peso_real) * cantAfectada;
          }
          if (log.es_sustituto) substitutedCount += 1;
        }
      });

      // Construir barcodeMap universal con todos los códigos de la tabla SIESA (audit_barcode_map)
      // ⚠️ NO quitar "+" de las claves — el "+" es parte del codigo_barras real en SIESA
      // Formato: { codigo_barras_original: { f120_id, unidad_medida } }
      const normalizedBarcodeMap = {};
      if (audit_barcode_map) {
        Object.entries(audit_barcode_map).forEach(([raw, value]) => {
          const key = (raw || "").trim().toUpperCase();
          normalizedBarcodeMap[key] =
            typeof value === "object"
              ? value
              : { f120_id: value, unidad_medida: null };
        });
      }
      // También incluir los barcodes escaneados por el picker (por si hay alguno que no está en audit_barcode_map)
      allBarcodesSet.forEach((code) => {
        if (!(code in normalizedBarcodeMap)) {
          const existing = barcodeMap[code];
          normalizedBarcodeMap[code] = existing || null;
        }
      });
      setBarcodeMap(normalizedBarcodeMap);

      const itemsArray = Object.values(itemsMap);

      // 🚀 LÓGICA MAESTRA AUDITOR: Auto-verificar productos pesables (Fruver/Carnes)
      const autoVerifiedIds = new Set();
      itemsArray.forEach((item) => {
        const itemWithBarcodes = {
          ...item,
          _scannedBarcodes: scannedBarcodesMap[item.id]
            ? Array.from(scannedBarcodesMap[item.id])
            : [],
        };
        if (isFruverOrMeatItem(itemWithBarcodes)) {
          autoVerifiedIds.add(String(item.id));
        }
      });

      const storedStateStr = localStorage.getItem("auditor_state");
      let loadedFromStorage = false;

      if (storedStateStr) {
        try {
          const storedState = JSON.parse(storedStateStr);
          if (storedState.sessionId === metadata.session_id) {
            setRequiredItems(new Set(storedState.required.map(String)));
            const combinedVerified = new Set([
              ...storedState.verified.map(String),
              ...Array.from(autoVerifiedIds),
            ]);
            setVerifiedItems(combinedVerified);
            loadedFromStorage = true;
          }
        } catch (e) {}
      }

      if (!loadedFromStorage) {
        const sampleSet = generateSmartSample(
          itemsArray,
          logs,
          metadata,
          scannedBarcodesMap,
        );
        setRequiredItems(sampleSet);
        setVerifiedItems(autoVerifiedIds);
      }

      localStorage.setItem("auditor_session_id", metadata.session_id);

      let duration = "En curso";
      if (metadata.end_time && metadata.start_time) {
        const diff =
          new Date(metadata.end_time) - new Date(metadata.start_time);
        duration = Math.round(diff / 60000) + " min";
      }

      const groupedGroups = {};
      if (orders_info) {
        orders_info.forEach((ord) => {
          groupedGroups[ord.id] = { ...ord, items: [] };
        });
      }

      // 🔧 DEDUPLICAR: Si hay dos items con el mismo ID, mantener el que tiene order_id válido
      const itemsByIdMap = {};
      itemsArray.forEach((item) => {
        if (!itemsByIdMap[item.id]) {
          itemsByIdMap[item.id] = item;
        } else {
          // Si el nuevo item tiene order_id y el anterior no, reemplazar
          if (item.order_id && !itemsByIdMap[item.id].order_id) {
            itemsByIdMap[item.id] = item;
          }
        }
      });
      const deduplicatedArray = Object.values(itemsByIdMap);

      deduplicatedArray.forEach((item) => {
        if (groupedGroups[item.order_id]) {
          groupedGroups[item.order_id].items.push(item);
        } else {
          if (!groupedGroups["others"])
            groupedGroups["others"] = {
              id: "others",
              customer: "Otros",
              items: [],
            };
          groupedGroups["others"].items.push(item);
        }
      });

      const finalGroups = Object.values(groupedGroups).filter(
        (g) => g.items.length > 0,
      );

      setAuditData({
        meta: metadata,
        items: itemsArray,
        groupedItems: finalGroups,
        rawLogs: logs,
        scannedBarcodes: scannedBarcodesMap, // ✅ NUEVO: Mapa de códigos escaneados
        // ✅ Guardamos el snapshot si existe
        finalSnapshot: final_snapshot,
        stats: {
          totalPhysicalItems: itemsArray.length,
          substitutedCount,
          duration,
        },
      });

      // ✅ Ya se usó audit_barcode_map arriba en normalizedBarcodeMap (línea setBarcodeMap)
      // NO sobreescribir con el mapa raw — el normalizado ya incluye todo
    } catch (error) {
      setErrorMsg("Error consultando la sesión.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    if (e.key === "Enter") fetchAuditData(sessionId);
  };

  const clearAudit = () => {
    setAuditData(null);
    setSessionId("");
    setErrorMsg("");
    setVerifiedItems(new Set());
    setRequiredItems(new Set());
    setShowInvoices(false);
    localStorage.removeItem("auditor_session_id");
    localStorage.removeItem("auditor_state");
  };

  const isAuditComplete = () => {
    if (!auditData) return false;
    const requiredArray = Array.from(requiredItems);
    return requiredArray.every((id) => verifiedItems.has(id));
  };

  // ✅ GENERAMOS EL SNAPSHOT FINAL PARA LA DB
  const generateOutputData = () => {
    if (!auditData) return null;
    return auditData.groupedItems.map((group) => {
      // Detectar método de envío: recogida (305) o domicilio (304)
      const isPickup = (group.shipping_lines || []).some(
        (ship) => ship.method_id === "local_pickup",
      );
      const shippingBarcode = isPickup ? "305" : "304";
      const shippingLabel = isPickup
        ? "Recogida en tienda"
        : "Domicilio e-commerce envío";

      const productItems = group.items.map((i) => {
        const scannedSet = auditData.scannedBarcodes[i.id];
        let exactScannedBarcode = null;

        if (scannedSet && scannedSet.size > 0) {
          // Tomar lo que se escaneó, eliminando prefijo M/N (la caja no los acepta)
          const cleanedBarcodes = Array.from(scannedSet).map((code) => {
            const upper = code.toUpperCase();
            if (upper.startsWith("M") || upper.startsWith("N")) {
              return upper.substring(1);
            }
            return code;
          });
          if (cleanedBarcodes.length > 0) {
            exactScannedBarcode = cleanedBarcodes.join(",");
          }
        }

        // Fallback: si no hay barcode escaneado, construir desde SKU + unidad_medida
        // Esto genera códigos como "1039UND" que ManifestSheet puede usar
        // ⚠️ SKU de variaciones WooCommerce puede ser "1039-UND" → extraer solo la parte numérica
        if (!exactScannedBarcode && i.sku) {
          const numSku = ((i.sku || "").match(/^(\d+)/) || [])[1] || "";
          const um = (i.unidad_medida || "").toUpperCase();
          if (numSku && um) {
            exactScannedBarcode = `${numSku}${um}`;
          } else if (numSku) {
            exactScannedBarcode = numSku;
          }
        }

        return {
          id: i.id,
          sku: i.sku || i.id,
          name: i.name,
          original_name: i.original_name || null,
          qty: i.count,
          peso_total: i.peso_total || 0,
          price: i.price,
          catalog_price: i.catalog_price || i.price || 0,
          subtotal: i.subtotal || i.price || 0,
          line_total: i.line_total || i.price || 0,
          is_sub: i.is_sub,
          barcode: (() => {
            let bc = exactScannedBarcode || i.barcode || "";
            if (typeof bc === "string" && /^[MNmn]/.test(bc))
              bc = bc.substring(1);
            return bc;
          })(),
          unidad_medida: i.unidad_medida || "",
          tiene_variaciones: i.tiene_variaciones || false,
        };
      });

      // Inyectar ítem virtual de método de despacho al final
      const shippingPrice = (group.shipping_lines || []).reduce(
        (sum, s) => sum + (parseFloat(s.total) || 0),
        0,
      );

      // ✅ RECALCULAR TOTAL REAL (Suma de items + envío)
      // No podemos confiar en group.total porque es el total original de WooCommerce
      // antes de que el picker eliminara o sustituyera productos.
      const calculatedTotal =
        productItems.reduce((sum, item) => {
          const itemPrice = parseFloat(item.line_total) || 0;
          return sum + itemPrice * item.qty;
        }, 0) + shippingPrice;

      productItems.push({
        id: `shipping-${group.id}`,
        sku: shippingBarcode,
        name: shippingLabel,
        qty: 1,
        price: shippingPrice,
        barcode: shippingBarcode,
        is_shipping_method: true,
      });

      return {
        id: group.id,
        customer: group.customer,
        billing: group.billing,
        shipping: group.shipping,
        shipping_lines: group.shipping_lines || [],
        meta_data: group.meta_data || [],
        total: calculatedTotal,
        items: productItems,
      };
    });
  };

  // ✅ RESTAURAR HISTORIAL
  const handleViewHistorical = () => {
    if (auditData.finalSnapshot) {
      // Reemplazamos la vista actual con el snapshot guardado
      setAuditData((prev) => ({
        ...prev,
        groupedItems: prev.groupedItems,
      }));
      setShowInvoices(true);
    }
  };

  const handleFinishAudit = async () => {
    if (!isAuditComplete()) {
      alert("⚠️ Faltan productos por verificar.");
      return;
    }
    if (
      !window.confirm(
        "¿Seguro que deseas liberar esta sesión y generar el QR de salida?",
      )
    )
      return;

    try {
      setLoading(true);

      // PREPARAMOS EL SNAPSHOT PARA GUARDAR EN DB (HISTÓRICO)
      // Debe tener la estructura que PedidosAdmin espera para el manifiesto: { timestamp, items }
      const snapshotPayload = {
        timestamp: new Date().toISOString(),
        session_id: auditData.meta.session_id,
        orders: generateOutputData(),
      };

      // Llamamos al nuevo endpoint que genera el QR en backend
      const response = await ecommerceApi.post(`/auditor/finalizar`, {
        session_id: auditData.meta.session_id,
        datos_salida: snapshotPayload,
      });

      const data = response.data;
      if (response.status !== 200)
        throw new Error(data.error || "Error al finalizar");

      // 1. Inyectamos el QR generado por el servidor en el estado
      const newAuditData = { ...auditData };
      newAuditData.meta.status = "auditado";

      // Si el backend nos devuelve qr_data, lo usamos como la verdad absoluta
      if (data.qr_data) {
        newAuditData.finalSnapshot = data.qr_data;
      }

      setAuditData(newAuditData);
      setShowInvoices(true); // Mostramos pantalla de impresión
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString) =>
    isoString
      ? new Date(isoString).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  if (showInvoices && auditData) {
    // Construir manifestData con la misma estructura que usa el admin
    const qrData = auditData.finalSnapshot || {
      session_id: auditData.meta.session_id,
      timestamp: new Date().toISOString(),
      orders: generateOutputData(),
    };

    const manifestData = {
      ...qrData,
      session_id: auditData.meta.session_id,
      picker: auditData.meta.picker_name || "Sistema WMS",
      sede_nombre: sedeName || null,
    };

    return (
      <ManifestInvoiceModal manifestData={manifestData} onClose={clearAudit} />
    );
  }

  return (
    <div className="auditor-layout">
      <header className="auditor-header">
        <div className="aud-header-left">
          {isEmbedded ? (
            <button
              className="aud-back-button"
              title="Volver a la lista"
              onClick={onClose}
            >
              <FaArrowLeft />
            </button>
          ) : (
            <Link
              to="/acceso"
              className="aud-back-button"
              title="Volver al panel"
            >
              <FaArrowLeft />
            </Link>
          )}
        </div>
        <h1>
          <FaClipboardCheck /> Auditoría
        </h1>
        <div className="aud-header-right">
          {auditData && auditData.meta?.status !== "auditado" && (
            <button
              className="aud-exit-session-btn"
              title="Salir de la sesión"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Salir de esta sesión? Podrás retomar la auditoría más tarde.",
                  )
                ) {
                  clearAudit();
                }
              }}
            >
              <FaTimes /> Salir
            </button>
          )}
        </div>
      </header>

      <EscanerBarras
        isScanning={!!scannerMode}
        setIsScanning={(val) => setScannerMode(val ? scannerMode : null)}
        onScan={handleScanSuccess}
      />

      <div className="auditor-body">
        {!auditData && (
          <div className="aud-dashboard animate-fade-in">
            {/* HER0 SECCTION / BUSCADOR */}
            <div className="aud-hero">
              <FaShieldAlt className="aud-hero-icon" />
              <h2>Centro de Auditoría</h2>
              <p>
                Escanea el Código QR de la canasta o ingresa el ID de sesión
                manualmente para iniciar la validación del pedido.
              </p>

              <div className="scan-bar-container">
                <button
                  className="auditor-scan-btn"
                  title="Escanear QR de Sesión"
                  onClick={() => setScannerMode("session")}
                >
                  <FaCamera />
                </button>
                <input
                  className="auditor-input"
                  placeholder="Ej: d7a1b3f9..."
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  onKeyDown={handleManualSubmit}
                  autoFocus
                />
                <button
                  className="auditor-search-btn"
                  title="Buscar Sesión"
                  onClick={() => fetchAuditData(sessionId)}
                  disabled={loading || !sessionId}
                  style={{ opacity: loading || !sessionId ? 0.7 : 1 }}
                >
                  <FaSearch />
                </button>
              </div>

              {errorMsg && (
                <div className="auditor-error" style={{ marginTop: "20px" }}>
                  {errorMsg}
                </div>
              )}
              {loading && (
                <div className="auditor-loading" style={{ marginTop: "20px" }}>
                  Obteniendo datos de sesión...
                </div>
              )}
            </div>

            {/* TARJETAS EDUCATIVAS - GUÍA PARA EL AUDITOR */}
            <div className="aud-info-cards">
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaSearchPlus />
                </div>
                <h3>Validación Rigurosa</h3>
                <p>
                  Verifica que los productos físicos coincidan exactamente con
                  el pedido escaneando sus códigos de barras de forma aleatoria.
                </p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaCheckDouble />
                </div>
                <h3>Control de Sustitutos</h3>
                <p>
                  Presta especial atención a los productos sustituidos.
                  Garantiza que el cliente reciba un producto de igual o mejor
                  calidad.
                </p>
              </div>
              <div className="aud-info-card">
                <div className="aud-info-icon">
                  <FaShieldAlt />
                </div>
                <h3>Garantía de Calidad</h3>
                <p>
                  Tu rol es la última línea de defensa. Una vez aprobada la
                  salida, generas el código QR maestro para facturación y
                  despacho.
                </p>
              </div>
            </div>
          </div>
        )}

        {auditData &&
          (() => {
            // Compute sections
            const allItems = auditData.groupedItems.flatMap((g) =>
              g.items.map((i) => ({
                ...i,
                orderCustomer: g.customer,
                orderId: g.id,
              })),
            );
            const pendingItems = allItems.filter(
              (i) => requiredItems.has(i.id) && !verifiedItems.has(i.id),
            );
            const verifiedList = allItems.filter(
              (i) => requiredItems.has(i.id) && verifiedItems.has(i.id),
            );
            const trustedItems = allItems.filter(
              (i) => !requiredItems.has(i.id),
            );
            const verifiedRequiredCount = Array.from(requiredItems).filter(
              (id) => verifiedItems.has(id),
            ).length;
            const progress =
              requiredItems.size > 0
                ? Math.round((verifiedRequiredCount / requiredItems.size) * 100)
                : 0;
            const allDone = isAuditComplete();

            return (
              <div className="aud-session animate-fade-in">
                {/* ─── COMPACT META ─── */}
                <div className="aud-compact-meta">
                  <div className="aud-meta-left">
                    <span className="aud-meta-session">
                      #{auditData.meta.session_id.slice(0, 8)}
                    </span>
                    <span className="aud-meta-sep">•</span>
                    <span className="aud-meta-picker">
                      <FaUserCircle /> {auditData.meta.picker_name}
                    </span>
                  </div>
                  <div className="aud-meta-right">
                    {auditData.finalSnapshot && (
                      <button
                        className="aud-meta-qr-btn"
                        onClick={handleViewHistorical}
                        title="Ver QR Original"
                      >
                        <FaFileInvoice />
                      </button>
                    )}
                  </div>
                </div>

                {/* ─── PROGRESS BAR ─── */}
                <div className="aud-progress-section">
                  <div className="aud-progress-text">
                    <span>
                      {allDone
                        ? "✅ Auditoría completa"
                        : `${verifiedRequiredCount} de ${requiredItems.size} verificados`}
                    </span>
                    <span className="aud-progress-pct">{progress}%</span>
                  </div>
                  <div className="aud-progress-track">
                    <div
                      className={`aud-progress-fill ${allDone ? "complete" : ""}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* ─── STICKY SCANNER BAR ─── */}
                {auditData.meta.status !== "auditado" && (
                  <div className="aud-scanner-sticky">
                    <button
                      className="aud-scan-cam-btn"
                      onClick={() => setScannerMode("product")}
                      title="Escanear con Cámara"
                    >
                      <FaCamera size={20} />
                    </button>
                    <div className="aud-scan-input-wrap">
                      <input
                        className="aud-scan-input"
                        placeholder="Digitar código de barras..."
                        value={manualVerifyCode}
                        onChange={(e) => setManualVerifyCode(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleManualVerify()
                        }
                      />
                      {manualVerifyCode && (
                        <button
                          className="aud-scan-go-btn"
                          onClick={handleManualVerify}
                        >
                          <FaCheck />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── COMPLETION BANNER ─── */}
                {allDone && auditData.meta.status !== "auditado" && (
                  <div className="aud-complete-banner">
                    <FaCheckDouble size={20} />
                    <span>
                      ¡Todos los productos fueron verificados! Puedes aprobar la
                      salida.
                    </span>
                  </div>
                )}

                {/* ─── ORDERS LIST ─── */}
                <div
                  className="aud-orders-container"
                  style={{ marginTop: "20px" }}
                >
                  {auditData.groupedItems.map((group, orderIndex) => {
                    const orderItems = group.items.map((i) => ({
                      ...i,
                      orderCustomer: group.customer,
                      orderId: group.id,
                    }));
                    const pendingItems = orderItems.filter(
                      (i) =>
                        requiredItems.has(i.id) && !verifiedItems.has(i.id),
                    );
                    const verifiedList = orderItems.filter(
                      (i) => requiredItems.has(i.id) && verifiedItems.has(i.id),
                    );
                    const trustedItems = orderItems.filter(
                      (i) => !requiredItems.has(i.id),
                    );

                    // Progress calculations
                    const requiredCount =
                      pendingItems.length + verifiedList.length;
                    const verifiedCount = verifiedList.length;
                    const orderProgress =
                      requiredCount > 0
                        ? Math.round((verifiedCount / requiredCount) * 100)
                        : 100;
                    const isOrderComplete = requiredCount === verifiedCount;
                    // Obtener datos del pedido original si existe la orden en el snapshot (o en la sesión)
                    const orderData =
                      auditData.orders_info?.find((o) => o.id === group.id) ||
                      {};
                    const phone =
                      orderData.phone || orderData.billing?.phone || null;
                    const address =
                      orderData.shipping?.address_1 ||
                      orderData.billing?.address_1 ||
                      null;
                    const city =
                      orderData.shipping?.city ||
                      orderData.billing?.city ||
                      null;
                    const email =
                      orderData.email || orderData.billing?.email || null;
                    const dateCreated = orderData.date_created
                      ? new Date(orderData.date_created).toLocaleString(
                          "es-CO",
                          { dateStyle: "short", timeStyle: "short" },
                        )
                      : null;
                    const customerNote = orderData.customer_note || null;
                    const documento = extractDocumento(orderData);
                    const metodoPago = extractMetodoPago(orderData);

                    return (
                      <div
                        key={group.id || orderIndex}
                        className="aud-order-group"
                      >
                        {/* ORDER HEADER ENRIQUECIDO */}
                        <div className="aud-order-header">
                          <div className="aud-order-customer">
                            <div className="aud-order-title-row">
                              <span className="aud-order-customer-name">
                                👤 {group.customer}
                              </span>
                              <span className="aud-order-id-badge">
                                {group.id === "others"
                                  ? "Ítems sin pedido"
                                  : `Pedido: ${group.id}`}
                              </span>
                            </div>
                            {(phone ||
                              address ||
                              email ||
                              dateCreated ||
                              customerNote) && (
                              <div className="aud-order-customer-details">
                                {dateCreated && (
                                  <div
                                    className="aud-order-detail-line"
                                    style={{
                                      color: "#3b82f6",
                                      fontWeight: 700,
                                    }}
                                  >
                                    <span>📅 Fecha: {dateCreated}</span>
                                  </div>
                                )}
                                {phone && (
                                  <div className="aud-order-detail-line">
                                    <span>📞 {phone}</span>
                                  </div>
                                )}
                                {documento && (
                                  <div className="aud-order-detail-line">
                                    <span>🪪 Documento: {documento}</span>
                                  </div>
                                )}
                                {metodoPago && (
                                  <div className="aud-order-detail-line">
                                    <span>💳 Pago: {metodoPago}</span>
                                  </div>
                                )}
                                {email && (
                                  <div className="aud-order-detail-line">
                                    <span>✉️ {email}</span>
                                  </div>
                                )}
                                {address && (
                                  <div className="aud-order-detail-line">
                                    <span>
                                      📍 {address}
                                      {city ? `, ${city}` : ""}
                                    </span>
                                  </div>
                                )}
                                {customerNote && (
                                  <div
                                    className="aud-order-detail-line"
                                    style={{
                                      marginTop: "4px",
                                      background: "#fef9c3",
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      color: "#854d0e",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span>
                                      📝 Nota del Cliente: {customerNote}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="aud-order-progress">
                            <div className="aud-order-progress-text">
                              {isOrderComplete
                                ? "✅ Todo verificado"
                                : `${verifiedCount} de ${requiredCount} verificados`}
                            </div>
                            <div className="aud-order-progress-bar">
                              <div
                                className={`aud-order-progress-fill ${isOrderComplete ? "complete" : ""}`}
                                style={{ width: `${orderProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* ORDER BODY WITH SECTIONS */}
                        <div className="aud-order-body">
                          {/* 1. Pendientes */}
                          {pendingItems.length > 0 && (
                            <div className="aud-section">
                              <div
                                className="aud-section-header pending"
                                style={{
                                  background: "#fef3c7",
                                  padding: "8px 12px",
                                  marginBottom: "8px",
                                }}
                              >
                                <FaExclamationCircle />
                                <span>
                                  Pendientes de verificar ({pendingItems.length}
                                  )
                                </span>
                              </div>
                              <div className="aud-items-list compact">
                                {pendingItems.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className={`aud-item-card pending ${item.is_sub ? "sub" : ""}`}
                                  >
                                    {/* COLUMNA 1: IMAGEN */}
                                    <div className="aud-item-img-col">
                                      <div className="aud-item-img">
                                        {item.image ? (
                                          <img src={item.image} alt="" />
                                        ) : (
                                          <FaBoxOpen className="aud-item-placeholder" />
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 2: INFO CENTRAL */}
                                    <div className="aud-item-info">
                                      <div className="aud-item-name">
                                        {item.name}
                                      </div>
                                      {item.is_sub && (
                                        <div className="aud-sub-details">
                                          <div className="aud-sub-original">
                                            <span className="aud-label-tiny">
                                              PIDIÓ:
                                            </span>{" "}
                                            {item.original_name}
                                          </div>
                                          <div className="aud-sub-replacement">
                                            <span className="aud-label-tiny">
                                              LLEVAS:
                                            </span>{" "}
                                            {item.name}
                                          </div>
                                        </div>
                                      )}
                                      <div className="aud-item-action">
                                        {requiresGS1(item.id) ? (
                                          <span className="aud-type-badge meat">
                                            ⚖️ Escanear etiqueta GS1
                                          </span>
                                        ) : isFruverOrMeatItem(item) ? (
                                          <button
                                            className="aud-visual-approve-btn"
                                            onClick={() => {
                                              setVerifiedItems((prev) =>
                                                new Set(prev).add(item.id),
                                              );
                                              showFeedback(
                                                "success",
                                                `✅ Fruver aprobado: ${item.name}`,
                                              );
                                            }}
                                          >
                                            👁️ Aprobar Visual
                                          </button>
                                        ) : (
                                          <span className="aud-type-badge normal">
                                            🔒 Requerido
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                    <div className="aud-item-action-col">
                                      {(() => {
                                        const uom = item.unidad_medida
                                          ? item.unidad_medida.toUpperCase()
                                          : "";
                                        const isPack =
                                          uom.startsWith("P") &&
                                          !isNaN(uom.substring(1));
                                        const packQty = isPack
                                          ? parseInt(uom.substring(1)) || 0
                                          : 0;
                                        return isPack ? (
                                          <div
                                            style={{
                                              background: "#9333ea",
                                              color: "white",
                                              padding: "4px 8px",
                                              borderRadius: "6px",
                                              fontWeight: "900",
                                              fontSize: "0.7rem",
                                              textAlign: "center",
                                              marginBottom: "4px",
                                            }}
                                          >
                                            📦 x{packQty}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="aud-massive-qty-badge">
                                        <span className="aud-massive-qty-num">
                                          {item.count}
                                        </span>
                                        <span className="aud-massive-qty-unit">
                                          {item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "UN."}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Verificados */}
                          {verifiedList.length > 0 && (
                            <div
                              className="aud-section"
                              style={{
                                marginTop: pendingItems.length > 0 ? "16px" : 0,
                              }}
                            >
                              <div className="aud-items-list compact">
                                {verifiedList.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="aud-item-card verified"
                                  >
                                    {/* COLUMNA 1: IMAGEN */}
                                    <div className="aud-item-img-col">
                                      <div className="aud-item-img small">
                                        {item.image ? (
                                          <img src={item.image} alt="" />
                                        ) : (
                                          <FaBoxOpen className="aud-item-placeholder" />
                                        )}
                                      </div>
                                    </div>

                                    {/* COLUMNA 2: INFO CENTRAL */}
                                    <div className="aud-item-info">
                                      <div className="aud-item-name">
                                        {item.name}
                                      </div>
                                      <div className="aud-item-verified-tag">
                                        ✅ Verificado exitosamente
                                      </div>
                                    </div>

                                    {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                    <div className="aud-item-action-col">
                                      {(() => {
                                        const uom = item.unidad_medida
                                          ? item.unidad_medida.toUpperCase()
                                          : "";
                                        const isPack =
                                          uom.startsWith("P") &&
                                          !isNaN(uom.substring(1));
                                        const packQty = isPack
                                          ? parseInt(uom.substring(1)) || 0
                                          : 0;
                                        return isPack ? (
                                          <div
                                            style={{
                                              background: "#9333ea",
                                              color: "white",
                                              padding: "4px 8px",
                                              borderRadius: "6px",
                                              fontWeight: "900",
                                              fontSize: "0.7rem",
                                              textAlign: "center",
                                              marginBottom: "4px",
                                            }}
                                          >
                                            📦 x{packQty}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div
                                        className="aud-massive-qty-badge"
                                        style={{ background: "#16a34a" }}
                                      >
                                        <span className="aud-massive-qty-num">
                                          {item.count}
                                        </span>
                                        <span className="aud-massive-qty-unit">
                                          {item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "UN."}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Confiables */}
                          {trustedItems.length > 0 && (
                            <div
                              className="aud-section"
                              style={{ marginTop: "16px", marginBottom: 0 }}
                            >
                              <button
                                className="aud-section-header trusted collapsible"
                                style={{
                                  background: "#f1f5f9",
                                  padding: "8px 12px",
                                }}
                                onClick={() => {
                                  const elId = `trusted-collapse-${group.id}`;
                                  const el = document.getElementById(elId);
                                  if (el)
                                    el.style.display =
                                      el.style.display === "none"
                                        ? "block"
                                        : "none";
                                }}
                              >
                                <FaShieldAlt />
                                <span>
                                  Productos confiables ({trustedItems.length})
                                </span>
                                <FaArrowRight className="aud-collapse-arrow" />
                              </button>
                              <div
                                id={`trusted-collapse-${group.id}`}
                                style={{ display: "none", marginTop: "8px" }}
                              >
                                <div className="aud-items-list compact">
                                  {trustedItems.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className={`aud-item-card trusted ${item.is_sub ? "sub" : ""} ${verifiedItems.has(item.id) ? "extra-verified" : ""}`}
                                      style={{
                                        opacity: verifiedItems.has(item.id)
                                          ? 1
                                          : 0.8,
                                        borderLeft: verifiedItems.has(item.id)
                                          ? "3px solid #22c55e"
                                          : undefined,
                                      }}
                                    >
                                      {/* COLUMNA 1: IMAGEN */}
                                      <div className="aud-item-img-col">
                                        <div className="aud-item-img small">
                                          {item.image ? (
                                            <img src={item.image} alt="" />
                                          ) : (
                                            <FaBoxOpen className="aud-item-placeholder" />
                                          )}
                                        </div>
                                      </div>

                                      {/* COLUMNA 2: INFO CENTRAL */}
                                      <div className="aud-item-info">
                                        <div
                                          className="aud-item-name"
                                          style={{ fontSize: "0.95rem" }}
                                        >
                                          {item.name}
                                        </div>
                                      </div>

                                      {/* COLUMNA 3: ACCIONES / CANTIDAD */}
                                      <div className="aud-item-action-col">
                                        {(() => {
                                          const uom = item.unidad_medida
                                            ? item.unidad_medida.toUpperCase()
                                            : "";
                                          const isPack =
                                            uom.startsWith("P") &&
                                            !isNaN(uom.substring(1));
                                          const packQty = isPack
                                            ? parseInt(uom.substring(1)) || 0
                                            : 0;
                                          return isPack ? (
                                            <div
                                              style={{
                                                background: "#9333ea",
                                                color: "white",
                                                padding: "3px 6px",
                                                borderRadius: "6px",
                                                fontWeight: "900",
                                                fontSize: "0.65rem",
                                                textAlign: "center",
                                                marginBottom: "3px",
                                              }}
                                            >
                                              📦 x{packQty}
                                            </div>
                                          ) : null;
                                        })()}
                                        <div
                                          className="aud-massive-qty-badge"
                                          style={{
                                            padding: "4px 12px",
                                            background: "#cbd5e1",
                                            color: "#334155",
                                          }}
                                        >
                                          <span
                                            className="aud-massive-qty-num"
                                            style={{ fontSize: "1.2rem" }}
                                          >
                                            {item.count}
                                          </span>
                                          <span
                                            className="aud-massive-qty-unit"
                                            style={{ fontSize: "0.7rem" }}
                                          >
                                            {item.unidad_medida
                                              ? item.unidad_medida.toUpperCase()
                                              : ""}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ─── TABS: HISTORIAL (moved below) ─── */}
                <div className="aud-section">
                  <button
                    className="aud-section-header timeline collapsible"
                    onClick={() =>
                      setActiveTab(
                        activeTab === "timeline" ? "inventory" : "timeline",
                      )
                    }
                  >
                    <FaHistory />
                    <span>Historial de picking</span>
                    <FaArrowRight
                      className={`aud-collapse-arrow ${activeTab === "timeline" ? "open" : ""}`}
                    />
                  </button>
                  {activeTab === "timeline" && (
                    <div className="timeline-container">
                      {auditData.rawLogs.map((log, idx) => (
                        <div key={idx} className={`timeline-row ${log.accion}`}>
                          <div className="tl-time">
                            {formatTime(log.fecha_registro)}
                          </div>
                          <div className="tl-marker"></div>
                          <div className="tl-content">
                            <div className="tl-title">{log.accion}</div>
                            <div className="tl-desc">
                              {log.accion === "sustituido" ? (
                                <div className="aud-timeline-sub-layout">
                                  <span className="aud-timeline-sub-original">
                                    {log.nombre_producto}
                                  </span>
                                  <span className="aud-timeline-sub-replacement">
                                    <FaArrowRight size={12} />{" "}
                                    {log.nombre_sustituto}
                                  </span>
                                </div>
                              ) : (
                                log.nombre_producto
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ─── FAB: FLOATING APPROVE BUTTON ─── */}
                <div className="aud-fab-container">
                  {auditData.meta.status === "auditado" ? (
                    <button className="aud-fab-btn done" onClick={clearAudit}>
                      🏠 Volver al Inicio
                    </button>
                  ) : (
                    <button
                      className={`aud-fab-btn ${allDone ? "ready" : "disabled"}`}
                      onClick={handleFinishAudit}
                      disabled={!allDone || loading}
                    >
                      {loading ? (
                        <FaSpinner className="ec-spin" />
                      ) : (
                        <FaCheck />
                      )}{" "}
                      {loading
                        ? "APROBANDO..."
                        : allDone
                          ? "APROBAR SALIDA"
                          : `Faltan ${pendingItems.length} por verificar`}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
      </div>

      {scanFeedback && (
        <div className="aud-toast-container">
          <div className={`aud-toast ${scanFeedback.type}`}>
            {scanFeedback.type === "success" && <FaCheck />}
            {scanFeedback.type === "error" && <FaTimes />}
            {scanFeedback.type === "warning" && <FaExclamationTriangle />}
            {scanFeedback.type === "info" && <FaInfoCircle />}
            <span>{scanFeedback.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VistaAuditor;
