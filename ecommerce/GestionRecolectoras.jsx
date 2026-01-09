import React, { useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";
import { UserForm } from "../admin/UserForm";
import "../admin/AdminUsuarios.css";
import "./GestionRecolectoras.css";
import { FaUserPlus, FaSync, FaArrowLeft } from "react-icons/fa";

export const GestionRecolectoras = () => {
  const [recolectoras, setRecolectoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchRecolectoras = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wc_recolectoras")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (error) {
      console.error("Error fetching recolectoras:", error);
    } else {
      setRecolectoras(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecolectoras();
  }, []);

  const handleCreateClick = () => {
    setEditingUser(null);
    setShowForm(true);
  };

  const handleUserSaved = async (formData) => {
    if (formData && formData.isNew) {
      try {
        // Buscar el perfil recién creado para obtener su ID
        // Esperamos un momento breve para asegurar que el trigger o proceso async (si hubiese) haya terminado
        // Aunque el UserForm espera respuesta del edge function, profiles debería estar listo.

        let attempts = 0;
        let profile = null;

        // Reintentamos un par de veces por si hay lag en la replicación
        while (attempts < 3 && !profile) {
          const { data } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("correo", formData.email)
            .maybeSingle();
          profile = data;
          if (!profile) await new Promise((r) => setTimeout(r, 1000));
          attempts++;
        }

        if (profile) {
          const { error: insertError } = await supabase
            .from("wc_recolectoras")
            .insert([
              {
                id: profile.user_id,
                nombre_completo: formData.nombre,
                email: formData.email,
                estado_recolectora: "disponible",
              },
            ]);
          if (insertError)
            console.error("Error inserting into wc_recolectoras", insertError);
        } else {
          console.warn(
            "No se encontró el perfil para el email",
            formData.email,
            "creando en wc_recolectoras sin ID linkeado (generado auto)"
          );
          await supabase.from("wc_recolectoras").insert([
            {
              nombre_completo: formData.nombre,
              email: formData.email,
              estado_recolectora: "disponible",
            },
          ]);
        }
      } catch (err) {
        console.error("Error syncing to wc_recolectoras:", err);
      }
    }

    // Si editamos, actualizamos nombre en wc_recolectoras
    if (!formData.isNew && formData.uid) {
      await supabase
        .from("wc_recolectoras")
        .update({
          nombre_completo: formData.nombre,
        })
        .eq("id", formData.uid);
      // Fallback por si usan email para matchear
      await supabase
        .from("wc_recolectoras")
        .update({
          nombre_completo: formData.nombre,
        })
        .eq("email", formData.email);
    }

    setShowForm(false);
    fetchRecolectoras();
  };

  return (
    <div className="gestion-recolectoras-container">
      <div className="gestion-recolectoras-header">
        <h2>Gestión de Recolectoras</h2>
        <div className="gestion-recolectoras-actions">
          <button
            className="pedidos-admin-refresh-btn"
            onClick={fetchRecolectoras}
          >
            <FaSync /> Actualizar
          </button>
          {!showForm && (
            <button
              className="pedidos-admin-refresh-btn create-btn"
              onClick={handleCreateClick}
              style={{ backgroundColor: "#2ecc71" }}
            >
              <FaUserPlus /> Nueva Recolectora
            </button>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="recolectora-form-wrapper">
          <button className="btn-back-form" onClick={() => setShowForm(false)}>
            <FaArrowLeft /> Regresar a lista
          </button>
          <div style={{ marginTop: "20px" }}>
            <UserForm
              onUserSaved={handleUserSaved}
              onCancelEdit={() => setShowForm(false)}
              fixedRole="recolectora"
              editingUser={editingUser}
            />
          </div>
        </div>
      ) : (
        <div className="recolectoras-list-container">
          <table className="recolectoras-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Estado</th>
                <th>Pedido Actual</th>
                <th>Última Actividad</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="5"
                    style={{ textAlign: "center", padding: "20px" }}
                  >
                    Cargando...
                  </td>
                </tr>
              ) : recolectoras.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    style={{ textAlign: "center", padding: "20px" }}
                  >
                    No hay recolectoras registradas
                  </td>
                </tr>
              ) : (
                recolectoras.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="recolectora-name-cell">
                        <strong>{r.nombre_completo}</strong>
                      </div>
                    </td>
                    <td>{r.email}</td>
                    <td>
                      <span
                        className={`pedidos-badge-${
                          r.estado_recolectora === "disponible" ? "ok" : "busy"
                        }`}
                      >
                        {r.estado_recolectora}
                      </span>
                    </td>
                    <td>
                      {r.id_pedido_actual ? `#${r.id_pedido_actual}` : "-"}
                    </td>
                    <td>
                      {r.ultima_actividad
                        ? new Date(r.ultima_actividad).toLocaleString()
                        : "-"}
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
