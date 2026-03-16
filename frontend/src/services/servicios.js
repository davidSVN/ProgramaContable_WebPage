import { api } from './api';

export const getServicios = (params = {}) =>
  api.get(`/servicios?${new URLSearchParams(params)}`);

export const getServiciosStats = () =>
  api.get('/servicios/stats');

export const createServicio = (data) =>
  api.post('/servicios', data);

export const updateServicio = (id, data) =>
  api.put(`/servicios/${id}`, data);

export const deleteServicio = (id) =>
  api.delete(`/servicios/${id}`);
