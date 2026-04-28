import React from "react";
import { FaSync } from "react-icons/fa";
import HistoryView from "./HistoryView";

const PendingPaymentView = ({
  pendingPaymentOrders,
  loading,
  onRefresh,
  onViewDetail,
  onViewManifest,
  onRegisterPayments,
}) => {
  return (
    <>
      <header className="pedidos-layout-header">
        <h1>💸 Pendientes de Pago</h1>
        <button onClick={onRefresh} className="pedidos-admin-refresh-btn">
          <FaSync /> Refrescar
        </button>
      </header>
      <div className="pedidos-layout-body">
        <HistoryView
          historyOrders={pendingPaymentOrders}
          loading={loading}
          onViewDetail={onViewDetail}
          onViewManifest={onViewManifest}
          loadingText="Cargando pendientes de pago..."
          emptyText="💰 No hay pedidos pendientes de pago"
          isPaymentView={true}
          onRegisterPayments={onRegisterPayments}
        />
      </div>
    </>
  );
};

export default PendingPaymentView;
