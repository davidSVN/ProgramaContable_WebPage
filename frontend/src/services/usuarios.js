import { getToken } from './auth';

const API = 'http://localhost:8000/api';

// GET /api/usuarios?page=1&limit=15&search=&estado=&nivel=&user_type=B2C
export async function getUsuarios({ page = 1, limit = 15, search = '', estado = '', nivel = '', user_type = 'B2C' } = {}) {
  const token = getToken();
  const offset = (page - 1) * limit;
  const params = new URLSearchParams({ 
    limit, 
    offset, 
    user_type 
  });
  if (search) params.append('search_names', search);
  
  const res = await fetch(`${API}/usuarios?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar usuarios');
  
  // Para el total necesitamos otra llamada o que el backend devuelva el total.
  // Como el backend devuelve List[UsuarioResponse], vamos a pedir el count por separado si es necesario, 
  // o simplemente devolver la data.
  const data = await res.json();
  
  // Obtenemos el total para la paginación
  const countRes = await fetch(`${API}/usuarios/count?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const countData = await countRes.json();
  
  return { items: data, total: countData.total };
}

// POST /api/usuarios → { nombre, email, contacto, direccion, notas, estado }
export async function createUsuario(data) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al crear usuario');
  }
  return res.json();
}

// PUT /api/usuarios/:id → partial update
export async function updateUsuario(id, data) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error al actualizar usuario');
  return res.json();
}

// DELETE /api/usuarios/:id → soft delete (inactivar)
export async function deleteUsuario(id) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al inactivar usuario');
  return res.json();
}

// GET /api/usuarios/:id/ordenes → user order history
export async function getUsuarioOrdenes(id) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios/${id}/ordenes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar órdenes del usuario');
  return res.json();
}
