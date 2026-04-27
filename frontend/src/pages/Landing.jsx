import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import HeroIllustration from '../components/HeroIllustration';
import StatsCounter from '../components/StatsCounter';
import FeatureCards from '../components/FeatureCard';
import DashboardMockup from '../components/DashboardMockup';
import MLChart from '../components/MLChart';
import './Landing.css';

const BASIC_FEATURES = [
  'Crear y gestionar órdenes',
  'Historial de clientes',
  'Control de gastos',
  'Historial de órdenes',
  'Facturación B2B',
]

const PREMIUM_FEATURES = [
  'Todo el plan Basic',
  'IA & Reportes avanzados',
  'Segmentación RFM',
  'Predicciones de demanda',
  'Detección de churn',
  'Oportunidades de descuento',
]

const PRICES = {
  basic:   { monthly: '$1.500/mes', yearly: '$15.000/año',  trial: '$750',   trialOriginal: '$1.500/mes', savings: 'Ahorras 2 meses' },
  premium: { monthly: '$2.000/mes', yearly: '$20.000/año',  trial: '$1.000', trialOriginal: '$2.000/mes', savings: 'Ahorras 2 meses' },
}

export default function Landing() {
  const [period, setPeriod] = useState('monthly')
  return (
    <div className="landing">
      <Navbar />

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__text">
            <div className="hero__eyebrow">
              <span className="hero__badge">🚀 Nuevo: predicción con IA</span>
            </div>
            <h1 className="hero__headline">
              Tu lavandería,<br />
              <span className="hero__headline--accent">bajo control total.</span>
            </h1>
            <p className="hero__sub">
              Gestiona órdenes, pagos y fidelidad.<br />
              Y predice el futuro de tu negocio con IA.
            </p>
            <div className="hero__actions">
              <Link to="/register" className="neo-btn neo-btn-primary hero__cta-main">
                Empieza Gratis
              </Link>
              <a href="#demo" className="neo-btn neo-btn-outline">
                Ver Demo
              </a>
            </div>
            <div className="hero__trust">
              <div className="hero__avatars">
                {['A','B','C','D'].map(l => (
                  <div key={l} className="hero__avatar">{l}</div>
                ))}
              </div>
              <span>+500 lavanderías confían en WashFlow</span>
            </div>
          </div>
          <div className="hero__visual">
            <HeroIllustration />
          </div>
        </div>

        {/* Decorative elements */}
        <div className="hero__deco hero__deco--1" />
        <div className="hero__deco hero__deco--2" />
      </section>

      {/* ── Stats ── */}
      <StatsCounter />

      {/* ── Features ── */}
      <FeatureCards />

      {/* ── Dashboard Demo ── */}
      <DashboardMockup />

      {/* ── ML Teaser ── */}
      <MLChart />

      {/* ── Pricing ── */}
      <section className="pricing" id="pricing">
        <div className="pricing__inner">

          <div className="pricing__header">
            <h2 className="pricing__title">
              Precios que te hacen crecer,<br/>
              <span className="pricing__title--accent">no que te frenan.</span>
            </h2>
            <p className="pricing__sub">Sin contratos. Sin sorpresas. Cancela cuando quieras.</p>
          </div>

          <div className="pricing__period">
            <button
              className={`pricing__period-btn ${period==='monthly'?'active':''}`}
              onClick={() => setPeriod('monthly')}
            >Mensual</button>
            <button
              className={`pricing__period-btn ${period==='yearly'?'active':''}`}
              onClick={() => setPeriod('yearly')}
            >Anual <span className="pricing__savings-badge">-17%</span></button>
            <button
              className={`pricing__period-btn ${period==='trial'?'active':''}`}
              onClick={() => setPeriod('trial')}
            >Trial 7 días <span className="pricing__savings-badge" style={{background:'#FF6B2B'}}>-50%</span></button>
          </div>

          <div className="pricing__cards">

            <div className="pricing__card">
              <div className="pricing__card-header">
                <h3 className="pricing__plan-name">Basic</h3>
                {period === 'trial' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'center' }}>
                      <div className="pricing__price">{PRICES.basic.trial}</div>
                    </div>
                    <div className="pricing__period-label">por 7 días</div>
                    <div style={{ fontSize: '13px', color: '#6B6B6B', marginTop: '4px' }}>
                      Después <s style={{ color: '#9E9E9E' }}>{PRICES.basic.trialOriginal}</s> <strong>$1.500/mes</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pricing__price">{PRICES.basic[period].split('/')[0]}</div>
                    <div className="pricing__period-label">/{period === 'monthly' ? 'mes' : 'año'}</div>
                    {period === 'yearly' && <div className="pricing__plan-savings">{PRICES.basic.savings}</div>}
                  </>
                )}
              </div>
              <ul className="pricing__features">
                {BASIC_FEATURES.map(f => (
                  <li key={f} className="pricing__feature">
                    <span className="pricing__check">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="pricing__cta pricing__cta--basic">
                {period === 'trial' ? 'Probar 7 días al 50% →' : 'Empezar con Basic →'}
              </Link>
            </div>

            <div className="pricing__card pricing__card--premium">
              <div className="pricing__badge">⭐ Más popular</div>
              <div className="pricing__card-header">
                <h3 className="pricing__plan-name pricing__plan-name--premium">Premium</h3>
                {period === 'trial' ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'center' }}>
                      <div className="pricing__price">{PRICES.premium.trial}</div>
                    </div>
                    <div className="pricing__period-label">por 7 días</div>
                    <div style={{ fontSize: '13px', color: '#6B6B6B', marginTop: '4px' }}>
                      Después <s style={{ color: '#9E9E9E' }}>{PRICES.premium.trialOriginal}</s> <strong>$2.000/mes</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pricing__price">{PRICES.premium[period].split('/')[0]}</div>
                    <div className="pricing__period-label">/{period === 'monthly' ? 'mes' : 'año'}</div>
                    {period === 'yearly' && <div className="pricing__plan-savings">{PRICES.premium.savings}</div>}
                  </>
                )}
              </div>
              <ul className="pricing__features">
                {PREMIUM_FEATURES.map(f => (
                  <li key={f} className="pricing__feature pricing__feature--premium">
                    <span className="pricing__check pricing__check--premium">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="pricing__cta pricing__cta--premium">
                {period === 'trial' ? 'Probar 7 días al 50% →' : 'Empezar con Premium →'}
              </Link>
            </div>

          </div>

          <p className="pricing__trust">
            🔒 Pago seguro con Wompi · Cancela cuando quieras · Soporte incluido
          </p>

        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <span className="footer__logo">
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="4" fill="#FF6B2B" stroke="#FFFDF7" strokeWidth="2"/>
                <circle cx="14" cy="14" r="8" stroke="#FFFDF7" strokeWidth="2"/>
                <circle cx="14" cy="14" r="4" stroke="#FFFDF7" strokeWidth="1.5"/>
                <circle cx="8" cy="8" r="1.5" fill="#FFFDF7"/>
              </svg>
              WashFlow
            </span>
            <p className="footer__tagline">Hecho para lavanderías que quieren crecer.</p>
          </div>
          <nav className="footer__links">
            <a href="#">Privacidad</a>
            <a href="#">Términos</a>
            <a href="#">Contacto</a>
          </nav>
          <p className="footer__copy">© 2025 WashFlow</p>
        </div>
      </footer>
    </div>
  );
}
