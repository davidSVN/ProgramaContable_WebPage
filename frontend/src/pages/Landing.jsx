import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import HeroIllustration from '../components/HeroIllustration';
import StatsCounter from '../components/StatsCounter';
import FeatureCards from '../components/FeatureCard';
import DashboardMockup from '../components/DashboardMockup';
import MLChart from '../components/MLChart';
import './Landing.css';

export default function Landing() {
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

      {/* ── Pricing teaser ── */}
      <section className="pricing-teaser" id="pricing">
        <div className="pricing-inner">
          <h2 className="pricing-title">Precios que te hacen crecer,<br />no que te frenan.</h2>
          <p className="pricing-sub">Desde S/ 49/mes. Sin contratos. Sin sorpresas.</p>
          <Link to="/register" className="neo-btn neo-btn-primary">
            Ver planes →
          </Link>
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
