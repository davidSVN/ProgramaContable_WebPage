import { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './AppShell.css';

// Sections
import IAReportes from '../sections/IAReportes';
import NuevaOrden from '../sections/NuevaOrden';
import B2BOrdenes from '../sections/ordenes/B2BOrdenes';
import HistorialOrdenes from '../sections/ordenes/HistorialOrdenes';
import GastosNegocio from '../sections/ordenes/GastosNegocio';
import OrdenesPorCobrar from '../sections/ordenes/OrdenesPorCobrar';
import ServiciosAgencia from '../sections/ordenes/ServiciosAgencia';
import ServiciosPorOrdenes from '../sections/ordenes/ServiciosPorOrdenes';
import Usuarios from '../sections/Usuarios';
import Instituciones from '../sections/Instituciones';
import Servicios from '../sections/Servicios';
import Proveedores from '../sections/Proveedores';
import UsuariosApp from '../sections/UsuariosApp';
import Configuracion from '../sections/Configuracion';

const SECTIONS = {
  'ia-reportes': IAReportes,
  'nueva-orden': NuevaOrden,
  'b2b-ordenes': B2BOrdenes,
  'historial-ordenes':  HistorialOrdenes,
  'servicios-ordenes':  ServiciosPorOrdenes,
  'gastos-negocio':     GastosNegocio,
  'facturas-cobrar': OrdenesPorCobrar,
  'servicios-terceros': ServiciosAgencia,
  'usuarios': Usuarios,
  'instituciones': Instituciones,
  'servicios': Servicios,
  'proveedores': Proveedores,
  'usuarios-app': UsuariosApp,
  'configuracion': Configuracion,
};

export default function AppShell({ user }) {
  const [activeSection, setActiveSection] = useState('usuarios');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('washflow_sidebar') === 'collapsed'; } catch { return false; }
  });

  const plan = localStorage.getItem('washflow_plan') ?? 'none';
  const showSubBanner = plan === 'none' && user?.role !== 'superadmin';

  const handleCollapse = (next) => {
    setCollapsed(next);
    try { localStorage.setItem('washflow_sidebar', next ? 'collapsed' : 'expanded'); } catch {}
  };

  const ActiveSection = SECTIONS[activeSection] || Usuarios;

  return (
    <div className="app-shell">
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        user={user}
        collapsed={collapsed}
        onCollapse={handleCollapse}
      />

      <div className={`main-content ${collapsed ? 'collapsed' : ''} ${showSubBanner ? 'sub-banner-visible' : ''}`}>
        <Topbar
          activeSection={activeSection}
          user={user}
          onNavigate={setActiveSection}
        />

        <main className="content-area" id="main-content" tabIndex={-1}>
          <div className="section-panel" key={activeSection}>
            <ActiveSection user={user} onNavigate={setActiveSection} />
          </div>
        </main>
      </div>
    </div>
  );
}
