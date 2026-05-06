import { api } from './api';

export const getGastos = (params) =>
  api.get(`/gastos?${new URLSearchParams(params)}`);

export const getGastosCount = (params) =>
  api.get(`/gastos/count?${new URLSearchParams(params)}`);

export const getGastosStats = (params) =>
  api.get(`/gastos/stats?${new URLSearchParams(params)}`);

/**
 * GET /gastos/categorias → string[]
 * Lista categorías disponibles (defaults + las que el tenant ya usó).
 */
export const getGastoCategorias = () => api.get('/gastos/categorias');

export const getGastosAgencia = (params) =>
  api.get(`/gastos/agencia?${new URLSearchParams(params)}`);

export const getGastosAgenciaCount = (params) =>
  api.get(`/gastos/agencia/count?${new URLSearchParams(params)}`);

export const createGasto = (data) =>
  api.post('/gastos', data);

export const updateGasto = (id, data) =>
  api.put(`/gastos/${id}`, data);

export const deleteGasto = (id) =>
  api.delete(`/gastos/${id}`);
