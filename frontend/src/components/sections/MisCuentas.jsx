import { useState, useEffect, useCallback } from 'react';
import {
  getMisCuentas, calibrarSaldos, borrarCalibracion,
  crearTransferencia, eliminarTransferencia,
} from '../../services/misCuentas';
import './MisCuentas.css';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmtCOP = (n) =>
  n == null ? '$0' : '$' + Math.round(Number(n)).toLocaleString('es-CO');

const parseCOP = (s) => {
  // acepta "1.234.567" o "1234567" o "1,234,567"
  const clean = String(s).replace(/[^0-9\-]/g, '');
  return clean === '' || clean === '-' ? NaN : parseFloat(clean);
};

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtDate = (raw) => {
  if (!raw) return '—';
  const d = raw.includes('T') ? new Date(raw) : new Date(raw + 'T00:00:00');
  return isNaN(d) ? '—' : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};
const todayStr = () => new Date().toISOString().split('T')[0];

const CHANNEL_ORDER = ['rappipay','nubank','efectivo','nequi','daviplata','transferencia'];
const CHANNEL_LABEL = {
  rappipay: 'Rappi Pay', nubank: 'Nubank', efectivo: 'Efectivo',
  nequi: 'Nequi', daviplata: 'Daviplata', transferencia: 'Transferencia',
};
const CHANNEL_COLOR = {
  rappipay: '#FF6B2B', nubank: '#820AD1', efectivo: '#2B7FFF',
  nequi: '#00C48C', daviplata: '#E53E3E', transferencia: '#6B6560',
};
const channelLabel = (ch) => CHANNEL_LABEL[ch] || ch;
const channelColor = (ch) => CHANNEL_COLOR[ch] || '#9B9790';

const sortChannels = (canales) => {
  const known = CHANNEL_ORDER.filter(c => canales.find(x => x.channel === c));
  const extra = canales.map(x => x.channel).filter(c => !CHANNEL_ORDER.includes(c)).sort();
  return [...known, ...extra].map(c => canales.find(x => x.channel === c)).filter(Boolean);
};

const canEdit = (user) => ['admin', 'superadmin'].includes(user?.role);

/* ── component ────────────────────────────────────────────────────────────── */
export default function MisCuentas({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* calibration */
  const [showCalibracion, setShowCalibracion] = useState(false);
  const [calibForm, setCalibForm] = useState({});   // channel → raw string input
  const [calibSaving, setCalibSaving] = useState(false);
  const [calibError, setCalibError] = useState('');
  const [calibSuccess, setCalibSuccess] = useState(false);

  /* transfer form */
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState({
    from_channel: '', to_channel: '', amount: '', notes: '', transfer_date: todayStr(),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMisCuentas();
      setData(res.data);
    } catch {
      setError('No se pudo cargar la información de cuentas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* When data loads, initialize calibForm with current real balances */
  useEffect(() => {
    if (!data) return;
    const init = {};
    data.canales.forEach(c => {
      init[c.channel] = Math.round(c.saldo).toString();
    });
    // also seed known channels not in data yet
    CHANNEL_ORDER.forEach(ch => {
      if (!(ch in init)) init[ch] = '0';
    });
    setCalibForm(init);
  }, [data]);

  /* ── calibration save ── */
  const handleCalibracion = async (e) => {
    e.preventDefault();
    setCalibError('');
    setCalibSuccess(false);

    const canales = Object.entries(calibForm)
      .map(([channel, raw]) => ({ channel, saldo_real: parseCOP(raw) }))
      .filter(({ saldo_real }) => !isNaN(saldo_real));

    if (canales.length === 0) {
      setCalibError('Ingresa al menos un saldo.');
      return;
    }
    setCalibSaving(true);
    try {
      await calibrarSaldos(canales);
      setCalibSuccess(true);
      await load();
      setTimeout(() => { setShowCalibracion(false); setCalibSuccess(false); }, 1200);
    } catch {
      setCalibError('Error al guardar la calibración.');
    } finally {
      setCalibSaving(false);
    }
  };

  /* ── transfer save ── */
  const handleTransfer = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.from_channel || !form.to_channel) { setFormError('Selecciona canal origen y destino.'); return; }
    if (form.from_channel === form.to_channel) { setFormError('Los canales no pueden ser iguales.'); return; }
    const amount = parseCOP(form.amount);
    if (isNaN(amount) || amount <= 0) { setFormError('El monto debe ser mayor a 0.'); return; }

    setSaving(true);
    try {
      await crearTransferencia({
        from_channel: form.from_channel,
        to_channel: form.to_channel,
        amount,
        notes: form.notes || null,
        transfer_date: form.transfer_date ? `${form.transfer_date}T00:00:00` : null,
      });
      setShowTransfer(false);
      setForm({ from_channel: '', to_channel: '', amount: '', notes: '', transfer_date: todayStr() });
      await load();
    } catch {
      setFormError('Error al guardar la transferencia.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransfer = async (id) => {
    if (!window.confirm('¿Eliminar esta transferencia?')) return;
    try { await eliminarTransferencia(id); await load(); }
    catch { alert('Error al eliminar.'); }
  };

  const allChannels = data
    ? [...new Set([...CHANNEL_ORDER, ...data.canales.map(c => c.channel)])]
    : CHANNEL_ORDER;

  if (loading) return <div className="mc-loading"><div className="mc-spinner" /><p>Cargando cuentas…</p></div>;
  if (error) return <div className="mc-error">{error}<button onClick={load}>Reintentar</button></div>;

  const sorted = sortChannels(data.canales);
  const hasCalibration = data.canales.some(c => c.ajuste !== 0);

  return (
    <div className="mc-wrap">

      {/* ── Header ── */}
      <div className="mc-header">
        <div>
          <h1 className="mc-title">Mis Cuentas</h1>
          <p className="mc-subtitle">Estado actual del dinero por canal · acumulado desde todos los movimientos registrados</p>
        </div>
        {canEdit(user) && (
          <div className="mc-header-actions">
            <button
              className={`mc-btn-outline ${showCalibracion ? 'active' : ''}`}
              onClick={() => { setShowCalibracion(v => !v); setShowTransfer(false); }}
            >
              {hasCalibration ? '⚙ Calibrado' : '⚙ Calibrar saldos'}
            </button>
            <button
              className="mc-btn-primary"
              onClick={() => { setShowTransfer(v => !v); setShowCalibracion(false); }}
            >
              {showTransfer ? 'Cancelar' : '+ Transferencia'}
            </button>
          </div>
        )}
      </div>

      {/* ── Calibration panel ── */}
      {showCalibracion && canEdit(user) && (
        <div className="mc-calibracion-panel">
          <div className="mc-calibracion-header">
            <strong>Calibrar saldos reales</strong>
            <span className="mc-calibracion-hint">
              Ingresa el dinero que tienes actualmente en cada canal. El sistema guardará la diferencia como ajuste y mostrará estos valores como punto de partida.
            </span>
          </div>
          <form className="mc-calibracion-form" onSubmit={handleCalibracion}>
            <div className="mc-calibracion-grid">
              {allChannels.map(ch => (
                <label key={ch} className="mc-calibracion-field">
                  <span className="mc-calibracion-label">
                    <span className="mc-dot" style={{ background: channelColor(ch) }} />
                    {channelLabel(ch)}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={calibForm[ch] ?? '0'}
                    onChange={e => setCalibForm(f => ({ ...f, [ch]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            {calibError && <p className="mc-form-error">{calibError}</p>}
            {calibSuccess && <p className="mc-form-success">✓ Saldos calibrados</p>}
            <div className="mc-calibracion-actions">
              <button className="mc-btn-primary" type="submit" disabled={calibSaving}>
                {calibSaving ? 'Guardando…' : 'Guardar saldos reales'}
              </button>
              <button type="button" className="mc-btn-ghost" onClick={() => setShowCalibracion(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Transfer form ── */}
      {showTransfer && canEdit(user) && (
        <div className="mc-transfer-panel">
          <strong>Registrar movimiento entre canales</strong>
          <p className="mc-calibracion-hint">
            Cuando mueves dinero físicamente de un canal a otro (p.ej. nequi → rappi pay), regístralo aquí para que el saldo sea correcto.
          </p>
          <form className="mc-form" onSubmit={handleTransfer}>
            <div className="mc-form-row">
              <label>
                Desde
                <select value={form.from_channel} onChange={e => setForm(f => ({ ...f, from_channel: e.target.value }))} required>
                  <option value="">— canal origen —</option>
                  {allChannels.map(ch => <option key={ch} value={ch}>{channelLabel(ch)}</option>)}
                </select>
              </label>
              <span className="mc-arrow">→</span>
              <label>
                Hacia
                <select value={form.to_channel} onChange={e => setForm(f => ({ ...f, to_channel: e.target.value }))} required>
                  <option value="">— canal destino —</option>
                  {allChannels.map(ch => <option key={ch} value={ch}>{channelLabel(ch)}</option>)}
                </select>
              </label>
            </div>
            <div className="mc-form-row">
              <label>
                Monto
                <input type="number" min="1" step="1" placeholder="0" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </label>
              <label>
                Fecha
                <input type="date" value={form.transfer_date}
                  onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))} />
              </label>
            </div>
            <label>
              Notas (opcional)
              <input type="text" placeholder="Descripción" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            {formError && <p className="mc-form-error">{formError}</p>}
            <button className="mc-btn-primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        </div>
      )}

      {/* ── Channel cards ── */}
      <section className="mc-section">
        <div className="mc-channels">
          {sorted.length === 0 && <p className="mc-empty">Calibra los saldos para empezar.</p>}
          {sorted.map(c => <ChannelCard key={c.channel} canal={c} />)}
        </div>
      </section>

      {/* ── Summary totals ── */}
      <section className="mc-totals">
        <TotalRow label="Washflow en bancos" value={data.total_saldo} highlight />
        <TotalRow label="+ Órdenes por cobrar" value={data.ordenes_por_cobrar} warn />
        <TotalRow label="= Washflow net income" value={data.washflow_net_income} />
      </section>

      {/* ── Registered transfers ── */}
      {data.transferencias.length > 0 && (
        <section className="mc-section">
          <h2 className="mc-section-title">
            Movimientos internos registrados
            <span className="mc-section-note">Afectan el saldo actual de cada canal</span>
          </h2>
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Desde</th><th>Hacia</th><th>Monto</th><th>Notas</th>
                  {canEdit(user) && <th />}
                </tr>
              </thead>
              <tbody>
                {data.transferencias.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transfer_date)}</td>
                    <td><span className="mc-badge" style={{ '--c': channelColor(t.from_channel) }}>{channelLabel(t.from_channel)}</span></td>
                    <td><span className="mc-badge" style={{ '--c': channelColor(t.to_channel) }}>{channelLabel(t.to_channel)}</span></td>
                    <td className="mc-amount">{fmtCOP(t.amount)}</td>
                    <td className="mc-notes">{t.notes || '—'}</td>
                    {canEdit(user) && (
                      <td><button className="mc-btn-delete" onClick={() => handleDeleteTransfer(t.id)}>✕</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────────── */
function ChannelCard({ canal }) {
  const color = channelColor(canal.channel);
  const saldo = canal.saldo;
  const calibrated = canal.ajuste !== 0;
  return (
    <div className="mc-channel-card" style={{ '--accent': color }}>
      <div className="mc-channel-top">
        <div className="mc-channel-dot" />
        <div className="mc-channel-name">
          {channelLabel(canal.channel)}
          {calibrated && <span className="mc-calibrated-badge">calibrado</span>}
        </div>
      </div>
      <div className={`mc-channel-saldo ${saldo < 0 ? 'negative' : ''}`}>{fmtCOP(saldo)}</div>
      <div className="mc-channel-detail">
        {canal.ingresos > 0 && <span>Ingresos <strong>{fmtCOP(canal.ingresos)}</strong></span>}
        {canal.gastos > 0 && <span>Gastos <strong>{fmtCOP(canal.gastos)}</strong></span>}
        {canal.transferencias_in > 0 && <span>Entradas <strong>{fmtCOP(canal.transferencias_in)}</strong></span>}
        {canal.transferencias_out > 0 && <span>Salidas <strong>{fmtCOP(canal.transferencias_out)}</strong></span>}
      </div>
    </div>
  );
}

function TotalRow({ label, value, highlight, warn }) {
  return (
    <div className={`mc-total-row ${highlight ? 'highlight' : ''} ${warn ? 'warn' : ''}`}>
      <span className="mc-total-label">{label}</span>
      <span className="mc-total-value">{fmtCOP(value)}</span>
    </div>
  );
}
