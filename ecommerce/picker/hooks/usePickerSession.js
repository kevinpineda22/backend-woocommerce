import { useState, useEffect, useCallback } from "react";
import { ecommerceApi } from "../../shared/ecommerceApi";
import { supabase } from "../../../../supabaseClient";

export const usePickerSession = () => {
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null);
  const [pickerInfo, setPickerInfo] = useState(null);
  const [pickerSedeId, setPickerSedeId] = useState(null);
  const [showSuccessQR, setShowSuccessQR] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [initError, setInitError] = useState(null);

  // Helper: construir sede param para URLs
  const sedeParam = pickerSedeId ? `sede_id=${pickerSedeId}` : "";

  const resetSesionLocal = useCallback(() => {
    localStorage.removeItem("session_active_cache");
    localStorage.removeItem("offline_actions_queue");
    localStorage.removeItem("waiting_for_audit_id");
  }, []);

  const refreshSessionData = useCallback(
    async (idPicker, sedeId = null) => {
      if (!idPicker) return;
      const sp =
        sedeId || pickerSedeId ? `&sede_id=${sedeId || pickerSedeId}` : "";
      try {
        const res = await ecommerceApi.get(
          `/sesion-activa?id_picker=${idPicker}${sp}`,
        );
        const data = res.data;

        if (["pendiente_auditoria", "completado"].includes(data.estado)) {
          const waitingId =
            localStorage.getItem("waiting_for_audit_id") || data.session_id;
          localStorage.setItem("waiting_for_audit_id", waitingId);
          setCompletedSessionId(waitingId);
          setShowSuccessQR(true);
          localStorage.removeItem("session_active_cache");
          setSessionData(null);
          setLoading(false);
          return;
        }

        setSessionData(data);
        localStorage.setItem("session_active_cache", JSON.stringify(data));
      } catch (err) {
        if (err.response && err.response.status === 404) {
          if (localStorage.getItem("waiting_for_audit_id")) {
            setLoading(false);
            return;
          }
          resetSesionLocal();
          setSessionData(null);
          setShowSuccessQR(false);
          setCompletedSessionId(null);
        } else {
          const cached = localStorage.getItem("session_active_cache");
          if (cached) setSessionData(JSON.parse(cached));
        }
      } finally {
        setLoading(false);
      }
    },
    [resetSesionLocal],
  );

  // --- INIT ---
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        let email =
          localStorage.getItem("correo_empleado") ||
          localStorage.getItem("picker_email") ||
          "juan@test.com";
        let me = null;
        try {
          const { data: pickers } = await ecommerceApi.get(
            `/pickers?email=${email}&sede_id=todas`,
          );
          if (pickers && pickers.length > 0) {
            me = pickers[0];
            localStorage.setItem("picker_info_cache", JSON.stringify(me));
            // Guardar sede del picker
            if (me.sede_id) {
              setPickerSedeId(me.sede_id);
              localStorage.setItem("ecommerce_sede_id", me.sede_id);
            }
          }
        } catch (err) {
          me = JSON.parse(localStorage.getItem("picker_info_cache"));
          if (me?.sede_id) setPickerSedeId(me.sede_id);
        }

        if (!me) {
          throw new Error("Usuario no encontrado.");
        }
        setPickerInfo(me);

        const savedCompletedId = localStorage.getItem("waiting_for_audit_id");
        if (savedCompletedId) {
          setCompletedSessionId(savedCompletedId);
          setShowSuccessQR(true);
          setLoading(false);
          return;
        }
        await refreshSessionData(me.id, me.sede_id);
      } catch (e) {
        console.error("Error inicializando sesión picker:", e.message || e);
        setInitError(
          e.message || "Error desconocido al iniciar sesión de picking.",
        );
        setLoading(false);
      }
    };
    init();
  }, [refreshSessionData]);

  // --- AUTO-REFRESH CUANDO NO HAY SESIÓN (cada 5 segundos) ---
  useEffect(() => {
    if (!pickerInfo?.id || sessionData) return; // Solo si no hay sesión activa

    const interval = setInterval(() => {
      refreshSessionData(pickerInfo.id, pickerSedeId);
    }, 5000); // Cada 5 segundos

    return () => clearInterval(interval);
  }, [pickerInfo?.id, pickerSedeId, sessionData, refreshSessionData]);

  // --- LISTENERS SUPABASE ---
  useEffect(() => {
    if (!pickerInfo?.id) return;
    const channel = supabase
      .channel(`picker-global-${pickerInfo.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wc_pickers",
          filter: `id=eq.${pickerInfo.id}`,
        },
        () => {
          setLoading(true);
          refreshSessionData(pickerInfo.id);
        },
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [pickerInfo?.id, refreshSessionData]);

  useEffect(() => {
    if (!sessionData?.session_id) return;
    const sid = sessionData.session_id;

    const channel = supabase
      .channel(`session-${sid}`)
      // ⚡ RECEPCIÓN DEL BROADCAST DEL ADMIN (TIEMPO REAL)
      .on("broadcast", { event: "admin_override" }, (payload) => {
        console.log("⚡ Acción del Admin recibida! Recargando canasta...");
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Hace vibrar el cel del picker
        refreshSessionData(pickerInfo.id); // Forzamos actualización visual instantánea
      })
      // Eventos tradicionales de DB
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wc_picking_sessions",
          filter: `id=eq.${sid}`,
        },
        (payload) => {
          const newState = payload.new.estado;
          if (["pendiente_auditoria", "completado"].includes(newState)) {
            const waitingId =
              localStorage.getItem("waiting_for_audit_id") || sid;
            localStorage.setItem("waiting_for_audit_id", waitingId);
            setCompletedSessionId(waitingId);
            setShowSuccessQR(true);
            localStorage.removeItem("session_active_cache");
            setSessionData(null);
            setLoading(false);
            return;
          }
          if (newState === "auditado" || newState === "finalizado") {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            localStorage.removeItem("waiting_for_audit_id");
            setCompletedSessionId(null);
            setShowSuccessQR(false);
            resetSesionLocal();
            window.location.reload();
          } else if (newState === "cancelado") {
            resetSesionLocal();
            window.location.reload();
          } else {
            refreshSessionData(pickerInfo.id);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_log_picking" },
        () => refreshSessionData(pickerInfo.id),
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [
    sessionData?.session_id,
    pickerInfo?.id,
    refreshSessionData,
    resetSesionLocal,
  ]);

  // --- MONITOR ESPERANDO AUDITORÍA ---
  useEffect(() => {
    if (!completedSessionId) return;
    const checkStatus = async () => {
      if (!navigator.onLine) return;
      try {
        const { data } = await supabase
          .from("wc_picking_sessions")
          .select("estado")
          .eq("id", completedSessionId)
          .single();
        if (
          data &&
          ["auditado", "finalizado", "cancelado"].includes(data.estado)
        ) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          localStorage.removeItem("waiting_for_audit_id");
          setCompletedSessionId(null);
          setShowSuccessQR(false);
          window.location.reload();
        }
      } catch (err) {}
    };

    const channel = supabase
      .channel(`waiting-session-${completedSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wc_picking_sessions",
          filter: `id=eq.${completedSessionId}`,
        },
        () => checkStatus(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") checkStatus();
      });

    const onFocus = () => checkStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [completedSessionId]);

  // --- ACCIONES DE ESTADO LOCAL ---
  const updateLocalSessionState = (
    prodId,
    qty,
    status,
    sustituto = null,
    addedWeight = null,
  ) => {
    if (!sessionData) return;
    const newItems = sessionData.items.map((i) => {
      if (i.product_id === prodId) {
        // Calculamos el peso acumulado localmente
        let newWeight = parseFloat(i.peso_real || 0);
        if (addedWeight !== null) newWeight += parseFloat(addedWeight);
        if (qty === 0) newWeight = 0; // Si le da a "Deshacer", reseteamos el peso a 0

        return {
          ...i,
          qty_scanned: qty,
          status: status,
          sustituto: sustituto || i.sustituto,
          peso_real: newWeight,
        };
      }
      return i;
    });
    const newSessionData = { ...sessionData, items: newItems };
    setSessionData(newSessionData);
    localStorage.setItem(
      "session_active_cache",
      JSON.stringify(newSessionData),
    );
  };

  // Este método asume que la validación y confirmación previas ocurren en la UI (VistaPicker)
  const handleFinish = async () => {
    const finalId = sessionData.session_id;
    localStorage.setItem("waiting_for_audit_id", finalId);
    setCompletedSessionId(finalId);
    setIsFinishing(true);

    try {
      await ecommerceApi.post(
        `/finalizar-sesion${sedeParam ? "?" + sedeParam : ""}`,
        { id_sesion: finalId, id_picker: pickerInfo.id },
      );
      localStorage.removeItem("session_active_cache");
      localStorage.removeItem("offline_actions_queue");
      setSessionData(null);
      setShowSuccessQR(true);
    } catch (e) {
      throw e;
    } finally {
      setIsFinishing(false);
    }
  };

  return {
    loading,
    sessionData,
    pickerInfo,
    pickerSedeId,
    sedeParam,
    showSuccessQR,
    completedSessionId,
    resetSesionLocal,
    updateLocalSessionState,
    handleFinish,
    isFinishing,
    initError,
  };
};
