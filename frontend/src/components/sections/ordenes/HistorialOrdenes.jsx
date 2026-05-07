import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getHistorialOrdenes, getOrdenesStats, deleteOrden, updateOrdenEstado, entregarOrden, getOrdenDetalle, updateOrderDetail } from '../../../services/ordenes';
import PrintInvoice from '../../ui/PrintInvoice';
import { printOrden, isPrintAvailable } from '../../../services/print';
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

const fmtDateTime = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
};

const truncate = (str, max) => {
  if (!str) return null;
  return str.length > max ? str.slice(0, max) + '…' : str;
};

const ACTIVE_STATUSES = ['Recibida', 'En progreso', 'Lista para entregar'];

// ── Badge helpers ─────────────────────────────────────────────────────────────
const PAGO_CFG = {
  'Pagada':         { cls: 'ho-badge--green',  label: 'Pagada' },
  'Debe':           { cls: 'ho-badge--red',    label: 'Debe' },
  'Abono parcial':  { cls: 'ho-badge--orange', label: 'Abono parcial' },
  'Cancelada':      { cls: 'ho-badge--gray',   label: 'Cancelada' },
};
const ORDEN_CFG = {
  'Recibida':              { cls: 'ho-badge--gray',   label: 'Recibida' },
  'En progreso':            { cls: 'ho-badge--blue',   label: 'En progreso' },
  'Lista para entregar':   { cls: 'ho-badge--purple', label: 'Lista' },
  'Entregada':             { cls: 'ho-badge--green',  label: 'Entregada' },
  'Cancelada':             { cls: 'ho-badge--red',    label: 'Cancelada' },
};

function Badge({ value, cfg }) {
  const c = cfg[value] || { cls: 'ho-badge--gray', label: value || '—' };
  return <span className={`ho-badge ${c.cls}`}>{c.label}</span>;
}

function _domicilioEstadoKey(estado) {
  if (!estado) return 'gray';
  if (estado === 'Pendiente') return 'pending';
  if (estado === 'En camino recogida') return 'amber';
  if (estado === 'Recogido') return 'blue';
  if (estado === 'En camino entrega') return 'orange';
  if (estado === 'Entregado') return 'green';
  return 'gray';
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="ho-skel-row">
      {Array.from({ length: 17 }).map((__, j) => (
        <td key={j}><span className="ho-skel" style={{ width: `${50 + ((i * 3 + j * 7) % 40)}%` }} /></td>
      ))}
    </tr>
  ));
}

// ── Stat card with count-up ───────────────────────────────────────────────────
function StatCard({ icon, label, value, formatted, accentClass, loading, onClick, link }) {
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
    <div
      className={`ho-stat-card ${accentClass || ''}${onClick ? ' ho-stat-card--clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <span className="ho-stat-icon">{icon}</span>
      <div className="ho-stat-body">
        <span className="ho-stat-label">{label}</span>
        {loading
          ? <span className="ho-skel ho-skel--val" />
          : <span className="ho-stat-value">
              {formatted ? fmtCOP(display) : display.toLocaleString('es-CO')}
            </span>
        }
        {link && !loading && (
          <span className="ho-stat-link">{link} →</span>
        )}
      </div>
    </div>
  );
}

// ── Signature Canvas ──────────────────────────────────────────────────────────
function SignatureCanvas({ canvasRef }) {
  const isDrawingRef = useRef(false);
  const lastPosRef   = useRef({ x: 0, y: 0 });

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e, canvas);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1A1A1A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const endDraw = (e) => {
    e.preventDefault();
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="ho-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="ho-canvas"
        width={600}
        height={150}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        style={{ touchAction: 'none' }}
        aria-label="Canvas para firma del cliente"
      />
      <div className="ho-canvas-placeholder">toca aquí para firmar</div>
      <button type="button" className="ho-btn ho-btn--ghost ho-btn--sm ho-canvas-clear" onClick={clearCanvas}>
        Limpiar firma
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HistorialOrdenes({ user, onNavigate }) {
  const [orders, setOrders]       = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError]         = useState(null);
  const [uniqueStatuses, setUniqueStatuses] = useState([]);
  const [filters, setFilters]     = useState({
    estado_pago: '', estado_orden: '', cliente: '', desde: '', hasta: '', is_institute: ''
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, total_pages: 0 });
  const [sortConfig, setSortConfig] = useState({ field: 'id', direction: 'desc' });
  const [drawerOrder, setDrawerOrder] = useState(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [drawerDetails, setDrawerDetails] = useState([]);     // OrderDetail[] del drawer
  const [drawerDetailsLoading, setDrawerDetailsLoading] = useState(false);
  const [savingDetailId, setSavingDetailId] = useState(null); // id del detalle que se está guardando
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editOrder, setEditOrder]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [toast, setToast]           = useState(null);
  const [printerAvailable, setPrinterAvailable] = useState(false);
  const [printingId, setPrintingId] = useState(null);

  // ── Delivery modal state ───────────────────────────────────────────────────
  const [isEntregarOpen, setIsEntregarOpen]               = useState(false);
  const [deliverySearch, setDeliverySearch]               = useState('');
  const [deliveryResults, setDeliveryResults]             = useState([]);
  const [deliverySearching, setDeliverySearching]         = useState(false);
  const [deliveryResultsVisible, setDeliveryResultsVisible] = useState(false);
  const [selectedDeliveryOrder, setSelectedDeliveryOrder] = useState(null);
  const [highlightedDeliveryIdx, setHighlightedDeliveryIdx] = useState(0);
  const [receivedByName, setReceivedByName]               = useState('');
  const [receivedByCedula, setReceivedByCedula]           = useState('');
  const [invoiceDelivered, setInvoiceDelivered]           = useState(false);
  const [isDelivering, setIsDelivering]                   = useState(false);
  const [deliveryError, setDeliveryError]                 = useState(null);
  const [deliverySuccess, setDeliverySuccess]             = useState(false);
  const [deliveryMetodoPago, setDeliveryMetodoPago]       = useState('Efectivo');
  const [deliveryEstadoOrden, setDeliveryEstadoOrden]     = useState('Entregada');
  const [deliveryEstadoPago, setDeliveryEstadoPago]       = useState('Pagada');
  const isTablet = typeof window !== 'undefined' && window.innerWidth <= 1024;

  const debounceRef         = useRef(null);
  const tableRef            = useRef(null);
  const pendingClienteRef   = useRef('');
  const deliveryDebounceRef = useRef(null);
  const deliverySearchRef   = useRef(null);
  const canvasRef           = useRef(null);
  const modalBodyRef        = useRef(null);

  // ── Sync receiver info when invoice is delivered ──────────────────────────
  useEffect(() => {
    if (invoiceDelivered && selectedDeliveryOrder) {
      setReceivedByName(selectedDeliveryOrder.user_name || '');
      setReceivedByCedula(String(selectedDeliveryOrder.user_id || ''));
    } else if (!invoiceDelivered && selectedDeliveryOrder) {
      // If user toggles back to "No", we might want to clear it or let them edit.
      // The user says "si esta puesto en no si sera obligatorio poner la informacion".
      // Let's clear to force input if it was mirrored before.
      setReceivedByName('');
      setReceivedByCedula('');
    }
  }, [invoiceDelivered, selectedDeliveryOrder]);

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
    if (merged.is_institute !== '') params.is_institute = merged.is_institute;
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

  const fetchStats = useCallback(async (overrides = {}) => {
    setStatsLoading(true);
    const merged = { ...filters, ...overrides };
    const params = {};
    if (merged.estado_pago)  params.estado_pago  = merged.estado_pago;
    if (merged.estado_orden) params.estado_orden = merged.estado_orden;
    if (merged.cliente)      params.cliente      = merged.cliente;
    if (merged.desde)        params.desde        = merged.desde;
    if (merged.hasta)        params.hasta        = merged.hasta;
    if (merged.is_institute !== '') params.is_institute = merged.is_institute;
    
    try {
      const s = await getOrdenesStats(params);
      setStats(s);
    } catch { /* stats are non-critical */ }
    finally { setStatsLoading(false); }
  }, [filters]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    fetchOrders({ page: 1 });
    isPrintAvailable().then(setPrinterAvailable);
    
    // Fetch unique statuses for the filter dropdown
    import('../../../services/ordenes').then(m => {
      if (m.getHistorialStatuses) {
        m.getHistorialStatuses().then(setUniqueStatuses).catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ESC key handling ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (isEntregarOpen) closeEntregarModal();
        else if (editOrder)  setEditOrder(null);
        else if (deleteConfirm) setDeleteConfirm(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isEntregarOpen, editOrder, deleteConfirm]);

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  const toggleInstitute = (val) => {
    handleDropdownChange('is_institute', val);
  };

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
      fetchStats({ cliente: pendingClienteRef.current });
    }, 400);
  };

  const handleDropdownChange = (key, value) => {
    setFilter(key, value);
    fetchOrders({ page: 1, [key]: value });
    fetchStats({ [key]: value });
  };

  const handleDateChange = (key, value) => {
    setFilter(key, value);
    fetchOrders({ page: 1, [key]: value });
    fetchStats({ [key]: value });
  };

  const handleSearch = () => {
    clearTimeout(debounceRef.current);
    fetchOrders({ page: 1 });
    fetchStats();
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    const empty = { estado_pago: '', estado_orden: '', cliente: '', desde: '', hasta: '', is_institute: '' };
    setFilters(empty);
    fetchOrders({ page: 1, ...empty });
    fetchStats({ is_institute: '' });
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
  const openDrawer  = async (order) => {
    setDrawerClosing(false);
    setDrawerOrder(order);
    setDrawerDetails([]);
    setDrawerDetailsLoading(true);
    try {
      const dets = await getOrdenDetalle(order.id);
      // Estado local editable inicial
      setDrawerDetails(
        (dets || []).map(d => ({
          ...d,
          _is_agency: !!d.is_agency,
          _spent: Number(d.spent_per_order || 0),
          _dirty: false,
        }))
      );
    } catch {
      setDrawerDetails([]);
    } finally {
      setDrawerDetailsLoading(false);
    }
  };
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerOrder(null); setDrawerClosing(false); setDrawerDetails([]); }, 240);
  };

  // Guardar cambios de un detalle específico
  const handleSaveDetail = async (detailId) => {
    if (!drawerOrder) return;
    const det = drawerDetails.find(d => d.id === detailId);
    if (!det) return;
    setSavingDetailId(detailId);
    try {
      const payload = {
        is_agency:       det._is_agency,
        spent_per_order: det._is_agency ? Number(det._spent || 0) : 0,
      };
      const res = await updateOrderDetail(drawerOrder.id, detailId, payload);
      const ordenActualizada = res.orden || {};
      // Actualizar drawer con nuevos totales del header
      setDrawerOrder(prev => ({
        ...prev,
        total_amount:     ordenActualizada.order_value ?? prev.total_amount,
        balance_due:      ordenActualizada.restante ?? prev.balance_due,
        is_paid:          ordenActualizada.state_payment === 'Pagada',
        estado_pago:      ordenActualizada.state_payment ?? prev.estado_pago,
        agency_cost:      ordenActualizada.spent_per_order ?? prev.agency_cost,
        net_income_value: ordenActualizada.net_income_value ?? prev.net_income_value,
      }));
      setDrawerDetails(prev => prev.map(d =>
        d.id === detailId
          ? { ...d, is_agency: det._is_agency, spent_per_order: payload.spent_per_order, _dirty: false }
          : d
      ));
      const warns = res.warnings || [];
      if (warns.includes('total_cambio_pagada')) {
        showToast('El total cambió pero la orden ya estaba pagada. Verifica saldos.', 'info');
      } else if (warns.includes('entregada')) {
        showToast('Detalle actualizado (orden ya entregada — afecta reportes históricos)', 'info');
      } else {
        showToast('✓ Detalle actualizado', 'success');
      }
      // Refrescar la lista del historial en background
      fetchOrders();
      fetchStats();
    } catch (err) {
      showToast(err.message || 'Error al guardar detalle', 'error');
    } finally {
      setSavingDetailId(null);
    }
  };

  const handleWhatsAppOrder = (order) => {
    if (!order.user_contact) {
      showToast('El cliente no tiene un número de contacto registrado', 'error');
      return;
    }

    const cleanPhone = order.user_contact.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
    
    let businessName = 'Lavalatu';
    try {
      const cached = localStorage.getItem('washflow_negocio_config');
      if (cached) {
        const config = JSON.parse(cached);
        if (config.nombre_negocio) businessName = config.nombre_negocio;
      }
    } catch (e) {}

    const message = `Hola ${order.user_name}, te saludamos de ${businessName}. Te contactamos por la orden #${order.order_number ?? order.id} (${order.order_status}).`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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
      fetchOrders({ page: pagination.page });
      fetchStats();
      if (drawerOrder?.id === editOrder.id) closeDrawer();
    } catch (err) {
      showToast(err.message || 'No se pudo actualizar', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delivery modal ───────────────────────────────────────────────────────────
  const openEntregarModal = () => {
    setIsEntregarOpen(true);
    setDeliverySearch('');
    setDeliveryResults([]);
    setDeliveryResultsVisible(false);
    setSelectedDeliveryOrder(null);
    setReceivedByName('');
    setReceivedByCedula('');
    setInvoiceDelivered(false);
    setDeliveryError(null);
    setDeliverySuccess(false);
    setHighlightedDeliveryIdx(0);
    setDeliveryMetodoPago('Efectivo');
    setDeliveryEstadoOrden('Entregada');
    setDeliveryEstadoPago('Pagada');
    setTimeout(() => deliverySearchRef.current?.focus(), 80);
  };

  const closeEntregarModal = () => {
    if (isDelivering) return;
    setIsEntregarOpen(false);
  };

  const getSignatureBase64 = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasDrawing = imageData.data.some((val, i) => i % 4 !== 3 && val !== 255);
    if (!hasDrawing) return null;
    return canvas.toDataURL('image/png').split(',')[1];
  };

  const handleDeliverySearch = (e) => {
    const q = e.target.value;
    setDeliverySearch(q);
    setSelectedDeliveryOrder(null);
    setHighlightedDeliveryIdx(0);

    if (!q.trim()) {
      setDeliveryResults([]);
      setDeliveryResultsVisible(false);
      return;
    }

    // Client-side filter on already-loaded orders
    const qLow = q.toLowerCase();
    const local = orders.filter(o =>
      (
        String(o.id).includes(qLow) ||
        (o.user_name || '').toLowerCase().includes(qLow) ||
        (o.items_description || '').toLowerCase().includes(qLow) ||
        (o.received_by_name || '').toLowerCase().includes(qLow)
      )
    ).slice(0, 8);

    if (local.length > 0) {
      setDeliveryResults(local);
      setDeliveryResultsVisible(true);
    }

    // Also fetch from server
    clearTimeout(deliveryDebounceRef.current);
    deliveryDebounceRef.current = setTimeout(async () => {
      setDeliverySearching(true);
      try {
        const res = await getHistorialOrdenes({ cliente: q, limit: 20, page: 1 });
        const results = res.data ?? [];
        
        if (results.length > 0) {
          setDeliveryResults(results);
          setDeliveryResultsVisible(true);
        } else if (local.length === 0) {
          setDeliveryResults([]);
          setDeliveryResultsVisible(true); // show empty state
        }
      } catch { /* use local results */ }
      finally { setDeliverySearching(false); }
    }, 300);
  };

  const handleDeliverySearchKeyDown = (e) => {
    if (!deliveryResultsVisible || deliveryResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedDeliveryIdx(i => (i + 1) % deliveryResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedDeliveryIdx(i => (i - 1 + deliveryResults.length) % deliveryResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (deliveryResults[highlightedDeliveryIdx]) {
        selectDeliveryOrder(deliveryResults[highlightedDeliveryIdx]);
      }
    } else if (e.key === 'Escape') {
      setDeliveryResultsVisible(false);
      setDeliverySearch('');
      setDeliveryResults([]);
    }
  };

  const selectDeliveryOrder = (order) => {
    setSelectedDeliveryOrder(order);
    setDeliverySearch(`Orden #${order.order_number ?? order.id} — ${order.user_name} ✅`);
    setDeliveryResultsVisible(false);
    setDeliveryEstadoPago(order.estado_pago === 'Pagada' ? 'Pagada' : 'Pagada'); // Default to Pagada for delivery
    setHighlightedDeliveryIdx(0);
  };

  const deliverValidByName = invoiceDelivered || receivedByName.trim();
  const deliverValidByCedula = invoiceDelivered || receivedByCedula.trim();
  const canConfirmDelivery = !!selectedDeliveryOrder && deliverValidByName && deliverValidByCedula;

  const handleConfirmDelivery = async () => {
    if (!canConfirmDelivery) return;
    setIsDelivering(true);
    setDeliveryError(null);
    try {
      setDeliverySuccess(true);
      await entregarOrden(selectedDeliveryOrder.id, {
        received_by_name:   invoiceDelivered ? null : receivedByName.trim(),
        received_by_cedula: invoiceDelivered ? null : receivedByCedula.trim(),
        invoice_delivered:  invoiceDelivered,
        delivery_signature: getSignatureBase64(),
        metodo_pago:        deliveryEstadoPago === 'Pagada' ? deliveryMetodoPago : null,
        order_status:       deliveryEstadoOrden,
        estado_pago:        deliveryEstadoPago,
      });

      // Update the order in local state
      const orderId  = selectedDeliveryOrder.id;
      const hadDebt  = selectedDeliveryOrder.balance_due > 0;
      const nameWho  = receivedByName.trim();

      setOrders(prev => prev.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          order_status: deliveryEstadoOrden,
          estado_pago:  deliveryEstadoPago,
          balance_due:  deliveryEstadoPago === 'Pagada' ? 0 : o.balance_due,
          delivery_received_by: nameWho,
          delivery_date: new Date().toISOString(),
          delivery_invoice_delivered: invoiceDelivered,
        };
      }));

      setTimeout(() => {
        setIsEntregarOpen(false);
        setDeliverySuccess(false);
        showToast(`Orden #${orderId} entregada — Recibió: ${nameWho}`, 'success');
        fetchStats();
      }, 600);
    } catch (err) {
      setDeliverySuccess(false);
      setDeliveryError(err.message || 'Error al registrar la entrega');
    } finally {
      setIsDelivering(false);
    }
  };

  const handleReprint = async (order) => {
    const orderId = order.id ?? order.order_id;
    if (printingId === orderId) return;
    setPrintingId(orderId);
    try {
      let fullOrder = order;
      // If we don't have servicios_data (common in history list), fetch it
      if (!order.servicios_data || order.servicios_data.length === 0) {
        try {
          const detail = await getOrdenDetalle(orderId);
          fullOrder = {
            ...order,
            servicios_data: detail.map(d => ({
              qty: d.qty,
              name: d.name,
              value: d.value
            }))
          };
        } catch (e) {
          console.error("Error fetching detail for print:", e);
        }
      }

      let negocioConfig = null;
      try {
        const cached = localStorage.getItem('washflow_negocio_config');
        if (cached) negocioConfig = JSON.parse(cached);
      } catch {}

      const result = await printOrden(fullOrder, negocioConfig, 1);
      if (result.success) {
        showToast(`🖨️ Recibo #${orderId} enviado a impresora`, 'success');
      } else {
        showToast('No se pudo conectar con la impresora', 'error');
      }
    } catch {
      showToast('No se pudo conectar con la impresora', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  // ── Toast ────────────────────────────────────────────────────────────────────
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  // ── Pagination display ───────────────────────────────────────────────────────
  const { page, limit, total, total_pages } = pagination;
  const fromItem = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total);
  const toItem   = Math.min(page * limit, total);
  const pageNums = buildPageNums();

  // ── Stats cards data ─────────────────────────────────────────────────────────
  const goToCartera = onNavigate ? () => onNavigate('facturas-cobrar') : undefined;

  const statCards = [
    { icon: '📦', label: 'Total Órdenes',     value: stats?.total_ordenes ?? 0,     formatted: false, accentClass: '' },
    { icon: '💰', label: 'Total Recaudado',   value: stats?.total_recaudado ?? 0,   formatted: true,  accentClass: '' },
    { icon: '🧾', label: 'Órdenes con Deuda', value: stats?.ordenes_debe ?? 0,      formatted: false, accentClass: (stats?.ordenes_debe > 0) ? 'ho-stat-card--orange' : '', onClick: goToCartera, link: 'Ver detalle' },
    { icon: '⚠️', label: 'Monto por Cobrar',  value: stats?.monto_por_cobrar ?? 0,  formatted: true,  accentClass: (stats?.monto_por_cobrar > 0) ? 'ho-stat-card--red' : '',   onClick: goToCartera, link: 'Ver detalle' },
  ];

  return (
    <div className="ho-root">
      {/* ── Header ── */}
      <div className="ho-header">
        <div>
          <h1 className="ho-title">Historial de Órdenes</h1>
          <p className="ho-subtitle">Registro completo de todas las órdenes del negocio</p>
        </div>
        
        <div className="ho-institute-toggle">
          <div className="sa-segment-group" style={{ marginBottom: 0 }}>
            <button 
              className={`sa-segment-btn ${filters.is_institute === '' ? 'sa-segment-btn--active' : ''}`}
              onClick={() => toggleInstitute('')}
            >Todos</button>
            <button 
              className={`sa-segment-btn ${filters.is_institute === false ? 'sa-segment-btn--active' : ''}`}
              onClick={() => toggleInstitute(false)}
            >Usuario</button>
            <button 
              className={`sa-segment-btn ${filters.is_institute === true ? 'sa-segment-btn--active' : ''}`}
              onClick={() => toggleInstitute(true)}
            >Institución</button>
          </div>
        </div>

        <div className="ho-header-actions">
          <button className="ho-btn ho-btn--entregar" onClick={openEntregarModal}>
            🚚 Entregar Orden
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="ho-stats-bar">
        {statCards.map((c) => (
          <StatCard key={c.label} {...c} loading={statsLoading} onClick={c.onClick} link={c.link} />
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
            {uniqueStatuses.length > 0 ? (
              uniqueStatuses.map(s => (
                <option key={s} value={s}>{ORDEN_CFG[s]?.label || s}</option>
              ))
            ) : (
              // Fallback to defaults if uniqueStatuses not yet loaded or empty
              <>
                <option value="Recibida">Recibida</option>
                <option value="En progreso">En progreso</option>
                <option value="Lista para entregar">Lista para entregar</option>
                <option value="Entregada">Entregada</option>
                <option value="Cancelada">Cancelada</option>
              </>
            )}
          </select>
        </div>

        <div className="ho-filter-group ho-filter-group--grow">
          <label className="ho-filter-label">
            Buscar
            {filters.cliente && <span className="ho-filter-dot" />}
          </label>
          <div className="ho-input-wrap">
            <span className="ho-input-icon">🔍</span>
            <input
              className="ho-input"
              type="text"
              placeholder="Orden, cliente, contacto..."
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
              <th className="ho-th ho-th--id ho-th--sortable" onClick={() => handleSort('order_number')}>
                # Orden <SortIcon field="order_number" />
              </th>
              <th className="ho-th">Factura Global</th>
              <th className="ho-th">Creación</th>
              <th className="ho-th">Días</th>
              <th className="ho-th">Estado Orden</th>
              <th className="ho-th">Estado Pago</th>
              <th className="ho-th">Domicilio</th>
              <th className="ho-th ho-th--sortable" onClick={() => handleSort('user_name')}>
                Nombre / Institución <SortIcon field="user_name" />
              </th>
              <th className="ho-th">Contacto</th>
              <th className="ho-th ho-th--num">Subtotal</th>
              <th className="ho-th ho-th--num">Descuento</th>
              <th className="ho-th ho-th--num">Total Cliente</th>
              <th className="ho-th ho-th--num">Abonos</th>
              <th className="ho-th ho-th--num">Restante</th>
              <th className="ho-th ho-th--num">Costo Agencia</th>
              <th className="ho-th ho-th--num">Ingreso Neto</th>
              <th className="ho-th ho-th--desc">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={13}>
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
                  className={`ho-row${o.order_status === 'Entregada' ? ' ho-row--delivered' : ''}`}
                  style={{ animationDelay: `${idx * 35}ms` }}
                  onClick={() => openDrawer(o)}
                >
                  <td className="ho-td ho-td--actions" onClick={e => e.stopPropagation()}>
                    <div className="ho-actions">
                      {printerAvailable && (
                        <button
                          className={`ho-action-btn ho-action-btn--print${printingId === o.id ? ' ho-action-btn--printing' : ''}`}
                          title="Reimprimir recibo"
                          disabled={printingId === o.id}
                          onClick={e => { e.stopPropagation(); handleReprint(o); }}
                        >
                          {printingId === o.id ? <span className="ho-print-spinner" /> : '🖨️'}
                        </button>
                      )}
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
                      {o.delivery_received_by && (
                        <span
                          className="ho-action-btn ho-delivered-icon"
                          title={`Entregado: ${fmtDateTime(o.delivery_date)} • Recibió: ${o.delivery_received_by} • Factura: ${o.delivery_invoice_delivered ? 'Sí' : 'No'}`}
                        >📋</span>
                      )}
                    </div>
                  </td>
                  <td className="ho-td ho-td--id">#{o.order_number ?? o.id}</td>
                  <td className="ho-td">
                    {o.consolidated_invoice_id
                      ? <span className="ho-invoice-link">F-{o.consolidated_invoice_id}</span>
                      : <span className="ho-na">N/A</span>}
                  </td>
                  <td className="ho-td ho-td--date">{fmtDateTime(o.date)}</td>
                  <td className={`ho-td ho-td--days ${o.days_passed > 3 ? 'ho-td--late' : ''}`}>
                    {o.days_passed} {o.days_passed === 1 ? 'día' : 'días'}
                  </td>
                  <td className="ho-td">
                    <Badge value={o.order_status} cfg={ORDEN_CFG} />
                  </td>
                  <td className="ho-td">
                    <Badge value={o.estado_pago} cfg={PAGO_CFG} />
                  </td>
                  <td className="ho-td ho-td--domicilio" onClick={e => e.stopPropagation()}>
                    {o.is_domicilio ? (
                      <div className="ho-domicilio-cell">
                        <span className="ho-badge ho-badge--domicilio">🛵 Domicilio</span>
                        {o.domicilio?.estado_domicilio && (
                          <span className={`ho-badge ho-badge--dom-${_domicilioEstadoKey(o.domicilio.estado_domicilio)}`}>
                            {o.domicilio.estado_domicilio}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="ho-na">—</span>
                    )}
                  </td>
                  <td className="ho-td ho-td--client">
                    {o.is_institute && <span className="ho-b2b-icon">🏢</span>}
                    <span className="ho-client-name">{o.user_name}</span>
                  </td>
                  <td className="ho-td ho-td--contact">{o.user_contact || '—'}</td>
                  <td className="ho-td ho-td--num">{fmtCOP(o.subtotal)}</td>
                  <td className="ho-td ho-td--num ho-td--muted">{fmtCOP(o.discount)}</td>
                  <td className="ho-td ho-td--num ho-td--bold">{fmtCOP(o.total_amount)}</td>
                  <td className="ho-td ho-td--num ho-td--green">{fmtCOP(o.total_paid)}</td>
                  <td className={`ho-td ho-td--num ${o.balance_due > 0 ? 'ho-td--debt' : ''}`}>
                    {fmtCOP(o.balance_due)}
                  </td>
                  <td className="ho-td ho-td--num ho-td--red">{fmtCOP(o.agency_cost)}</td>
                  <td className="ho-td ho-td--num ho-td--net">{fmtCOP(o.net_income_value)}</td>
                  <td className="ho-td ho-td--desc" title={o.items_description}>
                    {truncate(o.items_description, 40) || '—'}
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
      {drawerOrder && createPortal(
        <div className={`ho-drawer-overlay ${drawerClosing ? 'ho-drawer-overlay--out' : ''}`} onClick={closeDrawer}>
          <aside
            className={`ho-drawer ${drawerClosing ? 'ho-drawer--out' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="ho-drawer-header">
              <div>
                <h2 className="ho-drawer-title">Orden #{drawerOrder.order_number ?? drawerOrder.id}</h2>
                <p className="ho-drawer-date">{fmtDate(drawerOrder.date)}</p>
              </div>
              <button className="ho-drawer-close" onClick={closeDrawer}>✕</button>
            </div>

            <div className="ho-drawer-badges">
              <Badge value={drawerOrder.estado_pago} cfg={PAGO_CFG} />
              <Badge value={drawerOrder.order_status} cfg={ORDEN_CFG} />
            </div>

            <div className="ho-drawer-client">
              {drawerOrder.is_institute && <span className="ho-b2b-icon ho-b2b-icon--lg">🏢</span>}
              <span className="ho-drawer-client-name">{drawerOrder.user_name}</span>
            </div>
            {drawerOrder.consolidated_invoice_id && (
              <p className="ho-drawer-invoice">
                Factura consolidada: <span className="ho-invoice-link">#{drawerOrder.consolidated_invoice_id}</span>
              </p>
            )}

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

            {/* ── Detalles editables (servicios de la orden) ────────────── */}
            <div className="ho-drawer-items">
              <p className="ho-drawer-items-label">
                Servicios de la orden
                {drawerOrder.order_status === 'Entregada' && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#B45309', background: '#FEF3C7', padding: '2px 8px', borderRadius: 4 }}>
                    ⚠ orden entregada
                  </span>
                )}
              </p>
              {drawerOrder.consolidated_invoice_id ? (
                <p style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
                  Esta orden está consolidada en una factura B2B; los detalles se editan desde el flujo B2B.
                </p>
              ) : drawerDetailsLoading ? (
                <p style={{ fontSize: 12, color: '#888' }}>Cargando detalles…</p>
              ) : drawerDetails.length === 0 ? (
                <p style={{ fontSize: 12, color: '#888' }}>
                  {drawerOrder.items_description || 'Sin detalles registrados.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {drawerDetails.map(d => {
                    const flagOrange = d._is_agency && (!d._spent || Number(d._spent) === 0);
                    return (
                      <div key={d.id ?? d.name}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          background: '#FAF8F3',
                          borderLeft: flagOrange ? '4px solid #F59E0B' : '4px solid transparent',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{d.name}</p>
                            <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0 0' }}>
                              {d.qty} × {fmtCOP(d.value)} = <strong>{fmtCOP(Number(d.qty) * Number(d.value))}</strong>
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={d._is_agency}
                              disabled={!d.id || savingDetailId === d.id}
                              onChange={e => {
                                const checked = e.target.checked;
                                setDrawerDetails(prev => prev.map(x =>
                                  x.id === d.id ? { ...x, _is_agency: checked, _dirty: true } : x
                                ));
                              }}
                            />
                            🏭 Agencia
                          </label>
                          {d._is_agency && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              Costo agencia:
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={d._spent}
                                disabled={!d.id || savingDetailId === d.id}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDrawerDetails(prev => prev.map(x =>
                                    x.id === d.id ? { ...x, _spent: val, _dirty: true } : x
                                  ));
                                }}
                                style={{ width: 100, padding: '4px 6px', border: '1px solid #DDD', borderRadius: 4, fontSize: 12 }}
                              />
                            </label>
                          )}
                          {d._dirty && d.id && (
                            <button
                              onClick={() => handleSaveDetail(d.id)}
                              disabled={savingDetailId === d.id}
                              style={{
                                marginLeft: 'auto', padding: '4px 12px', borderRadius: 4,
                                background: '#10B981', color: '#FFF', border: 'none',
                                fontSize: 12, cursor: 'pointer', fontWeight: 600,
                              }}>
                              {savingDetailId === d.id ? '⏳' : 'Guardar'}
                            </button>
                          )}
                        </div>
                        {flagOrange && (
                          <p style={{ fontSize: 11, color: '#B45309', margin: '6px 0 0 0' }}>
                            ⚠ Marcaste agencia pero no hay costo. Agrega el monto o desmarca.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ho-drawer-footer">
              <button className="ho-btn ho-btn--primary" onClick={() => openEdit(drawerOrder)}>
                ✏️ Editar orden
              </button>
              {drawerOrder.order_status !== 'Entregada' && (
                <button className="wa-btn" onClick={() => handleWhatsAppOrder(drawerOrder)} style={{ width: '100%', justifyContent: 'center', height: '40px' }}>
                  📱 WhatsApp →
                </button>
              )}
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
      , document.body)}

      {/* ── Edit modal ── */}
      {editOrder && createPortal(
        <div className="ho-modal-overlay" onClick={() => !editSaving && setEditOrder(null)}>
          <div className="ho-modal ho-modal--edit" onClick={e => e.stopPropagation()}>
            <div className="ho-modal-header">
              <div>
                <h3 className="ho-modal-title">Editar Orden #{editOrder.order_number ?? editOrder.id}</h3>
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

              <div className="ho-edit-divider"><span>Registrar pago adicional (opcional)</span></div>

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
                >Cancelar</button>
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
      , document.body)}

      {/* ── Delete confirm modal ── */}
      {deleteConfirm && createPortal(
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
      , document.body)}

      {/* ── Entregar Orden modal ── */}
      {isEntregarOpen && createPortal(
        <div
          className="ho-modal-overlay ho-entregar-overlay"
          onClick={closeEntregarModal}
          role="dialog"
          aria-modal="true"
          aria-label="Entregar Orden"
        >
          <div
            className={`ho-modal ho-modal--entregar${deliverySuccess ? ' ho-modal--success-flash' : ''}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="ho-modal-header ho-entregar-header">
              <div>
                <h3 className="ho-modal-title ho-entregar-title">🚚 Entregar Orden</h3>
                <p className="ho-modal-sub">Busca la orden y registra la entrega</p>
              </div>
              <button
                className="ho-drawer-close"
                onClick={closeEntregarModal}
                disabled={isDelivering}
                aria-label="Cerrar modal"
              >✕</button>
            </div>

            {/* Error banner */}
            {deliveryError && (
              <div className="ho-entregar-error" role="alert">
                <span>⚠️ {deliveryError}</span>
                <button
                  className="ho-btn ho-btn--ghost ho-btn--sm"
                  onClick={() => setDeliveryError(null)}
                >✕</button>
              </div>
            )}

            {/* Search section — outside scroll body so dropdown isn't clipped */}
            <div className="ho-entregar-search-section">
                <div className="ho-entregar-search-wrap">
                  <span className="ho-entregar-search-icon" aria-hidden="true">🔍</span>
                  <input
                    ref={deliverySearchRef}
                    className={`ho-entregar-search-input${selectedDeliveryOrder ? ' ho-entregar-search-input--selected' : ''}`}
                    type="text"
                    placeholder="Buscar por orden, cliente, descripción..."
                    value={deliverySearch}
                    onChange={handleDeliverySearch}
                    onKeyDown={handleDeliverySearchKeyDown}
                    onFocus={() => {
                      if (deliveryResults.length > 0 && !selectedDeliveryOrder) setDeliveryResultsVisible(true);
                    }}
                    readOnly={!!selectedDeliveryOrder}
                    aria-label="Buscar orden para entrega"
                    aria-haspopup="listbox"
                    aria-expanded={deliveryResultsVisible}
                    autoComplete="off"
                  />
                  {deliverySearching && <span className="ho-entregar-search-spinner" aria-hidden="true" />}
                  {selectedDeliveryOrder && (
                    <button
                      className="ho-entregar-clear-btn"
                      onClick={() => {
                        setSelectedDeliveryOrder(null);
                        setDeliverySearch('');
                        setDeliveryResults([]);
                        setDeliveryResultsVisible(false);
                        setTimeout(() => deliverySearchRef.current?.focus(), 30);
                      }}
                      aria-label="Cambiar orden seleccionada"
                    >✕ cambiar orden</button>
                  )}
                </div>

                {/* Search results dropdown */}
                {deliveryResultsVisible && !selectedDeliveryOrder && (
                  <div className="ho-entregar-dropdown" role="listbox" aria-label="Órdenes encontradas">
                    {deliveryResults.length === 0 ? (
                      <div className="ho-entregar-dropdown-empty">
                        Sin resultados activos para "{deliverySearch}"
                      </div>
                    ) : (
                      deliveryResults.map((o, idx) => (
                        <div
                          key={o.id}
                          className={`ho-entregar-result${idx === highlightedDeliveryIdx ? ' ho-entregar-result--hl' : ''}`}
                          role="option"
                          aria-selected={idx === highlightedDeliveryIdx}
                          onMouseEnter={() => setHighlightedDeliveryIdx(idx)}
                          onMouseDown={e => { e.preventDefault(); selectDeliveryOrder(o); }}
                        >
                          <div className="ho-er-top">
                            <span className="ho-er-id">#{o.id}</span>
                            <span className="ho-er-name">
                              {o.is_institute && <span className="ho-b2b-icon">🏢</span>}
                              {o.user_name}
                            </span>
                            <span className={`ho-badge ho-badge--sm ${(ORDEN_CFG[o.order_status] || {}).cls || 'ho-badge--gray'}`}>
                              {(ORDEN_CFG[o.order_status] || {}).label || o.order_status}
                            </span>
                            {o.consolidated_invoice_id && (
                              <span className="ho-er-b2b">B2B #{o.consolidated_invoice_id}</span>
                            )}
                            <span className="ho-er-total">{fmtCOP(o.total_amount)}</span>
                          </div>
                          {o.items_description && (
                            <div className="ho-er-desc">
                              {truncate(o.items_description, 60)}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

            {/* Body — scrollable, contains order card + form */}
            <div className="ho-entregar-body" ref={modalBodyRef}>

              {/* Order summary card */}
              {selectedDeliveryOrder && (
                <div className="ho-entregar-order-card">
                  <div className="ho-eoc-header">
                    <span className="ho-eoc-id">Orden #{selectedDeliveryOrder.order_number ?? selectedDeliveryOrder.id}</span>
                    <div className="ho-eoc-badges">
                      <Badge value={selectedDeliveryOrder.order_status} cfg={ORDEN_CFG} />
                      <Badge value={selectedDeliveryOrder.estado_pago}  cfg={PAGO_CFG} />
                    </div>
                  </div>
                  <div className="ho-eoc-client">
                    <span>👤 {selectedDeliveryOrder.user_name}</span>
                    {selectedDeliveryOrder.user_id && <span>📞 {selectedDeliveryOrder.user_id}</span>}
                  </div>
                  {selectedDeliveryOrder.items_description && (
                    <div className="ho-eoc-desc">
                      📝 {selectedDeliveryOrder.items_description}
                    </div>
                  )}
                  <div className="ho-eoc-financial">
                    <span>💰 Total: <strong>{fmtCOP(selectedDeliveryOrder.total_amount)}</strong></span>
                    <span>
                      Restante:{' '}
                      <strong className={selectedDeliveryOrder.balance_due > 0 ? 'ho-val--red' : 'ho-val--green'}>
                        {fmtCOP(selectedDeliveryOrder.balance_due)}
                      </strong>
                    </span>
                  </div>
                  {selectedDeliveryOrder.balance_due > 0 && (
                    <div className="ho-eoc-warning">
                      <span>⚠️</span>
                      <div>
                        <strong>Esta orden tiene saldo pendiente: {fmtCOP(selectedDeliveryOrder.balance_due)}</strong>
                        <p>Al confirmar la entrega se marcará como Pagada automáticamente</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery form */}
              {selectedDeliveryOrder && (
                <div className="ho-entregar-form">
                  {/* ── Receiver info ── */}
                  <div className="ho-ef-toggle-row">
                    <span className="ho-filter-label">🧾 ¿Se entregó factura física?</span>
                    <label className="ho-toggle" aria-label="¿Factura entregada?">
                      <input
                        type="checkbox"
                        checked={invoiceDelivered}
                        onChange={e => setInvoiceDelivered(e.target.checked)}
                      />
                      <span className="ho-toggle-track">
                        <span className="ho-toggle-thumb" />
                      </span>
                      <span className="ho-toggle-label">{invoiceDelivered ? 'Sí' : 'No'}</span>
                    </label>
                  </div>

                  {!invoiceDelivered && (
                    <>
                      <h4 className="ho-ef-section-title">👤 Datos de quien recoge</h4>
                      <div className="ho-ef-fields">
                        <div className="ho-ef-field">
                          <label className="ho-filter-label" htmlFor="ef-nombre">
                            Nombre completo <span className="ho-ef-required">*</span>
                          </label>
                          <input
                            id="ef-nombre"
                            className="ho-input ho-input--plain ho-ef-input"
                            type="text"
                            placeholder="Ej. María Torres"
                            value={receivedByName}
                            onChange={e => setReceivedByName(e.target.value)}
                            aria-required="true"
                            autoComplete="off"
                          />
                        </div>
                        <div className="ho-ef-field">
                          <label className="ho-filter-label" htmlFor="ef-cedula">
                            Cédula <span className="ho-ef-required">*</span>
                          </label>
                          <input
                            id="ef-cedula"
                            className="ho-input ho-input--plain ho-ef-input"
                            type="text"
                            placeholder="Ej. 1234567890"
                            value={receivedByCedula}
                            onChange={e => setReceivedByCedula(e.target.value)}
                            aria-required="true"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Payment & Status ── */}
                  <div className="ho-ef-fields">
                    <div className="ho-ef-field">
                      <label className="ho-filter-label">🏁 Nuevo Estado Orden</label>
                      <select 
                        className="ho-select ho-select--full"
                        value={deliveryEstadoOrden}
                        onChange={e => setDeliveryEstadoOrden(e.target.value)}
                      >
                        <option value="Entregada">Entregada (Finalizar)</option>
                        <option value="Lista para entregar">Lista para entregar</option>
                        <option value="En proceso">En proceso</option>
                      </select>
                    </div>

                    <div className="ho-ef-field">
                      <label className="ho-filter-label">💰 Nuevo Estado Pago</label>
                      <select 
                        className="ho-select ho-select--full"
                        value={deliveryEstadoPago}
                        onChange={e => setDeliveryEstadoPago(e.target.value)}
                      >
                        <option value="Pagada">Pagada</option>
                        <option value="Debe">Debe</option>
                        <option value="Parcial">Parcial</option>
                      </select>
                    </div>

                    {deliveryEstadoPago === 'Pagada' && selectedDeliveryOrder.balance_due > 0 && (
                      <div className="ho-ef-field">
                        <label className="ho-filter-label">💳 Método Pago Saldo</label>
                        <select
                          className="ho-select ho-select--full"
                          value={deliveryMetodoPago}
                          onChange={e => setDeliveryMetodoPago(e.target.value)}
                        >
                          <option value="Efectivo">Efectivo</option>
                          <option value="Transferencia">Transferencia</option>
                          <option value="Nequi">Nequi</option>
                          <option value="Daviplata">Daviplata</option>
                          <option value="Tarjeta">Tarjeta</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Signature canvas — tablet only */}
                  {isTablet && (
                    <div className="ho-ef-canvas-section">
                      <span className="ho-filter-label">✍️ Firma del cliente</span>
                      <SignatureCanvas canvasRef={canvasRef} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="ho-entregar-footer">
              <span className="ho-ef-required-note">(* campos requeridos)</span>
              <div className="ho-entregar-footer-actions">
                <button
                  className="ho-btn ho-btn--ghost"
                  onClick={closeEntregarModal}
                  disabled={isDelivering}
                >Cancelar</button>
                <button
                  className={`ho-btn ho-btn--entregar-confirm${!canConfirmDelivery ? ' ho-btn--disabled' : ''}${isDelivering ? ' ho-btn--saving' : ''}`}
                  onClick={handleConfirmDelivery}
                  disabled={!canConfirmDelivery || isDelivering}
                  aria-label="Confirmar entrega"
                >
                  {isDelivering
                    ? <><span className="ho-btn-spinner" aria-hidden="true" /> Registrando entrega…</>
                    : '✅ Confirmar Entrega'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── Toast ── */}
      {toast && (
        <div className={`ho-toast ho-toast--${toast.type}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* ── Invisibe Print Component (Comentado) ──
      {printData && (
        <div style={{ display: 'none' }}>
           <PrintInvoice orderData={printData} />
        </div>
      )}
      */}
    </div>
  );
}
