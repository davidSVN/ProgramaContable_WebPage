import { useState, useEffect, useRef } from 'react';
import { getOrderDetails, getOrderDetailsCount, getOrderDetailsStats } from '../../../services/serviciosPorOrdenes';
import './ServiciosPorOrdenes.css';

// ── Formatters ────────────────────────────────────────────────────────────────

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  return isNaN(d) ? '—' : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const truncate = (s, max) => (!s ? '' : s.length > max ? s.slice(0, max) + '…' : s);

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target, ms = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let cur = 0;
    const step = target / (ms / 16);
    const id = setInterval(() => {
      cur += step;
      if (cur >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(cur));
    }, 16);
    return () => clearInterval(id);
  }, [target]); // eslint-disable-line
  return val;
}

// ── Estado config ─────────────────────────────────────────────────────────────

const ESTADO_CFG = {
  'En progreso': { bg: '#E3F2FD', color: '#0D47A1' },
  'Lista':       { bg: '#E8F5E9', color: '#2E7D32' },
  'Entregada':   { bg: '#F3E5F5', color: '#6A1B9A' },
  'Cancelada':   { bg: '#FFEBEE', color: '#C62828' },
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function ServiciosPorOrdenes() {
  const [details, setDetails]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsAgencia, setStatsAgencia] = useState(0);
  const [filters, setFilters] = useState({
    service_name: '',
    user_name:    '',
    is_agency:    '',
    fecha_inicio: '',
    fecha_fin:    '',
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 15 });
  const [loading, setLoading]           = useState(true);
  const [tableLoading, setTableLoading] = useState(false);

  // Local input state for debounced service_name
  const [serviceInput, setServiceInput] = useState('');

  const mountedRef    = useRef(false);
  const isMounted     = useRef(true);
  const debounceRef   = useRef(null);
  const svcDebounce   = useRef(null);

  const animTotal   = useCountUp(statsTotal);
  const animAgencia = useCountUp(statsAgencia);
  const [valorTotalGlobal, setValorTotalGlobal] = useState(0); 
  const [valorIngresosGlobal, setValorIngresosGlobal] = useState(0);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const buildParams = (f, p, withPagination = true) => {
    const params = {};
    if (f.service_name) params.service_name = f.service_name;
    if (f.user_name)    params.user_name    = f.user_name;
    if (f.is_agency !== '') params.is_agency = f.is_agency;
    if (f.fecha_inicio) params.fecha_inicio = f.fecha_inicio;
    if (f.fecha_fin)    params.fecha_fin    = f.fecha_fin;
    if (withPagination) {
      params.limit  = p.limit;
      params.offset = (p.page - 1) * p.limit;
    }
    return params;
  };

  // ── Initial load: fetch global stats (no filters) + first page ─────────────

  useEffect(() => {
    isMounted.current = true;
    const init = async () => {
      try {
        const [detailsRes, totalRes, agenciaRes, statsRes] = await Promise.all([
          getOrderDetails({ limit: 15, offset: 0 }),
          getOrderDetailsCount({}),
          getOrderDetailsCount({ is_agency: 'true' }),
          getOrderDetailsStats({}),
        ]);
        if (!isMounted.current) return;
        setDetails(Array.isArray(detailsRes) ? detailsRes : []);
        const countTotal = totalRes?.total ?? 0;
        setTotal(countTotal);
        setStatsTotal(countTotal);
        setStatsAgencia(agenciaRes?.total ?? 0);
        setValorTotalGlobal(statsRes?.total_cost ?? 0);
        setValorIngresosGlobal(statsRes?.total_value ?? 0);
      } catch (e) {
        console.error('ServiciosPorOrdenes init error:', e);
      } finally {
        if (isMounted.current) {
          setLoading(false);
          mountedRef.current = true;
        }
      }
    };
    init();
    return () => { isMounted.current = false; };
  }, []); // eslint-disable-line

  // ── Refetch on filter / pagination change (after initial load) ─────────────

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setTableLoading(true);
      try {
        const params      = buildParams(filters, pagination, true);
        const countParams = buildParams(filters, pagination, false);
        const [detailsRes, countRes, statsRes, agenciaRes] = await Promise.all([
          getOrderDetails(params),
          getOrderDetailsCount(countParams),
          getOrderDetailsStats(countParams),
          getOrderDetailsCount({ ...countParams, is_agency: 'true' }),
        ]);
        if (!isMounted.current) return;
        setDetails(Array.isArray(detailsRes) ? detailsRes : []);
        const currentTotal = countRes?.total ?? 0;
        setTotal(currentTotal);
        setStatsTotal(currentTotal);
        setStatsAgencia(agenciaRes?.total ?? 0);
        setValorTotalGlobal(statsRes?.total_cost ?? 0);
        setValorIngresosGlobal(statsRes?.total_value ?? 0);
      } catch (e) {
        console.error('ServiciosPorOrdenes fetch error:', e);
      } finally {
        if (isMounted.current) setTableLoading(false);
      }
    }, 150);

    return () => clearTimeout(debounceRef.current);
  }, [filters, pagination]); // eslint-disable-line

  // ── Filter handlers ────────────────────────────────────────────────────────

  const handleFilter = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleServiceInput = (v) => {
    setServiceInput(v);
    if (svcDebounce.current) clearTimeout(svcDebounce.current);
    svcDebounce.current = setTimeout(() => handleFilter('service_name', v), 400);
  };

  const clearFilters = () => {
    setServiceInput('');
    setFilters({ service_name: '', user_name: '', is_agency: '', fecha_inicio: '', fecha_fin: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const activeCount  = Object.values(filters).filter(v => v !== '').length;
  const totalPages   = Math.max(1, Math.ceil(total / pagination.limit));

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="spo-page">

      {/* Header */}
      <header className="spo-header">
        <div>
          <h1 className="spo-title">Servicios por Órdenes</h1>
          <p className="spo-subtitle">Detalle completo de servicios registrados</p>
        </div>
      </header>

      {/* Stats */}
      <div className="spo-stats">
        <StatCard
          accent="#185FA5"
          icon="🧾"
          label="Total Servicios"
          value={animTotal.toLocaleString('es-CO')}
          sub="líneas de servicio registradas"
        />
        <StatCard
          accent="#FF6B2B"
          icon="🏭"
          label="Servicios en Agencia"
          value={animAgencia.toLocaleString('es-CO')}
          sub="enviados a terceros"
          valueColor="#FF6B2B"
        />
        <StatCard
          accent="#1A1A1A"
          icon="💰"
          label="Valor Total de Ingresos"
          value={fmtCOP(valorIngresosGlobal)}
          sub="según filtros activos"
        />
        <StatCard
          accent="#FF6B2B"
          icon="🏭"
          label="Total Egresos a Agencia"
          value={fmtCOP(valorTotalGlobal)}
          sub="costo acumulado de agencia"
        />
      </div>

      {/* Filters */}
      <div className="spo-filters">
        <div className="spo-filter-wrap">
          <span>🔍</span>
          <input
            className="spo-input"
            placeholder="Buscar servicio..."
            value={serviceInput}
            onChange={e => handleServiceInput(e.target.value)}
          />
        </div>

        <div className="spo-filter-wrap">
          <input
            className="spo-input"
            placeholder="Cliente"
            value={filters.user_name}
            onChange={e => handleFilter('user_name', e.target.value)}
          />
        </div>

        <select
          className="spo-select"
          value={filters.is_agency}
          onChange={e => handleFilter('is_agency', e.target.value)}
        >
          <option value="">Agencia: Todos</option>
          <option value="true">Solo Agencia</option>
          <option value="false">Sin Agencia</option>
        </select>

        <div className="spo-filter-wrap">
          <span>📅</span>
          <input
            type="date"
            className="spo-input"
            value={filters.fecha_inicio}
            onChange={e => handleFilter('fecha_inicio', e.target.value)}
          />
        </div>

        <div className="spo-filter-wrap">
          <span>📅</span>
          <input
            type="date"
            className="spo-input"
            value={filters.fecha_fin}
            onChange={e => handleFilter('fecha_fin', e.target.value)}
          />
        </div>

        <button
          className={`spo-clear ${activeCount > 0 ? 'active' : ''}`}
          onClick={clearFilters}
        >
          ✕ Limpiar
          {activeCount > 0 && <span className="spo-badge">{activeCount}</span>}
        </button>
      </div>

      {/* Table */}
      <div className={`spo-card ${tableLoading ? 'spo-fading' : ''}`}>
        {details.length === 0 ? (
          <EmptyState hasFilters={activeCount > 0} />
        ) : (
          <div className="spo-table-scroll">
            <table className="spo-table">
              <thead>
                <tr>
                  <th>Fecha Orden</th>
                  <th>#Orden</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Descripción</th>
                  <th className="spo-th-center">Cant.</th>
                  <th className="spo-th-right">Precio Unit.</th>
                  <th className="spo-th-right">Total</th>
                  <th>Agencia</th>
                  <th>Estado Orden</th>
                </tr>
              </thead>
              <tbody>
                {details.map(row => {
                  const estadoCfg = ESTADO_CFG[row.order_status] || { bg: '#F5F0E8', color: '#888780' };
                  return (
                    <tr
                      key={row.id}
                      className={`spo-row ${row.is_agency ? 'spo-row--agency' : ''}`}
                    >
                      <td className="spo-td-date">{fmtDate(row.date)}</td>
                      <td><span className="spo-order-id">#{row.order_id}</span></td>
                      <td><span className="spo-client">{row.user_name || '—'}</span></td>
                      <td className="spo-td-service">{truncate(row.service_name, 35)}</td>
                      <td className="spo-td-service">{truncate(row.description, 35) || '—'}</td>
                      <td className="spo-td-center spo-td-qty">{row.quantity}</td>
                      <td className="spo-td-right spo-td-muted">{fmtCOP(row.unit_price)}</td>
                      <td className="spo-td-right spo-td-bold">{fmtCOP(row.total_item_price)}</td>
                      <td>
                        <span className={`spo-pill ${row.is_agency ? 'spo-pill--agency' : 'spo-pill--own'}`}>
                          {row.is_agency ? 'Agencia ↗' : 'Propio'}
                        </span>
                      </td>
                      <td>
                        <span
                          className="spo-estado"
                          style={{ background: estadoCfg.bg, color: estadoCfg.color }}
                        >
                          {row.order_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <Pagination
          page={pagination.page}
          limit={pagination.limit}
          total={total}
          totalPages={totalPages}
          onPage={p => setPagination(prev => ({ ...prev, page: p }))}
          onLimit={l => setPagination({ page: 1, limit: l })}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ accent, icon, label, value, sub, valueColor }) {
  return (
    <div className="spo-stat" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="spo-stat__icon">{icon}</div>
      <div className="spo-stat__body">
        <div className="spo-stat__label">{label}</div>
        <div
          className="spo-stat__value"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value !== undefined ? value : <span className="spo-skeleton-inline" />}
        </div>
        <div className="spo-stat__sub">{sub}</div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }) {
  return (
    <div className="spo-empty">
      <span className="spo-empty__icon">{hasFilters ? '🔍' : '🧾'}</span>
      <div className="spo-empty__title">
        {hasFilters ? 'Sin resultados' : 'No hay servicios registrados'}
      </div>
      <div className="spo-empty__sub">
        {hasFilters
          ? 'Intenta ajustar los filtros de búsqueda'
          : 'Los servicios aparecen aquí cuando se crean órdenes'}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="spo-page">
      <div className="spo-header">
        <div>
          <h1 className="spo-title">Servicios por Órdenes</h1>
          <p className="spo-subtitle">Detalle completo de servicios registrados</p>
        </div>
      </div>
      <div className="spo-stats">
        {[0, 1, 2].map(i => (
          <div key={i} className="spo-stat spo-stat--skeleton" style={{ borderLeft: '3px solid #E8E3D8' }}>
            <div className="spo-skeleton spo-skeleton--h14 spo-skeleton--w60" />
            <div className="spo-skeleton spo-skeleton--h36 spo-skeleton--w120 spo-skeleton--mt8" />
            <div className="spo-skeleton spo-skeleton--h14 spo-skeleton--w80 spo-skeleton--mt4" />
          </div>
        ))}
      </div>
      <div className="spo-card">
        {[0, 1, 2].map(i => (
          <div key={i} className="spo-skeleton-row">
            {[100, 70, 120, 160, 40, 90, 90, 70, 90].map((w, j) => (
              <div
                key={j}
                className="spo-skeleton spo-skeleton--h20"
                style={{ width: w + 'px', maxWidth: '100%' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pagination({ page, limit, total, totalPages, onPage, onLimit }) {
  const delta = 2;
  const pages = [];
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    pages.push(i);
  }
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  return (
    <div className="spo-pagination">
      <span className="spo-pagination__info">
        {start}–{end} de {total.toLocaleString('es-CO')} servicios
      </span>

      <div className="spo-pagination__pages">
        <button
          className="spo-pg-btn"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        >
          ‹
        </button>

        {pages[0] > 1 && (
          <>
            <button className="spo-pg-btn" onClick={() => onPage(1)}>1</button>
            {pages[0] > 2 && <span className="spo-pg-ellipsis">…</span>}
          </>
        )}

        {pages.map(p => (
          <button
            key={p}
            className={`spo-pg-btn ${p === page ? 'active' : ''}`}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && <span className="spo-pg-ellipsis">…</span>}
            <button className="spo-pg-btn" onClick={() => onPage(totalPages)}>{totalPages}</button>
          </>
        )}

        <button
          className="spo-pg-btn"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
        >
          ›
        </button>
      </div>

      <select
        className="spo-pg-select"
        value={limit}
        onChange={e => onLimit(Number(e.target.value))}
      >
        <option value={15}>15 / pág</option>
        <option value={25}>25 / pág</option>
        <option value={50}>50 / pág</option>
      </select>
    </div>
  );
}
