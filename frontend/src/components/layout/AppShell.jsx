import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import PlanExpiryBanner from '../PlanExpiryBanner';
import './AppShell.css';

// Sections
import IAReportes from '../sections/IAReportes';
import NuevaOrden from '../sections/NuevaOrden';
import B2BOrdenes from '../sections/ordenes/B2BOrdenes';
import HistorialOrdenes from '../sections/ordenes/HistorialOrdenes';
import Domicilios from '../sections/ordenes/Domicilios';
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
import { WhatsAppCenter } from '../../whatsapp';
import CanalesDinero from '../sections/CanalesDinero';

const SECTIONS = {
  'ia-reportes': IAReportes,
  'nueva-orden': NuevaOrden,
  'b2b-ordenes': B2BOrdenes,
  'historial-ordenes':  HistorialOrdenes,
  'domicilios':         Domicilios,
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
  'whatsapp-center': WhatsAppCenter,
  'canales-dinero': CanalesDinero,
};

export default function AppShell({ user }) {
  const [activeSection, setActiveSection] = useState('ia-reportes');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('washflow_sidebar') === 'collapsed'; } catch { return false; }
  });

  const plan = localStorage.getItem('washflow_plan') ?? 'none';
  const showSubBanner = plan === 'none' && user?.role !== 'superadmin';

  const handleCollapse = (next) => {
    setCollapsed(next);
    try { localStorage.setItem('washflow_sidebar', next ? 'collapsed' : 'expanded'); } catch {}
  };

  // Permite que el banner redirija a Configuración
  useEffect(() => {
    const handler = () => setActiveSection('configuracion');
    window.addEventListener('washflow:open-configuracion', handler);
    return () => window.removeEventListener('washflow:open-configuracion', handler);
  }, []);

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

        <PlanExpiryBanner />

        <main className="content-area" id="main-content" tabIndex={-1}>
          <div className="section-panel" key={activeSection}>
            <ActiveSection user={user} onNavigate={setActiveSection} />
          </div>
        </main>
      </div>
    </div>
  );
}
