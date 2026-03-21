import { api } from './api';

const TOKEN_KEY = 'washflow_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('washflow_plan');
  localStorage.removeItem('washflow_role');
};

export async function login(email, password) {
  try {
    const data = await api.post('/auth/login', { email, password });
    
    setToken(data.access_token);
    localStorage.setItem('washflow_plan', data.plan ?? 'none');
    localStorage.setItem('washflow_role', data.role ?? '');
    return data;
  } catch (err) {
    throw new Error(err.message || 'Credenciales incorrectas');
  }
}

export async function register(name, email, password) {
  try {
    const data = await api.post('/auth/register', { name, email, password });

    setToken(data.access_token);
    localStorage.setItem('washflow_plan', data.plan ?? 'none');
    localStorage.setItem('washflow_role', data.role ?? 'pending');
    return data;
  } catch (err) {
    throw new Error(err.message || 'Error al crear cuenta');
  }
}

export async function getMe() {
  const token = getToken();
  if (!token) throw new Error('No token');
  
  try {
    return await api.get('/auth/me');
  } catch (err) {
    throw new Error('Token inválido');
  }
}
