import { useState, useEffect } from 'react';
import { clearToken, getMe } from '../services/auth';
import { PLAN_PRICES, createPayment, redirectToWompiCheckout } from '../services/wompi';
import { api } from '../services/api';
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
  const [selectedPeriod, setSelectedPeriod] = useState('trial');
  const [usedTrial, setUsedTrial] = useState(true); // default true hasta verificar

  useEffect(() => {
    getMe()
      .then(u => setUser(u))
      .catch(() => {});
    api.get('/wompi/subscription-status')
      .then(data => {
        const trialUsed = data.has_used_trial || false;
        setUsedTrial(trialUsed);
        // Si ya usó el trial, mostrar mensual por defecto
        if (trialUsed) setSelectedPeriod('monthly');
      })
      .catch(() => { setUsedTrial(true); setSelectedPeriod('monthly'); });
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
    return PLAN_PRICES[plan][selectedPeriod] || PLAN_PRICES[plan].monthly;
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
          {!usedTrial && (
            <button
              className={`sr-period-btn ${selectedPeriod === 'trial' ? 'sr-period-btn--active sr-period-btn--trial' : ''}`}
              onClick={() => setSelectedPeriod('trial')}
            >
              🔥 Trial 7 días
              <span className="sr-period-savings" style={{ background: '#FF6B2B' }}>-50%</span>
            </button>
          )}
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
              {selectedPeriod === 'trial' && (
                <>
                  <p style={{ fontSize: '13px', color: '#6B6B6B', margin: '-4px 0 4px' }}>
                    por 7 días — luego <s style={{ color: '#9E9E9E' }}>{PLAN_PRICES.basic.trial.originalLabel}</s> <strong>$1.500/mes</strong>
                  </p>
                  <p style={{ fontSize: '12px', color: '#FF6B2B', fontWeight: 600, margin: '0 0 4px' }}>
                    {PLAN_PRICES.basic.trial.savings}
                  </p>
                </>
              )}
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
                : selectedPeriod === 'trial' ? 'Probar Basic 7 días →' : 'Activar Basic →'}
            </button>
          </div>

          {/* Premium */}
          <div className="sr-plan sr-plan--premium">
            <div className="sr-plan__badge">⭐ Popular</div>
            <div className="sr-plan__header">
              <h2 className="sr-plan__name sr-plan__name--premium">Premium</h2>
              <p className="sr-plan__price">{getPriceData('premium').label}</p>
              {selectedPeriod === 'trial' && (
                <>
                  <p style={{ fontSize: '13px', color: '#6B6B6B', margin: '-4px 0 4px' }}>
                    por 7 días — luego <s style={{ color: '#9E9E9E' }}>{PLAN_PRICES.premium.trial.originalLabel}</s> <strong>$2.000/mes</strong>
                  </p>
                  <p style={{ fontSize: '12px', color: '#FF6B2B', fontWeight: 600, margin: '0 0 4px' }}>
                    {PLAN_PRICES.premium.trial.savings}
                  </p>
                </>
              )}
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
                : selectedPeriod === 'trial' ? 'Probar Premium 7 días →' : 'Activar Premium →'}
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
