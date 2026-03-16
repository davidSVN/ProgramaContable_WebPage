import { api } from './api';

const clean = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

/**
 * GET /ordenes/detalles
 * Returns list of OrderDetail rows joined with OrderHeader.
 */
export const getOrderDetails = (params) =>
  api.get(`/ordenes/detalles?${new URLSearchParams(clean(params))}`);

/**
 * GET /ordenes/detalles/count
 * Returns { total: N }
 */
export const getOrderDetailsCount = (params) =>
  api.get(`/ordenes/detalles/count?${new URLSearchParams(clean(params))}`);

/**
 * GET /ordenes/detalles/stats
 * Returns { total_count: N, total_cost: M }
 */
export const getOrderDetailsStats = (params) =>
  api.get(`/ordenes/detalles/stats?${new URLSearchParams(clean(params))}`);
