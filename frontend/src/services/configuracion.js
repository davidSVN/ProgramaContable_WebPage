import { api } from './api';

export const getNegocioConfig = () =>
  api.get('/configuracion/negocio');

export const updateNegocioConfig = (data) =>
  api.put('/configuracion/negocio', data);
