import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../services/auth';
import AppShell from '../components/layout/AppShell';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return (
      <div className="dash-loading-screen">
        <div className="dash-spinner" />
        <p>Cargando WashFlow…</p>
      </div>
    );
  }

  if (!user) return null;

  return <AppShell user={user} />;
}
