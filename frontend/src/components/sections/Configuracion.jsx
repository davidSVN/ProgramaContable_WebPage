import { useState, useEffect, useRef } from 'react';
import './Configuracion.css';
import { api } from '../../services/api';
import { getSuscripcionInfo, updatePlan } from '../../services/suscripcion';
import { getNegocioConfig, updateNegocioConfig } from '../../services/configuracion';
import { isWebSerialSupported, isPrintAvailable, requestPrinterPort, getPrinterPortInfo, clearPrinterPort, printTest } from '../../services/print';

/* ── Expand utility ─────────────────────────────────────── */
const expandText = (text, abbreviations) =>
  text
    .split(' ')
    .map(word => abbreviations[word.toLowerCase()] || word)
    .join(' ');

/* ── Default abbreviations (mirrors backend) ────────────── */
const DEFAULT_ABREVIACIONES = {
  ca: 'camisa',   pa: 'pantalón',  az: 'azul',      ne: 'negro',
  bl: 'blanco',   ro: 'rojo',      sa: 'sábana',    to: 'toalla',
  ch: 'chaqueta', su: 'suéter',    ve: 'vestido',   fa: 'falda',
  me: 'medias',   co: 'cobija',    al: 'almohada',  do: 'doble',
  gr: 'grande',   pe: 'pequeño',   la: 'lavado',    se: 'secado',
};

/* ── Plan helpers ───────────────────────────────────────── */
const PLAN_LABELS = { none: 'Sin suscripción', basic: 'Basic', premium: 'Premium ⭐', superadmin: 'SuperAdmin 👑' };
const PLAN_CLASSES = { none: 'ab-plan-pill--none', basic: 'ab-plan-pill--basic', premium: 'ab-plan-pill--premium', superadmin: 'ab-plan-pill--premium' };

const BASIC_FEATURES  = ['Crear y gestionar órdenes', 'Historial de clientes', 'Control de gastos', 'Historial de órdenes', 'Facturación B2B'];
const PREMIUM_FEATURES = ['Todo el plan Basic', 'IA & Reportes avanzados', 'Segmentación RFM', 'Predicciones de demanda', 'Detección de churn', 'Oportunidades de descuento'];

/* ── PlanModal ───────────────────────────────────────────── */
function PlanModal({ currentPlan, onClose, onChanged }) {
  const [loading, setLoading] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSelect = async (plan) => {
    if (plan === currentPlan) {
      showToast(`Ya tienes este plan`, false);
      return;
    }
    setLoading(plan);
    try {
      await updatePlan(plan);
      localStorage.setItem('washflow_plan', plan);
      showToast(`✅ Plan actualizado a ${PLAN_LABELS[plan]}`);
      setTimeout(() => { onChanged(plan); onClose(); }, 1500);
    } catch (err) {
      showToast(err.message || 'Error al actualizar plan', false);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-modal" onClick={e => e.stopPropagation()}>
        <div className="ab-modal-header">
          <h2 className="ab-modal-title">Cambiar plan de suscripción</h2>
          <button className="ab-modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {toast && <div className={`ab-toast ${toast.ok ? 'ab-toast--ok' : 'ab-toast--err'}`}>{toast.msg}</div>}

        <div className="ab-modal-plans">
          {/* Basic */}
          <div className={`ab-modal-plan ${currentPlan === 'basic' ? 'ab-modal-plan--current' : ''}`}>
            {currentPlan === 'basic' && <span className="ab-modal-current-badge">Plan actual</span>}
            <h3 className="ab-modal-plan__name">Basic</h3>
            <p className="ab-modal-plan__price">Próximamente</p>
            <ul className="ab-modal-plan__features">
              {BASIC_FEATURES.map(f => <li key={f}><span>✓</span>{f}</li>)}
            </ul>
            <button
              className="ab-modal-plan__btn ab-modal-plan__btn--basic"
              onClick={() => handleSelect('basic')}
              disabled={loading !== null}
            >
              {loading === 'basic' ? <><span className="ab-save-spinner" /> Activando...</> : 'Activar Basic →'}
            </button>
          </div>

          {/* Premium */}
          <div className={`ab-modal-plan ab-modal-plan--premium ${currentPlan === 'premium' ? 'ab-modal-plan--current' : ''}`}>
            {currentPlan === 'premium' && <span className="ab-modal-current-badge ab-modal-current-badge--premium">Plan actual</span>}
            <h3 className="ab-modal-plan__name ab-modal-plan__name--premium">Premium</h3>
            <p className="ab-modal-plan__price">Próximamente</p>
            <ul className="ab-modal-plan__features ab-modal-plan__features--premium">
              {PREMIUM_FEATURES.map(f => <li key={f}><span>✓</span>{f}</li>)}
            </ul>
            <button
              className="ab-modal-plan__btn ab-modal-plan__btn--premium"
              onClick={() => handleSelect('premium')}
              disabled={loading !== null}
            >
              {loading === 'premium' ? <><span className="ab-save-spinner" /> Activando...</> : 'Activar Premium →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── SuscripcionSection ──────────────────────────────────── */
function SuscripcionSection({ user }) {
  const [info, setInfo] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [plan, setPlan] = useState(localStorage.getItem('washflow_plan') ?? 'none');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelToast, setCancelToast] = useState(null);

  useEffect(() => {
    getSuscripcionInfo()
      .then(data => { setInfo(data); setPlan(data.plan_actual); })
      .catch(() => {});
  }, []);

  const handlePlanChanged = (newPlan) => {
    setPlan(newPlan);
    setInfo(prev => prev ? { ...prev, plan_actual: newPlan } : prev);
  };

  const handleCancelPlan = async () => {
    setCancelling(true);
    try {
      await updatePlan('none');
      localStorage.setItem('washflow_plan', 'none');
      setCancelToast('Suscripción cancelada. Tus datos están seguros.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setCancelToast('Error: ' + (err.message || 'No se pudo cancelar'));
      setCancelling(false);
    }
  };

  const planDesc = {
    none: 'Sin acceso a funciones del negocio.',
    basic: 'Órdenes, clientes, gastos, historial y facturación B2B.',
    premium: 'Todo Basic + IA, reportes avanzados, predicciones y segmentación.',
    superadmin: 'Acceso total y global al sistema (Modo SuperAdmin).',
  };

  return (
    <>
      <section className="ab-suscrip-card">
        <div className="ab-suscrip-header">
          <span className="ab-suscrip-icon" aria-hidden="true">📋</span>
          <h2 className="ab-suscrip-title">Plan de Suscripción</h2>
        </div>
        <div className="ab-suscrip-body">
          <div className="ab-suscrip-info">
            {info === null ? (
              <div className="ab-skel" style={{ width: 80, height: 22 }} />
            ) : (
              <span className={`ab-plan-pill ${PLAN_CLASSES[plan] || 'ab-plan-pill--none'}`}>
                {PLAN_LABELS[plan] || plan}
              </span>
            )}
            <p className="ab-suscrip-desc">{planDesc[plan] || ''}</p>
          </div>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <div className="ab-suscrip-actions">
              <button className="ab-suscrip-btn" onClick={() => setShowModal(true)}>
                Ver planes y cambiar suscripción →
              </button>
              {plan !== 'none' && (
                <button
                  className="ab-cancel-plan-btn"
                  onClick={() => setShowCancelConfirm(prev => !prev)}
                >
                  Cancelar suscripción
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {showCancelConfirm && plan !== 'none' && (
        <div className="ab-cancel-confirm">
          {cancelToast ? (
            <p className="ab-cancel-confirm__toast">{cancelToast}</p>
          ) : (
            <>
              <p className="ab-cancel-confirm__title">⚠️ ¿Cancelar tu suscripción?</p>
              <p className="ab-cancel-confirm__body">
                Tu cuenta pasará a modo "Sin suscripción". Todas las funciones quedarán
                bloqueadas hasta que actives un nuevo plan.<br />
                <strong>Tus datos NO se eliminarán.</strong>
              </p>
              <div className="ab-cancel-confirm__actions">
                <button
                  className="ab-cancel-confirm__yes"
                  onClick={handleCancelPlan}
                  disabled={cancelling}
                >
                  {cancelling ? <><span className="ab-save-spinner" /> Cancelando...</> : 'Sí, cancelar'}
                </button>
                <button
                  className="ab-cancel-confirm__no"
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={cancelling}
                >
                  No, mantener plan
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showModal && (
        <PlanModal
          currentPlan={plan}
          onClose={() => setShowModal(false)}
          onChanged={handlePlanChanged}
        />
      )}
    </>
  );
}

/* ── Skeleton row ───────────────────────────────────────── */
function SkeletonRow({ index }) {
  return (
    <tr className="ab-tr ab-tr--skeleton" style={{ animationDelay: `${index * 55}ms` }}>
      <td className="ab-td"><div className="ab-skel ab-skel--short" /></td>
      <td className="ab-td"><div className="ab-skel ab-skel--long" /></td>
      <td className="ab-td ab-td--actions"><div className="ab-skel ab-skel--btn" /></td>
    </tr>
  );
}

/* ── AbreviacionesSection ───────────────────────────────── */
function AbreviacionesSection() {
  const [saved, setSaved]           = useState({});
  const [local, setLocal]           = useState({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const [editingKey, setEditingKey]       = useState(null);
  const [editAbrev, setEditAbrev]         = useState('');
  const [editExpansion, setEditExpansion] = useState('');
  const [editError, setEditError]         = useState('');

  const [deletingKey, setDeletingKey]   = useState(null);
  const [search, setSearch]             = useState('');
  const [previewInput, setPreviewInput] = useState('');

  const abrevInputRef     = useRef(null);
  const expansionInputRef = useRef(null);

  const isDirty = JSON.stringify(saved) !== JSON.stringify(local);

  const [isExpanded, setIsExpanded] = useState(false);

  /* ── Load ───────────────────────────────────────────────── */
  useEffect(() => {
    api.get('/settings/abreviaciones')
      .then(data => {
        const abbrevs = data.abreviaciones || {};
        setSaved(abbrevs);
        setLocal(abbrevs);
      })
      .catch(() => { setSaved({}); setLocal({}); })
      .finally(() => setLoading(false));
  }, []);

  /* ── ESC cancels edit ───────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') cancelEdit(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  /* ── Derived ─────────────────────────────────────────────── */
  const allEntries = Object.entries(local);
  const filteredEntries = allEntries.filter(([k, v]) =>
    k.includes(search.toLowerCase()) ||
    v.toLowerCase().includes(search.toLowerCase())
  );
  const previewOutput = expandText(previewInput, local);

  /* ── Edit helpers ───────────────────────────────────────── */
  const startEdit = (key) => {
    setEditingKey(key);
    setEditAbrev(key);
    setEditExpansion(local[key] || '');
    setEditError('');
    setTimeout(() => expansionInputRef.current?.focus(), 30);
  };

  const startNew = () => {
    setEditingKey('__new__');
    setEditAbrev('');
    setEditExpansion('');
    setEditError('');
    setTimeout(() => abrevInputRef.current?.focus(), 30);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditAbrev('');
    setEditExpansion('');
    setEditError('');
  };

  const confirmEdit = () => {
    const key = editAbrev.trim().toLowerCase();
    const val = editExpansion.trim();
    if (!key)            { setEditError('La abreviación no puede estar vacía'); return; }
    if (!val)            { setEditError('La expansión no puede estar vacía'); return; }
    if (key.length > 10) { setEditError('Máx. 10 caracteres para la abreviación'); return; }
    if (val.length > 50) { setEditError('Máx. 50 caracteres para la expansión'); return; }

    setLocal(prev => {
      const next = { ...prev };
      if (editingKey !== '__new__' && editingKey !== key) delete next[editingKey];
      next[key] = val;
      return next;
    });
    cancelEdit();
  };

  const confirmDelete = (key) => {
    setLocal(prev => { const n = { ...prev }; delete n[key]; return n; });
    setDeletingKey(null);
  };

  /* ── Save ────────────────────────────────────────────────── */
  const handleSave = async (e) => {
    e.stopPropagation(); // Prevents collapse when clicking save
    if (!isDirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.put('/settings/abreviaciones', { abreviaciones: local });
      setSaved({ ...local });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      setSaveError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const loadDefaults = () => {
    setLocal(DEFAULT_ABREVIACIONES);
    cancelEdit();
    setDeletingKey(null);
  };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section className={`ab-card${savedFlash ? ' ab-card--flash' : ''}`}>

      {/* Header */}
      <div 
        className="ab-card-header ab-card-header--collapsible" 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        <div className="ab-card-header__left">
          <h2 className="ab-card-title">
            <span className="ab-card-title__icon" aria-hidden="true">⚡</span>
            Abreviaciones de Texto
            {isDirty && (
              <span className="ab-dirty-dot" title="Cambios sin guardar" aria-label="Cambios sin guardar" />
            )}
          </h2>
          <p className="ab-card-subtitle">
            Escribe menos, describe más rápido en Nueva Orden
          </p>
        </div>
        <div className="ab-card-header__right">
          {isDirty && <span className="ab-unsaved-badge">Cambios sin guardar</span>}
          <button
            className={`ab-save-btn${isDirty ? ' ab-save-btn--dirty' : ''}`}
            onClick={handleSave}
            disabled={!isDirty || saving}
            aria-label="Guardar cambios"
          >
            {saving
              ? <><span className="ab-save-spinner" aria-hidden="true" /> Guardando…</>
              : <>{savedFlash ? '✅' : '💾'} Guardar cambios</>
            }
          </button>
          <span className={`ab-collapse-toggle ${isExpanded ? 'ab-collapse-toggle--expanded' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      <div className={`ab-card-content ${!isExpanded ? 'ab-card-content--collapsed' : ''}`}>

      {/* Error banner */}
      {saveError && (
        <div className="ab-error-banner" role="alert">
          <span>⚠️ {saveError}</span>
          <button
            className="ab-error-dismiss"
            onClick={() => setSaveError(null)}
            aria-label="Cerrar mensaje de error"
          >✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="ab-toolbar">
        <div className="ab-search-wrap">
          <span className="ab-search-icon" aria-hidden="true">🔍</span>
          <input
            className="ab-search-input"
            type="text"
            placeholder="Buscar abreviación..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Buscar abreviación"
          />
          {search && (
            <span className="ab-search-count" aria-live="polite">
              {filteredEntries.length} de {allEntries.length}
            </span>
          )}
        </div>
        <button
          className="ab-new-btn"
          onClick={startNew}
          disabled={editingKey !== null}
          aria-label="Agregar nueva abreviación"
        >
          + Nueva
        </button>
      </div>

      {/* Table */}
      <div className="ab-table-wrap">
        <table className="ab-table" aria-label="Abreviaciones de texto">
          <thead>
            <tr className="ab-thead-row">
              <th className="ab-th ab-th--key">Abrev.</th>
              <th className="ab-th ab-th--val">Se expande a</th>
              <th className="ab-th ab-th--actions">Acciones</th>
            </tr>
          </thead>
          <tbody>

            {/* New row at top */}
            {editingKey === '__new__' && (
              <tr className="ab-tr ab-tr--new">
                <td className="ab-td">
                  <input
                    ref={abrevInputRef}
                    className="ab-inline-input ab-inline-input--key"
                    type="text"
                    value={editAbrev}
                    maxLength={10}
                    placeholder="ca"
                    onChange={e => setEditAbrev(e.target.value.toLowerCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); expansionInputRef.current?.focus(); }
                    }}
                    aria-label="Nueva abreviación"
                  />
                </td>
                <td className="ab-td">
                  <input
                    ref={expansionInputRef}
                    className="ab-inline-input ab-inline-input--val"
                    type="text"
                    value={editExpansion}
                    maxLength={50}
                    placeholder="camisa"
                    onChange={e => setEditExpansion(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                    }}
                    aria-label="Expansión de la abreviación"
                  />
                </td>
                <td className="ab-td ab-td--actions">
                  <div className="ab-actions-wrap">
                    {editError && <span className="ab-inline-error">{editError}</span>}
                    <button className="ab-action-btn ab-action-btn--ok" onClick={confirmEdit} title="Confirmar">✅</button>
                    <button className="ab-action-btn ab-action-btn--x"  onClick={cancelEdit}  title="Cancelar">✗</button>
                  </div>
                </td>
              </tr>
            )}

            {/* Loading skeletons */}
            {loading && Array.from({ length: 7 }).map((_, i) => (
              <SkeletonRow key={i} index={i} />
            ))}

            {/* Empty state */}
            {!loading && allEntries.length === 0 && editingKey !== '__new__' && (
              <tr>
                <td colSpan={3} className="ab-empty-cell">
                  <div className="ab-empty-state">
                    <span className="ab-empty-icon" aria-hidden="true">⚡</span>
                    <p className="ab-empty-text">No hay abreviaciones configuradas</p>
                    <button className="ab-defaults-btn" onClick={loadDefaults}>
                      📥 Cargar abreviaciones sugeridas
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading && filteredEntries.map(([key, value]) => {
              const isEditing  = editingKey === key;
              const isDeleting = deletingKey === key;

              return (
                <tr
                  key={key}
                  className={`ab-tr${isEditing ? ' ab-tr--editing' : ''}${isDeleting ? ' ab-tr--deleting' : ''}`}
                >
                  <td className="ab-td ab-td--key">
                    {isEditing ? (
                      <input
                        ref={abrevInputRef}
                        className="ab-inline-input ab-inline-input--key"
                        type="text"
                        value={editAbrev}
                        maxLength={10}
                        onChange={e => setEditAbrev(e.target.value.toLowerCase())}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); expansionInputRef.current?.focus(); }
                        }}
                        aria-label="Abreviación"
                      />
                    ) : (
                      <code className="ab-key-pill">{key}</code>
                    )}
                  </td>
                  <td className="ab-td ab-td--val">
                    {isEditing ? (
                      <input
                        ref={expansionInputRef}
                        className="ab-inline-input ab-inline-input--val"
                        type="text"
                        value={editExpansion}
                        maxLength={50}
                        onChange={e => setEditExpansion(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                        }}
                        aria-label="Expansión"
                      />
                    ) : (
                      <span className="ab-val-text">{value}</span>
                    )}
                  </td>
                  <td className="ab-td ab-td--actions">
                    {isEditing ? (
                      <div className="ab-actions-wrap">
                        {editError && <span className="ab-inline-error">{editError}</span>}
                        <button className="ab-action-btn ab-action-btn--ok" onClick={confirmEdit} title="Confirmar">✅</button>
                        <button className="ab-action-btn ab-action-btn--x"  onClick={cancelEdit}  title="Cancelar">✗</button>
                      </div>
                    ) : isDeleting ? (
                      <div className="ab-delete-confirm">
                        <span className="ab-delete-label">¿Eliminar?</span>
                        <button
                          className="ab-action-btn ab-action-btn--del-yes"
                          onClick={() => confirmDelete(key)}
                        >Sí</button>
                        <button
                          className="ab-action-btn ab-action-btn--del-no"
                          onClick={() => setDeletingKey(null)}
                        >No</button>
                      </div>
                    ) : (
                      <div className="ab-actions-wrap">
                        <button
                          className="ab-action-btn ab-action-btn--edit"
                          onClick={() => { setDeletingKey(null); startEdit(key); }}
                          disabled={editingKey !== null}
                          title="Editar"
                          aria-label={`Editar abreviación ${key}`}
                        >✏️</button>
                        <button
                          className="ab-action-btn ab-action-btn--trash"
                          onClick={() => { cancelEdit(); setDeletingKey(key); }}
                          title="Eliminar"
                          aria-label={`Eliminar abreviación ${key}`}
                        >🗑️</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      {/* Footer */}
      {!loading && allEntries.length > 0 && (
        <div className="ab-table-footer">
          <span className="ab-total-label">Total: {allEntries.length} abreviaciones</span>
          <button className="ab-defaults-link" onClick={loadDefaults}>
            📥 Cargar sugeridas
          </button>
        </div>
      )}

      {/* Live preview */}
      <div className="ab-preview">
        <div className="ab-preview__header">
          <span aria-hidden="true">🧪</span>
          <span className="ab-preview__title">Probar expansión</span>
        </div>
        <div className="ab-preview__body">
          <div className="ab-preview__row">
            <label className="ab-preview__label" htmlFor="ab-preview-input">
              Escribe algo:
            </label>
            <input
              id="ab-preview-input"
              className="ab-preview__input"
              type="text"
              placeholder="ca az y pa ne"
              value={previewInput}
              onChange={e => setPreviewInput(e.target.value)}
              aria-label="Texto de prueba para expansión"
            />
          </div>
          <div className="ab-preview__row">
            <label className="ab-preview__label">Resultado:</label>
            <span
              className={`ab-preview__result${
                previewInput && previewOutput !== previewInput
                  ? ' ab-preview__result--changed'
                  : ''
              }`}
              aria-live="polite"
            >
              {previewInput
                ? previewOutput
                : <span className="ab-preview__placeholder">se actualiza en tiempo real</span>
              }
            </span>
          </div>
        </div>
      </div>

      </div>
    </section>
  );
}

/* ── BusinessInfoSection ────────────────────────────────── */
function BusinessInfoSection() {
  const [data, setData] = useState({
    business_name: '',
    business_address: '',
    business_phone: '',
    business_logo: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/settings/business')
      .then(res => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/settings/business', data);
      setData(res);
      showToast('Información guardada correctamente');
    } catch (err) {
      showToast(err.message || 'Error al guardar', false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <section className="ab-card">
      <div className="ab-card-header">
        <div className="ab-card-header__left">
          <h2 className="ab-card-title">
            <span className="ab-card-title__icon" aria-hidden="true">🏢</span>
            Información del Negocio
          </h2>
          <p className="ab-card-subtitle">Datos que aparecerán en la factura de impresión térmica</p>
        </div>
        <button 
          className={`ab-save-btn ab-save-btn--dirty`} 
          onClick={handleSave} 
          disabled={saving}
        >
          {saving ? <><span className="ab-save-spinner" /> Guardando...</> : '💾 Guardar Cambios'}
        </button>
      </div>

      {toast && (
        <div className={`ab-toast ${toast.ok ? 'ab-toast--ok' : 'ab-toast--err'}`} style={{ margin: '10px 20px' }}>
          {toast.msg}
        </div>
      )}

      <div className="ab-card-content" style={{ padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="ab-preview__row">
            <label className="ab-preview__label">Nombre del Negocio:</label>
            <input 
              className="ab-preview__input" 
              type="text" 
              value={data.business_name} 
              onChange={e => setData(d => ({ ...d, business_name: e.target.value }))}
              placeholder="Ej: LAVALATU"
            />
          </div>
          <div className="ab-preview__row">
            <label className="ab-preview__label">Teléfono / Domicilios:</label>
            <input 
              className="ab-preview__input" 
              type="text" 
              value={data.business_phone} 
              onChange={e => setData(d => ({ ...d, business_phone: e.target.value }))}
              placeholder="Ej: 310 669 7376"
            />
          </div>
          <div className="ab-preview__row" style={{ gridColumn: 'span 2' }}>
            <label className="ab-preview__label">Dirección:</label>
            <input 
              className="ab-preview__input" 
              type="text" 
              value={data.business_address} 
              onChange={e => setData(d => ({ ...d, business_address: e.target.value }))}
              placeholder="Ej: Calle 163a #14b-25"
            />
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '15px', background: 'var(--background)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', marginBottom: '10px' }}>
            <strong>Nota sobre la impresora:</strong> El navegador utilizará la impresora configurada por defecto en tu sistema operativo. Asegúrate de que tu impresora térmica de 80mm esté seleccionada como predeterminada o elígela en el diálogo de impresión.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── PerfilNegocioSection ────────────────────────────────── */
const LS_KEY = 'washflow_negocio_config';

function PerfilNegocioSection() {
  const [config, setConfig] = useState({
    nombre: '', slogan: '', direccion: '',
    telefono: '', nit: '', mensaje_pie: '¡GRACIAS POR TU PREFERENCIA!',
    logo_base64: null,
  });
  const [saving, setSaving]         = useState(false);
  const [dirty, setDirty]           = useState(false);
  const [toast, setToast]           = useState(null);
  const [logoFilename, setLogoFilename] = useState(null);
  const fileInputRef = useRef(null);

  /* Load: localStorage first (instant), then API (fresh) */
  useEffect(() => {
    try {
      const cached = localStorage.getItem(LS_KEY);
      if (cached) setConfig(JSON.parse(cached));
    } catch {}

    getNegocioConfig()
      .then(data => {
        setConfig(data);
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      })
      .catch(() => {});
  }, []);

  const update = (key, val) => {
    setConfig(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('❌ Solo se aceptan imágenes PNG, JPEG o WebP', false);
      e.target.value = '';
      return;
    }
    if (file.size > 500 * 1024) {
      showToast('❌ El logo es muy grande. Máximo 500KB.', false);
      e.target.value = '';
      return;
    }
    setLogoFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => update('logo_base64', ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await updateNegocioConfig(config);
      localStorage.setItem(LS_KEY, JSON.stringify(config));
      setDirty(false);
      showToast('✅ Perfil del negocio guardado');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('500KB') || msg.toLowerCase().includes('logo')) {
        showToast('❌ Logo demasiado grande. Máximo 500KB', false);
      } else {
        showToast('❌ ' + (msg || 'Error al guardar'), false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ab-card pn-card">
      {/* Header */}
      <div className="ab-card-header">
        <div className="ab-card-header__left">
          <h2 className="ab-card-title">
            <span className="ab-card-title__icon" aria-hidden="true">🏪</span>
            Perfil del Negocio
            {dirty && <span className="ab-dirty-dot" title="Cambios sin guardar" />}
          </h2>
          <p className="ab-card-subtitle">Información que aparece en los recibos impresos</p>
        </div>
        <div className="ab-card-header__right">
          {dirty && <span className="ab-unsaved-badge">Cambios sin guardar</span>}
          <button
            className={`ab-save-btn${dirty ? ' ab-save-btn--dirty' : ''}`}
            onClick={handleSave}
            disabled={!dirty || saving}
            aria-label="Guardar perfil del negocio"
          >
            {saving
              ? <><span className="ab-save-spinner" aria-hidden="true" /> Guardando...</>
              : '💾 Guardar'
            }
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`ab-toast ${toast.ok ? 'ab-toast--ok' : 'ab-toast--err'}`} style={{ margin: '10px 24px 0' }}>
          {toast.msg}
        </div>
      )}

      {/* Body: form + receipt preview */}
      <div className="pn-body">

        {/* ── Form ── */}
        <div className="pn-form">

          {/* Top row: logo + right fields */}
          <div className="pn-top-row">

            {/* Logo box */}
            <div className="pn-logo-area">
              <div
                className={`pn-logo-box${config.logo_base64 ? ' pn-logo-box--filled' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                title="Clic para subir logo"
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                {config.logo_base64
                  ? <img src={config.logo_base64} alt="Logo del negocio" className="pn-logo-img" />
                  : <span className="pn-logo-placeholder">Sin logo</span>
                }
              </div>
              <div className="pn-logo-btns">
                <button className="pn-logo-btn" onClick={() => fileInputRef.current?.click()}>
                  📁 Subir logo
                </button>
                {config.logo_base64 && (
                  <button
                    className="pn-logo-btn pn-logo-btn--remove"
                    onClick={() => { update('logo_base64', null); setLogoFilename(null); }}
                  >
                    🗑 Quitar
                  </button>
                )}
                {logoFilename && <span className="pn-logo-filename">{logoFilename}</span>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoChange}
                aria-label="Subir logo del negocio"
              />
            </div>

            {/* Right: nombre, slogan, nit */}
            <div className="pn-top-fields">
              <div className="pn-field">
                <label className="pn-label" htmlFor="pn-nombre">Nombre del negocio *</label>
                <input
                  id="pn-nombre"
                  className="pn-input"
                  type="text"
                  value={config.nombre}
                  onChange={e => update('nombre', e.target.value)}
                  placeholder="Ej: LAVALATU"
                />
              </div>
              <div className="pn-field">
                <label className="pn-label" htmlFor="pn-slogan">Slogan</label>
                <input
                  id="pn-slogan"
                  className="pn-input"
                  type="text"
                  value={config.slogan}
                  onChange={e => update('slogan', e.target.value)}
                  placeholder="Ej: SI NO TIENES TIEMPO, NOSOTROS LO HACEMOS"
                />
              </div>
              <div className="pn-field">
                <label className="pn-label" htmlFor="pn-nit">NIT</label>
                <input
                  id="pn-nit"
                  className="pn-input"
                  type="text"
                  value={config.nit}
                  onChange={e => update('nit', e.target.value)}
                  placeholder="Ej: 900.123.456-7"
                />
              </div>
            </div>
          </div>

          {/* Bottom fields: full width */}
          <div className="pn-bottom-fields">
            <div className="pn-field">
              <label className="pn-label" htmlFor="pn-dir">Dirección</label>
              <input
                id="pn-dir"
                className="pn-input"
                type="text"
                value={config.direccion}
                onChange={e => update('direccion', e.target.value)}
                placeholder="Ej: Calle 163a #14b-25, Bogotá"
              />
            </div>
            <div className="pn-field">
              <label className="pn-label" htmlFor="pn-tel">Teléfono / WhatsApp</label>
              <input
                id="pn-tel"
                className="pn-input"
                type="text"
                value={config.telefono}
                onChange={e => update('telefono', e.target.value)}
                placeholder="Ej: 310 669 7376"
              />
            </div>
            <div className="pn-field">
              <label className="pn-label" htmlFor="pn-pie">Mensaje pie de recibo</label>
              <input
                id="pn-pie"
                className="pn-input"
                type="text"
                value={config.mensaje_pie}
                onChange={e => update('mensaje_pie', e.target.value)}
                placeholder="¡GRACIAS POR TU PREFERENCIA!"
              />
            </div>
          </div>
        </div>

        {/* ── Receipt preview ── */}
        <div className="pn-preview-wrap">
          <div className="pn-preview-label">VISTA PREVIA DEL RECIBO</div>
          <div className="pn-receipt" aria-label="Vista previa del recibo térmico">
            {config.logo_base64 && (
              <div className="pn-receipt__logo">
                <img src={config.logo_base64} alt="Logo" style={{ maxWidth: 120, maxHeight: 70, objectFit: 'contain' }} />
              </div>
            )}
            <div className="pn-receipt__name">{config.nombre || 'NOMBRE DEL NEGOCIO'}</div>
            {config.slogan && <div className="pn-receipt__slogan">{config.slogan}</div>}
            <div className="pn-receipt__sep" aria-hidden="true">{'─'.repeat(30)}</div>
            {config.direccion && <div className="pn-receipt__line">{config.direccion}</div>}
            {config.telefono && <div className="pn-receipt__line">Tel: {config.telefono}</div>}
            {config.nit && <div className="pn-receipt__line">NIT: {config.nit}</div>}
            <div className="pn-receipt__sep" aria-hidden="true">{'─'.repeat(30)}</div>
            <div className="pn-receipt__footer">{config.mensaje_pie || '¡GRACIAS POR TU PREFERENCIA!'}</div>
          </div>
        </div>

      </div>
    </section>
  );
}

/* ── PrinterSection ──────────────────────────────────────── */

function PrinterSection() {
  const [printerSupported, setPrinterSupported] = useState(false);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [portInfo, setPortInfo]     = useState(null);
  const [testingPrint, setTestingPrint] = useState(false);
  const [toast, setToast]           = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setPrinterSupported(isWebSerialSupported());
    const info = getPrinterPortInfo();
    setPortInfo(info);
    setPrinterConfigured(!!info?.configured);
    // Verify port still available (unplugged since last visit)
    if (info?.configured) {
      isPrintAvailable().then(available => {
        if (!available) setPrinterConfigured(false);
      });
    }
  }, []);

  const handleSelectPort = async () => {
    const ok = await requestPrinterPort();
    if (ok) {
      const info = getPrinterPortInfo();
      setPortInfo(info);
      setPrinterConfigured(true);
      showToast('✅ Impresora configurada correctamente');
    }
  };

  const handleTestPrint = async () => {
    setTestingPrint(true);
    let negocioConfig = null;
    try { negocioConfig = JSON.parse(localStorage.getItem('washflow_negocio_config')); } catch {}
    const result = await printTest(negocioConfig);
    setTestingPrint(false);
    if (result.success) {
      showToast('✅ Recibo de prueba impreso correctamente');
    } else {
      showToast(`❌ Error: ${result.reason}. Verifica que la impresora esté encendida.`, false);
    }
  };

  const handleClearPort = () => {
    clearPrinterPort();
    setPortInfo(null);
    setPrinterConfigured(false);
    showToast('Configuración de impresora eliminada');
  };

  const configuredDate = portInfo?.configuredAt
    ? new Date(portInfo.configuredAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <section className="ab-card pt-card">
      <div className="ab-card-header">
        <div className="ab-card-header__left">
          <h2 className="ab-card-title">
            <span className="ab-card-title__icon" aria-hidden="true">🖨️</span>
            Impresora Térmica
          </h2>
          <p className="ab-card-subtitle">Impresión directa via USB · Sin instalación</p>
        </div>
        <div className="pt-status-badge">
          <span className={`pt-dot${printerConfigured ? ' pt-dot--on pt-dot--pulse' : ' pt-dot--off'}`} />
          <span className="pt-status-label">
            {printerConfigured ? 'Configurada' : 'Sin configurar'}
          </span>
        </div>
      </div>

      {toast && (
        <div className={`ab-toast ${toast.ok ? 'ab-toast--ok' : 'ab-toast--err'}`} style={{ margin: '10px 24px 0' }}>
          {toast.msg}
        </div>
      )}

      <div className="pt-body">
        {!printerSupported ? (
          <div className="pt-offline-msg">
            <p className="pt-offline-msg__title">⚠️ Tu navegador no soporta impresión directa</p>
            <p className="pt-offline-msg__steps">Usa Chrome o Edge para activar esta función.</p>
            <div className="pt-offline-actions" style={{ marginTop: 12 }}>
              <a
                href="https://www.google.com/chrome/"
                target="_blank"
                rel="noopener noreferrer"
                className="pt-download-btn"
              >
                Descargar Chrome →
              </a>
            </div>
          </div>
        ) : printerConfigured ? (
          <>
            <p className="pt-online-label">Puerto USB seleccionado</p>
            {configuredDate && (
              <p className="pt-windows-hint">Configurada el: {configuredDate}</p>
            )}
            <button
              className="pt-test-btn"
              onClick={handleTestPrint}
              disabled={testingPrint}
            >
              {testingPrint
                ? <><span className="ab-save-spinner" /> Imprimiendo...</>
                : '🖨️ Imprimir recibo de prueba'
              }
            </button>
            <button className="pt-test-btn pt-test-btn--secondary" onClick={handleSelectPort}>
              🔌 Cambiar impresora
            </button>
            <button className="pt-clear-btn" onClick={handleClearPort}>
              ✕ Quitar configuración
            </button>
          </>
        ) : (
          <div className="pt-offline-msg">
            <p className="pt-offline-msg__steps">
              Conecta tu impresora por USB y haz clic en <strong>Seleccionar Impresora</strong> para configurarla.
              Chrome pedirá permiso una sola vez.
            </p>
            <div className="pt-offline-actions" style={{ marginTop: 12 }}>
              <button className="pt-select-port-btn" onClick={handleSelectPort}>
                🔌 Seleccionar Impresora
              </button>
            </div>
            <p className="pt-windows-hint" style={{ marginTop: 10 }}>
              ℹ️ Solo necesitas hacer esto una vez. La configuración se guarda automáticamente.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function Configuracion({ user }) {
  const canEdit = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <div className="ab-page">
      <div className="ab-page-header">
        <h1 className="ab-page-title">Configuración</h1>
        <p className="ab-page-subtitle">Personaliza tu espacio de trabajo</p>
      </div>

      {canEdit && <PerfilNegocioSection />}
      {canEdit && <PrinterSection />}

      <SuscripcionSection user={user} />

      {canEdit
        ? <AbreviacionesSection />
        : (
          <div className="ab-no-access">
            <span className="ab-no-access__icon" aria-hidden="true">🔒</span>
            <p>Necesitas rol de administrador para acceder a esta sección</p>
          </div>
        )
      }
    </div>
  );
}
