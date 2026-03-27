import { useState, useEffect } from 'react';
import { usePlan } from '../../hooks/usePlan';

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
    id: 'b2b-ordenes',
    label: 'B2B Órdenes',
    icon: <BriefcaseIcon />,
  },
  {
    id: 'canales-dinero',
    label: 'Mis Cuentas',
    icon: <WalletIcon />,
  },
  {
    id: 'whatsapp-center',
    label: 'Mensajes',
    icon: <WhatsAppIcon />,
  },
  {
    id: 'gastos-negocio',
    label: 'Gastos del Negocio',
    icon: <DollarSignIcon />,
  },
  {
    id: 'ordenes',
    label: 'Órdenes',
    icon: <PackageIcon />,
    group: true,
    children: [
      { id: 'historial-ordenes',  label: 'Historial de Órdenes',   emoji: '🕐' },
      { id: 'domicilios',         label: 'Domicilios',             emoji: '🛵' },
      { id: 'servicios-ordenes',  label: 'Servicios por Órdenes',  emoji: '📋' },
      { id: 'facturas-cobrar',    label: 'Facturas por Cobrar',    emoji: '🧾' },
      { id: 'servicios-terceros', label: 'Servicios en Agencia',   emoji: '📤' },
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
  const { isNone } = usePlan();

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
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="2" fill="#FF6B2B" stroke="#fff" strokeWidth="2.5"/>
              <rect x="2" y="2" width="28" height="8" rx="2" fill="#FF6B2B" stroke="#fff" strokeWidth="2.5"/>
              <circle cx="7" cy="6" r="1.5" fill="#fff"/>
              <circle cx="11" cy="6" r="1.5" fill="#fff"/>
              <rect x="16" y="5" width="10" height="2" rx="1" fill="#fff"/>
              <circle cx="16" cy="19" r="8" fill="#fff" stroke="#fff" strokeWidth="2"/>
              <circle cx="16" cy="19" r="5" fill="#D4E8F7" stroke="#FF6B2B" strokeWidth="2"/>
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

            const blocked = item.special === 'nueva-orden' && isNone;
            return (
              <button
                key={item.id}
                className={`nav-item ${item.special || ''} ${activeSection === item.id ? 'active' : ''}`}
                onClick={blocked ? undefined : () => handleNav(item.id)}
                aria-current={activeSection === item.id ? 'page' : undefined}
                style={blocked ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
                title={blocked ? 'Activa una suscripción para crear órdenes' : undefined}
              >
                <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-item__label">{item.label}</span>
                <span className="nav-tooltip" role="tooltip">
                  {blocked ? 'Activa una suscripción para crear órdenes' : item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Plan badge */}
        <PlanBadge collapsed={collapsed} onNavigate={handleNav} />

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

/* ── Plan Badge ─────────────────────────────────────────── */
const PLAN_DOT_COLORS = { premium: '#FF6B2B', basic: '#185FA5', none: '#9B9790', superadmin: '#FF6B2B' };
const PLAN_LABELS = { premium: 'Premium ⭐', basic: 'Basic', none: 'Sin plan', superadmin: 'SuperAdmin 👑' };

function PlanBadge({ collapsed, onNavigate }) {
  const { plan } = usePlan();
  const dotColor = PLAN_DOT_COLORS[plan] || '#9B9790';

  if (collapsed) {
    return (
      <div
        className="sidebar-plan-dot sidebar-plan-dot--solo"
        title={`Plan ${PLAN_LABELS[plan] || plan}`}
        style={{ '--dot-color': dotColor }}
      />
    );
  }

  return (
    <div className="sidebar-plan-badge">
      <div className="sidebar-plan-badge__row">
        <span className="sidebar-plan-dot" style={{ '--dot-color': dotColor }} />
        <span className="sidebar-plan-badge__label">{PLAN_LABELS[plan] || plan}</span>
      </div>
      {plan === 'basic' && (
        <button
          className="sidebar-plan-badge__upgrade"
          onClick={() => onNavigate('configuracion')}
        >
          Mejorar →
        </button>
      )}
    </div>
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

function BriefcaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7
        a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8
        8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5
        a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>
    </svg>
  );
}

function DollarSignIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}
