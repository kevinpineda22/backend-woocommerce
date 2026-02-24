import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { supabase } from "../../../../supabaseClient"; 

export const useOfflineQueue = (resetSesionLocal) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const isSyncing = useRef(false);

  // 1. Monitoreo de conexión a Internet
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // 2. Función para encolar acciones localmente
  const queueAction = (payload) => {
    const queue = JSON.parse(localStorage.getItem("offline_actions_queue") || "[]");
    queue.push(payload);
    localStorage.setItem("offline_actions_queue", JSON.stringify(queue));
    setPendingSync(queue.length);
  };

  // 3. Procesador en segundo plano (El "Robot" que sube datos)
  useEffect(() => {
    const processQueue = async () => {
      if (!navigator.onLine || isSyncing.current) return;
      isSyncing.current = true;
      try {
        let queueStr = localStorage.getItem("offline_actions_queue");
        let queue = queueStr ? JSON.parse(queueStr) : [];
        
        if (queue.length === 0) {
          if (pendingSync > 0) setPendingSync(0);
          return;
        }

        while (queue.length > 0) {
          const item = queue[0];
          setPendingSync(queue.length);
          
          try {
            console.log("📤 Subiendo acción:", item.accion);
            await axios.post(
              "https://backend-woocommerce.vercel.app/api/orders/registrar-accion",
              item
            );

            // 📢 Avisar al Dashboard (Broadcast)
            try {
              await supabase.channel("dashboard-updates").send({
                type: "broadcast",
                event: "picking_action",
                payload: {
                  session_id: item.id_sesion,
                  action: item.accion,
                  product_id: item.id_producto_original,
                  timestamp: Date.now(),
                },
              });
            } catch (broadcastErr) {
              console.warn("⚠️ Error enviando broadcast:", broadcastErr);
            }

            // Éxito: Sacar de la cola
            const currentQueueStr = localStorage.getItem("offline_actions_queue");
            const currentQueue = currentQueueStr ? JSON.parse(currentQueueStr) : [];
            if (currentQueue.length > 0) {
              currentQueue.shift();
              localStorage.setItem("offline_actions_queue", JSON.stringify(currentQueue));
              queue = currentQueue;
              setPendingSync(currentQueue.length);
            } else {
              queue = [];
            }
          } catch (err) {
            console.error("❌ Error subiendo acción:", err);

            // Detector de Sesión Zombie
            if (err.response?.data?.error?.includes("Sesión inválida")) {
              console.error("💀 SESIÓN LOCAL MUERTA: Limpiando todo.");
              if(resetSesionLocal) resetSesionLocal();
              localStorage.removeItem("offline_actions_queue");
              window.location.reload();
              return;
            }

            // Eliminar acción corrupta
            if (err.response && err.response.status >= 400) {
              console.warn("⚠️ Acción corrupta. Eliminando de cola.");
              const currentQueueStr = localStorage.getItem("offline_actions_queue");
              const currentQueue = currentQueueStr ? JSON.parse(currentQueueStr) : [];
              if (currentQueue.length > 0) {
                currentQueue.shift();
                localStorage.setItem("offline_actions_queue", JSON.stringify(currentQueue));
                queue = currentQueue;
                setPendingSync(currentQueue.length);
              }
            }
            break;
          }
        }
      } finally {
        isSyncing.current = false;
      }
    };

    const interval = setInterval(processQueue, 1000);
    processQueue();
    return () => clearInterval(interval);
  }, [pendingSync, resetSesionLocal]);

  return { isOnline, pendingSync, setPendingSync, queueAction };
};