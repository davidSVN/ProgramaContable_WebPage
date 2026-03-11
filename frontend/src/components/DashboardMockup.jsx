import { useEffect, useRef, useState } from 'react';
import './DashboardMockup.css';

const STATUSES = [
  { label: 'Recibida', color: '#6B6B6B', emoji: '📥' },
  { label: 'En proceso', color: '#FF6B2B', emoji: '🔄' },
  { label: 'Lista', color: '#38A169', emoji: '✅' },
  { label: 'Entregada', color: '#1A1A1A', emoji: '🎉' },
];

function RevenueChart() {
  const pathRef = useRef(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    setTimeout(() => {
      path.style.transition = 'stroke-dashoffset 2s ease';
      path.style.strokeDashoffset = '0';
    }, 400);
  }, []);

  return (
    <svg viewBox="0 0 300 80" className="revenue-chart" aria-label="Gráfica de ingresos">
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF6B2B" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#FF6B2B" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[20, 40, 60].map(y => (
        <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="#E8E3D9" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <path
        d="M0,65 C30,60 50,50 80,45 C110,40 120,55 150,40 C180,25 200,30 230,20 C255,12 275,18 300,10 L300,80 L0,80Z"
        fill="url(#chartGrad)"
        opacity="0.4"
      />
      {/* Line */}
      <path
        ref={pathRef}
        d="M0,65 C30,60 50,50 80,45 C110,40 120,55 150,40 C180,25 200,30 230,20 C255,12 275,18 300,10"
        fill="none"
        stroke="#FF6B2B"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Data points */}
      {[[0,65],[80,45],[150,40],[230,20],[300,10]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#FF6B2B" stroke="#FFFDF7" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

export default function DashboardMockup() {
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStatusIdx(i => (i + 1) % STATUSES.length);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  const status = STATUSES[statusIdx];

  return (
    <section className="demo-section" id="demo">
      <div className="demo-inner">
        <div className="demo-header">
          <h2 className="demo-title">Ve WashFlow en acción</h2>
          <p className="demo-subtitle">Un dashboard diseñado para que nada se te escape.</p>
        </div>

        <div className="mockup neo-card">
          {/* Sidebar */}
          <aside className="mockup__sidebar">
            <div className="mockup__brand">
              <span className="mockup__brand-dot" />
              WashFlow
            </div>
            <nav className="mockup__nav">
              {['🏠 Inicio', '📦 Órdenes', '💳 Pagos', '👥 Clientes', '📊 Reportes', '🧠 ML'].map((item, i) => (
                <div key={i} className={`mockup__nav-item ${i === 1 ? 'mockup__nav-item--active' : ''}`}>
                  {item}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main content */}
          <main className="mockup__main">
            {/* Top bar */}
            <div className="mockup__topbar">
              <span className="mockup__greeting">Buenos días, Carlos 👋</span>
              <div className="mockup__topbar-right">
                <div className="mockup__avatar">C</div>
              </div>
            </div>

            {/* Content grid */}
            <div className="mockup__content">
              {/* Revenue card */}
              <div className="mockup__card mockup__card--wide neo-card">
                <div className="mockup__card-header">
                  <span className="mockup__card-title">Ingresos del mes</span>
                  <span className="mockup__card-value">S/ 4,280</span>
                </div>
                <RevenueChart />
              </div>

              {/* Order status card */}
              <div className="mockup__card neo-card">
                <div className="mockup__card-title">Orden #0042</div>
                <div className="mockup__order-meta">
                  <span>Cliente: María García</span>
                  <span>3 prendas</span>
                </div>
                <div className="mockup__status-track">
                  {STATUSES.map((s, i) => (
                    <div key={i} className={`mockup__status-step ${i <= statusIdx ? 'active' : ''}`}>
                      <div className="mockup__status-dot" style={{ background: i <= statusIdx ? s.color : '#E8E3D9' }} />
                      {i < STATUSES.length - 1 && <div className={`mockup__status-line ${i < statusIdx ? 'active' : ''}`} />}
                    </div>
                  ))}
                </div>
                <div className="mockup__status-badge" style={{ color: status.color, borderColor: status.color }}>
                  {status.emoji} {status.label}
                </div>
              </div>

              {/* Quick stats */}
              <div className="mockup__mini-stats">
                {[
                  { label: 'Hoy', val: '12' },
                  { label: 'Pendientes', val: '4' },
                  { label: 'Listas', val: '8' },
                ].map((s, i) => (
                  <div key={i} className="mockup__mini-stat neo-card">
                    <div className="mockup__mini-val">{s.val}</div>
                    <div className="mockup__mini-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
