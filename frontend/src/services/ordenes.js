import { api } from './api';

/**
 * GET /ordenes/historial
 * Returns: { data: OrderHistorialItem[], total, page, limit, total_pages }
 */
export const getHistorialOrdenes = (params) => {
  // Strip empty/null params to keep URL clean
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/ordenes/historial?${new URLSearchParams(clean)}`);
};

/**
 * GET /ordenes/historial/stats
 * Returns: { total_ordenes, total_recaudado, ordenes_debe, monto_por_cobrar }
 */
export const getOrdenesStats = () => api.get('/ordenes/historial/stats');

/**
 * DELETE /ordenes/:id
 */
export const deleteOrden = (id) => api.delete(`/ordenes/${id}`);

/**
 * PUT /ordenes/:id/estado
 */
export const updateOrdenEstado = (id, data) => api.put(`/ordenes/${id}/estado`, data);
