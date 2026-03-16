import { api } from './api';

export const getSuscripcionInfo = () =>
  api.get('/suscripcion/info');

export const updatePlan = (plan) =>
  api.patch('/suscripcion/plan', { plan });
