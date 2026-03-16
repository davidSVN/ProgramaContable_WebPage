import { api } from './api';

/**
 * GET /ordenes/historial?estado_pago=DEBE&...params
 * Returns: { data: OrderHistorialItem[], total, page, limit, total_pages }
 */
export const getOrdenesDebe = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/ordenes/historial?estado_pago=POR_COBRAR&${new URLSearchParams(clean)}`);
};

/**
 * GET /ordenes/historial/stats
 * Returns: { total_ordenes, total_recaudado, ordenes_debe, monto_por_cobrar }
 */
export const getOrdenesDebeStats = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
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
