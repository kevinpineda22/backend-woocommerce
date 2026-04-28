import React, { useState } from "react";
import { FaSync } from "react-icons/fa";
import HistoryView from "./HistoryView";
import VistaAuditor from "../auditor/VistaAuditor";

const PendingAuditView = ({
  pendingOrders,
  loading,
  onRefresh,
  onViewDetail,
  onViewManifest,
}) => {
  const [auditSessionId, setAuditSessionId] = useState(null);

  if (auditSessionId) {
    return (
      <div className="pending-audit-overlay">
        <VistaAuditor
          initialSessionId={auditSessionId}
          onClose={() => {
            setAuditSessionId(null);
            onRefresh();
          }}
        />
      </div>
    );
  }

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
          isAuditView={true}
          onAudit={(sess) => setAuditSessionId(sess.id)}
          loadingText="Cargando pendientes de auditoria..."
          emptyText="📭 No hay pendientes de auditoria"
        />
      </div>
    </>
  );
};

export default PendingAuditView;
