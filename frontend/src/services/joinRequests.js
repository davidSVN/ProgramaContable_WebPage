import { api } from './api';

export const getJoinRequests = () => api.get('/join-requests');

export const approveJoinRequest = (id) => api.post(`/join-requests/${id}/approve`);

export const rejectJoinRequest = (id) => api.post(`/join-requests/${id}/reject`);
