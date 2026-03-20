import { api } from './api';

/**
 * Precios de los planes (para mostrar en el UI).
 * Los precios reales los valida el backend.
 */
export const PLAN_PRICES = {
  basic: {
    monthly: { amount: 49900, label: '$49.900/mes' },
    yearly:  { amount: 479000, label: '$479.000/año', savings: 'Ahorras 2 meses' },
  },
  premium: {
    monthly: { amount: 89900, label: '$89.900/mes' },
    yearly:  { amount: 862000, label: '$862.000/año', savings: 'Ahorras 2 meses' },
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
