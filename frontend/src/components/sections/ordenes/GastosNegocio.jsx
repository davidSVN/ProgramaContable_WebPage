import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getGastos, getGastosCount, getGastosStats,
  getGastosAgencia, getGastosAgenciaCount,
  createGasto, updateGasto, deleteGasto,
} from '../../../services/gastos';
import './GastosNegocio.css';
import { BlockedAction } from '../../ui/BlockedAction';

/* ── Constants ─────────────────────────────────────────────────────────────── */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const CATEGORIAS = ['Nómina','Servicios Públicos','Arriendo','Préstamos','Papelería','Publicidad','Otros'];
const METODOS = ['Efectivo','Transferencia','Nequi','Daviplata','Tarjeta'];
const CAT_COLORS = {
  'Nómina':             '#2B7FFF',
  'Servicios Públicos': '#0BC4E0',
  'Arriendo':           '#9B5DFF',
  'Papelería':          '#F5A623',
  'Publicidad':         '#FF6B8A',
  'Préstamos':          '#E53E3E',
  'Agencia':            '#FF6B2B',
  'Otros':              '#6B6560',
};

/* ── Helpers ─────────────────────────────────────────────────────────────────  */
const fmtCOP = (n) =>
  n == null ? '$0' : '$' + Math.round(Number(n)).toLocaleString('es-CO');

const fmtDate = (raw) => {
  if (!raw) return '—';
  // Si ya tiene 'T' (timestamp), lo pasamos al constructor directamente.
  // Si solo es 'YYYY-MM-DD', le concatenamos la hora para evitar desfases UTC.
  const d = raw.includes('T') ? new Date(raw) : new Date(raw + 'T00:00:00');
  return isNaN(d) ? '—' : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const todayStr = () => new Date().toISOString().split('T')[0];
const truncate = (s, n) => s && s.length > n ? s.slice(0, n) + '…' : (s || null);
const catColor = (cat) => CAT_COLORS[cat] || CAT_COLORS['Otros'];
const canEdit = (user) => user?.role === 'admin' || user?.role === 'superadmin';

const toFilterParams = (f) => {
  const p = {};
  if (f.categoria)    p.categoria    = f.categoria;
  if (f.forma_pago)   p.forma_pago   = f.forma_pago;
  if (f.nombre_gasto) p.nombre_gasto = f.nombre_gasto;
  if (f.fecha_inicio) p.fecha_inicio = f.fecha_inicio;
  if (f.fecha_fin)    p.fecha_fin    = f.fecha_fin;
  return p;
};
const toAgenciaParams = (f) => {
  const p = {};
  if (f.nombre_gasto) p.nombre_gasto = f.nombre_gasto;
  if (f.fecha_inicio) p.fecha_inicio = f.fecha_inicio;
  if (f.fecha_fin)    p.fecha_fin    = f.fecha_fin;
  return p;
};

/* ── Count-up hook ────────────────────────────────────────────────────────── */
function useCountUp(target, loading) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    if (loading || target == null) return;
    const t = typeof target === 'number' ? target : 0;
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const p = Math.min((now - start) / 800, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * t));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, loading]);
  return val;
}

/* ── Stat Card ────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, subtitle, accent, loading }) {
  const disp = useCountUp(typeof value === 'number' ? value : 0, loading);
  return (
    <div className={`gn-stat-card${accent ? ' gn-stat-card--accent' : ''}`}>
      <span className="gn-stat-icon">{icon}</span>
      <div className="gn-stat-body">
        <span className="gn-stat-label">{label}</span>
        {loading
          ? <span className="gn-skel gn-skel--val" />
          : <span className="gn-stat-value">{fmtCOP(disp)}</span>}
        {!loading && subtitle && <span className="gn-stat-sub">{subtitle}</span>}
      </div>
    </div>
  );
}

/* ── Donut Chart ─────────────────────────────────────────────────────────── */
function DonutChart({ data, loading }) {
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!loading && data) {
      const t = setTimeout(() => setReady(true), 120);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  if (loading) {
    return (
      <div className="gn-chart-panel">
        <div className="gn-skel gn-skel--donut" />
        <div className="gn-legend-skel">
          {[90, 110, 70, 100, 80].map((w, i) => (
            <div key={i} className="gn-skel" style={{ width: w, height: 11, borderRadius: 5, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  const R = 55, CX = 110, CY = 110;
  const CIRC = 2 * Math.PI * R;
  const GAP = 0; // Solid pie shouldn't have gaps

  const entries = Object.entries(data || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) {
    return (
      <div className="gn-chart-panel">
        <div className="gn-donut-empty">
          <span>📊</span>
          <p>Sin datos</p>
        </div>
      </div>
    );
  }

  let acc = 0;
  const segs = entries.map(([cat, val], idx) => {
    const frac = val / total;
    const dash = Math.max(0, frac * CIRC);
    const off  = CIRC * 0.25 - acc;
    acc += frac * CIRC;
    return { cat, val, dash, off };
  });

  return (
    <div className="gn-chart-panel">
      <div className={`gn-donut-anim${ready ? ' gn-donut-anim--in' : ''}`}>
        <svg viewBox="0 0 220 220" width={220} height={220} className="gn-donut-svg" aria-label="Gráfico de gastos por categoría">
          {/* Track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#EDE9E0" strokeWidth={110} />
          {/* Segments */}
          {segs.map(({ cat, dash, off }) => (
            <circle
              key={cat}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={catColor(cat)}
              strokeWidth={110}
              strokeDasharray={`${dash} ${CIRC}`}
              strokeDashoffset={off}
              style={{
                opacity: hovered && hovered !== cat ? 0.3 : 1,
                transform: hovered === cat ? 'scale(1.02)' : 'none',
                transformOrigin: '110px 110px',
                transition: 'transform 180ms ease, opacity 180ms ease',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHovered(cat)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
      </div>

      <div className="gn-legend">
        <div className="gn-leg-header" style={{ marginBottom: 12, borderBottom: '1px solid #eee', paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#666', fontSize: '0.9rem' }}>Total</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#222' }}>{fmtCOP(total)}</span>
        </div>
        {entries.map(([cat, val]) => (
          <div
            key={cat}
            className={`gn-leg-row${hovered === cat ? ' gn-leg-row--hl' : ''}`}
            onMouseEnter={() => setHovered(cat)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="gn-leg-dot" style={{ background: catColor(cat) }} />
            <span className="gn-leg-name">{cat}</span>
            <span className="gn-leg-val">{fmtCOP(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Category Pill ────────────────────────────────────────────────────────── */
function CatPill({ cat }) {
  const color = catColor(cat);
  return (
    <span
      className="gn-cat-pill"
      style={{ background: color + '18', color, border: `1px solid ${color}35` }}
    >
      {cat || '—'}
    </span>
  );
}

/* ── Method Badge ─────────────────────────────────────────────────────────── */
function MethodBadge({ val }) {
  return <span className="gn-method-badge">{val || '—'}</span>;
}

/* ── Pagination ──────────────────────────────────────────────────────────── */
function Pagination({ total, page, limit, onPage, onLimit }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to   = Math.min(page * limit, total);

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="gn-pagination">
      <span className="gn-pag-info">
        {total === 0
          ? '0 registros'
          : <><strong>{from}–{to}</strong> de <strong>{total}</strong></>}
      </span>
      <div className="gn-pag-pages">
        <button className="gn-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
        {pages.map((p, i) =>
          p === '…'
            ? <span key={`e${i}`} className="gn-pag-ellipsis">…</span>
            : <button
                key={p}
                className={`gn-pag-btn${page === p ? ' gn-pag-btn--active' : ''}`}
                onClick={() => onPage(p)}
              >{p}</button>
        )}
        <button className="gn-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
      </div>
      <div className="gn-pag-limit">
        <span className="gn-pag-info">Por página:</span>
        <select
          className="gn-select gn-select--sm"
          value={limit}
          onChange={e => { onLimit(Number(e.target.value)); onPage(1); }}
        >
          {[15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ── Skeleton rows ────────────────────────────────────────────────────────── */
function SkeletonRows({ cols }) {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="gn-skel-row">
      {Array.from({ length: cols }).map((__, j) => (
        <td key={j}>
          <span className="gn-skel" style={{ width: `${48 + ((i * 4 + j * 9) % 44)}%` }} />
        </td>
      ))}
    </tr>
  ));
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function GastosNegocio({ user }) {
  const admin = canEdit(user);

  /* ── Stats ─────────────────────────────────────────────────────────────── */
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ── Tab ────────────────────────────────────────────────────────────────── */
  const [activeTab,   setActiveTab]   = useState('manual');
  const [tabVisible,  setTabVisible]  = useState(true);

  /* ── Manual gastos ──────────────────────────────────────────────────────── */
  const [gastos,       setGastos]       = useState([]);
  const [gastosTotal,  setGastosTotal]  = useState(0);
  const [gastosLoading,setGastosLoading]= useState(true);
  const [gastosFilters,setGastosFilters]= useState({
    categoria: '', forma_pago: '', nombre_gasto: '', fecha_inicio: '', fecha_fin: ''
  });
  const [gastosPag,    setGastosPag]    = useState({ page: 1, limit: 15 });

  /* ── Inline edit ────────────────────────────────────────────────────────── */
  const [editingId,  setEditingId]  = useState(null);
  const [editValues, setEditValues] = useState({});
  const [editError,  setEditError]  = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  /* ── New gasto form ─────────────────────────────────────────────────────── */
  const EMPTY_FORM = {
    spent_category: '', spent_general_name: '', spent_value: '',
    spent_payment_method: 'Efectivo', spent_date: todayStr(), description: ''
  };
  const [newGasto, setNewGasto] = useState(EMPTY_FORM);
  const [newErrors,setNewErrors]= useState({});
  const [isAdding, setIsAdding] = useState(false);

  /* ── Agencia ────────────────────────────────────────────────────────────── */
  const [agencia,        setAgencia]        = useState([]);
  const [agenciaTotal,   setAgenciaTotal]   = useState(0);
  const [agenciaLoading, setAgenciaLoading] = useState(false);
  const [agenciaLoaded,  setAgenciaLoaded]  = useState(false);
  const [agenciaFilters, setAgenciaFilters] = useState({ nombre_gasto: '', fecha_inicio: '', fecha_fin: '' });
  const [agenciaPag,     setAgenciaPag]     = useState({ page: 1, limit: 15 });

  /* ── Misc ───────────────────────────────────────────────────────────────── */
  const [toast,        setToast]        = useState(null);
  const [networkError, setNetworkError] = useState(null);
  const toastRef = useRef(null);

  /* ── Toast ──────────────────────────────────────────────────────────────── */
  const showToast = useCallback((message, type = 'success', icon = '✓') => {
    clearTimeout(toastRef.current);
    setToast({ message, type, icon });
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* ── Fetch stats ────────────────────────────────────────────────────────── */
  const fetchStats = useCallback(async (overrides = {}) => {
    setStatsLoading(true);
    try {
      setStats(await getGastosStats(overrides));
    } catch { /* optional */ }
    finally { setStatsLoading(false); }
  }, []);

  /* ── Fetch manual ───────────────────────────────────────────────────────── */
  const fetchGastos = useCallback(async (filters, pag) => {
    setGastosLoading(true);
    setNetworkError(null);
    try {
      const fp = toFilterParams(filters);
      const [list, cnt] = await Promise.all([
        getGastos({ ...fp, limit: pag.limit, offset: (pag.page - 1) * pag.limit }),
        getGastosCount(fp),
      ]);
      setGastos(Array.isArray(list) ? list : []);
      setGastosTotal(cnt?.total ?? 0);
    } catch (err) {
      setNetworkError(err.message);
    } finally {
      setGastosLoading(false);
    }
  }, []);

  /* ── Fetch agencia ──────────────────────────────────────────────────────── */
  const fetchAgencia = useCallback(async (filters, pag) => {
    setAgenciaLoading(true);
    setNetworkError(null);
    try {
      const fp = toAgenciaParams(filters);
      const [list, cnt] = await Promise.all([
        getGastosAgencia({ ...fp, limit: pag.limit, offset: (pag.page - 1) * pag.limit }),
        getGastosAgenciaCount(fp),
      ]);
      setAgencia(Array.isArray(list) ? list : []);
      setAgenciaTotal(cnt?.total ?? 0);
      setAgenciaLoaded(true);
    } catch (err) {
      setNetworkError(err.message);
    } finally {
      setAgenciaLoading(false);
    }
  }, []);

  /* ── Initial load ───────────────────────────────────────────────────────── */
  useEffect(() => {
    fetchStats();
    fetchGastos(gastosFilters, gastosPag);
  }, []); // eslint-disable-line

  /* ── Tab switch ─────────────────────────────────────────────────────────── */
  const handleTab = (tab) => {
    if (tab === activeTab) return;
    setTabVisible(false);
    setTimeout(() => {
      setActiveTab(tab);
      setTabVisible(true);
      if (tab === 'agencia' && !agenciaLoaded) fetchAgencia(agenciaFilters, agenciaPag);
    }, 150);
  };

  /* ── Gastos filter helpers ──────────────────────────────────────────────── */
  const updateGastosFilter = (key, val) => {
    const next = { ...gastosFilters, [key]: val };
    const pg   = { ...gastosPag, page: 1 };
    setGastosFilters(next);
    setGastosPag(pg);
    fetchGastos(next, pg);
    fetchStats(toFilterParams(next));
  };
  const clearGastosFilters = () => {
    const empty = { categoria: '', forma_pago: '', nombre_gasto: '', fecha_inicio: '', fecha_fin: '' };
    const pg = { ...gastosPag, page: 1 };
    setGastosFilters(empty);
    setGastosPag(pg);
    fetchGastos(empty, pg);
    fetchStats({});
  };
  const handleGastosPage  = (p) => { const pg = { ...gastosPag, page: p };          setGastosPag(pg); fetchGastos(gastosFilters, pg); };
  const handleGastosLimit = (l) => { const pg = { page: 1, limit: l };              setGastosPag(pg); fetchGastos(gastosFilters, pg); };

  /* ── Agencia filter helpers ─────────────────────────────────────────────── */
  const updateAgenciaFilter = (key, val) => {
    const next = { ...agenciaFilters, [key]: val };
    const pg   = { ...agenciaPag, page: 1 };
    setAgenciaFilters(next);
    setAgenciaPag(pg);
    fetchAgencia(next, pg);
  };
  const clearAgenciaFilters = () => {
    const empty = { nombre_gasto: '', fecha_inicio: '', fecha_fin: '' };
    const pg = { ...agenciaPag, page: 1 };
    setAgenciaFilters(empty);
    setAgenciaPag(pg);
    fetchAgencia(empty, pg);
  };
  const handleAgenciaPage  = (p) => { const pg = { ...agenciaPag, page: p };        setAgenciaPag(pg); fetchAgencia(agenciaFilters, pg); };
  const handleAgenciaLimit = (l) => { const pg = { page: 1, limit: l };             setAgenciaPag(pg); fetchAgencia(agenciaFilters, pg); };

  /* ── Create ─────────────────────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!newGasto.spent_category)          errs.spent_category    = true;
    if (!newGasto.spent_general_name.trim()) errs.spent_general_name = true;
    const v = parseFloat(newGasto.spent_value);
    if (!newGasto.spent_value || isNaN(v) || v <= 0) errs.spent_value = true;
    if (Object.keys(errs).length) { setNewErrors(errs); return; }

    setIsAdding(true);
    try {
      await createGasto({
        spent_category:        newGasto.spent_category,
        spent_general_name:    newGasto.spent_general_name.trim(),
        spent_value:           v,
        spent_payment_method:  newGasto.spent_payment_method,
        spent_date:            newGasto.spent_date || todayStr(),
        description:           newGasto.description || null,
      });
      setNewGasto(EMPTY_FORM);
      setNewErrors({});
      showToast('Gasto registrado exitosamente', 'success', '✓');
      const pg = { ...gastosPag, page: 1 };
      setGastosPag(pg);
      fetchGastos(gastosFilters, pg);
      fetchStats();
    } catch (err) {
      showToast(err.message, 'error', '✕');
    } finally {
      setIsAdding(false);
    }
  };

  /* ── Edit ───────────────────────────────────────────────────────────────── */
  const startEdit = (g) => {
    setEditingId(g.spent_id);
    setEditValues({
      spent_category:       g.spent_category || '',
      spent_general_name:   g.spent_general_name || '',
      spent_value:          g.spent_value,
      spent_payment_method: g.spent_payment_method || 'Efectivo',
    });
    setEditError(null);
    setDeletingId(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditValues({}); setEditError(null); };
  const saveEdit = async (id) => {
    try {
      const updated = await updateGasto(id, {
        spent_category:       editValues.spent_category,
        spent_general_name:   editValues.spent_general_name,
        spent_value:          parseFloat(editValues.spent_value),
        spent_payment_method: editValues.spent_payment_method,
      });
      setGastos(prev => prev.map(g => g.spent_id === id ? updated : g));
      setEditingId(null);
      setEditValues({});
      setEditError(null);
      showToast('Gasto actualizado', 'success', '✓');
      fetchStats();
    } catch (err) {
      setEditError(err.message);
    }
  };

  /* ── Delete ─────────────────────────────────────────────────────────────── */
  const confirmDelete = async (id) => {
    try {
      await deleteGasto(id);
      setGastos(prev => prev.filter(g => g.spent_id !== id));
      setGastosTotal(prev => Math.max(0, prev - 1));
      setDeletingId(null);
      showToast('Gasto eliminado', 'success', '🗑');
      fetchStats();
    } catch (err) {
      setDeletingId(null);
      showToast(err.message, 'error', '✕');
    }
  };

  /* ── ESC ────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const h = (e) => {
      if (e.key !== 'Escape') return;
      if (editingId != null) cancelEdit();
      else if (deletingId != null) setDeletingId(null);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [editingId, deletingId]);

  /* ── Derived ────────────────────────────────────────────────────────────── */
  const hasGastosFilter  = Object.values(gastosFilters).some(Boolean);
  const hasAgenciaFilter = Object.values(agenciaFilters).some(Boolean);

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="gn-root">

      {/* Toast */}
      {toast && (
        <div className={`gn-toast gn-toast--${toast.type}`}>
          <span className="gn-toast-icon">{toast.icon}</span>
          {toast.message}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="gn-header">
        <div>
          <h1 className="gn-title">Gastos de Negocio</h1>
          <p className="gn-subtitle">Control total de egresos y costos operativos</p>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="gn-stats-bar">
        <StatCard icon="💸" label="Total Egresos"
          value={stats?.total_gastos ?? 0}
          subtitle="todos los gastos registrados"
          loading={statsLoading}
        />
        <StatCard icon="📋" label="Gastos Manuales"
          value={stats?.total_manual ?? 0}
          subtitle={`${stats?.count_manual ?? 0} registros`}
          loading={statsLoading}
        />
        <StatCard icon="🏭" label="Costos Agencia"
          value={stats?.total_agencia ?? 0}
          subtitle={`${stats?.count_agencia ?? 0} órdenes con agencia`}
          loading={statsLoading}
        />
        <StatCard icon="📅" label="Este Mes"
          value={stats?.gasto_mes_actual ?? 0}
          subtitle="gastos del mes en curso"
          accent={!statsLoading && stats && stats.total_gastos > 0 && stats.gasto_mes_actual > stats.total_gastos / 3}
          loading={statsLoading}
        />
      </div>

      {/* ── Network error ──────────────────────────────────────────────────── */}
      {networkError && (
        <div className="gn-error-banner">
          <span>⚠ {networkError}</span>
          <button className="gn-btn gn-btn--sm gn-btn--ghost" onClick={() => {
            setNetworkError(null);
            if (activeTab === 'manual') fetchGastos(gastosFilters, gastosPag);
            else fetchAgencia(agenciaFilters, agenciaPag);
          }}>Reintentar</button>
        </div>
      )}

      {/* ── Body row: chart + tabs ──────────────────────────────────────────── */}
      <div className="gn-body-row">

        {/* Donut chart */}
        <DonutChart data={stats?.por_categoria} loading={statsLoading} />

        {/* Tabs area */}
        <div className="gn-tabs-area">

          {/* Tab bar */}
          <div className="gn-tab-bar">
            <button
              className={`gn-tab-btn${activeTab === 'manual' ? ' gn-tab-btn--active' : ''}`}
              onClick={() => handleTab('manual')}
            >
              📋 Gastos Manuales
            </button>
            <button
              className={`gn-tab-btn${activeTab === 'agencia' ? ' gn-tab-btn--active' : ''}`}
              onClick={() => handleTab('agencia')}
            >
              🏭 Costos de Agencia
            </button>
          </div>

          {/* Tab content */}
          <div className="gn-tab-content" style={{ opacity: tabVisible ? 1 : 0, transition: 'opacity 150ms ease' }}>

            {/* ══════════════════════════════════════════════════════════════
                TAB 1 — GASTOS MANUALES
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'manual' && (
              <>
                {/* ── New gasto form ────────────────────────────────────── */}
                <form className="gn-form" onSubmit={handleCreate} noValidate>
                  <p className="gn-form-title">Nuevo Gasto</p>
                  <div className="gn-form-row gn-form-row--2">
                    <div className="gn-field">
                      <label className="gn-label">Categoría *</label>
                      <select
                        className={`gn-select${newErrors.spent_category ? ' gn-input--error' : ''}`}
                        value={newGasto.spent_category}
                        onChange={e => { setNewGasto(v => ({ ...v, spent_category: e.target.value })); setNewErrors(v => ({ ...v, spent_category: false })); }}
                        tabIndex={1}
                      >
                        <option value="">Selecciona…</option>
                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="gn-field">
                      <label className="gn-label">Nombre / Concepto *</label>
                      <input
                        className={`gn-input${newErrors.spent_general_name ? ' gn-input--error' : ''}`}
                        placeholder="Ej: Pago nómina enero"
                        value={newGasto.spent_general_name}
                        onChange={e => { setNewGasto(v => ({ ...v, spent_general_name: e.target.value })); setNewErrors(v => ({ ...v, spent_general_name: false })); }}
                        tabIndex={2}
                      />
                    </div>
                  </div>
                  <div className="gn-form-row gn-form-row--3">
                    <div className="gn-field">
                      <label className="gn-label">Valor ($) *</label>
                      <input
                        className={`gn-input gn-input--num${newErrors.spent_value ? ' gn-input--error' : ''}`}
                        type="number"
                        min="1"
                        placeholder="0"
                        value={newGasto.spent_value}
                        onChange={e => { setNewGasto(v => ({ ...v, spent_value: e.target.value })); setNewErrors(v => ({ ...v, spent_value: false })); }}
                        tabIndex={3}
                      />
                    </div>
                    <div className="gn-field">
                      <label className="gn-label">Método de Pago</label>
                      <select
                        className="gn-select"
                        value={newGasto.spent_payment_method}
                        onChange={e => setNewGasto(v => ({ ...v, spent_payment_method: e.target.value }))}
                        tabIndex={4}
                      >
                        {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="gn-field">
                      <label className="gn-label">Fecha</label>
                      <input
                        className="gn-input gn-input--date"
                        type="date"
                        value={newGasto.spent_date}
                        onChange={e => setNewGasto(v => ({ ...v, spent_date: e.target.value }))}
                        tabIndex={5}
                      />
                    </div>
                  </div>
                  <div className="gn-form-footer">
                    <div className="gn-field gn-field--grow">
                      <label className="gn-label">Descripción <span className="gn-optional">(opcional)</span></label>
                      <input
                        className="gn-input"
                        placeholder="Notas adicionales…"
                        value={newGasto.description}
                        onChange={e => setNewGasto(v => ({ ...v, description: e.target.value }))}
                        tabIndex={6}
                      />
                    </div>
                    <BlockedAction>
                    <button
                      type="submit"
                      className="gn-btn gn-btn--primary gn-btn--add"
                      disabled={isAdding}
                      tabIndex={7}
                    >
                      {isAdding
                        ? <><span className="gn-spinner" /> Guardando…</>
                        : '+ Agregar'}
                    </button>
                    </BlockedAction>
                  </div>
                </form>

                {/* ── Filters ───────────────────────────────────────────── */}
                <div className="gn-filters">
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">Categoría</label>
                    <select className="gn-select gn-select--sm" value={gastosFilters.categoria}
                      onChange={e => updateGastosFilter('categoria', e.target.value)}>
                      <option value="">Todas</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">Método</label>
                    <select className="gn-select gn-select--sm" value={gastosFilters.forma_pago}
                      onChange={e => updateGastosFilter('forma_pago', e.target.value)}>
                      <option value="">Todos</option>
                      {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">📅 Desde</label>
                    <input className="gn-input gn-input--date gn-input--sm" type="date"
                      value={gastosFilters.fecha_inicio}
                      onChange={e => updateGastosFilter('fecha_inicio', e.target.value)} />
                  </div>
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">📅 Hasta</label>
                    <input className="gn-input gn-input--date gn-input--sm" type="date"
                      value={gastosFilters.fecha_fin}
                      onChange={e => updateGastosFilter('fecha_fin', e.target.value)} />
                  </div>
                  <div className="gn-filter-group gn-filter-group--grow">
                    <label className="gn-filter-label">🔍 Nombre</label>
                    <input className="gn-input gn-input--sm" placeholder="Buscar…"
                      value={gastosFilters.nombre_gasto}
                      onChange={e => updateGastosFilter('nombre_gasto', e.target.value)} />
                  </div>
                  {hasGastosFilter && (
                    <button className="gn-btn gn-btn--ghost gn-btn--sm gn-filter-clear" onClick={clearGastosFilters}>
                      ✕ Limpiar
                    </button>
                  )}
                </div>

                {/* ── Table ─────────────────────────────────────────────── */}
                <div className="gn-table-wrap">
                  <table className="gn-table">
                    <thead>
                      <tr>
                        <th className="gn-th">Fecha</th>
                        <th className="gn-th">Categoría</th>
                        <th className="gn-th">Nombre / Concepto</th>
                        <th className="gn-th">Descripción</th>
                        <th className="gn-th">Método</th>
                        <th className="gn-th gn-th--num">Valor</th>
                        {admin && <th className="gn-th gn-th--actions">Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {gastosLoading && <SkeletonRows cols={admin ? 7 : 6} />}

                      {!gastosLoading && gastos.map(g => {
                        const isEdit = editingId === g.spent_id;
                        const isDel  = deletingId === g.spent_id;
                        return (
                          <tr key={g.spent_id} className={`gn-row${isEdit ? ' gn-row--editing' : ''}${isDel ? ' gn-row--deleting' : ''}`}>
                            {/* Fecha */}
                            <td className="gn-td gn-td--date">{fmtDate(g.spent_date)}</td>

                            {/* Categoría */}
                            <td className="gn-td">
                              {isEdit
                                ? <select className="gn-inline-select"
                                    value={editValues.spent_category}
                                    onChange={e => setEditValues(v => ({ ...v, spent_category: e.target.value }))}>
                                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                : <CatPill cat={g.spent_category} />}
                            </td>

                            {/* Nombre */}
                            <td className="gn-td">
                              {isEdit
                                ? <input className="gn-inline-input" value={editValues.spent_general_name}
                                    onChange={e => setEditValues(v => ({ ...v, spent_general_name: e.target.value }))}
                                    autoFocus />
                                : <span className="gn-name" title={g.spent_general_name}>{truncate(g.spent_general_name, 40)}</span>}
                            </td>

                            {/* Descripción */}
                            <td className="gn-td gn-td--desc">
                              <span className="gn-desc-text" title={g.description || ''}>
                                {truncate(g.description, 50) || <em className="gn-na">—</em>}
                              </span>
                            </td>

                            {/* Método */}
                            <td className="gn-td">
                              {isEdit
                                ? <select className="gn-inline-select"
                                    value={editValues.spent_payment_method}
                                    onChange={e => setEditValues(v => ({ ...v, spent_payment_method: e.target.value }))}>
                                    {METODOS.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                : <MethodBadge val={g.spent_payment_method} />}
                            </td>

                            {/* Valor */}
                            <td className="gn-td gn-td--num">
                              {isEdit
                                ? <input className="gn-inline-input gn-inline-input--num" type="number" min="1"
                                    value={editValues.spent_value}
                                    onChange={e => setEditValues(v => ({ ...v, spent_value: e.target.value }))} />
                                : <span className="gn-val--red">{fmtCOP(g.spent_value)}</span>}
                            </td>

                            {/* Acciones */}
                            {admin && (
                              <td className="gn-td gn-td--actions">
                                {isEdit ? (
                                  <div className="gn-edit-actions">
                                    {editError && <span className="gn-row-error">{editError}</span>}
                                    <BlockedAction><button className="gn-action-btn gn-action-btn--save" onClick={() => saveEdit(g.spent_id)}>✅ Guardar</button></BlockedAction>
                                    <button className="gn-action-btn gn-action-btn--cancel" onClick={cancelEdit}>✕</button>
                                  </div>
                                ) : isDel ? (
                                  <div className="gn-delete-confirm">
                                    <span className="gn-delete-label">¿Eliminar?</span>
                                    <BlockedAction><button className="gn-action-btn gn-action-btn--danger" onClick={() => confirmDelete(g.spent_id)}>Sí</button></BlockedAction>
                                    <button className="gn-action-btn gn-action-btn--cancel" onClick={() => setDeletingId(null)}>No</button>
                                  </div>
                                ) : (
                                  <div className="gn-row-actions">
                                    <button className="gn-icon-btn" onClick={() => startEdit(g)} title="Editar">✏️</button>
                                    <button className="gn-icon-btn gn-icon-btn--del"
                                      onClick={() => { setDeletingId(g.spent_id); setEditingId(null); }}
                                      title="Eliminar">🗑️</button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}

                      {!gastosLoading && gastos.length === 0 && (
                        <tr>
                          <td colSpan={admin ? 7 : 6} className="gn-empty-cell">
                            <div className="gn-empty">
                              <span className="gn-empty-icon">💸</span>
                              <p className="gn-empty-title">No hay gastos registrados</p>
                              <p className="gn-empty-sub">Agrega tu primer gasto usando el formulario de arriba</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {!gastosLoading && gastosTotal > 0 && (
                    <Pagination
                      total={gastosTotal}
                      page={gastosPag.page}
                      limit={gastosPag.limit}
                      onPage={handleGastosPage}
                      onLimit={handleGastosLimit}
                    />
                  )}
                </div>
              </>
            )}

            {/* ══════════════════════════════════════════════════════════════
                TAB 2 — COSTOS DE AGENCIA (read-only)
            ══════════════════════════════════════════════════════════════ */}
            {activeTab === 'agencia' && (
              <>
                {/* Info banner */}
                <div className="gn-info-banner">
                  <span className="gn-info-icon">ℹ️</span>
                  <span>
                    Estos costos se registran <strong>automáticamente</strong> cuando creas órdenes
                    con servicios de agencia. No se pueden modificar manualmente.
                  </span>
                </div>

                {/* ── Filters ───────────────────────────────────────────── */}
                <div className="gn-filters">
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">📅 Desde</label>
                    <input className="gn-input gn-input--date gn-input--sm" type="date"
                      value={agenciaFilters.fecha_inicio}
                      onChange={e => updateAgenciaFilter('fecha_inicio', e.target.value)} />
                  </div>
                  <div className="gn-filter-group">
                    <label className="gn-filter-label">📅 Hasta</label>
                    <input className="gn-input gn-input--date gn-input--sm" type="date"
                      value={agenciaFilters.fecha_fin}
                      onChange={e => updateAgenciaFilter('fecha_fin', e.target.value)} />
                  </div>
                  <div className="gn-filter-group gn-filter-group--grow">
                    <label className="gn-filter-label">🔍 Buscar orden / servicio</label>
                    <input className="gn-input gn-input--sm" placeholder="Buscar…"
                      value={agenciaFilters.nombre_gasto}
                      onChange={e => updateAgenciaFilter('nombre_gasto', e.target.value)} />
                  </div>
                  {hasAgenciaFilter && (
                    <button className="gn-btn gn-btn--ghost gn-btn--sm gn-filter-clear" onClick={clearAgenciaFilters}>
                      ✕ Limpiar
                    </button>
                  )}
                </div>

                {/* ── Table ─────────────────────────────────────────────── */}
                <div className="gn-table-wrap">
                  <table className="gn-table">
                    <thead>
                      <tr>
                        <th className="gn-th">Fecha</th>
                        <th className="gn-th">Orden / Cliente</th>
                        <th className="gn-th">Servicio</th>
                        <th className="gn-th gn-th--num">Cant.</th>
                        <th className="gn-th gn-th--num">P. Unit</th>
                        <th className="gn-th gn-th--num">Total Ítem</th>
                        <th className="gn-th gn-th--num">Costo Agencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agenciaLoading && <SkeletonRows cols={7} />}

                      {!agenciaLoading && agencia.map(g => (
                        <tr key={g.id} className="gn-row">
                          <td className="gn-td gn-td--date">{fmtDate(g.date)}</td>
                          <td className="gn-td">
                            <span className="gn-agency-ref">
                              <strong>#{g.order_number ?? g.order_id}</strong> — {g.customer_name}
                            </span>
                          </td>
                          <td className="gn-td">
                            <span className="gn-name" title={g.service_name}>{truncate(g.service_name, 30)}</span>
                          </td>
                          <td className="gn-td gn-td--num">{g.quantity}</td>
                          <td className="gn-td gn-td--num">{fmtCOP(g.unit_price)}</td>
                          <td className="gn-td gn-td--num">{fmtCOP(g.total_item_price)}</td>
                          <td className="gn-td gn-td--num">
                            <span className="gn-val--orange">{fmtCOP(g.agency_cost)}</span>
                          </td>
                        </tr>
                      ))}

                      {!agenciaLoading && agencia.length === 0 && (
                        <tr>
                          <td colSpan={7} className="gn-empty-cell">
                            <div className="gn-empty">
                              <span className="gn-empty-icon">🏭</span>
                              <p className="gn-empty-title">No hay costos de agencia registrados</p>
                              <p className="gn-empty-sub">
                                Los costos aparecen aquí automáticamente cuando creas<br />
                                órdenes con servicios marcados como agencia
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {!agenciaLoading && agenciaTotal > 0 && (
                    <Pagination
                      total={agenciaTotal}
                      page={agenciaPag.page}
                      limit={agenciaPag.limit}
                      onPage={handleAgenciaPage}
                      onLimit={handleAgenciaLimit}
                    />
                  )}
                </div>
              </>
            )}

          </div>{/* gn-tab-content */}
        </div>{/* gn-tabs-area */}
      </div>{/* gn-body-row */}
    </div>
  );
}
