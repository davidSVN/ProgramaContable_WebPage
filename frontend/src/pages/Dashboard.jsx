import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../services/auth';
import { pollPaymentStatus } from '../services/wompi';
import AppShell from '../components/layout/AppShell';
import SuscripcionRequerida from './SuscripcionRequerida';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(() => localStorage.getItem('washflow_plan') ?? 'none');
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [pollMessage, setPollMessage] = useState('');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    getMe()
      .then(u => {
        setUser(u);
        const p = u.plan ?? 'none';
        localStorage.setItem('washflow_plan', p);
        localStorage.setItem('washflow_role', u.role);
        setPlan(p);
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  // Verificar pago al regresar de Wompi (con polling)
  useEffect(() => {
    const paymentRef = searchParams.get('payment_ref');
    if (!paymentRef) return;

    searchParams.delete('payment_ref');
    setSearchParams(searchParams, { replace: true });

    const checkPayment = async () => {
      setPaymentChecking(true);
      setPollMessage('Verificando tu pago con Wompi...');

      const msgs = [
        'Verificando tu pago con Wompi...',
        'Esperando confirmación del banco...',
        'Procesando, esto puede tomar unos segundos...',
        'Casi listo, confirmando transacción...',
        'Aún procesando, por favor espera...',
      ];

      try {
        const result = await pollPaymentStatus(paymentRef, {
          intervalMs: 4000,
          maxAttempts: 30,
          onPending: (attempt) => {
            setPollMessage(msgs[Math.min(attempt - 1, msgs.length - 1)]);
          },
        });

        setPaymentResult(result);

        if (result.status === 'APPROVED') {
          localStorage.setItem('washflow_plan', result.plan);
          setPlan(result.plan);
        }
      } catch (err) {
        console.error('Error verificando pago:', err);
        setPaymentResult({ status: 'ERROR', reference: paymentRef });
      } finally {
        setPaymentChecking(false);
      }
    };

    // 3 segundos para dar tiempo al webhook antes de empezar polling
    setTimeout(checkPayment, 3000);
  }, []);

  // Listen for 402 events from api.js interceptor
  useEffect(() => {
    const handler = () => setPlan('none');
    window.addEventListener('washflow:plan-required', handler);
    return () => window.removeEventListener('washflow:plan-required', handler);
  }, []);

  if (loading) {
    return (
      <div className="dash-loading-screen">
        <div className="dash-spinner" />
        <p>Cargando WashFlow…</p>
      </div>
    );
  }

  if (!user) return null;

  const isSuperadmin = user.role === 'superadmin';
  if (plan === 'none' && !isSuperadmin) {
    return (
      <SuscripcionRequerida
        onPlanActivated={(newPlan) => {
          setPlan(newPlan);
          localStorage.setItem('washflow_plan', newPlan);
        }}
      />
    );
  }

  const modalBox = {
    background: '#FFFDF7', border: '2px solid #1A1A1A',
    borderRadius: '8px', padding: '40px', maxWidth: '420px', width: '90%',
    textAlign: 'center', boxShadow: '4px 4px 0px #1A1A1A',
  };
  const btnPrimary = {
    background: '#1A1A1A', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '10px 24px', cursor: 'pointer',
    fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
  };
  const btnOutline = {
    background: 'transparent', color: '#1A1A1A', border: '2px solid #1A1A1A',
    borderRadius: '8px', padding: '10px 24px', cursor: 'pointer',
    fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
  };
  const overlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };

  return (
    <>
      {/* Spinner mientras se verifica el pago */}
      {paymentChecking && (
        <div style={overlay}>
          <div style={modalBox}>
            <div className="dash-spinner" style={{ margin: '0 auto 20px' }} />
            <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px', fontSize: '18px' }}>
              Confirmando tu pago
            </h2>
            <p style={{ color: '#6B6B6B', fontSize: '14px' }}>{pollMessage}</p>
          </div>
        </div>
      )}

      {/* Resultado final del pago */}
      {paymentResult && !paymentChecking && (
        <div style={overlay}>
          <div style={modalBox}>
            {paymentResult.status === 'APPROVED' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>¡Pago exitoso!</h2>
                <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
                  Tu plan <strong>{paymentResult.plan}</strong> ha sido activado.
                  {paymentResult.plan_expires_at && (
                    <> Válido hasta {new Date(paymentResult.plan_expires_at).toLocaleDateString('es-CO')}.</>
                  )}
                </p>
                <button style={btnPrimary} onClick={() => { setPaymentResult(null); window.location.reload(); }}>
                  ¡Comenzar! →
                </button>
              </>
            ) : paymentResult.status === 'PENDING' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>Pago en proceso</h2>
                <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
                  Tu pago fue recibido pero el banco aún lo está procesando.
                  Esto es normal y puede tomar unos minutos. Tu plan se activará
                  automáticamente cuando el banco confirme.
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button style={btnPrimary} onClick={async () => {
                    setPaymentChecking(true);
                    setPollMessage('Verificando con Wompi...');
                    try {
                      const result = await pollPaymentStatus(paymentResult.reference, { intervalMs: 3000, maxAttempts: 10 });
                      setPaymentResult(result);
                      if (result.status === 'APPROVED') {
                        localStorage.setItem('washflow_plan', result.plan);
                        setPlan(result.plan);
                      }
                    } catch (e) { console.error(e); }
                    finally { setPaymentChecking(false); }
                  }}>
                    Verificar ahora →
                  </button>
                  <button style={btnOutline} onClick={() => setPaymentResult(null)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>Pago no completado</h2>
                <p style={{ color: '#6B6B6B', marginBottom: '20px' }}>
                  {paymentResult.status === 'DECLINED'
                    ? 'El pago fue rechazado por el banco. Intenta con otro método de pago.'
                    : 'Hubo un error procesando el pago. Intenta de nuevo desde Configuración.'}
                </p>
                <button style={btnOutline} onClick={() => setPaymentResult(null)}>Cerrar</button>
              </>
            )}
          </div>
        </div>
      )}

      <AppShell user={user} />
    </>
  );
}
