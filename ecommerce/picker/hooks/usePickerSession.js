import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { supabase } from "../../../../supabaseClient";

export const usePickerSession = () => {
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null);
  const [pickerInfo, setPickerInfo] = useState(null);
  const [showSuccessQR, setShowSuccessQR] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState(null);

  const resetSesionLocal = useCallback(() => {
    localStorage.removeItem("session_active_cache");
    localStorage.removeItem("offline_actions_queue");
    localStorage.removeItem("waiting_for_audit_id");
  }, []);

  const refreshSessionData = useCallback(async (idPicker) => {
    if (!idPicker) return;
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/sesion-activa?id_picker=${idPicker}&t=${Date.now()}`,
      );
      const data = res.data;

      if (["pendiente_auditoria", "completado"].includes(data.estado)) {
        const waitingId = localStorage.getItem("waiting_for_audit_id") || data.session_id;
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
  }, [resetSesionLocal]);

  // --- INIT ---
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        let email = localStorage.getItem("correo_empleado") || localStorage.getItem("picker_email") || "juan@test.com";
        let me = null;
        try {
          const { data: pickers } = await axios.get(`https://backend-woocommerce.vercel.app/api/orders/pickers?email=${email}`);
          if (pickers && pickers.length > 0) {
            me = pickers[0];
            localStorage.setItem("picker_info_cache", JSON.stringify(me));
          }
        } catch (err) {
          me = JSON.parse(localStorage.getItem("picker_info_cache"));
        }

        if (!me) { alert("Usuario no encontrado."); setLoading(false); return; }
        setPickerInfo(me);

        const savedCompletedId = localStorage.getItem("waiting_for_audit_id");
        if (savedCompletedId) {
          setCompletedSessionId(savedCompletedId);
          setShowSuccessQR(true);
          setLoading(false);
          return;
        }
        await refreshSessionData(me.id);
      } catch (e) {
        setLoading(false);
      }
    };
    init();
  }, [refreshSessionData]);

  // --- LISTENERS SUPABASE ---
  useEffect(() => {
    if (!pickerInfo?.id) return;
    const channel = supabase.channel(`picker-global-${pickerInfo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wc_pickers", filter: `id=eq.${pickerInfo.id}` },
        () => { setLoading(true); refreshSessionData(pickerInfo.id); }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [pickerInfo?.id, refreshSessionData]);

  useEffect(() => {
    if (!sessionData?.session_id) return;
    const sid = sessionData.session_id;
    const channel = supabase.channel(`active-session-updates-${sid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wc_picking_sessions", filter: `id=eq.${sid}` },
        (payload) => {
          const newState = payload.new.estado;
          if (["pendiente_auditoria", "completado"].includes(newState)) {
            const waitingId = localStorage.getItem("waiting_for_audit_id") || sid;
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
            alert("⛔ Ruta CANCELADA.");
            resetSesionLocal();
            window.location.reload();
          } else {
            refreshSessionData(pickerInfo.id);
          }
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "wc_log_picking" },
        () => refreshSessionData(pickerInfo.id)
      ).subscribe();

    return () => supabase.removeChannel(channel);
  }, [sessionData?.session_id, pickerInfo?.id, refreshSessionData, resetSesionLocal]);

  // --- MONITOR ESPERANDO AUDITORÍA ---
  useEffect(() => {
    if (!completedSessionId) return;
    const checkStatus = async () => {
      if (!navigator.onLine) return;
      try {
        const { data } = await supabase.from("wc_picking_sessions").select("estado").eq("id", completedSessionId).single();
        if (data && ["auditado", "finalizado", "cancelado"].includes(data.estado)) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          localStorage.removeItem("waiting_for_audit_id");
          setCompletedSessionId(null);
          setShowSuccessQR(false);
          window.location.reload();
        }
      } catch (err) {}
    };

    const channel = supabase.channel(`waiting-session-${completedSessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wc_picking_sessions", filter: `id=eq.${completedSessionId}` },
        () => checkStatus()
      ).subscribe((status) => { if (status === "SUBSCRIBED") checkStatus(); });

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
  const updateLocalSessionState = (prodId, qty, status, sustituto = null) => {
    if (!sessionData) return;
    const newItems = sessionData.items.map((i) => {
      if (i.product_id === prodId) return { ...i, qty_scanned: qty, status: status, sustituto: sustituto || i.sustituto };
      return i;
    });
    const newSessionData = { ...sessionData, items: newItems };
    setSessionData(newSessionData);
    localStorage.setItem("session_active_cache", JSON.stringify(newSessionData));
  };

  const handleFinish = async (pendingSync) => {
    if (pendingSync > 0) { alert(`⚠️ Tienes ${pendingSync} acciones pendientes.`); return; }
    if (!window.confirm("¿Finalizar sesión completa?")) return;

    const finalId = sessionData.session_id;
    localStorage.setItem("waiting_for_audit_id", finalId);
    setCompletedSessionId(finalId);

    try {
      await axios.post("https://backend-woocommerce.vercel.app/api/orders/finalizar-sesion", { id_sesion: finalId, id_picker: pickerInfo.id });
      localStorage.removeItem("session_active_cache");
      localStorage.removeItem("offline_actions_queue");
      setSessionData(null);
      setShowSuccessQR(true);
    } catch (e) { alert("Error al finalizar."); }
  };

  return {
    loading,
    sessionData,
    pickerInfo,
    showSuccessQR,
    completedSessionId,
    resetSesionLocal,
    updateLocalSessionState,
    handleFinish
  };
};