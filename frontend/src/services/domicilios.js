import { api } from './api';

export const getDomicilios = (params = {}) =>
  api.get(`/ordenes/domicilios?${new URLSearchParams(params)}`);

export const getDomiciliosStats = () =>
  api.get('/ordenes/domicilios/stats');

export const getDomicilio = (orderId) =>
  api.get(`/ordenes/${orderId}/domicilio`);

export const createDomicilio = (orderId, data) =>
  api.post(`/ordenes/${orderId}/domicilio`, data);

export const updateDomicilio = (orderId, data) =>
  api.put(`/ordenes/${orderId}/domicilio`, data);

export const updateEstadoDomicilio = (orderId, estado) =>
  api.patch(`/ordenes/${orderId}/domicilio/estado`, { estado_domicilio: estado });
