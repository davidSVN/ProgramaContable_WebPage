import { useState, useEffect, useRef, useCallback } from 'react';
import { getHistorialOrdenes, getOrdenesStats, deleteOrden, updateOrdenEstado } from '../../../services/ordenes';
import './HistorialOrdenes.css';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCOP = (n) =>
  n == null ? '$0' : '$' + Math.round(n).toLocaleString('es-CO');

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

// ── Badge helpers ─────────────────────────────────────────────────────────────
const PAGO_CFG = {
  'Pagada':         { cls: 'ho-badge--green',  label: 'Pagada' },
  'Debe':           { cls: 'ho-badge--red',    label: 'Debe' },
  'Abono parcial':  { cls: 'ho-badge--orange', label: 'Abono parcial' },
  'Cancelada':      { cls: 'ho-badge--gray',   label: 'Cancelada' },
};
const ORDEN_CFG = {
  'Recibida':              { cls: 'ho-badge--gray',   label: 'Recibida' },
  'En proceso':            { cls: 'ho-badge--blue',   label: 'En proceso' },
  'Lista para entregar':   { cls: 'ho-badge--purple', label: 'Lista' },
  'Entregada':             { cls: 'ho-badge--green',  label: 'Entregada' },
  'Cancelada':             { cls: 'ho-badge--red',    label: 'Cancelada' },
};

function Badge({ value, cfg }) {
  const c = cfg[value] || { cls: 'ho-badge--gray', label: value || '—' };
  return <span className={`ho-badge ${c.cls}`}>{c.label}</span>;
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="ho-skel-row">
      {Array.from({ length: 11 }).map((__, j) => (
        <td key={j}><span className="ho-skel" style={{ width: `${50 + ((i * 3 + j * 7) % 40)}%` }} /></td>
      ))}
    </tr>
  ));
}

// ── Stat card with count-up ───────────────────────────────────────────────────
function StatCard({ icon, label, value, formatted, accentClass, loading }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (loading || value == null) return;
    const target = typeof value === 'number' ? value : 0;
    const dur = 800;
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
    <div className={`ho-stat-card ${accentClass || ''}`}>
      <span className="ho-stat-icon">{icon}</span>
      <div className="ho-stat-body">
        <span className="ho-stat-label">{label}</span>
        {loading
          ? <span className="ho-skel ho-skel--val" />
          : <span className="ho-stat-value">
              {formatted ? fmtCOP(display) : display.toLocaleString('es-CO')}
            </span>
        }
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HistorialOrdenes() {
  const [orders, setOrders]       = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError]         = useState(null);
  const [filters, setFilters]     = useState({
    estado_pago: '', estado_orden: '', cliente: '', desde: '', hasta: ''
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 0 });
  const [sortConfig, setSortConfig] = useState({ field: 'id', direction: 'desc' });
  const [drawerOrder, setDrawerOrder] = useState(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editOrder, setEditOrder]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [toast, setToast]           = useState(null);

  const debounceRef = useRef(null);
  const tableRef    = useRef(null);
  const pendingClienteRef = useRef('');

  // ── Fetch orders ────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError(null);
    const merged = { ...filters, ...overrides };
    const pg     = overrides.page  ?? pagination.page;
    const lim    = overrides.limit ?? pagination.limit;
    const sf     = overrides.sortField     ?? sortConfig.field;
    const sd     = overrides.sortDirection ?? sortConfig.direction;

    const params = { page: pg, limit: lim };
    if (merged.estado_pago)  params.estado_pago  = merged.estado_pago;
    if (merged.estado_orden) params.estado_orden = merged.estado_orden;
    if (merged.cliente)      params.cliente      = merged.cliente;
    if (merged.desde)        params.desde        = merged.desde;
    if (merged.hasta)        params.hasta        = merged.hasta;
    if (sf)  params.sort_field     = sf;
    if (sd)  params.sort_direction = sd;

    try {
      const res = await getHistorialOrdenes(params);
      setOrders(res.data ?? []);
      setPagination(prev => ({
        ...prev,
        page:        res.page,
        limit:       res.limit,
        total:       res.total,
        total_pages: res.total_pages,
      }));
    } catch (err) {
      setError(err.message || 'Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit, sortConfig]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await getOrdenesStats();
      setStats(s);
    } catch { /* stats are non-critical */ }
    finally { setStatsLoading(false); }
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchOrders({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClienteInput = (e) => {
    const val = e.target.value;
    pendingClienteRef.current = val;
    setFilter('cliente', val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders({ page: 1, cliente: pendingClienteRef.current });
    }, 400);
  };

  const handleDropdownChange = (key, value) => {
    setFilter(key, value);
    fetchOrders({ page: 1, [key]: value });
  };

  const handleDateChange = (key, value) => {
    setFilter(key, value);
    fetchOrders({ page: 1, [key]: value });
  };

  const handleSearch = () => {
    clearTimeout(debounceRef.current);
    fetchOrders({ page: 1 });
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    const empty = { estado_pago: '', estado_orden: '', cliente: '', desde: '', hasta: '' };
    setFilters(empty);
    fetchOrders({ page: 1, estado_pago: '', estado_orden: '', cliente: '', desde: '', hasta: '' });
  };

  // ── Sort ────────────────────────────────────────────────────────────────────
  const handleSort = (field) => {
    const dir = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ field, direction: dir });
    fetchOrders({ page: 1, sortField: field, sortDirection: dir });
  };

  const SortIcon = ({ field }) => {
    if (sortConfig.field !== field) return <span className="ho-sort-icon">↕</span>;
    return <span className="ho-sort-icon ho-sort-icon--active">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  // ── Pagination ──────────────────────────────────────────────────────────────
  const goToPage = (p) => {
    if (p < 1 || p > pagination.total_pages) return;
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetchOrders({ page: p });
  };

  const buildPageNums = () => {
    const { page, total_pages } = pagination;
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1);
    const pages = new Set([1, total_pages, page, page - 1, page + 1].filter(p => p >= 1 && p <= total_pages));
    return [...pages].sort((a, b) => a - b);
  };

  // ── Drawer ──────────────────────────────────────────────────────────────────
  const openDrawer  = (order) => { setDrawerClosing(false); setDrawerOrder(order); };
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerOrder(null); setDrawerClosing(false); }, 240);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteOrden(id);
      showToast('Orden eliminada', 'success');
      setDeleteConfirm(null);
      if (drawerOrder?.id === id) closeDrawer();
      fetchOrders({ page: pagination.page });
      fetchStats();
    } catch (err) {
      showToast(err.message || 'No se pudo eliminar', 'error');
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (order) => {
    setEditOrder(order);
    setEditForm({
      estado:      order.order_status,
      estado_pago: order.estado_pago,
      metodo_pago: '',
      monto_pago:  0,
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await updateOrdenEstado(editOrder.id, {
        estado:      editForm.estado,
        estado_pago: editForm.estado_pago,
        metodo_pago: editForm.metodo_pago || null,
        monto_pago:  Number(editForm.monto_pago) || 0,
      });
      showToast('Orden actualizada', 'success');
      setEditOrder(null);
      // Refresh table + stats
      fetchOrders({ page: pagination.page });
      fetchStats();
      // If drawer is open for this order, close it so it reloads fresh
      if (drawerOrder?.id === editOrder.id) closeDrawer();
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Toast ────────────────────────────────────────────────────────────────────
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Pagination display ───────────────────────────────────────────────────────
  const { page, limit, total, total_pages } = pagination;
  const fromItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const toItem   = Math.min(page * limit, total);
  const pageNums = buildPageNums();

  // ── Stats cards data ─────────────────────────────────────────────────────────
  const statCards = [
    {
      icon: '📦',
      label: 'Total Órdenes',
      value: stats?.total_ordenes ?? 0,
      formatted: false,
      accentClass: '',
    },
    {
      icon: '💰',
      label: 'Total Recaudado',
      value: stats?.total_recaudado ?? 0,
      formatted: true,
      accentClass: '',
    },
    {
      icon: '🧾',
      label: 'Órdenes con Deuda',
      value: stats?.ordenes_debe ?? 0,
      formatted: false,
      accentClass: (stats?.ordenes_debe > 0) ? 'ho-stat-card--orange' : '',
    },
    {
      icon: '⚠️',
      label: 'Monto por Cobrar',
      value: stats?.monto_por_cobrar ?? 0,
      formatted: true,
      accentClass: (stats?.monto_por_cobrar > 0) ? 'ho-stat-card--red' : '',
    },
  ];

  return (
    <div className="ho-root">
      {/* ── Header ── */}
      <div className="ho-header">
        <div>
          <h1 className="ho-title">Historial de Órdenes</h1>
          <p className="ho-subtitle">Registro completo de todas las órdenes del negocio</p>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="ho-stats-bar">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} loading={statsLoading} />
        ))}
      </div>

      {/* ── Filters row ── */}
      <div className="ho-filters">
        <div className="ho-filter-group">
          <label className="ho-filter-label">
            Estado Pago
            {filters.estado_pago && <span className="ho-filter-dot" />}
          </label>
          <select
            className="ho-select"
            value={filters.estado_pago}
            onChange={e => handleDropdownChange('estado_pago', e.target.value)}
          >
            <option value="">Todos</option>
            <option value="Pagada">Pagada</option>
            <option value="Debe">Debe</option>
            <option value="Abono parcial">Abono parcial</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>

        <div className="ho-filter-group">
          <label className="ho-filter-label">
            Estado Orden
            {filters.estado_orden && <span className="ho-filter-dot" />}
          </label>
          <select
            className="ho-select"
            value={filters.estado_orden}
            onChange={e => handleDropdownChange('estado_orden', e.target.value)}
          >
            <option value="">Todos</option>
            <option value="Recibida">Recibida</option>
            <option value="En proceso">En proceso</option>
            <option value="Lista para entregar">Lista para entregar</option>
            <option value="Entregada">Entregada</option>
            <option value="Cancelada">Cancelada</option>
          </select>
        </div>

        <div className="ho-filter-group ho-filter-group--grow">
          <label className="ho-filter-label">
            Cliente
            {filters.cliente && <span className="ho-filter-dot" />}
          </label>
          <div className="ho-input-wrap">
            <span className="ho-input-icon">🔍</span>
            <input
              className="ho-input"
              type="text"
              placeholder="Buscar por nombre..."
              value={filters.cliente}
              onChange={handleClienteInput}
            />
          </div>
        </div>

        <div className="ho-filter-group">
          <label className="ho-filter-label">
            Desde
            {filters.desde && <span className="ho-filter-dot" />}
          </label>
          <input
            className="ho-input ho-input--date"
            type="date"
            value={filters.desde}
            onChange={e => handleDateChange('desde', e.target.value)}
          />
        </div>

        <div className="ho-filter-group">
          <label className="ho-filter-label">
            Hasta
            {filters.hasta && <span className="ho-filter-dot" />}
          </label>
          <input
            className="ho-input ho-input--date"
            type="date"
            value={filters.hasta}
            onChange={e => handleDateChange('hasta', e.target.value)}
          />
        </div>

        <div className="ho-filter-actions">
          <button className="ho-btn ho-btn--primary" onClick={handleSearch}>
            🔍 Buscar
          </button>
          {hasActiveFilters && (
            <button className="ho-btn ho-btn--ghost" onClick={handleClear}>
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="ho-error-banner">
          <span>⚠️ {error}</span>
          <button className="ho-btn ho-btn--sm" onClick={() => fetchOrders({ page: 1 })}>
            Reintentar
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="ho-table-wrap" ref={tableRef}>
        <table className="ho-table">
          <thead>
            <tr>
              <th className="ho-th ho-th--actions">Acciones</th>
              <th className="ho-th ho-th--id ho-th--sortable" onClick={() => handleSort('id')}>
                ID <SortIcon field="id" />
              </th>
              <th className="ho-th">Fecha</th>
              <th className="ho-th">Factura Global</th>
              <th className="ho-th">Estado Pago</th>
              <th className="ho-th">Estado Orden</th>
              <th className="ho-th ho-th--sortable" onClick={() => handleSort('user_name')}>
                Cliente <SortIcon field="user_name" />
              </th>
              <th className="ho-th">Contacto</th>
              <th className="ho-th ho-th--sortable ho-th--num" onClick={() => handleSort('total_amount')}>
                Total <SortIcon field="total_amount" />
              </th>
              <th className="ho-th ho-th--num">Restante</th>
              <th className="ho-th ho-th--num">Descuento</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  <div className="ho-empty">
                    <div className="ho-empty-icon">🗂️</div>
                    <p className="ho-empty-title">No se encontraron órdenes</p>
                    <p className="ho-empty-sub">
                      {hasActiveFilters
                        ? 'Intenta con otros filtros o limpia la búsqueda'
                        : 'Aún no hay órdenes registradas en el sistema'}
                    </p>
                    {hasActiveFilters && (
                      <button className="ho-btn ho-btn--ghost" onClick={handleClear}>
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((o, idx) => (
                <tr
                  key={o.id}
                  className="ho-row"
                  style={{ animationDelay: `${idx * 35}ms` }}
                  onClick={() => openDrawer(o)}
                >
                  <td className="ho-td ho-td--actions" onClick={e => e.stopPropagation()}>
                    <div className="ho-actions">
                      <button
                        className="ho-action-btn"
                        title="Imprimir"
                        onClick={e => { e.stopPropagation(); window.print(); }}
                      >🖨️</button>
                      <button
                        className="ho-action-btn"
                        title="Editar estado"
                        onClick={e => { e.stopPropagation(); openEdit(o); }}
                      >✏️</button>
                      <button
                        className="ho-action-btn ho-action-btn--del"
                        title="Eliminar"
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(o.id); }}
                      >🗑️</button>
                    </div>
                  </td>
                  <td className="ho-td ho-td--id">#{o.id}</td>
                  <td className="ho-td">{fmtDate(o.date)}</td>
                  <td className="ho-td">
                    {o.consolidated_invoice_id
                      ? <span className="ho-invoice-link">#{o.consolidated_invoice_id}</span>
                      : <span className="ho-na">N/A</span>}
                  </td>
                  <td className="ho-td"><Badge value={o.estado_pago} cfg={PAGO_CFG} /></td>
                  <td className="ho-td"><Badge value={o.order_status} cfg={ORDEN_CFG} /></td>
                  <td className="ho-td ho-td--client">
                    {o.is_institute && <span className="ho-b2b-icon">🏢</span>}
                    <span className="ho-client-name">{o.user_name}</span>
                  </td>
                  <td className="ho-td ho-td--contact">{o.user_id}</td>
                  <td className="ho-td ho-td--num">{fmtCOP(o.total_amount)}</td>
                  <td className="ho-td ho-td--num">
                    <span className={o.balance_due > 0 ? 'ho-val--red' : 'ho-val--green'}>
                      {fmtCOP(o.balance_due)}
                    </span>
                  </td>
                  <td className="ho-td ho-td--num">
                    {o.discount > 0
                      ? <span className="ho-val--gray">-{fmtCOP(o.discount)}</span>
                      : <span className="ho-na">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {!loading && total > 0 && (
        <div className="ho-pagination">
          <span className="ho-pag-info">
            Mostrando <strong>{fromItem}–{toItem}</strong> de <strong>{total}</strong> órdenes
          </span>

          <div className="ho-pag-pages">
            <button
              className="ho-pag-btn"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >‹</button>

            {pageNums.map((p, i) => {
              const prev = pageNums[i - 1];
              const gap  = prev != null && p - prev > 1;
              return (
                <span key={p} style={{ display: 'contents' }}>
                  {gap && <span className="ho-pag-ellipsis">…</span>}
                  <button
                    className={`ho-pag-btn ${p === page ? 'ho-pag-btn--active' : ''}`}
                    onClick={() => goToPage(p)}
                  >{p}</button>
                </span>
              );
            })}

            <button
              className="ho-pag-btn"
              disabled={page >= total_pages}
              onClick={() => goToPage(page + 1)}
            >›</button>
          </div>

          <div className="ho-pag-limit">
            <select
              className="ho-select ho-select--sm"
              value={limit}
              onChange={e => {
                const newLimit = Number(e.target.value);
                setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }));
                fetchOrders({ page: 1, limit: newLimit });
              }}
            >
              <option value={10}>10 por página</option>
              <option value={15}>15 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Order Detail Drawer ── */}
      {drawerOrder && (
        <div className={`ho-drawer-overlay ${drawerClosing ? 'ho-drawer-overlay--out' : ''}`} onClick={closeDrawer}>
          <aside
            className={`ho-drawer ${drawerClosing ? 'ho-drawer--out' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="ho-drawer-header">
              <div>
                <h2 className="ho-drawer-title">Orden #{drawerOrder.id}</h2>
                <p className="ho-drawer-date">{fmtDate(drawerOrder.date)}</p>
              </div>
              <button className="ho-drawer-close" onClick={closeDrawer}>✕</button>
            </div>

            {/* Badges row */}
            <div className="ho-drawer-badges">
              <Badge value={drawerOrder.estado_pago} cfg={PAGO_CFG} />
              <Badge value={drawerOrder.order_status} cfg={ORDEN_CFG} />
            </div>

            {/* Client info */}
            <div className="ho-drawer-client">
              {drawerOrder.is_institute && <span className="ho-b2b-icon ho-b2b-icon--lg">🏢</span>}
              <span className="ho-drawer-client-name">{drawerOrder.user_name}</span>
            </div>
            {drawerOrder.consolidated_invoice_id && (
              <p className="ho-drawer-invoice">
                Factura consolidada: <span className="ho-invoice-link">#{drawerOrder.consolidated_invoice_id}</span>
              </p>
            )}

            {/* Financial summary */}
            <div className="ho-drawer-financial">
              <div className="ho-fin-row">
                <span>Subtotal</span>
                <span>{fmtCOP(drawerOrder.subtotal)}</span>
              </div>
              {drawerOrder.discount > 0 && (
                <div className="ho-fin-row">
                  <span>Descuento</span>
                  <span className="ho-val--green">-{fmtCOP(drawerOrder.discount)}</span>
                </div>
              )}
              <div className="ho-fin-row ho-fin-row--total">
                <span>Total</span>
                <span>{fmtCOP(drawerOrder.total_amount)}</span>
              </div>
              <div className="ho-fin-divider" />
              <div className="ho-fin-row">
                <span>Pagado</span>
                <span className="ho-val--green">
                  {fmtCOP(drawerOrder.total_amount - drawerOrder.balance_due)}
                </span>
              </div>
              <div className="ho-fin-row ho-fin-row--restante">
                <span>Restante</span>
                <span className={drawerOrder.balance_due > 0 ? 'ho-val--red' : 'ho-val--green'}>
                  {fmtCOP(drawerOrder.balance_due)}
                </span>
              </div>
            </div>

            {/* Items description */}
            {drawerOrder.items_description && (
              <div className="ho-drawer-items">
                <p className="ho-drawer-items-label">Prendas / Servicios:</p>
                <p className="ho-drawer-items-text">{drawerOrder.items_description}</p>
              </div>
            )}

            {/* Footer actions */}
            <div className="ho-drawer-footer">
              <button className="ho-btn ho-btn--outline" onClick={() => window.print()}>
                🖨️ Imprimir orden
              </button>
              <button className="ho-btn ho-btn--primary" onClick={() => openEdit(drawerOrder)}>
                ✏️ Editar orden
              </button>
              {drawerOrder.order_status !== 'Entregada' && drawerOrder.order_status !== 'Cancelada' && (
                <button
                  className="ho-btn ho-btn--danger-ghost"
                  onClick={() => setDeleteConfirm(drawerOrder.id)}
                >
                  🗑️ Cancelar orden
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editOrder && (
        <div className="ho-modal-overlay" onClick={() => !editSaving && setEditOrder(null)}>
          <div className="ho-modal ho-modal--edit" onClick={e => e.stopPropagation()}>
            <div className="ho-modal-header">
              <div>
                <h3 className="ho-modal-title">Editar Orden #{editOrder.id}</h3>
                <p className="ho-modal-sub">{editOrder.user_name}</p>
              </div>
              <button
                className="ho-drawer-close"
                onClick={() => !editSaving && setEditOrder(null)}
              >✕</button>
            </div>

            <form onSubmit={handleEditSubmit} className="ho-edit-form">
              <div className="ho-edit-row">
                <div className="ho-edit-field">
                  <label className="ho-filter-label">Estado Orden</label>
                  <select
                    className="ho-select ho-select--full"
                    value={editForm.estado}
                    onChange={e => setEditForm(f => ({ ...f, estado: e.target.value }))}
                    required
                  >
                    <option value="Recibida">Recibida</option>
                    <option value="En proceso">En proceso</option>
                    <option value="Lista para entregar">Lista para entregar</option>
                    <option value="Entregada">Entregada</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>

                <div className="ho-edit-field">
                  <label className="ho-filter-label">Estado Pago</label>
                  <select
                    className="ho-select ho-select--full"
                    value={editForm.estado_pago}
                    onChange={e => setEditForm(f => ({ ...f, estado_pago: e.target.value }))}
                    required
                  >
                    <option value="Pagada">Pagada</option>
                    <option value="Debe">Debe</option>
                    <option value="Abono parcial">Abono parcial</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="ho-edit-divider">
                <span>Registrar pago adicional (opcional)</span>
              </div>

              <div className="ho-edit-row">
                <div className="ho-edit-field">
                  <label className="ho-filter-label">Método de Pago</label>
                  <select
                    className="ho-select ho-select--full"
                    value={editForm.metodo_pago}
                    onChange={e => setEditForm(f => ({ ...f, metodo_pago: e.target.value }))}
                  >
                    <option value="">Sin pago</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Nequi">Nequi</option>
                    <option value="Daviplata">Daviplata</option>
                  </select>
                </div>

                <div className="ho-edit-field">
                  <label className="ho-filter-label">Monto Pagado</label>
                  <input
                    className="ho-input ho-input--plain"
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={editForm.monto_pago || ''}
                    onChange={e => setEditForm(f => ({ ...f, monto_pago: e.target.value }))}
                    disabled={!editForm.metodo_pago}
                  />
                </div>
              </div>

              {/* Current balance info */}
              <div className="ho-edit-balance">
                <span>Saldo actual:</span>
                <span className={editOrder.balance_due > 0 ? 'ho-val--red' : 'ho-val--green'}>
                  {fmtCOP(editOrder.balance_due)}
                </span>
              </div>

              <div className="ho-modal-actions">
                <button
                  type="button"
                  className="ho-btn ho-btn--ghost"
                  onClick={() => setEditOrder(null)}
                  disabled={editSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`ho-btn ho-btn--primary ${editSaving ? 'ho-btn--saving' : ''}`}
                  disabled={editSaving}
                >
                  {editSaving ? '⏳ Guardando…' : '✓ Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteConfirm && (
        <div className="ho-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="ho-modal" onClick={e => e.stopPropagation()}>
            <h3 className="ho-modal-title">¿Eliminar orden?</h3>
            <p className="ho-modal-body">
              Esta acción no se puede deshacer. La orden #{deleteConfirm} será eliminada permanentemente.
            </p>
            <div className="ho-modal-actions">
              <button className="ho-btn ho-btn--ghost" onClick={() => setDeleteConfirm(null)}>
                Cancelar
              </button>
              <button className="ho-btn ho-btn--danger" onClick={() => handleDelete(deleteConfirm)}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`ho-toast ho-toast--${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
