import { api } from './api';

const clean = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

export const getCanales         = ()          => api.get('/canales/');
export const getCanalesSaldos   = (params)    => api.get(`/canales/saldos?${new URLSearchParams(clean(params))}`);
export const createCanal        = (data)      => api.post('/canales/', data);
export const updateCanal        = (id, data)  => api.put(`/canales/${id}`, data);
export const deleteCanal        = (id)        => api.delete(`/canales/${id}`);
export const getTransferencias  = (params)    => api.get(`/canales/transferencias?${new URLSearchParams(clean(params))}`);
export const createTransferencia = (data)     => api.post('/canales/transferencias', data);
export const deleteTransferencia = (id)       => api.delete(`/canales/transferencias/${id}`);
