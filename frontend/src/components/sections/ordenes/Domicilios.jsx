import { useState, useEffect, useRef, useCallback } from 'react';
import './Domicilios.css';
import { getDomicilios, getDomiciliosStats, updateDomicilio, updateEstadoDomicilio } from '../../../services/domicilios';
import { getAppUsers } from '../../../services/appUsers';

// ── Constants ─────────────────────────────────────────────────────────────────
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const ESTADOS = ['Pendiente','En camino recogida','Recogido','En camino entrega','Entregado'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};

const truncate = (str, max) => {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
};

const ESTADO_STYLES = {
  'Pendiente':          { bg: '#F1EFE8', color: '#5F5E5A' },
  'En camino recogida': { bg: '#FFF8E1', color: '#F57F17' },
  'Recogido':           { bg: '#E3F2FD', color: '#0D47A1' },
  'En camino entrega':  { bg: '#FFF0E8', color: '#CC4A12' },
  'Entregado':          { bg: '#E8F5E9', color: '#2E7D32' },
};

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accentColor, highlightValue, loading }) {
  const [display, setDisplay] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    if (loading || value == null) return;
    const target = typeof value === 'number' ? value : 0;
    const dur = 750;
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

  const isHighlighted = highlightValue && value > 0;

  return (
    <div className="dm-stat-card" style={{ '--accent': accentColor }}>
      <div className="dm-stat-accent-bar" />
      <div className="dm-stat-body">
        <span className="dm-stat-icon">{icon}</span>
        <div className="dm-stat-info">
          <span className="dm-stat-label">{label}</span>
          {loading
            ? <span className="dm-skel dm-skel--val" />
            : <span
                className="dm-stat-value"
                style={isHighlighted ? { color: accentColor } : undefined}
              >
                {display.toLocaleString('es-CO')}
              </span>
          }
        </div>
      </div>
    </div>
  );
}

// ── Estado Badge ──────────────────────────────────────────────────────────────
function EstadoBadge({ estado }) {
  const style = ESTADO_STYLES[estado] || { bg: '#F1EFE8', color: '#5F5E5A' };
  return (
    <span className="dm-estado-badge" style={{ background: style.bg, color: style.color }}>
      {estado || '—'}
    </span>
  );
}

// ── Recogida/Entrega Cell ─────────────────────────────────────────────────────
function FechaCell({ fecha, hora, direccion }) {
  const dateStr = fmtDate(fecha);
  const addr = truncate(direccion, 28);
  if (!fecha && !direccion) return <span className="dm-na">—</span>;
  return (
    <div className="dm-fecha-cell">
      <span className="dm-fecha-date">{dateStr}{hora ? ` · ${hora}` : ''}</span>
      <span className="dm-fecha-dir">{addr}</span>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="dm-toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`dm-toast dm-toast--${t.type}${t.out ? ' out' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRows() {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i} className="dm-skel-row">
      {Array.from({ length: 7 }).map((__, j) => (
        <td key={j}><span className="dm-skel" style={{ width: `${50 + ((i*3+j*7)%40)}%` }} /></td>
      ))}
    </tr>
  ));
}

// ── Estado Dropdown ───────────────────────────────────────────────────────────
function EstadoDropdown({ current, onSelect, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="dm-estado-dd" ref={ref}>
      <button
        className="dm-action-btn dm-action-btn--estado"
        onClick={() => setOpen(v => !v)}
        disabled={loading}
        title="Cambiar estado"
      >
        Estado ▾
      </button>
      {open && (
        <div className="dm-estado-menu">
          {ESTADOS.map(e => (
            <button
              key={e}
              className={`dm-estado-option${e === current ? ' dm-estado-option--active' : ''}`}
              onClick={() => { onSelect(e); setOpen(false); }}
              style={ESTADO_STYLES[e] ? { color: ESTADO_STYLES[e].color } : undefined}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Expanded Row ──────────────────────────────────────────────────────────────
function ExpandedRow({ order, empleados, onStateChange, onSave, colSpan }) {
  const dom = order.domicilio || {};
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    direccion_recogida: dom.direccion_recogida || '',
    direccion_entrega:  dom.direccion_entrega  || '',
    fecha_recogida:     dom.fecha_recogida ? dom.fecha_recogida.slice(0,10) : '',
    hora_recogida:      dom.hora_recogida  || '',
    fecha_entrega:      dom.fecha_entrega  ? dom.fecha_entrega.slice(0,10)  : '',
    hora_entrega:       dom.hora_entrega   || '',
    nombre_receptor:    dom.nombre_receptor || '',
    empleado_id:        dom.empleado_id    || '',
    notas:              dom.notas          || '',
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        empleado_id: form.empleado_id ? Number(form.empleado_id) : null,
        fecha_recogida: form.fecha_recogida || null,
        fecha_entrega:  form.fecha_entrega  || null,
        hora_recogida:  form.hora_recogida  || null,
        hora_entrega:   form.hora_entrega   || null,
        nombre_receptor: form.nombre_receptor || null,
        notas:           form.notas           || null,
      };
      await onSave(order.id, payload);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <tr className="dm-expanded-row">
        <td colSpan={colSpan}>
          <div className="dm-expanded-card dm-expanded-card--edit">
            <p className="dm-expanded-edit-title">✏️ Editar domicilio — Orden #{order.order_number ?? order.id}</p>
            <div className="dm-edit-grid">
              <div className="dm-edit-field dm-edit-field--full">
                <label>📍 Dirección recogida</label>
                <input className="dm-edit-input" value={form.direccion_recogida} onChange={e => set('direccion_recogida', e.target.value)} placeholder="Dirección de recogida" />
              </div>
              <div className="dm-edit-field dm-edit-field--full">
                <label>📍 Dirección entrega</label>
                <input className="dm-edit-input" value={form.direccion_entrega} onChange={e => set('direccion_entrega', e.target.value)} placeholder="Dirección de entrega" />
              </div>
              <div className="dm-edit-field">
                <label>📅 Fecha recogida</label>
                <input className="dm-edit-input" type="date" value={form.fecha_recogida} onChange={e => set('fecha_recogida', e.target.value)} />
              </div>
              <div className="dm-edit-field">
                <label>⏰ Hora recogida</label>
                <input className="dm-edit-input" type="time" value={form.hora_recogida} onChange={e => set('hora_recogida', e.target.value)} />
              </div>
              <div className="dm-edit-field">
                <label>📅 Fecha entrega</label>
                <input className="dm-edit-input" type="date" value={form.fecha_entrega} onChange={e => set('fecha_entrega', e.target.value)} />
              </div>
              <div className="dm-edit-field">
                <label>⏰ Hora entrega</label>
                <input className="dm-edit-input" type="time" value={form.hora_entrega} onChange={e => set('hora_entrega', e.target.value)} />
              </div>
              <div className="dm-edit-field">
                <label>👤 Receptor</label>
                <input className="dm-edit-input" value={form.nombre_receptor} onChange={e => set('nombre_receptor', e.target.value)} placeholder="Nombre del receptor" />
              </div>
              <div className="dm-edit-field">
                <label>👷 Empleado</label>
                <select className="dm-edit-input" value={form.empleado_id} onChange={e => set('empleado_id', e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(empleados || []).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.username}</option>
                  ))}
                </select>
              </div>
              <div className="dm-edit-field dm-edit-field--full">
                <label>📝 Notas</label>
                <input className="dm-edit-input" value={form.notas} onChange={e => set('notas', e.target.value)} placeholder="Observaciones..." />
              </div>
            </div>
            <div className="dm-edit-actions">
              <button className="dm-btn dm-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Guardando…' : '✓ Guardar'}
              </button>
              <button className="dm-btn dm-btn--ghost" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="dm-expanded-row">
      <td colSpan={colSpan}>
        <div className="dm-expanded-card">
          <div className="dm-expanded-info">
            <div className="dm-info-row">
              <span className="dm-info-icon">📍</span>
              <span className="dm-info-key">Recogida:</span>
              <span className="dm-info-val">{dom.direccion_recogida || '—'}{dom.fecha_recogida ? ` · ${fmtDate(dom.fecha_recogida)}${dom.hora_recogida ? ' '+dom.hora_recogida : ''}` : ''}</span>
            </div>
            <div className="dm-info-row">
              <span className="dm-info-icon">📍</span>
              <span className="dm-info-key">Entrega:</span>
              <span className="dm-info-val">{dom.direccion_entrega || '—'}{dom.fecha_entrega ? ` · ${fmtDate(dom.fecha_entrega)}${dom.hora_entrega ? ' '+dom.hora_entrega : ''}` : ''}</span>
            </div>
            <div className="dm-info-row">
              <span className="dm-info-icon">👤</span>
              <span className="dm-info-key">Receptor:</span>
              <span className="dm-info-val">{dom.nombre_receptor || '—'}</span>
            </div>
            <div className="dm-info-row">
              <span className="dm-info-icon">👷</span>
              <span className="dm-info-key">Empleado:</span>
              <span className="dm-info-val">{dom.empleado_nombre || '—'}</span>
            </div>
            {dom.notas && (
              <div className="dm-info-row">
                <span className="dm-info-icon">📝</span>
                <span className="dm-info-key">Notas:</span>
                <span className="dm-info-val dm-info-val--notes">{dom.notas}</span>
              </div>
            )}
          </div>
          <div className="dm-expanded-actions">
            <button className="dm-btn dm-btn--edit" onClick={() => setEditing(true)}>
              ✏️ Editar domicilio
            </button>
            <EstadoDropdown
              current={dom.estado_domicilio}
              onSelect={(estado) => onStateChange(order.id, estado)}
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Domicilios() {
  const [orders, setOrders]           = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError]             = useState(null);
  const [empleados, setEmpleados]     = useState([]);
  const [expandedId, setExpandedId]   = useState(null);
  const [toasts, setToasts]           = useState([]);
  const [stateChanging, setStateChanging] = useState(null);

  const [filters, setFilters] = useState({
    cliente: '', estado_domicilio: '', empleado_id: '', desde: '', hasta: '',
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 0 });

  const debounceRef = useRef(null);
  const tableRef    = useRef(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, out: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
    }, 3500);
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError(null);
    const merged = { ...filters, ...overrides };
    const pg  = overrides.page  ?? pagination.page;
    const lim = overrides.limit ?? pagination.limit;

    const params = { page: pg, limit: lim };
    if (merged.cliente)         params.cliente         = merged.cliente;
    if (merged.estado_domicilio) params.estado_domicilio = merged.estado_domicilio;
    if (merged.empleado_id)     params.empleado_id     = merged.empleado_id;
    if (merged.desde)           params.desde           = merged.desde;
    if (merged.hasta)           params.hasta           = merged.hasta;

    try {
      const res = await getDomicilios(params);
      setOrders(res.data ?? []);
      setPagination(prev => ({
        ...prev,
        page:        res.page,
        limit:       res.limit,
        total:       res.total,
        total_pages: res.total_pages,
      }));
    } catch (err) {
      setError(err.message || 'Error al cargar domicilios');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await getDomiciliosStats();
      setStats(s);
    } catch { /* non-critical */ }
    finally { setStatsLoading(false); }
  }, []);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchOrders({ page: 1 });
    getAppUsers({ limit: 100 })
      .then(data => setEmpleados(Array.isArray(data) ? data : (data?.items ?? [])))
      .catch(() => setEmpleados([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter helpers ─────────────────────────────────────────────────────────
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleClienteInput = (e) => {
    const val = e.target.value;
    setFilter('cliente', val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOrders({ page: 1, cliente: val });
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

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    const empty = { cliente: '', estado_domicilio: '', empleado_id: '', desde: '', hasta: '' };
    setFilters(empty);
    fetchOrders({ page: 1, ...empty });
    fetchStats();
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const { page, limit, total, total_pages } = pagination;
  const fromItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const toItem   = Math.min(page * limit, total);

  const goToPage = (p) => {
    if (p < 1 || p > total_pages) return;
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetchOrders({ page: p });
  };

  const buildPageNums = () => {
    if (total_pages <= 7) return Array.from({ length: total_pages }, (_, i) => i + 1);
    const pages = new Set([1, total_pages, page, page-1, page+1].filter(p => p >= 1 && p <= total_pages));
    return [...pages].sort((a,b) => a-b);
  };

  // ── Estado change ──────────────────────────────────────────────────────────
  const handleStateChange = async (orderId, estado) => {
    setStateChanging(orderId);
    try {
      await updateEstadoDomicilio(orderId, estado);
      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        return { ...o, domicilio: { ...o.domicilio, estado_domicilio: estado } };
      }));
      fetchStats();
      addToast(`Estado actualizado: ${estado}`, 'success');
    } catch (err) {
      addToast(err.message || 'Error al actualizar estado', 'error');
    } finally {
      setStateChanging(null);
    }
  };

  // ── Save domicilio ─────────────────────────────────────────────────────────
  const handleSaveDomicilio = async (orderId, data) => {
    try {
      const updated = await updateDomicilio(orderId, data);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, domicilio: updated } : o));
      addToast('Domicilio actualizado', 'success');
    } catch (err) {
      addToast(err.message || 'Error al guardar', 'error');
      throw err;
    }
  };

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  const handleWhatsApp = (order) => {
    if (!order.user_contact) {
      addToast('El cliente no tiene número registrado', 'error');
      return;
    }
    const clean = order.user_contact.replace(/\D/g, '');
    const phone = clean.startsWith('57') ? clean : `57${clean}`;
    const dom = order.domicilio || {};
    const msg = `Hola ${order.user_name}, te informamos sobre tu domicilio (Orden #${order.order_number ?? order.id}). Estado: ${dom.estado_domicilio || 'Pendiente'}.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const pageNums = buildPageNums();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dm-wrap">
      <Toast toasts={toasts} />

      {/* Header */}
      <div className="dm-header">
        <div className="dm-header-left">
          <h1 className="dm-title">🛵 Órdenes de Domicilio</h1>
          <p className="dm-subtitle">Gestión de recogidas y entregas</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="dm-stats-bar">
        <StatCard icon="📦" label="Total domicilios" value={stats?.total ?? 0}    accentColor="#2B7FFF" loading={statsLoading} />
        <StatCard icon="⏳" label="Pendientes"        value={stats?.pendientes ?? 0} accentColor="#F57F17" highlightValue loading={statsLoading} />
        <StatCard icon="🛵" label="En camino"         value={stats?.en_camino ?? 0}  accentColor="#FF6B2B" highlightValue loading={statsLoading} />
        <StatCard icon="✅" label="Entregados"        value={stats?.entregados ?? 0} accentColor="#2BA05A" loading={statsLoading} />
      </div>

      {/* Filters */}
      <div className="dm-filters">
        <div className="dm-filter-group dm-filter-group--grow">
          <label className="dm-filter-label">
            Buscar
            {filters.cliente && <span className="dm-filter-dot" />}
          </label>
          <div className="dm-input-wrap">
            <span className="dm-input-icon">🔍</span>
            <input
              className="dm-input"
              type="text"
              placeholder="Cliente, contacto..."
              value={filters.cliente}
              onChange={handleClienteInput}
            />
          </div>
        </div>

        <div className="dm-filter-group">
          <label className="dm-filter-label">
            Estado
            {filters.estado_domicilio && <span className="dm-filter-dot" />}
          </label>
          <select
            className="dm-select"
            value={filters.estado_domicilio}
            onChange={e => handleDropdownChange('estado_domicilio', e.target.value)}
          >
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div className="dm-filter-group">
          <label className="dm-filter-label">
            Empleado
            {filters.empleado_id && <span className="dm-filter-dot" />}
          </label>
          <select
            className="dm-select"
            value={filters.empleado_id}
            onChange={e => handleDropdownChange('empleado_id', e.target.value)}
          >
            <option value="">Todos</option>
            {empleados.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.username}</option>
            ))}
          </select>
        </div>

        <div className="dm-filter-group">
          <label className="dm-filter-label">
            Desde
            {filters.desde && <span className="dm-filter-dot" />}
          </label>
          <input
            className="dm-input dm-input--date"
            type="date"
            value={filters.desde}
            onChange={e => handleDateChange('desde', e.target.value)}
          />
        </div>

        <div className="dm-filter-group">
          <label className="dm-filter-label">
            Hasta
            {filters.hasta && <span className="dm-filter-dot" />}
          </label>
          <input
            className="dm-input dm-input--date"
            type="date"
            value={filters.hasta}
            onChange={e => handleDateChange('hasta', e.target.value)}
          />
        </div>

        <div className="dm-filter-actions">
          {hasActiveFilters && (
            <button className="dm-btn dm-btn--ghost" onClick={handleClear}>
              ✕ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="dm-error-banner">
          <span>⚠️ {error}</span>
          <button className="dm-btn dm-btn--sm" onClick={() => fetchOrders({ page: 1 })}>
            Reintentar
          </button>
        </div>
      )}

      {/* Table */}
      <div className="dm-table-wrap" ref={tableRef}>
        <table className="dm-table">
          <thead>
            <tr>
              <th className="dm-th"># Orden</th>
              <th className="dm-th">Cliente</th>
              <th className="dm-th">Recogida</th>
              <th className="dm-th">Entrega</th>
              <th className="dm-th">Empleado</th>
              <th className="dm-th">Estado</th>
              <th className="dm-th dm-th--actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="dm-empty">
                    <div className="dm-empty-icon">🛵</div>
                    <p className="dm-empty-title">No hay órdenes de domicilio registradas</p>
                    {hasActiveFilters && (
                      <>
                        <p className="dm-empty-sub">Intenta con otros filtros</p>
                        <button className="dm-btn dm-btn--ghost" onClick={handleClear}>
                          Limpiar filtros
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((o, idx) => {
                const dom = o.domicilio || {};
                const isExpanded = expandedId === o.id;

                return [
                  <tr
                    key={o.id}
                    className={`dm-row${isExpanded ? ' dm-row--expanded' : ''}`}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    {/* # Orden */}
                    <td className="dm-td dm-td--id">
                      <span className="dm-order-num">#{o.order_number ?? o.id}</span>
                    </td>

                    {/* Cliente */}
                    <td className="dm-td dm-td--client">
                      <div className="dm-client-cell">
                        <span className="dm-client-name">{o.user_name}</span>
                        {o.user_contact && (
                          <span className="dm-client-contact">{o.user_contact}</span>
                        )}
                      </div>
                    </td>

                    {/* Recogida */}
                    <td className="dm-td">
                      <FechaCell
                        fecha={dom.fecha_recogida}
                        hora={dom.hora_recogida}
                        direccion={dom.direccion_recogida}
                      />
                    </td>

                    {/* Entrega */}
                    <td className="dm-td">
                      <FechaCell
                        fecha={dom.fecha_entrega}
                        hora={dom.hora_entrega}
                        direccion={dom.direccion_entrega}
                      />
                    </td>

                    {/* Empleado */}
                    <td className="dm-td">
                      {dom.empleado_nombre
                        ? <span className="dm-empleado-name">{dom.empleado_nombre}</span>
                        : <span className="dm-sin-asignar">Sin asignar</span>
                      }
                    </td>

                    {/* Estado */}
                    <td className="dm-td">
                      <EstadoBadge estado={dom.estado_domicilio} />
                    </td>

                    {/* Acciones */}
                    <td className="dm-td dm-td--actions" onClick={e => e.stopPropagation()}>
                      <div className="dm-actions">
                        <button
                          className={`dm-action-btn${isExpanded ? ' dm-action-btn--active' : ''}`}
                          onClick={() => setExpandedId(isExpanded ? null : o.id)}
                          title={isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                        >
                          {isExpanded ? '▲ Ocultar' : '▼ Detalle'}
                        </button>
                        <EstadoDropdown
                          current={dom.estado_domicilio}
                          onSelect={(estado) => handleStateChange(o.id, estado)}
                          loading={stateChanging === o.id}
                        />
                        <button
                          className="dm-action-btn dm-action-btn--wa"
                          onClick={() => handleWhatsApp(o)}
                          title="Enviar WhatsApp"
                        >
                          📱
                        </button>
                      </div>
                    </td>
                  </tr>,

                  isExpanded && (
                    <ExpandedRow
                      key={`exp-${o.id}`}
                      order={o}
                      empleados={empleados}
                      onStateChange={handleStateChange}
                      onSave={handleSaveDomicilio}
                      colSpan={7}
                    />
                  ),
                ];
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="dm-pagination">
          <span className="dm-pag-info">
            Mostrando <strong>{fromItem}–{toItem}</strong> de <strong>{total}</strong> domicilios
          </span>

          <div className="dm-pag-pages">
            <button className="dm-pag-btn" disabled={page <= 1} onClick={() => goToPage(page - 1)}>‹</button>
            {pageNums.map((p, i) => {
              const prev = pageNums[i-1];
              const gap  = prev != null && p - prev > 1;
              return (
                <span key={p} style={{ display: 'contents' }}>
                  {gap && <span className="dm-pag-ellipsis">…</span>}
                  <button
                    className={`dm-pag-btn${p === page ? ' dm-pag-btn--active' : ''}`}
                    onClick={() => goToPage(p)}
                  >{p}</button>
                </span>
              );
            })}
            <button className="dm-pag-btn" disabled={page >= total_pages} onClick={() => goToPage(page + 1)}>›</button>
          </div>

          <div className="dm-pag-limit">
            <select
              className="dm-select dm-select--sm"
              value={limit}
              onChange={e => {
                const newLimit = Number(e.target.value);
                setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }));
                fetchOrders({ page: 1, limit: newLimit });
              }}
            >
              <option value={15}>15 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
