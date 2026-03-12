import { useState, useRef, useEffect } from 'react';
import { clearToken } from '../../services/auth';
import { useNavigate } from 'react-router-dom';

const SECTION_LABELS = {
  'ia-reportes': 'IA & Reportes',
  'nueva-orden': 'Nueva Orden',
  'b2b-ordenes': 'B2B Órdenes',
  'historial-ordenes': 'Historial de Órdenes',
  'gastos-negocio': 'Gastos del Negocio',
  'facturas-cobrar': 'Facturas por Cobrar',
  'servicios-terceros': 'Servicios a Terceros',
  'usuarios': 'Usuarios',
  'instituciones': 'Instituciones',
  'servicios': 'Servicios',
  'proveedores': 'Proveedores',
  'usuarios-app': 'Usuarios App',
  'configuracion': 'Configuración',
};

export default function Topbar({ activeSection, user, onNavigate }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const displayName = user?.username || user?.name || user?.email?.split('@')[0] || 'Usuario';
  const sectionLabel = SECTION_LABELS[activeSection] || 'Dashboard';

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate('/');
  };

  const handleMobileMenu = () => {
    if (window.__sidebarToggle) window.__sidebarToggle();
  };

  return (
    <header className="topbar" role="banner">
      {/* Mobile hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={handleMobileMenu}
        aria-label="Abrir menú"
      >
        <HamburgerIcon />
      </button>

      {/* Section title */}
      <h1 className="topbar__title">{sectionLabel}</h1>

      <div className="topbar__spacer" />

      {/* Search */}
      <div className="topbar-search" role="search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Buscar..."
          aria-label="Buscar en WashFlow"
        />
      </div>

      <div className="topbar-actions">
        {/* Notifications */}
        <button className="topbar-icon-btn" aria-label="Notificaciones (3 nuevas)">
          <BellIcon />
          <span className="topbar-badge" aria-hidden="true">3</span>
        </button>

        {/* User dropdown */}
        <div className="topbar-user" ref={dropdownRef}>
          <button
            className="topbar-user__trigger"
            onClick={() => setDropdownOpen(prev => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            aria-label="Menú de usuario"
          >
            <div className="topbar-user__avatar" aria-hidden="true">
              {displayName[0]?.toUpperCase()}
            </div>
            <span className="topbar-user__name">{displayName}</span>
            <ChevronIcon />
          </button>

          {dropdownOpen && (
            <div className="topbar-dropdown" role="menu">
              <button
                className="topbar-dropdown__item"
                role="menuitem"
                onClick={() => { setDropdownOpen(false); }}
              >
                <UserIcon />
                Mi perfil
              </button>
              <button
                className="topbar-dropdown__item"
                role="menuitem"
                onClick={() => { onNavigate('configuracion'); setDropdownOpen(false); }}
              >
                <SettingsIcon />
                Configuración
              </button>
              <div className="topbar-dropdown__divider" role="separator" />
              <button
                className="topbar-dropdown__item danger"
                role="menuitem"
                onClick={handleLogout}
              >
                <LogoutIcon />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── Icons ─────────────────────────────────────────────── */
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
