import { getToken } from './auth';

const API = 'http://localhost:8000/api';

// GET /api/usuarios?user_type=B2B
export async function getInstituciones({ search = '', estado = '', pago = '' } = {}) {
  const token = getToken();
  const params = new URLSearchParams({ user_type: 'B2B' });
  if (search) params.append('search_names', search);
  // (Filtros de estado y pago podrían ser añadidos si el backend los soporta en /usuarios)

  const res = await fetch(`${API}/usuarios?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar instituciones');
  return res.json();
}

// POST /api/usuarios → { nombre, nit, contacto, direccion, fecha_inicio, condicion_pago, estado }
export async function createInstitucion(data) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, user_type: 'B2B' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al crear institución');
  }
  return res.json();
}

// PUT /api/usuarios/:id → partial update
export async function updateInstitucion(id, data) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Error al actualizar institución');
  return res.json();
}

// DELETE /api/usuarios/:id → soft delete
export async function deleteInstitucion(id) {
  const token = getToken();
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al eliminar institución');
  return res.json();
}

// GET /api/b2b/ordenes?user_id=... → order history
export async function getInstitucionOrdenes(id) {
  const token = getToken();
  const res = await fetch(`${API}/b2b/ordenes/?user_id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar órdenes');
  return res.json();
}

// GET /api/b2b/facturas?user_id=... → consolidated invoices
export async function getInstitucionFacturas(id) {
  const token = getToken();
  const res = await fetch(`${API}/b2b/facturas/?user_id=${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Error al cargar facturas');
  return res.json();
}
