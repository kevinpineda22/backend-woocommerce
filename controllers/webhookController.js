const crypto = require("crypto");
const { supabase } = require("../services/supabaseClient");
const { getSedeFromWooOrder, getAllSedes } = require("../services/sedeConfig");

// =========================================================
// HELPER: Verificar firma HMAC del webhook de WooCommerce
// =========================================================
function verifyWooSignature(payload, signature, secret) {
  if (!secret) return true; // Si no hay secret configurado, aceptar (dev mode)
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  const expected = hmac.digest("base64");
  // timingSafeEqual requiere buffers del mismo largo
  const sigBuf = Buffer.from(signature, "base64");
  const expBuf = Buffer.from(expected, "base64");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// =========================================================
// Broadcast a todos los clientes del dashboard via Supabase
// =========================================================
async function broadcastNewOrder(orderData) {
  try {
    const channel = supabase.channel("woo-orders-realtime");
    await channel.send({
      type: "broadcast",
      event: "new-order",
      payload: {
        order_id: orderData.id,
        status: orderData.status,
        sede_id: orderData.sede_id || null,
        timestamp: new Date().toISOString(),
      },
    });
    // Limpiar el channel del lado del server después de enviar
    supabase.removeChannel(channel);
    console.log(`📡 [WEBHOOK] Broadcast enviado para orden #${orderData.id}`);
  } catch (err) {
    console.error("❌ [WEBHOOK] Error en broadcast Supabase:", err.message);
  }
}

// =========================================================
// POST /api/webhooks/woocommerce
// Receptor principal de webhooks de WooCommerce
// =========================================================
exports.handleWooWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-wc-webhook-signature"];
    const topic = req.headers["x-wc-webhook-topic"];
    const source = req.headers["x-wc-webhook-source"];

    // Verificar firma HMAC-SHA256
    const secret = process.env.WC_WEBHOOK_SECRET;
    // En Vercel, rawBody puede no capturarse correctamente (body pre-parseado).
    // Fallback: reconstruir el payload desde req.body.
    const rawPayload = req.rawBody || JSON.stringify(req.body);
    if (secret && !verifyWooSignature(rawPayload, signature, secret)) {
      console.warn("⚠️ [WEBHOOK] Firma inválida, rechazando request");
      return res.status(401).json({ error: "Firma inválida" });
    }

    // WooCommerce envía un ping al crear el webhook
    if (topic === "ping" || !req.body || !req.body.id) {
      console.log("🏓 [WEBHOOK] Ping recibido de WooCommerce");
      return res.status(200).json({ received: true, type: "ping" });
    }

    const order = req.body;
    console.log(
      `📦 [WEBHOOK] Evento: ${topic} | Orden #${order.id} | Estado: ${order.status} | Fuente: ${source || "desconocida"}`,
    );

    // Solo nos interesan pedidos en "processing" (nuevos pedidos pagados)
    const relevantStatuses = ["processing", "completed", "on-hold"];
    if (!relevantStatuses.includes(order.status)) {
      return res.status(200).json({
        received: true,
        ignored: true,
        reason: `Estado ${order.status} no relevante`,
      });
    }

    // Detectar sede del pedido
    let sedeId = null;
    try {
      const sedeInfo = await getSedeFromWooOrder(order);
      sedeId = sedeInfo?.id || null;
    } catch (_) {
      // Si falla la detección de sede, broadcast sin sede (global)
    }

    // Si no detectamos sede por meta, intentar por URL de origen
    if (!sedeId && source) {
      try {
        const sedes = await getAllSedes();
        const match = sedes.find(
          (s) =>
            s.wc_url &&
            source.replace(/\/+$/, "") === s.wc_url.replace(/\/+$/, ""),
        );
        if (match) sedeId = match.id;
      } catch (_) {}
    }

    // Broadcast inmediato a todos los dashboards conectados
    await broadcastNewOrder({
      id: order.id,
      status: order.status,
      sede_id: sedeId,
    });

    res.status(200).json({
      received: true,
      order_id: order.id,
      status: order.status,
      sede_id: sedeId,
    });
  } catch (error) {
    console.error("❌ [WEBHOOK] Error procesando webhook:", error.message);
    // Siempre responder 200 para que WooCommerce no reintente infinitamente
    res.status(200).json({ received: true, error: error.message });
  }
};

// =========================================================
// GET /api/webhooks/health
// Verificar que el endpoint está activo
// =========================================================
exports.webhookHealth = (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Webhook endpoint activo",
    timestamp: new Date().toISOString(),
  });
};
