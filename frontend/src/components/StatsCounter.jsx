import { useEffect, useRef, useState } from 'react';
import './StatsCounter.css';

const STATS = [
  { value: 500, suffix: '+', label: 'Lavanderías activas', rotate: '-1deg' },
  { value: 98, suffix: '%', label: 'Satisfacción de clientes', rotate: '0.5deg' },
  { value: 3, suffix: 'x', label: 'Más ingresos en 6 meses', rotate: '-0.5deg' },
  { value: 0, suffix: ' min', label: 'Para empezar hoy', rotate: '1deg' },
];

function Counter({ value, suffix, label, rotate, visible }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    if (value === 0) { setCount(0); return; }
    const duration = 1800;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [visible, value]);

  return (
    <div className="stat-card neo-card" style={{ transform: `rotate(${rotate})` }}>
      <div className="stat-card__number">
        {count}{suffix}
      </div>
      <div className="stat-card__label">{label}</div>
    </div>
  );
}

export default function StatsCounter() {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="stats-section" ref={ref} id="stats">
      <div className="stats-grid">
        {STATS.map((s, i) => (
          <Counter key={i} {...s} visible={visible} />
        ))}
      </div>
    </section>
  );
}
