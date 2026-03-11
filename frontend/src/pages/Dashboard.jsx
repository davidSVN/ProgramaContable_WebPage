import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getMe, clearToken } from '../services/auth';
import './Dashboard.css';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = () => {
    clearToken();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="dash-loading__spinner" />
        <p>Cargando tu dashboard…</p>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.username || user.name || user.email?.split('@')[0] || 'Usuario';

  return (
    <div className="dash-page">
      {/* Topbar */}
      <header className="dash-topbar">
        <Link to="/" className="dash-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="4" fill="#FF6B2B" stroke="#1A1A1A" strokeWidth="2"/>
            <circle cx="14" cy="14" r="8" stroke="#FFFDF7" strokeWidth="2"/>
            <circle cx="14" cy="14" r="4" stroke="#FFFDF7" strokeWidth="1.5"/>
            <circle cx="8" cy="8" r="1.5" fill="#FFFDF7"/>
          </svg>
          WashFlow
        </Link>
        <div className="dash-topbar__right">
          <div className="dash-user-badge">
            <span className="dash-avatar">{displayName[0].toUpperCase()}</span>
            <span className="dash-username">{displayName}</span>
          </div>
          <button className="neo-btn neo-btn-outline dash-logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="dash-main">
        {/* Welcome */}
        <div className="dash-welcome fade-slide-up">
          <h1 className="dash-welcome__title">¡Bienvenido, {displayName}! 🎉</h1>
          <p className="dash-welcome__sub">
            Tu espacio de control está casi listo. Mientras tanto, aquí tienes un vistazo.
          </p>
        </div>

        {/* Stat cards */}
        <div className="dash-stats">
          {[
            { icon: '📦', label: 'Órdenes activas', value: '—', color: 'var(--orange)' },
            { icon: '💳', label: 'Ingresos del mes', value: '—', color: 'var(--green)' },
            { icon: '👥', label: 'Clientes', value: '—', color: '#805AD5' },
          ].map((s, i) => (
            <div key={i} className="dash-stat-card neo-card fade-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="dash-stat-card__icon">{s.icon}</div>
              <div className="dash-stat-card__value" style={{ color: s.color }}>{s.value}</div>
              <div className="dash-stat-card__label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Coming soon banner */}
        <div className="dash-coming-soon neo-card fade-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="dash-coming-soon__icon">🚀</div>
          <div>
            <h2 className="dash-coming-soon__title">Tu dashboard completo está en construcción. Ya casi.</h2>
            <p className="dash-coming-soon__sub">
              Estamos preparando gestión de órdenes, reportes, predicciones con IA y mucho más.
              Te notificaremos cuando esté listo.
            </p>
          </div>
        </div>

        {/* Features preview */}
        <div className="dash-preview-grid">
          {[
            { icon: '📦', title: 'Órdenes', desc: 'Próximamente', locked: true },
            { icon: '💳', title: 'Pagos', desc: 'Próximamente', locked: true },
            { icon: '👥', title: 'Clientes', desc: 'Próximamente', locked: true },
            { icon: '🧠', title: 'ML Insights', desc: 'Próximamente', locked: true },
          ].map((f, i) => (
            <div key={i} className="dash-preview-card neo-card">
              <div className="dash-preview-card__icon">{f.icon}</div>
              <div className="dash-preview-card__title">{f.title}</div>
              <div className="dash-preview-card__badge">🔒 {f.desc}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
