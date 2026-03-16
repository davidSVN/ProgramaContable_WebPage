import api from './api';

// GET /api/usuarios?user_type=B2B
export async function getInstituciones({ search = '', estado = '', pago = '' } = {}) {
  const params = new URLSearchParams({ user_type: 'B2B' });
  if (search) params.append('search_names', search);
  
  return api.get(`/usuarios?${params}`);
}

// POST /api/usuarios → { nombre, nit, contacto, direccion, fecha_inicio, condicion_pago, estado }
export async function createInstitucion(data) {
  try {
    return await api.post('/usuarios', { ...data, user_type: 'B2B' });
  } catch (err) {
    throw new Error(err.message || 'Error al crear institución');
  }
}

// PUT /api/usuarios/:id → partial update
export async function updateInstitucion(id, data) {
  try {
    return await api.put(`/usuarios/${id}`, data);
  } catch (err) {
    throw new Error(err.message || 'Error al actualizar institución');
  }
}

// DELETE /api/usuarios/:id → soft delete
export async function deleteInstitucion(id) {
  try {
    return await api.delete(`/usuarios/${id}`);
  } catch (err) {
    throw new Error(err.message || 'Error al eliminar institución');
  }
}

// GET /api/b2b/ordenes?user_id=... → order history
export async function getInstitucionOrdenes(id) {
  try {
    return await api.get(`/b2b/ordenes/?user_id=${id}`);
  } catch (err) {
    throw new Error(err.message || 'Error al cargar órdenes');
  }
}

// GET /api/b2b/facturas?user_id=... → consolidated invoices
export async function getInstitucionFacturas(id) {
  try {
    return await api.get(`/b2b/facturas/?user_id=${id}`);
  } catch (err) {
    throw new Error(err.message || 'Error al cargar facturas');
  }
}
