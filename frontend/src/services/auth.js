const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'washflow_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('washflow_plan');
  localStorage.removeItem('washflow_role');
};

export async function login(email, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Credenciales incorrectas');
  }
  const data = await res.json();
  setToken(data.access_token);
  localStorage.setItem('washflow_plan', data.plan ?? 'none');
  localStorage.setItem('washflow_role', data.role ?? '');
  return data;
}

export async function register(name, email, password) {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al crear cuenta');
  }
  const data = await res.json();
  setToken(data.access_token);
  localStorage.setItem('washflow_plan', data.plan ?? 'none');
  localStorage.setItem('washflow_role', data.role ?? '');
  return data;
}

export async function getMe() {
  const token = getToken();
  if (!token) throw new Error('No token');
  const res = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Token inválido');
  return res.json();
}
