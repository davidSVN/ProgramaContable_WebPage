import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../services/auth';
import AppShell from '../components/layout/AppShell';
import SuscripcionRequerida from './SuscripcionRequerida';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(() => localStorage.getItem('washflow_plan') ?? 'none');
  const navigate = useNavigate();

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

  return <AppShell user={user} />;
}
