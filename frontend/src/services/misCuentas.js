import { api } from './api';

export const getMisCuentas = () => api.get('/mis-cuentas');

export const calibrarSaldos = (canales) =>
  api.put('/mis-cuentas/calibrar', { canales });

export const borrarCalibracion = (channel) =>
  api.delete(`/mis-cuentas/calibrar/${channel}`);

export const crearTransferencia = (data) => api.post('/mis-cuentas/transferencias', data);

export const eliminarTransferencia = (id) => api.delete(`/mis-cuentas/transferencias/${id}`);
