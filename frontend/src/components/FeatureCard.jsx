import { useEffect, useRef, useState } from 'react';
import './FeatureCard.css';

const FEATURES = [
  { icon: '📦', title: 'Gestión de Órdenes', desc: 'Crea, edita y rastrea cada prenda en tiempo real' },
  { icon: '💳', title: 'Pagos & Abonos', desc: 'Cobra, registra abonos y lleva control de deuda' },
  { icon: '👥', title: 'Usuarios & Roles', desc: 'Administra tu equipo con permisos inteligentes' },
  { icon: '🎁', title: 'Programas de Fidelidad', desc: 'Crea modelos de puntos y recompensas' },
  { icon: '📣', title: 'Campañas de Mensajes', desc: 'Envía promos por WhatsApp o SMS' },
  { icon: '🧠', title: 'Machine Learning', desc: 'Predice comportamiento y optimiza tu negocio' },
];

export default function FeatureCards() {
  const [visible, setVisible] = useState([]);
  const refs = useRef([]);

  useEffect(() => {
    const observers = refs.current.map((el, i) => {
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setTimeout(() => setVisible(prev => [...prev, i]), i * 100);
            obs.disconnect();
          }
        },
        { threshold: 0.15 }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  return (
    <section className="features-section" id="features">
      <div className="features-inner">
        <div className="features-header">
          <h2 className="features-title">Todo lo que necesitas.<br /><span>Nada que no necesitas.</span></h2>
        </div>
        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <article
              key={i}
              ref={el => refs.current[i] = el}
              className={`feature-card neo-card ${visible.includes(i) ? 'feature-card--visible' : ''}`}
            >
              <div className="feature-card__icon">{f.icon}</div>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
