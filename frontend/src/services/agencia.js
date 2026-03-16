import { api } from './api';

/**
 * GET /ordenes/historial — fetch a large batch for client-side agency filtering
 * Returns: { data: OrderHistorialItem[], total, page, limit, total_pages }
 */
export const getOrdenesAgencia = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  // We point to /gastos/agencia which returns individual order_details marked as is_agency
  return api.get(`/gastos/agencia?${new URLSearchParams(clean)}`);
};

export const getAgenciaCount = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/gastos/agencia/count?${new URLSearchParams(clean)}`);
};

/**
 * GET /ordenes/historial/stats
 * Returns: { total_ordenes, total_recaudado, ordenes_debe, monto_por_cobrar }
 */
export const getAgenciaStats = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/gastos/agencia/stats?${new URLSearchParams(clean)}`);
};

export const getAgenciaSummary = (params = {}) => {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );
  return api.get(`/gastos/agencia/summary?${new URLSearchParams(clean)}`);
};
