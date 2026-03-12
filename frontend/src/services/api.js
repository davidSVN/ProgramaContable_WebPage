const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'washflow_token';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Error de red: no se pudo conectar con el servidor');
  }

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (res.status === 204) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.detail || `Error ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.map(e => e.msg).join(', ') : msg);
  }

  return res.json();
}

export const api = {
  get:    (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post:   (path, body, options = {}) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put:    (path, body, options = {}) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch:  (path, body = null, options = {}) => {
    const opts = { ...options, method: 'PATCH' };
    if (body !== null) opts.body = JSON.stringify(body);
    return request(path, opts);
  },
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};

export default api;
