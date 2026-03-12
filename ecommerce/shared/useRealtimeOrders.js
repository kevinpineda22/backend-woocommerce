import { useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../supabaseClient";

/**
 * Hook que escucha el canal de Broadcast de Supabase para recibir
 * notificaciones en tiempo real cuando WooCommerce crea/actualiza pedidos
 * vía webhook.
 *
 * @param {Function} onNewOrder - Callback cuando llega un pedido nuevo
 * @param {string|null} sedeId - Filtrar por sede (null = todas)
 */
export function useRealtimeOrders(onNewOrder, sedeId) {
  const callbackRef = useRef(onNewOrder);
  callbackRef.current = onNewOrder;

  const stableCallback = useCallback(
    (...args) => callbackRef.current(...args),
    [],
  );

  useEffect(() => {
    const channel = supabase
      .channel("woo-orders-realtime")
      .on("broadcast", { event: "new-order" }, (message) => {
        const payload = message.payload;
        // Si hay filtro de sede, solo reaccionar a pedidos de esa sede
        if (sedeId && payload.sede_id && payload.sede_id !== sedeId) {
          return;
        }
        console.log(
          "⚡ [REALTIME] Nuevo pedido recibido via webhook:",
          payload,
        );
        stableCallback(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sedeId, stableCallback]);
}
