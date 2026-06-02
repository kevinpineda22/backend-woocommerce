import React, { useState, useEffect } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import { supabase } from "../../../supabaseClient";
import { UserForm } from "../../admin/UserForm";
import { useSedeContext } from "../shared/SedeContext";
import ConfirmModal from "../shared/ConfirmModal";
import { AnimatePresence, motion } from "framer-motion";
import "../../admin/AdminUsuarios.css";
import "./GestionPickers.css";
import {
  FaUserPlus,
  FaSync,
  FaArrowLeft,
  FaEdit,
  FaBan,
  FaBoxes,
  FaMapMarkerAlt,
  FaInfoCircle,
  FaUserSlash,
  FaUserCheck,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";

export const GestionPickers = () => {
  const { sedeId, sedeName, sedes, getSedeParam, isSuperAdmin, ecommerceRol, loading: sedeLoading } =
    useSedeContext();

  // Solo super_admin y admin_sede pueden crear pickers
  const canCreatePicker =
    isSuperAdmin || ecommerceRol === "ecommerce_admin_sede";
  const [pickers, setPickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // -- UI PREMIUM STATES --
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState([]);

  // -- INACTIVAR / ACTIVAR PICKER --
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);
  const [showInactivos, setShowInactivos] = useState(false);
  const [isUpdatingEstado, setIsUpdatingEstado] = useState(null);

  const showToast = (msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const fetchPickers = async () => {
    setLoading(true);
    try {
      // 1. Obtener perfiles de Auth
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "picker");

      if (profilesError) throw profilesError;

      // 2. Obtener estado operativo + SESIÓN ACTUAL + SEDE
      let wcQuery = supabase.from("wc_pickers").select(`
            *,
            wc_picking_sessions!wc_pickers_id_sesion_actual_fkey (
                id,
                ids_pedidos,
                fecha_inicio
            ),
            wc_sedes (
                id,
                nombre,
                slug
            )
        `);

      // Filtrar por sede si no es super admin o si hay una sede seleccionada
      if (sedeId) {
        wcQuery = wcQuery.eq("sede_id", sedeId);
      }

      const { data: wcData, error: wcError } = await wcQuery;

      if (wcError) throw wcError;

      // 3. Fusionar datos y calcular carga real
      const mergedList = await Promise.all(
        profilesData.map(async (profile) => {
          const profileEmail = (profile.correo || "").toLowerCase().trim();
          let operativo = wcData.find((w) => (w.email || "").toLowerCase().trim() === profileEmail);

          // AUTO-FIX: Si existe en profiles pero no en wc_pickers, intentar crearlo
          if (!operativo && profileEmail) {
            try {
              const { data: newOp, error: insertErr } = await supabase
                .from("wc_pickers")
                .insert([
                  {
                    nombre_completo: profile.nombre || "Sin Nombre",
                    email: profile.correo,
                    estado_picker: "disponible",

                    sede_id: profile.sede_id || null,
                  },
                ])
                .select("*, wc_sedes(id, nombre, slug)")
                .maybeSingle();

              if (!insertErr && newOp) {
                operativo = newOp;
                console.log(
                  "Auto-creado picker operativo para:",
                  profile.correo,
                );
              }
            } catch (e) {
              console.error(
                "No se pudo auto-crear picker para",
                profile.correo,
                e,
              );
            }
          }

          // Si estamos filtrando por sede y este picker no tiene entrada en wc_pickers
          // para esa sede, o si no se pudo crear, no lo mostramos (evita filas vacías)
          if (sedeId && (!operativo || operativo.sede_id !== sedeId))
            return null;

          const sessionInfo = operativo?.wc_picking_sessions;
          const activeOrders = sessionInfo ? sessionInfo.ids_pedidos : [];

          return {
            ...profile,
            ...operativo,
            id: profile.user_id,
            wc_id: operativo?.id,
            active_orders_count: activeOrders.length,
            active_orders_ids: activeOrders,
            session_start: sessionInfo?.fecha_inicio,
            sede_nombre: operativo?.wc_sedes?.nombre || "Sin sede",
            sede_id_picker: operativo?.sede_id || profile.sede_id || null, // Usar profile.sede_id como fallback
          };
        }),
      );

      setPickers(mergedList.filter(Boolean)); // Eliminar nulls
    } catch (error) {
      console.error("Error fetching pickers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sedeLoading) return;
    fetchPickers();

    // REALTIME SUPABASE
    const channel = supabase
      .channel("gestion-pickers-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_pickers" },
        () => fetchPickers(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wc_picking_sessions" },
        () => fetchPickers(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sedeId, sedeLoading]); // Re-fetch when sede changes or loading finishes

  // --- HANDLERS ---
  const handleCreateClick = () => {
    setEditingUser(null);
    setShowForm(true);
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setShowForm(true);
  };

  const handleUserSaved = () => {
    fetchPickers();
    setShowForm(false);
  };

  // --- CANCELACIÓN DE SESIÓN COMPLETA (MODAL) ---
  const handleCancelAssignmentRequested = (picker) => {
    setConfirmCancel(picker);
  };

  const handleCancelAssignmentConfirm = async () => {
    if (!confirmCancel) return;
    setIsProcessing(true);
    try {
      await ecommerceApi.post(`/cancelar-asignacion?${getSedeParam()}`, {
        id_picker: confirmCancel.wc_id,
      });
      showToast(
        `Sesión de ${confirmCancel.nombre_completo} cancelada. Pedidos liberados.`,
        "success",
      );
      fetchPickers(); // Recargar tabla
    } catch (error) {
      console.error("Error cancelando asignación:", error);
      showToast(
        "Hubo un error al intentar cancelar. Verifica la consola.",
        "error",
      );
    } finally {
      setIsProcessing(false);
      setConfirmCancel(null);
    }
  };

  // --- DESACTIVAR / REACTIVAR PICKER ---
  // Un picker inactivo NO aparece en el modal de asignación de pedidos. Sigue
  // existiendo en la base, solo queda oculto del flujo operativo hasta que un
  // admin lo reactive.
  const handleToggleActivoRequested = (picker) => {
    // Si está activando (volver a disponible), lo hacemos sin confirmación.
    if (picker.estado_picker === "inactivo") {
      handleActivar(picker);
      return;
    }
    // Si está desactivando, validar primero que no tenga pedidos activos.
    if (picker.estado_picker === "picking") {
      showToast(
        "No puede desactivar a un picker que tiene pedidos en ruta. Cancele la asignación primero.",
        "error",
      );
      return;
    }
    setConfirmDeactivate(picker);
  };

  const handleActivar = async (picker) => {
    if (!picker?.wc_id) return;
    setIsUpdatingEstado(picker.wc_id);
    try {
      const { error } = await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible" })
        .eq("id", picker.wc_id);
      if (error) throw error;
      showToast(`${picker.nombre_completo} fue reactivado.`, "success");
      fetchPickers();
    } catch (err) {
      console.error("Error al reactivar picker:", err);
      showToast("No se pudo reactivar el picker. " + (err.message || ""), "error");
    } finally {
      setIsUpdatingEstado(null);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!confirmDeactivate?.wc_id) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("wc_pickers")
        .update({ estado_picker: "inactivo" })
        .eq("id", confirmDeactivate.wc_id);
      if (error) throw error;
      showToast(
        `${confirmDeactivate.nombre_completo} fue desactivado. Ya no aparecerá al asignar pedidos.`,
        "success",
      );
      fetchPickers();
    } catch (err) {
      console.error("Error al desactivar picker:", err);
      showToast("No se pudo desactivar el picker. " + (err.message || ""), "error");
    } finally {
      setIsProcessing(false);
      setConfirmDeactivate(null);
    }
  };

  return (
    <div className="gestion-pickers-container">
      <div className="gestion-pickers-header">
        <h2>Gestión de Pickers</h2>
        <div className="gestion-pickers-actions">
          <button
            className={`pedidos-admin-refresh-btn gp-toggle-inactivos ${showInactivos ? "active" : ""}`}
            onClick={() => setShowInactivos((v) => !v)}
            title={
              showInactivos
                ? "Ocultar pickers inactivos"
                : "Mostrar pickers inactivos"
            }
          >
            {showInactivos ? <FaEyeSlash /> : <FaEye />}
            {showInactivos ? "Ocultar inactivos" : "Ver inactivos"}
          </button>
          <button className="pedidos-admin-refresh-btn" onClick={fetchPickers}>
            <FaSync /> Actualizar
          </button>
          {!showForm && canCreatePicker && (
            <button
              className="pedidos-admin-refresh-btn create-btn"
              onClick={handleCreateClick}
            >
              <FaUserPlus /> Nuevo Picker
            </button>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="picker-form-wrapper">
          <button className="btn-back-form" onClick={() => setShowForm(false)}>
            <FaArrowLeft /> Regresar a lista
          </button>

          {/* Banner informativo según rol */}
          <div className="gp-form-info-banner">
            <FaInfoCircle className="gp-form-info-icon" />
            {isSuperAdmin ? (
              <p>
                <strong>Modo Admin Global:</strong> Puedes crear un picker y
                asignarlo a <strong>cualquier sede</strong> disponible.
                Selecciona la sede en el formulario.
              </p>
            ) : (
              <p>
                <strong>Creación de Picker — Sede {sedeName}:</strong> El nuevo
                picker será asignado automáticamente a tu sede{" "}
                <strong>{sedeName}</strong>. No es posible crear pickers para
                otras sedes desde tu rol de administrador de sede.
              </p>
            )}
          </div>

          <div className="gp-form-container">
            <UserForm
              onUserSaved={handleUserSaved}
              onCancelEdit={() => setShowForm(false)}
              fixedRole="picker"
              editingUser={editingUser}
              sedes={
                isSuperAdmin ? sedes : sedes.filter((s) => s.id === sedeId)
              }
            />
          </div>
        </div>
      ) : (
        <div className="pickers-list-container">
          <table className="pickers-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Sede</th>
                <th>Estado</th>
                <th>Carga Actual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="gp-table-message">
                    Cargando equipo...
                  </td>
                </tr>
              ) : (() => {
                // Filtramos inactivos según preferencia del admin.
                const visibles = showInactivos
                  ? pickers
                  : pickers.filter((p) => p.estado_picker !== "inactivo");

                if (visibles.length === 0) {
                  return (
                    <tr>
                      <td colSpan="6" className="gp-premium-empty-state">
                        <div className="gp-premium-empty-icon">
                          <FaUserPlus size={60} />
                        </div>
                        <h3 className="gp-premium-empty-title">
                          {pickers.length === 0
                            ? "Aún no hay operarios en esta sede"
                            : "No hay pickers activos para mostrar"}
                        </h3>
                        <p className="gp-premium-empty-text">
                          {pickers.length === 0
                            ? "Crea tu primer Picker usando el botón superior para empezar a asignar recolecciones."
                            : "Todos los pickers están desactivados. Activa la opción 'Ver inactivos' para gestionarlos."}
                        </p>
                      </td>
                    </tr>
                  );
                }

                return visibles.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="picker-name-cell">
                        <div className="gp-avatar-small">
                          {r.nombre_completo || r.nombre
                            ? (r.nombre_completo || r.nombre)
                                .charAt(0)
                                .toUpperCase()
                            : "?"}
                        </div>
                        {r.nombre_completo || r.nombre || "Sin Nombre"}
                      </div>
                    </td>
                    <td>{r.email || r.correo}</td>
                    <td>
                      {isSuperAdmin ? (
                        <select
                          className="gp-sede-select"
                          value={r.sede_id_picker || ""}
                          onChange={async (e) => {
                            const newSedeId = e.target.value || null;
                            try {
                              if (!r.wc_id) {
                                showToast(
                                  "No hay ID operativo para este picker. Intenta actualizar la página.",
                                  "error",
                                );
                                return;
                              }
                              await ecommerceApi.post("/sedes/asignar-picker", {
                                picker_id: r.wc_id,
                                sede_id: newSedeId,
                              });
                              fetchPickers();
                              showToast(
                                "Sede asignada correctamente.",
                                "success",
                              );
                            } catch (err) {
                              showToast(
                                "Error asignando sede: " + err.message,
                                "error",
                              );
                            }
                          }}
                        >
                          <option value="">Sin sede</option>
                          {sedes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="gp-sede-badge">
                          <FaMapMarkerAlt /> {r.sede_nombre}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.estado_picker === "picking" ? (
                        <span className="gp-badge gp-busy">En Ruta</span>
                      ) : r.estado_picker === "inactivo" ? (
                        <span className="gp-badge gp-inactive">Inactivo</span>
                      ) : (
                        <span className="gp-badge gp-free">Disponible</span>
                      )}
                    </td>
                    <td>
                      {r.active_orders_count > 0 ? (
                        <div className="gp-load-info">
                          <span className="gp-load-badge">
                            <FaBoxes /> {r.active_orders_count} Pedidos
                          </span>
                          <small className="gp-load-ids">
                            #{r.active_orders_ids.join(", #")}
                          </small>
                        </div>
                      ) : (
                        <span className="gp-text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="gp-actions-row">
                        <button
                          className="gp-btn-icon warning"
                          onClick={() => handleEditClick(r)}
                          title="Editar Usuario"
                          disabled={isUpdatingEstado === r.wc_id}
                        >
                          <FaEdit />
                        </button>

                        {/* Activar / Desactivar picker.
                            No se puede desactivar si está en picking — primero
                            debe liberarse con el botón de pánico. */}
                        {r.estado_picker === "inactivo" ? (
                          <button
                            className="gp-btn-icon success"
                            onClick={() => handleToggleActivoRequested(r)}
                            title="Reactivar picker"
                            disabled={isUpdatingEstado === r.wc_id}
                          >
                            <FaUserCheck />
                          </button>
                        ) : (
                          <button
                            className="gp-btn-icon muted"
                            onClick={() => handleToggleActivoRequested(r)}
                            title={
                              r.estado_picker === "picking"
                                ? "No se puede desactivar: el picker tiene pedidos en ruta"
                                : "Desactivar picker (deja de aparecer al asignar pedidos)"
                            }
                            disabled={
                              r.estado_picker === "picking" ||
                              isUpdatingEstado === r.wc_id
                            }
                          >
                            <FaUserSlash />
                          </button>
                        )}

                        {/* Botón de pánico (Solo si está en picking) */}
                        {r.estado_picker === "picking" && (
                          <button
                            className="gp-btn-icon danger"
                            onClick={() => handleCancelAssignmentRequested(r)}
                            title="Liberar Picker y Cancelar TODOS sus Pedidos"
                          >
                            <FaBan />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DE SEGURIDAD CANCELAR RUTA */}
      <ConfirmModal
        isOpen={!!confirmCancel}
        title="⚠️ ADVERTENCIA LEGAL DE CANCELACIÓN"
        message={
          confirmCancel
            ? `Estás a punto de cancelar abruptamente la sesión activa de ${confirmCancel.nombre_completo}. Esto liberará de golpe ${confirmCancel.active_orders_count} pedido(s) de vuelta a la canasta general.\n\n¿Proceder de todas formas?`
            : ""
        }
        confirmText="Sí, Cancelar Ruta y Liberar Pedidos"
        cancelText="Conservar Asignación"
        isDanger={true}
        onConfirm={handleCancelAssignmentConfirm}
        onCancel={() => setConfirmCancel(null)}
        isProcessing={isProcessing}
      />

      {/* MODAL DE CONFIRMACIÓN DESACTIVAR PICKER */}
      <ConfirmModal
        isOpen={!!confirmDeactivate}
        title="Desactivar picker"
        message={
          confirmDeactivate
            ? `${confirmDeactivate.nombre_completo} dejará de aparecer en la lista al asignar pedidos. Sus datos y su historial se conservan, y podrá reactivarlo cuando quiera desde esta misma pantalla activando "Ver inactivos".\n\n¿Desactivar a este picker?`
            : ""
        }
        confirmText="Sí, desactivar"
        cancelText="Mantener activo"
        isDanger={false}
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setConfirmDeactivate(null)}
        isProcessing={isProcessing}
      />

      {/* NOTIFICACIONES TOAST */}
      <div className="gp-toast-container">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`gp-toast-item gp-toast-${t.type === "success" ? "success" : t.type === "error" ? "error" : "info"}`}
            >
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
