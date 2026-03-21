import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './UsuariosApp.css';
import { BlockedAction } from '../ui/BlockedAction';
import {
  getAppUsers,
  getAppUsersStats,
  createAppUser,
  updateAppUser,
  toggleAppUserActivo,
  deleteAppUser,
} from '../../services/appUsers';
import { getJoinRequests, approveJoinRequest, rejectJoinRequest } from '../../services/joinRequests';

/* ── Helpers ────────────────────────────────────────────────── */
function getCurrentUser() {
  try {
    const token = localStorage.getItem('washflow_token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function relativeTime(isoString) {
  if (!isoString) return null;
  const past = new Date(isoString).getTime();
  if (isNaN(past)) return null;
  const diffMs     = Date.now() - past;
  const diffMins   = Math.floor(diffMs / 60000);
  const diffHours  = Math.floor(diffMins / 60);
  const diffDays   = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMins < 1)    return { text: 'hace un momento', old: false };
  if (diffHours < 1)   return { text: `hace ${diffMins} min`, old: false };
  if (diffDays < 1)    return { text: diffHours === 1 ? 'hace 1 hora' : `hace ${diffHours} horas`, old: false };
  if (diffDays === 1)  return { text: 'hace 1 día', old: false };
  if (diffDays < 30)   return { text: `hace ${diffDays} días`, old: false };
  if (diffMonths === 1) return { text: 'hace 1 mes', old: true };
  return { text: `hace ${diffMonths} meses`, old: true };
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── Count-up hook ──────────────────────────────────────────── */
function useCountUp(target, enabled = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!enabled || target == null) { setVal(target || 0); return; }
    const duration = 800;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return val;
}

/* ── Toast ──────────────────────────────────────────────────── */
function ToastContainer({ toasts }) {
  return (
    <div className="ua-toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`ua-toast ua-toast--${t.type}${t.out ? ' out' : ''}`}>
          <span>{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Stat Chip ──────────────────────────────────────────────── */
function StatChip({ icon, label, value, color, loading }) {
  const numVal   = typeof value === 'number' ? value : null;
  const countVal = useCountUp(numVal, !loading && numVal != null);

  if (loading) {
    return (
      <div className="ua-stat-chip ua-stat-chip--loading">
        <div className="ua-skeleton ua-skeleton--chip" />
      </div>
    );
  }
  return (
    <div className="ua-stat-chip">
      <span className="ua-stat-chip__icon">{icon}</span>
      <div>
        <div className="ua-stat-chip__value" style={color ? { color } : {}}>
          {numVal != null ? countVal : value}
        </div>
        <div className="ua-stat-chip__label">{label}</div>
      </div>
    </div>
  );
}

/* ── No Access ──────────────────────────────────────────────── */
function NoAccessScreen() {
  return (
    <div className="ua-no-access">
      <div className="ua-no-access__icon">🔒</div>
      <h2 className="ua-no-access__title">Acceso restringido</h2>
      <p className="ua-no-access__desc">Esta sección es solo para administradores</p>
    </div>
  );
}

/* ── Toggle Switch ──────────────────────────────────────────── */
function ToggleSwitch({ checked, onChange, disabled, loading, title }) {
  return (
    <button
      className={`ua-toggle${checked ? ' ua-toggle--on' : ''}${disabled ? ' ua-toggle--disabled' : ''}`}
      onClick={disabled || loading ? undefined : onChange}
      title={title}
      role="switch"
      aria-checked={checked}
      disabled={disabled && !loading}
      aria-label={checked ? 'Activo – click para desactivar' : 'Inactivo – click para activar'}
    >
      {loading ? <span className="ua-toggle-spinner" /> : <span className="ua-toggle-thumb" />}
    </button>
  );
}

/* ── Role Badge ─────────────────────────────────────────────── */
function RoleBadge({ role }) {
  if (role === 'admin') {
    return <span className="ua-role-badge ua-role-badge--admin">👑 Admin</span>;
  }
  return <span className="ua-role-badge ua-role-badge--empleado">👤 Empleado</span>;
}

/* ── User Modal ─────────────────────────────────────────────── */
function UserModal({ mode, user, currentUserId, onClose, onSuccess, addToast }) {
  const isEdit    = mode === 'edit';
  const isOwnEdit = isEdit && user?.id != null && String(user.id) === String(currentUserId);

  const [form, setForm] = useState({
    username:         isEdit ? (user?.username || '') : '',
    cedula:           isEdit ? (user?.cedula || '') : '',
    email:            isEdit ? (user?.email || '') : '',
    password:         '',
    confirm_password: '',
    role:             isEdit ? (user?.role || 'empleado') : 'empleado',
  });
  const [errors, setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [showPass, setShowPass] = useState(false);

  const firstInputRef = useRef(null);
  const overlayRef    = useRef(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setField = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(ev => ({ ...ev, [key]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = 'Nombre de usuario requerido';
    if (!isEdit) {
      if (!form.email.trim()) errs.email = 'Correo requerido';
      else if (!EMAIL_RE.test(form.email)) errs.email = 'Correo inválido';
      if (!form.password) errs.password = 'Contraseña requerida';
      else if (form.password !== form.confirm_password) errs.confirm_password = 'Las contraseñas no coinciden';
    } else {
      if (form.email && !EMAIL_RE.test(form.email)) errs.email = 'Correo inválido';
      if (form.password && form.password !== form.confirm_password) errs.confirm_password = 'Las contraseñas no coinciden';
    }
    return errs;
  };

  const isFormValid = () => {
    if (!form.username.trim()) return false;
    if (!isEdit) {
      if (!EMAIL_RE.test(form.email)) return false;
      if (!form.password) return false;
      if (form.password !== form.confirm_password) return false;
    } else {
      if (form.email && !EMAIL_RE.test(form.email)) return false;
      if (form.password && form.password !== form.confirm_password) return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    setServerError(null);
    try {
      const payload = { username: form.username.trim() };
      if (form.cedula)    payload.cedula = form.cedula;
      if (!isOwnEdit)     payload.role   = form.role;
      if (!isEdit) {
        payload.email    = form.email;
        payload.password = form.password;
      } else {
        if (form.email)    payload.email    = form.email;
        if (form.password) payload.password = form.password;
      }

      if (isEdit) {
        await updateAppUser(user.id, payload);
        addToast('Usuario actualizado exitosamente', 'success', '✅');
      } else {
        await createAppUser(payload);
        addToast('Usuario creado exitosamente', 'success', '✅');
      }
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err.message || 'Error desconocido';
      if (/409|ya.*registrado|already|duplicate/i.test(msg)) {
        setErrors(prev => ({ ...prev, email: 'Este correo ya está registrado' }));
      } else if (/403|[Ll]ímite|limit|plan/i.test(msg)) {
        setServerError('Límite de plan alcanzado. Actualiza tu plan para agregar más usuarios.');
      } else {
        setServerError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="ua-modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Editar usuario' : 'Nuevo usuario'}
    >
      <div className="ua-modal">
        <div className="ua-modal__header">
          <h2 className="ua-modal__title">
            {isEdit ? '✏️ Editar Usuario' : '+ Nuevo Usuario'}
          </h2>
          <button className="ua-modal__close" onClick={onClose} aria-label="Cerrar modal">✕</button>
        </div>

        <form className="ua-modal__body" onSubmit={handleSubmit} noValidate>
          {serverError && <div className="ua-modal-error">🔒 {serverError}</div>}

          {/* Username */}
          <div className="ua-modal-field">
            <label className="ua-modal-label">Nombre de usuario *</label>
            <input
              ref={firstInputRef}
              className={`ua-modal-input${errors.username ? ' ua-modal-input--error' : ''}`}
              value={form.username}
              onChange={e => setField('username', e.target.value)}
              placeholder="usuario123"
              autoComplete="off"
            />
            {errors.username && <span className="ua-field-error">{errors.username}</span>}
          </div>

          {/* Cédula */}
          <div className="ua-modal-field">
            <label className="ua-modal-label">Cédula</label>
            <input
              className="ua-modal-input"
              value={form.cedula}
              onChange={e => setField('cedula', e.target.value)}
              placeholder="XXXXXXXXXX"
            />
          </div>

          {/* Email */}
          <div className="ua-modal-field">
            <label className="ua-modal-label">Correo electrónico{!isEdit ? ' *' : ''}</label>
            <input
              type="email"
              className={`ua-modal-input${errors.email ? ' ua-modal-input--error' : ''}`}
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              placeholder="usuario@empresa.com"
              autoComplete="off"
            />
            {errors.email && <span className="ua-field-error">{errors.email}</span>}
          </div>

          {/* Password */}
          <div className="ua-modal-field">
            <label className="ua-modal-label">
              Contraseña{isEdit ? ' (dejar vacío para no cambiar)' : ' *'}
            </label>
            <div className="ua-pass-wrap">
              <input
                type={showPass ? 'text' : 'password'}
                className={`ua-modal-input ua-pass-input${errors.password ? ' ua-modal-input--error' : ''}`}
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Mínimo 8 caracteres'}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="ua-pass-toggle"
                onClick={() => setShowPass(s => !s)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
            {errors.password && <span className="ua-field-error">{errors.password}</span>}
          </div>

          {/* Confirm password */}
          <div className="ua-modal-field">
            <label className="ua-modal-label">
              Confirmar contraseña{(!isEdit || form.password) ? ' *' : ''}
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              className={`ua-modal-input${errors.confirm_password ? ' ua-modal-input--error' : ''}`}
              value={form.confirm_password}
              onChange={e => setField('confirm_password', e.target.value)}
              placeholder="Repetir contraseña"
            />
            {errors.confirm_password && <span className="ua-field-error">{errors.confirm_password}</span>}
          </div>

          {/* Role cards */}
          {!isOwnEdit && (
            <div className="ua-modal-field">
              <label className="ua-modal-label">Rol *</label>
              <div className="ua-role-cards">
                <button
                  type="button"
                  className={`ua-role-card${form.role === 'admin' ? ' ua-role-card--active' : ''}`}
                  onClick={() => setField('role', 'admin')}
                >
                  <span className="ua-role-card__icon">👑</span>
                  <div>
                    <div className="ua-role-card__name">Admin</div>
                    <div className="ua-role-card__desc">Puede crear usuarios y eliminar registros</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`ua-role-card${form.role === 'empleado' ? ' ua-role-card--active' : ''}`}
                  onClick={() => setField('role', 'empleado')}
                >
                  <span className="ua-role-card__icon">👤</span>
                  <div>
                    <div className="ua-role-card__name">Empleado</div>
                    <div className="ua-role-card__desc">Puede operar pero no eliminar</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div className="ua-modal__footer">
            <button type="button" className="ua-btn ua-btn--outline" onClick={onClose}>
              Cancelar
            </button>
            <BlockedAction>
            <button
              type="submit"
              className="ua-btn ua-btn--primary"
              disabled={submitting || !isFormValid()}
            >
              {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear Usuario'}
            </button>
            </BlockedAction>
          </div>
        </form>
      </div>
    </div>
  , document.body);
}

/* ── Main Component ─────────────────────────────────────────── */
export default function UsuariosApp({ user, onNavigate }) {
  const jwtPayload    = getCurrentUser();
  const currentRole   = user?.role || jwtPayload?.role;
  const currentUserId = user?.user_id ?? jwtPayload?.sub ?? jwtPayload?.user_id;

  // ── All hooks before conditional return ─────────────────────
  const [appUsers, setAppUsers]                   = useState([]);
  const [stats, setStats]                         = useState(null);
  const [loading, setLoading]                     = useState(true);
  const [statsLoading, setStatsLoading]           = useState(true);
  const [filters, setFilters]                     = useState({ role: '', is_active: '', search: '' });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser]             = useState(null);
  const [togglingId, setTogglingId]               = useState(null);
  const [deletingId, setDeletingId]               = useState(null);
  const [removingId, setRemovingId]               = useState(null);
  const [toasts, setToasts]                       = useState([]);
  const [networkError, setNetworkError]           = useState(null);
  const [joinRequests, setJoinRequests]           = useState([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [processingReqId, setProcessingReqId]     = useState(null);

  const searchTimer = useRef(null);
  const toastTimers = useRef({});

  const addToast = useCallback((message, type = 'success', icon = '✅') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, icon, out: false }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
    }, 3500);
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getAppUsersStats();
      setStats(data);
    } catch {
      /* optional */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (filtersOverride) => {
    setLoading(true);
    setNetworkError(null);
    try {
      const f = filtersOverride || filters;
      const params = {};
      if (f.role)          params.role      = f.role;
      if (f.is_active !== '') params.is_active = f.is_active;
      if (f.search)        params.search    = f.search;
      const data = await getAppUsers(params);
      setAppUsers(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) {
      setNetworkError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchJoinRequests = useCallback(async () => {
    setJoinRequestsLoading(true);
    try {
      const data = await getJoinRequests();
      setJoinRequests(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso */
    } finally {
      setJoinRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentRole === 'empleado') return;
    fetchStats();
    fetchUsers();
    fetchJoinRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDeletingId(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Permission guard (after hooks) ──────────────────────────
  if (currentRole === 'empleado') return <NoAccessScreen />;

  // ── Handlers ────────────────────────────────────────────────
  const handleFilterChange = (key, val) => {
    const newFilters = { ...filters, [key]: val };
    setFilters(newFilters);
    if (key === 'search') {
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => fetchUsers(newFilters), 300);
    } else {
      fetchUsers(newFilters);
    }
  };

  const handleToggle = async (u) => {
    if (String(u.id) === String(currentUserId)) return;
    setTogglingId(u.id);
    try {
      const updated  = await toggleAppUserActivo(u.id);
      const newActive = updated?.is_active ?? !u.is_active;
      setAppUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: newActive } : x));
      addToast(
        newActive ? 'Usuario activado' : 'Usuario desactivado',
        'success',
        newActive ? '✅' : '🔒',
      );
      fetchStats();
    } catch (err) {
      addToast(err.message, 'error', '❌');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (userId) => {
    setRemovingId(userId);
    setTimeout(async () => {
      try {
        await deleteAppUser(userId);
        setAppUsers(prev => prev.filter(u => u.id !== userId));
        setDeletingId(null);
        setRemovingId(null);
        addToast('Usuario eliminado', 'success', '🗑️');
        fetchStats();
      } catch (err) {
        setRemovingId(null);
        setDeletingId(null);
        addToast(err.message, 'error', '❌');
      }
    }, 200);
  };

  const handleApproveRequest = async (id) => {
    setProcessingReqId(id);
    try {
      await approveJoinRequest(id);
      setJoinRequests(prev => prev.filter(r => r.id !== id));
      addToast('Empleado aprobado exitosamente', 'success', '✅');
      fetchUsers();
      fetchStats();
    } catch (err) {
      addToast(err.message, 'error', '❌');
    } finally {
      setProcessingReqId(null);
    }
  };

  const handleRejectRequest = async (id) => {
    setProcessingReqId(id);
    try {
      await rejectJoinRequest(id);
      setJoinRequests(prev => prev.filter(r => r.id !== id));
      addToast('Solicitud rechazada', 'success', '🔒');
    } catch (err) {
      addToast(err.message, 'error', '❌');
    } finally {
      setProcessingReqId(null);
    }
  };

  // ── Derived values ───────────────────────────────────────────
  const showBanner     = stats != null && stats.slots_disponibles <= 2;
  const bannerDanger   = stats?.slots_disponibles === 0;
  const newUserBlocked = stats?.slots_disponibles === 0;
  const slotsColor     = stats?.slots_disponibles === 0
    ? '#E53E3E'
    : stats?.slots_disponibles <= 2
    ? '#FF6B2B'
    : undefined;

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="ua-section">
      <ToastContainer toasts={toasts} />

      {isCreateModalOpen && (
        <UserModal
          mode="create"
          currentUserId={currentUserId}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => { fetchUsers(); fetchStats(); }}
          addToast={addToast}
        />
      )}

      {editingUser && (
        <UserModal
          mode="edit"
          user={editingUser}
          currentUserId={currentUserId}
          onClose={() => setEditingUser(null)}
          onSuccess={() => { fetchUsers(); fetchStats(); }}
          addToast={addToast}
        />
      )}

      {/* Header */}
      <div className="ua-header">
        <h1 className="ua-header__title">Usuarios de la Aplicación</h1>
        <p className="ua-header__subtitle">Gestiona el equipo que opera WashFlow</p>
      </div>

      {/* Plan Banner */}
      {showBanner && (
        <div className={`ua-plan-banner ua-plan-banner--${bannerDanger ? 'danger' : 'warning'}`}>
          <span className="ua-plan-banner__icon">{bannerDanger ? '🔒' : '⚠️'}</span>
          <span className="ua-plan-banner__text">
            {bannerDanger
              ? 'Límite alcanzado. Actualiza tu plan para agregar más usuarios'
              : `Te quedan ${stats.slots_disponibles} slot${stats.slots_disponibles !== 1 ? 's' : ''} disponibles en tu plan`
            }
          </span>
          <button className="ua-plan-banner__action" onClick={() => onNavigate?.('configuracion')}>
            Actualizar plan →
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="ua-stats-bar">
        <StatChip icon="👥" label="Total usuarios"  value={stats?.total_usuarios ?? 0}  loading={statsLoading} />
        <StatChip icon="👑" label="Admins"           value={stats?.total_admins ?? 0}    loading={statsLoading} />
        <StatChip icon="👤" label="Empleados"        value={stats?.total_empleados ?? 0} loading={statsLoading} />
        <StatChip icon="✅" label="Activos"          value={stats?.activos ?? 0}          loading={statsLoading} />
        <StatChip
          icon="🔒"
          label="Slots disponibles"
          value={stats ? `${stats.slots_disponibles}/${stats.max_usuarios}` : '—'}
          color={slotsColor}
          loading={statsLoading}
        />
      </div>

      {/* Action Bar */}
      <div className="ua-action-bar">
        <div title={newUserBlocked ? 'Límite de usuarios alcanzado. Actualiza tu plan.' : undefined}>
          <BlockedAction>
          <button
            className="ua-btn ua-btn--primary"
            onClick={newUserBlocked ? undefined : () => setIsCreateModalOpen(true)}
            disabled={newUserBlocked}
            aria-disabled={newUserBlocked}
          >
            + Nuevo Usuario
          </button>
          </BlockedAction>
        </div>

        <div className="ua-filters">
          <select
            className="ua-filter-select"
            value={filters.role}
            onChange={e => handleFilterChange('role', e.target.value)}
            aria-label="Filtrar por rol"
          >
            <option value="">Rol ▾</option>
            <option value="admin">Admin</option>
            <option value="empleado">Empleado</option>
          </select>

          <select
            className="ua-filter-select"
            value={filters.is_active}
            onChange={e => handleFilterChange('is_active', e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="">Estado ▾</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>

          <div className="ua-search-wrap">
            <span className="ua-search-icon" aria-hidden="true">🔍</span>
            <input
              className="ua-search-input"
              type="search"
              placeholder="Buscar usuario..."
              value={filters.search}
              onChange={e => handleFilterChange('search', e.target.value)}
              aria-label="Buscar usuarios"
            />
          </div>
        </div>
      </div>

      {/* Join Requests */}
      {(joinRequests.length > 0 || joinRequestsLoading) && (
        <div className="ua-join-requests">
          <div className="ua-join-requests__header">
            <span className="ua-join-requests__title">
              Solicitudes de empleados
              {joinRequests.length > 0 && (
                <span className="ua-join-requests__badge">{joinRequests.length}</span>
              )}
            </span>
            <span className="ua-join-requests__sub">Personas que quieren unirse a tu negocio</span>
          </div>
          {joinRequestsLoading ? (
            <div className="ua-join-requests__loading">Cargando solicitudes…</div>
          ) : (
            <div className="ua-join-requests__list">
              {joinRequests.map(req => (
                <div key={req.id} className="ua-join-request-row">
                  <div className="ua-avatar" style={{ background: '#9C27B0', flexShrink: 0 }}>
                    {(req.username ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="ua-join-request-row__info">
                    <div className="ua-join-request-row__name">{req.username ?? '—'}</div>
                    <div className="ua-join-request-row__email">{req.email ?? '—'}</div>
                  </div>
                  <div className="ua-join-request-row__actions">
                    <button
                      className="ua-action-btn ua-action-btn--approve"
                      onClick={() => handleApproveRequest(req.id)}
                      disabled={processingReqId === req.id}
                    >
                      {processingReqId === req.id ? '…' : 'Aprobar'}
                    </button>
                    <button
                      className="ua-action-btn ua-action-btn--cancel"
                      onClick={() => handleRejectRequest(req.id)}
                      disabled={processingReqId === req.id}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Network Error */}
      {networkError && (
        <div className="ua-network-error" role="alert">
          <span>⚠ {networkError}</span>
          <button className="ua-btn ua-btn--sm" onClick={() => fetchUsers()}>Reintentar</button>
        </div>
      )}

      {/* Table */}
      <div className="ua-table-wrap">
        <table className="ua-table" aria-label="Usuarios de la aplicación">
          <thead>
            <tr>
              <th scope="col">Avatar</th>
              <th scope="col">Usuario</th>
              <th scope="col">Cédula</th>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Último acceso</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>

            {/* Skeleton rows */}
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skel-${i}`} className="ua-row" aria-hidden="true">
                <td><div className="ua-skeleton ua-skeleton--avatar" /></td>
                <td><div className="ua-skeleton" style={{ width: 120, height: 14 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 90,  height: 14 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 160, height: 14 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 80,  height: 14 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 100, height: 14 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 44,  height: 24, borderRadius: 12 }} /></td>
                <td><div className="ua-skeleton" style={{ width: 60,  height: 14 }} /></td>
              </tr>
            ))}

            {/* Data rows */}
            {!loading && appUsers.map(u => {
              const isOwn      = String(u.id) === String(currentUserId);
              const isDeleting = deletingId === u.id;
              const isRemoving = removingId === u.id;
              const isToggling = togglingId === u.id;
              const rt          = relativeTime(u.last_login);
              const displayName = u.username || u.email || `#${u.id}`;

              return (
                <tr
                  key={u.id}
                  className={`ua-row${isOwn ? ' ua-row--own' : ''}${isRemoving ? ' ua-row--removing' : ''}`}
                >
                  {/* Avatar */}
                  <td>
                    <div
                      className="ua-avatar"
                      style={{ background: u.role === 'admin' ? '#FF6B2B' : '#2B7FFF' }}
                      aria-hidden="true"
                    >
                      {initials(displayName)}
                    </div>
                  </td>

                  {/* Username */}
                  <td>
                    <div className="ua-username-cell">
                      <span className="ua-username">{displayName}</span>
                      {isOwn && <span className="ua-you-badge">Tú</span>}
                    </div>
                  </td>

                  {/* Cédula */}
                  <td>
                    <span className="ua-cedula">
                      {u.cedula || <span className="ua-empty">—</span>}
                    </span>
                  </td>

                  {/* Correo */}
                  <td>
                    <span className="ua-email" title={u.email}>{u.email}</span>
                  </td>

                  {/* Rol */}
                  <td><RoleBadge role={u.role} /></td>

                  {/* Último acceso */}
                  <td>
                    {rt ? (
                      <span className={`ua-last-login${rt.old ? ' ua-last-login--old' : ''}`}>
                        {rt.text}
                      </span>
                    ) : (
                      <span className="ua-last-login ua-last-login--never">Nunca</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td>
                    <ToggleSwitch
                      checked={u.is_active}
                      onChange={() => handleToggle(u)}
                      disabled={isOwn}
                      loading={isToggling}
                      title={isOwn ? 'No puedes desactivarte a ti mismo' : undefined}
                    />
                  </td>

                  {/* Acciones */}
                  <td className="ua-td-actions">
                    {isOwn ? (
                      <div className="ua-row-actions">
                        <button
                          className="ua-icon-btn"
                          onClick={() => setEditingUser(u)}
                          title="Editar mi perfil"
                          aria-label="Editar mi perfil"
                        >
                          ✏️
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <div className="ua-delete-confirm">
                        <span className="ua-delete-confirm__label">¿Eliminar?</span>
                        <BlockedAction>
                        <button
                          className="ua-action-btn ua-action-btn--danger"
                          onClick={() => handleDelete(u.id)}
                          aria-label={`Confirmar eliminación de ${displayName}`}
                        >
                          Sí
                        </button>
                        </BlockedAction>
                        <button
                          className="ua-action-btn ua-action-btn--cancel"
                          onClick={() => setDeletingId(null)}
                          aria-label="Cancelar eliminación"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="ua-row-actions">
                        <BlockedAction>
                        <button
                          className="ua-icon-btn"
                          onClick={() => { setEditingUser(u); setDeletingId(null); }}
                          title="Editar"
                          aria-label={`Editar ${displayName}`}
                        >
                          ✏️
                        </button>
                        </BlockedAction>
                        <BlockedAction>
                        <button
                          className="ua-icon-btn ua-icon-btn--danger"
                          onClick={() => { setDeletingId(u.id); setEditingUser(null); }}
                          title="Eliminar"
                          aria-label={`Eliminar ${displayName}`}
                        >
                          🗑️
                        </button>
                        </BlockedAction>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {!loading && appUsers.length === 0 && (
              <tr>
                <td colSpan={8} className="ua-empty-cell">
                  <div className="ua-empty-state">
                    <span className="ua-empty-state__icon">👥</span>
                    <p>No hay usuarios de aplicación aún</p>
                    {!newUserBlocked && (
                      <button
                        className="ua-btn ua-btn--primary ua-btn--sm"
                        onClick={() => setIsCreateModalOpen(true)}
                      >
                        + Agregar primero
                      </button>
                    )}
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
