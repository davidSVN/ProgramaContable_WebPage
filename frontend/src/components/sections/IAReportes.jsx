import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
  AreaChart, Area, ReferenceLine, ComposedChart,
} from 'recharts';
import {
  getFinanciero, getOrdenesResumen, getServiciosRanking,
  getClientesRiesgo, getSegmentosRFM, getPerfilesML,
  getRetencion, getForecastDemanda, getOportunidadesDescuento,
  recalcularML, getPeriodDates,
} from '../../services/reportes';
import './IAReportes.css';

// ── Formatters ─────────────────────────────────────────────────────────────────

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  return isNaN(d) ? '—' : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtPct = (n) =>
  n == null ? null : `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s || '');

// ── useCountUp ─────────────────────────────────────────────────────────────────

function useCountUp(target, ms = 800) {
  const [val, setVal] = useState(0);
  const animRef = useRef(null);
  useEffect(() => {
    if (target == null) return;
    const t = Number(target) || 0;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const p  = Math.min((now - start) / ms, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(ease * t);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
      else setVal(t);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [target, ms]);
  return val;
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skel({ w = '100%', h = 20, r = 6, style = {} }) {
  return (
    <span
      className="ia-skel"
      style={{ width: w, height: h, borderRadius: r, display: 'block', ...style }}
    />
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);
  return { toasts, add };
}

// ── COP Tooltip ────────────────────────────────────────────────────────────────

function CopTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ia-tooltip">
      <div className="ia-tooltip__label">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="ia-tooltip__row">
          <span className="ia-tooltip__dot" style={{ background: p.color }} />
          <span>{p.name}: {fmtCOP(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── PremiumGate ────────────────────────────────────────────────────────────────

function PremiumGate({ isPremium, children }) {
  if (isPremium) return children;
  return (
    <div className="ia-premium-wrap">
      <div className="ia-premium-blur">{children}</div>
      <div className="ia-premium-gate">
        <span className="ia-premium-gate__icon">🔒</span>
        <div className="ia-premium-gate__title">Funcionalidad Premium</div>
        <div className="ia-premium-gate__sub">
          Accede a inteligencia ML avanzada, segmentación y predicciones
        </div>
        <button className="ia-premium-gate__btn">Actualizar Plan</button>
      </div>
    </div>
  );
}

// ── MetricColumn ───────────────────────────────────────────────────────────────

function MetricColumn({ label, value, pct, isCurrency, isGoodUp, loading }) {
  const animated = useCountUp(value ?? 0);
  const display  = isCurrency ? fmtCOP(animated) : Math.round(animated).toLocaleString('es-CO');
  const isUp     = pct != null && Number(pct) >= 0;
  const isGood   = isGoodUp ? isUp : !isUp;
  const pctFmt   = fmtPct(pct);

  return (
    <div className="ia-metric-col">
      <div className="ia-metric-label">{label}</div>
      <div className="ia-metric-value">
        {loading ? <Skel w={130} h={38} r={8} /> : display}
      </div>
      <div className={`ia-metric-change ${pctFmt ? (isGood ? 'good' : 'bad') : ''}`}>
        {loading
          ? <Skel w={80} h={16} r={4} />
          : pctFmt
            ? <>{isUp ? '▲' : '▼'} {pctFmt} vs anterior</>
            : <span className="ia-metric-no-prev">Sin período anterior</span>}
      </div>
    </div>
  );
}

// ── MiniMetric ─────────────────────────────────────────────────────────────────

function MiniMetric({ label, value, isCurrency, isPct, loading }) {
  const animated = useCountUp(value ?? 0);
  let display;
  if (isCurrency) display = fmtCOP(animated);
  else if (isPct) display = animated.toFixed(1) + '%';
  else display = Math.round(animated).toLocaleString('es-CO');

  return (
    <div className="ia-mini-metric">
      <div className="ia-mini-metric__label">{label}</div>
      <div className="ia-mini-metric__value">
        {loading ? <Skel w={70} h={24} r={6} /> : display}
      </div>
    </div>
  );
}

// ── RiesgoRow ──────────────────────────────────────────────────────────────────

function RiesgoRow({ cliente, onToast }) {
  const dias = cliente.dias_sin_visitar ?? 0;
  const pillClass = dias >= 120 ? 'ia-heat-red' : dias >= 90 ? 'ia-heat-orange' : 'ia-heat-amber';
  const ltv = cliente.total_gastado ?? cliente.ltv ?? 0;

  return (
    <tr className="ia-tr-hover">
      <td className="ia-td-bold">{cliente.nombre ?? cliente.user_name ?? '—'}</td>
      <td><span className={`ia-heat-pill ${pillClass}`}>{dias}d</span></td>
      <td className={`ia-td-val ${ltv > 100000 ? 'ia-td-green' : ''}`}>{fmtCOP(ltv)}</td>
      <td className="ia-td-muted">{fmtDate(cliente.ultima_visita ?? cliente.last_visit)}</td>
      <td>
        <div className="ia-contact-cell">
          <span className="ia-td-muted">{cliente.contacto ?? cliente.user_contact ?? '—'}</span>
          <button
            className="ia-wa-btn"
            onClick={() => onToast('📱 Integración WhatsApp próximamente')}
          >
            WhatsApp →
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── PerfilRow ──────────────────────────────────────────────────────────────────

function PerfilRow({ perfil, segConfig, expanded, onToggle }) {
  const churn = perfil.riesgo_churn ?? 0;
  const churnColor = churn >= 65 ? '#C62828' : churn >= 35 ? '#F57F17' : '#4CAF50';
  const seg = segConfig[perfil.segmento] ?? { color: '#888780', desc: '' };
  const tend = perfil.tendencia === 'creciendo'
    ? { icon: '▲', color: '#4CAF50', label: 'Creciendo' }
    : perfil.tendencia === 'decayendo'
      ? { icon: '▼', color: '#C62828', label: 'Decayendo' }
      : { icon: '→', color: '#888780', label: 'Estable' };

  return (
    <>
      <tr className="ia-tr-hover ia-tr-clickable" onClick={onToggle}>
        <td className="ia-td-bold">{perfil.nombre ?? perfil.user_name ?? '—'}</td>
        <td>
          <span
            className="ia-seg-pill"
            style={{ background: seg.color + '22', color: seg.color }}
          >
            {perfil.segmento}
          </span>
        </td>
        <td className="ia-td-center">{perfil.frecuencia ?? '—'}x</td>
        <td>{fmtCOP(perfil.ticket_promedio ?? 0)}</td>
        <td style={{ color: tend.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {tend.icon} {tend.label}
        </td>
        <td style={{ minWidth: 130 }}>
          <div className="ia-churn-bar">
            <div
              className="ia-churn-fill"
              style={{ width: `${churn}%`, background: churnColor }}
            />
          </div>
          <div style={{ fontSize: '0.7rem', color: churnColor, fontWeight: 600 }}>{churn}%</div>
        </td>
        <td className="ia-td-bold ia-td-green">{fmtCOP(perfil.ltv_estimado ?? 0)}</td>
      </tr>
      {expanded && (
        <tr className="ia-expand-row">
          <td colSpan={7}>
            <div className="ia-expand-content">
              <div><strong>Última visita:</strong> {fmtDate(perfil.ultima_visita)}</div>
              <div><strong>Órdenes totales:</strong> {perfil.total_ordenes ?? '—'}</div>
              <div><strong>Total histórico:</strong> {fmtCOP(perfil.total_historico ?? 0)}</div>
              <div><strong>Segmento:</strong> {seg.desc}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── OportunidadCard ────────────────────────────────────────────────────────────

function OportunidadCard({ op, isGestionado, onGestionar, onToast, delay }) {
  const riesgoClass =
    op.nivel_riesgo === 'alto'  ? 'ia-riesgo-alto'  :
    op.nivel_riesgo === 'medio' ? 'ia-riesgo-medio' : 'ia-riesgo-bajo';
  const riesgoLabel =
    op.nivel_riesgo === 'alto'  ? 'RIESGO ALTO'  :
    op.nivel_riesgo === 'medio' ? 'RIESGO MEDIO' : 'RIESGO BAJO';

  return (
    <div
      className={`ia-oport-card ia-oport-reveal ${isGestionado ? 'ia-oport-card--done' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {isGestionado && <div className="ia-oport-overlay">Gestionado ✓</div>}
      <div className="ia-oport-head">
        <span className="ia-oport-name">👤 {op.nombre ?? op.user_name ?? '—'}</span>
        <span className={`ia-riesgo-pill ${riesgoClass}`}>{riesgoLabel}</span>
      </div>
      <div className="ia-oport-stats">
        <span>{op.dias_sin_visitar ?? 0} días sin visitar</span>
        <span>·</span>
        <span>LTV: {fmtCOP(op.ltv ?? op.total_gastado ?? 0)}</span>
      </div>
      <div className="ia-oport-descuento">
        {op.descuento_sugerido ?? 0}%
        <span className="ia-oport-descuento__label">descuento sugerido</span>
      </div>
      {op.razon && <div className="ia-oport-razon">"{op.razon}"</div>}
      <div className="ia-oport-actions">
        <button
          className="ia-wa-btn"
          onClick={() => onToast('📱 Integración WhatsApp próximamente — Copia el mensaje manualmente')}
        >
          📱 WhatsApp →
        </button>
        <button
          className={`ia-aplicado-btn ${isGestionado ? 'done' : ''}`}
          onClick={onGestionar}
          disabled={isGestionado}
        >
          ✓ Aplicado
        </button>
      </div>
    </div>
  );
}

// ── Segment config ─────────────────────────────────────────────────────────────

const SEGMENTOS = {
  Campeones:   { color: '#E6A800', desc: 'Tus mejores clientes' },
  Leales:      { color: '#4CAF50', desc: 'Clientes consistentes' },
  'En Riesgo': { color: '#FF9800', desc: 'Necesitan atención' },
  Perdidos:    { color: '#C62828', desc: 'Sin actividad reciente' },
  Nuevos:      { color: '#185FA5', desc: 'Recién adquiridos' },
};

const STATUS_COLORS = {
  'En progreso': '#185FA5',
  'Lista':       '#4CAF50',
  'Entregada':   '#7F77DD',
  'Cancelada':   '#C62828',
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function IAReportes() {
  const plan      = localStorage.getItem('washflow_plan') ?? 'basic';
  const isPremium = plan === 'premium';

  const [periodo, setPeriodo]     = useState('mes');
  const [syncing, setSyncing]     = useState(false);

  // Section 1
  const [financiero, setFinanciero] = useState(null);
  const [finChart, setFinChart]     = useState([]);
  const [loadFin, setLoadFin]       = useState(true);

  // Section 2
  const [ordenesResumen, setOrdenesResumen]       = useState(null);
  const [serviciosRanking, setServiciosRanking]   = useState([]);
  const [loadOps, setLoadOps]                     = useState(true);

  // Section 3
  const [clientesRiesgo, setClientesRiesgo] = useState([]);
  const [loadRiesgo, setLoadRiesgo]         = useState(true);

  // Section 4 (premium)
  const [segmentosRFM, setSegmentosRFM]           = useState(null);
  const [perfiles, setPerfiles]                   = useState([]);
  const [segmentoFiltro, setSegmentoFiltro]       = useState(null);
  const [expandedPerfil, setExpandedPerfil]       = useState(null);
  const [retencion, setRetencion]                 = useState(null);
  const [forecast, setForecast]                   = useState([]);
  const [loadML, setLoadML]                       = useState(true);

  // Section 5 (premium)
  const [oportunidades, setOportunidades] = useState([]);
  const [gestionados, setGestionados]     = useState(new Set());
  const [loadOport, setLoadOport]         = useState(true);

  const { toasts, add: addToast } = useToast();

  // ── Fetch basic ────────────────────────────────────────────────────────────
  const fetchBasic = useCallback(async (p) => {
    const dates = getPeriodDates(p);
    setLoadFin(true);
    setLoadOps(true);
    setLoadRiesgo(true);
    const [fin, finYear, ords, svcs, riesgo] = await Promise.allSettled([
      getFinanciero(p),
      getFinanciero('año'),
      getOrdenesResumen(dates),
      getServiciosRanking(dates),
      getClientesRiesgo(),
    ]);
    if (fin.status     === 'fulfilled') setFinanciero(fin.value ?? null);
    if (finYear.status === 'fulfilled') setFinChart(finYear.value?.historico_mensual ?? []);
    if (ords.status    === 'fulfilled') setOrdenesResumen(ords.value ?? null);
    if (svcs.status    === 'fulfilled') setServiciosRanking(Array.isArray(svcs.value) ? svcs.value : []);
    if (riesgo.status  === 'fulfilled') setClientesRiesgo(Array.isArray(riesgo.value) ? riesgo.value : []);
    setLoadFin(false);
    setLoadOps(false);
    setLoadRiesgo(false);
  }, []);

  // ── Fetch premium ──────────────────────────────────────────────────────────
  const fetchPremium = useCallback(async () => {
    if (!isPremium) return;
    setLoadML(true);
    setLoadOport(true);
    const [rfm, prof, ret, fcast, oport] = await Promise.allSettled([
      getSegmentosRFM(),
      getPerfilesML(),
      getRetencion(),
      getForecastDemanda(),
      getOportunidadesDescuento(),
    ]);
    if (rfm.status   === 'fulfilled') setSegmentosRFM(rfm.value ?? null);
    if (prof.status  === 'fulfilled') setPerfiles(Array.isArray(prof.value) ? prof.value : []);
    if (ret.status   === 'fulfilled') setRetencion(ret.value ?? null);
    if (fcast.status === 'fulfilled') setForecast(Array.isArray(fcast.value) ? fcast.value : []);
    if (oport.status === 'fulfilled') setOportunidades(Array.isArray(oport.value) ? oport.value : []);
    setLoadML(false);
    setLoadOport(false);
  }, [isPremium]);

  // ── Mount ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchBasic('mes');
    fetchPremium();
  }, []); // eslint-disable-line

  // ── Periodo change (only refetch basic) ───────────────────────────────────
  const prevPeriodo = useRef(null);
  useEffect(() => {
    if (prevPeriodo.current === null) { prevPeriodo.current = periodo; return; }
    prevPeriodo.current = periodo;
    fetchBasic(periodo);
  }, [periodo]); // eslint-disable-line

  // ── Sync ───────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!isPremium) {
      addToast('ℹ️ Sincronización automática cada noche');
      return;
    }
    setSyncing(true);
    try {
      await recalcularML();
      addToast('✅ Modelos actualizados');
      fetchPremium();
    } catch (e) {
      addToast('Error al recalcular: ' + e.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const perfilesFiltrados = segmentoFiltro
    ? perfiles.filter(p => p.segmento === segmentoFiltro)
    : perfiles;

  const donutData = ordenesResumen?.por_estado
    ? Object.entries(ordenesResumen.por_estado).map(([name, value]) => ({ name, value }))
    : [];

  const rankingData = serviciosRanking.slice(0, 8).map(s => ({
    ...s,
    nombre_corto: truncate(s.nombre ?? s.service_name ?? '', 22),
    total: s.total ?? s.revenue ?? 0,
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ia-page">

      {/* Toasts */}
      <div className="ia-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`ia-toast ia-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="ia-header">
        <div className="ia-header__left">
          <h1 className="ia-title">IA <span>&</span> Reportes 🧠</h1>
          <p className="ia-subtitle">Inteligencia de negocio en tiempo real</p>
        </div>
        <div className="ia-header__right">
          <div className="ia-period-toggle">
            {[
              { key: 'mes',       label: 'Este Mes'   },
              { key: 'trimestre', label: 'Trimestre'  },
              { key: 'año',       label: 'Este Año'   },
              { key: 'todo',      label: 'Ver Todo'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`ia-period-btn ${periodo === key ? 'active' : ''}`}
                onClick={() => setPeriodo(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="ia-sync-btn" onClick={handleSync} disabled={syncing}>
            <span className={`ia-sync-icon ${syncing ? 'spinning' : ''}`}>↺</span>
            {syncing ? 'Recalculando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* ── SECCIÓN 1: INCOME NETO ────────────────────────────────────── */}
      <div className="ia-card ia-reveal" style={{ animationDelay: '0ms' }}>
        <div className="ia-card-title">💰 Income Neto</div>
        <div className="ia-income-metrics">
          <MetricColumn
            label="Ingresos" value={financiero?.ingresos ?? null}
            pct={financiero?.vs_anterior?.ingresos_pct ?? null}
            isCurrency isGoodUp loading={loadFin}
          />
          <div className="ia-income-divider" />
          <MetricColumn
            label="Egresos" value={financiero?.egresos ?? null}
            pct={financiero?.vs_anterior?.egresos_pct ?? null}
            isCurrency isGoodUp={false} loading={loadFin}
          />
          <div className="ia-income-divider" />
          <MetricColumn
            label="Neto" value={financiero?.neto ?? null}
            pct={financiero?.vs_anterior?.neto_pct ?? null}
            isCurrency isGoodUp loading={loadFin}
          />
        </div>

        <div className="ia-chart-area">
          {loadFin ? (
            <Skel h={220} r={8} />
          ) : finChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={finChart} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E3D8" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 11, fill: '#888780' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#888780' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={n => '$' + (n / 1000000).toFixed(1) + 'M'}
                />
                <Tooltip content={<CopTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#4CAF50" radius={[3,3,0,0]} maxBarSize={28} />
                <Bar dataKey="egresos"  name="Egresos"  fill="#FF6B2B" radius={[3,3,0,0]} maxBarSize={28} />
                <Line
                  dataKey="neto" name="Neto"
                  stroke="#1A1A1A" strokeWidth={2} strokeDasharray="5 3"
                  dot={false} type="monotone" isAnimationActive
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="ia-empty-chart">Sin datos históricos disponibles</div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN 2: OPERACIONES ────────────────────────────────────── */}
      <div className="ia-ops-grid ia-reveal" style={{ animationDelay: '100ms' }}>

        {/* Left — Orders summary */}
        <div className="ia-card">
          <div className="ia-card-title">📦 Resumen de Órdenes</div>
          <div className="ia-mini-metrics">
            <MiniMetric label="Total Órdenes"   value={ordenesResumen?.total}             loading={loadOps} />
            <MiniMetric label="Ticket Promedio" value={ordenesResumen?.ticket_promedio}   isCurrency loading={loadOps} />
            <MiniMetric label="Órdenes Debe"    value={ordenesResumen?.ordenes_debe}      loading={loadOps} />
            <MiniMetric label="% Cobrado"       value={ordenesResumen?.pct_cobrado}       isPct loading={loadOps} />
          </div>

          <div className="ia-donut-wrap">
            {loadOps ? (
              <Skel w={160} h={160} r={80} style={{ alignSelf: 'center' }} />
            ) : donutData.length > 0 ? (
              <div className="ia-donut-container">
                <div style={{ position: 'relative', width: 160, height: 160 }}>
                  <PieChart width={160} height={160}>
                    <Pie
                      data={donutData}
                      cx={75} cy={75}
                      innerRadius={50} outerRadius={72}
                      paddingAngle={2}
                      dataKey="value"
                      isAnimationActive
                    >
                      {donutData.map(entry => (
                        <Cell
                          key={entry.name}
                          fill={STATUS_COLORS[entry.name] || '#B0ADA5'}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                  <div className="ia-donut-center">
                    <span className="ia-donut-total">{ordenesResumen?.total ?? 0}</span>
                    <span className="ia-donut-label">órdenes</span>
                  </div>
                </div>
                <div className="ia-donut-legend">
                  {donutData.map(d => (
                    <div key={d.name} className="ia-legend-item">
                      <span
                        className="ia-legend-dot"
                        style={{ background: STATUS_COLORS[d.name] || '#B0ADA5' }}
                      />
                      <span>{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ia-empty-chart">Sin datos de estado de órdenes</div>
            )}
          </div>
        </div>

        {/* Right — Top services */}
        <div className="ia-card">
          <div className="ia-card-title">🏆 Servicios Más Vendidos</div>
          {loadOps ? (
            <Skel h={240} r={8} />
          ) : rankingData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={rankingData}
                layout="vertical"
                margin={{ top: 4, right: 90, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E3D8" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#888780' }}
                  tickFormatter={n => '$' + (n / 1000).toFixed(0) + 'k'}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="nombre_corto"
                  width={130}
                  tick={{ fontSize: 11, fill: '#6B6860' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip formatter={v => fmtCOP(v)} />
                <Bar
                  dataKey="total"
                  name="Revenue"
                  fill="rgba(255,107,43,0.62)"
                  radius={[0,4,4,0]}
                  label={{
                    position: 'right',
                    formatter: v => fmtCOP(v),
                    fontSize: 10,
                    fill: '#6B6860',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="ia-empty-chart">Sin datos de servicios</div>
          )}
        </div>
      </div>

      {/* ── SECCIÓN 3: CLIENTES EN RIESGO ────────────────────────────── */}
      <div className="ia-card ia-reveal" style={{ animationDelay: '200ms' }}>
        <div className="ia-card-header">
          <div>
            <div className="ia-card-title">⚠️ Clientes en Riesgo de Abandono</div>
            <div className="ia-card-sub">Clientes sin actividad en +60 días</div>
          </div>
        </div>

        {loadRiesgo ? (
          <div className="ia-skel-rows">
            {[...Array(5)].map((_, i) => <Skel key={i} h={44} r={8} />)}
          </div>
        ) : clientesRiesgo.length === 0 ? (
          <div className="ia-empty-state">
            <span>✅</span>
            <div>No hay clientes en riesgo — ¡Excelente retención!</div>
          </div>
        ) : (
          <>
            <div className="ia-table-scroll">
              <table className="ia-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Días sin visitar</th>
                    <th>Total gastado</th>
                    <th>Última visita</th>
                    <th>Contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesRiesgo.slice(0, 10).map((c, i) => (
                    <RiesgoRow key={c.user_id ?? i} cliente={c} onToast={addToast} />
                  ))}
                </tbody>
              </table>
            </div>
            {clientesRiesgo.length > 10 && (
              <div className="ia-ver-todos">
                {clientesRiesgo.length - 10} más ·{' '}
                <span className="ia-link">Ver todos →</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── SECCIÓN 4: INTELIGENCIA ML (PREMIUM) ─────────────────────── */}
      <PremiumGate isPremium={isPremium}>
        <div className="ia-ml-section ia-reveal" style={{ animationDelay: '300ms' }}>
          <div className="ia-section-label">🤖 Inteligencia ML</div>

          {/* 4A — RFM Segmentation */}
          <div className="ia-card" style={{ marginBottom: 16 }}>
            <div className="ia-card-title">📊 Segmentación RFM</div>
            {loadML ? (
              <div className="ia-rfm-grid">
                {[...Array(5)].map((_, i) => <Skel key={i} h={100} r={12} />)}
              </div>
            ) : (
              <div className="ia-rfm-grid">
                {Object.entries(SEGMENTOS).map(([nombre, cfg]) => {
                  const raw = segmentosRFM?.[nombre] ?? segmentosRFM?.[nombre.toLowerCase().replace(/ /g, '_')];
                  const count = typeof raw === 'object' ? (raw?.count ?? 0) : (raw ?? 0);
                  const isActive = segmentoFiltro === nombre;
                  return (
                    <button
                      key={nombre}
                      className={`ia-rfm-seg ${isActive ? 'active' : ''}`}
                      style={{ borderLeftColor: cfg.color }}
                      onClick={() => setSegmentoFiltro(isActive ? null : nombre)}
                    >
                      <div className="ia-rfm-seg__name">{nombre}</div>
                      <div className="ia-rfm-seg__count" style={{ color: cfg.color }}>{count}</div>
                      <div className="ia-rfm-seg__desc">{cfg.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4B — Perfiles ML */}
          <div className="ia-card" style={{ marginBottom: 16 }}>
            <div className="ia-card-header">
              <div className="ia-card-title">👥 Perfiles de Clientes ML</div>
              {segmentoFiltro && (
                <button className="ia-chip-clear" onClick={() => setSegmentoFiltro(null)}>
                  {segmentoFiltro} ✕
                </button>
              )}
            </div>
            {loadML ? (
              <div className="ia-skel-rows">
                {[...Array(5)].map((_, i) => <Skel key={i} h={44} r={8} />)}
              </div>
            ) : perfilesFiltrados.length === 0 ? (
              <div className="ia-empty-state">
                <span>🔍</span>
                <div>Sin perfiles para este segmento</div>
              </div>
            ) : (
              <div className="ia-table-scroll">
                <table className="ia-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Segmento</th>
                      <th>Frecuencia</th>
                      <th>Ticket Prom.</th>
                      <th>Tendencia</th>
                      <th>Riesgo Churn</th>
                      <th>LTV Est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfilesFiltrados.map((p, i) => {
                      const id = p.user_id ?? i;
                      return (
                        <PerfilRow
                          key={id}
                          perfil={p}
                          segConfig={SEGMENTOS}
                          expanded={expandedPerfil === id}
                          onToggle={() => setExpandedPerfil(expandedPerfil === id ? null : id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4C & 4D side by side */}
          <div className="ia-ops-grid">

            {/* 4C — Retention & Churn */}
            <div className="ia-card">
              <div className="ia-card-title">📈 Retención & Churn</div>
              {loadML ? (
                <Skel h={200} r={8} />
              ) : retencion?.historico?.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={retencion.historico}
                      margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E3D8" vertical={false} />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 11, fill: '#888780' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#888780' }}
                        axisLine={false} tickLine={false}
                        tickFormatter={v => v + '%'}
                      />
                      <Tooltip formatter={v => v + '%'} />
                      <ReferenceLine y={80} stroke="#B0ADA5" strokeDasharray="4 2" label={{ value: '80% meta', fill: '#B0ADA5', fontSize: 10 }} />
                      <Line dataKey="retencion" name="Retención" stroke="#4CAF50" strokeWidth={2} dot={{ r: 3 }} isAnimationActive />
                      <Line dataKey="churn"     name="Churn"     stroke="#C62828" strokeWidth={2} dot={{ r: 3 }} isAnimationActive />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="ia-ret-numbers">
                    <div className="ia-ret-num">
                      <span className="ia-ret-num__val" style={{ color: '#4CAF50' }}>
                        {retencion.retencion_promedio?.toFixed(1) ?? '—'}%
                      </span>
                      <span className="ia-ret-num__label">Retención promedio</span>
                    </div>
                    <div className="ia-ret-num">
                      <span className="ia-ret-num__val" style={{ color: '#C62828' }}>
                        {retencion.churn_promedio?.toFixed(1) ?? '—'}%
                      </span>
                      <span className="ia-ret-num__label">Churn promedio</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="ia-empty-chart">Sin datos de retención</div>
              )}
            </div>

            {/* 4D — Forecast */}
            <div className="ia-card">
              <div className="ia-card-title">🔮 Forecast de Demanda</div>
              {loadML ? (
                <Skel h={180} r={8} />
              ) : forecast.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart
                      data={forecast}
                      margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E3D8" vertical={false} />
                      <XAxis
                        dataKey="semana"
                        tick={{ fontSize: 11, fill: '#888780' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#888780' }}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip />
                      <Area dataKey="optimista" name="Optimista" stroke="#4CAF50" fill="rgba(76,175,80,0.10)" strokeWidth={1} isAnimationActive />
                      <Area dataKey="estimado"  name="Estimado"  stroke="#FF6B2B" fill="rgba(255,107,43,0.28)" strokeWidth={2} isAnimationActive />
                      <Area dataKey="pesimista" name="Pesimista" stroke="#C62828" fill="rgba(198,40,40,0.10)" strokeWidth={1} isAnimationActive />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="ia-forecast-next">
                    Próxima semana: ~<strong>{forecast[0]?.estimado ?? '—'}</strong> órdenes esperadas
                  </div>
                </>
              ) : (
                <div className="ia-empty-chart">Sin datos de forecast</div>
              )}
            </div>
          </div>
        </div>
      </PremiumGate>

      {/* ── SECCIÓN 5: OPORTUNIDADES (PREMIUM) ───────────────────────── */}
      <PremiumGate isPremium={isPremium}>
        <div className="ia-card ia-reveal" style={{ animationDelay: '400ms' }}>
          <div className="ia-card-header">
            <div>
              <div className="ia-card-title">🎯 Oportunidades de Descuento Personalizadas</div>
              <div className="ia-card-sub">Basado en comportamiento histórico de cada cliente</div>
            </div>
          </div>

          {loadOport ? (
            <div className="ia-oport-grid">
              {[...Array(4)].map((_, i) => <Skel key={i} h={180} r={12} />)}
            </div>
          ) : oportunidades.length === 0 ? (
            <div className="ia-empty-state ia-empty-state--large">
              <span className="ia-empty-state__icon">🎉</span>
              <div className="ia-empty-state__title">No hay oportunidades de descuento activas</div>
              <div className="ia-empty-state__sub">Todos tus clientes tienen buen nivel de actividad</div>
            </div>
          ) : (
            <div className="ia-oport-grid">
              {oportunidades.slice(0, 10).map((op, i) => (
                <OportunidadCard
                  key={op.user_id ?? i}
                  op={op}
                  isGestionado={gestionados.has(op.user_id ?? i)}
                  onGestionar={() => setGestionados(p => new Set([...p, op.user_id ?? i]))}
                  onToast={addToast}
                  delay={i * 80}
                />
              ))}
            </div>
          )}
        </div>
      </PremiumGate>

    </div>
  );
}
