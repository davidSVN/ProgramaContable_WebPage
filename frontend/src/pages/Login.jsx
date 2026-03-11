import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../services/auth';
import './Auth.css';

function WashIllustrationSmall() {
  return (
    <div className="auth-illus">
      <div className="auth-illus__machine neo-card">
        <div className="auth-illus__drum-wrap">
          <div className="auth-illus__drum">
            <div className="auth-illus__drum-inner" />
          </div>
        </div>
        <div className="auth-illus__dots">
          <span /><span /><span style={{background:'var(--orange)'}} />
        </div>
      </div>
      <div className="auth-illus__coin auth-illus__coin--1">🪙</div>
      <div className="auth-illus__coin auth-illus__coin--2">💵</div>
      <div className="auth-illus__coin auth-illus__coin--3">🪙</div>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailValid, setEmailValid] = useState(null);
  const formRef = useRef(null);
  const navigate = useNavigate();

  const validateEmail = (val) => {
    setEmail(val);
    setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
      // Shake animation
      formRef.current?.classList.remove('shake');
      void formRef.current?.offsetWidth;
      formRef.current?.classList.add('shake');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left side */}
      <div className="auth-left">
        <Link to="/" className="auth-brand">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="4" fill="#FF6B2B" stroke="#1A1A1A" strokeWidth="2"/>
            <circle cx="14" cy="14" r="8" stroke="#FFFDF7" strokeWidth="2"/>
            <circle cx="14" cy="14" r="4" stroke="#FFFDF7" strokeWidth="1.5"/>
            <circle cx="8" cy="8" r="1.5" fill="#FFFDF7"/>
          </svg>
          WashFlow
        </Link>
        <div className="auth-left__content">
          <h2 className="auth-left__title">El SaaS que tu lavandería merecía.</h2>
          <p className="auth-left__sub">Gestión total. IA incluida. Empieza hoy.</p>
          <WashIllustrationSmall />
          <div className="auth-left__features">
            {['✓ Sin contrato', '✓ Soporte en español', '✓ IA incluida'].map(f => (
              <span key={f} className="auth-left__feature">{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="auth-right">
        <div className="auth-card neo-card" ref={formRef}>
          <h1 className="auth-card__title">Bienvenido de vuelta 👋</h1>
          <p className="auth-card__sub">Ingresa a tu cuenta</p>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="email" className="auth-label">Email</label>
              <div className="auth-input-wrap">
                <input
                  id="email"
                  type="email"
                  className="neo-input"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => validateEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                {emailValid === true && <span className="auth-check">✓</span>}
                {emailValid === false && email && <span className="auth-x">✕</span>}
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="password" className="auth-label">Contraseña</label>
              <div className="auth-input-wrap">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  className="neo-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-toggle-pass"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="neo-btn neo-btn-primary auth-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" aria-hidden />
              ) : 'Iniciar Sesión'}
            </button>
          </form>

          <p className="auth-switch">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="auth-link">Regístrate</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
