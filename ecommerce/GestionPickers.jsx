import React, { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "../../supabaseClient";
import { UserForm } from "../admin/UserForm";
import "../admin/AdminUsuarios.css";
import "./GestionPickers.css";
import {
  FaUserPlus,
  FaSync,
  FaArrowLeft,
  FaEdit,
  FaBan,
  FaBoxes
} from "react-icons/fa";

export const GestionPickers = () => {
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

      // 2. Obtener estado operativo + SESIÓN ACTUAL
      // Usamos la relación definida en Supabase para traer los ids_pedidos reales de la sesión
      const { data: wcData, error: wcError } = await supabase
        .from("wc_pickers")
        .select(`
            *,
            wc_picking_sessions!wc_pickers_id_sesion_actual_fkey (
                id,
                ids_pedidos,
                fecha_inicio
            )
        `);

      if (wcError) throw wcError;

      // 3. Fusionar datos y calcular carga real
      const merged = profilesData.map((profile) => {
        const operativo = wcData.find((w) => w.email === profile.correo);
        
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
          session_start: sessionInfo?.fecha_inicio
        };
      });

      setPickers(merged);
    } catch (error) {
      console.error("Error fetching pickers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPickers();
  }, []);

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
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/cancelar-asignacion",
        { id_picker: picker.wc_id }
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
          {!showForm && (
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
          <div style={{ marginTop: "20px" }}>
            <UserForm
              onUserSaved={handleUserSaved}
              onCancelEdit={() => setShowForm(false)}
              fixedRole="picker"
              editingUser={editingUser}
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
                <th>Estado</th>
                <th>Carga Actual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="gp-table-message">
                    Cargando equipo...
                  </td>
                </tr>
              ) : pickers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="gp-table-message">
                    No hay pickers registrados
                  </td>
                </tr>
              ) : (
                pickers.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="picker-name-cell">
                        <div className="gp-avatar-small">
                            {r.nombre_completo ? r.nombre_completo.charAt(0).toUpperCase() : "?"}
                        </div>
                        {r.nombre_completo || "Sin Nombre"}
                      </div>
                    </td>
                    <td>{r.email}</td>
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