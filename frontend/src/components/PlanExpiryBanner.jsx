import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function PlanExpiryBanner() {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.get('/wompi/subscription-status')
      .then(data => setStatus(data))
      .catch(() => {});
  }, []);

  if (!status || status.plan === 'none' || status.days_remaining > 5 || dismissed) {
    return null;
  }

  const isExpired    = status.days_remaining === 0;
  const isGrace      = status.is_in_grace_period;
  const renewalFailed = status.renewal_failed;

  let message  = '';
  let bgColor  = '';
  let txtColor = '';

  if (isExpired && !isGrace) {
    message  = 'Tu plan ha expirado. Renueva ahora para seguir usando WashFlow.';
    bgColor  = '#FED7D7';
    txtColor = '#9B2C2C';
  } else if (renewalFailed && isGrace) {
    const until = new Date(status.grace_period_ends_at).toLocaleDateString('es-CO');
    message  = `No pudimos cobrar tu tarjeta ****${status.card_last_four || ''}. Tienes hasta el ${until} para actualizar tu método de pago.`;
    bgColor  = '#FEFCBF';
    txtColor = '#975A16';
  } else if (status.days_remaining <= 5 && status.days_remaining > 0) {
    const dias = `${status.days_remaining} día${status.days_remaining > 1 ? 's' : ''}`;
    if (status.auto_renew && status.has_payment_source) {
      message  = `Tu plan se renueva automáticamente en ${dias}.`;
      bgColor  = '#E6F1FB';
      txtColor = '#185FA5';
    } else {
      message  = `Tu plan vence en ${dias}. Renueva ahora para no perder acceso.`;
      bgColor  = '#FEFCBF';
      txtColor = '#975A16';
    }
  }

  if (!message) return null;

  const showRenewBtn = !status.auto_renew || !status.has_payment_source || renewalFailed || isExpired;

  return (
    <div style={{
      background: bgColor,
      color: txtColor,
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      fontSize: '13px',
      fontFamily: 'DM Sans, sans-serif',
      borderBottom: `1px solid ${txtColor}30`,
    }}>
      <span>{message}</span>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {showRenewBtn && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('washflow:open-configuracion'))}
            style={{
              background: '#FF6B2B', color: '#fff', border: 'none',
              padding: '5px 14px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600, fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Renovar →
          </button>
        )}
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: '16px', color: txtColor, padding: '0 4px',
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
