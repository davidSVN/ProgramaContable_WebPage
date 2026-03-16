import { useState } from 'react';
import { clearToken } from '../services/auth';
import { updatePlan } from '../services/suscripcion';
import './SuscripcionRequerida.css';

const BASIC_FEATURES = [
  'Crear y gestionar órdenes',
  'Historial de clientes',
  'Control de gastos',
  'Historial de órdenes',
  'Facturación B2B',
];

const PREMIUM_FEATURES = [
  'Todo el plan Basic',
  'IA & Reportes avanzados',
  'Segmentación RFM',
  'Predicciones de demanda',
  'Detección de churn',
  'Oportunidades de descuento',
];

export default function SuscripcionRequerida({ onPlanActivated }) {
  const [loading, setLoading] = useState(null); // 'basic' | 'premium' | null
  const [error, setError] = useState(null);

  const handleActivar = async (plan) => {
    setLoading(plan);
    setError(null);
    try {
      await updatePlan(plan);
      localStorage.setItem('washflow_plan', plan);
      onPlanActivated?.(plan);
    } catch (err) {
      setError(err.message || 'Error al activar el plan');
    } finally {
      setLoading(null);
    }
  };

  const handleLogout = () => {
    clearToken();
    window.location.href = '/login';
  };

  return (
    <div className="sr-page">
      {/* Logo */}
      <a className="sr-logo" href="/">
        <div className="sr-logo__icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="#fff" strokeWidth="2"/>
            <circle cx="10" cy="10" r="3.5" stroke="#fff" strokeWidth="1.5"/>
            <circle cx="5" cy="5" r="1.2" fill="#fff"/>
          </svg>
        </div>
        <span className="sr-logo__text">WashFlow</span>
      </a>

      <div className="sr-content">
        {/* Header */}
        <div className="sr-header">
          <div className="sr-lock-icon">🔒</div>
          <h1 className="sr-title">Tu lavandería no tiene<br/>una suscripción activa</h1>
          <p className="sr-subtitle">
            Para usar WashFlow necesitas activar un plan.<br/>
            Elige el que mejor se adapte a tu negocio.
          </p>
        </div>

        {error && (
          <div className="sr-error">⚠️ {error}</div>
        )}

        {/* Plan cards */}
        <div className="sr-plans">
          {/* Basic */}
          <div className="sr-plan sr-plan--basic">
            <div className="sr-plan__header">
              <h2 className="sr-plan__name">Basic</h2>
              <p className="sr-plan__price">Próximamente</p>
            </div>
            <ul className="sr-plan__features">
              {BASIC_FEATURES.map(f => (
                <li key={f} className="sr-plan__feature">
                  <span className="sr-plan__check">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="sr-plan__btn sr-plan__btn--basic"
              onClick={() => handleActivar('basic')}
              disabled={loading !== null}
            >
              {loading === 'basic'
                ? <><span className="sr-spinner" /> Activando...</>
                : 'Activar Basic →'}
            </button>
          </div>

          {/* Premium */}
          <div className="sr-plan sr-plan--premium">
            <div className="sr-plan__badge">⭐ Popular</div>
            <div className="sr-plan__header">
              <h2 className="sr-plan__name sr-plan__name--premium">Premium</h2>
              <p className="sr-plan__price">Próximamente</p>
            </div>
            <ul className="sr-plan__features">
              {PREMIUM_FEATURES.map(f => (
                <li key={f} className="sr-plan__feature sr-plan__feature--premium">
                  <span className="sr-plan__check sr-plan__check--premium">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="sr-plan__btn sr-plan__btn--premium"
              onClick={() => handleActivar('premium')}
              disabled={loading !== null}
            >
              {loading === 'premium'
                ? <><span className="sr-spinner sr-spinner--light" /> Activando...</>
                : 'Activar Premium →'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="sr-footer">
          <p className="sr-footer__text">¿Ya tienes una suscripción?</p>
          <button className="sr-logout-btn" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
