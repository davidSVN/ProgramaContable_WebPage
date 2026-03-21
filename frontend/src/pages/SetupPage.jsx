import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSetupStatus, setupBusiness, setupJoinRequest } from '../services/setup';
import { clearToken, setToken } from '../services/auth';
import './SetupPage.css';

// step: 'loading' | 'choose' | 'business' | 'employee' | 'waiting' | 'rejected'

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('loading');
  const [joinRequest, setJoinRequest] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // On mount: check current status
  useEffect(() => {
    async function checkStatus() {
      try {
        const data = await getSetupStatus();

        // If already set up (admin/empleado), go to dashboard
        if (data.role !== 'pending') {
          localStorage.setItem('washflow_role', data.role);
          navigate('/dashboard', { replace: true });
          return;
        }

        if (data.join_request) {
          setJoinRequest(data.join_request);
          if (data.join_request.status === 'rejected') {
            setStep('rejected');
          } else {
            setStep('waiting');
          }
        } else {
          setStep('choose');
        }
      } catch {
        setStep('choose');
      }
    }
    checkStatus();
  }, []); // eslint-disable-line

  const handleBusinessSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nombre = businessName.trim();
    if (!nombre) { setError('Ingresa el nombre de tu negocio'); return; }

    setLoading(true);
    try {
      const data = await setupBusiness(nombre);
      // Update stored token and role
      setToken(data.access_token);
      localStorage.setItem('washflow_role', data.role);
      localStorage.setItem('washflow_plan', data.plan ?? 'none');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Error al crear el negocio');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nombre = businessName.trim();
    if (!nombre) { setError('Ingresa el nombre del negocio'); return; }

    setLoading(true);
    try {
      await setupJoinRequest(nombre);
      setJoinRequest({ status: 'pending', tenant_nombre: nombre });
      setStep('waiting');
    } catch (err) {
      setError(err.message || 'Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  const handleRetry = () => {
    setBusinessName('');
    setError('');
    setStep('employee');
  };

  if (step === 'loading') {
    return (
      <div className="setup-page">
        <div className="setup-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
          <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-page">
      <div className="setup-card">
        {/* Brand */}
        <div className="setup-brand">
          WashFlow<span className="setup-brand__dot" />
        </div>

        {/* Step dots */}
        <div className="setup-steps">
          <div className="setup-step-dot setup-step-dot--active" />
          <div className={`setup-step-dot ${step !== 'choose' ? 'setup-step-dot--active' : ''}`} />
        </div>

        {/* ── CHOOSE ROLE ── */}
        {step === 'choose' && (
          <>
            <h1 className="setup-title">¿Cuál es tu rol?</h1>
            <p className="setup-sub">
              Elige cómo quieres usar WashFlow. Esta selección define cómo se configurará tu cuenta.
            </p>
            <div className="setup-role-grid">
              <button className="setup-role-card" onClick={() => { setStep('business'); setError(''); setBusinessName(''); }}>
                <span className="setup-role-card__icon">🏪</span>
                <div className="setup-role-card__title">Soy propietario</div>
                <div className="setup-role-card__desc">Tengo una lavandería y quiero administrarla</div>
              </button>
              <button className="setup-role-card" onClick={() => { setStep('employee'); setError(''); setBusinessName(''); }}>
                <span className="setup-role-card__icon">👤</span>
                <div className="setup-role-card__title">Soy empleado</div>
                <div className="setup-role-card__desc">Trabajo en una lavandería y quiero unirme</div>
              </button>
            </div>
            <div className="setup-logout">
              <button onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </>
        )}

        {/* ── BUSINESS OWNER ── */}
        {step === 'business' && (
          <>
            <button className="setup-btn--back" onClick={() => setStep('choose')}>
              ← Volver
            </button>
            <h1 className="setup-title" style={{ marginTop: 16 }}>Nombre de tu negocio</h1>
            <p className="setup-sub">
              Este nombre identifica tu lavandería en el sistema. Los empleados lo usarán para solicitar unirse.
            </p>
            {error && <div className="setup-error">{error}</div>}
            <form className="setup-form" onSubmit={handleBusinessSubmit}>
              <div className="setup-field">
                <label htmlFor="biz-name">Nombre del negocio</label>
                <input
                  id="biz-name"
                  type="text"
                  className="neo-input"
                  placeholder="Ej: Lavandería El Sol"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  required
                  autoFocus
                />
                <p className="setup-hint">
                  Usa un nombre claro y único. Tus empleados deberán escribirlo exactamente igual.
                </p>
              </div>
              <button className="setup-btn setup-btn--primary" type="submit" disabled={loading}>
                {loading && <span className="setup-spinner" />}
                {loading ? 'Creando negocio…' : 'Crear mi negocio'}
              </button>
            </form>
          </>
        )}

        {/* ── EMPLOYEE JOIN ── */}
        {step === 'employee' && (
          <>
            <button className="setup-btn--back" onClick={() => setStep('choose')}>
              ← Volver
            </button>
            <h1 className="setup-title" style={{ marginTop: 16 }}>Únete a un negocio</h1>
            <p className="setup-sub">
              Escribe el nombre exacto de la lavandería donde trabajas. El administrador recibirá tu solicitud y deberá aprobarla.
            </p>
            {error && <div className="setup-error">{error}</div>}
            <form className="setup-form" onSubmit={handleJoinSubmit}>
              <div className="setup-field">
                <label htmlFor="emp-biz-name">Nombre del negocio</label>
                <input
                  id="emp-biz-name"
                  type="text"
                  className="neo-input"
                  placeholder="Ej: Lavandería El Sol"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  required
                  autoFocus
                />
                <p className="setup-hint setup-hint--warning">
                  Debe coincidir exactamente con el nombre registrado por el administrador (incluyendo mayúsculas y tildes).
                </p>
              </div>
              <button className="setup-btn setup-btn--primary" type="submit" disabled={loading}>
                {loading && <span className="setup-spinner" />}
                {loading ? 'Enviando solicitud…' : 'Enviar solicitud'}
              </button>
            </form>
          </>
        )}

        {/* ── WAITING FOR APPROVAL ── */}
        {step === 'waiting' && (
          <div className="setup-waiting">
            <div className="setup-waiting__icon">⏳</div>
            <div className="setup-waiting__title">Solicitud enviada</div>
            <p className="setup-waiting__desc">
              Tu solicitud para unirte al negocio ha sido enviada. El administrador debe aprobarla para que puedas acceder al sistema.
            </p>
            {joinRequest?.tenant_nombre && (
              <div className="setup-waiting__business">
                🏪 {joinRequest.tenant_nombre}
              </div>
            )}
            <p className="setup-waiting__desc" style={{ fontSize: '0.83rem' }}>
              Cuando seas aprobado, inicia sesión nuevamente para acceder a tu cuenta.
            </p>
            <div className="setup-logout">
              <button onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </div>
        )}

        {/* ── REJECTED ── */}
        {step === 'rejected' && (
          <div className="setup-waiting">
            <div className="setup-waiting__icon">❌</div>
            <div className="setup-waiting__title">Solicitud rechazada</div>
            <div className="setup-waiting__rejected">
              <div className="setup-waiting__rejected-title">Tu solicitud fue rechazada</div>
              <div className="setup-waiting__rejected-desc">
                El administrador de {joinRequest?.tenant_nombre ?? 'ese negocio'} no aprobó tu solicitud.
                Puedes intentar con otro negocio o contactar directamente al administrador.
              </div>
            </div>
            <button className="setup-btn setup-btn--primary" onClick={handleRetry}>
              Intentar con otro negocio
            </button>
            <div className="setup-logout">
              <button onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
