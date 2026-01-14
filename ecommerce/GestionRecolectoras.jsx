import React, { useState, useEffect } from "react";
import axios from "axios";
import { supabase } from "../../supabaseClient";
import { UserForm } from "../admin/UserForm";
import "../admin/AdminUsuarios.css";
import "./GestionRecolectoras.css";
import {
  FaUserPlus,
  FaSync,
  FaArrowLeft,
  FaHistory,
  FaClock,
  FaCalendarAlt,
  FaCheckCircle,
  FaEdit,
  FaBan,
} from "react-icons/fa";

export const GestionRecolectoras = () => {
  const [recolectoras, setRecolectoras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Estados para el Historial (Lista de pedidos realizados)
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedRecolectora, setSelectedRecolectora] = useState(null);
  const [recolectoraHistory, setRecolectoraHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Estados para el Detalle del Pedido Histórico (Productos, etc.)
  const [detailedOrder, setDetailedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchRecolectoras = async () => {
    setLoading(true);
    try {
      // 1. Obtener usuarios con rol 'recolectora' desde la tabla maestra PROFILES
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "recolectora");

      if (profilesError) throw profilesError;

      // 2. Obtener estado actual (operativo) de WC_RECOLECTORAS
      const { data: wcData, error: wcError } = await supabase
        .from("wc_recolectoras")
        .select("*");

      if (wcError) throw wcError;

      // 3. SINCRONIZACIÓN AUTOMÁTICA
      // Queremos que la lista final incluya todos los del paso 1.
      // Si no están en wc_recolectoras, los creamos en memoria (o en BD si se desea estricto).
      // Preferiblemente actualizamos la BD para que tengan ID válido.

      const syncedList = [];
      const wcMap = new Map();
      wcData.forEach((wc) => wcMap.set(wc.email, wc)); // Mapear por email

      for (const profile of profilesData) {
        let wcRecord = wcMap.get(profile.correo); // profiles usa 'correo'

        if (!wcRecord) {
          // Si existe en Profile pero no en WC, insertarlo automáticamente
          console.log(
            `Syncing new user ${profile.nombre} into wc_recolectoras...`
          );
          const { data: newWc, error: insertError } = await supabase
            .from("wc_recolectoras")
            .insert([
              {
                nombre_completo: profile.nombre,
                email: profile.correo,
                estado_recolectora: "disponible",
              },
            ])
            .select()
            .single();

          if (!insertError && newWc) {
            wcRecord = newWc;
          } else {
            // Fallback visual si falla insert
            wcRecord = {
              id: "temp_" + profile.user_id,
              nombre_completo: profile.nombre,
              email: profile.correo,
              estado_recolectora: "disponible",
              id_pedido_actual: null,
            };
          }
        } else {
          // Si ya existe, verificar si cambió el nombre y actualizar silenciosamente
          if (wcRecord.nombre_completo !== profile.nombre) {
            await supabase
              .from("wc_recolectoras")
              .update({ nombre_completo: profile.nombre })
              .eq("id", wcRecord.id);
            wcRecord.nombre_completo = profile.nombre;
          }
        }

        // Añadir meta-data de profile a la vista
        syncedList.push({
          ...wcRecord,
          uid: profile.user_id, // Guardar UID para facilitar ediciones futuras
          profileData: profile, // Guardar perfil completo para edición
        });
      }

      // Ordenar por nombre
      syncedList.sort((a, b) =>
        a.nombre_completo.localeCompare(b.nombre_completo)
      );
      setRecolectoras(syncedList);
    } catch (error) {
      console.error("Error fetching/syncing recolectoras:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecolectoras();
  }, []);

  // --- ACCIÓN: ABRIR HISTORIAL DE UNA RECOLECTORA ---
  const handleViewHistory = async (recolectora) => {
    setSelectedRecolectora(recolectora);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const res = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial?id_recolectora=${recolectora.id}`
      );
      setRecolectoraHistory(res.data);
    } catch (error) {
      console.error("Error cargando historial", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // --- ACCIÓN: VER DETALLE DE UN PEDIDO ANTIGUO ---
  const handleHistoryItemClick = async (historyItem) => {
    setDetailLoading(true);
    // Preservar el snapshot del reporte histórico
    setDetailedOrder({
      id: historyItem.id_pedido,
      reporte_items: historyItem.reporte_snapshot, // Asignamos el snapshot como reporte para la visualización
    });

    try {
      const response = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/${historyItem.id_pedido}`
      );
      // Fusionamos los datos de WC con el reporte que ya tenemos del historial
      setDetailedOrder((prev) => ({
        ...prev,
        ...response.data,
        // Aseguramos que reporte_items persista si response.data no lo trae
        reporte_items: prev.reporte_items,
      }));
    } catch (error) {
      console.error("Error loading order details", error);
      alert("No se pudieron cargar los detalles de este pedido.");
      setDetailedOrder(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setDetailedOrder(null);
    setDetailLoading(false);
  };

  // --- LÓGICA DE CREACIÓN/EDICIÓN USUARIOS ---
  const handleCreateClick = () => {
    setEditingUser(null);
    setShowForm(true);
  };

  const handleEditClick = (recolectora) => {
    // Si tenemos el perfil sincronizado, lo usamos para rellenar el formulario
    if (recolectora.profileData) {
      setEditingUser(recolectora.profileData);
    } else {
      // Fallback (solo nombre/email)
      setEditingUser({
        nombre: recolectora.nombre_completo,
        correo: recolectora.email,
        role: "recolectora",
      });
    }
    setShowForm(true);
  };

  const handleUserSaved = async (formData) => {
    // La creación/edición la maneja UserForm contra 'profiles'.
    // Aquí solo refrescamos para que la lógica de sincronización
    // actualice la tabla 'wc_recolectoras' y la vista.
    await fetchRecolectoras();
    setShowForm(false);
  };

  // --- ACCIÓN: CANCELAR PEDIDO ACTUAL (LIBERAR RECOLECTORA) ---
  const handleCancelAssignment = async (recolectora) => {
    if (
      !window.confirm(
        `¿Estás seguro de cancelar la asignación del pedido #${recolectora.id_pedido_actual} para ${recolectora.nombre_completo}?\n\nLa recolectora quedará libre inmediatamente.`
      )
    ) {
      return;
    }

    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/cancelar-asignacion",
        {
          id_recolectora: recolectora.id,
        }
      );
      alert("Asignación cancelada exitosamente.");
      fetchRecolectoras(); // Refrescar lista
    } catch (error) {
      console.error("Error cancelando asignación:", error);
      alert("Hubo un error al intentar cancelar la asignación.");
    }
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
                <th>Acciones</th>
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
                  {r.id_pedido_actual && (
                    <button
                      className="btn-view-history"
                      title="Cancelar Asignación / Liberar Recolectora"
                      onClick={() => handleCancelAssignment(r)}
                      style={{
                        fontSize: "0.8rem",
                        padding: "6px 12px",
                        background: "#e74c3c", // Rojo alerta
                        color: "white",
                        marginRight: "5px",
                      }}
                    >
                      <FaBan /> Liberar
                    </button>
                  )}
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
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          className="btn-view-history"
                          onClick={() => handleViewHistory(r)}
                          style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                        >
                          <FaHistory /> Historial
                        </button>
                        <button
                          className="btn-view-history"
                          title="Editar Datos"
                          onClick={() => handleEditClick(r)}
                          style={{
                            fontSize: "0.8rem",
                            padding: "6px 12px",
                            background: "#f39c12",
                          }}
                        >
                          <FaEdit /> Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --- MODAL 1: LISTA DE HISTORIAL --- */}
      {historyModalOpen && selectedRecolectora && (
        <div className="pedidos-modal-overlay">
          <div className="pedidos-modal-content" style={{ maxWidth: "900px" }}>
            <div className="pedidos-modal-header">
              <h2>Historial de {selectedRecolectora.nombre_completo}</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={() => setHistoryModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <div className="pedidos-modal-body">
              {historyLoading ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  Cargando historial...
                </div>
              ) : recolectoraHistory.length === 0 ? (
                <div
                  style={{ textAlign: "center", padding: 40, color: "#999" }}
                >
                  <FaHistory size={40} style={{ marginBottom: 10 }} />
                  <p>Esta recolectora aún no ha completado pedidos.</p>
                </div>
              ) : (
                <div className="history-grid-list">
                  {recolectoraHistory.map((h) => (
                    <div
                      key={h.id}
                      className="history-item-card clickable"
                      onClick={() => handleHistoryItemClick(h)}
                      title="Clic para ver detalle completo"
                    >
                      <div className="history-item-header">
                        <span className="history-order-id">
                          Pedido #{h.id_pedido}
                        </span>
                        <span className="history-date">
                          <FaCalendarAlt style={{ marginRight: 5 }} />
                          {new Date(h.fecha_fin).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="history-item-stats">
                        <div className="stat-pill time">
                          <FaClock style={{ marginRight: 5 }} />
                          {h.tiempo_formateado ||
                            `${Math.floor(
                              h.tiempo_total_segundos / 60
                            )} min`}{" "}
                        </div>
                        <div className="stat-pill completed">
                          <FaCheckCircle /> Completado
                        </div>
                      </div>
                      <div className="history-item-times">
                        <small>
                          Inicio:{" "}
                          {new Date(h.fecha_inicio).toLocaleTimeString()}
                        </small>
                        <small>
                          Fin: {new Date(h.fecha_fin).toLocaleTimeString()}
                        </small>
                      </div>
                      <div className="history-click-hint">
                        Ver Detalle &rarr;
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: DETALLE DEL PEDIDO HISTÓRICO --- */}
      {detailedOrder && (
        <div className="pedidos-modal-overlay" style={{ zIndex: 3000 }}>
          <div className="pedidos-modal-content" style={{ maxWidth: "1000px" }}>
            <div
              className="pedidos-modal-header"
              style={{ backgroundColor: "#2c3e50" }}
            >
              <h2>Detalle Pedido #{detailedOrder.id}</h2>
              <button
                className="pedidos-modal-close-btn"
                onClick={closeDetailModal}
              >
                &times;
              </button>
            </div>
            <div className="pedidos-modal-body">
              {detailLoading || !detailedOrder.billing ? (
                <div className="pedidos-loading-overlay">
                  <div className="pedidos-spinner"></div>
                </div>
              ) : (
                <>
                  <div className="pedidos-detail-row">
                    <div className="pedidos-detail-section pedidos-info-block">
                      <h4>👤 Cliente</h4>
                      <p>
                        <strong>Nombre:</strong>{" "}
                        {detailedOrder.billing?.first_name}{" "}
                        {detailedOrder.billing?.last_name}
                      </p>
                      <p>
                        <strong>Email:</strong> {detailedOrder.billing?.email}
                      </p>
                      <p>
                        <strong>Teléfono:</strong>{" "}
                        {detailedOrder.billing?.phone}
                      </p>
                    </div>
                    <div className="pedidos-detail-section pedidos-info-block">
                      <h4>📍 Envío</h4>
                      <p>
                        <strong>Dir:</strong> {detailedOrder.billing?.address_1}{" "}
                        {detailedOrder.billing?.address_2}
                      </p>
                      <p>
                        <strong>Ciudad:</strong> {detailedOrder.billing?.city}
                      </p>
                      {detailedOrder.customer_note && (
                        <p
                          style={{
                            marginTop: "10px",
                            fontStyle: "italic",
                            background: "#ffebee",
                            padding: "10px",
                            borderRadius: "8px",
                            color: "#c62828",
                          }}
                        >
                          📝 <strong>Nota:</strong> "
                          {detailedOrder.customer_note}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pedidos-products-section-title">
                    🛒 Productos ({detailedOrder.line_items?.length})
                  </div>
                  <div className="pedidos-products-grid">
                    {detailedOrder.line_items?.map((item, idx) => {
                      let statusBadge = null;
                      if (detailedOrder.reporte_items) {
                        const pickedItem =
                          detailedOrder.reporte_items.recolectados?.find(
                            (r) => r.id === item.id
                          );
                        const removedItem =
                          detailedOrder.reporte_items.retirados?.find(
                            (r) => r.id === item.id
                          );

                        if (pickedItem) {
                          statusBadge = (
                            <span
                              className="pedidos-badge-ok"
                              style={{ fontSize: "0.7rem" }}
                            >
                              Recolectado
                            </span>
                          );
                        }
                        if (removedItem) {
                          statusBadge = (
                            <span
                              className="pedidos-badge-busy"
                              style={{
                                fontSize: "0.7rem",
                                backgroundColor: "#e74c3c",
                              }}
                            >
                              {removedItem.reason ||
                                removedItem.motivo ||
                                "No Encontrado"}
                            </span>
                          );
                        }
                      }

                      return (
                        <div
                          key={item.id || idx}
                          className="pedidos-product-card"
                        >
                          <div className="pedidos-product-img-wrapper">
                            {item.image_src ? (
                              <img
                                src={item.image_src}
                                alt={item.name}
                                className="pedidos-product-img"
                                loading="lazy"
                              />
                            ) : (
                              <div className="pedidos-no-image">
                                <span>📷</span>
                                <small>Sin Imagen</small>
                              </div>
                            )}
                            <div className="pedidos-product-qty-tag">
                              {item.quantity}
                            </div>
                          </div>
                          <div className="pedidos-product-details">
                            <h4 className="pedidos-product-name">
                              {item.name}
                            </h4>
                            <div className="pedidos-product-price">
                              ${parseFloat(item.total).toLocaleString()}
                            </div>
                            {statusBadge && (
                              <div style={{ marginTop: 5 }}>{statusBadge}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
