import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { api } from '../../../services/api';
import {
  getOrdenesB2B,
  getFacturas,
  generarFactura,
  pagarFactura,
  registrarAbono,
} from '../../../services/b2b';
import './B2BOrdenes.css';
import { BlockedAction } from '../../ui/BlockedAction';
import { sendMessage } from '../../../whatsapp/provider';

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

const daysDiff = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
};

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target, ms = 600) {
  const [val, setVal] = useState(0);
  const live = useRef(target);
  useEffect(() => {
    live.current = target;
    if (!target && target !== 0) { setVal(0); return; }
    const abs = Math.abs(target);
    let cur = 0;
    const step = abs / (ms / 16);
    const id = setInterval(() => {
      cur += step;
      if (cur >= abs || live.current !== target) {
        setVal(target);
        clearInterval(id);
      } else {
        setVal(Math.floor(cur) * (target < 0 ? -1 : 1));
      }
    }, 16);
    return () => clearInterval(id);
  }, [target]); // eslint-disable-line
  return val;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ accent, icon, label, value, isCurrency, valueColor, sub }) {
  const animated = useCountUp(value ?? 0);
  const display  = value === null
    ? null
    : isCurrency
      ? fmtCOP(animated)
      : animated.toLocaleString('es-CO');

  return (
    <div className="b2b-kpi" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="b2b-kpi__icon">{icon}</div>
      <div className="b2b-kpi__body">
        <div className="b2b-kpi__label">{label}</div>
        <div className="b2b-kpi__value" style={valueColor ? { color: valueColor } : undefined}>
          {display !== null ? display : <span className="b2b-skeleton-inline" />}
        </div>
        <div className="b2b-kpi__sub">{sub}</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function B2BOrdenes({ user }) {

  // ── Global stats (on mount, no institution needed) ───────────────────────
  const [globalStats, setGlobalStats]   = useState(null);
  const [globalLoading, setGlobalLoading] = useState(true);

  // ── Institution selector ────────────────────────────────────────────────
  const [instituciones, setInstituciones]       = useState([]);
  const [selectedUser, setSelectedUser]         = useState(null);
  const [institucionSearch, setInstitucionSearch] = useState('');

  // ── Data ────────────────────────────────────────────────────────────────
  const [ordenesPendientes, setOrdenesPendientes]   = useState([]);
  const [facturasAll, setFacturasAll]               = useState([]);
  const [facturasPendientes, setFacturasPendientes] = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [kpis, setKpis]                             = useState(null);

  // ── Sección 1: Abono ────────────────────────────────────────────────────
  const [abono, setAbono]             = useState({ amount: '', payment_method: 'Transferencia', notes: '' });
  const [loadingAbono, setLoadingAbono] = useState(false);
  const [errAbono, setErrAbono]       = useState({});

  // ── Sección 2: Pago Factura ─────────────────────────────────────────────
  const [selectedFactura, setSelectedFactura] = useState(null);
  const [pago, setPago]                       = useState({ monto: '', metodo_pago: 'Efectivo' });
  const [loadingPago, setLoadingPago]         = useState(false);
  const [errPago, setErrPago]                 = useState({});

  // ── Sección 3: Consolidar ───────────────────────────────────────────────
  const [selectedOrders, setSelectedOrders]       = useState([]);
  const [notasFactura, setNotasFactura]           = useState('');
  const [loadingConsolidar, setLoadingConsolidar] = useState(false);

  // ── Sección 4: Historial ────────────────────────────────────────────────
  const [soloPendientes, setSoloPendientes]   = useState(false);
  const [expandedFactura, setExpandedFactura] = useState(null);
  const [pagF, setPagF]                       = useState({ page: 1, limit: 10 });

  // ── Toast ───────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }, []);

  // ── On mount: fetch institutions + global stats in parallel ─────────────
  useEffect(() => {
    const fetchMountData = async () => {
      setGlobalLoading(true);
      try {
        const [instData, ordenesData, facturasData] = await Promise.all([
          api.get('/usuarios?user_type=B2B&limit=100'),
          getOrdenesB2B({ limit: 200 }),
          getFacturas({ limit: 500 }),
        ]);
        setInstituciones(Array.isArray(instData) ? instData : []);

        const ordenes  = Array.isArray(ordenesData)  ? ordenesData  : [];
        const facturas = Array.isArray(facturasData) ? facturasData : [];
        const uniqueUsers = new Set(ordenes.map(o => o.user_id));
        setGlobalStats({
          total_instituciones: uniqueUsers.size,
          total_ordenes:       ordenes.length,
          total_ingresos:      ordenes.reduce((s, o) => s + (o.order_value || 0), 0),
          total_debe:          ordenes
            .filter(o => o.state_payment === 'Debe')
            .reduce((s, o) => s + (o.restante || 0), 0),
        });
      } catch (e) {
        console.error('Error fetching mount data:', e);
      } finally {
        setGlobalLoading(false);
      }
    };
    fetchMountData();
  }, []); // eslint-disable-line

  // ── Fetch all data for selected institution ─────────────────────────────
  const fetchUserData = useCallback(async (userId, userObj) => {
    if (!userId) return;
    setLoading(true);
    setSelectedOrders([]);
    setKpis(null);
    try {
      const [ordenesData, facturasData] = await Promise.all([
        getOrdenesB2B({ user_id: userId, estado_pago: 'Debe', limit: 500 }),
        getFacturas({ user_id: userId, limit: 500 }),
      ]);
      const ordenes  = Array.isArray(ordenesData)  ? ordenesData  : [];
      const facturas = Array.isArray(facturasData) ? facturasData : [];
      const facPend  = facturas.filter(f => !f.is_paid);

      setOrdenesPendientes(ordenes);
      setFacturasAll(facturas);
      setFacturasPendientes(facPend);

      const saldo         = userObj?.saldo_a_favor || 0;
      const restanteTotal = ordenes.reduce((s, o) => s + (o.restante || 0), 0);
      const totalPagado   = facturas.reduce((s, f) => s + (f.pagado || 0), 0);
      const sinConsolidar = ordenes.filter(o => !o.consolidated_invoice_id);

      setKpis({
        restanteReal:           restanteTotal - saldo,
        facturasPendientes:     facPend.length,
        serviciosSinConsolidar: sinConsolidar.length,
        totalPagado,
        saldoAFavor:            saldo,
      });
    } catch (e) {
      addToast('Error cargando datos: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setSelectedFactura(null);
    setPago({ monto: '', metodo_pago: 'Efectivo' });
    setAbono({ amount: '', payment_method: 'Transferencia', notes: '' });
    setErrAbono({});
    setErrPago({});
    setNotasFactura('');
    setPagF({ page: 1, limit: 10 });
    setSoloPendientes(false);
    setExpandedFactura(null);
    fetchUserData(u.user_id, u);
  };

  // ── Abono ───────────────────────────────────────────────────────────────
  const handleAbono = async () => {
    const errs = {};
    if (!abono.amount || Number(abono.amount) <= 0) errs.amount = 'Ingresa un monto válido';
    setErrAbono(errs);
    if (Object.keys(errs).length) return;

    setLoadingAbono(true);
    try {
      const res = await registrarAbono({
        user_id:        selectedUser.user_id,
        amount:         Number(abono.amount),
        payment_method: abono.payment_method,
        notes:          abono.notes || undefined,
      });
      addToast(`✅ Abono registrado · Saldo a favor: ${fmtCOP(res.saldo_a_favor_resultante)}`);
      const updatedUser = { ...selectedUser, saldo_a_favor: res.saldo_a_favor_resultante };
      setSelectedUser(updatedUser);
      setAbono({ amount: '', payment_method: 'Transferencia', notes: '' });
      setErrAbono({});
      fetchUserData(updatedUser.user_id, updatedUser);
    } catch (e) {
      addToast('Error al registrar abono: ' + e.message, 'error');
    } finally {
      setLoadingAbono(false);
    }
  };

  // ── Pago Factura ────────────────────────────────────────────────────────
  const handlePagoFactura = async () => {
    const errs = {};
    if (!selectedFactura) errs.factura = 'Selecciona una factura';
    if (pago.metodo_pago !== 'Saldo a Favor' && (!pago.monto || Number(pago.monto) <= 0))
      errs.monto = 'Ingresa un monto válido';
    setErrPago(errs);
    if (Object.keys(errs).length) return;

    setLoadingPago(true);
    try {
      const montoFinal = pago.metodo_pago === 'Saldo a Favor'
        ? selectedFactura.balance_due
        : Number(pago.monto);
      await pagarFactura(selectedFactura.invoice_id, {
        monto:       montoFinal,
        metodo_pago: pago.metodo_pago,
      });
      addToast(`✅ Pago registrado · Factura #${selectedFactura.invoice_id} procesada`);
      setSelectedFactura(null);
      setPago({ monto: '', metodo_pago: 'Efectivo' });
      setErrPago({});
      fetchUserData(selectedUser.user_id, selectedUser);
    } catch (e) {
      addToast('Error al registrar pago: ' + e.message, 'error');
    } finally {
      setLoadingPago(false);
    }
  };

  // ── Generar Factura Consolidada ─────────────────────────────────────────
  const handleConsolidar = async () => {
    if (!selectedOrders.length) return;
    setLoadingConsolidar(true);
    try {
      const res = await generarFactura({
        user_id:   selectedUser.user_id,
        order_ids: selectedOrders,
        notes:     notasFactura || undefined,
      });
      addToast(`✅ Factura #${res.invoice_id} generada · ${selectedOrders.length} órdenes consolidadas`);
      setSelectedOrders([]);
      setNotasFactura('');
      fetchUserData(selectedUser.user_id, selectedUser);
    } catch (e) {
      addToast('Error al generar factura: ' + e.message, 'error');
    } finally {
      setLoadingConsolidar(false);
    }
  };

  // ── WhatsApp Resumen B2B ────────────────────────────────────────────────
  const handleWhatsAppResumen = () => {
    if (!selectedUser) return;
    const phone = selectedUser.user_contact || '';
    if (!phone) { addToast('Esta institución no tiene número de contacto registrado', 'error'); return; }

    const facturasPagas = facturasAll.filter(f => f.is_paid);
    const totalFacturado = facturasAll.reduce((s, f) => s + (f.total_amount || 0), 0);
    const totalPagado    = kpis?.totalPagado ?? 0;
    const saldoAFavor    = selectedUser.saldo_a_favor ?? 0;
    const pendiente      = kpis?.restanteReal ?? 0;

    const parts = [
      `🧾 *Resumen Facturación B2B*`,
      `🏢 *${selectedUser.user_name}*`,
      selectedUser.nit ? `NIT: ${selectedUser.nit}` : null,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `✅ *Facturas Pagadas:* ${facturasPagas.length} de ${facturasAll.length}`,
      `💰 *Total Facturado:* ${fmtCOP(totalFacturado)}`,
      `✔️ *Total Pagado:* ${fmtCOP(totalPagado)}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `💳 *Saldo a Favor:* ${fmtCOP(saldoAFavor)}`,
      `🔴 *Saldo Pendiente:* ${fmtCOP(Math.max(0, pendiente))}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      pendiente > 0
        ? `⚠️ Tienes un saldo pendiente de *${fmtCOP(Math.max(0, pendiente))}*. Por favor comunícate con nosotros para coordinar el pago.`
        : `🎉 ¡Estás al día! Gracias por tu puntualidad.`,
    ];
    const lines = parts.filter(l => l !== null).join('\n');

    sendMessage(phone, lines);
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const ordenesSinConsolidar = ordenesPendientes.filter(o => !o.consolidated_invoice_id);
  const facturasFiltered     = soloPendientes ? facturasAll.filter(f => !f.is_paid) : facturasAll;
  const totalPagesF          = Math.max(1, Math.ceil(facturasFiltered.length / pagF.limit));
  const facturasPage         = facturasFiltered.slice(
    (pagF.page - 1) * pagF.limit,
    pagF.page * pagF.limit,
  );
  const selectedTotal = ordenesSinConsolidar
    .filter(o => selectedOrders.includes(o.order_id))
    .reduce((s, o) => s + (o.order_value || 0), 0);
  const allChecked = ordenesSinConsolidar.length > 0 &&
    ordenesSinConsolidar.every(o => selectedOrders.includes(o.order_id));
  const filteredInstituciones = instituciones.filter(i =>
    i.user_name.toLowerCase().includes(institucionSearch.toLowerCase()) ||
    (i.nit && i.nit.includes(institucionSearch))
  );
  const saldoInsuficiente = pago.metodo_pago === 'Saldo a Favor' && selectedFactura &&
    (selectedUser?.saldo_a_favor || 0) < selectedFactura.balance_due;

  // ── Empleado guard ──────────────────────────────────────────────────────
  if (user?.role === 'empleado') {
    return (
      <div className="b2b-page">
        <div className="b2b-locked">
          <span className="b2b-locked__icon">🔒</span>
          <div className="b2b-locked__title">Sección solo para administradores</div>
          <div className="b2b-locked__sub">Solicita acceso a tu administrador</div>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="b2b-page">

      {/* Toasts */}
      <div className="b2b-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`b2b-toast b2b-toast--${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div className="b2b-header">
        <div>
          <h1 className="b2b-title">Facturación B2B</h1>
          <p className="b2b-subtitle">Gestión de órdenes y facturas institucionales</p>
        </div>
      </div>

      {/* ── Global KPI Bar (always visible) ──────────────────────────── */}
      <div className="b2b-global-kpis">
        <KpiCard
          accent="#185FA5" icon="🏢" label="Instituciones Activas"
          value={globalLoading ? null : globalStats?.total_instituciones ?? 0}
          sub="con órdenes registradas"
        />
        <KpiCard
          accent="#FF6B2B" icon="📦" label="Total Órdenes B2B"
          value={globalLoading ? null : globalStats?.total_ordenes ?? 0}
          sub="órdenes institucionales"
        />
        <KpiCard
          accent="#4CAF50" icon="💰" label="Ingresos Totales"
          value={globalLoading ? null : globalStats?.total_ingresos ?? 0}
          isCurrency
          sub="facturación acumulada"
        />
        <KpiCard
          accent="#C62828" icon="🔴" label="Total por Cobrar"
          value={globalLoading ? null : globalStats?.total_debe ?? 0}
          isCurrency
          valueColor={(globalStats?.total_debe ?? 0) > 0 ? '#C62828' : '#2E7D32'}
          sub="deuda pendiente"
        />
      </div>

      {/* ── Institution Selector ─────────────────────────────────────── */}
      <div className="b2b-card b2b-inst-card">
        <div className="b2b-inst-top">
          <span className="b2b-inst-icon">🏢</span>
          <span className="b2b-inst-label">
            {selectedUser ? selectedUser.user_name : 'Seleccionar Institución'}
          </span>
          {selectedUser && (
            <button
              className="b2b-btn-cambiar"
              onClick={() => {
                setSelectedUser(null);
                setInstitucionSearch('');
                setOrdenesPendientes([]);
                setFacturasAll([]);
                setFacturasPendientes([]);
                setKpis(null);
                setSelectedOrders([]);
                setNotasFactura('');
                setSoloPendientes(false);
                setExpandedFactura(null);
                setPagF({ page: 1, limit: 10 });
              }}
            >
              Cambiar
            </button>
          )}
        </div>

        {selectedUser ? (
          /* ── Selected state ── */
          <div className="b2b-inst-selected">
            <div className="b2b-inst-selected-meta">
              {selectedUser.nit && <span>NIT: {selectedUser.nit}</span>}
              {selectedUser.nit && selectedUser.user_contact && <span> · </span>}
              {selectedUser.user_contact && <span>Contacto: {selectedUser.user_contact}</span>}
            </div>
            <span className={`b2b-saldo-pill ${(selectedUser.saldo_a_favor || 0) > 0 ? 'b2b-saldo-pill--green' : 'b2b-saldo-pill--gray'}`}>
              {(selectedUser.saldo_a_favor || 0) > 0
                ? `Saldo a Favor: ${fmtCOP(selectedUser.saldo_a_favor)}`
                : 'Sin saldo'}
            </span>
          </div>
        ) : (
          /* ── Search + always-visible list ── */
          <div className="b2b-inst-search-wrap">
            <div className="b2b-inst-search-row">
              <span className="b2b-inst-search-icon">🔍</span>
              <input
                className="b2b-inst-search-input"
                placeholder="Buscar institución..."
                value={institucionSearch}
                onChange={e => setInstitucionSearch(e.target.value)}
              />
            </div>
            <div className="b2b-inst-list">
              {filteredInstituciones.length === 0 ? (
                <div className="b2b-inst-list-empty">
                  {instituciones.length === 0
                    ? 'Cargando instituciones...'
                    : 'Sin resultados para la búsqueda'}
                </div>
              ) : (
                filteredInstituciones.map(u => (
                  <button
                    key={u.user_id}
                    className="b2b-inst-list-item"
                    onClick={() => handleSelectUser(u)}
                  >
                    <div className="b2b-inst-item-left">
                      <span className="b2b-inst-item-emoji">🏢</span>
                      <div className="b2b-inst-item-info">
                        <span className="b2b-inst-item-name">{u.user_name}</span>
                        {u.nit && (
                          <span className="b2b-inst-item-nit">NIT: {u.nit} · B2B</span>
                        )}
                      </div>
                    </div>
                    {(u.saldo_a_favor || 0) > 0 && (
                      <span className="b2b-inst-item-saldo">
                        {fmtCOP(u.saldo_a_favor)} ✓
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Main content (institution selected) ─────────────────────── */}
      {selectedUser && (
        <div className={`b2b-content ${loading ? 'b2b-content--loading' : ''}`}>

          {/* KPI Bar */}
          <div className="b2b-kpis">
            <KpiCard
              accent="#C62828" icon="💳" label="Restante Real"
              value={loading ? null : kpis?.restanteReal ?? 0}
              isCurrency
              valueColor={(kpis?.restanteReal ?? 0) > 0 ? '#C62828' : '#2E7D32'}
              sub="deuda menos saldo"
            />
            <KpiCard
              accent="#F57F17" icon="🧾" label="Facturas Pendientes"
              value={loading ? null : kpis?.facturasPendientes ?? 0}
              valueColor={(kpis?.facturasPendientes ?? 0) > 0 ? '#F57F17' : '#2E7D32'}
              sub="facturas sin liquidar"
            />
            <KpiCard
              accent="#FF6B2B" icon="📦" label="Sin Consolidar"
              value={loading ? null : kpis?.serviciosSinConsolidar ?? 0}
              valueColor={(kpis?.serviciosSinConsolidar ?? 0) > 0 ? '#FF6B2B' : '#888780'}
              sub="órdenes sin agrupar"
            />
            <KpiCard
              accent="#185FA5" icon="✅" label="Total Pagado"
              value={loading ? null : kpis?.totalPagado ?? 0}
              isCurrency valueColor="#1A1A1A"
              sub="pagos acumulados"
            />
            <KpiCard
              accent="#4CAF50" icon="💰" label="Saldo a Favor"
              value={loading ? null : (selectedUser.saldo_a_favor ?? 0)}
              isCurrency
              valueColor={(selectedUser.saldo_a_favor || 0) > 0 ? '#2E7D32' : '#888780'}
              sub="billetera disponible"
            />
          </div>

          {/* ── Grid: Abono + Pago Factura ─────────────────────────────── */}
          <div className="b2b-grid-2">

            {/* Abono a Billetera */}
            <div className="b2b-card">
              <div className="b2b-section-title" style={{ marginBottom: 16 }}>
                💰 Ingresar Abono a Billetera
              </div>
              <div className="b2b-form">
                <div className="b2b-field">
                  <label className="b2b-label">Monto ($) *</label>
                  <input
                    type="number" min="1"
                    className={`b2b-input ${errAbono.amount ? 'b2b-input--err' : ''}`}
                    placeholder="0"
                    value={abono.amount}
                    onChange={e => setAbono(p => ({ ...p, amount: e.target.value }))}
                  />
                  {errAbono.amount && <span className="b2b-err">{errAbono.amount}</span>}
                </div>
                <div className="b2b-field">
                  <label className="b2b-label">Método de Pago *</label>
                  <select
                    className="b2b-select"
                    value={abono.payment_method}
                    onChange={e => setAbono(p => ({ ...p, payment_method: e.target.value }))}
                  >
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Nequi</option>
                    <option>Daviplata</option>
                    <option>Tarjeta</option>
                  </select>
                </div>
                <div className="b2b-field">
                  <label className="b2b-label">Notas (opcional)</label>
                  <textarea
                    className="b2b-textarea"
                    placeholder="Observaciones..."
                    maxLength={200}
                    rows={2}
                    value={abono.notes}
                    onChange={e => setAbono(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
                <BlockedAction>
                <button
                  className="b2b-btn-primary b2b-btn--full"
                  onClick={handleAbono}
                  disabled={loadingAbono}
                >
                  {loadingAbono
                    ? <><span className="b2b-spinner" /> Registrando...</>
                    : 'Registrar Abono a Billetera'}
                </button>
                </BlockedAction>
                <div className="b2b-info-hint">
                  ℹ️ El saldo se aplicará automáticamente a deudas pendientes (FIFO)
                </div>
              </div>
            </div>

            {/* Pagar Factura Consolidada */}
            <div className="b2b-card">
              <div className="b2b-section-title" style={{ marginBottom: 16 }}>
                🧾 Pagar Factura Consolidada
              </div>
              <div className="b2b-form">
                <div className="b2b-field">
                  <label className="b2b-label">Factura *</label>
                  <select
                    className={`b2b-select ${errPago.factura ? 'b2b-input--err' : ''}`}
                    value={selectedFactura?.invoice_id ?? ''}
                    onChange={e => {
                      const fac = facturasPendientes.find(
                        f => f.invoice_id === Number(e.target.value)
                      );
                      setSelectedFactura(fac || null);
                      if (fac) setPago(p => ({ ...p, monto: String(fac.balance_due) }));
                    }}
                  >
                    <option value="">Seleccionar factura...</option>
                    {facturasPendientes.map(f => (
                      <option key={f.invoice_id} value={f.invoice_id}>
                        Factura #{f.invoice_id} · {fmtCOP(f.balance_due)} · {f.ordenes_ids?.length || 0} órdenes · {fmtDate(f.created_at)}
                      </option>
                    ))}
                  </select>
                  {errPago.factura && <span className="b2b-err">{errPago.factura}</span>}
                </div>
                <div className="b2b-field">
                  <label className="b2b-label">Monto a Pagar *</label>
                  <input
                    type="number" min="1"
                    className={`b2b-input ${errPago.monto ? 'b2b-input--err' : ''}`}
                    placeholder="0"
                    value={pago.monto}
                    disabled={pago.metodo_pago === 'Saldo a Favor'}
                    onChange={e => setPago(p => ({ ...p, monto: e.target.value }))}
                  />
                  {errPago.monto && <span className="b2b-err">{errPago.monto}</span>}
                </div>
                <div className="b2b-field">
                  <label className="b2b-label">Método de Pago *</label>
                  <select
                    className="b2b-select"
                    value={pago.metodo_pago}
                    onChange={e => {
                      const m = e.target.value;
                      setPago(p => ({
                        ...p,
                        metodo_pago: m,
                        monto: m === 'Saldo a Favor' && selectedFactura
                          ? String(selectedFactura.balance_due)
                          : p.monto,
                      }));
                    }}
                  >
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Nequi</option>
                    <option>Daviplata</option>
                    <option>Tarjeta</option>
                    <option>Saldo a Favor</option>
                  </select>
                </div>
                {pago.metodo_pago === 'Saldo a Favor' && selectedFactura && (
                  <div className={`b2b-saldo-banner ${saldoInsuficiente ? 'b2b-saldo-banner--warn' : 'b2b-saldo-banner--info'}`}>
                    {saldoInsuficiente
                      ? `⚠️ Saldo insuficiente. Disponible: ${fmtCOP(selectedUser.saldo_a_favor)}`
                      : `⚡ Se descontará ${fmtCOP(selectedFactura.balance_due)} del saldo disponible (${fmtCOP(selectedUser.saldo_a_favor)})`}
                  </div>
                )}
                <BlockedAction>
                <button
                  className="b2b-btn-primary b2b-btn--full"
                  onClick={handlePagoFactura}
                  disabled={loadingPago || !!saldoInsuficiente}
                >
                  {loadingPago
                    ? <><span className="b2b-spinner" /> Procesando pago...</>
                    : 'Registrar Pago Global'}
                </button>
                </BlockedAction>
                <div className="b2b-info-hint">
                  ⚡ "Saldo a Favor" descuenta directo de la billetera
                </div>
              </div>
            </div>
          </div>

          {/* ── Sección 3: Consolidar Órdenes ──────────────────────────── */}
          <div className="b2b-card">
            <div className="b2b-card-header">
              <span className="b2b-section-title">📦 Órdenes Sin Consolidar</span>
              <div className="b2b-card-header-right">
                {selectedOrders.length > 0 && (
                  <span className="b2b-sel-total">
                    {selectedOrders.length} seleccionadas · {fmtCOP(selectedTotal)}
                  </span>
                )}
                <BlockedAction>
                <button
                  className="b2b-btn-primary"
                  onClick={handleConsolidar}
                  disabled={selectedOrders.length === 0 || loadingConsolidar}
                >
                  {loadingConsolidar
                    ? <><span className="b2b-spinner" /> Generando...</>
                    : 'Generar Factura Consolidada'}
                </button>
                </BlockedAction>
              </div>
            </div>

            {ordenesSinConsolidar.length === 0 ? (
              <div className="b2b-empty-table">
                ✅ No hay órdenes pendientes de consolidar
              </div>
            ) : (
              <>
                <div className="b2b-table-scroll">
                  <table className="b2b-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            className="b2b-checkbox"
                            checked={allChecked}
                            onChange={e => setSelectedOrders(
                              e.target.checked
                                ? ordenesSinConsolidar.map(o => o.order_id)
                                : []
                            )}
                          />
                        </th>
                        <th>Fecha</th>
                        <th>#Orden</th>
                        <th>Descripción</th>
                        <th className="b2b-th-right">Total</th>
                        <th className="b2b-th-right">Abonado</th>
                        <th className="b2b-th-right">Restante</th>
                        <th>Días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenesSinConsolidar.map(o => {
                        const checked = selectedOrders.includes(o.order_id);
                        const days    = daysDiff(o.created_at);
                        return (
                          <tr
                            key={o.order_id}
                            className={`b2b-row ${checked ? 'b2b-row--selected' : ''}`}
                            onClick={() => setSelectedOrders(prev =>
                              prev.includes(o.order_id)
                                ? prev.filter(id => id !== o.order_id)
                                : [...prev, o.order_id]
                            )}
                          >
                            <td onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="b2b-checkbox"
                                checked={checked}
                                onChange={() => setSelectedOrders(prev =>
                                  prev.includes(o.order_id)
                                    ? prev.filter(id => id !== o.order_id)
                                    : [...prev, o.order_id]
                                )}
                              />
                            </td>
                            <td className="b2b-td-date">{fmtDate(o.created_at)}</td>
                            <td><span className="b2b-order-id">#{o.order_id}</span></td>
                            <td className="b2b-td-desc">{o.items_description || '—'}</td>
                            <td className="b2b-td-right">{fmtCOP(o.order_value)}</td>
                            <td className="b2b-td-right b2b-td-muted">{fmtCOP(o.abono)}</td>
                            <td className="b2b-td-right b2b-td-red">{fmtCOP(o.restante)}</td>
                            <td>
                              <span className={`b2b-days-pill ${
                                days > 30 ? 'b2b-days--red' :
                                days > 15 ? 'b2b-days--amber' :
                                'b2b-days--green'
                              }`}>
                                {days}d
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {selectedOrders.length > 0 && (
                  <div className="b2b-notas-wrap">
                    <input
                      className="b2b-input"
                      placeholder="Notas para la factura (opcional)..."
                      value={notasFactura}
                      onChange={e => setNotasFactura(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Sección 4: Historial Facturas ──────────────────────────── */}
          <div className="b2b-card">
            <div className="b2b-card-header">
              <span className="b2b-section-title">🧾 Historial de Facturas</span>
              <div className="b2b-toggle">
                <button
                  className={`b2b-toggle-btn ${!soloPendientes ? 'active' : ''}`}
                  onClick={() => { setSoloPendientes(false); setPagF(p => ({ ...p, page: 1 })); }}
                >
                  Todas
                </button>
                <button
                  className={`b2b-toggle-btn ${soloPendientes ? 'active' : ''}`}
                  onClick={() => { setSoloPendientes(true); setPagF(p => ({ ...p, page: 1 })); }}
                >
                  Solo Pendientes
                </button>
              </div>
            </div>

            {facturasFiltered.length === 0 ? (
              <div className="b2b-empty-table">
                {soloPendientes
                  ? 'Sin facturas pendientes para esta institución'
                  : 'Sin facturas generadas para esta institución'}
              </div>
            ) : (
              <>
                <div className="b2b-table-scroll">
                  <table className="b2b-table">
                    <thead>
                      <tr>
                        <th>#Factura</th>
                        <th>Fecha</th>
                        <th>Órdenes</th>
                        <th className="b2b-th-right">Total</th>
                        <th className="b2b-th-right">Pagado</th>
                        <th className="b2b-th-right">Saldo</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturasPage.map(f => (
                        <Fragment key={f.invoice_id}>
                          <tr
                            className="b2b-row b2b-row--clickable"
                            onClick={() => setExpandedFactura(
                              expandedFactura === f.invoice_id ? null : f.invoice_id
                            )}
                          >
                            <td>
                              <span className="b2b-fac-id">
                                FAC-{String(f.invoice_id).padStart(3, '0')}
                              </span>
                            </td>
                            <td className="b2b-td-date">{fmtDate(f.created_at)}</td>
                            <td>
                              <span className="b2b-orders-pill">
                                {f.ordenes_ids?.length || 0} órdenes
                              </span>
                            </td>
                            <td className="b2b-td-right b2b-td-bold">
                              {fmtCOP(f.total_amount)}
                            </td>
                            <td className={`b2b-td-right ${f.pagado >= f.total_amount ? 'b2b-td-green' : 'b2b-td-muted'}`}>
                              {fmtCOP(f.pagado)}
                            </td>
                            <td className={`b2b-td-right ${f.balance_due > 0 ? 'b2b-td-red' : 'b2b-td-green'}`}>
                              {f.balance_due > 0 ? fmtCOP(f.balance_due) : '✓ Pagada'}
                            </td>
                            <td>
                              <span className={`b2b-estado-pill ${f.is_paid ? 'b2b-estado--paid' : 'b2b-estado--pending'}`}>
                                {f.is_paid ? 'Pagada ✓' : 'Pendiente'}
                              </span>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {!f.is_paid ? (
                                <button
                                  className="b2b-btn-ghost"
                                  onClick={() => {
                                    setSelectedFactura(f);
                                    setPago({ monto: String(f.balance_due), metodo_pago: 'Efectivo' });
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                >
                                  Pagar →
                                </button>
                              ) : (
                                <span className="b2b-td-muted">—</span>
                              )}
                            </td>
                          </tr>
                          {expandedFactura === f.invoice_id && (
                            <tr className="b2b-row-expand">
                              <td colSpan={8}>
                                <div className="b2b-expand-content">
                                  <span className="b2b-expand-label">Órdenes incluidas</span>
                                  <div className="b2b-orders-wrap">
                                    {(f.ordenes_ids || []).map(oid => (
                                      <span key={oid} className="b2b-order-pill">
                                        Orden #{oid}
                                      </span>
                                    ))}
                                  </div>
                                  {f.notes && (
                                    <div className="b2b-expand-notes">📝 {f.notes}</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPagesF > 1 && (
                  <div className="b2b-pagination">
                    <span className="b2b-pag-info">
                      {(pagF.page - 1) * pagF.limit + 1}–{Math.min(
                        pagF.page * pagF.limit, facturasFiltered.length
                      )} de {facturasFiltered.length}
                    </span>
                    <div className="b2b-pag-btns">
                      <button
                        className="b2b-pg-btn"
                        onClick={() => setPagF(p => ({ ...p, page: p.page - 1 }))}
                        disabled={pagF.page === 1}
                      >‹</button>
                      {Array.from({ length: Math.min(totalPagesF, 7) }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          className={`b2b-pg-btn ${p === pagF.page ? 'active' : ''}`}
                          onClick={() => setPagF(prev => ({ ...prev, page: p }))}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        className="b2b-pg-btn"
                        onClick={() => setPagF(p => ({ ...p, page: p.page + 1 }))}
                        disabled={pagF.page === totalPagesF}
                      >›</button>
                    </div>
                    <select
                      className="b2b-pg-select"
                      value={pagF.limit}
                      onChange={e => setPagF({ page: 1, limit: Number(e.target.value) })}
                    >
                      <option value={10}>10 / pág</option>
                      <option value={25}>25 / pág</option>
                      <option value={50}>50 / pág</option>
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── WhatsApp Resumen ─────────────────────────────────────── */}
          <div className="b2b-wa-bar">
            <button
              className="b2b-btn-wa"
              onClick={handleWhatsAppResumen}
              disabled={!selectedUser?.user_contact}
              title={!selectedUser?.user_contact ? 'Sin número de contacto registrado' : ''}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar resumen por WhatsApp
            </button>
            {!selectedUser?.user_contact && (
              <span className="b2b-wa-hint">Sin número de contacto registrado</span>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
