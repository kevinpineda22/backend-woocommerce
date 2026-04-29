import React, { useState, useEffect } from "react";
import { 
  TrendingUp, 
  TrendingDown, 
  ChevronDown, 
  ChevronUp, 
  Package, 
  Scale, 
  RefreshCw, 
  AlertTriangle,
  User,
  DollarSign
} from "lucide-react";
import { analyticsApi } from "../shared/ecommerceApi";
import "./VariacionesTab.css";

const fmtCurrency = (v) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0);

const fmtDate = (dateStr) => {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const KPICard = ({ label, value, icon: Icon, trend }) => (
  <div className="vp-kpi-card">
    <div className="vp-kpi-card__icon">
      <Icon size={24} />
    </div>
    <div className="vp-kpi-card__content">
      <span className="vp-kpi-card__label">{label}</span>
      <span className="vp-kpi-card__value">{value}</span>
      {trend !== undefined && (
        <span className={`vp-kpi-card__trend ${trend >= 0 ? 'pos' : 'neg'}`}>
          {trend >= 0 ? '+' : ''}{fmtCurrency(trend)}
        </span>
      )}
    </div>
  </div>
);

const EventRow = ({ event }) => {
  const getIcon = () => {
    switch (event.type) {
      case "sustitucion": return <RefreshCw size={14} />;
      case "faltante": return <AlertTriangle size={14} />;
      case "peso": return <Scale size={14} />;
      case "admin": return <User size={14} />;
      default: return <Package size={14} />;
    }
  };

  return (
    <div className={`vp-event vp-event--${event.type}`}>
      <div className="vp-event__time">{new Date(event.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="vp-event__icon">{getIcon()}</div>
      <div className="vp-event__body">
        <div className="vp-event__title">
          <strong>{event.reason_label}</strong>: {event.producto}
        </div>
        <div className="vp-event__meta">
          {event.metadata.sustituto && <span>Sustituido por: {event.metadata.sustituto}</span>}
          {event.type === 'sustitucion' && (
            <span className="vp-event__prices">
              (Orig: {fmtCurrency(event.metadata.precio_original)} → Nuevo: {fmtCurrency(event.metadata.precio_sustituto)})
            </span>
          )}
          {event.type === 'faltante' && event.metadata.precio_original > 0 && (
            <span className="vp-event__prices">
              (Perdido: -{fmtCurrency(event.metadata.precio_original)})
            </span>
          )}
          {event.metadata.peso && <span>Peso: {event.metadata.peso}kg</span>}
          {event.motivo && <span>Motivo: {event.motivo}</span>}
        </div>
      </div>
    </div>
  );
};

const VariacionesTab = ({ range, sedeId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchVariaciones = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.get("/variaciones", {
        params: { range, sede_id: sedeId }
      });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching variations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVariaciones();
  }, [range, sedeId]);

  if (loading) return <div className="vp-loading">Cargando variaciones...</div>;
  if (!data || !data.variaciones.length) return <div className="vp-empty">No se encontraron variaciones de precio en este periodo.</div>;

  const toggleRow = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="vp-container">
      <div className="vp-stats vp-stats--extended">
        <KPICard 
          label="Variación Total" 
          value={fmtCurrency(data.stats.total_delta)} 
          icon={DollarSign}
          trend={data.stats.total_delta}
        />
        <KPICard 
          label="Delta Promedio" 
          value={fmtCurrency(data.stats.avg_delta)} 
          icon={TrendingUp}
        />
        <KPICard 
          label="Sustituciones" 
          value={data.stats.reasons.sustitucion} 
          icon={RefreshCw}
        />
        <KPICard 
          label="Prom. Sustituidos/Ped" 
          value={Number(data.stats.avg_sustituciones_por_pedido || 0).toFixed(2)} 
          icon={RefreshCw}
        />
        <KPICard 
          label="Prom. Removidos/Ped" 
          value={Number((data.stats.avg_eliminados_por_pedido || 0) + (data.stats.avg_faltantes_por_pedido || 0)).toFixed(2)} 
          icon={AlertTriangle}
        />
      </div>

      <div className="vp-table-container">
        <table className="vp-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Picker</th>
              <th>Fecha</th>
              <th className="num">Inicial</th>
              <th className="num">Final</th>
              <th className="num">Variación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.variaciones.map((v) => (
              <React.Fragment key={`${v.id_pedido}-${v.id_sesion}`}>
                <tr className={`vp-row ${expandedRow === v.id_pedido ? 'expanded' : ''}`} onClick={() => toggleRow(v.id_pedido)}>
                  <td className="strong">#{v.id_pedido}</td>
                  <td>{v.picker}</td>
                  <td>{fmtDate(v.fecha)}</td>
                  <td className="num">{fmtCurrency(v.total_inicial)}</td>
                  <td className="num">{fmtCurrency(v.total_final)}</td>
                  <td className={`num strong ${v.delta >= 0 ? 'pos' : 'neg'}`}>
                    {v.delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {fmtCurrency(v.delta)}
                  </td>
                  <td className="vp-row__toggle">
                    {expandedRow === v.id_pedido ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </td>
                </tr>
                {expandedRow === v.id_pedido && (
                  <tr className="vp-detail-row">
                    <td colSpan="7">
                      <div className="vp-detail">
                        <h4>Línea de tiempo de variaciones</h4>
                        <div className="vp-timeline">
                          {v.events && v.events.length > 0 ? (
                            v.events.map(event => <EventRow key={event.id} event={event} />)
                          ) : (
                            <div className="vp-timeline-empty">No se registraron logs específicos para este cambio (posible ajuste manual externo).</div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VariacionesTab;