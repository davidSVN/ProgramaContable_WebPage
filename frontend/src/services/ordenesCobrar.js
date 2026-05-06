import { api } from './api';

/**
 * GET /ordenes/historial?estado_pago=DEBE&is_institute=false&...params
 * La pestaña "Por cobrar" es exclusivamente B2C — las facturas B2B tienen su
 * propia pantalla de consolidación. Por eso forzamos is_institute=false a
 * menos que el caller lo sobreescriba explícitamente.
 * Returns: { data: OrderHistorialItem[], total, page, limit, total_pages }
 */
export const getOrdenesDebe = (params = {}) => {
  const merged = { is_institute: false, ...params };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/ordenes/historial?estado_pago=POR_COBRAR&${new URLSearchParams(clean)}`);
};

/**
 * GET /ordenes/historial/stats?is_institute=false
 * Mismo criterio: stats de la pestaña "Por cobrar" son solo B2C.
 * Returns: { total_ordenes, total_recaudado, ordenes_debe, monto_por_cobrar }
 */
export const getOrdenesDebeStats = (params = {}) => {
  const merged = { is_institute: false, ...params };
  const clean = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  const qs = new URLSearchParams(clean).toString();
  return api.get(`/ordenes/historial/stats${qs ? '?' + qs : ''}`);
};

/**
 * PUT /ordenes/:id/estado
 * Body: { estado, estado_pago, metodo_pago, monto_pago }
 */
export const marcarPagado = (orderId, data) =>
  api.put(`/ordenes/${orderId}/estado`, data);
