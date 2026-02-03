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
} from "react-icons/fa";

export const GestionPickers = () => {
  const [pickers, setPickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchPickers = async () => {
    setLoading(true);
    try {
      // 1. Obtener usuarios auth con rol 'picker'
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "picker");

      if (profilesError) throw profilesError;

      // 2. Obtener estado operativo de WC_PICKERS
      const { data: wcData, error: wcError } = await supabase
        .from("wc_pickers")
        .select("*");

      if (wcError) throw wcError;

      // 3. Fusionar datos
      const merged = profilesData.map((profile) => {
        const operativo = wcData.find((w) => w.email === profile.correo);
        return {
          ...profile,
          ...operativo, // estado_picker, id_pedido_actual, etc.
          id: profile.user_id,
          wc_id: operativo?.id,
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

  // --- HANDLERS CRUD ---
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

  // --- ACCIÓN: CANCELAR PEDIDO ACTUAL (Emergencia) ---
  const handleCancelAssignment = async (picker) => {
    const confirmMsg = `¿Estás seguro de cancelar la asignación del pedido #${picker.id_pedido_actual} para ${picker.nombre_completo}?\n\nEl picker quedará libre inmediatamente.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/cancelar-asignacion",
        { id_picker: picker.wc_id }
      );
      alert("Asignación cancelada exitosamente.");
      fetchPickers();
    } catch (error) {
      console.error("Error cancelando asignación:", error);
      alert("Hubo un error al intentar cancelar la asignación.");
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
                <th>Pedido Actual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="gp-table-message">
                    Cargando...
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
                        {r.nombre || r.nombre_completo || "Sin Nombre"}
                      </div>
                    </td>
                    <td>{r.email || r.correo}</td>
                    <td>
                      {r.estado_picker === "picking" ? (
                        <span className="gp-badge gp-busy">En Misión</span>
                      ) : (
                        <span className="gp-badge gp-free">Disponible</span>
                      )}
                    </td>
                    <td>
                      {r.id_pedido_actual ? (
                        <span className="gp-order-active">
                          Order #{r.id_pedido_actual}
                        </span>
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

                        {/* Botón de pánico */}
                        {r.estado_picker === "picking" && (
                          <button
                            className="gp-btn-icon danger"
                            onClick={() => handleCancelAssignment(r)}
                            title="Desasignar Pedido Forzosamente"
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