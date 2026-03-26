import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './NuevaOrden.css';
import { BlockedAction } from '../ui/BlockedAction';

import {
  buscarClientes,
  getServiciosB2C,
  getServiciosB2B,
  crearOrdenB2C,
  crearOrdenB2B,
} from '../../services/nuevaOrden';
import { api } from '../../services/api';
import { getAppUsers } from '../../services/appUsers';
import PrintInvoice from '../ui/PrintInvoice';
import { printOrden, buildPrintPayload } from '../../services/print';
import { sendMessage, useWhatsApp } from '../../whatsapp';

/* ── Constants ──────────────────────────────────────────────── */
const PAYMENT_METHODS = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia', 'Llave', 'Saldo a Favor'];
const PAYMENT_ICONS = {
  Efectivo: '💵', Nequi: '📱', Daviplata: '💳',
  Transferencia: '🏦', Llave: '🔑', 'Saldo a Favor': '💰',
};
const QUICK_SHORTCUTS = [
  { label: 'Lav + Sec',   keywords: ['lavado + secado', 'lavado y secado', 'lavado+secado', 'lav+sec'] },
  { label: 'X Libras',    keywords: ['libras', 'por libra'] },
  { label: 'Jabón',       keywords: ['jabón', 'jabon', 'jabón'] },
  { label: 'Suavizante',  keywords: ['suavizante'] },
  { label: 'Domicilio',   keywords: ['domicilio'] },
];
const CONFETTI_COLORS = ['#FF6B2B', '#2B7FFF', '#2BA05A', '#FFD700', '#E53E8A', '#9B5DFF'];

/* ── Utilities ──────────────────────────────────────────────── */
const fmtCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function initPayments() {
  return PAYMENT_METHODS.map(m => ({ method: m, amount: '', enabled: false }));
}

function findServiceByShortcut(services, keywords) {
  return services.find(s =>
    keywords.some(kw => s.service_name.toLowerCase().includes(kw.toLowerCase()))
  );
}

function isAgencyService(name = '') {
  return /agencia/i.test(name);
}

/* ── WhatsApp Receipt Builder ───────────────────────────────── */
function buildWhatsAppReceipt(payload, buildMessage) {
  const { negocio, orden } = payload;

  if (buildMessage) {
    const itemLines = (orden.items || []).map(i => {
      const price = `$${Math.round(i.vlr_total).toLocaleString('es-CO')}`;
      return `• ${i.cantidad}x ${i.detalle} ... ${price}`;
    }).join('\n');

    const totalStr = `$${Math.round(orden.total || 0).toLocaleString('es-CO')}`;
    const subtotalStr = `$${Math.round(orden.subtotal || 0).toLocaleString('es-CO')}`;
    const abonoStr = `$${Math.round(orden.abono || 0).toLocaleString('es-CO')}`;

    const estado = (orden.total || 0) <= 0.5
      ? '✅ *ORDEN PAGADA*'
      : `⏳ *PENDIENTE: ${totalStr}*`;

    return buildMessage('nueva_orden', {
      nombre_cliente: orden.cliente,
      num_orden: orden.numero,
      fecha: orden.fecha,
      servicios: itemLines,
      total: subtotalStr,
      abono: abonoStr,
      saldo: totalStr,
      estado_pago: estado,
      negocio: (negocio?.nombre || negocio?.nombre_negocio || 'LAVANDERÍA').toUpperCase(),
      direccion: negocio?.direccion || '',
      telefono: negocio?.telefono || '',
      nit: negocio?.nit || '',
      mensaje_pie: negocio?.mensaje_pie || ''
    });
  }

  // Fallback (redundant but safe)
  const biz = (negocio?.nombre || negocio?.nombre_negocio || 'LAVANDERÍA').toUpperCase();
  const tel = negocio?.telefono ? `📞 *Tel:* ${negocio.telefono}` : '';
  const dir = negocio?.direccion ? `📍 *Dir:* ${negocio.direccion}` : '';
  const nit = negocio?.nit ? `*NIT:* ${negocio.nit}` : '';

  const header = [
    `🧺 *${biz}* 🧺`,
    [tel, dir].filter(Boolean).join('  '),
    nit,
    '------------------------------------------------',
  ].filter(Boolean).join('\n');

  const info = [
    `📦 *ORDEN #${orden.numero}*`,
    `📅 ${orden.fecha}`,
    `👤 *Cliente:* ${orden.cliente}`,
    orden.telefono_cliente ? `📞 *Tel. Cliente:* ${orden.telefono_cliente}` : '',
  ].filter(Boolean).join('\n');

  const itemLines = (orden.items || []).map(i => {
    const price = `$${Math.round(i.vlr_total).toLocaleString('es-CO')}`;
    return `• ${i.cantidad}x ${i.detalle} ... ${price}`;
  });

  const itemsBlock = ['', '*SERVICIOS:*', ...itemLines, '------------------------------------------------'].join('\n');

  const subtotalStr = `$${Math.round(orden.subtotal || 0).toLocaleString('es-CO')}`;
  const totalStr = `$${Math.round(orden.total || 0).toLocaleString('es-CO')}`;
  const abonoVal = orden.abono || 0;

  const totalesLines = [`Total Orden: *${subtotalStr}*`];
  if (abonoVal > 0) {
    totalesLines.push(`Abono: -$${Math.round(abonoVal).toLocaleString('es-CO')}`);
    totalesLines.push(`Saldo Pendiente: *${totalStr}*`);
  }

  const estado = (orden.total || 0) <= 0.5
    ? '✅ *ORDEN PAGADA*'
    : `⏳ *PENDIENTE: ${totalStr}*`;

  const footer = negocio?.mensaje_pie ? `\n\n_${negocio.mensaje_pie}_` : '';

  return [header, info, itemsBlock, totalesLines.join('\n'), '', estado, footer].join('\n');
}

/* ── Confetti ───────────────────────────────────────────────── */
function Confetti() {
  const pieces = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      tx: `${(Math.random() - 0.5) * 700}px`,
      ty: `${-(Math.random() * 500 + 100)}px`,
      rot: `${Math.random() * 720}deg`,
      delay: `${Math.random() * 350}ms`,
      size: `${Math.random() * 8 + 5}px`,
    }))
  , []);

  return (
    <div className="no-confetti-wrap" aria-hidden="true">
      {pieces.map(p => (
        <div
          key={p.id}
          className="no-confetti-piece"
          style={{
            background: p.color,
            width: p.size,
            height: p.size,
            '--tx': p.tx,
            '--ty': p.ty,
            '--rot': p.rot,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}

/* ── Toast ──────────────────────────────────────────────────── */
function ToastContainer({ toasts }) {
  return (
    <div className="no-toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`no-toast no-toast--${t.type}${t.out ? ' out' : ''}`}>
          <span>{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Service Panel ──────────────────────────────────────────── */
function ServicePanel({ services, loading, serviceSearch, onSearchChange, onAdd, onAddExtra }) {
  const filtered = useMemo(() =>
    services.filter(s =>
      !serviceSearch || s.service_name.toLowerCase().includes(serviceSearch.toLowerCase())
    )
  , [services, serviceSearch]);

  return (
    <aside className="no-service-panel">
      <div className="no-sp-header">
        <div className="no-sp-title">
          <span className="no-sp-title__text">Servicios</span>
          {!loading && <span className="no-sp-count">{filtered.length}</span>}
        </div>
        <input
          className="no-sp-search"
          type="search"
          placeholder="🔍 Filtrar servicios..."
          value={serviceSearch}
          onChange={e => onSearchChange(e.target.value)}
          aria-label="Filtrar servicios"
        />
      </div>

      <div className="no-sp-list">
        {loading && (
          <div className="no-sp-loading">
            <div className="no-sp-spinner" />
            <span>Cargando servicios...</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="no-sp-empty">
            {services.length === 0
              ? 'Selecciona una institución para ver sus servicios'
              : 'Sin resultados'}
          </div>
        )}

        {!loading && filtered.map(s => (
          <div key={s.service_id} className="no-service-item">
            <div className="no-si-info">
              <div className="no-si-name">
                <span>{s.service_name}</span>
                {isAgencyService(s.service_name) && (
                  <span className="no-si-agency-badge">🏭</span>
                )}
              </div>
              <div className="no-si-price">{fmtCOP(s.service_value)}</div>
            </div>
            <button
              className="no-sp-add-btn"
              onClick={() => onAdd(s)}
              title={`Agregar ${s.service_name}`}
              aria-label={`Agregar ${s.service_name}`}
            >
              ＋
            </button>
          </div>
        ))}

        {!loading && (
          <>
            <div className="no-sp-divider" />
            <button className="no-extra-btn" onClick={onAddExtra} aria-label="Agregar servicio extra">
              ✨ Servicio Extra
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/* ── ServiceSearchInput ─────────────────────────────────────── */
const EXTRA_SVC = {
  service_id: null,
  service_name: '✨ Servicio Extra (precio manual)',
  service_value: 0,
  isExtra: true,
};

/* ── Abbreviation expansion ─────────────────────────────────── */
const expandText = (text, abbreviations) =>
  text
    .split(' ')
    .map(word => abbreviations[word.toLowerCase()] || word)
    .join(' ');

function ServiceSearchInput({ services, onAddItem, abbreviations = {} }) {
  const [search, setSearch]               = useState('');
  const [selected, setSelected]           = useState(null);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [highlightedIdx, setHighlightedIdx]   = useState(0);
  const [cantidad, setCantidad]           = useState('1');
  const [description, setDescription]    = useState('');
  const [extraPrice, setExtraPrice]       = useState('');
  const [flashBtn, setFlashBtn]           = useState(false);
  const [descError, setDescError]         = useState(false);
  const [showExpansionFlash, setShowExpansionFlash] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(
    () => !!localStorage.getItem('washflow_hint_dismissed')
  );

  const containerRef   = useRef(null);
  const searchRef      = useRef(null);
  const cantidadRef    = useRef(null);
  const descripcionRef = useRef(null);
  const agregarRef     = useRef(null);
  const extraPriceRef  = useRef(null);

  // Filtered list, max 8 normal + Extra always last
  const filtered = useMemo(() => {
    const base = search.trim()
      ? services.filter(s => s.service_name.toLowerCase().includes(search.toLowerCase()))
      : services;
    return [...base.slice(0, 8), EXTRA_SVC];
  }, [services, search]);

  // Auto-select all in cantidad on focus
  useEffect(() => {
    const el = cantidadRef.current;
    if (!el) return;
    const handler = () => el.select();
    el.addEventListener('focus', handler);
    return () => el.removeEventListener('focus', handler);
  }, []);

  // Click-outside closes dropdown
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const clearSelected = () => {
    setSelected(null);
    setSearch('');
    setDropdownVisible(false);
    setCantidad('1');
    setDescription('');
    setExtraPrice('');
    setDescError(false);
  };

  const selectService = (svc) => {
    const isExtra = svc.isExtra === true;
    setSelected({
      ...svc,
      isExtra,
      isAgency: !isExtra && isAgencyService(svc.service_name),
    });
    setSearch(isExtra ? '✨ Servicio Extra' : svc.service_name);
    setDropdownVisible(false);
    setHighlightedIdx(0);
    setDescError(false);
    setTimeout(() => {
      if (isExtra && extraPriceRef.current) extraPriceRef.current.focus();
      else cantidadRef.current?.focus();
    }, 30);
  };

  const doAdd = () => {
    if (!selected) return;
    if (selected.isExtra && !description.trim()) {
      setDescError(true);
      descripcionRef.current?.focus();
      return;
    }
    const unitPrice = selected.isExtra
      ? (parseFloat(extraPrice) || 0)
      : selected.service_value;

    onAddItem({
      id: uid(),
      service_id: selected.service_id,
      service_name: selected.isExtra
        ? (description.trim() ? `✨ ${description}` : '✨ Servicio Extra')
        : selected.service_name,
      quantity: parseFloat(cantidad) || 1,
      unit_price: unitPrice,
      description,
      is_agency: selected.isAgency || false,
      is_extra: selected.isExtra,
      is_discount: false,
    });

    if (!hintDismissed) {
      setHintDismissed(true);
      localStorage.setItem('washflow_hint_dismissed', '1');
    }
    setFlashBtn(true);
    setTimeout(() => setFlashBtn(false), 120);
    clearSelected();
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleSearchKeyDown = (e) => {
    if (!dropdownVisible) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        e.preventDefault();
        setDropdownVisible(true);
        setHighlightedIdx(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightedIdx]) selectService(filtered[highlightedIdx]);
    } else if (e.key === 'Escape') {
      setDropdownVisible(false);
      clearSelected();
      searchRef.current?.focus();
    }
  };

  const handleCantidadKeyDown = (e) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      descripcionRef.current?.focus();
    }
  };

  const handleDescripcionKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const expanded = expandText(description, abbreviations);
      if (expanded !== description) {
        setDescription(expanded);
        setShowExpansionFlash(true);
        setTimeout(() => setShowExpansionFlash(false), 300);
        setTimeout(() => doAdd(), 150);
      } else {
        doAdd();
      }
    }
    // Tab naturally falls through to agregarRef
  };

  return (
    <div className="ssi-zone" ref={containerRef}>
      {/* Row 1: search + extra price + cantidad */}
      <div className="ssi-row-top">
        {/* Search input + dropdown */}
        <div className="ssi-search-wrap">
          <span className="ssi-search-icon" aria-hidden="true">🔍</span>
          <input
            id="service-search-input"
            ref={searchRef}
            className={`ssi-search-input${selected ? ' ssi-search-input--selected' : ''}`}
            type="text"
            placeholder="Buscar servicio... (escribe para buscar)"
            value={search}
            autoComplete="off"
            readOnly={!!selected}
            aria-label="Buscar servicio"
            aria-haspopup="listbox"
            aria-expanded={dropdownVisible}
            aria-activedescendant={dropdownVisible ? `ssi-opt-${highlightedIdx}` : undefined}
            onChange={e => {
              if (selected) clearSelected();
              setSearch(e.target.value);
              setDropdownVisible(e.target.value.length > 0);
              setHighlightedIdx(0);
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (!selected && search.length > 0) setDropdownVisible(true);
            }}
          />

          {selected && (
            <>
              <span className="ssi-check" aria-hidden="true">✅</span>
              <button
                className="ssi-clear-btn"
                onClick={clearSelected}
                tabIndex={-1}
                aria-label="Limpiar selección"
              >
                ✕
              </button>
            </>
          )}

          {dropdownVisible && filtered.length > 0 && (
            <div className="ssi-dropdown" role="listbox" aria-label="Servicios disponibles">
              {filtered.map((s, idx) => (
                <div
                  key={s.service_id ?? 'extra'}
                  id={`ssi-opt-${idx}`}
                  className={`ssi-option${highlightedIdx === idx ? ' ssi-option--hl' : ''}${s.isExtra ? ' ssi-option--extra' : ''}`}
                  role="option"
                  aria-selected={highlightedIdx === idx}
                  onMouseEnter={() => setHighlightedIdx(idx)}
                  onMouseDown={e => { e.preventDefault(); selectService(s); }}
                >
                  <span className="ssi-opt-name">
                    {!s.isExtra && isAgencyService(s.service_name) && (
                      <span className="ssi-opt-agency">🏭 </span>
                    )}
                    {s.service_name}
                  </span>
                  {!s.isExtra && (
                    <span className="ssi-opt-price">{fmtCOP(s.service_value)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Extra price (Servicio Extra only) */}
        {selected?.isExtra && (
          <div className="ssi-field-group">
            <span className="ssi-field-label">Precio $</span>
            <input
              ref={extraPriceRef}
              className="ssi-extra-price"
              type="number"
              min="0"
              step="1000"
              value={extraPrice}
              onChange={e => setExtraPrice(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                  e.preventDefault();
                  cantidadRef.current?.focus();
                }
              }}
              placeholder="0"
              aria-label="Precio del servicio extra"
            />
          </div>
        )}

        {/* Cantidad */}
        <div className="ssi-field-group">
          <span className="ssi-field-label">Cant.</span>
          <input
            ref={cantidadRef}
            className="ssi-cantidad"
            type="number"
            min="0.5"
            step="0.5"
            value={cantidad}
            disabled={!selected}
            onChange={e => setCantidad(e.target.value)}
            onKeyDown={handleCantidadKeyDown}
            aria-label="Cantidad"
          />
        </div>
      </div>

      {/* Row 2: description + add button (only when service selected) */}
      {selected && (
        <div className="ssi-row-bottom">
          <input
            ref={descripcionRef}
            className={`ssi-desc${descError ? ' ssi-desc--error' : ''}${selected.isExtra ? ' ssi-desc--required' : ''}${showExpansionFlash ? ' ssi-desc--expanding' : ''}`}
            type="text"
            placeholder={selected.isExtra ? 'Descripción REQUERIDA ⚠️' : 'Descripción (opcional)'}
            value={description}
            onChange={e => { setDescription(e.target.value); setDescError(false); }}
            onKeyDown={handleDescripcionKeyDown}
            aria-label="Descripción del servicio"
            aria-required={selected.isExtra}
          />
          <button
            ref={agregarRef}
            className={`ssi-add-btn${flashBtn ? ' ssi-add-btn--flash' : ''}`}
            onClick={doAdd}
            tabIndex={0}
            aria-label="Agregar servicio a la orden"
          >
            + Agregar
          </button>
        </div>
      )}

      {/* Keyboard hint (dismissed after first add) */}
      {!hintDismissed && (
        <p className="ssi-hint" aria-hidden="true">
          {(() => {
            const abbrevEntries = Object.entries(abbreviations).slice(-2);
            const examples = abbrevEntries.map(([k, v]) => `${k}→${v}`).join(', ');
            return `↑↓ navegar · Enter seleccionar · Tab siguiente · abreviaciones: ${examples || 'ca→camisa'}`;
          })()}
        </p>
      )}
    </div>
  );
}

/* ── Domicilio Form ──────────────────────────────────────────── */
function DomicilioForm({ domicilio, onChange, empleados }) {
  const set = (key, val) => onChange({ ...domicilio, [key]: val });

  return (
    <div className="no-domicilio-form">
      <div className="no-domicilio-row">
        <div className="no-domicilio-field no-domicilio-field--full">
          <label className="no-domicilio-label">📍 Dirección de recogida *</label>
          <input
            className="no-domicilio-input"
            type="text"
            placeholder="Dirección de recogida"
            value={domicilio.direccion_recogida}
            onChange={e => set('direccion_recogida', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="no-domicilio-row">
        <div className="no-domicilio-field no-domicilio-field--full">
          <label className="no-domicilio-label">📍 Dirección de entrega *</label>
          <input
            className="no-domicilio-input"
            type="text"
            placeholder="Dirección de entrega"
            value={domicilio.direccion_entrega}
            onChange={e => set('direccion_entrega', e.target.value)}
            required
          />
        </div>
      </div>

      <div className="no-domicilio-row no-domicilio-row--2col">
        <div className="no-domicilio-field">
          <label className="no-domicilio-label">📅 Fecha recogida</label>
          <input
            className="no-domicilio-input"
            type="date"
            value={domicilio.fecha_recogida}
            onChange={e => set('fecha_recogida', e.target.value)}
          />
        </div>
        <div className="no-domicilio-field">
          <label className="no-domicilio-label">⏰ Hora recogida</label>
          <input
            className="no-domicilio-input"
            type="time"
            value={domicilio.hora_recogida}
            onChange={e => set('hora_recogida', e.target.value)}
          />
        </div>
      </div>

      <div className="no-domicilio-row no-domicilio-row--2col">
        <div className="no-domicilio-field">
          <label className="no-domicilio-label">📅 Fecha entrega</label>
          <input
            className="no-domicilio-input"
            type="date"
            value={domicilio.fecha_entrega}
            onChange={e => set('fecha_entrega', e.target.value)}
          />
        </div>
        <div className="no-domicilio-field">
          <label className="no-domicilio-label">⏰ Hora entrega</label>
          <input
            className="no-domicilio-input"
            type="time"
            value={domicilio.hora_entrega}
            onChange={e => set('hora_entrega', e.target.value)}
          />
        </div>
      </div>

      <div className="no-domicilio-row">
        <div className="no-domicilio-field no-domicilio-field--full">
          <label className="no-domicilio-label">👤 Nombre receptor</label>
          <input
            className="no-domicilio-input"
            type="text"
            placeholder="Nombre de quien recibe"
            value={domicilio.nombre_receptor}
            onChange={e => set('nombre_receptor', e.target.value)}
          />
        </div>
      </div>

      <div className="no-domicilio-row">
        <div className="no-domicilio-field no-domicilio-field--full">
          <label className="no-domicilio-label">👷 Empleado asignado</label>
          <select
            className="no-domicilio-input"
            value={domicilio.empleado_id || ''}
            onChange={e => set('empleado_id', e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Seleccionar empleado...</option>
            {(empleados || []).map(emp => (
              <option key={emp.id} value={emp.id}>{emp.username}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="no-domicilio-row">
        <div className="no-domicilio-field no-domicilio-field--full">
          <label className="no-domicilio-label">📝 Notas del domicilio</label>
          <input
            className="no-domicilio-input"
            type="text"
            placeholder="Observaciones, indicaciones especiales..."
            value={domicilio.notas}
            onChange={e => set('notas', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Items Table ────────────────────────────────────────────── */
function ItemsTable({ items, onUpdate, onRemove }) {
  if (items.length === 0) {
    return (
      <div className="no-empty-state" aria-label="Tabla vacía">
        <span className="no-empty-state__icon">👉</span>
        <p>Agrega servicios desde el panel de la derecha</p>
      </div>
    );
  }

  return (
    <div className="no-items-table-wrap">
      <table className="no-items-table" aria-label="Servicios de la orden">
        <thead>
          <tr>
            <th aria-label="Eliminar" />
            <th>Cant.</th>
            <th>Servicio</th>
            <th>Descripción</th>
            <th>V. Unitario</th>
            <th>V. Total</th>
            <th>Agencia</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const rowTotal = (parseFloat(item.quantity) || 0) * item.unit_price;
            const descRequired = item.is_extra && !item.description.trim();

            return (
              <tr
                key={item.id}
                className={`no-tr-appear${item.is_discount ? ' no-tr-discount' : ''}`}
              >
                {/* Delete */}
                <td>
                  {!item.is_discount && (
                    <button
                      className="no-del-btn"
                      onClick={() => onRemove(item.id)}
                      title="Eliminar"
                      aria-label={`Eliminar ${item.service_name}`}
                    >
                      🗑️
                    </button>
                  )}
                </td>

                {/* Quantity */}
                <td>
                  {item.is_discount ? (
                    <span>1</span>
                  ) : (
                    <input
                      className="no-qty-input"
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={item.quantity}
                      onChange={e => {
                        const val = e.target.value;
                        onUpdate(item.id, { quantity: val === '' ? '' : (parseFloat(val) || 0) });
                      }}
                      aria-label="Cantidad"
                    />
                  )}
                </td>

                {/* Service name */}
                <td>
                  {item.is_extra ? (
                    <input
                      className="no-desc-input"
                      style={{ fontWeight: 600, width: 140 }}
                      value={item.service_name}
                      onChange={e => onUpdate(item.id, { service_name: e.target.value })}
                      placeholder="Nombre del servicio"
                    />
                  ) : (
                    <span className="no-service-name-cell">{item.service_name}</span>
                  )}
                </td>

                {/* Description */}
                <td>
                  {item.is_discount ? (
                    <span style={{ fontSize: '0.82rem', color: '#6B6560' }}>{item.description}</span>
                  ) : (
                    <input
                      className={`no-desc-input${descRequired ? ' no-desc-input--required' : ''}`}
                      value={item.description}
                      onChange={e => onUpdate(item.id, { description: e.target.value })}
                      placeholder={item.is_extra ? 'Descripción (requerida)' : 'Opcional...'}
                      title={descRequired ? 'La descripción es requerida para servicios extra' : ''}
                    />
                  )}
                </td>

                {/* Unit price */}
                <td>
                  {item.is_extra ? (
                    <input
                      className="no-price-input"
                      type="number"
                      min="0"
                      step="1000"
                      value={item.unit_price}
                      onChange={e => onUpdate(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                      aria-label="Precio unitario"
                    />
                  ) : (
                    <span style={{ whiteSpace: 'nowrap' }}>{fmtCOP(item.unit_price)}</span>
                  )}
                </td>

                {/* Total */}
                <td>
                  <span
                    className="no-total-cell"
                    style={{ color: item.is_discount ? '#2BA05A' : 'inherit' }}
                  >
                    {fmtCOP(rowTotal)}
                  </span>
                </td>

                {/* Agency */}
                <td>
                  {item.is_agency ? (
                    <span className="no-agency-badge">🏭 Agencia</span>
                  ) : (
                    <span style={{ color: '#ccc' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Payment Section ────────────────────────────────────────── */
function PaymentSection({
  paymentStatus, onStatusChange,
  singleMethod, onSingleMethod,
  payments, onPaymentChange,
  saldoAFavor,
  totalAbono, total,
}) {
  const paymentOverflow = totalAbono > total + 0.5;
  const paymentComplete = Math.abs(totalAbono - total) < 0.5;
  const hasAbono = totalAbono > 0.5;

  const visibleMethods = paymentStatus === 'Pagada'
    ? PAYMENT_METHODS.filter(m => m !== 'Saldo a Favor' || saldoAFavor > 0)
    : PAYMENT_METHODS.filter(m => m !== 'Saldo a Favor' || saldoAFavor > 0);

  const bannerState = paymentStatus === 'Debe'
    ? paymentOverflow ? 'error'
    : paymentComplete ? 'success'
    : hasAbono ? 'partial'
    : null
    : null;

  return (
    <div>
      <p className="no-section-title">Pago</p>

      <div className="no-payment-toggle" role="group" aria-label="Estado de pago">
        {['Debe', 'Pagada'].map(s => (
          <button
            key={s}
            className={`no-pt-btn${paymentStatus === s ? ' no-pt-btn--active' : ''}`}
            onClick={() => onStatusChange(s)}
          >
            {s === 'Pagada' ? '✅ Pagada' : '⏳ Debe'}
          </button>
        ))}
      </div>

      <div className="no-payment-methods">
        {paymentStatus === 'Pagada' ? (
          /* Single radio selection */
          visibleMethods.map(m => (
            <label
              key={m}
              className={`no-method-row${singleMethod === m ? ' no-method-row--active' : ''}`}
            >
              <input
                type="radio"
                className="no-method-radio"
                name="payment-method"
                value={m}
                checked={singleMethod === m}
                onChange={() => onSingleMethod(m)}
              />
              <span className="no-method-icon">{PAYMENT_ICONS[m]}</span>
              <span className="no-method-label">{m}</span>
            </label>
          ))
        ) : (
          /* Checkboxes with amounts */
          visibleMethods.map(m => {
            const p = payments.find(x => x.method === m) || { method: m, amount: '', enabled: false };
            const isSaldo = m === 'Saldo a Favor';
            return (
              <div
                key={m}
                className={`no-method-row${p.enabled ? ' no-method-row--active' : ''}`}
              >
                <input
                  type="checkbox"
                  className="no-method-checkbox"
                  checked={p.enabled}
                  onChange={e => onPaymentChange(m, 'enabled', e.target.checked)}
                  aria-label={`Pago con ${m}`}
                />
                <span className="no-method-icon">{PAYMENT_ICONS[m]}</span>
                <span className="no-method-label">
                  {m}
                  {isSaldo && saldoAFavor > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#6B6560', marginLeft: 6 }}>
                      (máx. {fmtCOP(saldoAFavor)})
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  className="no-method-amount"
                  step="1000"
                  min="0"
                  max={isSaldo ? saldoAFavor : undefined}
                  value={p.amount}
                  disabled={!p.enabled}
                  onChange={e => {
                    let val = parseFloat(e.target.value) || 0;
                    if (isSaldo && saldoAFavor > 0) val = Math.min(val, saldoAFavor);
                    onPaymentChange(m, 'amount', val);
                  }}
                  placeholder="$0"
                  aria-label={`Monto ${m}`}
                />
              </div>
            );
          })
        )}
      </div>

      {bannerState && (
        <div className={`no-payment-banner no-payment-banner--${bannerState}`} role="status">
          {bannerState === 'error' && `⚠️ El abono (${fmtCOP(totalAbono)}) supera el total (${fmtCOP(total)})`}
          {bannerState === 'success' && '✅ Pago completo'}
          {bannerState === 'partial' && `Abono parcial: ${fmtCOP(total - totalAbono)} pendiente`}
        </div>
      )}
    </div>
  );
}

/* ── Totals Panel ───────────────────────────────────────────── */
function TotalsPanel({
  subtotal, discountAmt, descuentoManual, onDescuentoManualChange, total, totalAbono, saldoPendiente, paymentStatus,
  canSubmit, disabledReason, isCreating, onSubmit,
  deliveryPrint, deliveryWhatsApp, onDeliveryPrint, onDeliveryWhatsApp, hasClientPhone,
}) {
  return (
    <div className="no-totals-card">
      <div className="no-totals-inner">
        <div className="no-totals-row">
          <span>Subtotal</span>
          <span className="no-totals-value">{fmtCOP(subtotal)}</span>
        </div>
        <div className="no-totals-row no-totals-row--manual-discount">
          <span>Descuento Manual</span>
          <div className="no-discount-input-wrapper">
            <span className="no-discount-currency">$</span>
            <input
              type="number"
              className="no-discount-input"
              value={descuentoManual}
              onChange={e => onDescuentoManualChange(e.target.value)}
              placeholder="0"
              min="0"
              step="1000"
            />
          </div>
        </div>
        {discountAmt > 0 && (
          <div className="no-totals-row no-totals-row--discount">
            <span>Descuento Fidelidad</span>
            <span className="no-totals-value">−{fmtCOP(discountAmt)}</span>
          </div>
        )}
        <div className="no-totals-divider" />
        <div className="no-totals-row no-totals-row--total">
          <span>Total</span>
          <span className="no-totals-value">{fmtCOP(total)}</span>
        </div>
        {paymentStatus === 'Debe' && (
          <>
            <div className="no-totals-row">
              <span>Abono</span>
              <span className="no-totals-value">−{fmtCOP(totalAbono)}</span>
            </div>
            <div className="no-totals-divider" />
            <div className={`no-totals-row no-totals-row--pending ${saldoPendiente > 0.5 ? 'pending-red' : 'pending-green'}`}>
              <span>Saldo pendiente</span>
              <span className="no-totals-value">{fmtCOP(Math.max(0, saldoPendiente))}</span>
            </div>
          </>
        )}
      </div>

      {/* Delivery options */}
      <div className="no-delivery-options" role="group" aria-label="Enviar factura por">
        <span className="no-delivery-label">Enviar por:</span>
        <label className={`no-delivery-chip${deliveryPrint ? ' no-delivery-chip--active' : ''}`}>
          <input
            type="checkbox"
            checked={deliveryPrint}
            onChange={e => onDeliveryPrint(e.target.checked)}
            aria-label="Enviar por impresión"
          />
          🖨️ Impresión
        </label>
        <label
          className={`no-delivery-chip no-delivery-chip--wa${deliveryWhatsApp ? ' no-delivery-chip--active' : ''}${!hasClientPhone ? ' no-delivery-chip--disabled' : ''}`}
          title={!hasClientPhone ? 'El cliente no tiene teléfono registrado' : ''}
        >
          <input
            type="checkbox"
            checked={deliveryWhatsApp}
            disabled={!hasClientPhone}
            onChange={e => onDeliveryWhatsApp(e.target.checked)}
            aria-label="Enviar por WhatsApp"
          />
          📱 WhatsApp
        </label>
      </div>

      {disabledReason && (
        <div className="no-create-disabled-hint" role="status" aria-live="polite">
          {disabledReason}
        </div>
      )}

      <BlockedAction>
      <button
        className={`no-create-btn${isCreating ? ' no-create-btn--loading' : ''}`}
        onClick={onSubmit}
        disabled={!canSubmit || isCreating}
        aria-label="Crear orden"
        title={disabledReason || 'Crear orden'}
      >
        {isCreating ? (
          <>
            <span className="no-create-btn__spinner" />
            Creando orden...
          </>
        ) : (
          'CREAR ORDEN'
        )}
      </button>
      </BlockedAction>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */
export default function NuevaOrden() {
  // ── Mode ──────────────────────────────────────────────────
  const [mode, setMode]           = useState('B2C');

  // ── Client ────────────────────────────────────────────────
  const [clientSearch, setClientSearch]     = useState('');
  const [clientResults, setClientResults]   = useState([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const [focusedClientIndex, setFocusedClientIndex] = useState(-1);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showFidelityBanner, setShowFidelityBanner] = useState(false);

  // ── Services ──────────────────────────────────────────────
  const [availableServices, setAvailableServices] = useState([]);
  const [servicesLoading, setServicesLoading]     = useState(false);
  const [serviceSearch, setServiceSearch]         = useState('');
  const [abbreviations, setAbbreviations]         = useState({});

  // ── Items ─────────────────────────────────────────────────
  const [items, setItems] = useState([]);

  // ── Descuento Manual ──────────────────────────────────────
  const [descuentoManual, setDescuentoManual] = useState('');

  // ── Payment ───────────────────────────────────────────────
  const [paymentStatus, setPaymentStatus] = useState('Debe');
  const [singleMethod, setSingleMethod]   = useState('Efectivo');
  const [payments, setPayments]           = useState(initPayments);

  // ── Quick add (kept for reference; shortcuts wired via ServiceSearchInput) ──

  // ── Domicilio ─────────────────────────────────────────────
  const [isDomicilio, setIsDomicilio]   = useState(false);
  const [domicilioData, setDomicilioData] = useState({
    direccion_recogida: '', direccion_entrega: '',
    fecha_recogida: '', hora_recogida: '',
    fecha_entrega: '', hora_entrega: '',
    nombre_receptor: '', empleado_id: null, notas: '',
  });
  const [empleados, setEmpleados] = useState([]);

  // ── Delivery options ──────────────────────────────────────
  const [deliveryPrint, setDeliveryPrint]       = useState(true);
  const [deliveryWhatsApp, setDeliveryWhatsApp] = useState(false);

  // ── UI ────────────────────────────────────────────────────
  const [isCreating, setIsCreating]       = useState(false);
  const [successFlash, setSuccessFlash]   = useState(false);
  const [showConfetti, setShowConfetti]   = useState(false);
  const [toasts, setToasts] = useState([]);
  const [negocioConfig, setNegocioConfig] = useState(null);
  const { buildMessage } = useWhatsApp();
  const tableTopRef = useRef(null);
  const searchTimer     = useRef(null);
  const toastTimers     = useRef({});
  const searchRef       = useRef(null);

  // ── Computed ─────────────────────────────────────────────
  const subtotal = useMemo(
    () => items.filter(i => !i.is_discount).reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0),
    [items]
  );
  const manualDiscountAmt = parseFloat(descuentoManual) || 0;
  const discountAmt = useMemo(
    () => items.filter(i => i.is_discount).reduce((s, i) => s + Math.abs((parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0)), 0),
    [items]
  );
  const totalDiscountAmt = discountAmt + manualDiscountAmt;
  const total = subtotal - totalDiscountAmt;

  const totalAbono = useMemo(() => {
    if (paymentStatus === 'Pagada') return total;
    return payments
      .filter(p => p.enabled)
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  }, [paymentStatus, payments, total]);

  const saldoPendiente = total - totalAbono;
  const paymentOverflow = paymentStatus === 'Debe' && totalAbono > total + 0.5;

  const hasExtraWithoutDesc = items.some(i => i.is_extra && !i.description.trim());
  const domicilioMissingFields = isDomicilio && (
    !domicilioData.direccion_recogida.trim() || !domicilioData.direccion_entrega.trim()
  );
  const canSubmit =
    !!selectedClient &&
    items.filter(i => !i.is_discount).length > 0 &&
    !hasExtraWithoutDesc &&
    !paymentOverflow &&
    !domicilioMissingFields &&
    !isCreating;

  const disabledReason = !selectedClient
    ? 'Selecciona un cliente para continuar'
    : items.filter(i => !i.is_discount).length === 0
    ? 'Agrega al menos un servicio'
    : hasExtraWithoutDesc
    ? 'Completa la descripción del servicio extra'
    : paymentOverflow
    ? 'El abono supera el total de la orden'
    : domicilioMissingFields
    ? 'Completa las direcciones del domicilio'
    : null;

  // ── Toast ─────────────────────────────────────────────────
  const addToast = useCallback((message, type = 'success', icon = '✅') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, icon, out: false }]);
    toastTimers.current[id] = setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
    }, 4500);
  }, []);

  // ── Load services B2C ─────────────────────────────────────
  const loadServicesB2C = useCallback(async () => {
    setServicesLoading(true);
    try {
      const data = await getServiciosB2C();
      setAvailableServices(Array.isArray(data) ? data : []);
    } catch {
      setAvailableServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const loadServicesB2B = useCallback(async (institutionName) => {
    setServicesLoading(true);
    try {
      const data = await getServiciosB2B(institutionName);
      setAvailableServices(Array.isArray(data) ? data : []);
    } catch {
      setAvailableServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  // ── Load empleados for domicilio dropdown ─────────────────
  useEffect(() => {
    getAppUsers({ limit: 100 })
      .then(data => setEmpleados(Array.isArray(data) ? data : (data?.items ?? [])))
      .catch(() => setEmpleados([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    loadServicesB2C();
    api.get('/settings/abreviaciones')
      .then(data => setAbbreviations(data.abreviaciones || {}))
      .catch(() => setAbbreviations({}));

    // Load negocio config (localStorage first, then fresh)
    try {
      const cached = localStorage.getItem('washflow_negocio_config');
      if (cached) setNegocioConfig(JSON.parse(cached));
    } catch {}
    api.get('/configuracion/negocio')
      .then(data => {
        setNegocioConfig(data);
        localStorage.setItem('washflow_negocio_config', JSON.stringify(data));
      })
      .catch(() => {});

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Click outside dropdown ────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Ctrl+Enter submit ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
        handleSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [canSubmit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset form ────────────────────────────────────────────
  const resetDomicilio = useCallback(() => {
    setIsDomicilio(false);
    setDomicilioData({
      direccion_recogida: '', direccion_entrega: '',
      fecha_recogida: '', hora_recogida: '',
      fecha_entrega: '', hora_entrega: '',
      nombre_receptor: '', empleado_id: null, notas: '',
    });
  }, []);

  const resetForm = useCallback(() => {
    setClientSearch('');
    setSelectedClient(null);
    setClientResults([]);
    setShowDropdown(false);
    setItems([]);
    setDescuentoManual('');
    setPaymentStatus('Debe');
    setSingleMethod('Efectivo');
    setPayments(initPayments());
    setShowFidelityBanner(false);
    resetDomicilio();
  }, [resetDomicilio]);

  // ── Mode switch ───────────────────────────────────────────
  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    resetForm();
    if (newMode === 'B2C') {
      loadServicesB2C();
    } else {
      setAvailableServices([]);
    }
  };

  // ── Client search ─────────────────────────────────────────
  const handleClientSearch = (val) => {
    setClientSearch(val);
    setSelectedClient(null);
    setShowFidelityBanner(false);
    setFocusedClientIndex(-1);
    if (val.length < 2) {
      setClientResults([]);
      setShowDropdown(false);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await buscarClientes(val, mode);
        setClientResults(Array.isArray(results) ? results : []);
        setShowDropdown(true);
      } catch {
        setClientResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  // ── Select client ─────────────────────────────────────────
  const selectClient = (client) => {
    setSelectedClient(client);
    setClientSearch(client.user_name || '');
    setClientResults([]);
    setShowDropdown(false);
    setFocusedClientIndex(-1);
    setTimeout(() => {
      document.getElementById('service-search-input')?.focus();
    }, 50);

    // Fidelity check: next order (total_orders + 1) divisible by 5
    const nextOrder = (client.total_orders || 0) + 1;
    if (nextOrder > 0 && nextOrder % 5 === 0) {
      setShowFidelityBanner(true);
      setItems(prev => {
        if (prev.some(i => i.is_discount)) return prev;
        return [...prev, {
          id: 'discount-fidelity',
          service_id: null,
          service_name: '🎁 Descuento Fidelidad',
          quantity: 1,
          unit_price: -7000,
          description: `Descuento por orden #${nextOrder}`,
          is_agency: false,
          is_extra: false,
          is_discount: true,
        }];
      });
    }

    // B2B: reload services for this institution
    if (mode === 'B2B') {
      const instName = client.user_name;
      if (instName) loadServicesB2B(instName);
    }
  };

  const clearClient = () => {
    setSelectedClient(null);
    setClientSearch('');
    setShowFidelityBanner(false);
    setItems(prev => prev.filter(i => !i.is_discount));
    if (mode === 'B2B') setAvailableServices([]);
  };

  // ── Keyboard navigation on search ──────────────
  const handleSearchKeyDown = (e) => {
    if (!showDropdown || clientResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedClientIndex(prev => (prev < clientResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedClientIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const indexToSelect = focusedClientIndex >= 0 ? focusedClientIndex : 0;
      if (clientResults[indexToSelect]) {
        selectClient(clientResults[indexToSelect]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setFocusedClientIndex(-1);
    }
  };

  // ── Add service to items ──────────────────────────────────
  const addItem = useCallback((service, qty = 1) => {
    const newItem = {
      id: uid(),
      service_id: service.service_id,
      service_name: service.service_name,
      quantity: qty,
      unit_price: service.service_value,
      description: '',
      is_agency: isAgencyService(service.service_name),
      is_extra: false,
      is_discount: false,
    };
    setItems(prev => [newItem, ...prev]);
  }, []);

  const addExtraService = useCallback(() => {
    setItems(prev => [{
      id: uid(),
      service_id: null,
      service_name: '✨ Servicio Extra',
      quantity: 1,
      unit_price: 0,
      description: '',
      is_agency: false,
      is_extra: true,
      is_discount: false,
    }, ...prev]);
  }, []);

  const updateItem = useCallback((id, updates) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  const removeItem = useCallback((id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const addItemDirect = useCallback((item) => {
    setItems(prev => [...prev, item]);
  }, []);

  // ── Payment handlers ──────────────────────────────────────
  const handlePaymentChange = (method, field, value) => {
    setPayments(prev => prev.map(p =>
      p.method === method ? { ...p, [field]: value } : p
    ));
  };

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsCreating(true);
    try {
      const serviciosData = items.map(i => ({
        id: i.service_id,
        name: i.service_name,
        qty: parseFloat(i.quantity) || 0,
        value: i.unit_price,
        is_agency: i.is_agency,
        description: i.description,
        spent_per_service: i.agency_cost || 0,
      }));
      const itemsDescription = items.map(i => {
        const name = i.service_name || i.name;
        const qty = i.quantity || i.qty;
        const val = i.unit_price || i.value;
        const total = qty * val;
        const priceStr = `$${Math.round(total).toLocaleString('es-CO')}`;
        return `${qty}x ${name}${i.description ? ' ('+i.description+')' : ''} ... ${priceStr}`;
      }).join('\n');
      const discountVal = totalDiscountAmt;

      let result;
      if (mode === 'B2C') {
        const pagos = paymentStatus === 'Pagada'
          ? [{ monto: total, metodo_pago: singleMethod }]
          : payments
              .filter(p => p.enabled && parseFloat(p.amount) > 0)
              .map(p => ({ monto: parseFloat(p.amount), metodo_pago: p.method }));

        const domicilioPayload = isDomicilio ? {
          direccion_recogida: domicilioData.direccion_recogida,
          direccion_entrega: domicilioData.direccion_entrega,
          fecha_recogida: domicilioData.fecha_recogida || null,
          hora_recogida: domicilioData.hora_recogida || null,
          fecha_entrega: domicilioData.fecha_entrega || null,
          hora_entrega: domicilioData.hora_entrega || null,
          nombre_receptor: domicilioData.nombre_receptor || null,
          empleado_id: domicilioData.empleado_id || null,
          notas: domicilioData.notas || null,
        } : null;

        result = await crearOrdenB2C({
          user_id: selectedClient.user_id,
          servicios_data: serviciosData,
          items_description: itemsDescription,
          state_payment: paymentStatus,
          discount_value: discountVal,
          pagos,
          state_state: 'En progreso',
          is_domicilio: isDomicilio,
          domicilio: domicilioPayload,
        });
      } else {
        const abonoMethod = paymentStatus === 'Pagada'
          ? singleMethod
          : payments.find(p => p.enabled)?.method || 'Efectivo';

        result = await crearOrdenB2B({
          user_id: selectedClient.user_id,
          servicios_data: serviciosData,
          items_description: itemsDescription,
          state_payment: paymentStatus,
          payment_method: abonoMethod,
          discount_value: discountVal,
          abono: totalAbono,
          state_state: 'En progreso',
        });
      }

      // Build common order data
      const orderNum = result?.order_number ?? result?.order_id ?? result?.id ?? '—';
      const ordenParaImprimir = {
        ...result,
        servicios_data: items.map(i => ({
          qty: i.quantity,
          name: i.service_name,
          value: i.unit_price,
        })),
        user_contact: selectedClient?.user_contact || '',
      };

      // Print if selected
      if (deliveryPrint && !deliveryWhatsApp) {
        await printOrden(ordenParaImprimir, negocioConfig, 2);
      } else if (deliveryPrint && deliveryWhatsApp) {
        await printOrden(ordenParaImprimir, negocioConfig, 1);
      }

      // WhatsApp if selected
      if (deliveryWhatsApp && selectedClient?.user_contact) {
        const payload = buildPrintPayload(ordenParaImprimir, negocioConfig, 1);
        const waMessage = buildWhatsAppReceipt(payload, buildMessage);
        sendMessage(selectedClient.user_contact, waMessage);
      } else if (deliveryWhatsApp && !selectedClient?.user_contact) {
        addToast('⚠️ El cliente no tiene teléfono registrado para WhatsApp', 'error', '');
      }

      addToast(`✅ Orden #${orderNum} creada — ${selectedClient.user_name} — ${fmtCOP(total)}`, 'success', '');

      setSuccessFlash(true);
      setShowConfetti(true);
      setTimeout(() => {
        setSuccessFlash(false);
        setShowConfetti(false);
        resetForm();
      }, 1500);
    } catch (err) {
      addToast(err.message || 'Error al crear la orden', 'error', '❌');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className={`no-layout${successFlash ? ' no-layout--success' : ''}`}>
      {showConfetti && <Confetti />}
      <ToastContainer toasts={toasts} />

      {/* ── Main panel ──────────────────────────────────────── */}
      <div className="no-main">

        {/* Zone 1: Mode Toggle */}
        <div className="no-mode-toggle" role="group" aria-label="Tipo de orden">
          {[
            { id: 'B2C', icon: '👤', label: 'Cliente Particular' },
            { id: 'B2B', icon: '🏢', label: 'Institución' },
          ].map(opt => (
            <button
              key={opt.id}
              className={`no-mode-btn${mode === opt.id ? ' no-mode-btn--active' : ''}`}
              onClick={() => handleModeSwitch(opt.id)}
              aria-pressed={mode === opt.id}
            >
              <span className="no-mode-btn__icon">{opt.icon}</span>
              <span className="no-mode-btn__label">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Zone 2: Client Search */}
        <div className="no-card">
          <p className="no-section-title">
            {mode === 'B2C' ? 'Cliente' : 'Institución'}
          </p>

          <div className="no-client-search-wrap" ref={searchRef}>
            <span className="no-search-icon-pre">🔍</span>
            <input
              className="no-search-input"
              type="search"
              placeholder={mode === 'B2C'
                ? 'Buscar cliente por nombre o contacto...'
                : 'Buscar institución...'}
              value={clientSearch}
              onChange={e => handleClientSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-label={mode === 'B2C' ? 'Buscar cliente' : 'Buscar institución'}
              aria-expanded={showDropdown}
              autoComplete="off"
            />
            {searchLoading && <span className="no-search-spinner" />}

            {showDropdown && clientResults.length > 0 && (
              <div className="no-client-dropdown" role="listbox">
                {clientResults.map((c, index) => (
                  <div
                    key={c.user_id}
                    className={`no-client-result${index === focusedClientIndex ? ' no-client-result--focused' : ''}`}
                    onClick={() => selectClient(c)}
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') selectClient(c); }}
                  >
                    <div>
                      <div className="no-cr-name">{c.user_name}</div>
                      <div className="no-cr-sub">
                        {c.user_contact && `📞 ${c.user_contact}`}
                        {c.total_orders > 0 && ` · ${c.total_orders} órdenes`}
                      </div>
                    </div>
                    {c.loyalty_level && (
                      <span className="no-cr-badge">{c.loyalty_level}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showDropdown && clientResults.length === 0 && !searchLoading && (
              <div className="no-client-dropdown">
                <div className="no-dropdown-empty">Sin resultados para "{clientSearch}"</div>
              </div>
            )}
          </div>

          {/* Selected client card */}
          {selectedClient && (
            <div className="no-client-card">
              <div className="no-client-card__top">
                <div className="no-client-card__name">
                  {mode === 'B2C' ? '👤' : '🏢'} {selectedClient.user_name}
                </div>
                <button className="no-clear-btn" onClick={clearClient} aria-label="Cambiar cliente">
                  ✕ cambiar
                </button>
              </div>
              <div className="no-client-card__meta">
                {selectedClient.user_contact && <span>📞 {selectedClient.user_contact}</span>}
                {selectedClient.loyalty_level && <span>{selectedClient.loyalty_level}</span>}
                {selectedClient.total_orders > 0 && <span>{selectedClient.total_orders} órdenes</span>}
                {selectedClient.payment_condition && mode === 'B2B' && (
                  <span>{selectedClient.payment_condition}</span>
                )}
              </div>
              {selectedClient.saldo_a_favor > 0 && (
                <div className="no-client-card__saldo">
                  💰 Saldo a favor: {fmtCOP(selectedClient.saldo_a_favor)} (disponible para pago)
                </div>
              )}
            </div>
          )}

          {/* Fidelity banner */}
          {showFidelityBanner && selectedClient && (
            <div className="no-fidelity-banner" role="status">
              <span className="no-fidelity-banner__icon">🎁</span>
              <div className="no-fidelity-banner__text">
                <div className="no-fidelity-banner__title">¡DESCUENTO DE FIDELIDAD!</div>
                <div className="no-fidelity-banner__desc">
                  Esta es tu orden #{(selectedClient.total_orders || 0) + 1}. Aplicamos −$7,000
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3b: Domicilio Toggle */}
        <div className="no-card no-card--domicilio">
          <div className="no-domicilio-toggle-row">
            <span className="no-domicilio-toggle-label">🛵 ¿Es un domicilio?</span>
            <button
              type="button"
              className={`no-domicilio-switch${isDomicilio ? ' no-domicilio-switch--on' : ''}`}
              onClick={() => setIsDomicilio(v => !v)}
              aria-pressed={isDomicilio}
              aria-label="Activar domicilio"
            >
              <span className="no-domicilio-switch__track" />
              <span className="no-domicilio-switch__thumb" />
              <span className="no-domicilio-switch__label">{isDomicilio ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {isDomicilio && (
            <DomicilioForm
              domicilio={domicilioData}
              onChange={setDomicilioData}
              empleados={empleados}
            />
          )}
        </div>

        {/* Zone 4: Service Search Input */}
        <div className="no-card">
          <p className="no-section-title">Agregar servicio</p>
          <ServiceSearchInput services={availableServices} onAddItem={addItemDirect} abbreviations={abbreviations} />
        </div>

        {/* Zone 5: Items Table */}
        <div className="no-card">
          <p className="no-section-title">
            Servicios de la orden
            {items.length > 0 && (
              <span style={{
                marginLeft: 8,
                background: 'rgba(255,107,43,0.1)',
                color: '#FF6B2B',
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 700,
              }}>
                {items.filter(i => !i.is_discount).length}
              </span>
            )}
          </p>
          <ItemsTable items={items} onUpdate={updateItem} onRemove={removeItem} />
        </div>

        {/* Zone 6: Payment */}
        <div className="no-card">
          <PaymentSection
            paymentStatus={paymentStatus}
            onStatusChange={setPaymentStatus}
            singleMethod={singleMethod}
            onSingleMethod={setSingleMethod}
            payments={payments}
            onPaymentChange={handlePaymentChange}
            saldoAFavor={selectedClient?.saldo_a_favor || 0}
            totalAbono={totalAbono}
            total={total}
          />
        </div>

        {/* Zone 7: Totals + Create */}
        <TotalsPanel
          subtotal={subtotal}
          discountAmt={discountAmt}
          descuentoManual={descuentoManual}
          onDescuentoManualChange={setDescuentoManual}
          total={total}
          totalAbono={totalAbono}
          saldoPendiente={saldoPendiente}
          paymentStatus={paymentStatus}
          canSubmit={canSubmit}
          disabledReason={disabledReason}
          isCreating={isCreating}
          onSubmit={handleSubmit}
          deliveryPrint={deliveryPrint}
          deliveryWhatsApp={deliveryWhatsApp}
          onDeliveryPrint={setDeliveryPrint}
          onDeliveryWhatsApp={setDeliveryWhatsApp}
          hasClientPhone={!!selectedClient?.user_contact}
        />
      </div>

      {/* ── Service panel ───────────────────────────────────── */}
      <ServicePanel
        services={availableServices}
        loading={servicesLoading}
        serviceSearch={serviceSearch}
        onSearchChange={setServiceSearch}
        onAdd={addItem}
        onAddExtra={addExtraService}
      />

      {/* ── Printing Component (Comentado) ──
      {printData && (
        <div style={{ display: 'none' }}>
          <PrintInvoice orderData={printData} />
        </div>
      )}
      */}
    </div>
  );
}
