import React from "react";
import { FaSync } from "react-icons/fa";
import HistoryView from "./admin/HistoryView";

const PendingAuditView = ({
  pendingOrders,
  loading,
  onRefresh,
  onViewDetail,
  onViewManifest,
}) => {
  return (
    <>
      <header className="pedidos-layout-header">
        <h1>🕒 Pendientes de Auditoria</h1>
        <button onClick={onRefresh} className="pedidos-admin-refresh-btn">
          <FaSync /> Refrescar
        </button>
      </header>
      <div className="pedidos-layout-body">
        <HistoryView
          historyOrders={pendingOrders}
          loading={loading}
          onViewDetail={onViewDetail}
          onViewManifest={onViewManifest}
          loadingText="Cargando pendientes de auditoria..."
          emptyText="📭 No hay pendientes de auditoria"
        />
      </div>
    </>
  );
};

export default PendingAuditView;
