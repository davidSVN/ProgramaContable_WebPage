import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner">
        <Link to="/" className="navbar__logo">
          <span className="navbar__logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="4" fill="#FF6B2B" stroke="#1A1A1A" strokeWidth="2"/>
              <circle cx="14" cy="14" r="8" stroke="#FFFDF7" strokeWidth="2"/>
              <circle cx="14" cy="14" r="4" stroke="#FFFDF7" strokeWidth="1.5"/>
              <circle cx="8" cy="8" r="1.5" fill="#FFFDF7"/>
            </svg>
          </span>
          WashFlow
        </Link>

        <ul className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <li><a href="#features" onClick={() => setMenuOpen(false)}>Funcionalidades</a></li>
          <li><a href="#pricing" onClick={() => setMenuOpen(false)}>Precios</a></li>
          <li><a href="#ml" onClick={() => setMenuOpen(false)}>ML Insights</a></li>
          <li><Link to="/login" onClick={() => setMenuOpen(false)}>Iniciar Sesión</Link></li>
          <li>
            <Link
              to="/register"
              className="neo-btn neo-btn-primary navbar__cta"
              onClick={() => setMenuOpen(false)}
            >
              Empieza Gratis
            </Link>
          </li>
        </ul>

        <button
          className="navbar__hamburger"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={menuOpen ? 'open' : ''} />
          <span className={menuOpen ? 'open' : ''} />
          <span className={menuOpen ? 'open' : ''} />
        </button>
      </div>
    </nav>
  );
}
