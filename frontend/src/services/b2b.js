import { api } from './api';

const clean = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

// ── Órdenes B2B ───────────────────────────────────────────────────────────────

export const getOrdenesB2B = (params) =>
  api.get(`/b2b/ordenes/?${new URLSearchParams(clean(params))}`);

export const getOrdenesB2BCount = (params) =>
  api.get(`/b2b/ordenes/count?${new URLSearchParams(clean(params))}`);

export const crearOrdenB2B = (data) =>
  api.post('/b2b/ordenes/', data);

// ── Facturas consolidadas ─────────────────────────────────────────────────────

export const getFacturas = (params) =>
  api.get(`/b2b/facturas/?${new URLSearchParams(clean(params))}`);

export const generarFactura = (data) =>
  api.post('/b2b/facturas/', data);

export const pagarFactura = (invoiceId, data) =>
  api.post(`/b2b/facturas/${invoiceId}/pagos`, data);

// ── Abonos ────────────────────────────────────────────────────────────────────

export const registrarAbono = (data) =>
  api.post('/b2b/abonos/', data);
