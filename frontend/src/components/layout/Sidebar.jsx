import { useState, useEffect } from 'react';

const NAV = [
  {
    id: 'ia-reportes',
    label: 'IA & Reportes',
    icon: <BrainIcon />,
  },
  {
    id: 'nueva-orden',
    label: 'Nueva Orden',
    icon: <PlusCircleIcon />,
    special: 'nueva-orden',
  },
  {
    id: 'ordenes',
    label: 'Órdenes',
    icon: <PackageIcon />,
    group: true,
    children: [
      { id: 'b2b-ordenes', label: 'B2B Órdenes', emoji: '📋' },
      { id: 'historial-ordenes', label: 'Historial de Órdenes', emoji: '🕐' },
      { id: 'gastos-negocio', label: 'Gastos del Negocio', emoji: '💸' },
      { id: 'facturas-cobrar', label: 'Facturas por Cobrar', emoji: '🧾' },
      { id: 'servicios-terceros', label: 'Servicios a Terceros', emoji: '📤' },
    ],
  },
  { id: 'usuarios', label: 'Usuarios', icon: <UserIcon /> },
  { id: 'instituciones', label: 'Instituciones', icon: <BuildingIcon /> },
  { id: 'servicios', label: 'Servicios', icon: <SettingsIcon /> },
  { id: 'proveedores', label: 'Proveedores', icon: <TruckIcon /> },
  { id: 'usuarios-app', label: 'Usuarios App', icon: <PhoneIcon /> },
  { id: 'configuracion', label: 'Configuración', icon: <GearIcon /> },
];

export default function Sidebar({ activeSection, onNavigate, user, collapsed, onCollapse }) {
  const [ordenesOpen, setOrdenesOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Expose mobile toggle via window for Topbar
  useEffect(() => {
    window.__sidebarToggle = () => setMobileOpen(prev => !prev);
    return () => { delete window.__sidebarToggle; };
  }, []);

  const handleNav = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const displayName = user?.username || user?.name || user?.email?.split('@')[0] || 'Usuario';
  const displayRole = user?.role || 'Usuario';

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Navegación principal"
      >
        {/* Logo */}
        <a className="sidebar-logo" href="/" aria-label="WashFlow — ir al inicio">
          <div className="sidebar-logo__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7" stroke="#fff" strokeWidth="2"/>
              <circle cx="10" cy="10" r="3.5" stroke="#fff" strokeWidth="1.5"/>
              <circle cx="5" cy="5" r="1.2" fill="#fff"/>
            </svg>
          </div>
          <span className="sidebar-logo__text">WashFlow</span>
        </a>

        {/* Collapse toggle */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => onCollapse(!collapsed)}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? <ChevronRightIcon size={12} /> : <ChevronLeftIcon size={12} />}
        </button>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map((item) => {
            if (item.group) {
              const isGroupActive = item.children.some(c => c.id === activeSection);
              return (
                <div key={item.id} className="nav-group">
                  <button
                    className={`nav-item ${isGroupActive ? 'active' : ''}`}
                    onClick={() => setOrdenesOpen(prev => !prev)}
                    aria-expanded={ordenesOpen}
                    aria-controls="ordenes-children"
                  >
                    <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                    <span className="nav-item__label">{item.label}</span>
                    <span className={`nav-item__chevron ${ordenesOpen ? 'open' : ''}`} aria-hidden="true">
                      <ChevronDownIcon size={14} />
                    </span>
                    <span className="nav-tooltip" role="tooltip">{item.label}</span>
                  </button>
                  <div
                    id="ordenes-children"
                    className={`nav-group__children ${ordenesOpen ? 'open' : ''}`}
                  >
                    {item.children.map(child => (
                      <button
                        key={child.id}
                        className={`nav-subitem ${activeSection === child.id ? 'active' : ''}`}
                        onClick={() => handleNav(child.id)}
                        aria-current={activeSection === child.id ? 'page' : undefined}
                      >
                        <span aria-hidden="true">{child.emoji}</span>
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                className={`nav-item ${item.special || ''} ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => handleNav(item.id)}
                aria-current={activeSection === item.id ? 'page' : undefined}
              >
                <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-item__label">{item.label}</span>
                <span className="nav-tooltip" role="tooltip">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="sidebar-user">
          <div className="sidebar-user__avatar" aria-hidden="true">
            {displayName[0]?.toUpperCase()}
          </div>
          <div className="sidebar-user__info">
            <div className="sidebar-user__name">{displayName}</div>
            <div className="sidebar-user__role">{displayRole}</div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── SVG Icons ─────────────────────────────────────────── */
function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 22V12h6v10"/>
      <path d="M9 7h.01M12 7h.01M15 7h.01M9 10h.01M12 10h.01M15 10h.01"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/>
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  );
}

function ChevronLeftIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ChevronRightIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function ChevronDownIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}
