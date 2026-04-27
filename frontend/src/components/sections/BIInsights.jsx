import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  ComposedChart, Area,
} from 'recharts';
import './BIInsights.css';

// ── Data ─────────────────────────────────────────────────────────────────────

const MONTHLY = [
  { mes: 'Feb 25', revenue: 4946575,  ordenes: 143, ticket: 34591, nuevos: 101, recurrentes: 25,  uniqueClientes: 101 },
  { mes: 'Mar 25', revenue: 7660212,  ordenes: 197, ticket: 38884, nuevos: 105, recurrentes: 52,  uniqueClientes: 138 },
  { mes: 'Abr 25', revenue: 7305095,  ordenes: 182, ticket: 40138, nuevos: 82,  recurrentes: 60,  uniqueClientes: 127 },
  { mes: 'May 25', revenue: 7238405,  ordenes: 199, ticket: 36374, nuevos: 75,  recurrentes: 69,  uniqueClientes: 130 },
  { mes: 'Jun 25', revenue: 7080620,  ordenes: 183, ticket: 38692, nuevos: 73,  recurrentes: 70,  uniqueClientes: 134 },
  { mes: 'Jul 25', revenue: 6701250,  ordenes: 183, ticket: 36619, nuevos: 70,  recurrentes: 63,  uniqueClientes: 118 },
  { mes: 'Ago 25', revenue: 7284719,  ordenes: 189, ticket: 38543, nuevos: 64,  recurrentes: 72,  uniqueClientes: 126 },
  { mes: 'Sep 25', revenue: 6717325,  ordenes: 172, ticket: 39054, nuevos: 51,  recurrentes: 71,  uniqueClientes: 116 },
  { mes: 'Oct 25', revenue: 8039444,  ordenes: 189, ticket: 42537, nuevos: 66,  recurrentes: 81,  uniqueClientes: 136 },
  { mes: 'Nov 25', revenue: 7075000,  ordenes: 187, ticket: 37834, nuevos: 60,  recurrentes: 86,  uniqueClientes: 140 },
  { mes: 'Dic 25', revenue: 6554780,  ordenes: 152, ticket: 43124, nuevos: 30,  recurrentes: 86,  uniqueClientes: 112 },
  { mes: 'Ene 26', revenue: 8726085,  ordenes: 203, ticket: 42986, nuevos: 56,  recurrentes: 94,  uniqueClientes: 137 },
  { mes: 'Feb 26', revenue: 7954080,  ordenes: 206, ticket: 38612, nuevos: 37,  recurrentes: 82,  uniqueClientes: 113 },
  { mes: 'Mar 26', revenue: 7233217,  ordenes: 198, ticket: 36531, nuevos: 60,  recurrentes: 69,  uniqueClientes: 117 },
  { mes: 'Abr 26', revenue: 5348348,  ordenes: 146, ticket: 36633, nuevos: 51,  recurrentes: 58,  uniqueClientes: 101, incompleto: true },
];

const WEEKLY = [
  { sem: 'Dic W1', ordenes: 4,  revenue: 141500,  ticket: 35375 },
  { sem: 'Dic W2', ordenes: 48, revenue: 1991750, ticket: 41495 },
  { sem: 'Dic W3', ordenes: 38, revenue: 1550630, ticket: 40806 },
  { sem: 'Dic W4', ordenes: 8,  revenue: 298340,  ticket: 37293, event: 'Navidad' },
  { sem: 'Dic W5', ordenes: 13, revenue: 480910,  ticket: 36993 },
  { sem: 'Ene W1', ordenes: 66, revenue: 2756490, ticket: 41765 },
  { sem: 'Ene W2', ordenes: 43, revenue: 1824755, ticket: 42436 },
  { sem: 'Ene W3', ordenes: 32, revenue: 1437600, ticket: 44925 },
  { sem: 'Ene W4', ordenes: 54, revenue: 2490540, ticket: 46121 },
  { sem: 'Feb W1', ordenes: 57, revenue: 2195950, ticket: 38525 },
  { sem: 'Feb W2', ordenes: 51, revenue: 1797620, ticket: 35247 },
  { sem: 'Feb W3', ordenes: 35, revenue: 1474190, ticket: 42120 },
  { sem: 'Feb W4', ordenes: 63, revenue: 2486320, ticket: 39465 },
  { sem: 'Mar W1', ordenes: 39, revenue: 1418290, ticket: 36366 },
  { sem: 'Mar W2', ordenes: 54, revenue: 1936688, ticket: 35865 },
  { sem: 'Mar W3', ordenes: 49, revenue: 1699524, ticket: 34684 },
  { sem: 'Mar W4', ordenes: 39, revenue: 1535352, ticket: 39368 },
  { sem: 'Mar W5', ordenes: 20, revenue: 722724,  ticket: 36136, event: 'Sem.Santa' },
  { sem: 'Abr W1', ordenes: 53, revenue: 2068968, ticket: 39037 },
  { sem: 'Abr W2', ordenes: 44, revenue: 1645817, ticket: 37405 },
  { sem: 'Abr W3', ordenes: 46, revenue: 1554204, ticket: 33787 },
];

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtM = (n) => {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function BiTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bi-tooltip">
      <div className="bi-tooltip__label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="bi-tooltip__row" style={{ color: p.color }}>
          <span>{p.name}:</span>
          <strong>
            {typeof p.value === 'number' && p.value > 10000 ? fmtCOP(p.value) : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon, tag }) {
  return (
    <div className={`bi-kpi bi-kpi--${accent}`}>
      <div className="bi-kpi__top">
        <span className="bi-kpi__icon">{icon}</span>
        {tag && <span className={`bi-kpi__tag bi-kpi__tag--${tag.type}`}>{tag.label}</span>}
      </div>
      <div className="bi-kpi__value">{value}</div>
      <div className="bi-kpi__label">{label}</div>
      {sub && <div className="bi-kpi__sub">{sub}</div>}
    </div>
  );
}

// ── Verdict Card ──────────────────────────────────────────────────────────────

function VerdictCard({ question, verdict, detail, type }) {
  return (
    <div className={`bi-verdict bi-verdict--${type}`}>
      <div className="bi-verdict__q">{question}</div>
      <div className="bi-verdict__v">{verdict}</div>
      <div className="bi-verdict__d">{detail}</div>
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ num, title, why, action, urgency }) {
  return (
    <div className={`bi-action bi-action--${urgency}`}>
      <div className="bi-action__num">{num}</div>
      <div className="bi-action__body">
        <div className="bi-action__title">{title}</div>
        <div className="bi-action__why">{why}</div>
        <div className="bi-action__action">{action}</div>
      </div>
      <div className={`bi-action__badge bi-action__badge--${urgency}`}>
        {urgency === 'high' ? 'Urgente' : urgency === 'med' ? 'Importante' : 'Oportunidad'}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BIInsights() {
  const avg5prev  = Math.round((7075000 + 6701250 + 7284719 + 6717325 + 8039444) / 5);
  const avg5last  = Math.round((8726085 + 7954080 + 7233217 + 6554780 + 7075000) / 5);
  const ticketPeakEne = 42986;
  const ticketMarAbr  = 36531;
  const ticketDrop    = Math.round((1 - ticketMarAbr / ticketPeakEne) * 100);
  const revLostPerMonth = Math.round((ticketPeakEne - ticketMarAbr) * 200);

  return (
    <div className="bi-page">

      {/* ── Header ── */}
      <div className="bi-header">
        <div>
          <h1 className="bi-title">BI Insights — Análisis de Tendencias</h1>
          <p className="bi-subtitle">Tenant 5 · Feb 2025 – Abr 2026 · 2,729 órdenes · $105.8M COP</p>
        </div>
        <div className="bi-badge">Datos producción</div>
      </div>

      {/* ── Veredicto hipótesis ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Veredicto: ¿Qué está pasando realmente?</h2>
        <div className="bi-verdicts">
          <VerdictCard
            question="¿Están bajando las órdenes?"
            verdict="NO — Abril está incompleto"
            detail="Ene–Mar 26 promedio: 202 órdenes/mes. Abril tiene solo 25 días + Semana Santa (20 órdenes esa semana). Proyectado completo: ~175-185 órdenes."
            type="green"
          />
          <VerdictCard
            question="¿Está bajando el revenue?"
            verdict="EL TICKET SÍ CAYÓ ~15%"
            detail={`Ticket promedio: $42,986 (Ene 26) → $36,531 (Mar 26). Causa directa: cambio de precio a $4,800/lb todo incluido. Impacto: ~${fmtM(revLostPerMonth)}/mes menos.`}
            type="warning"
          />
          <VerdictCard
            question="¿Hay señales de alerta reales?"
            verdict="SÍ — Churn + Adquisición"
            detail="302 clientes de Jul-Nov 25 no volvieron. Nuevos clientes cayeron de 100+/mes a 37-60/mes. Coincide con apertura de competidores."
            type="red"
          />
        </div>
      </section>

      {/* ── KPIs ── */}
      <div className="bi-kpis">
        <KpiCard label="Promedio mensual (Ene-Mar 26)" value={fmtM(avg5last)} sub="vs 5 meses previos" icon="📈" accent="green" tag={{ type: 'up', label: `+${Math.round((avg5last/avg5prev-1)*100)}%` }} />
        <KpiCard label="Ticket promedio actual" value={fmtCOP(ticketMarAbr)} sub={`Cayó ${ticketDrop}% desde Ene 26`} icon="🧾" accent="warn" tag={{ type: 'down', label: `-${ticketDrop}%` }} />
        <KpiCard label="Clientes perdidos (churn)" value="302" sub="Jul-Nov 25, no regresaron" icon="⚠️" accent="red" />
        <KpiCard label="Nuevos clientes/mes (ahora)" value="37-60" sub="vs 100+ al inicio (Feb-Mar 25)" icon="👤" accent="warn" />
        <KpiCard label="Revenue perdido x cambio precio" value={fmtM(revLostPerMonth)} sub="por mes estimado" icon="💸" accent="red" />
      </div>

      {/* ── Revenue & Ordenes mensual ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Revenue y Órdenes Mensual</h2>
        <p className="bi-section__note">Abril 2026 incompleto (25 días) — no representa una caída real del mes</p>
        <div className="bi-chart-wrap bi-chart-wrap--tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={MONTHLY} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DC" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6B6560' }} />
              <YAxis yAxisId="rev" tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#6B6560' }} />
              <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11, fill: '#6B6560' }} />
              <Tooltip content={<BiTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue COP" fill="rgba(255,107,43,0.08)" stroke="#FF6B2B" strokeWidth={2} dot={false} />
              <Line yAxisId="ord" type="monotone" dataKey="ordenes" name="Órdenes" stroke="#185FA5" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
              <ReferenceLine yAxisId="rev" x="Abr 26" stroke="#C62828" strokeDasharray="4 2" label={{ value: 'Incompleto', position: 'top', fontSize: 10, fill: '#C62828' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Ticket promedio ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Ticket Promedio — Aquí está el verdadero problema</h2>
        <p className="bi-section__note">
          El cambio a $4,800/lb todo incluido bajó el ticket ~15%. Con 200 órdenes/mes = <strong>{fmtCOP(revLostPerMonth)} menos por mes</strong>.
        </p>
        <div className="bi-two-col">
          <div className="bi-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MONTHLY} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DC" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6B6560' }} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11, fill: '#6B6560' }} domain={[30000, 48000]} />
                <Tooltip content={<BiTooltip />} />
                <ReferenceLine x="Ene 26" stroke="#FF6B2B" strokeDasharray="4 2" label={{ value: 'Pico', position: 'insideTopLeft', fontSize: 10, fill: '#FF6B2B' }} />
                <ReferenceLine x="Mar 26" stroke="#C62828" strokeDasharray="4 2" label={{ value: 'Nuevo precio', position: 'insideTopRight', fontSize: 10, fill: '#C62828' }} />
                <Line type="monotone" dataKey="ticket" name="Ticket promedio COP" stroke="#FF6B2B" strokeWidth={2.5} dot={{ r: 4, fill: '#FF6B2B' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bi-price-analysis">
            <h3>¿Fue el cambio de precio para bien o para mal?</h3>
            <div className="bi-price-row bi-price-row--bad">
              <span className="bi-price-icon">📉</span>
              <div>
                <strong>Ingresos por orden bajaron ~15%</strong>
                <p>Ticket: $42,986 → $36,531. A igual volumen, pierdes ~{fmtCOP(revLostPerMonth)}/mes.</p>
              </div>
            </div>
            <div className="bi-price-row bi-price-row--good">
              <span className="bi-price-icon">✅</span>
              <div>
                <strong>Precio más competitivo y simple</strong>
                <p>Más fácil de vender. Las órdenes NO bajaron (202/mes en Ene-Mar 26).</p>
              </div>
            </div>
            <div className="bi-price-row bi-price-row--neutral">
              <span className="bi-price-icon">⚖️</span>
              <div>
                <strong>Veredicto: Fue neutral-negativo</strong>
                <p>No generó más volumen para compensar la caída del ticket. Necesitas +{Math.round(revLostPerMonth / ticketMarAbr)} órdenes/mes adicionales para empatar.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Churn & Retención ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Retención de Clientes — La alarma más importante</h2>
        <div className="bi-two-col">
          <div className="bi-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DC" />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#6B6560' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B6560' }} />
                <Tooltip content={<BiTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="nuevos" name="Nuevos clientes" stackId="a" fill="#185FA5" radius={[0,0,3,3]} />
                <Bar dataKey="recurrentes" name="Clientes recurrentes" stackId="a" fill="#FF6B2B" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bi-churn-stats">
            <div className="bi-churn-card bi-churn-card--red">
              <div className="bi-churn-num">302</div>
              <div className="bi-churn-label">Clientes que no volvieron</div>
              <div className="bi-churn-sub">Compraron Jul-Nov 25, ausentes desde Dic 25</div>
            </div>
            <div className="bi-churn-card bi-churn-card--warn">
              <div className="bi-churn-num">-63%</div>
              <div className="bi-churn-label">Caída en nuevos clientes</div>
              <div className="bi-churn-sub">De 101/mes (Feb 25) a 37/mes (Feb 26)</div>
            </div>
            <div className="bi-churn-card bi-churn-card--blue">
              <div className="bi-churn-num">140→101</div>
              <div className="bi-churn-label">Clientes únicos/mes</div>
              <div className="bi-churn-sub">Pico Nov 25, ahora en mínimos (Abr 26 incompleto)</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Seasonality semanal ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Seasonality — Las caídas tienen explicación</h2>
        <p className="bi-section__note">Los valles de Navidad y Semana Santa son normales, no estructurales.</p>
        <div className="bi-chart-wrap bi-chart-wrap--tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={WEEKLY} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DC" />
              <XAxis dataKey="sem" tick={{ fontSize: 9, fill: '#6B6560' }} interval={1} angle={-35} textAnchor="end" height={50} />
              <YAxis yAxisId="ord" tick={{ fontSize: 11, fill: '#6B6560' }} />
              <YAxis yAxisId="rev" orientation="right" tickFormatter={fmtM} tick={{ fontSize: 11, fill: '#6B6560' }} />
              <Tooltip content={<BiTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="ord" dataKey="ordenes" name="Órdenes" fill="#FF6B2B" opacity={0.75} radius={[3,3,0,0]} />
              <Line yAxisId="rev" type="monotone" dataKey="revenue" name="Revenue" stroke="#185FA5" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="ord" x="Dic W4" stroke="#6B6560" strokeDasharray="3 2" label={{ value: 'Navidad', position: 'top', fontSize: 9, fill: '#6B6560' }} />
              <ReferenceLine yAxisId="ord" x="Mar W5" stroke="#C62828" strokeDasharray="3 2" label={{ value: 'Sem.Santa', position: 'top', fontSize: 9, fill: '#C62828' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Acciones ── */}
      <section className="bi-section">
        <h2 className="bi-section__title">Plan de Acción — 3 Prioridades</h2>
        <div className="bi-actions">
          <ActionCard
            num="1"
            title="Recuperar los 302 clientes perdidos"
            why="Son clientes que ya conocen tu servicio. Reactivarlos cuesta 5x menos que adquirir nuevos. Si recuperas el 30%, son ~90 órdenes/mes adicionales = ~$3.3M/mes."
            action="Contacta por WhatsApp con un incentivo: '¡Te extrañamos! Trae tu próxima carga y recibe X gratis.' Prioriza los que tuvieron 3+ órdenes."
            urgency="high"
          />
          <ActionCard
            num="2"
            title="Marketing activo para nuevos clientes"
            why="La adquisición cayó 63%. Voz a voz no alcanza cuando hay competencia nueva cerca. Sin pipeline de nuevos clientes, el negocio pierde masa crítica gradualmente."
            action="Invierte $150K-$200K/mes en Instagram/Facebook ads (radio 2km del local). Meta: 80 nuevos clientes/mes. ROI estimado: 1 cliente nuevo = $36K/mes."
            urgency="high"
          />
          <ActionCard
            num="3"
            title="Revisar estrategia de precio"
            why={`El cambio a $4,800 all-inclusive te cuesta ~${fmtCOP(revLostPerMonth)}/mes. El volumen no aumentó para compensar.`}
            action="Opción A: Sube a $5,000/lb all-inclusive (sigue siendo más simple que antes). Opción B: Crea un paquete 'Premium' con secado express + suavizante premium a $6,000/lb para segmentar por valor."
            urgency="med"
          />
        </div>
      </section>

    </div>
  );
}
