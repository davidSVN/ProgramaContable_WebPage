import { useState, useEffect, useRef } from 'react';
import { getOrdenesAgencia, getAgenciaCount, getAgenciaStats, getAgenciaSummary } from '../../../services/agencia';
import './ServiciosAgencia.css';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCOP = (n) =>
  n == null
    ? '$0'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(n);

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const truncate = (str, max = 45) => {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
};

// ── ISO week helper ───────────────────────────────────────────────────────────
const getISOWeek = (d) => {
  const date = new Date(d);
  const dayNum = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
};

// ── Period key factory ────────────────────────────────────────────────────────
const getPeriodKey = (raw, groupBy) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  if (groupBy === 'dia') {
    return `${d.getDate()} ${MESES[d.getMonth()]}`;
  }
  if (groupBy === 'semana') {
    const week = getISOWeek(d);
    return `Sem ${week} · ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

// ── Compute grouped summary ───────────────────────────────────────────────────
const computeSummary = (orders, groupBy) => {
  const map = {};
  orders.forEach((o) => {
    const key = getPeriodKey(o.date, groupBy);
    if (!map[key]) {
      map[key] = {
        periodo:    key,
        count:      0,
        facturado:  0,
        cobrado:    0,
        deuda:      0,
        _sortDate:  o.date,
      };
    }
    map[key].count++;
    map[key].facturado += o.total_amount  || 0;
    map[key].cobrado   += o.total_paid    || 0;
    if (o.estado_pago === 'Debe' || o.estado_pago === 'Abono parcial') {
      map[key].deuda   += o.balance_due   || 0;
    }
  });
  return Object.values(map).sort(
    (a, b) => new Date(b._sortDate) - new Date(a._sortDate)
  );
};

// ── Page numbers builder ──────────────────────────────────────────────────────
const buildPageNums = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const nums = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  return [...nums].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
};

// ── Stat card with count-up ───────────────────────────────────────────────────
function StatCard({ icon, label, value, formatted, loading, subtitle, valueColor, accentColor }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (loading || value == null) return;
    const target = typeof value === 'number' ? value : 0;
    const dur = 600;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const p    = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(ease * target));
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [value, loading]);

  return (
    <div className="sa-stat-card" style={{ '--sa-accent': accentColor }}>
      <span className="sa-stat-icon">{icon}</span>
      <div className="sa-stat-body">
        <span className="sa-stat-label">{label}</span>
        {loading
          ? <span className="sa-skel sa-skel--val" />
          : <span
              className="sa-stat-value"
              style={{ color: valueColor || '#1A1A1A' }}
            >
              {formatted ? fmtCOP(display) : display.toLocaleString('es-CO')}
            </span>
        }
        {subtitle && !loading && (
          <span className="sa-stat-subtitle">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows({ cols = 7, rows = 6 }) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i} className="sa-row sa-row--skel">
      {[55, 40, 75, 60, 50, 45, 40].slice(0, cols).map((w, j) => (
        <td key={j} className="sa-td">
          <span
            className="sa-skel sa-skel--text"
            style={{ width: `${w}%`, display: 'block' }}
          />
        </td>
      ))}
    </tr>
  ));
}

// ── Estado pago pill ──────────────────────────────────────────────────────────
function EstadoPill({ estado }) {
  if (estado === 'Debe' || estado === 'Abono parcial') {
    return (
      <span className="sa-estado-pill sa-estado-pill--debe">
        Por cobrar
      </span>
    );
  }
  if (estado === 'Pagada') {
    return (
      <span className="sa-estado-pill sa-estado-pill--pagada">
        Pagada
      </span>
    );
  }
  return null;
}// ── Main component ────────────────────────────────────────────────────────────
export default function ServiciosAgencia({ user, onNavigate }) {
  const [services, setServices]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [groupBy, setGroupBy]             = useState('mes');
  const [showAllSummary, setShowAllSummary] = useState(false);
  const [filters, setFilters]             = useState({
    search: '', estado: '', fecha_inicio: '', fecha_fin: '',
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 0 });
  const [stats, setStats] = useState({ total_count: 0, total_value: 0, total_cost: 0, total_orders_count: 0 });
  const [summaryData, setSummaryData] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Fetch services ──────────────────────────────────────────────────────────
  const fetchServices = async (overrides = {}, group_by_param = null) => {
    setLoading(true);
    const merged = { ...filters, ...overrides };
    const pg = overrides.page ?? pagination.page;
    const lim = overrides.limit ?? pagination.limit;

    const params = { 
      offset: (pg - 1) * lim,
      limit: lim,
      nombre_gasto: merged.search,
      fecha_inicio: merged.fecha_inicio,
      fecha_fin: merged.fecha_fin
    };

    try {
      const [data, countRes, statsRes, summaryRes] = await Promise.all([
        getOrdenesAgencia(params),
        getAgenciaCount(params),
        getAgenciaStats(params),
        getAgenciaSummary({ ...params, group_by: group_by_param || groupBy })
      ]);
      setServices(data || []);
      setStats({
        total_count: statsRes.total_count || 0,
        total_value: statsRes.total_value || 0,
        total_cost:  statsRes.total_cost || 0,
        total_orders_count: statsRes.total_orders_count || 0
      });
      setSummaryData(summaryRes || []);
      setPagination(prev => ({
        ...prev,
        page: pg,
        total: countRes.total || 0,
        total_pages: Math.ceil((countRes.total || 0) / prev.limit)
      }));
    } catch (e) {
      console.error('ServiciosAgencia fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices({ page: 1 });
  }, []);

  // ── Computed stats (Based on loaded services) ───────────────────────────────
  const totalServicios = services.length;
  const costoTotalAgencia = services.reduce((s, o) => s + (o.agency_cost || 0), 0);

  // ── Summary (grouped by period) ─────────────────────────────────────────────
  // Adapting computeSummary to use services
  const computeSummaryFromServices = (data, gBy) => {
    const map = {};
    data.forEach((s) => {
      const key = getPeriodKey(s.date, gBy);
      if (!map[key]) {
        map[key] = { periodo: key, count: 0, facturado: 0, costo: 0, _sortDate: s.date };
      }
      map[key].count++;
      map[key].facturado += s.total_item_price || 0;
      map[key].costo += s.agency_cost || 0;
    });
    return Object.values(map).sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate));
  };

  const visibleSummary = showAllSummary ? summaryData : summaryData.slice(0, 7);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const handleFilterChange = (key, val) => {
    const newFilters = { ...filters, [key]: val };
    setFilters(newFilters);
    fetchServices({ ...newFilters, page: 1 });
  };

  const handleClearFilters = () => {
    const empty = { search: '', estado: '', fecha_inicio: '', fecha_fin: '' };
    setFilters(empty);
    fetchServices({ ...empty, page: 1 });
  };

  const hasActiveFilters = !!(filters.search || filters.fecha_inicio || filters.fecha_fin);

  const handleGroupByChange = (val) => {
    setGroupBy(val);
    setShowAllSummary(false);
    fetchServices({ page: 1 }, val); // Pass new groupBy directly to fetch
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="sa-root">

      {/* ── Header ── */}
      <div className="sa-header">
        <div className="sa-header-top">
          <h1 className="sa-title">Servicios en Agencia</h1>
          <span className="sa-badge-externo">Externo</span>
        </div>
        <p className="sa-subtitle">Detalle de cada servicio procesado por terceros</p>
      </div>

      {/* ── Stats bar ── */}
      <div className="sa-stats-bar">
        <StatCard
          icon="🧾"
          label="Órdenes Totales"
          value={stats.total_orders_count}
          formatted={false}
          loading={loading}
          subtitle="conteo de órdenes únicas"
          accentColor="#185FA5"
          valueColor="#1A1A1A"
        />
        <StatCard
          icon="📦"
          label="Servicios en Agencia"
          value={stats.total_count}
          formatted={false}
          loading={loading}
          subtitle="conteo total de servicios"
          accentColor="#185FA5"
          valueColor="#1A1A1A"
        />
        <StatCard
          icon="🏭"
          label="Costo Agencia (Gasto)"
          value={stats.total_cost}
          formatted
          loading={loading}
          subtitle="monto pagado a terceros"
          accentColor="#FF6B2B"
          valueColor="#FF6B2B"
        />
      </div>

      {/* ── Resumen agrupado panel ── */}
      <div className="sa-panel">
        <div className="sa-panel-header">
          <h2 className="sa-panel-title">Resumen de Actividad</h2>
          <div className="sa-segment-group" role="group">
            {['dia', 'semana', 'mes'].map((val) => (
              <button
                key={val}
                className={`sa-segment-btn${groupBy === val ? ' sa-segment-btn--active' : ''}`}
                onClick={() => handleGroupByChange(val)}
              >
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="sa-loading-wrap">
            <table className="sa-summary-table">
              <tbody>
                <SkeletonRows cols={5} rows={3} />
              </tbody>
            </table>
          </div>
        ) : summaryData.length === 0 ? (
          <p className="sa-summary-empty">Sin actividad registrada</p>
        ) : (
          <table className="sa-summary-table">
            <thead>
              <tr>
                <th className="sa-summary-th">Período</th>
                <th className="sa-summary-th sa-summary-th--num">Cant. Servicios</th>
                <th className="sa-summary-th sa-summary-th--num">Total Facturado</th>
                <th className="sa-summary-th sa-summary-th--num">Costo Agencia</th>
              </tr>
            </thead>
            <tbody>
              {visibleSummary.map((row) => (
                <tr key={row.periodo} className="sa-summary-row">
                  <td className="sa-summary-td">{row.periodo}</td>
                  <td className="sa-summary-td sa-summary-td--num">{row.count}</td>
                  <td className="sa-summary-td sa-summary-td--num">{fmtCOP(row.facturado)}</td>
                  <td className="sa-summary-td sa-summary-td--num sa-debt-value">{fmtCOP(row.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Filters row ── */}
      <div className="sa-filters">
        <div className="sa-input-wrap">
          <span className="sa-input-icon">🔍</span>
          <input
            className="sa-input"
            type="text"
            placeholder="Buscar por cliente o servicio..."
            value={filters.search}
            onChange={e => handleFilterChange('search', e.target.value)}
          />
        </div>

        <input
          className="sa-filter-date"
          type="date"
          value={filters.fecha_inicio}
          onChange={e => handleFilterChange('fecha_inicio', e.target.value)}
          title="Desde"
        />
        <span className="sa-filter-sep">—</span>
        <input
          className="sa-filter-date"
          type="date"
          value={filters.fecha_fin}
          onChange={e => handleFilterChange('fecha_fin', e.target.value)}
          title="Hasta"
        />

        {hasActiveFilters && (
          <button className="sa-btn-clear" onClick={handleClearFilters}>✕ Limpiar</button>
        )}
      </div>

      {/* ── Detail table ── */}
      <div className="sa-detail-panel">
        <div className="sa-detail-header">
          <h2 className="sa-detail-title">Listado detallado de servicios</h2>
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th className="sa-th">Fecha</th>
                <th className="sa-th">#Orden</th>
                <th className="sa-th">Cliente</th>
                <th className="sa-th">Servicio</th>
                <th className="sa-th">Descripción</th>
                <th className="sa-th sa-th--num">Cant.</th>
                <th className="sa-th sa-th--num">Subtotal</th>
                <th className="sa-th sa-th--num">Costo Agencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={8} />
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="sa-empty">
                      <span className="sa-empty-icon">🏭</span>
                      <p className="sa-empty-title">No se encontraron servicios de agencia</p>
                      <p className="sa-empty-sub">Verifica que las órdenes contengan servicios marcados para agencia.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id} className="sa-row sa-row--pagada">
                    <td className="sa-td sa-td--date">{fmtDate(s.date)}</td>
                    <td className="sa-td sa-td--id">
                      <span className="sa-order-id">#{s.order_id}</span>
                    </td>
                    <td className="sa-td">
                      <span className="sa-client-name">{s.customer_name || '—'}</span>
                    </td>
                    <td className="sa-td sa-td--desc">{s.service_name}</td>
                    <td className="sa-td sa-td--desc">{s.description || '—'}</td>
                    <td className="sa-td sa-td--num">{s.quantity}</td>
                    <td className="sa-td sa-td--num">{fmtCOP(s.total_item_price)}</td>
                    <td className="sa-td sa-td--cost">
                      <span className="sa-cost-value">{fmtCOP(s.agency_cost)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {!loading && pagination.total_pages > 1 && (
          <div className="sa-pagination">
            <div className="sa-pag-info">
              Mostrando {services.length} de {pagination.total} servicios
            </div>
            <div className="sa-pag-pages">
              <button
                className="sa-pag-btn"
                disabled={pagination.page === 1}
                onClick={() => fetchServices({ page: pagination.page - 1 })}
              >
                Anterior
              </button>
              
              {buildPageNums(pagination.page, pagination.total_pages).map((n, i, arr) => (
                <span key={n} style={{ display: 'flex', alignItems: 'center' }}>
                  {i > 0 && n !== arr[i-1] + 1 && <span className="sa-pag-ellipsis">...</span>}
                  <button
                    className={`sa-pag-btn${pagination.page === n ? ' sa-pag-btn--active' : ''}`}
                    onClick={() => fetchServices({ page: n })}
                  >
                    {n}
                  </button>
                </span>
              ))}

              <button
                className="sa-pag-btn"
                disabled={pagination.page === pagination.total_pages}
                onClick={() => fetchServices({ page: pagination.page + 1 })}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
