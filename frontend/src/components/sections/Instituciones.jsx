import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './Instituciones.css';
import { getInstituciones, createInstitucion, getInstitucionOrdenes, getInstitucionFacturas } from '../../services/instituciones';

/* ── Helpers ───────────────────────────────────────────── */
const nowMs = Date.now();
const daysAgo = (n) => new Date(nowMs - n * 86400000);

const LOGO_COLORS = ['#FF6B2B','#2B7FFF','#2BA05A','#9B5DFF','#E53E8A','#0BADCF','#E8820A','#5DAB2B'];
function logoColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return LOGO_COLORS[Math.abs(h) % LOGO_COLORS.length];
}
function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}
function fmtCOP(n) {
  return '$' + n.toLocaleString('es-CO');
}
function fmtDate(d) {
  return d ? d.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }) : '—';
}

const mapBackendInst = (i) => ({
  id: i.user_id,
  nombre: i.user_name,
  nit: i.nit || '—',
  contacto: i.user_contact,
  email: i.email,
  direccion: i.user_address,
  fechaInicio: i.last_visit ? new Date(i.last_visit) : new Date(),
  condicionPago: i.payment_condition || 'Contado',
  estado: i.state ? 'Activo' : 'Inactivo',
  ordenes: i.total_orders || 0,
  revenueTotal: i.total_spent || 0,
  ordenesMes: 0, 
  facturasPendientes: i.pending_invoices || 0
});

/* ── Initial State ─────────────────────────────────────── */
const INITIAL_INSTITUTIONS = [];



const FACTURA_COLORS = {
  'Pagada':   { bg:'rgba(43,160,90,0.1)',   color:'#2BA05A' },
  'Pendiente':{ bg:'rgba(255,107,43,0.1)',   color:'#FF6B2B' },
  'Vencida':  { bg:'rgba(229,62,62,0.1)',    color:'#E53E3E' },
};

function relTime(date) {
  if (!date) return 'nunca';
  const d = Math.floor((nowMs - date.getTime()) / 86400000);
  if (d === 0) return 'hoy';
  if (d === 1) return 'hace 1 día';
  if (d < 30) return `hace ${d} días`;
  return `hace ${Math.floor(d/30)} mes${Math.floor(d/30)>1?'es':''}`;
}

/* ── Toast ─────────────────────────────────────────────── */
function ToastContainer({ toasts }) {
  return (
    <div className="i-toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`i-toast ${t.out ? 'out' : ''}`}>
          <span>{t.icon}</span><span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────── */
export default function Instituciones() {
  const [institutions, setInstitutions] = useState(INITIAL_INSTITUTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', estado: '', pago: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [drawerInst, setDrawerInst] = useState(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const searchTimer = useRef(null);
  
  // Fetch from API
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await getInstituciones({ 
          search: debouncedSearch,
          estado: filters.estado,
          pago: filters.pago
        });
        
        const mapped = data.map(mapBackendInst);
        
        setInstitutions(mapped);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [debouncedSearch, filters.estado, filters.pago]);

  const handleInstCreated = (newInst) => {
    setInstitutions(prev => [mapBackendInst(newInst), ...prev]);
    setIsModalOpen(false);
  };

  const handleSearchChange = (val) => {
    setFilters(f => ({ ...f, search: val }));
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const filtered = useMemo(() => {
    let r = [...institutions];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      r = r.filter(i => 
        (i.nombre?.toLowerCase() || '').includes(s) || 
        (i.nit || '').includes(s) || 
        (i.contacto?.toLowerCase() || '').includes(s)
      );
    }
    if (filters.estado) r = r.filter(i => i.estado === filters.estado);
    if (filters.pago)   r = r.filter(i => i.condicionPago === filters.pago);
    return r;
  }, [institutions, debouncedSearch, filters]);

  const hasFilters = filters.search || filters.estado || filters.pago;
  const clearFilters = () => { setFilters({ search:'', estado:'', pago:'' }); setDebouncedSearch(''); };

  // Summary stats
  const activeCount = institutions.filter(i => i.estado === 'Activo').length;
  const ordenesMes  = institutions.reduce((s, i) => s + i.ordenesMes, 0);
  const factPend    = institutions.reduce((s, i) => s + i.facturasPendientes, 0);

  // Toast
  const showToast = useCallback((message, icon = '✅') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, icon }]);
    setTimeout(() => {
      setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t));
      setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 250);
    }, 3000);
  }, []);

  // Drawer
  const openDrawer  = (inst) => { setDrawerInst(inst); setDrawerClosing(false); };
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerInst(null); setDrawerClosing(false); }, 200);
  };

  // ESC key
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        if (isModalOpen) setIsModalOpen(false);
        else if (drawerInst) closeDrawer();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isModalOpen, drawerInst]);

  // Export CSV
  const handleExport = () => {
    showToast('Exportando instituciones...', '📥');
    const headers = ['ID','Nombre','NIT','Contacto','Dirección','Pago','Estado','Órdenes','Revenue','Fecha Inicio'];
    const rows = filtered.map(i => [i.id, i.nombre, i.nit, i.contacto, i.direccion, i.condicionPago, i.estado, i.ordenes, i.revenueTotal, fmtDate(i.fechaInicio)]);
    const csv = [headers,...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'instituciones.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreated = (data) => {
    const inst = { ...data, id: Math.max(...institutions.map(i=>i.id))+1, ordenes:0, revenueTotal:0, ordenesMes:0, facturasPendientes:0 };
    setInstitutions(p => [inst, ...p]);
    setIsModalOpen(false);
    showToast('Institución creada exitosamente', '✅');
  };

  const handleInactivate = (inst) => {
    const next = inst.estado === 'Activo' ? 'Inactivo' : 'Activo';
    setInstitutions(p => p.map(i => i.id === inst.id ? { ...i, estado: next } : i));
    showToast(`${inst.nombre} ${next === 'Inactivo' ? 'inactivada' : 'activada'}`, next === 'Inactivo' ? '🔴' : '✅');
    closeDrawer();
  };

  const handleDelete = (e, inst) => {
    e.stopPropagation();
    setInstitutions(p => p.map(i => i.id === inst.id ? { ...i, estado: 'Inactivo' } : i));
    showToast(`${inst.nombre} inactivada`, '🔴');
  };

  return (
    <div className="i-section">
      {/* Header */}
      <div className="i-header">
        <div>
          <h1 className="i-header__title">Gestión de Instituciones</h1>
          <p className="i-header__subtitle">Clientes empresariales y convenios B2B</p>
        </div>
        <div className="i-header__actions">
          <button className="i-btn i-btn-outline" onClick={handleExport}>
            <DownloadIcon /> Exportar CSV
          </button>
          <button className="i-btn i-btn-primary" onClick={() => setIsModalOpen(true)}>
            <PlusIcon /> Nueva Institución
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="i-filters">
        <div className="i-search-wrap">
          <SearchIcon />
          <input
            className="i-search-input"
            type="search"
            placeholder="Buscar nombre, NIT, contacto..."
            value={filters.search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>

        <select
          className={`i-select ${filters.estado ? 'active' : ''}`}
          value={filters.estado}
          onChange={e => setFilters(f => ({ ...f, estado: e.target.value }))}
        >
          <option value="">Estado: Todos</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>

        <select
          className={`i-select ${filters.pago ? 'active' : ''}`}
          value={filters.pago}
          onChange={e => setFilters(f => ({ ...f, pago: e.target.value }))}
        >
          <option value="">Pago: Todos</option>
          <option value="Contado">Contado</option>
          <option value="Al crédito">Al crédito</option>
        </select>

        {hasFilters && (
          <button className="i-clear-btn" onClick={clearFilters}>
            <XIcon size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div className="i-summary">
        <div className="i-stat-chip">
          <span className="i-stat-chip__icon">🏢</span>
          <span><span className="i-stat-chip__value">{activeCount}</span> instituciones activas</span>
        </div>
        <div className="i-stat-chip">
          <span className="i-stat-chip__icon">📦</span>
          <span><span className="i-stat-chip__value">{ordenesMes}</span> órdenes este mes</span>
        </div>
        <div className={`i-stat-chip ${factPend > 0 ? 'warning' : ''}`}>
          <span className="i-stat-chip__icon">🧾</span>
          <span><span className="i-stat-chip__value">{factPend}</span> factura{factPend !== 1 ? 's' : ''} pendiente{factPend !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Grid */}
      <div className="i-grid">
        {filtered.length === 0 ? (
          <div className="i-empty">
            <span className="i-empty__icon">🏢</span>
            <div className="i-empty__title">No hay instituciones registradas</div>
            <p className="i-empty__sub">
              {hasFilters ? 'Prueba ajustando los filtros de búsqueda' : 'Agrega tu primer cliente empresarial'}
            </p>
            <button className="i-btn i-btn-primary" onClick={() => { clearFilters(); setIsModalOpen(true); }}>
              <PlusIcon /> Nueva Institución
            </button>
          </div>
        ) : (
          filtered.map((inst, idx) => (
            <InstitutionCard
              key={inst.id}
              inst={inst}
              delay={idx * 50}
              onOpen={() => openDrawer(inst)}
              onEdit={(e) => { e.stopPropagation(); openDrawer(inst); }}
              onDelete={(e) => handleDelete(e, inst)}
            />
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <NewInstModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleInstCreated}
        />
      )}

      {/* Drawer */}
      {drawerInst && (
        <InstDrawer
          inst={institutions.find(i => i.id === drawerInst.id) || drawerInst}
          closing={drawerClosing}
          onClose={closeDrawer}
          onInactivate={() => handleInactivate(institutions.find(i => i.id === drawerInst.id) || drawerInst)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}

/* ── InstitutionCard ───────────────────────────────────── */
function InstitutionCard({ inst, delay, onOpen, onEdit, onDelete }) {
  const color = logoColor(inst.nombre);
  return (
    <article
      className={`i-card ${inst.estado === 'Inactivo' ? 'inactive' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onOpen}
      tabIndex={0}
      role="button"
      onKeyDown={e => e.key === 'Enter' && onOpen()}
      aria-label={`Ver perfil de ${inst.nombre}`}
    >
      {/* Action buttons */}
      <div className="i-card__actions" onClick={e => e.stopPropagation()}>
        <button className="i-action-btn" onClick={onEdit} aria-label={`Editar ${inst.nombre}`} title="Editar">
          <PencilIcon />
        </button>
        <button className="i-action-btn delete" onClick={onDelete} aria-label={`Inactivar ${inst.nombre}`} title="Inactivar">
          <TrashIcon />
        </button>
      </div>

      {/* Head */}
      <div className="i-card__head">
        <div className="i-logo" style={{ background: color }}>{initials(inst.nombre)}</div>
        <div className="i-card__title-wrap">
          <div className="i-card__name" title={inst.nombre}>{inst.nombre}</div>
          <div className="i-card__nit">NIT: {inst.nit}</div>
        </div>
      </div>

      {/* Info */}
      <div className="i-card__info">
        <div className="i-info-row">
          <span>👤</span>
          <span><strong>{inst.contacto}</strong></span>
        </div>
        <div className="i-info-row">
          <span>📍</span>
          <span>{inst.direccion}</span>
        </div>
        <div className="i-info-row">
          <span>📅</span>
          <span>Desde <strong>{fmtDate(inst.fechaInicio)}</strong></span>
        </div>
      </div>

      {/* Stats */}
      <div className="i-card__stats">
        <div className="i-stat">
          <span>📦</span>
          <span className="i-stat__val">{inst.ordenes}</span>
          <span>órdenes</span>
        </div>
        <div className="i-stat-sep" />
        <div className="i-stat">
          <span>💰</span>
          <span className="i-stat__val">{fmtCOP(inst.revenueTotal)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="i-card__footer">
        <div className={`i-estado ${inst.estado === 'Activo' ? 'active' : 'inactive'}`}>
          <span className={`i-estado-dot ${inst.estado === 'Activo' ? 'active' : 'inactive'}`} />
          {inst.estado}
        </div>
        <span className={`i-badge ${inst.condicionPago === 'Al crédito' ? 'i-badge-blue' : 'i-badge-green'}`}>
          {inst.condicionPago === 'Al crédito' ? '🧾 Al crédito' : '✅ Contado'}
        </span>
      </div>
    </article>
  );
}

/* ── NewInstModal ──────────────────────────────────────── */
function NewInstModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    nombre: '', nit: '', contacto: '', direccion: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    condicionPago: 'Contado', estado: true,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [shake, setShake] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // NIT format validation: XXX.XXX.XXX-X
  const nitValid = /^\d{3}\.\d{3}\.\d{3}-\d$/.test(form.nit);

  const validate = () => {
    const e = {};
    if (!form.nombre.trim())   e.nombre   = 'El nombre es requerido';
    if (!form.nit.trim())      e.nit      = 'El NIT es requerido';
    if (!form.contacto.trim()) e.contacto = 'El contacto es requerido';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      setShake(true);
      setTimeout(() => setShake(false), 450);
      return;
    }
    setSaving(true);
    try {
      const result = await createInstitucion(form);
      onSave(result);
    } catch (err) {
      setErrors({ submit: err.message });
      setShake(true);
      setTimeout(() => setShake(false), 450);
    } finally {
      setSaving(false);
    }
  };

  const setF = (key, val) => { setForm(f => ({ ...f, [key]: val })); setErrors(e => ({ ...e, [key]: '' })); };

  return (
    <div className="i-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="i-modal-title">
      <div className={`i-modal ${shake ? 'shake' : ''}`}>
        <div className="i-modal__header">
          <h2 className="i-modal__title" id="i-modal-title">Nueva Institución</h2>
          <button className="i-close-btn" onClick={onClose} aria-label="Cerrar"><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="i-modal__body">
            {/* Nombre */}
            <div className="i-field">
              <label className="i-field-label" htmlFor="i-nombre">Nombre de la institución <span>*</span></label>
              <input id="i-nombre" ref={firstRef} className={`i-input ${errors.nombre ? 'error' : ''}`}
                placeholder="Ej: Hotel Dann Carlton"
                value={form.nombre} onChange={e => setF('nombre', e.target.value)} />
              {errors.nombre && <span className="i-error-msg">⚠ {errors.nombre}</span>}
              {errors.submit && <span className="i-error-msg">⚠ {errors.submit}</span>}
            </div>

            {/* NIT */}
            <div className="i-field">
              <label className="i-field-label" htmlFor="i-nit">NIT / RUT <span>*</span></label>
              <div className="i-input-wrap">
                <input id="i-nit"
                  className={`i-input ${errors.nit ? 'error' : form.nit && nitValid ? 'valid' : ''}`}
                  placeholder="860.007.777-5"
                  value={form.nit} onChange={e => setF('nit', e.target.value)} />
                {form.nit && nitValid && (
                  <span className="i-input-icon" style={{ color: '#2BA05A' }}>✓</span>
                )}
              </div>
              {errors.nit
                ? <span className="i-error-msg">⚠ {errors.nit}</span>
                : <span className="i-field-hint">Formato: XXX.XXX.XXX-X</span>
              }
            </div>

            {/* Contacto + Dirección row */}
            <div className="i-field-row">
              <div className="i-field">
                <label className="i-field-label" htmlFor="i-contacto">Contacto principal <span>*</span></label>
                <input id="i-contacto"
                  className={`i-input ${errors.contacto ? 'error' : ''}`}
                  placeholder="Nombre del contacto"
                  value={form.contacto} onChange={e => setF('contacto', e.target.value)} />
                {errors.contacto && <span className="i-error-msg">⚠ {errors.contacto}</span>}
              </div>
              <div className="i-field">
                <label className="i-field-label" htmlFor="i-dir">Dirección</label>
                <input id="i-dir" className="i-input"
                  placeholder="Calle 45 #12-30, Bogotá"
                  value={form.direccion} onChange={e => setF('direccion', e.target.value)} />
              </div>
            </div>

            {/* Fecha inicio + condicion pago row */}
            <div className="i-field-row">
              <div className="i-field">
                <label className="i-field-label" htmlFor="i-fecha">Inicio de contrato</label>
                <input id="i-fecha" type="date" className="i-input"
                  value={form.fechaInicio}
                  onChange={e => setF('fechaInicio', e.target.value)} />
              </div>
              <div className="i-field">
                <label className="i-field-label" htmlFor="i-pago">Condición de pago</label>
                <select id="i-pago" className="i-pago-select"
                  value={form.condicionPago}
                  onChange={e => setF('condicionPago', e.target.value)}>
                  <option value="Contado">Contado</option>
                  <option value="Al crédito">Al crédito</option>
                </select>
              </div>
            </div>

            {/* Estado toggle */}
            <div className="i-toggle-row">
              <div>
                <div className="i-toggle-label-text">Estado inicial</div>
                <div className="i-toggle-sub">{form.estado ? 'Institución activa desde el inicio' : 'La institución iniciará inactiva'}</div>
              </div>
              <label className="i-toggle-switch">
                <input type="checkbox" checked={form.estado} onChange={e => setF('estado', e.target.checked)} aria-label="Estado activo" />
                <div className="i-toggle-track" />
                <div className="i-toggle-thumb" />
              </label>
            </div>
          </div>

          <div className="i-modal__footer">
            <button type="button" className="i-btn i-btn-outline" onClick={onClose}>Cancelar</button>
            <button type="submit" className="i-btn i-btn-primary" disabled={saving}>
              {saving ? <><div className="i-spinner" /> Guardando...</> : 'Guardar Institución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── InstDrawer ────────────────────────────────────────── */
function InstDrawer({ inst, closing, onClose, onInactivate }) {
  const [facturas, setFacturas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const color = logoColor(inst.nombre);

  useEffect(() => {
    async function loadExtras() {
      setLoadingExtras(true);
      try {
        const [f, o] = await Promise.all([
          getInstitucionFacturas(inst.id),
          getInstitucionOrdenes(inst.id)
        ]);
        setFacturas(f);
        setOrdenes(o);
      } catch (err) {
        console.error("Error loading inst extras:", err);
      } finally {
        setLoadingExtras(false);
      }
    }
    loadExtras();
  }, [inst.id]);

  return (
    <>
      <div className="i-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div className={`i-drawer ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={`Perfil de ${inst.nombre}`}>

        {/* Header */}
        <div className="i-drawer__head">
          <div className="i-drawer__logo-row">
            <div className="i-drawer__logo" style={{ background: color }}>{initials(inst.nombre)}</div>
            <div className="i-drawer__info">
              <div className="i-drawer__name">{inst.nombre}</div>
              <div className="i-drawer__nit">NIT: {inst.nit}</div>
              <div className="i-drawer__badges">
                <span className={`i-badge ${inst.estado === 'Activo' ? 'i-badge-green' : 'i-badge-gray'}`}>{inst.estado}</span>
                <span className={`i-badge ${inst.condicionPago === 'Al crédito' ? 'i-badge-blue' : 'i-badge-green'}`}>{inst.condicionPago}</span>
                {inst.facturasPendientes > 0 && (
                  <span className="i-badge i-badge-orange">🧾 {inst.facturasPendientes} pendiente{inst.facturasPendientes > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>
          <div className="i-drawer__edit-btn">
            <button className="i-btn i-btn-outline i-btn-sm" aria-label="Editar institución">
              <PencilIcon /> Editar
            </button>
          </div>
          <button className="i-close-btn" onClick={onClose} aria-label="Cerrar panel" style={{ position:'absolute', top:12, right:12 }}>
            <XIcon />
          </button>
        </div>

        {/* KPIs */}
        <div className="i-drawer__kpis">
          {[
            { label:'📦 Órdenes totales',   value: inst.ordenes },
            { label:'💰 Revenue total',      value: fmtCOP(inst.revenueTotal) },
            { label:'📅 Órdenes este mes',   value: inst.ordenesMes },
            { label:'🗓️ Cliente desde',     value: fmtDate(inst.fechaInicio) },
          ].map(k => (
            <div key={k.label} className="i-kpi">
              <div className="i-kpi__label">{k.label}</div>
              <div className="i-kpi__value">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="i-drawer__info-section">
          <div className="i-drawer-section-title">Información</div>
          <div className="i-drawer-info-row"><span>👤</span><span>Contacto: <strong>{inst.contacto}</strong></span></div>
          <div className="i-drawer-info-row"><span>📍</span><span>{inst.direccion}</span></div>
          <div className="i-drawer-info-row"><span>📅</span><span>Contrato desde <strong>{fmtDate(inst.fechaInicio)}</strong></span></div>
          <div className="i-drawer-info-row">
            <span>🧾</span>
            <span>
              Condición de pago:{' '}
              <span className={`i-badge ${inst.condicionPago === 'Al crédito' ? 'i-badge-blue' : 'i-badge-green'}`} style={{ marginLeft:4 }}>
                {inst.condicionPago}
              </span>
            </span>
          </div>
        </div>

        {/* Facturas */}
        <div className="i-drawer__facturas">
          <div className="i-panel-header">
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div className="i-drawer-section-title" style={{ marginBottom:0 }}>Facturas Consolidadas</div>
              {inst.facturasPendientes > 0 && (
                <span className="i-panel-count">{inst.facturasPendientes}</span>
              )}
            </div>
            <span className="i-link">Ver todas →</span>
          </div>
          <table className="i-mini-table">
            <thead>
              <tr><th># Factura</th><th>Fecha</th><th>Total</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {loadingExtras ? (
                <tr><td colSpan="4" style={{textAlign:'center', padding:20}}><div className="i-spinner" /></td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan="4" style={{textAlign:'center', padding:10, color:'gray'}}>No hay facturas</td></tr>
              ) : (
                facturas.map(f => {
                  const estado = f.is_paid ? 'Pagada' : 'Pendiente';
                  const sc = FACTURA_COLORS[estado];
                  return (
                    <tr key={f.invoice_id}>
                      <td style={{ color:'var(--ds-text-secondary)', fontSize:'0.75rem' }}>{f.invoice_id}</td>
                      <td style={{ fontSize:'0.8rem' }}>{new Date(f.created_at).toLocaleDateString()}</td>
                      <td style={{ fontWeight:600, fontSize:'0.8rem' }}>{fmtCOP(f.total_amount)}</td>
                      <td>
                        <span className="i-badge" style={{ background:sc.bg, color:sc.color, fontSize:'0.7rem' }}>{estado}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Últimas órdenes */}
        <div className="i-drawer__facturas">
          <div className="i-panel-header">
            <div className="i-drawer-section-title" style={{ marginBottom:0 }}>Últimas Órdenes</div>
            <span className="i-link">Ver todas →</span>
          </div>
          <table className="i-mini-table">
            <thead>
              <tr><th># Orden</th><th>Status</th><th>Total</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {loadingExtras ? (
                <tr><td colSpan="4" style={{textAlign:'center', padding:20}}><div className="i-spinner" /></td></tr>
              ) : ordenes.length === 0 ? (
                <tr><td colSpan="4" style={{textAlign:'center', padding:10, color:'gray'}}>No hay órdenes</td></tr>
              ) : (
                ordenes.map(o => (
                  <tr key={o.order_id}>
                    <td style={{ color:'var(--ds-text-secondary)', fontSize:'0.75rem' }}>#{o.order_id}</td>
                    <td style={{ fontSize:'0.8rem' }}>{o.state_state}</td>
                    <td style={{ fontWeight:600, fontSize:'0.8rem' }}>{fmtCOP(o.order_value)}</td>
                    <td style={{ color:'var(--ds-text-secondary)', fontSize:'0.75rem' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="i-drawer__footer">
          <button className="i-btn i-btn-outline" style={{ width:'100%', justifyContent:'center' }}>
            Ver todas las órdenes
          </button>
          <button className="i-btn i-btn-danger-ghost" style={{ width:'100%', justifyContent:'center' }} onClick={onInactivate}>
            {inst.estado === 'Activo' ? 'Inactivar institución' : 'Activar institución'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Icons ─────────────────────────────────────────────── */
function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function DownloadIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function XIcon({ size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function PencilIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
}
