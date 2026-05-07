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
export const getOrdenesStats = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/ordenes/historial/stats?${new URLSearchParams(clean)}`);
};

/**
 * GET /ordenes/historial/statuses
 * Returns: string[]
 */
export const getHistorialStatuses = () => api.get('/ordenes/historial/statuses');

/**
 * DELETE /ordenes/:id
 */
export const deleteOrden = (id) => api.delete(`/ordenes/${id}`);

/**
 * PUT /ordenes/:id/estado
 */
export const updateOrdenEstado = (id, data) => api.put(`/ordenes/${id}/estado`, data);

/**
 * POST /ordenes/:id/entregar
 */
export const entregarOrden = (id, data) => api.post(`/ordenes/${id}/entregar`, data);

/**
 * GET /ordenes/:id/detalle
 */
export const getOrdenDetalle = (id) => api.get(`/ordenes/${id}/detalle`);

/**
 * GET /ordenes/detalles — flat list of order details with order_id and detail_id
 */
export const getOrdenesDetallesFlat = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/ordenes/detalles?${new URLSearchParams(clean)}`);
};

/**
 * PATCH /ordenes/:order_id/detalles/:detail_id
 * Body: { is_agency?, spent_per_order?, unit_price?, quantity?, description?, service_name? }
 * Returns: { orden, warnings }
 */
export const updateOrderDetail = (orderId, detailId, data) =>
  api.patch(`/ordenes/${orderId}/detalles/${detailId}`, data);
