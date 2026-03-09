import React, { useState, useEffect } from "react";
import { ecommerceApi } from "../shared/ecommerceApi";
import { supabase } from "../../../supabaseClient";
import { UserForm } from "../../admin/UserForm";
import { useSedeContext } from "../shared/SedeContext";
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
} from "react-icons/fa";

export const GestionPickers = () => {
  const { sedeId, sedeName, sedes, getSedeParam, isSuperAdmin, ecommerceRol } =
    useSedeContext();

  // Solo super_admin y admin_sede pueden crear pickers
  const canCreatePicker =
    isSuperAdmin || ecommerceRol === "ecommerce_admin_sede";
  const [pickers, setPickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

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
      const merged = profilesData
        .map((profile) => {
          const operativo = wcData.find((w) => w.email === profile.correo);

          // Si estamos filtrando por sede y este picker no tiene entrada en wc_pickers
          // para esa sede, no lo mostramos (evita filas vacías)
          if (sedeId && !operativo) return null;

          // Analizamos si tiene sesión activa para mostrar info correcta
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
            sede_id_picker: operativo?.sede_id || null,
          };
        })
        .filter(Boolean); // Eliminar nulls (pickers sin match cuando hay filtro de sede)
      setPickers(merged);
    } catch (error) {
      console.error("Error fetching pickers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPickers();
  }, [sedeId]); // Re-fetch when sede changes

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

  // --- CANCELACIÓN DE SESIÓN COMPLETA ---
  const handleCancelAssignment = async (picker) => {
    const qty = picker.active_orders_count;
    const ids = picker.active_orders_ids.join(", #");

    const confirmMsg = `⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\n\nEstás a punto de cancelar la sesión de ${picker.nombre_completo}.\n\nEsto liberará ${qty} pedido(s): #${ids}\nLos pedidos volverán a estar pendientes para asignación.\n\n¿Estás seguro?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await ecommerceApi.post(
        `/cancelar-asignacion?${getSedeParam()}`,
        { id_picker: picker.wc_id },
      );
      alert("✅ Sesión cancelada. El picker y los pedidos han sido liberados.");
      fetchPickers(); // Recargar tabla
    } catch (error) {
      console.error("Error cancelando asignación:", error);
      alert("Hubo un error al intentar cancelar. Verifica la consola.");
    }
  };

  return (
    <div className="gestion-pickers-container">
      <div className="gestion-pickers-header">
        <h2>Gestión de Pickers</h2>
        <div className="gestion-pickers-actions">
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
              ) : pickers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="gp-table-message">
                    No hay pickers registrados
                  </td>
                </tr>
              ) : (
                pickers.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="picker-name-cell">
                        <div className="gp-avatar-small">
                          {r.nombre_completo
                            ? r.nombre_completo.charAt(0).toUpperCase()
                            : "?"}
                        </div>
                        {r.nombre_completo || "Sin Nombre"}
                      </div>
                    </td>
                    <td>{r.email}</td>
                    <td>
                      {isSuperAdmin && r.wc_id ? (
                        <select
                          className="gp-sede-select"
                          value={r.sede_id_picker || ""}
                          onChange={async (e) => {
                            const newSedeId = e.target.value || null;
                            try {
                              await ecommerceApi.post(
                                "/sedes/asignar-picker",
                                { picker_id: r.wc_id, sede_id: newSedeId },
                              );
                              fetchPickers();
                            } catch (err) {
                              alert("Error asignando sede: " + err.message);
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
                        >
                          <FaEdit />
                        </button>

                        {/* Botón de pánico (Solo si está en picking) */}
                        {r.estado_picker === "picking" && (
                          <button
                            className="gp-btn-icon danger"
                            onClick={() => handleCancelAssignment(r)}
                            title="Liberar Picker y Cancelar TODOS sus Pedidos"
                          >
                            <FaBan />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
