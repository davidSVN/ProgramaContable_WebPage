import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Usuarios.css';
import { getUsuarios, createUsuario, updateUsuario, getUsuarioOrdenes } from '../../services/usuarios';
import { BlockedAction } from '../ui/BlockedAction';
import { useWhatsApp } from '../../whatsapp';

/* ── Helpers ───────────────────────────────────────────── */
const now = Date.now();
const daysAgo = (n) => new Date(now - n * 86400000);

const AVATAR_COLORS = ['#FF6B2B','#2B7FFF','#2BA05A','#9B5DFF','#E53E8A','#0BADCF','#E8A020'];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}
function relTime(date) {
  if (!date) return 'nunca';
  const d = Math.floor((now - date.getTime()) / 86400000);
  if (d === 0) return 'hoy';
  if (d === 1) return 'hace 1 día';
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? 'hace 1 mes' : `hace ${m} meses`;
}
function visitColorClass(date) {
  if (!date) return '#9CA3AF'; // Gray for never visited
  const d = Math.floor((now - date.getTime()) / 86400000);
  if (d < 7) return '#2BA05A';
  if (d < 30) return '#FF8C42';
  return '#E53E3E';
}
const fmtCOP = (n) => '$' + (n || 0).toLocaleString('es-CO');

const NIVEL_PCT = { 1: 30, 2: 65, 3: 90, 4: 100 };
const NIVEL_LABELS = { 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3', 4: 'Nivel 4' };

/* ── Initial State ─────────────────────────────────────── */
const INITIAL_USERS = [];



const ORDER_STATUS_COLOR = {
  'Entregado':   { bg: 'rgba(43,160,90,0.1)',   color: '#2BA05A' },
  'En progreso':  { bg: 'rgba(255,107,43,0.1)',   color: '#FF6B2B' },
  'Pendiente':   { bg: 'rgba(43,127,255,0.1)',   color: '#2B7FFF' },
  'Cancelado':   { bg: 'rgba(107,101,96,0.1)',   color: '#6B6560' },
};

/* ── Toast Component ───────────────────────────────────── */
function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="u-toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`u-toast ${t.out ? 'out' : ''}`}>
          <span>{t.icon}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Error Boundary ────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Usuarios Error:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface)', border: 'var(--border)', borderRadius: 8, margin: 20 }}>
          <h2 style={{ marginBottom: 12 }}>Ups, algo salió mal</h2>
          <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 20 }}>Hubo un error al renderizar esta sección.</p>
          <button className="u-btn u-btn-primary" onClick={() => window.location.reload()}>Recargar página</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Main Export ───────────────────────────────────────── */
export default function UsuariosWrapper(props) {
  return (
    <ErrorBoundary>
      <Usuarios {...props} />
    </ErrorBoundary>
  );
}

function Usuarios() {
  const { send: sendWA } = useWhatsApp();
  const [users, setUsers] = useState(INITIAL_USERS);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', contact: '', estado: '', nivel: '', fecha: '' });
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedContact, setDebouncedContact] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: 'id', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selected, setSelected] = useState(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [drawerUser, setDrawerUser] = useState(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [toasts, setToasts] = useState([]);
  const tableTopRef = useRef(null);
  const searchTimer = useRef(null);
  const contactTimer = useRef(null);
  
  // Fetch users from API
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { items, total } = await getUsuarios({
          page: currentPage,
          limit: pageSize,
          search: debouncedSearch,
          estado: filters.estado,
          nivel: filters.nivel,
          user_type: 'B2C'
        });
        
        const mapped = items.map(u => ({
          id: u.user_id,
          nombre: u.user_name,
          contacto: u.user_contact,
          email: u.email,
          direccion: u.user_address,
          ordenes: u.total_orders,
          totalGastado: u.total_spent,
          ultimaVisita: u.last_visit ? new Date(u.last_visit) : null,
          nivelFidelidad: parseInt(u.loyalty_level?.replace('Nivel ', '') || '1'),
          estado: u.state ? 'Activo' : 'Inactivo',
          fechaRegistro: u.fecha_registro ? new Date(u.fecha_registro) : new Date(),
          sparkline: [0,0,0,0,0,0,0]
        }));
        
        setUsers(mapped);
        setTotalItems(total);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [currentPage, pageSize, debouncedSearch, filters.estado, filters.nivel]);

  const mapBackendUser = (u) => ({
    id: u.user_id,
    nombre: u.user_name,
    contacto: u.user_contact,
    email: u.email,
    direccion: u.user_address,
    notas: u.notas,
    ordenes: u.total_orders,
    totalGastado: u.total_spent,
    ultimaVisita: u.last_visit ? new Date(u.last_visit) : null,
    nivelFidelidad: parseInt(u.loyalty_level?.replace('Nivel ', '') || '1'),
    estado: u.state ? 'Activo' : 'Inactivo',
    fechaRegistro: u.fecha_registro ? new Date(u.fecha_registro) : new Date(),
    sparkline: [0,0,0,0,0,0,0]
  });

  // Debounced search
  const handleSearchChange = (val) => {
    setFilters(f => ({ ...f, search: val }));
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(val);
      setCurrentPage(1);
    }, 300);
  };

  const handleContactChange = (val) => {
    setFilters(f => ({ ...f, contact: val }));
    clearTimeout(contactTimer.current);
    contactTimer.current = setTimeout(() => {
      setDebouncedContact(val);
      setCurrentPage(1);
    }, 300);
  };

  // Filter + sort derived data
  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      result = result.filter(u => 
        (u.nombre?.toLowerCase() || '').includes(s) || 
        (u.email?.toLowerCase() || '').includes(s)
      );
    }
    if (debouncedContact) {
      result = result.filter(u => u.contacto.includes(debouncedContact));
    }
    if (filters.estado) {
      result = result.filter(u => u.estado === filters.estado);
    }
    if (filters.nivel) {
      result = result.filter(u => u.nivelFidelidad === parseInt(filters.nivel));
    }
    if (filters.fecha) {
      const cutoff = filters.fecha === 'mes' ? daysAgo(30) : filters.fecha === 'trimestre' ? daysAgo(90) : new Date('2026-01-01');
      result = result.filter(u => u.fechaRegistro >= cutoff);
    }

    // Sort
    result.sort((a, b) => {
      let va = a[sortConfig.column], vb = b[sortConfig.column];
      if (sortConfig.column === 'ultimaVisita') { 
        va = a.ultimaVisita ? a.ultimaVisita.getTime() : 0; 
        vb = b.ultimaVisita ? b.ultimaVisita.getTime() : 0; 
      }
      if (sortConfig.column === 'nombre') { 
        va = (a.nombre || '').toLowerCase(); 
        vb = (b.nombre || '').toLowerCase(); 
      }
      if (va < vb) return sortConfig.direction === 'asc' ? -1 : 1;
      if (va > vb) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [users, debouncedSearch, debouncedContact, filters, sortConfig]);

  const totalPages = Math.ceil(totalItems / pageSize);
  const pagedUsers = filteredUsers; // The server already paginated this for us

  // Sorting
  const handleSort = (col) => {
    setSortConfig(prev =>
      prev.column === col
        ? { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: col, direction: 'asc' }
    );
  };

  // Selection
  const allSelected = pagedUsers.length > 0 && pagedUsers.every(u => selected.has(u.id));
  const someSelected = pagedUsers.some(u => selected.has(u.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(prev => { const s = new Set(prev); pagedUsers.forEach(u => s.delete(u.id)); return s; });
    } else {
      setSelected(prev => { const s = new Set(prev); pagedUsers.forEach(u => s.add(u.id)); return s; });
    }
  };
  const toggleSelect = (id) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  // Page change
  const goToPage = (p) => {
    setCurrentPage(p);
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Clear filters
  const hasFilters = filters.search || filters.contact || filters.estado || filters.nivel || filters.fecha;
  const activeFilterCount = [filters.search, filters.contact, filters.estado, filters.nivel, filters.fecha].filter(Boolean).length;
  const clearFilters = () => {
    setFilters({ search: '', contact: '', estado: '', nivel: '', fecha: '' });
    setDebouncedSearch('');
    setDebouncedContact('');
    setCurrentPage(1);
  };

  // Toast
  const showToast = useCallback((message, icon = '✅') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, out: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250);
    }, 3000);
  }, []);

  // Drawer
  const openDrawer = (user) => { setDrawerUser(user); setDrawerClosing(false); };
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerUser(null); setDrawerClosing(false); }, 200);
  };

  // ESC key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (isModalOpen) setIsModalOpen(false);
        else if (editUser) setEditUser(null);
        else if (drawerUser) closeDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModalOpen, drawerUser]);

  // CSV export
  const handleExport = () => {
    showToast('Exportando lista de usuarios...', '📥');
    const headers = ['ID','Nombre','Email','Contacto','Dirección','Órdenes','Total Gastado','Última Visita','Nivel Fidelidad','Estado','Fecha Registro'];
    const rows = filteredUsers.map(u => [
      u.id, u.nombre, u.email, u.contacto, u.direccion,
      u.ordenes, u.totalGastado, relTime(u.ultimaVisita),
      NIVEL_LABELS[u.nivelFidelidad], u.estado,
      u.fechaRegistro.toLocaleDateString('es-CO'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'usuarios.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Add user
  const handleUserCreated = (newUser) => {
    setUsers(prev => [mapBackendUser(newUser), ...prev]);
    setIsModalOpen(false);
    showToast('Usuario creado exitosamente', '✅');
  };

  const handleUserUpdated = (updatedUser) => {
    const mapped = mapBackendUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === mapped.id ? mapped : u));
    setEditUser(null);
    showToast('Usuario actualizado exitosamente', '✅');
  };

  // Bulk actions
  const handleBulkActivate = () => {
    setUsers(prev => prev.map(u => selected.has(u.id) ? { ...u, estado: 'Activo' } : u));
    showToast(`${selected.size} usuario(s) activados`, '✅');
    setSelected(new Set());
  };
  const handleBulkInactivate = () => {
    setUsers(prev => prev.map(u => selected.has(u.id) ? { ...u, estado: 'Inactivo' } : u));
    showToast(`${selected.size} usuario(s) inactivados`, '🔴');
    setSelected(new Set());
  };

  return (
    <div className="u-section">
      {/* Header */}
      <div className="u-header" ref={tableTopRef}>
        <div className="u-header__left">
          <h1 className="u-header__title">Gestión de Usuarios</h1>
          <p className="u-header__subtitle">Administra tu base de clientes y su historial de servicios</p>
        </div>
        <div className="u-header__actions">
          <button className="u-btn u-btn-outline" onClick={handleExport}>
            <DownloadIcon /> Exportar CSV
          </button>
          <BlockedAction>
          <button className="u-btn u-btn-primary" onClick={() => setIsModalOpen(true)}>
            <PlusIcon /> Nuevo Usuario
          </button>
          </BlockedAction>
        </div>
      </div>

      {/* Filters */}
      <div className="u-filters">
        <span className="u-filter-label">
          Filtros
          {activeFilterCount > 0 && <span className="u-filter-count">{activeFilterCount}</span>}
        </span>

        <div className="u-search-wrap">
          <SearchIcon size={14} />
          <input
            className="u-search-input"
            type="search"
            placeholder="Buscar nombre..."
            value={filters.search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="u-search-wrap">
          <PhoneIcon size={14} />
          <input
            className="u-search-input"
            type="search"
            placeholder="Buscar contacto..."
            value={filters.contact}
            onChange={e => handleContactChange(e.target.value)}
          />
        </div>

        <select
          className={`u-select ${filters.estado ? 'active' : ''}`}
          value={filters.estado}
          onChange={e => { setFilters(f => ({ ...f, estado: e.target.value })); setCurrentPage(1); }}
        >
          <option value="">Estado: Todos</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>

        <select
          className={`u-select ${filters.nivel ? 'active' : ''}`}
          value={filters.nivel}
          onChange={e => { setFilters(f => ({ ...f, nivel: e.target.value })); setCurrentPage(1); }}
        >
          <option value="">Nivel: Todos</option>
          <option value="1">Nivel 1</option>
          <option value="2">Nivel 2</option>
          <option value="3">Nivel 3</option>
          <option value="4">Nivel 4</option>
        </select>

        <select
          className={`u-select ${filters.fecha ? 'active' : ''}`}
          value={filters.fecha}
          onChange={e => { setFilters(f => ({ ...f, fecha: e.target.value })); setCurrentPage(1); }}
        >
          <option value="">Registro: Todos</option>
          <option value="mes">Último mes</option>
          <option value="trimestre">Últimos 3 meses</option>
          <option value="anio">Este año</option>
        </select>

        {hasFilters && (
          <button className="u-clear-btn" onClick={clearFilters}>
            <XIcon size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="u-table-wrapper">
        <div className="u-table-scroll">
          <table className="u-table" aria-label="Tabla de usuarios">
            <thead>
              <tr>
                <th className="u-th" style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    className="u-checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todos"
                  />
                </th>
                {[
                  { key: 'id', label: 'ID', sort: true, w: 50 },
                  { key: 'nombre', label: 'Nombre', sort: true, w: 200 },
                  { key: 'email', label: 'Email', w: 180 },
                  { key: 'contacto', label: 'Contacto', w: 130 },
                  { key: 'direccion', label: 'Dirección', w: 140 },
                  { key: 'ordenes', label: 'Órdenes', sort: true, w: 110 },
                  { key: 'totalGastado', label: 'Total Gastado', sort: true, w: 120 },
                  { key: 'ultimaVisita', label: 'Última Visita', sort: true, w: 120 },
                  { key: 'nivelFidelidad', label: 'Fidelidad', w: 120 },
                  { key: 'estado', label: 'Estado', w: 90 },
                  { key: 'acciones', label: '', w: 72 },
                ].map(col => (
                  <th
                    key={col.key}
                    className={`u-th ${col.sort ? 'sortable' : ''}`}
                    style={{ width: col.w }}
                    onClick={col.sort ? () => handleSort(col.key) : undefined}
                  >
                    <div className="u-th-inner">
                      {col.label}
                      {col.sort && (
                        <span className={`u-sort-icon ${sortConfig.column === col.key ? sortConfig.direction : ''}`}>
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                            <path d="M4 0L7 4H1L4 0Z" fill="currentColor"/>
                            <path d="M4 12L1 8H7L4 12Z" fill="currentColor" opacity="0.4"/>
                          </svg>
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="u-skeleton-row">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j}><div className="u-skeleton-bar" style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${i * 0.08}s` }} /></td>
                    ))}
                  </tr>
                ))
              ) : pagedUsers.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <div className="u-empty">
                      <span className="u-empty__icon">🔍</span>
                      <div className="u-empty__title">No se encontraron usuarios</div>
                      <div className="u-empty__sub">Prueba ajustando los filtros o crea un nuevo usuario</div>
                      <button className="u-btn u-btn-primary u-btn-sm" onClick={() => { clearFilters(); setIsModalOpen(true); }}>
                        <PlusIcon /> Crear primer usuario
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedUsers.map(user => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelected={selected.has(user.id)}
                    onSelect={() => toggleSelect(user.id)}
                    onRowClick={() => openDrawer(user)}
                    onEdit={(e) => { e.stopPropagation(); setEditUser(user); }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, estado: 'Inactivo' } : u));
                      showToast(`${user.nombre} inactivado`, '🔴');
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isLoading && filteredUsers.length > 0 && (
          <Pagination
            total={filteredUsers.length}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={goToPage}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
          />
        )}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onActivate={handleBulkActivate}
          onInactivate={handleBulkInactivate}
          onCancel={() => setSelected(new Set())}
        />
      )}

      {/* Modals */}
      {isModalOpen && (
        <UserModal
          onClose={() => setIsModalOpen(false)}
          onSave={handleUserCreated}
        />
      )}

      {editUser && (
        <UserModal
          initialData={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleUserUpdated}
        />
      )}

      {/* Drawer */}
      {drawerUser && (
        <UserDrawer
          user={users.find(u => u.id === drawerUser.id) || drawerUser}
          closing={drawerClosing}
          onClose={closeDrawer}
          onEdit={() => { closeDrawer(); setEditUser(drawerUser); }}
          onSendWA={sendWA}
          onInactivate={() => {
            const u = users.find(u => u.id === drawerUser.id) || drawerUser;
            setUsers(prev => prev.map(item => item.id === u.id ? { ...item, estado: 'Inactivo' } : item));
            showToast(`${u.nombre} inactivado`, '🔴');
            closeDrawer();
          }}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

/* ── UserRow ───────────────────────────────────────────── */
function UserRow({ user, isSelected, onSelect, onRowClick, onEdit, onDelete }) {
  const color = avatarColor(user.nombre);
  const pct = NIVEL_PCT[user.nivelFidelidad] || 100;
  const maxBar = Math.max(...user.sparkline);

  return (
    <tr
      className={`u-tr ${isSelected ? 'selected' : ''}`}
      onClick={onRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onRowClick()}
    >
      <td className="u-td no-click" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          className="u-checkbox"
          checked={isSelected}
          onChange={onSelect}
          aria-label={`Seleccionar ${user.nombre}`}
        />
      </td>
      <td className="u-td" style={{ color: 'var(--ds-text-secondary)', fontSize: '0.8rem' }}>{user.id}</td>
      <td className="u-td">
        <div className="u-avatar-cell">
          <div className="u-avatar" style={{ background: color }}>{initials(user.nombre)}</div>
          <span className="u-name">{user.nombre}</span>
        </div>
      </td>
      <td className="u-td">
        <span className="u-email" title={user.email}>{user.email}</span>
      </td>
      <td className="u-td" style={{ color: 'var(--ds-text-secondary)', fontSize: '0.82rem' }}>{user.contacto}</td>
      <td className="u-td">
        <span className="u-addr" title={user.direccion}>{user.direccion}</span>
      </td>
      <td className="u-td">
        <div className="u-ordenes-cell">
          <span className="u-ordenes-num">{user.ordenes}</span>
          <div className="u-sparkline">
            {user.sparkline.map((v, i) => (
              <div
                key={i}
                className={`u-sparkline-bar ${v === maxBar ? 'hi' : ''}`}
                style={{ height: `${Math.max(3, (v / maxBar) * 18)}px` }}
              />
            ))}
          </div>
        </div>
      </td>
      <td className="u-td">
        <span className={user.totalGastado >= 100000 ? 'u-currency-high' : ''}>
          {fmtCOP(user.totalGastado)}
        </span>
      </td>
      <td className="u-td">
        <span style={{ color: visitColorClass(user.ultimaVisita), fontWeight: 600, fontSize: '0.82rem' }}>
          {relTime(user.ultimaVisita)}
        </span>
      </td>
      <td className="u-td">
        <div className="u-nivel-cell">
          <span className="u-badge u-badge-orange">{NIVEL_LABELS[user.nivelFidelidad]}</span>
          <div className="u-mini-bar-track">
            <div className="u-mini-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </td>
      <td className="u-td">
        <span className={`u-badge ${user.estado === 'Activo' ? 'u-badge-green' : 'u-badge-gray'}`}>
          {user.estado}
        </span>
      </td>
      <td className="u-td no-click" onClick={e => e.stopPropagation()}>
        <div className="u-row-actions">
          <button className="u-action-btn" onClick={onEdit} aria-label={`Editar ${user.nombre}`} title="Editar">
            <PencilIcon />
          </button>
          <button className="u-action-btn delete" onClick={onDelete} aria-label={`Inactivar ${user.nombre}`} title="Inactivar">
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Pagination ────────────────────────────────────────── */
function Pagination({ total, currentPage, pageSize, totalPages, onPageChange, onPageSizeChange }) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p =>
    p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2
  );

  return (
    <div className="u-pagination">
      <span className="u-page-info">
        Mostrando {start}–{end} de {total} órdenes
      </span>
      <div className="u-page-nums">
        <button
          className="u-page-btn"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Página anterior"
        >
          ‹
        </button>
        {pages.map((p, i) => (
          <span key={p} style={{ display: 'contents' }}>
            {i > 0 && pages[i] - pages[i - 1] > 1 && (
              <span style={{ padding: '0 4px', color: 'var(--ds-text-secondary)', fontSize: '0.8rem' }}>…</span>
            )}
            <button
              className={`u-page-btn ${p === currentPage ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-label={`Página ${p}`}
              aria-current={p === currentPage ? 'page' : undefined}
            >
              {p}
            </button>
          </span>
        ))}
        <button
          className="u-page-btn"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Página siguiente"
        >
          ›
        </button>
      </div>
      <div className="u-page-size-wrap">
        <span>Filas:</span>
        <select
          className="u-page-size-select"
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          aria-label="Filas por página"
        >
          {[10, 15, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ── UserModal (Create / Edit) ─────────────────────────── */
function UserModal({ onClose, onSave, initialData = null }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    nombre: initialData?.nombre || '',
    email: initialData?.email || '',
    contacto: initialData?.contacto || '',
    direccion: initialData?.direccion || '',
    notas: initialData?.notas || '',
    estado: isEdit ? (initialData.estado === 'Activo') : true
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [shake, setShake] = useState(false);
  const [mounted, setMounted] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    firstRef.current?.focus();
  }, []);

  if (!mounted || !document.body) return null;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const validate = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido';
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
      let result;
      if (isEdit) {
        result = await updateUsuario(initialData.id, {
          user_name: form.nombre,
          email: form.email,
          user_contact: form.contacto,
          user_address: form.direccion,
          notas: form.notas,
          state: form.estado,
          user_type: 'B2C'
        });
      } else {
        result = await createUsuario(form);
      }
      onSave(result);
    } catch (err) {
      setErrors({ submit: err.message });
      setShake(true);
      setTimeout(() => setShake(false), 450);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="u-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className={`u-modal ${shake ? 'shake' : ''}`}>
        <div className="u-modal__header">
          <h2 className="u-modal__title" id="modal-title">
            {isEdit ? `Editar ${initialData.nombre}` : 'Nuevo Usuario'}
          </h2>
          <button className="u-close-btn" onClick={onClose} aria-label="Cerrar"><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="u-modal__body">
            <div className="u-field">
              <label className="u-field-label" htmlFor="nu-nombre">Nombre completo <span>*</span></label>
              <input
                id="nu-nombre" ref={firstRef}
                className={`u-input ${errors.nombre ? 'error' : ''}`}
                placeholder="Ej: María García López"
                value={form.nombre}
                onChange={e => { setForm(f => ({ ...f, nombre: e.target.value })); setErrors(er => ({ ...er, nombre: '' })); }}
              />
              {errors.nombre && <span className="u-error-msg">⚠ {errors.nombre}</span>}
              {errors.submit && <span className="u-error-msg">⚠ {errors.submit}</span>}
            </div>

            <div className="u-field">
              <label className="u-field-label" htmlFor="nu-email">Email</label>
              <div className="u-input-wrap">
                <input
                  id="nu-email" type="email"
                  className={`u-input ${form.email && emailValid ? 'valid' : ''}`}
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
                {form.email && emailValid && (
                  <span className="u-input-icon" style={{ color: '#2BA05A' }}>✓</span>
                )}
              </div>
            </div>

            <div className="u-field">
              <label className="u-field-label" htmlFor="nu-contacto">Contacto (teléfono) <span>*</span></label>
              <input
                id="nu-contacto"
                className={`u-input ${errors.contacto ? 'error' : ''}`}
                placeholder="310 452 7891"
                value={form.contacto}
                onChange={e => { setForm(f => ({ ...f, contacto: e.target.value })); setErrors(er => ({ ...er, contacto: '' })); }}
              />
              {errors.contacto
                ? <span className="u-error-msg">⚠ {errors.contacto}</span>
                : <span className="u-field-hint">Formato: 3XX XXX XXXX</span>
              }
            </div>

            <div className="u-field">
              <label className="u-field-label" htmlFor="nu-dir">Dirección</label>
              <input
                id="nu-dir"
                className="u-input"
                placeholder="Calle 72 #15-30, Bogotá"
                value={form.direccion}
                onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
              />
            </div>

            <div className="u-field">
              <label className="u-field-label" htmlFor="nu-notas">Notas internas</label>
              <textarea
                id="nu-notas"
                className="u-textarea"
                placeholder="Preferencias, observaciones del cliente..."
                value={form.notas}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              />
            </div>

            <div className="u-toggle-row">
              <div>
                <div className="u-toggle-label-text">Estado</div>
                <div className="u-toggle-sub">{form.estado ? 'El usuario podrá recibir servicios' : 'El usuario estará inactivo'}</div>
              </div>
              <label className="u-toggle-switch">
                <input
                   type="checkbox"
                   checked={form.estado}
                   onChange={e => setForm(f => ({ ...f, estado: e.target.checked }))}
                   aria-label="Estado activo"
                />
                <div className="u-toggle-track" />
                <div className="u-toggle-thumb" />
              </label>
            </div>
          </div>

          <div className="u-modal__footer">
            <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancelar</button>
            <BlockedAction>
            <button type="submit" className="u-btn u-btn-primary" disabled={saving}>
              {saving ? <><div className="u-spinner" /> Guardando...</> : isEdit ? 'Guardar Cambios' : 'Guardar Usuario'}
            </button>
            </BlockedAction>
          </div>
        </form>
      </div>
    </div>
  , document.body);
}

/* ── UserDrawer ────────────────────────────────────────── */
// Map backend order_status values to the keys used in ORDER_STATUS_COLOR
function mapEstado(order_status) {
  switch (order_status) {
    case 'Entregada':   return 'Entregado';
    case 'En progreso': return 'En progreso';
    case 'Cancelada':   return 'Cancelado';
    default:            return order_status; // 'Pendiente' matches as-is
  }
}

function UserDrawer({ user, closing, onClose, onEdit, onInactivate, onSendWA }) {
  const [progressReady, setProgressReady] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleWhatsAppUser = () => {
    if (!user.contacto) return;
    let negocio = 'Lavalatu';
    try {
      const cfg = JSON.parse(localStorage.getItem('washflow_negocio_config') || '{}');
      if (cfg.nombre_negocio) negocio = cfg.nombre_negocio;
    } catch (e) {}
    if (onSendWA) {
      onSendWA(user.contacto, 'saludo', { nombre: user.nombre, negocio });
    }
    setShowMoreMenu(false);
  };

  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setProgressReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  const color = avatarColor(user?.nombre || '');
  const pct = NIVEL_PCT[user?.nivelFidelidad] || 0;
  const nextLevel = (user?.nivelFidelidad < 4) ? user.nivelFidelidad + 1 : null;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function loadOrders() {
      setOrdersLoading(true);
      try {
        const data = await getUsuarioOrdenes(user.id);
        if (!cancelled) setOrders(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    }
    loadOrders();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!mounted || !document.body || !user) return null;

  return createPortal(
    <>
      <div className="u-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div className={`u-drawer ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={`Perfil de ${user.nombre}`}>
        {/* Header */}
        <div className="u-drawer__top" style={{ position: 'relative' }}>
          <div className="u-drawer__avatar" style={{ background: color }}>{initials(user.nombre)}</div>
          <div className="u-drawer__info">
            <div className="u-drawer__name">{user.nombre}</div>
            <div className="u-drawer__contact">
              {user.email}<br />{user.contacto}
            </div>
            <div className="u-drawer__badges">
              <span className={`u-badge ${user.estado === 'Activo' ? 'u-badge-green' : 'u-badge-gray'}`}>{user.estado}</span>
              <span className="u-badge u-badge-orange">{NIVEL_LABELS[user.nivelFidelidad]}</span>
            </div>
            <div className="u-drawer__actions">
              <button className="u-btn u-btn-outline u-btn-sm" onClick={onEdit}>
                <PencilIcon /> Editar
              </button>
              <div style={{ position: 'relative' }}>
                <button className="u-btn u-btn-ghost u-btn-sm" onClick={() => setShowMoreMenu(!showMoreMenu)}>⋮ Más</button>
                {showMoreMenu && (
                  <div className="u-more-dropdown" style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                    background: '#fff', border: '1px solid #E8E3D8', borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 140
                  }}>
                    <button className="u-dropdown-item" onClick={handleWhatsAppUser} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left'
                    }}>
                      <span style={{ color: '#25D366' }}>📱</span> WhatsApp
                    </button>
                    <button className="u-dropdown-item" onClick={() => { onInactivate(); setShowMoreMenu(false); }} style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'left',
                      color: '#E53E3E'
                    }}>
                      <TrashIcon /> {user.estado === 'Activo' ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button className="u-close-btn" onClick={onClose} aria-label="Cerrar perfil" style={{ position: 'absolute', top: 12, right: 12 }}>
            <XIcon />
          </button>
        </div>

        {/* KPIs */}
        <div className="u-drawer__kpis">
          {[
            { label: '💰 Total Gastado', value: fmtCOP(user.totalGastado) },
            { label: '📦 Total Órdenes', value: user.ordenes },
            { label: '📅 Última Visita',  value: relTime(user.ultimaVisita) },
            { label: '🗓️ Cliente desde', value: (user.fechaRegistro instanceof Date && !isNaN(user.fechaRegistro)) ? user.fechaRegistro.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }) : '—' },
          ].map(kpi => (
            <div key={kpi.label} className="u-kpi-card">
              <div className="u-kpi-card__label">{kpi.label}</div>
              <div className="u-kpi-card__value">{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Fidelidad */}
        <div className="u-drawer__fidelidad">
          <div className="u-section-title">Nivel de Fidelidad</div>
          <div className="u-fidelidad-row">
            <span className="u-badge u-badge-orange">{NIVEL_LABELS[user.nivelFidelidad]}</span>
            <div className="u-progress-track">
              <div className="u-progress-fill" style={{ width: progressReady ? `${pct}%` : '0%' }} />
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', whiteSpace: 'nowrap' }}>{pct}%</span>
          </div>
          {nextLevel && (
            <div className="u-fidelidad-note">
              {100 - pct} puntos para alcanzar {NIVEL_LABELS[nextLevel]}
            </div>
          )}
          <div className="u-fidelidad-note" style={{ marginTop: 4, opacity: 0.6 }}>
            (calculado automáticamente por el sistema)
          </div>
        </div>

        {/* Mini orders */}
        <div className="u-drawer__ordenes">
          <div className="u-section-header-row">
            <div className="u-section-title">Últimas Órdenes</div>
            <span className="u-link">Ver todas →</span>
          </div>
          <table className="u-mini-orders-table">
            <thead>
              <tr>
                <th># Orden</th>
                <th>Servicio</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--ds-text-secondary)', fontSize: '0.8rem' }}>
                    Cargando órdenes…
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--ds-text-secondary)', fontSize: '0.8rem' }}>
                    Sin órdenes registradas
                  </td>
                </tr>
              ) : orders.map(o => {
                const estado = mapEstado(o.order_status);
                const sc = ORDER_STATUS_COLOR[estado] || ORDER_STATUS_COLOR['Pendiente'];
                return (
                  <tr key={o.id}>
                    <td style={{ color: 'var(--ds-text-secondary)', fontSize: '0.75rem' }}>#{o.id}</td>
                    <td style={{ fontSize: '0.8rem' }}>{o.items_description || '—'}</td>
                    <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{fmtCOP(o.total_amount)}</td>
                    <td>
                      <span className="u-badge" style={{ background: sc.bg, color: sc.color, fontSize: '0.7rem' }}>{estado}</span>
                    </td>
                    <td style={{ color: 'var(--ds-text-secondary)', fontSize: '0.75rem' }}>{relTime(new Date(o.date))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="u-drawer__footer">
          <button className="u-btn u-btn-outline" style={{ width: '100%', justifyContent: 'center' }}>
            Ver todas las órdenes
          </button>
          <BlockedAction>
          <button className="u-btn u-btn-danger-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onInactivate}>
            {user.estado === 'Activo' ? 'Inactivar cliente' : 'Activar cliente'}
          </button>
          </BlockedAction>
        </div>
      </div>
    </>
  , document.body);
}

/* ── BulkBar ───────────────────────────────────────────── */
function BulkBar({ count, onActivate, onInactivate, onCancel }) {
  return (
    <div className="u-bulk-bar" role="toolbar" aria-label="Acciones en lote">
      <span className="u-bulk-bar__count">
        <span>{count}</span> usuario{count !== 1 ? 's' : ''} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <div className="u-bulk-bar__actions">
        <button className="u-bulk-btn" onClick={() => {}}>📣 Asignar a campaña</button>
        <button className="u-bulk-btn danger" onClick={onInactivate}>🔴 Inactivar</button>
        <button className="u-bulk-btn" onClick={onActivate}>✅ Activar</button>
      </div>
      <button className="u-bulk-bar__cancel" onClick={onCancel}>✕ Cancelar</button>
    </div>
  );
}

/* ── SVG Icons ─────────────────────────────────────────── */
function SearchIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function PhoneIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.7 10.5a19.79 19.79 0 01-3-8.55A2 2 0 012.68 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.75a16 16 0 006.29 6.29l1.1-1.1a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
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
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>;
}
