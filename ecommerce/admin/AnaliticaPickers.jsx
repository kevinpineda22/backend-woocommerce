import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from "recharts";
import { 
  TrendingUp, ShoppingBag, Clock, 
  AlertTriangle, DollarSign, RefreshCw 
} from "lucide-react";
import { analyticsApi } from "../shared/ecommerceApi";
import { useSedeContext } from "../shared/SedeContext";
import "./AnaliticaPickers.css";

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#6366f1"];

const formatCurrency = (val) => 
  new Intl.NumberFormat("es-CO", { 
    style: "currency", 
    currency: "COP", 
    maximumFractionDigits: 0 
  }).format(val);

const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
  <div className="ap-stat-card">
    <div className="ap-stat-content">
      <p className="ap-stat-label">{title}</p>
      <h3 className="ap-stat-value">{value}</h3>
      {subtitle && <p className="ap-stat-subtitle">{subtitle}</p>}
    </div>
    <div className={`ap-stat-icon-wrapper ${color}`}>
      <Icon size={24} />
    </div>
  </div>
);

const AnaliticaPickers = () => {
  const { getSedeParam, sedeId } = useSedeContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("7d");
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setLoading(true);
    try {
      const sp = getSedeParam();
      const res = await analyticsApi.get(`/performance`, { 
        params: { range, ...Object.fromEntries(new URLSearchParams(sp)) } 
      });
      setData(res.data);
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range, sedeId]);

  if (loading && !data) return <div className="ap-dashboard">Cargando Inteligencia...</div>;

  return (
    <div className="ap-dashboard">
      <header className="ap-header">
        <div>
          <h1>Centro de Inteligencia</h1>
          <p>Análisis estratégico y rendimiento operativo</p>
        </div>
        <div className="ap-controls">
          <select value={range} onChange={(e) => setRange(e.target.value)} className="ap-select">
            <option value="today">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Último Mes</option>
            <option value="all">Histórico</option>
          </select>
          <button onClick={fetchData} className="ap-btn-refresh">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </header>

      <nav className="ap-tabs">
        <button 
          className={activeTab === "overview" ? "active" : ""} 
          onClick={() => setActiveTab("overview")}
        >
          Resumen Ejecutivo
        </button>
        <button 
          className={activeTab === "inventory" ? "active" : ""} 
          onClick={() => setActiveTab("inventory")}
        >
          Inventario Crítico
        </button>
      </nav>

      {activeTab === "overview" && data && (
        <div className="ap-content animate-fade-in">
          <div className="ap-grid-stats">
            <StatCard 
              title="Recaudación Total" 
              value={formatCurrency(data.financials.totalRevenue)} 
              icon={DollarSign} 
              color="blue" 
              subtitle={`${data.financials.orderCount} pedidos procesados`}
            />
            <StatCard 
              title="Ticket Promedio" 
              value={formatCurrency(data.financials.avgTicket)} 
              icon={TrendingUp} 
              color="green" 
            />
            <StatCard 
              title="Eficiencia (SPI)" 
              value={`${data.performance[0]?.spi || 0}s`} 
              icon={Clock} 
              color="amber" 
              subtitle="Mejor promedio actual"
            />
            <StatCard 
              title="Pedidos Totales" 
              value={data.financials.orderCount} 
              icon={ShoppingBag} 
              color="purple" 
            />
          </div>

          <div className="ap-grid-main">
            {/* Gráfica de Métodos de Pago */}
            <div className="ap-card col-4">
              <div className="ap-card-header">
                <h3>Ventas por Método</h3>
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={data.financials.methods} 
                      innerRadius={60} 
                      outerRadius={80} 
                      paddingAngle={5} 
                      dataKey="value"
                    >
                      {data.financials.methods.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfica de Eficiencia por Picker */}
            <div className="ap-card col-8">
              <div className="ap-card-header">
                <h3>Eficiencia por Picker (SPI)</h3>
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.performance.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                    />
                    <Bar dataKey="spi" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Actividad por Hora */}
            <div className="ap-card col-12">
              <div className="ap-card-header">
                <h3>Carga de Trabajo por Hora</h3>
              </div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.hourlyActivity}>
                    <defs>
                      <linearGradient id="colorPed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="pedidos" 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#colorPed)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="ap-content animate-fade-in">
          <div className="ap-card">
            <div className="ap-card-header">
              <h3><AlertTriangle size={18} color="#ef4444" style={{ marginRight: 8 }} /> Productos Agotados / Críticos</h3>
            </div>
            <table className="ap-stock-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Incidencias</th>
                  <th>Motivo Principal</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.stockAlerts.map((item, i) => (
                  <tr key={i}>
                    <td><strong>{item.name}</strong></td>
                    <td className="text-red">{item.count} reportes</td>
                    <td>{item.reason || "No especificado"}</td>
                    <td><span className="ap-badge-red">Crítico</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliticaPickers;
