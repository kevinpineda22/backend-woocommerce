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
  FaHistory,
  FaClock,
  FaCalendarAlt,
  FaCheckCircle,
  FaEdit,
  FaBan,
} from "react-icons/fa";

export const GestionPickers = () => {
  const [pickers, setPickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Estados para el Historial (Lista de pedidos realizados)
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedPicker, setSelectedPicker] = useState(null);
  const [pickerHistory, setPickerHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Estados para el Detalle del Pedido Histórico (Productos, etc.)
  const [detailedOrder, setDetailedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchPickers = async () => {
    setLoading(true);
    try {
      // 1. Obtener usuarios con rol 'picker' desde la tabla maestra PROFILES
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "picker");

      if (profilesError) throw profilesError;

      // 2. Obtener estado actual (operativo) de WC_PICKERS
      const { data: wcData, error: wcError } = await supabase
        .from("wc_pickers")
        .select("*");

      if (wcError) throw wcError;

      // Unir datos: perfiles (auth) + wc_pickers (operativo)
      // Usamos el email como clave de enlace (asumiendo que coinciden) o id si fuera posible
      // En este sistema, wc_pickers se crea al crear usuario.

      const merged = profilesData.map((profile) => {
        // La tabla profiles usa 'correo', wc_pickers usa 'email'
        const operativo = wcData.find((w) => w.email === profile.correo);
        return {
          ...profile,
          ...operativo, // Trae estado_picker, id_pedido_actual, etc.
          id: profile.user_id, // Usamos user_id de profiles
          wc_id: operativo?.id, // ID en tabla wc_pickers
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

  // --- ACCIÓN: VER HISTORIAL ---
  const handleViewHistory = async (picker) => {
    setSelectedPicker(picker);
    setHistoryModalOpen(true);
    setPickerHistory([]);
    setDetailedOrder(null); // Reset detalle al abrir historial
    setHistoryLoading(true);

    try {
      // Llamamos endpoint de historial backend
      const response = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/historial?id_picker=${picker.wc_id}`
      );
      setPickerHistory(response.data);
    } catch (error) {
      console.error("Error obteniendo historial:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // --- ACCIÓN: CLICK EN UN PEDIDO DEL HISTORIAL (VER DETALLE) ---
  const handleHistoryOrderClick = async (orderId) => {
    setDetailLoading(true);
    setDetailedOrder(null);
    try {
      // Usamos endpoint getOrderById
      const response = await axios.get(
        `https://backend-woocommerce.vercel.app/api/orders/${orderId}`
      );
      setDetailedOrder(response.data);
    } catch (error) {
      console.error("Error cargando detalle historial:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  // --- ACCIÓN: CANCELAR PEDIDO ACTUAL (LIBERAR PICKER) ---
  const handleCancelAssignment = async (picker) => {
    if (
      !window.confirm(
        `¿Estás seguro de cancelar la asignación del pedido #${picker.id_pedido_actual} para ${picker.nombre_completo}?\n\nEl picker quedará libre inmediatamente.`
      )
    ) {
      return;
    }

    try {
      await axios.post(
        "https://backend-woocommerce.vercel.app/api/orders/cancelar-asignacion",
        {
          id_picker: picker.wc_id, // Usamos ID de la tabla wc_pickers
        }
      );
      alert("Asignación cancelada exitosamente.");
      fetchPickers(); // Refrescar lista
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
              style={{ backgroundColor: "#2ecc71" }}
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
                  <td
                    colSpan="5"
                    style={{ textAlign: "center", padding: "20px" }}
                  >
                    Cargando...
                  </td>
                </tr>
              ) : pickers.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    style={{ textAlign: "center", padding: "20px" }}
                  >
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
                        <span
                          style={{
                            background: "#fff3cd",
                            color: "#856404",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontWeight: "bold",
                            fontSize: "0.85rem",
                          }}
                        >
                          En Misión
                        </span>
                      ) : (
                        <span
                          style={{
                            background: "#d4edda",
                            color: "#155724",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontWeight: "bold",
                            fontSize: "0.85rem",
                          }}
                        >
                          Disponible
                        </span>
                      )}
                    </td>
                    <td>
                      {r.id_pedido_actual ? (
                        <span style={{ fontWeight: "bold", color: "#e67e22" }}>
                          Order #{r.id_pedido_actual}
                        </span>
                      ) : (
                        <span style={{ color: "#bdc3c7" }}>-</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          className="btn-view-history"
                          onClick={() => handleViewHistory(r)}
                          title="Ver Historial"
                        >
                          <FaHistory /> Historial
                        </button>
                        <button
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#f39c12",
                            cursor: "pointer",
                            fontSize: "1.1rem",
                          }}
                          onClick={() => handleEditClick(r)}
                          title="Editar Usuario"
                        >
                          <FaEdit />
                        </button>

                        {/* Botón de pánico: Cancelar asignación */}
                        {r.estado_picker === "picking" && (
                          <button
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#e74c3c",
                              cursor: "pointer",
                              fontSize: "1.1rem",
                            }}
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

      {/* MODAL HISTORIAL */}
      {historyModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setHistoryModalOpen(false)}
        >
          {/* Se detiene propagación para que click dentro no cierre */}
          <div
            style={{
              background: "white",
              width: "90%",
              maxWidth: detailedOrder ? "1000px" : "800px", // Más ancho si hay detalle
              height: "85vh",
              borderRadius: "12px",
              padding: "20px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setHistoryModalOpen(false)}
              style={{
                position: "absolute",
                top: 15,
                right: 15,
                border: "none",
                background: "transparent",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: "#95a5a6",
              }}
            >
              &times;
            </button>

            <h2 style={{ marginTop: 0, color: "#2c3e50" }}>
              <FaHistory style={{ marginRight: 8 }} />
              Historial:{" "}
              <span style={{ color: "#3498db" }}>
                {selectedPicker?.nombre_completo}
              </span>
            </h2>

            {/* CONTENIDO DEL MODAL CON SCROLL */}
            <div style={{ flex: 1, overflowY: "auto", marginTop: "10px" }}>
              {detailedOrder ? (
                // --- VISTA DETALLE DE UN PEDIDO ---
                <div className="animate-fade-in">
                  <button
                    onClick={() => setDetailedOrder(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#3498db",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "15px",
                      gap: "5px",
                    }}
                  >
                    <FaArrowLeft /> Volver al listado
                  </button>

                  <div
                    style={{
                      borderBottom: "1px solid #eee",
                      paddingBottom: "10px",
                      marginBottom: "15px",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.2rem",
                        color: "#1e293b",
                      }}
                    >
                      Detalle Pedido #{detailedOrder.id}
                    </h3>
                  </div>

                  {/* Detalle visual de productos (Reutilizando estilos de PedidosAdmin) */}
                  <div className="pedidos-products-grid">
                    {detailedOrder.line_items.map((item) => {
                      // Determinar estado item en base al snapshot o logs
                      // Si reporte_items existe
                      let statusColor = "white"; // Default
                      let statusBorder = "transparent";
                      let quantityBadgeColor = "#4caf50";

                      if (detailedOrder.reporte_items) {
                        const isRecolectado =
                          detailedOrder.reporte_items.recolectados.find(
                            (x) => x.id === item.product_id
                          );
                        const isRetirado =
                          detailedOrder.reporte_items.retirados.find(
                            (x) => x.id === item.product_id
                          );

                        if (isRetirado) {
                          statusColor = "#fff5f5";
                          statusBorder = "#fc8181";
                          quantityBadgeColor = "#e53e3e"; // Rojo
                        } else if (isRecolectado) {
                          statusColor = "#f0fff4";
                          statusBorder = "#68d391";
                        } else {
                          // Pendiente/Faltante (raro en completado)
                          statusColor = "#fefcbf";
                          statusBorder = "#f6e05e";
                          quantityBadgeColor = "#d69e2e";
                        }
                      }

                      return (
                        <div
                          key={item.id}
                          className="pedidos-product-card"
                          style={{
                            borderColor: statusBorder,
                            background: statusColor,
                          }}
                        >
                          <div className="pedidos-product-img-wrapper">
                            <span
                              className="pedidos-product-qty-tag"
                              style={{ background: quantityBadgeColor }}
                            >
                              x{item.quantity}
                            </span>
                            {item.image_src ? (
                              <img
                                src={item.image_src}
                                alt={item.name}
                                className="pedidos-product-img"
                              />
                            ) : (
                              <div style={{ color: "#aaa" }}>Sin Imagen</div>
                            )}
                          </div>
                          <div className="pedidos-product-details">
                            <div className="pedidos-product-name">
                              {item.name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "#64748b",
                                marginTop: "5px",
                              }}
                            >
                              Pasillo: <strong>{item.pasillo || "N/A"}</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // --- VISTA LISTA DE HISTORIAL ---
                <>
                  {historyLoading ? (
                    <div style={{ padding: "20px", textAlign: "center" }}>
                      Cargando historial...
                    </div>
                  ) : pickerHistory.length === 0 ? (
                    <div
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#95a5a6",
                      }}
                    >
                      <FaHistory
                        size={40}
                        style={{ display: "block", margin: "0 auto 10px" }}
                      />
                      Esta picker no ha completado pedidos aún.
                    </div>
                  ) : (
                    <div className="history-grid-list">
                      {pickerHistory.map((h) => (
                        <div
                          key={h.id}
                          className="history-item-card clickable"
                          onClick={() => handleHistoryOrderClick(h.id_pedido)}
                        >
                          <div className="history-item-header">
                            <span className="history-order-id">
                              #{h.id_pedido}
                            </span>
                            <FaCheckCircle color="#2ecc71" />
                          </div>

                          <div className="history-item-stats">
                            <span className="stat-pill time">
                              <FaClock /> {h.tiempo_formateado}
                            </span>
                            {/* Podríamos agregar conteo items si viniera del backend */}
                          </div>

                          <div className="history-item-times">
                            <div className="history-date">
                              <FaCalendarAlt style={{ marginRight: 4 }} />
                              {new Date(h.fecha_fin).toLocaleDateString()}{" "}
                              {new Date(h.fecha_fin).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>

                          <div className="history-click-hint">Ver Detalle</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {/* FIN CONTENIDO SCROLL */}
          </div>
        </div>
      )}
    </div>
  );
};
