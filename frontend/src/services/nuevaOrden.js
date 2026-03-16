import { api } from './api';

export const buscarClientes = (q, userType) =>
  api.get(`/usuarios/search?q=${encodeURIComponent(q)}&user_type=${userType}&limit=10`);

export const getServiciosB2C = () =>
  api.get('/ordenes/servicios');

export const getServiciosB2B = (institucion) =>
  api.get(`/ordenes/servicios?institucion=${encodeURIComponent(institucion)}`);

export const crearOrdenB2C = (data) =>
  api.post('/ordenes/', data);

export const crearOrdenB2B = (data) =>
  api.post('/b2b/ordenes/', data);
