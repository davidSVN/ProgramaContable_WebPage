import { useEffect, useRef, useState } from 'react';
import './MLChart.css';

const DEMAND_DATA = [30, 45, 38, 55, 72, 60, 85, 70, 90, 78, 95, 88, 75, 105, 92, 115, 100, 120, 108, 130, 118, 140, 128, 145, 135, 155, 145, 160];

function buildPath(data, width, height, padding = 20) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const xStep = (width - padding * 2) / (data.length - 1);
  return data.map((val, i) => {
    const x = padding + i * xStep;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function MLChart() {
  const pathRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const path = pathRef.current;
    if (!path || !visible) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.transition = 'stroke-dashoffset 2.5s ease';
    requestAnimationFrame(() => {
      path.style.strokeDashoffset = '0';
    });
  }, [visible]);

  const W = 600, H = 160;
  const linePath = buildPath(DEMAND_DATA, W, H);

  return (
    <section className="ml-section" id="ml" ref={sectionRef}>
      <div className="ml-inner">
        <div className="ml-header">
          <div className="ml-badge">🧠 IA Exclusiva</div>
          <h2 className="ml-title">El único SaaS de lavandería<br />con Inteligencia Artificial</h2>
          <p className="ml-subtitle">
            Nuestro modelo predice cuándo tendrás picos de demanda, qué servicios son más rentables
            y cómo fidelizar a tus mejores clientes.
          </p>
        </div>

        <div className="ml-chart-card">
          <div className="ml-chart-header">
            <span className="ml-chart-label">Predicción de demanda — próximas 4 semanas</span>
            <span className="ml-chart-accuracy">94.2% precisión</span>
          </div>
          <div className="ml-chart-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} className="ml-svg" preserveAspectRatio="none">
              {/* Grid */}
              {[40, 80, 120].map(y => (
                <line key={y} x1="20" y1={y} x2={W-20} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4,4" />
              ))}
              {/* Area */}
              <defs>
                <linearGradient id="mlGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FF6B2B" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#FF6B2B" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={linePath + ` L${W-20},${H} L20,${H} Z`}
                fill="url(#mlGrad)"
              />
              {/* Main line */}
              <path
                ref={pathRef}
                d={linePath}
                fill="none"
                stroke="#FF6B2B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Prediction marker */}
              <line x1="310" y1="10" x2="310" y2={H-10} stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="3,3" />
              <text x="315" y="22" fill="rgba(255,255,255,0.5)" fontSize="9">Predicción →</text>
            </svg>
            <div className="ml-axis">
              {['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'].map(w => (
                <span key={w}>{w}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="ml-insights">
          {[
            { icon: '📈', title: 'Pico esperado el viernes', desc: '+42% vs promedio semanal', color: '#FF6B2B' },
            { icon: '⭐', title: 'Servicio estrella: lavado express', desc: 'Representa el 38% de tus ingresos', color: '#38A169' },
            { icon: '👑', title: 'Clientes VIP detectados: 3', desc: 'Esta semana — retención prioritaria', color: '#805AD5' },
          ].map((insight, i) => (
            <div key={i} className="ml-insight-card neo-card">
              <div className="ml-insight-icon" style={{ color: insight.color }}>{insight.icon}</div>
              <div>
                <div className="ml-insight-title">{insight.title}</div>
                <div className="ml-insight-desc">{insight.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
