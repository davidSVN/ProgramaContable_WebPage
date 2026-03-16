import { api } from './api';

export const getAppUsers = (params) =>
  api.get(`/app-users?${new URLSearchParams(params)}`);

export const getAppUsersStats = () =>
  api.get('/app-users/stats');

export const createAppUser = (data) =>
  api.post('/app-users', data);

export const updateAppUser = (id, data) =>
  api.put(`/app-users/${id}`, data);

export const toggleAppUserActivo = (id) =>
  api.patch(`/app-users/${id}/toggle-activo`);

export const deleteAppUser = (id) =>
  api.delete(`/app-users/${id}`);
