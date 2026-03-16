import api from './api';

// GET /api/usuarios?page=1&limit=15&search=&estado=&nivel=&user_type=B2C
export async function getUsuarios({ page = 1, limit = 15, search = '', estado = '', nivel = '', user_type = 'B2C' } = {}) {
  const offset = (page - 1) * limit;
  const params = new URLSearchParams({ 
    limit, 
    offset, 
    user_type 
  });
  if (search) params.append('search_names', search);
  
  // Use centralized api service
  const data = await api.get(`/usuarios?${params}`);
  const countData = await api.get(`/usuarios/count?${params}`);
  
  return { items: data, total: countData.total };
}

// POST /api/usuarios → { nombre, email, contacto, direccion, notas, estado }
export async function createUsuario(data) {
  try {
    return await api.post('/usuarios', data);
  } catch (err) {
    throw new Error(err.message || 'Error al crear usuario');
  }
}

// PUT /api/usuarios/:id → partial update
export async function updateUsuario(id, data) {
  try {
    return await api.put(`/usuarios/${id}`, data);
  } catch (err) {
    throw new Error(err.message || 'Error al actualizar usuario');
  }
}

// DELETE /api/usuarios/:id → soft delete (inactivar)
export async function deleteUsuario(id) {
  try {
    return await api.delete(`/usuarios/${id}`);
  } catch (err) {
    throw new Error(err.message || 'Error al inactivar usuario');
  }
}

// GET /api/usuarios/:id/ordenes → user order history
export async function getUsuarioOrdenes(id) {
  try {
    return await api.get(`/usuarios/${id}/ordenes`);
  } catch (err) {
    throw new Error(err.message || 'Error al cargar órdenes del usuario');
  }
}
