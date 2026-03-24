import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { getOrdenesDebe, getOrdenesDebeStats, marcarPagado } from '../../../services/ordenesCobrar';
import { api } from '../../../services/api';
import './OrdenesPorCobrar.css';
import { BlockedAction } from '../../ui/BlockedAction';
import { useWhatsApp } from '../../../whatsapp';

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

const truncate = (str, max = 40) => {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
};

const buildPageNums = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const nums = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  return [...nums].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
};

const PAYMENT_METHODS = ['Efectivo', 'Nequi', 'Transferencia', 'Daviplata', 'Tarjeta'];

// ── Stat card with count-up animation ────────────────────────────────────────
function StatCard({ icon, label, value, formatted, accent, loading, subtitle, subtitleColor }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (loading || value == null) return;
    const target = typeof value === 'number' ? value : 0;
    const dur = 600;
    const start = performance.now();
    cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(ease * target));
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [value, loading]);

  return (
    <div className="opc-stat-card">
      <span className="opc-stat-icon">{icon}</span>
      <div className="opc-stat-body">
        <span className="opc-stat-label">{label}</span>
        {loading
          ? <span className="opc-skel opc-skel--val" />
          : <span className={`opc-stat-value${accent ? ' opc-stat-value--accent' : ''}`}>
              {formatted ? fmtCOP(display) : display.toLocaleString('es-CO')}
            </span>
        }
        {subtitle && !loading && (
          <span
            className="opc-stat-subtitle"
            style={subtitleColor ? { color: subtitleColor } : undefined}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="opc-row opc-row--skel">
      {[65, 80, 55, 45, 45, 45, 40, 35].map((w, j) => (
        <td key={j} className="opc-td">
          <span className="opc-skel" style={{ width: `${w}%`, display: 'block', height: '13px' }} />
        </td>
      ))}
    </tr>
  ));
}

// ── Heat pill for debt age ────────────────────────────────────────────────────
function DaysPill({ days }) {
  const d = days || 0;
  let bg, color, label;
  if (d < 30) {
    bg = '#E8F5E9'; color = '#2E7D32'; label = `${d} días`;
  } else if (d < 60) {
    bg = '#FFF8E1'; color = '#F57F17'; label = `${d} días ⚠`;
  } else {
    bg = '#FFEBEE'; color = '#C62828'; label = `${d} días 🔥`;
  }
  return (
    <span className="opc-days-pill" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrdenesPorCobrar({ user, onNavigate }) {
  const { send } = useWhatsApp();
  const [stats, setStats]               = useState(null);
  const [ordenes, setOrdenes]           = useState([]);
  const [total, setTotal]               = useState(0);
  const [filters, setFilters]           = useState({
    search: '', order_by: 'days_desc', fecha_inicio: '', fecha_fin: '',
  });
  const [pagination, setPagination]     = useState({ page: 1, limit: 15 });
  const [expandedRow, setExpandedRow]   = useState(null);
  const [payingMethod, setPayingMethod] = useState('Efectivo');
  const [loadingPay, setLoadingPay]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [paidRows, setPaidRows]         = useState(new Set());
  const [toast, setToast]               = useState(null);
  const [isSubmiting, setIsSubmiting] = useState(false);

  const handleWhatsAppClick = async (orden) => {
    if (!orden.user_contact) {
      showToast('El cliente no tiene un número de contacto registrado', 'error');
      return;
    }

    let negocio = 'Lavalatu';
    try {
      const cfg = JSON.parse(localStorage.getItem('washflow_negocio_config') || '{}');
      if (cfg.nombre_negocio) negocio = cfg.nombre_negocio;
    } catch (e) {}

    let descripcion = orden.items_description || '';

    // If description is empty (old orders), fetch details and format them
    if (!descripcion) {
      try {
        const detalles = await api.get(`/ordenes/${orden.id}/detalle`);
        if (Array.isArray(detalles) && detalles.length > 0) {
          descripcion = detalles.map(d => {
            const price = `$${Math.round(d.total_item_price).toLocaleString('es-CO')}`;
            return `• ${d.quantity}x ${d.service_name}${d.description ? ' ('+d.description+')' : ''} ... ${price}`;
          }).join('\n');
        }
      } catch (e) {
        console.error('Error fetching order details for WA:', e);
      }
    }

    send(orden.user_contact, 'deuda', {
      nombre: orden.user_name,
      negocio,
      orden_id: orden.id,
      saldo: new Intl.NumberFormat('es-CO').format(orden.balance_due),
      descripcion,
    });
  };

  // ── Derived stats from loaded ordenes page ──────────────────────────────────
  const avgDays = ordenes.length > 0
    ? Math.round(ordenes.reduce((s, o) => s + (o.days_passed || 0), 0) / ordenes.length)
    : 0;

  const oldestOrden = ordenes.length > 0
    ? ordenes.reduce((max, o) =>
        (o.days_passed || 0) > (max.days_passed || 0) ? o : max, ordenes[0])
    : null;

  const avgDaysColor = avgDays < 30 ? '#2E7D32' : avgDays < 60 ? '#F57F17' : '#C62828';

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Fetch stats ─────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getOrdenesDebeStats();
      setStats(data);
    } catch (e) {
      console.error('OrdenesPorCobrar stats error:', e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Fetch ordenes ───────────────────────────────────────────────────────────
  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(filters.search       && { cliente:      filters.search }),
        ...(filters.fecha_inicio && { desde:        filters.fecha_inicio }),
        ...(filters.fecha_fin    && { hasta:        filters.fecha_fin }),
        ...(filters.order_by     && { order_by:     filters.order_by }),
      };
      const res = await getOrdenesDebe(params);
      setOrdenes(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      console.error('OrdenesPorCobrar ordenes error:', e);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchOrdenes();
  }, [fetchOrdenes]);

  // ── Filter handlers ─────────────────────────────────────────────────────────
  const handleFilterChange = (key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({ search: '', order_by: 'days_desc', fecha_inicio: '', fecha_fin: '' });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = !!(filters.search || filters.fecha_inicio || filters.fecha_fin);

  // ── Payment handlers ────────────────────────────────────────────────────────
  const handleCobrarClick = (orderId) => {
    if (expandedRow === orderId) {
      setExpandedRow(null);
    } else {
      setExpandedRow(orderId);
      setPayingMethod('Efectivo');
    }
  };

  const handleConfirmPago = async (orden) => {
    setLoadingPay(orden.id);
    try {
      await marcarPagado(orden.id, {
        estado:       'Entregada',
        estado_pago:  'Pagada',
        metodo_pago:  payingMethod,
        monto_pago:   orden.balance_due,
      });

      // Success: flash green → slide out
      setPaidRows(prev => new Set(prev).add(orden.id));
      setExpandedRow(null);
      setTimeout(() => {
        setOrdenes(prev => prev.filter(o => o.id !== orden.id));
        setTotal(prev => Math.max(0, prev - 1));
        setPaidRows(prev => { const s = new Set(prev); s.delete(orden.id); return s; });
      }, 350);

      fetchStats();
      showToast(`✓ Pago registrado — ${orden.user_name}`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al registrar el pago. Intenta de nuevo.', 'error');
    } finally {
      setLoadingPay(null);
    }
  };

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
  const pageNums   = buildPageNums(pagination.page, totalPages);
  const fromItem   = total > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0;
  const toItem     = Math.min(pagination.page * pagination.limit, total);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="opc-root">

      {/* ── Header ── */}
      <div className="opc-header">
        <h1 className="opc-title">Órdenes por Cobrar</h1>
        <p className="opc-subtitle">Cartera pendiente de pago</p>
      </div>

      {/* ── Stats bar ── */}
      <div className="opc-stats-bar">
        <StatCard
          icon="💰"
          label="Total por Cobrar"
          value={stats?.monto_por_cobrar ?? 0}
          formatted
          accent
          loading={statsLoading}
          subtitle="monto pendiente total"
        />
        <StatCard
          icon="📋"
          label="Órdenes Pendientes"
          value={stats?.ordenes_debe ?? 0}
          formatted={false}
          loading={statsLoading}
          subtitle="órdenes sin pagar"
        />
        <StatCard
          icon="⏱"
          label="Promedio Días en Deuda"
          value={avgDays}
          formatted={false}
          loading={loading}
          subtitle="días promedio"
          subtitleColor={avgDaysColor}
        />
        <StatCard
          icon="🔴"
          label="Orden Más Antigua"
          value={oldestOrden?.days_passed ?? 0}
          formatted={false}
          loading={loading}
          subtitle={oldestOrden?.user_name ?? '—'}
        />
      </div>

      {/* ── Filters row ── */}
      <div className="opc-filters">
        <div className="opc-input-wrap">
          <span className="opc-input-icon">🔍</span>
          <input
            className="opc-input"
            type="text"
            placeholder="Buscar cliente..."
            value={filters.search}
            onChange={e => handleFilterChange('search', e.target.value)}
          />
        </div>

        <select
          className="opc-select"
          value={filters.order_by}
          onChange={e => handleFilterChange('order_by', e.target.value)}
        >
          <option value="days_desc">Más antigua ▼</option>
          <option value="days_asc">Más reciente ▼</option>
          <option value="amount_desc">Mayor monto ▼</option>
          <option value="amount_asc">Menor monto ▼</option>
        </select>

        <span className="opc-filter-date-label">📅</span>
        <input
          className="opc-filter-date"
          type="date"
          value={filters.fecha_inicio}
          onChange={e => handleFilterChange('fecha_inicio', e.target.value)}
          title="Desde"
        />
        <span className="opc-filter-sep">—</span>
        <input
          className="opc-filter-date"
          type="date"
          value={filters.fecha_fin}
          onChange={e => handleFilterChange('fecha_fin', e.target.value)}
          title="Hasta"
        />

        {hasActiveFilters && (
          <button className="opc-btn-clear" onClick={handleClearFilters}>
            ✕ Limpiar
          </button>
        )}

        {hasActiveFilters && (
          <div className="opc-active-pills">
            {filters.search       && <span className="opc-filter-pill">🔍 {filters.search}</span>}
            {filters.fecha_inicio && <span className="opc-filter-pill">desde {filters.fecha_inicio}</span>}
            {filters.fecha_fin    && <span className="opc-filter-pill">hasta {filters.fecha_fin}</span>}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="opc-table-wrap">
        <table className="opc-table">
          <thead>
            <tr>
              <th className="opc-th">Fecha</th>
              <th className="opc-th"># Orden</th>
              <th className="opc-th">Cliente</th>
              <th className="opc-th">Descripción</th>
              <th className="opc-th opc-th--num">Total</th>
              <th className="opc-th opc-th--num">Abonado</th>
              <th className="opc-th opc-th--debe">DEBE</th>
              <th className="opc-th">Días</th>
              <th className="opc-th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : ordenes.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="opc-empty">
                    <span className="opc-empty-icon">🎉</span>
                    <p className="opc-empty-title">No hay órdenes pendientes de cobro</p>
                    <p className="opc-empty-sub">
                      {hasActiveFilters
                        ? 'No se encontraron órdenes con los filtros aplicados'
                        : 'Todas las órdenes están al día. ¡Excelente gestión!'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              ordenes.map((orden) => {
                const isExpanded = expandedRow === orden.id;
                const isPaid     = paidRows.has(orden.id);

                return (
                  <Fragment key={orden.id}>
                    <tr
                      className={[
                        'opc-row',
                        isExpanded ? 'opc-row--expanded' : '',
                        isPaid     ? 'opc-row--paid-success' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="opc-td opc-td--date">
                        {fmtDate(orden.date)}
                      </td>

                      <td className="opc-td">
                        <span className="opc-order-num">#{orden.order_number ?? orden.id}</span>
                      </td>

                      <td className="opc-td">
                        <span className="opc-client-name">{orden.user_name || '—'}</span>
                        {orden.user_contact && (
                          <span className="opc-client-contact">{orden.user_contact}</span>
                        )}
                      </td>

                      <td className="opc-td opc-td--desc" title={orden.items_description || ''}>
                        {truncate(orden.items_description)}
                      </td>

                      <td className="opc-td opc-td--num">
                        {fmtCOP(orden.total_amount)}
                      </td>

                      <td className="opc-td opc-td--num" style={{ color: '#2E7D32' }}>
                        {fmtCOP(orden.total_paid)}
                      </td>

                      <td className="opc-td opc-td--debe">
                        {fmtCOP(orden.balance_due)}
                      </td>

                      <td className="opc-td">
                        <DaysPill days={orden.days_passed} />
                      </td>

                      <td className="opc-td" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button className="wa-btn" onClick={() => handleWhatsAppClick(orden)}>
                            📱 WhatsApp →
                          </button>
                          <BlockedAction>
                            <button
                              className={`opc-btn-cobrar${isExpanded ? ' opc-btn-cobrar--cancel' : ''}`}
                              onClick={() => handleCobrarClick(orden.id)}
                            >
                              {isExpanded ? '✕ Cancelar' : 'Cobrar →'}
                            </button>
                          </BlockedAction>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="opc-confirm-row">
                        <td colSpan={9}>
                          <div className="opc-confirm-panel">
                            <span className="opc-confirm-label">
                              Confirmar pago:{' '}
                              <span className="opc-confirm-amount">
                                {fmtCOP(orden.balance_due)}
                              </span>
                            </span>

                            <span className="opc-confirm-method-label">Método:</span>

                            <select
                              className="opc-confirm-method-select"
                              value={payingMethod}
                              onChange={e => setPayingMethod(e.target.value)}
                            >
                              {PAYMENT_METHODS.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>

                            <BlockedAction>
                            <button
                              className="opc-btn-confirm"
                              onClick={() => handleConfirmPago(orden)}
                              disabled={loadingPay === orden.id}
                            >
                              {loadingPay === orden.id ? '…' : '✓ Confirmar'}
                            </button>
                            </BlockedAction>

                            <button
                              className="opc-btn-no"
                              onClick={() => setExpandedRow(null)}
                            >
                              ✕ No
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {!loading && total > 0 && (
        <div className="opc-pagination">
          <span className="opc-pag-info">
            Mostrando{' '}
            <strong>{fromItem}–{toItem}</strong>{' '}
            de{' '}
            <strong>{total}</strong>{' '}
            órdenes
          </span>

          <div className="opc-pag-pages">
            <button
              className="opc-pag-btn"
              disabled={pagination.page <= 1}
              onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
            >
              ‹
            </button>

            {pageNums.map((p, i) => {
              const prev = pageNums[i - 1];
              const gap  = prev != null && p - prev > 1;
              return (
                <span key={p} style={{ display: 'contents' }}>
                  {gap && <span className="opc-pag-ellipsis">…</span>}
                  <button
                    className={`opc-pag-btn${p === pagination.page ? ' opc-pag-btn--active' : ''}`}
                    onClick={() => setPagination(prev => ({ ...prev, page: p }))}
                  >
                    {p}
                  </button>
                </span>
              );
            })}

            <button
              className="opc-pag-btn"
              disabled={pagination.page >= totalPages}
              onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
            >
              ›
            </button>
          </div>

          <div className="opc-pag-limit">
            <span>Por página:</span>
            <select
              className="opc-pag-limit-select"
              value={pagination.limit}
              onChange={e => setPagination({ page: 1, limit: parseInt(e.target.value) })}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`opc-toast opc-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
