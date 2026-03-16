import { usePlan } from '../../hooks/usePlan';

export function BlockedAction({ children, message }) {
  const { isActive } = usePlan();
  if (isActive) return children;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', cursor: 'not-allowed' }}
      title={message ?? 'Activa una suscripción para usar esta función'}
    >
      <div style={{ pointerEvents: 'none', opacity: 0.4 }}>
        {children}
      </div>
    </div>
  );
}
