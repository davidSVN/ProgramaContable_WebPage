import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getCanales, getCanalesSaldos, createCanal, updateCanal, deleteCanal,
  getTransferencias, createTransferencia, deleteTransferencia,
} from '../../services/canales';
import { getPeriodDates } from '../../services/reportes';
import './CanalesDinero.css';

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtCOP = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const TIPOS_LABEL = {
  efectivo: 'Efectivo',
  billetera_digital: 'Billetera Digital',
  banco: 'Banco',
  otro: 'Otro',
};

const PRESET_COLORS = ['#4CAF50','#7F77DD','#C62828','#185FA5','#FF6B2B','#1D9E75','#F57F17','#888780'];

// ── useCountUp ─────────────────────────────────────────────────────────────────

function useCountUp(target, ms = 700) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const t = Number(target) || 0;
    const start = performance.now();
    cancelAnimationFrame(ref.current);
    const tick = (now) => {
      const p = Math.min((now - start) / ms, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(ease * t);
      if (p < 1) ref.current = requestAnimationFrame(tick);
      else setVal(t);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target, ms]);
  return val;
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skel({ w = '100%', h = 16, r = 6 }) {
  return <span className="cd-skel" style={{ width: w, height: h, borderRadius: r }} />;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, add };
}

// ── Canal Card ─────────────────────────────────────────────────────────────────

function CanalCard({ saldo, onEdit, isAdmin, loading }) {
  const animSaldoReal = useCountUp(saldo?.saldo_real ?? 0);

  if (loading) {
    return (
      <div className="cd-canal-card">
        <Skel w="60%" h={18} r={4} />
        <Skel w="80%" h={32} r={6} style={{ margin: '12px 0 8px' }} />
        <Skel w="100%" h={13} r={4} />
        <Skel w="90%" h={13} r={4} style={{ marginTop: 4 }} />
      </div>
    );
  }

  return (
    <div className="cd-canal-card" style={{ '--canal-color': saldo.color }}>
      <div className="cd-canal-header">
        <span className="cd-canal-emoji">{saldo.emoji}</span>
        <span className="cd-canal-name">{saldo.canal}</span>
        {isAdmin && (
          <button className="cd-canal-edit-btn" onClick={() => onEdit(saldo)} title="Editar canal">
            <PencilIcon />
          </button>
        )}
      </div>

      <div className="cd-canal-saldo" style={{ color: saldo.saldo_real > 0 ? saldo.color : '#9B9790' }}>
        {fmtCOP(animSaldoReal)}
      </div>

      <div className="cd-canal-breakdown">
        <span className="cd-breakdown-item cd-breakdown-income">
          <ArrowDownIcon /> {fmtCOP(saldo.saldo_bruto)}
          <span className="cd-breakdown-label">ingresos</span>
        </span>
        {saldo.egresos > 0 && (
          <span className="cd-breakdown-item cd-breakdown-out">
            <ArrowUpIcon /> {fmtCOP(saldo.egresos)}
            <span className="cd-breakdown-label">egresos</span>
          </span>
        )}
        {saldo.transferencias_in > 0 && (
          <span className="cd-breakdown-item cd-breakdown-income">
            <ArrowDownIcon /> {fmtCOP(saldo.transferencias_in)}
            <span className="cd-breakdown-label">recibido</span>
          </span>
        )}
        {saldo.transferencias_out > 0 && (
          <span className="cd-breakdown-item cd-breakdown-out">
            <ArrowUpIcon /> {fmtCOP(saldo.transferencias_out)}
            <span className="cd-breakdown-label">enviado</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Transfer Modal ─────────────────────────────────────────────────────────────

function TransferModal({ canales, onClose, onSuccess }) {
  const [form, setForm] = useState({
    canal_origen: canales[0]?.nombre ?? '',
    canal_destino: canales[1]?.nombre ?? '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    notas: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sameCanal = form.canal_origen && form.canal_origen === form.canal_destino;
  const montoNum = parseFloat(form.monto.replace(/[^0-9.]/g, '')) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sameCanal) { setError('El origen y destino no pueden ser iguales'); return; }
    if (montoNum <= 0) { setError('El monto debe ser mayor a 0'); return; }
    setError('');
    setSubmitting(true);
    try {
      await createTransferencia({
        canal_origen: form.canal_origen,
        canal_destino: form.canal_destino,
        monto: montoNum,
        fecha: form.fecha ? new Date(form.fecha).toISOString() : undefined,
        notas: form.notas || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al registrar transferencia');
    } finally {
      setSubmitting(false);
    }
  };

  const origenInfo = canales.find(c => c.canal === form.canal_origen);
  const destinoInfo = canales.find(c => c.canal === form.canal_destino);

  return (
    <div className="cd-modal-backdrop" onClick={onClose}>
      <div className="cd-modal" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-header">
          <span className="cd-modal-title">↔ Registrar Transferencia</span>
          <button className="cd-modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="cd-modal-form" onSubmit={handleSubmit}>
          <div className="cd-modal-row">
            <label className="cd-label">Desde</label>
            <select className="cd-select" value={form.canal_origen} onChange={e => set('canal_origen', e.target.value)}>
              {canales.map(c => (
                <option key={c.canal} value={c.canal}>{c.emoji} {c.canal}</option>
              ))}
            </select>
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Hacia</label>
            <select className="cd-select" value={form.canal_destino} onChange={e => set('canal_destino', e.target.value)}>
              {canales.map(c => (
                <option key={c.canal} value={c.canal}>{c.emoji} {c.canal}</option>
              ))}
            </select>
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Monto</label>
            <input
              className="cd-input"
              type="number"
              min="1"
              step="100"
              placeholder="0"
              value={form.monto}
              onChange={e => set('monto', e.target.value)}
              required
            />
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Fecha</label>
            <input
              className="cd-input"
              type="date"
              value={form.fecha}
              onChange={e => set('fecha', e.target.value)}
            />
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Notas</label>
            <input
              className="cd-input"
              type="text"
              placeholder="opcional"
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
            />
          </div>

          {montoNum > 0 && !sameCanal && (
            <div className="cd-transfer-preview">
              <span style={{ color: origenInfo?.color || '#C62828' }}>
                {origenInfo?.emoji} {form.canal_origen} −{fmtCOP(montoNum)}
              </span>
              <span className="cd-preview-arrow">→</span>
              <span style={{ color: destinoInfo?.color || '#4CAF50' }}>
                {destinoInfo?.emoji} {form.canal_destino} +{fmtCOP(montoNum)}
              </span>
            </div>
          )}

          {sameCanal && (
            <p className="cd-modal-error">El origen y destino no pueden ser iguales</p>
          )}
          {error && <p className="cd-modal-error">{error}</p>}

          <button
            type="submit"
            className="cd-modal-submit"
            disabled={submitting || sameCanal || montoNum <= 0}
          >
            {submitting ? 'Registrando…' : 'Registrar Transferencia'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Canal Edit Modal ───────────────────────────────────────────────────────────

function CanalEditModal({ canal, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nombre: canal?.nombre ?? '',
    tipo: canal?.tipo ?? 'otro',
    emoji: canal?.emoji ?? '💰',
    color: canal?.color ?? '#888780',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (canal?.id) {
        await updateCanal(canal.id, form);
      } else {
        await createCanal({ ...form, orden: 99 });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar canal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cd-modal-backdrop" onClick={onClose}>
      <div className="cd-modal cd-modal--sm" onClick={e => e.stopPropagation()}>
        <div className="cd-modal-header">
          <span className="cd-modal-title">{canal?.id ? 'Editar canal' : 'Agregar canal'}</span>
          <button className="cd-modal-close" onClick={onClose}>✕</button>
        </div>
        <form className="cd-modal-form" onSubmit={handleSubmit}>
          <div className="cd-modal-row cd-modal-row--half">
            <div>
              <label className="cd-label">Emoji</label>
              <input className="cd-input cd-input--emoji" type="text" maxLength={2} value={form.emoji} onChange={e => set('emoji', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="cd-label">Nombre</label>
              <input className="cd-input" type="text" required value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Tipo</label>
            <select className="cd-select" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {Object.entries(TIPOS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div className="cd-modal-row">
            <label className="cd-label">Color</label>
            <div className="cd-color-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`cd-color-swatch ${form.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => set('color', c)}
                />
              ))}
            </div>
          </div>

          {error && <p className="cd-modal-error">{error}</p>}

          <button type="submit" className="cd-modal-submit" disabled={submitting}>
            {submitting ? 'Guardando…' : canal?.id ? 'Guardar cambios' : 'Agregar canal'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CanalesDinero({ user }) {
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [periodo, setPeriodo]         = useState('mes');
  const [saldos, setSaldos]           = useState([]);
  const [canalesList, setCanalesList] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [activeTab, setActiveTab]     = useState('transferencias');
  const [loading, setLoading]         = useState(true);
  const [loadingTf, setLoadingTf]     = useState(false);

  // modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editingCanal, setEditingCanal]           = useState(null); // null=closed, {}=new, {id,..}=edit

  // transferencia filter
  const [filtroCanal, setFiltroCanal] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  // delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(null); // transferencia id

  const { toasts, add: addToast } = useToast();

  const fechas = getPeriodDates(periodo);

  // ── Fetchers ──────────────────────────────────────────────────────────────────

  const fetchSaldos = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        getCanalesSaldos(fechas),
        getCanales(),
      ]);
      setSaldos(Array.isArray(s) ? s : []);
      setCanalesList(Array.isArray(c) ? c : []);
    } catch (err) {
      addToast(err.message || 'Error cargando saldos', 'error');
    } finally {
      setLoading(false);
    }
  }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTransferencias = useCallback(async () => {
    setLoadingTf(true);
    try {
      const params = {
        ...(filtroDesde ? { fecha_inicio: filtroDesde } : {}),
        ...(filtroHasta ? { fecha_fin: filtroHasta } : {}),
        ...(filtroCanal ? { canal: filtroCanal } : {}),
      };
      const data = await getTransferencias(params);
      setTransferencias(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(err.message || 'Error cargando transferencias', 'error');
    } finally {
      setLoadingTf(false);
    }
  }, [filtroDesde, filtroHasta, filtroCanal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchSaldos(); }, [fetchSaldos]);
  useEffect(() => { fetchTransferencias(); }, [fetchTransferencias]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleDeleteTransferencia = async (id) => {
    try {
      await deleteTransferencia(id);
      addToast('Transferencia revertida');
      setConfirmDelete(null);
      await Promise.all([fetchSaldos(), fetchTransferencias()]);
    } catch (err) {
      addToast(err.message || 'Error al revertir', 'error');
    }
  };

  const handleDeleteCanal = async (id) => {
    try {
      await deleteCanal(id);
      addToast('Canal desactivado');
      await fetchSaldos();
    } catch (err) {
      addToast(err.message || 'Error al desactivar canal', 'error');
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const totalGeneral = saldos.reduce((s, c) => s + c.saldo_real, 0);
  const animTotal = useCountUp(totalGeneral);

  const canalColorMap = Object.fromEntries(
    saldos.map(s => [s.canal, { color: s.color, emoji: s.emoji }])
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="cd-root">
      {/* Toasts */}
      <div className="cd-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`cd-toast cd-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div className="cd-header">
        <div className="cd-header-left">
          <h1 className="cd-title">💰 Mis Cuentas</h1>
          <p className="cd-subtitle">Seguimiento en tiempo real de tu dinero</p>
        </div>
        <div className="cd-header-right">
          <div className="cd-period-pills">
            {[
              { key: 'mes',       label: 'Este Mes'    },
              { key: 'trimestre', label: 'Trimestre'   },
              { key: 'año',       label: 'Este Año'    },
              { key: 'todo',      label: 'Ver Todo'    },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`cd-period-btn ${periodo === key ? 'active' : ''}`}
                onClick={() => setPeriodo(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button className="cd-add-btn" onClick={() => setShowTransferModal(true)}>
              + Transferencia
            </button>
          )}
        </div>
      </div>

      {/* Canal cards */}
      <div className="cd-cards-grid">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <CanalCard key={i} loading />)
          : saldos.map(s => (
              <CanalCard
                key={s.canal}
                saldo={s}
                isAdmin={isAdmin}
                onEdit={(saldo) => {
                  const canal = canalesList.find(c => c.nombre === saldo.canal);
                  setEditingCanal(canal ?? null);
                }}
              />
            ))
        }
      </div>

      {/* Total bar */}
      <div className="cd-total-bar">
        <span className="cd-total-label">Total en todos los canales</span>
        <span className="cd-total-value">{fmtCOP(animTotal)}</span>
      </div>

      {/* Tabs */}
      <div className="cd-tabs">
        <button
          className={`cd-tab ${activeTab === 'transferencias' ? 'active' : ''}`}
          onClick={() => setActiveTab('transferencias')}
        >
          📋 Transferencias
        </button>
        {isAdmin && (
          <button
            className={`cd-tab ${activeTab === 'gestionar' ? 'active' : ''}`}
            onClick={() => setActiveTab('gestionar')}
          >
            ⚙️ Gestionar canales
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'transferencias' && (
        <div className="cd-card">
          {/* Filters */}
          <div className="cd-tf-filters">
            <select className="cd-select cd-select--sm" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}>
              <option value="">Todos los canales</option>
              {saldos.map(s => (
                <option key={s.canal} value={s.canal}>{s.emoji} {s.canal}</option>
              ))}
            </select>
            <input className="cd-input cd-input--sm" type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} placeholder="Desde" />
            <input className="cd-input cd-input--sm" type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} placeholder="Hasta" />
            {(filtroCanal || filtroDesde || filtroHasta) && (
              <button className="cd-clear-btn" onClick={() => { setFiltroCanal(''); setFiltroDesde(''); setFiltroHasta(''); }}>
                ✕ Limpiar
              </button>
            )}
          </div>

          {/* Table */}
          {loadingTf ? (
            <div className="cd-loading-row">
              {Array.from({ length: 4 }).map((_, i) => <Skel key={i} h={18} r={4} />)}
            </div>
          ) : transferencias.length === 0 ? (
            <div className="cd-empty">Sin transferencias registradas en este período</div>
          ) : (
            <div className="cd-table-wrap">
              <table className="cd-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Desde</th>
                    <th></th>
                    <th>Hacia</th>
                    <th>Monto</th>
                    <th>Notas</th>
                    <th>Registrado por</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {transferencias.map(t => {
                    const origenInfo = canalColorMap[t.canal_origen];
                    const destinoInfo = canalColorMap[t.canal_destino];
                    return (
                      <tr key={t.id}>
                        <td className="cd-td-date">{fmtDate(t.fecha)}</td>
                        <td>
                          <span className="cd-canal-pill" style={{ '--pill-color': origenInfo?.color || '#888780' }}>
                            {origenInfo?.emoji} {t.canal_origen} <span className="cd-arrow-down">↓</span>
                          </span>
                        </td>
                        <td className="cd-td-arrow">→</td>
                        <td>
                          <span className="cd-canal-pill cd-canal-pill--dest" style={{ '--pill-color': destinoInfo?.color || '#888780' }}>
                            {destinoInfo?.emoji} {t.canal_destino} <span className="cd-arrow-up">↑</span>
                          </span>
                        </td>
                        <td className="cd-td-monto" style={{ color: origenInfo?.color || '#FF6B2B' }}>
                          {fmtCOP(t.monto)}
                        </td>
                        <td className="cd-td-notas">{t.notas || '—'}</td>
                        <td className="cd-td-by">{t.registrado_por || '—'}</td>
                        {isAdmin && (
                          <td>
                            {confirmDelete === t.id ? (
                              <span className="cd-confirm-row">
                                <button className="cd-confirm-yes" onClick={() => handleDeleteTransferencia(t.id)}>Sí</button>
                                <button className="cd-confirm-no" onClick={() => setConfirmDelete(null)}>No</button>
                              </span>
                            ) : (
                              <button className="cd-delete-btn" onClick={() => setConfirmDelete(t.id)} title="Revertir transferencia">
                                🗑
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'gestionar' && isAdmin && (
        <div className="cd-card">
          <div className="cd-canales-list">
            {canalesList.filter(c => c.is_active).map(c => (
              <div key={c.id} className="cd-canal-row">
                <span className="cd-canal-row-emoji">{c.emoji}</span>
                <span className="cd-canal-row-name">{c.nombre}</span>
                <span className="cd-canal-row-tipo">{TIPOS_LABEL[c.tipo] || c.tipo}</span>
                <span className="cd-canal-row-dot" style={{ background: c.color }} />
                <div className="cd-canal-row-actions">
                  <button className="cd-icon-btn" onClick={() => setEditingCanal(c)} title="Editar">✏️</button>
                  <button className="cd-icon-btn cd-icon-btn--del" onClick={() => handleDeleteCanal(c.id)} title="Desactivar">🗑</button>
                </div>
              </div>
            ))}
          </div>
          <button className="cd-add-canal-btn" onClick={() => setEditingCanal({})}>
            + Agregar canal
          </button>
        </div>
      )}

      {/* Modals */}
      {showTransferModal && (
        <TransferModal
          canales={saldos}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            addToast('✅ Transferencia registrada');
            fetchSaldos();
            fetchTransferencias();
          }}
        />
      )}

      {editingCanal !== null && (
        <CanalEditModal
          canal={editingCanal?.id ? editingCanal : null}
          onClose={() => setEditingCanal(null)}
          onSuccess={() => {
            addToast(editingCanal?.id ? 'Canal actualizado' : 'Canal agregado');
            fetchSaldos();
          }}
        />
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <polyline points="19 12 12 19 5 12"/>
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5"/>
      <polyline points="5 12 12 5 19 12"/>
    </svg>
  );
}
