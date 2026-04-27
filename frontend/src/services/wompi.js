import { api } from './api';

/**
 * Precios de los planes (para mostrar en el UI).
 * Los precios reales los valida el backend.
 */
export const PLAN_PRICES = {
  basic: {
    monthly: { amount: 1500,  label: '$1.500/mes' },
    yearly:  { amount: 15000, label: '$15.000/año', savings: 'Ahorras 2 meses' },
    trial:   { amount: 750,   label: '$750', originalLabel: '$1.500/mes', savings: '50% de descuento por 7 días' },
  },
  premium: {
    monthly: { amount: 2000,  label: '$2.000/mes' },
    yearly:  { amount: 20000, label: '$20.000/año', savings: 'Ahorras 2 meses' },
    trial:   { amount: 1000,  label: '$1.000', originalLabel: '$2.000/mes', savings: '50% de descuento por 7 días' },
  },
};

/**
 * Solicita al backend crear un registro de pago y devuelve
 * los datos necesarios para redirigir al checkout de Wompi.
 */
export async function createPayment(plan, period) {
  const data = await api.post('/wompi/create-payment', { plan, period });
  return data;
}

/**
 * Redirige al usuario al checkout de Wompi con todos los parámetros.
 *
 * @param {object} paymentData - Respuesta de createPayment()
 * @param {string} userEmail - Email del usuario actual
 * @param {string} userName - Nombre del usuario actual
 */
export function redirectToWompiCheckout(paymentData, userEmail = '', userName = '') {
  const checkoutUrl = import.meta.env.VITE_WOMPI_CHECKOUT_URL || 'https://checkout.wompi.co/p/';

  const params = new URLSearchParams({
    'public-key': paymentData.public_key,
    'currency': paymentData.currency,
    'amount-in-cents': paymentData.amount_in_cents.toString(),
    'reference': paymentData.reference,
    'signature:integrity': paymentData.integrity_signature,
    'redirect-url': paymentData.redirect_url,
  });

  if (userEmail) {
    params.set('customer-data:email', userEmail);
  }
  if (userName) {
    params.set('customer-data:full-name', userName);
  }

  window.location.href = `${checkoutUrl}?${params.toString()}`;
}

/**
 * Verifica el estado de un pago después de que el usuario
 * regresa del checkout de Wompi.
 */
export async function verifyPayment(reference) {
  const data = await api.get(`/wompi/verify/${reference}`);
  return data;
}

/**
 * Obtiene el historial de pagos del tenant.
 */
export async function getPaymentHistory() {
  const data = await api.get('/wompi/payment-history');
  return data;
}

/**
 * Hace polling al backend cada intervalMs hasta que el pago tenga
 * un estado final (APPROVED, DECLINED, VOIDED, ERROR) o se agoten los intentos.
 *
 * Por qué existe: el webhook de Wompi puede tardar unos segundos en llegar.
 * Mientras tanto, nuestra DB tiene status=PENDING. Este polling consulta
 * directamente a Wompi vía el backend hasta confirmar el estado real.
 *
 * @param {string} reference - Referencia del pago (WF-xxx-timestamp)
 * @param {object} options
 * @param {number} options.intervalMs - ms entre intentos (default 4000)
 * @param {number} options.maxAttempts - máximo de intentos (default 30 = ~2 min)
 * @param {function} options.onPending - callback(attempt, max) mientras sigue PENDING
 */
export function pollPaymentStatus(reference, {
  intervalMs = 4000,
  maxAttempts = 30,
  onPending = null,
} = {}) {
  let attempts = 0;

  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      attempts++;
      try {
        const result = await api.get(`/wompi/verify/${reference}`);

        if (['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(result.status)) {
          clearInterval(poll);
          resolve(result);
          return;
        }

        if (onPending) onPending(attempts, maxAttempts);
      } catch (err) {
        console.error('Error en polling de pago:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        resolve({ status: 'PENDING', reference });
      }
    }, intervalMs);
  });
}
