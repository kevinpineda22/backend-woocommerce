import React, { useState, useEffect, useMemo } from "react";
import {
  FaTimes,
  FaCheck,
  FaSpinner,
  FaUserCircle,
  FaStoreAlt,
} from "react-icons/fa";
import "./MarkPaymentModal.css";

const METHOD_OPTIONS = [
  { id: "efectivo", label: "💵 Efectivo" },
  { id: "qr", label: "📱 QR" },
  { id: "datafono", label: "💳 Datáfono" },
  { id: "credito", label: "🏦 Crédito" },
];

const METHOD_LABELS = METHOD_OPTIONS.reduce((acc, m) => {
  acc[m.id] = m.label;
  return acc;
}, {});

const formatPrice = (amount) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(parseFloat(amount) || 0);

const MarkPaymentModal = ({
  isOpen,
  session,
  onCancel,
  onConfirm,
  isProcessing = false,
}) => {
  const [selections, setSelections] = useState({});

  // Cada vez que cambia la sesión, reiniciamos selecciones (no precargamos los
  // ya pagados — esos no son editables).
  useEffect(() => {
    setSelections({});
  }, [session?.id]);

  const orders = useMemo(() => {
    if (!session) return [];
    const pagosById = new Map(
      (session.pagos_pedidos || []).map((p) => [p.id_pedido, p]),
    );
    return (session.pedidos || []).map((idPedido, idx) => {
      const pago = pagosById.get(idPedido);
      return {
        id: idPedido,
        cliente: session.clientes?.[idx] || "—",
        total: session.totales?.[idx],
        documento: session.documentos?.[idx],
        metodo_pago: pago?.metodo_pago || null,
        pagado_por: pago?.pagado_por || null,
      };
    });
  }, [session]);

  const pendingOrders = orders.filter((o) => !o.metodo_pago);
  const paidOrders = orders.filter((o) => o.metodo_pago);

  // Permitimos pago parcial: con un solo método seleccionado ya se puede
  // confirmar. Los pedidos sin método siguen pendientes para una próxima vuelta.
  const selectedCount = pendingOrders.filter((o) => selections[o.id]).length;
  const canConfirm = selectedCount > 0;

  if (!isOpen || !session) return null;

  const handleSelect = (idPedido, method) => {
    setSelections((prev) => ({ ...prev, [idPedido]: method }));
  };

  const handleConfirmClick = () => {
    if (!canConfirm || isProcessing) return;
    const payments = pendingOrders
      .filter((o) => selections[o.id])
      .map((o) => ({
        id_pedido: o.id,
        payment_method: selections[o.id],
      }));
    onConfirm(payments);
  };

  return (
    <div
      className="mp-overlay"
      onClick={(e) => {
        e.stopPropagation();
        if (!isProcessing) onCancel();
      }}
    >
      <div
        className="mp-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="mp-header">
          <div className="mp-header-titles">
            <h3 className="mp-title">💸 Registrar Pagos por Pedido</h3>
            <p className="mp-subtitle">
              <FaUserCircle className="mp-subtitle-icon" />
              {session.picker}
              {session.sede_nombre && (
                <>
                  <span className="mp-subtitle-sep">·</span>
                  <FaStoreAlt className="mp-subtitle-icon" />
                  {session.sede_nombre}
                </>
              )}
            </p>
            <p className="mp-hint">
              Cada pedido es independiente. Asigna su método de pago real.
            </p>
          </div>
          <button
            type="button"
            className="mp-close"
            onClick={onCancel}
            disabled={isProcessing}
            aria-label="Cerrar"
          >
            <FaTimes />
          </button>
        </header>

        <div className="mp-body">
          {paidOrders.length > 0 && (
            <section className="mp-section mp-section--done">
              <h4 className="mp-section-title">Ya registrados</h4>
              {paidOrders.map((o) => (
                <article key={o.id} className="mp-row mp-row--done">
                  <div className="mp-row-info">
                    <span className="mp-order-id">#{o.id}</span>
                    <span className="mp-cliente">{o.cliente}</span>
                    {o.total != null && (
                      <span className="mp-total">{formatPrice(o.total)}</span>
                    )}
                  </div>
                  <span className="mp-method-tag">
                    {METHOD_LABELS[o.metodo_pago] || o.metodo_pago}
                  </span>
                </article>
              ))}
            </section>
          )}

          {pendingOrders.length > 0 && (
            <section className="mp-section">
              <h4 className="mp-section-title">Pendientes de pago</h4>
              {pendingOrders.map((o) => {
                const selected = selections[o.id];
                return (
                  <article key={o.id} className="mp-row">
                    <div className="mp-row-info">
                      <span className="mp-order-id">#{o.id}</span>
                      <span className="mp-cliente">{o.cliente}</span>
                      {o.total != null && (
                        <span className="mp-total">{formatPrice(o.total)}</span>
                      )}
                    </div>
                    <div className="mp-methods" role="radiogroup">
                      {METHOD_OPTIONS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={selected === m.id}
                          className={`mp-btn mp-btn--${m.id} ${selected === m.id ? "mp-btn--active" : ""}`}
                          onClick={() => handleSelect(o.id, m.id)}
                          disabled={isProcessing}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>

        <footer className="mp-footer">
          <button
            type="button"
            className="mp-action mp-action--cancel"
            onClick={onCancel}
            disabled={isProcessing}
          >
            <FaTimes /> Cancelar
          </button>
          <button
            type="button"
            className="mp-action mp-action--confirm"
            onClick={handleConfirmClick}
            disabled={!canConfirm || isProcessing}
          >
            {isProcessing ? (
              <>
                <FaSpinner className="mp-spin" /> Procesando...
              </>
            ) : (
              <>
                <FaCheck /> Confirmar {selectedCount}{" "}
                {selectedCount === 1 ? "pago" : "pagos"}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default MarkPaymentModal;
