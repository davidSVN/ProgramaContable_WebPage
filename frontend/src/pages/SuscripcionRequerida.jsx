import { useState, useEffect } from 'react';
import { clearToken, getMe } from '../services/auth';
import { PLAN_PRICES, createPayment, redirectToWompiCheckout } from '../services/wompi';
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
  const [user, setUser] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');

  useEffect(() => {
    getMe()
      .then(u => setUser(u))
      .catch(() => {});
  }, []);

  const handleActivar = async (plan) => {
    setLoading(plan);
    setError(null);
    try {
      const paymentData = await createPayment(plan, selectedPeriod);
      
      const userEmail = user?.email || localStorage.getItem('washflow_email') || '';
      const userName = user?.username || localStorage.getItem('washflow_username') || '';

      redirectToWompiCheckout(paymentData, userEmail, userName);
    } catch (err) {
      setError(err.message || 'Error al iniciar el proceso de pago');
      setLoading(null);
    }
  };

  const handleLogout = () => {
    clearToken();
    window.location.href = '/login';
  };

  const getPriceData = (plan) => {
    return PLAN_PRICES[plan][selectedPeriod];
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

        {/* Period Selector */}
        <div className="sr-period-selector">
          <button
            className={`sr-period-btn ${selectedPeriod === 'monthly' ? 'sr-period-btn--active' : ''}`}
            onClick={() => setSelectedPeriod('monthly')}
          >
            Mensual
          </button>
          <button
            className={`sr-period-btn ${selectedPeriod === 'yearly' ? 'sr-period-btn--active' : ''}`}
            onClick={() => setSelectedPeriod('yearly')}
          >
            Anual
            <span className="sr-period-savings">-17%</span>
          </button>
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
              <p className="sr-plan__price">{getPriceData('basic').label}</p>
              {selectedPeriod === 'yearly' && (
                <p className="sr-plan__savings">{PLAN_PRICES.basic.yearly.savings}</p>
              )}
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
                ? <><span className="sr-spinner" /> Redirigiendo...</>
                : 'Activar Basic →'}
            </button>
          </div>

          {/* Premium */}
          <div className="sr-plan sr-plan--premium">
            <div className="sr-plan__badge">⭐ Popular</div>
            <div className="sr-plan__header">
              <h2 className="sr-plan__name sr-plan__name--premium">Premium</h2>
              <p className="sr-plan__price">{getPriceData('premium').label}</p>
              {selectedPeriod === 'yearly' && (
                <p className="sr-plan__savings">{PLAN_PRICES.premium.yearly.savings}</p>
              )}
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
                ? <><span className="sr-spinner sr-spinner--light" /> Redirigiendo...</>
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
