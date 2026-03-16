import { useState, useEffect, useRef, useCallback } from 'react';
import './Servicios.css';
import { BlockedAction } from '../ui/BlockedAction';
import {
  getServicios,
  getServiciosStats,
  createServicio,
  updateServicio,
  deleteServicio,
} from '../../services/servicios';

/* ── Helpers ─────────────────────────────────────────────── */
const fmtCOP = (n) => '$' + (Number(n) || 0).toLocaleString('es-CO');

function calcMargin(price, cost) {
  const p = Number(price) || 0;
  const c = Number(cost) || 0;
  const margin = p - c;
  const pct = p > 0 ? Math.round((margin / p) * 100) : 0;
  return { margin, pct };
}

function marginColor(pct) {
  if (pct >= 50) return '#2BA05A';
  if (pct >= 30) return '#FF8C42';
  return '#E53E3E';
}

/* ── Toast ───────────────────────────────────────────────── */
function ToastContainer({ toasts }) {
  return (
    <div className="sv-toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`sv-toast sv-toast--${t.type}${t.out ? ' out' : ''}`}>
          <span className="sv-toast__icon">{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Stat Chip ───────────────────────────────────────────── */
function StatChip({ icon, label, value, loading }) {
  if (loading) {
    return <div className="sv-stat-chip sv-stat-chip--loading"><div className="sv-skeleton sv-skeleton--chip" /></div>;
  }
  return (
    <div className="sv-stat-chip">
      <span className="sv-stat-chip__icon">{icon}</span>
      <div>
        <div className="sv-stat-chip__value">{value}</div>
        <div className="sv-stat-chip__label">{label}</div>
      </div>
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────── */
export default function Servicios() {
  const [services, setServices] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [mode, setMode] = useState('usuario');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [editError, setEditError] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newServiceValues, setNewServiceValues] = useState({});
  const [newError, setNewError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [networkError, setNetworkError] = useState(null);
  const [tableVisible, setTableVisible] = useState(true);

  const searchTimer = useRef(null);
  const toastTimers = useRef({});
  const newRowRef = useRef(null);

  /* ── Toast ───────────────────────────────────────────── */
  const addToast = useCallback((message, type = 'success', icon = '✓') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, icon, out: false }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 350);
    }, 3000);
  }, []);

  /* ── Fetch services ──────────────────────────────────── */
  const fetchServices = useCallback(
    async (modeVal, searchVal) => {
      const m = modeVal ?? mode;
      const s = searchVal ?? searchTerm;
      setLoading(true);
      setNetworkError(null);
      try {
        const params = { user_institute: m };
        if (s) params.search = s;
        const data = await getServicios(params);
        setServices(Array.isArray(data) ? data : []);
      } catch (err) {
        setNetworkError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [mode, searchTerm]
  );

  /* ── Fetch stats ─────────────────────────────────────── */
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getServiciosStats();
      setStats(data);
    } catch {
      /* stats optional */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /* ── Initial load ────────────────────────────────────── */
  useEffect(() => {
    fetchServices();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Mode toggle ─────────────────────────────────────── */
  const handleModeToggle = (newMode) => {
    if (newMode === mode) return;
    setEditingId(null);
    setIsAddingNew(false);
    setDeletingId(null);
    setTableVisible(false);
    setTimeout(() => {
      setMode(newMode);
      fetchServices(newMode, searchTerm);
      setTableVisible(true);
    }, 150);
  };

  /* ── Search ──────────────────────────────────────────── */
  const handleSearchChange = (val) => {
    setSearchTerm(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchServices(mode, val), 350);
  };

  /* ── Edit ────────────────────────────────────────────── */
  const startEdit = (service) => {
    if (isAddingNew) return;
    setEditingId(service.service_id);
    setEditValues({
      service_name: service.service_name,
      service_value: service.service_value,
      spent_per_service: service.spent_per_service,
      description: service.description || '',
      nombre_instituto: service.nombre_instituto || '',
    });
    setEditError(null);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
    setEditError(null);
  };

  const saveEdit = async (serviceId) => {
    try {
      const payload = {
        service_name: editValues.service_name,
        service_value: parseFloat(editValues.service_value),
        spent_per_service: parseFloat(editValues.spent_per_service) || 0,
        description: editValues.description || null,
      };
      if (mode === 'instituto') payload.nombre_instituto = editValues.nombre_instituto;
      const updated = await updateServicio(serviceId, payload);
      setServices((prev) => prev.map((s) => (s.service_id === serviceId ? updated : s)));
      setEditingId(null);
      setEditValues({});
      setEditError(null);
      addToast('Servicio actualizado', 'success', '✓');
      fetchStats();
    } catch (err) {
      setEditError(err.message);
      addToast(err.message, 'error', '✕');
    }
  };

  /* ── Add new ─────────────────────────────────────────── */
  const startAddNew = () => {
    if (editingId !== null) return;
    setIsAddingNew(true);
    setNewServiceValues({
      service_name: '',
      service_value: '',
      spent_per_service: '',
      description: '',
      nombre_instituto: '',
    });
    setNewError(null);
    setTimeout(() => newRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  };

  const cancelAddNew = () => {
    setIsAddingNew(false);
    setNewServiceValues({});
    setNewError(null);
  };

  const saveNew = async () => {
    if (!newServiceValues.service_name.trim()) {
      setNewError('Nombre del servicio es requerido');
      return;
    }
    const priceVal = parseFloat(newServiceValues.service_value);
    if (!newServiceValues.service_value || isNaN(priceVal) || priceVal <= 0) {
      setNewError('Precio requerido y debe ser mayor a 0');
      return;
    }
    try {
      const payload = {
        service_name: newServiceValues.service_name.trim(),
        service_value: priceVal,
        spent_per_service: parseFloat(newServiceValues.spent_per_service) || 0,
        description: newServiceValues.description || null,
        user_institute: mode,
      };
      if (mode === 'instituto') payload.nombre_instituto = newServiceValues.nombre_instituto || null;
      const created = await createServicio(payload);
      setServices((prev) => [created, ...prev]);
      setIsAddingNew(false);
      setNewServiceValues({});
      setNewError(null);
      addToast('Servicio creado exitosamente', 'success', '✓');
      fetchStats();
    } catch (err) {
      setNewError(err.message);
      addToast(err.message, 'error', '✕');
    }
  };

  /* ── Delete ──────────────────────────────────────────── */
  const confirmDelete = async (serviceId) => {
    try {
      await deleteServicio(serviceId);
      setServices((prev) => prev.filter((s) => s.service_id !== serviceId));
      setDeletingId(null);
      addToast('Servicio eliminado', 'success', '🗑');
      fetchStats();
    } catch (err) {
      setDeletingId(null);
      addToast(err.message, 'error', '✕');
    }
  };

  /* ── ESC key ─────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (editingId !== null) cancelEdit();
      else if (isAddingNew) cancelAddNew();
      else if (deletingId !== null) setDeletingId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingId, isAddingNew, deletingId]);

  /* ── Live margins ────────────────────────────────────── */
  const liveEditMargin = editingId !== null
    ? calcMargin(editValues.service_value, editValues.spent_per_service)
    : null;

  const liveNewMargin = isAddingNew
    ? calcMargin(newServiceValues.service_value, newServiceValues.spent_per_service)
    : null;

  const colSpan = mode === 'instituto' ? 8 : 7;

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="sv-section">
      <ToastContainer toasts={toasts} />

      {/* ── Header ── */}
      <div className="sv-header">
        <div>
          <h1 className="sv-header__title">Gestión de Servicios</h1>
          <p className="sv-header__subtitle">Define los servicios que ofrece tu lavandería</p>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="sv-stats-bar">
        <StatChip
          icon="👤"
          label="Servicios usuario"
          value={stats?.total_b2c ?? 0}
          loading={statsLoading}
        />
        <StatChip
          icon="🏢"
          label="Servicios institución"
          value={stats?.total_b2b ?? 0}
          loading={statsLoading}
        />
        <StatChip
          icon="💰"
          label="Promedio B2C"
          value={statsLoading ? '—' : fmtCOP(stats?.precio_promedio_b2c)}
          loading={statsLoading}
        />
        <StatChip
          icon="⭐"
          label="Más rentable"
          value={statsLoading ? '—' : (stats?.servicio_mas_rentable || 'N/A')}
          loading={statsLoading}
        />
      </div>

      {/* ── Toggle B2C / B2B ── */}
      <div className="sv-toggle-bar">
        <button
          className={`sv-toggle-option${mode === 'usuario' ? ' sv-toggle-option--active' : ''}`}
          onClick={() => handleModeToggle('usuario')}
        >
          👤 Servicios Usuario
        </button>
        <button
          className="sv-toggle-track"
          onClick={() => handleModeToggle(mode === 'usuario' ? 'instituto' : 'usuario')}
          aria-label="Cambiar modo"
        >
          <span className={`sv-toggle-thumb${mode === 'instituto' ? ' sv-toggle-thumb--right' : ''}`} />
        </button>
        <button
          className={`sv-toggle-option${mode === 'instituto' ? ' sv-toggle-option--active' : ''}`}
          onClick={() => handleModeToggle('instituto')}
        >
          🏢 Servicios Institución
        </button>
      </div>

      {/* ── Action bar ── */}
      <div className="sv-action-bar">
        <BlockedAction>
        <button
          className="sv-btn sv-btn--primary"
          onClick={startAddNew}
          disabled={isAddingNew || editingId !== null}
        >
          + Nuevo Servicio
        </button>
        </BlockedAction>
        <div className="sv-search-wrap">
          <span className="sv-search-icon">🔍</span>
          <input
            className="sv-search-input"
            type="text"
            placeholder="Buscar servicio..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* ── Network error banner ── */}
      {networkError && (
        <div className="sv-network-error">
          <span>⚠ {networkError}</span>
          <button className="sv-btn sv-btn--sm" onClick={() => fetchServices()}>
            Reintentar
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div
        className="sv-table-wrap"
        style={{ opacity: tableVisible ? 1 : 0, transition: 'opacity 150ms ease' }}
      >
        <table className="sv-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              {mode === 'instituto' && <th>Instituto</th>}
              <th>Precio</th>
              <th>Costo Ag.</th>
              <th>Margen</th>
              <th>Descripción</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>

            {/* ── New row ── */}
            {isAddingNew && (
              <tr className="sv-row sv-row--new" ref={newRowRef}>
                <td className="sv-td-id">—</td>
                <td>
                  <input
                    className={`sv-inline-input${newError && !newServiceValues.service_name ? ' sv-inline-input--error' : ''}`}
                    placeholder="Nombre *"
                    value={newServiceValues.service_name}
                    onChange={(e) => setNewServiceValues((v) => ({ ...v, service_name: e.target.value }))}
                    autoFocus
                  />
                </td>
                {mode === 'instituto' && (
                  <td>
                    <input
                      className="sv-inline-input"
                      placeholder="Institución"
                      value={newServiceValues.nombre_instituto}
                      onChange={(e) => setNewServiceValues((v) => ({ ...v, nombre_instituto: e.target.value }))}
                    />
                  </td>
                )}
                <td>
                  <input
                    className={`sv-inline-input sv-inline-input--num${newError && !newServiceValues.service_value ? ' sv-inline-input--error' : ''}`}
                    placeholder="Precio *"
                    type="number"
                    min="0"
                    value={newServiceValues.service_value}
                    onChange={(e) => setNewServiceValues((v) => ({ ...v, service_value: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    className="sv-inline-input sv-inline-input--num"
                    placeholder="Costo"
                    type="number"
                    min="0"
                    value={newServiceValues.spent_per_service}
                    onChange={(e) => setNewServiceValues((v) => ({ ...v, spent_per_service: e.target.value }))}
                  />
                </td>
                <td>
                  {liveNewMargin && (liveNewMargin.margin !== 0 || liveNewMargin.pct !== 0) && (
                    <span
                      className="sv-margin"
                      style={{ color: marginColor(liveNewMargin.pct), transition: 'color 200ms ease' }}
                    >
                      {fmtCOP(liveNewMargin.margin)} ({liveNewMargin.pct}%)
                    </span>
                  )}
                </td>
                <td>
                  <input
                    className="sv-inline-input"
                    placeholder="Descripción"
                    value={newServiceValues.description}
                    onChange={(e) => setNewServiceValues((v) => ({ ...v, description: e.target.value }))}
                  />
                </td>
                <td className="sv-td-actions">
                  <div className="sv-edit-actions">
                    {newError && <div className="sv-row-error">{newError}</div>}
                    <button className="sv-action-btn sv-action-btn--save" onClick={saveNew}>
                      ✅ Crear
                    </button>
                    <button className="sv-action-btn sv-action-btn--cancel" onClick={cancelAddNew}>
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* ── Skeleton rows ── */}
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skel-${i}`} className="sv-row">
                  <td><div className="sv-skeleton" style={{ width: 28 }} /></td>
                  <td><div className="sv-skeleton" style={{ width: 130 }} /></td>
                  {mode === 'instituto' && <td><div className="sv-skeleton" style={{ width: 90 }} /></td>}
                  <td><div className="sv-skeleton" style={{ width: 72 }} /></td>
                  <td><div className="sv-skeleton" style={{ width: 60 }} /></td>
                  <td><div className="sv-skeleton" style={{ width: 110 }} /></td>
                  <td><div className="sv-skeleton" style={{ width: 160 }} /></td>
                  <td><div className="sv-skeleton" style={{ width: 52 }} /></td>
                </tr>
              ))}

            {/* ── Data rows ── */}
            {!loading &&
              services.map((service) => {
                const isEditing = editingId === service.service_id;
                const isDeleting = deletingId === service.service_id;
                const { margin, pct } = isEditing
                  ? calcMargin(editValues.service_value, editValues.spent_per_service)
                  : calcMargin(service.service_value, service.spent_per_service);

                return (
                  <tr
                    key={service.service_id}
                    className={`sv-row${isEditing ? ' sv-row--editing' : ''}${isDeleting ? ' sv-row--deleting' : ''}`}
                  >
                    <td className="sv-td-id">{service.service_id}</td>

                    {/* Nombre */}
                    <td>
                      {isEditing ? (
                        <input
                          className={`sv-inline-input${editError ? ' sv-inline-input--error' : ''}`}
                          value={editValues.service_name}
                          onChange={(e) => setEditValues((v) => ({ ...v, service_name: e.target.value }))}
                          autoFocus
                        />
                      ) : (
                        <span className="sv-service-name">{service.service_name}</span>
                      )}
                    </td>

                    {/* Instituto (B2B only) */}
                    {mode === 'instituto' && (
                      <td>
                        {isEditing ? (
                          <input
                            className="sv-inline-input"
                            value={editValues.nombre_instituto}
                            onChange={(e) => setEditValues((v) => ({ ...v, nombre_instituto: e.target.value }))}
                          />
                        ) : (
                          <span className="sv-tag">{service.nombre_instituto || '—'}</span>
                        )}
                      </td>
                    )}

                    {/* Precio */}
                    <td>
                      {isEditing ? (
                        <input
                          className="sv-inline-input sv-inline-input--num"
                          type="number"
                          min="0"
                          value={editValues.service_value}
                          onChange={(e) => setEditValues((v) => ({ ...v, service_value: e.target.value }))}
                        />
                      ) : (
                        <span className="sv-price">{fmtCOP(service.service_value)}</span>
                      )}
                    </td>

                    {/* Costo Ag. */}
                    <td>
                      {isEditing ? (
                        <input
                          className="sv-inline-input sv-inline-input--num"
                          type="number"
                          min="0"
                          value={editValues.spent_per_service}
                          onChange={(e) => setEditValues((v) => ({ ...v, spent_per_service: e.target.value }))}
                        />
                      ) : (
                        <span className="sv-cost">{fmtCOP(service.spent_per_service)}</span>
                      )}
                    </td>

                    {/* Margen */}
                    <td>
                      <span
                        className="sv-margin"
                        style={{ color: marginColor(pct), transition: 'color 200ms ease' }}
                      >
                        {fmtCOP(margin)} ({pct}%)
                      </span>
                    </td>

                    {/* Descripción */}
                    <td>
                      {isEditing ? (
                        <input
                          className="sv-inline-input"
                          value={editValues.description}
                          placeholder="Descripción"
                          onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))}
                        />
                      ) : (
                        <span className="sv-description">
                          {service.description || <span className="sv-empty">—</span>}
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="sv-td-actions">
                      {isEditing ? (
                        <div className="sv-edit-actions">
                          {editError && <div className="sv-row-error">{editError}</div>}
                          <BlockedAction>
                          <button
                            className="sv-action-btn sv-action-btn--save"
                            onClick={() => saveEdit(service.service_id)}
                          >
                            ✅ Guardar
                          </button>
                          </BlockedAction>
                          <button className="sv-action-btn sv-action-btn--cancel" onClick={cancelEdit}>
                            ✕ Cancelar
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <div className="sv-delete-confirm">
                          <span className="sv-delete-confirm__label">¿Eliminar?</span>
                          <BlockedAction>
                          <button
                            className="sv-action-btn sv-action-btn--danger"
                            onClick={() => confirmDelete(service.service_id)}
                          >
                            Sí
                          </button>
                          </BlockedAction>
                          <button
                            className="sv-action-btn sv-action-btn--cancel"
                            onClick={() => setDeletingId(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="sv-row-actions">
                          <button
                            className="sv-icon-btn"
                            onClick={() => startEdit(service)}
                            title="Editar"
                            aria-label={`Editar ${service.service_name}`}
                          >
                            ✏️
                          </button>
                          <button
                            className="sv-icon-btn sv-icon-btn--danger"
                            onClick={() => {
                              setDeletingId(service.service_id);
                              setEditingId(null);
                            }}
                            title="Eliminar"
                            aria-label={`Eliminar ${service.service_name}`}
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

            {/* ── Empty state ── */}
            {!loading && services.length === 0 && !isAddingNew && (
              <tr>
                <td colSpan={colSpan} className="sv-empty-cell">
                  <div className="sv-empty-state">
                    <span className="sv-empty-state__icon">🧺</span>
                    <p className="sv-empty-state__text">
                      No hay servicios {mode === 'usuario' ? 'de usuario' : 'institucionales'} aún
                    </p>
                    <button className="sv-btn sv-btn--primary sv-btn--sm" onClick={startAddNew}>
                      + Agregar primero
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
