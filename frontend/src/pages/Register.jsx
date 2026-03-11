import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../services/auth';
import './Auth.css';

function getStrength(pass) {
  if (!pass) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  if (score <= 1) return { score: 25, label: 'Débil', color: 'var(--red)' };
  if (score <= 2) return { score: 60, label: 'Media', color: 'var(--orange)' };
  return { score: 100, label: 'Fuerte', color: 'var(--green)' };
}

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
      <div className="auth-illus__coin auth-illus__coin--1">✨</div>
      <div className="auth-illus__coin auth-illus__coin--2">🎉</div>
      <div className="auth-illus__coin auth-illus__coin--3">🪙</div>
    </div>
  );
}

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailValid, setEmailValid] = useState(null);
  const formRef = useRef(null);
  const navigate = useNavigate();

  const strength = getStrength(password);
  const passMatch = confirmPass && password === confirmPass;

  const validateEmail = (val) => {
    setEmail(val);
    setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPass) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!accepted) {
      setError('Debes aceptar los términos y condiciones');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1800);
    } catch (err) {
      setError(err.message);
      formRef.current?.classList.remove('shake');
      void formRef.current?.offsetWidth;
      formRef.current?.classList.add('shake');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-success-overlay">
        <div style={{ fontSize: '4rem' }}>🎉</div>
        <h2>¡Cuenta creada!</h2>
        <p>Redirigiendo a tu dashboard…</p>
      </div>
    );
  }

  return (
    <div className="auth-page auth-page--mirrored">
      {/* Right side → form (order 1) */}
      <div className="auth-right">
        <div className="auth-card neo-card" ref={formRef}>
          <h1 className="auth-card__title">Crea tu cuenta gratis ✨</h1>
          <p className="auth-card__sub">Empieza en menos de 2 minutos</p>

          {error && (
            <div className="auth-error" role="alert">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="name" className="auth-label">Nombre completo</label>
              <input
                id="name"
                type="text"
                className="neo-input"
                placeholder="Carlos Mamani"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

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
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-toggle-pass"
                  onClick={() => setShowPass(!showPass)}
                  aria-label="Toggle password visibility"
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
              {password && (
                <div className="auth-strength">
                  <div className="auth-strength__bar">
                    <div
                      className="auth-strength__fill"
                      style={{ width: `${strength.score}%`, background: strength.color }}
                    />
                  </div>
                  <div className="auth-strength__label" style={{ color: strength.color }}>
                    {strength.label}
                  </div>
                </div>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="confirmPass" className="auth-label">Confirmar contraseña</label>
              <div className="auth-input-wrap">
                <input
                  id="confirmPass"
                  type="password"
                  className="neo-input"
                  placeholder="••••••••"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                {passMatch && <span className="auth-check">✓</span>}
                {confirmPass && !passMatch && <span className="auth-x">✕</span>}
              </div>
            </div>

            <div className="auth-checkbox-wrap">
              <input
                id="terms"
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
              />
              <label htmlFor="terms">
                Acepto los <a href="#" className="auth-link">Términos y Condiciones</a> de WashFlow
              </label>
            </div>

            <button
              type="submit"
              className="neo-btn neo-btn-primary auth-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-spinner" aria-hidden />
              ) : 'Crear mi cuenta gratis'}
            </button>
          </form>

          <p className="auth-switch">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="auth-link">Inicia sesión</Link>
          </p>
        </div>
      </div>

      {/* Left side → branding */}
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
          <h2 className="auth-left__title">Tu negocio, en el siguiente nivel.</h2>
          <p className="auth-left__sub">Una cuenta. Todo el poder de WashFlow.</p>
          <WashIllustrationSmall />
          <div className="auth-left__features">
            {['✓ 14 días gratis', '✓ Sin tarjeta de crédito', '✓ Cancela cuando quieras'].map(f => (
              <span key={f} className="auth-left__feature">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
