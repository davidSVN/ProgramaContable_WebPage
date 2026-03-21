import { api } from './api';

export const getSetupStatus = () => api.get('/auth/setup/status');

export const setupBusiness = (nombre_negocio) =>
  api.post('/auth/setup/business', { nombre_negocio });

export const setupJoinRequest = (nombre_negocio) =>
  api.post('/auth/setup/join-request', { nombre_negocio });
