import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMe } from '../services/auth';
import { verifyPayment } from '../services/wompi';
import AppShell from '../components/layout/AppShell';
import SuscripcionRequerida from './SuscripcionRequerida';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(() => localStorage.getItem('washflow_plan') ?? 'none');
  const [paymentResult, setPaymentResult] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    getMe()
      .then(u => {
        setUser(u);
        const p = u.plan ?? localStorage.getItem('washflow_plan') ?? 'none';
        localStorage.setItem('washflow_plan', p);
        setPlan(p);
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  // Verificar pago al regresar de Wompi
  useEffect(() => {
    const paymentRef = searchParams.get('payment_ref');
    if (!paymentRef) return;

    const checkPayment = async () => {
      try {
        const result = await verifyPayment(paymentRef);
        setPaymentResult(result);

        if (result.status === 'APPROVED') {
          localStorage.setItem('washflow_plan', result.plan);
          setPlan(result.plan);
        }
      } catch (err) {
        console.error('Error verificando pago:', err);
      } finally {
        searchParams.delete('payment_ref');
        setSearchParams(searchParams, { replace: true });
      }
    };

    // Esperar un momento para dar tiempo al webhook
    setTimeout(checkPayment, 2000);
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

  return (
    <>
      {/* Modal de resultado del pago */}
      {paymentResult && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#FFFDF7', border: '2px solid #1A1A1A',
            borderRadius: '8px', padding: '32px', maxWidth: '400px',
            textAlign: 'center', boxShadow: '4px 4px 0px #1A1A1A',
          }}>
            {paymentResult.status === 'APPROVED' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  ¡Pago exitoso!
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  Tu plan <strong>{paymentResult.plan}</strong> ha sido activado.
                  {paymentResult.plan_expires_at && (
                    <> Válido hasta {new Date(paymentResult.plan_expires_at).toLocaleDateString('es-CO')}.</>
                  )}
                </p>
                <button
                  style={{
                    background: '#1A1A1A', color: '#fff', border: 'none',
                    borderRadius: '8px', padding: '10px 24px', cursor: 'pointer',
                    fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
                  }}
                  onClick={() => {
                    setPaymentResult(null);
                    window.location.reload();
                  }}
                >
                  ¡Comenzar! →
                </button>
              </>
            ) : paymentResult.status === 'PENDING' ? (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  Pago en proceso
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  Tu pago está siendo procesado. Te notificaremos cuando se confirme.
                </p>
                <button
                  style={{
                    background: 'transparent', color: '#1A1A1A',
                    border: '2px solid #1A1A1A', borderRadius: '8px',
                    padding: '10px 24px', cursor: 'pointer',
                    fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
                  }}
                  onClick={() => setPaymentResult(null)}
                >
                  Entendido
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <h2 style={{ fontFamily: 'Bricolage Grotesque', marginBottom: '8px' }}>
                  Pago no completado
                </h2>
                <p style={{ color: '#6B6B6B', marginBottom: '16px' }}>
                  El pago fue {paymentResult.status === 'DECLINED' ? 'rechazado' : 'cancelado'}.
                  Puedes intentar de nuevo desde Configuración.
                </p>
                <button
                  style={{
                    background: 'transparent', color: '#1A1A1A',
                    border: '2px solid #1A1A1A', borderRadius: '8px',
                    padding: '10px 24px', cursor: 'pointer',
                    fontFamily: 'DM Sans', fontSize: '14px', fontWeight: 600,
                  }}
                  onClick={() => setPaymentResult(null)}
                >
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <AppShell user={user} />
    </>
  );
}
