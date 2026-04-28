import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  AlertTriangle,
  DollarSign,
  RefreshCw,
  Target,
  Users,
  Package,
  Zap,
  Award,
  Activity,
  Inbox,
} from "lucide-react";
import { analyticsApi } from "../shared/ecommerceApi";
import { useSedeContext } from "../shared/SedeContext";
import AuditLogView from "./AuditLogView";
import VariacionesTab from "./VariacionesTab";
import "./AnaliticaPickers.css";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

const fmtCurrency = (v) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v || 0);

const fmtCurrencyCompact = (v) => {
  const n = v || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
};

const fmtNumber = (v) =>
  new Intl.NumberFormat("es-CO").format(v || 0);

const fmtPercent = (v) => `${v ?? 0}%`;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

const KPICard = ({ icon: Icon, label, value, accent = "indigo", hint }) => (
  <div className={`ip-kpi ip-kpi--${accent}`}>
    <div className="ip-kpi__icon">
      <Icon size={20} />
    </div>
    <div className="ip-kpi__body">
      <span className="ip-kpi__label">{label}</span>
      <span className="ip-kpi__value">{value}</span>
      {hint && <span className="ip-kpi__hint">{hint}</span>}
    </div>
  </div>
);

const ChartCard = ({ title, subtitle, children, action }) => (
  <section className="ip-card">
    <header className="ip-card__head">
      <div>
        <h3 className="ip-card__title">{title}</h3>
        {subtitle && <p className="ip-card__sub">{subtitle}</p>}
      </div>
      {action}
    </header>
    <div className="ip-card__body">{children}</div>
  </section>
);

const EmptyState = ({ icon: Icon = Inbox, message }) => (
  <div className="ip-empty">
    <Icon size={28} />
    <p>{message}</p>
  </div>
);

const Loading = () => (
  <div className="ip-loading">
    <div className="ip-spinner" />
    <p>Cargando inteligencia…</p>
  </div>
);

const TooltipBox = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="ip-tooltip">
      {label && <p className="ip-tooltip__label">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="ip-tooltip__row">
          <span
            className="ip-tooltip__dot"
            style={{ background: p.color || p.fill }}
          />
          <span className="ip-tooltip__name">{p.name}</span>
          <span className="ip-tooltip__value">
            {formatter ? formatter(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

const ResumenTab = ({ data }) => {
  const { financials, operations } = data;
  const hasTrend = financials.revenueTrend?.length > 0;
  const hasMethods = financials.revenueByMethod?.length > 0;
  const hasWeekday = data.weekdayActivity?.some((d) => d.pedidos > 0);

  return (
    <>
      <div className="ip-kpi-grid">
        <KPICard
          icon={DollarSign}
          accent="indigo"
          label="Recaudación total"
          value={fmtCurrency(financials.totalRevenue)}
          hint={`${fmtNumber(financials.orderCount)} pedidos cobrados`}
        />
        <KPICard
          icon={TrendingUp}
          accent="emerald"
          label="Ticket promedio"
          value={fmtCurrency(financials.avgTicket)}
          hint="Por pedido"
        />
        <KPICard
          icon={Target}
          accent="amber"
          label="Pedido perfecto"
          value={fmtPercent(operations.perfectOrderRate)}
          hint="Sin sustituciones ni faltantes"
        />
        <KPICard
          icon={Zap}
          accent="violet"
          label="SPI promedio"
          value={`${operations.spiAverage}s`}
          hint="Segundos por ítem global"
        />
      </div>

      <div className="ip-grid">
        <ChartCard
          title="Tendencia de ventas"
          subtitle="Recaudación diaria del rango seleccionado"
        >
          <div className="ip-chart">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financials.revenueTrend}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtCurrencyCompact}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    content={<TooltipBox formatter={fmtCurrency} />}
                  />
                  <Area
                    type="monotone"
                    name="Ingresos"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#gRev)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Sin ventas en el rango seleccionado" />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Pedidos por día"
          subtitle="Volumen procesado por jornada"
        >
          <div className="ip-chart">
            {hasTrend ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={financials.revenueTrend}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip content={<TooltipBox />} />
                  <Line
                    type="monotone"
                    name="Pedidos"
                    dataKey="orders"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#10b981" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Sin pedidos en el rango" />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Mix de medios de pago"
          subtitle="Distribución de la recaudación"
        >
          <div className="ip-chart ip-chart--row">
            {hasMethods ? (
              <>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={financials.revenueByMethod}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {financials.revenueByMethod.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipBox formatter={fmtCurrency} />} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="ip-legend">
                  {financials.revenueByMethod.map((m, i) => {
                    const pct = financials.totalRevenue
                      ? Math.round((m.value / financials.totalRevenue) * 100)
                      : 0;
                    return (
                      <li key={m.name}>
                        <span
                          className="ip-legend__dot"
                          style={{ background: PALETTE[i % PALETTE.length] }}
                        />
                        <span className="ip-legend__name">{m.name}</span>
                        <span className="ip-legend__val">
                          {fmtCurrency(m.value)} <em>· {pct}%</em>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState message="Sin datos de medios de pago" />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Ventas por día de la semana"
          subtitle="Patrón estacional"
        >
          <div className="ip-chart">
            {hasWeekday ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekdayActivity}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtCurrencyCompact}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<TooltipBox formatter={fmtCurrency} />} />
                  <Bar
                    dataKey="revenue"
                    name="Ingresos"
                    fill="#6366f1"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Sin patrón semanal todavía" />
            )}
          </div>
        </ChartCard>
      </div>
    </>
  );
};

const OperacionTab = ({ data }) => {
  const { operations, pickers, hourlyActivity } = data;
  const hasPickers = pickers?.length > 0;
  const hasHourly = hourlyActivity?.some((h) => h.pedidos > 0);

  const opsBreakdown = useMemo(
    () => [
      { name: "Recolectado", value: operations.completionRate, fill: "#10b981" },
      { name: "Sustituido", value: operations.substitutionRate, fill: "#f59e0b" },
      { name: "No encontrado", value: operations.notFoundRate, fill: "#ef4444" },
    ],
    [operations],
  );

  return (
    <>
      <div className="ip-kpi-grid">
        <KPICard
          icon={ShoppingBag}
          accent="indigo"
          label="Pedidos completados"
          value={fmtNumber(operations.totalCompletedOrders)}
          hint={`${fmtNumber(operations.totalSessions)} sesiones`}
        />
        <KPICard
          icon={Clock}
          accent="emerald"
          label="Duración promedio"
          value={`${operations.avgSessionMin} min`}
          hint="Por pedido"
        />
        <KPICard
          icon={Activity}
          accent="amber"
          label="Tasa de éxito"
          value={fmtPercent(operations.completionRate)}
          hint={`${fmtPercent(operations.substitutionRate)} sustituido`}
        />
        <KPICard
          icon={Users}
          accent="violet"
          label="Pickers activos"
          value={fmtNumber(pickers.length)}
          hint={`${operations.avgItemsPerOrder} ítems / pedido`}
        />
      </div>

      <div className="ip-grid">
        <ChartCard
          title="Ranking de pickers"
          subtitle="Ordenado por volumen y precisión"
        >
          {hasPickers ? (
            <div className="ip-table-wrap">
              <table className="ip-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Picker</th>
                    <th className="num">Pedidos</th>
                    <th className="num">Ítems</th>
                    <th className="num">SPI</th>
                    <th className="num">Velocidad</th>
                    <th className="num">Precisión</th>
                    <th className="num">Perfectos</th>
                  </tr>
                </thead>
                <tbody>
                  {pickers.slice(0, 10).map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        {i < 3 ? (
                          <span className={`ip-rank ip-rank--${i + 1}`}>
                            {i + 1}
                          </span>
                        ) : (
                          <span className="ip-rank-num">{i + 1}</span>
                        )}
                      </td>
                      <td className="ip-picker-name">{p.nombre}</td>
                      <td className="num">{fmtNumber(p.pedidos)}</td>
                      <td className="num">
                        {fmtNumber(p.items_recolectados)}
                      </td>
                      <td className="num">{p.segundos_por_item}s</td>
                      <td className="num">{p.velocidad_items_min}/min</td>
                      <td className="num">
                        <ProgressPill
                          value={p.tasa_precision}
                          tone={
                            p.tasa_precision >= 90
                              ? "good"
                              : p.tasa_precision >= 75
                                ? "mid"
                                : "bad"
                          }
                        />
                      </td>
                      <td className="num">
                        <ProgressPill
                          value={p.tasa_pedido_perfecto}
                          tone={
                            p.tasa_pedido_perfecto >= 90
                              ? "good"
                              : p.tasa_pedido_perfecto >= 75
                                ? "mid"
                                : "bad"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Award}
              message="Sin actividad de pickers en el rango"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Carga por hora"
          subtitle="Pedidos iniciados (hora Colombia)"
        >
          <div className="ip-chart">
            {hasHourly ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyActivity}>
                  <defs>
                    <linearGradient id="gHour" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    interval={2}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip content={<TooltipBox />} />
                  <Area
                    type="monotone"
                    name="Pedidos"
                    dataKey="pedidos"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#gHour)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Sin actividad horaria registrada" />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Composición de acciones"
          subtitle="Cómo se resolvieron los ítems"
        >
          <div className="ip-chart ip-chart--center">
            {operations.completionRate +
              operations.substitutionRate +
              operations.notFoundRate >
            0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={opsBreakdown} layout="vertical">
                  <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#1e293b" }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    content={<TooltipBox formatter={(v) => `${v}%`} />}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {opsBreakdown.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Sin acciones registradas todavía" />
            )}
          </div>
        </ChartCard>
      </div>
    </>
  );
};

const ProductosTab = ({ data }) => {
  const { topSellingProducts, productIssues } = data;
  const hasSelling = topSellingProducts?.length > 0;
  const hasIssues = productIssues?.length > 0;

  return (
    <div className="ip-grid">
      <ChartCard
        title="Top productos por ingresos"
        subtitle="Lo que más vende en el rango"
      >
        {hasSelling ? (
          <div className="ip-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topSellingProducts.slice(0, 10)}
                layout="vertical"
                margin={{ left: 4, right: 16 }}
              >
                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtCurrencyCompact}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#1e293b" }}
                  axisLine={false}
                  tickLine={false}
                  width={170}
                  tickFormatter={(v) =>
                    v.length > 24 ? v.slice(0, 24) + "…" : v
                  }
                />
                <Tooltip content={<TooltipBox formatter={fmtCurrency} />} />
                <Bar
                  dataKey="revenue"
                  name="Ingresos"
                  fill="#6366f1"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={Package}
            message="Sin productos vendidos en el rango"
          />
        )}
      </ChartCard>

      <ChartCard
        title="Productos problemáticos"
        subtitle="Sustituciones y faltantes detectados"
      >
        {hasIssues ? (
          <div className="ip-table-wrap">
            <table className="ip-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Incidencias</th>
                  <th>Motivo principal</th>
                  <th>Severidad</th>
                </tr>
              </thead>
              <tbody>
                {productIssues.map((p) => {
                  const severity =
                    p.count >= 10 ? "alta" : p.count >= 5 ? "media" : "baja";
                  return (
                    <tr key={p.name}>
                      <td className="ip-product-name">{p.name}</td>
                      <td className="num strong">{p.count}</td>
                      <td className="ip-muted">{p.top_motivo}</td>
                      <td>
                        <span className={`ip-badge ip-badge--${severity}`}>
                          {severity}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={AlertTriangle}
            message="Sin productos problemáticos en el rango"
          />
        )}
      </ChartCard>
    </div>
  );
};

const ProgressPill = ({ value, tone }) => (
  <div className={`ip-pill ip-pill--${tone}`}>
    <div className="ip-pill__bar" style={{ width: `${value}%` }} />
    <span>{value}%</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Container
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Resumen ejecutivo" },
  { id: "ops", label: "Operación" },
  { id: "products", label: "Productos" },
  { id: "variations", label: "Variaciones" },
  { id: "audit", label: "Auditoría" },
];

const RANGES = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "all", label: "Histórico" },
];

const AnaliticaPickers = () => {
  const { getSedeParam, sedeId, sedeName } = useSedeContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("7d");
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = getSedeParam();
      const params = {
        range,
        ...Object.fromEntries(new URLSearchParams(sp)),
      };
      const res = await analyticsApi.get("/intelligence", { params });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching intelligence:", err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range, sedeId]);

  if (loading && !data) {
    return (
      <div className="ip-shell">
        <Loading />
      </div>
    );
  }

  return (
    <div className="ip-shell">
      <header className="ip-header">
        <div>
          <h1>Centro de Inteligencia</h1>
          <p>
            Análisis estratégico y rendimiento operativo
            {sedeName ? ` · ${sedeName}` : ""}
          </p>
        </div>
        <div className="ip-controls">
          <div className="ip-range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                className={range === r.id ? "active" : ""}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="ip-refresh"
            disabled={loading}
            aria-label="Actualizar"
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Actualizar
          </button>
        </div>
      </header>

      <nav className="ip-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="ip-error">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {tab === "audit" ? (
        <main className="ip-content ip-content--audit">
          <AuditLogView />
        </main>
      ) : tab === "variations" ? (
        <main className="ip-content">
          <VariacionesTab range={range} sedeId={sedeId} />
        </main>
      ) : (
        data && (
          <main className="ip-content">
            {tab === "overview" && <ResumenTab data={data} />}
            {tab === "ops" && <OperacionTab data={data} />}
            {tab === "products" && <ProductosTab data={data} />}
          </main>
        )
      )}
    </div>
  );
};

export default AnaliticaPickers;
