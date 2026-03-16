import { api } from './api';

const clean = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

// ── Period date helpers ────────────────────────────────────────────────────────

export function getPeriodDates(periodo) {
  const now = new Date();
  let start;
  if (periodo === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodo === 'trimestre') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (periodo === 'todo') {
    return { fecha_inicio: null, fecha_fin: null };
  } else {
    start = new Date(now.getFullYear(), 0, 1);
  }
  return {
    fecha_inicio: start.toISOString().split('T')[0],
    fecha_fin:    now.toISOString().split('T')[0],
  };
}

// ── Basic (all plans) ──────────────────────────────────────────────────────────

export const getFinanciero = (periodo) =>
  api.get(`/reportes/financiero?periodo=${periodo}`);

export const getOrdenesResumen = (params) =>
  api.get(`/reportes/ordenes-resumen?${new URLSearchParams(clean(params))}`);

export const getServiciosRanking = (params) =>
  api.get(`/reportes/servicios-ranking?${new URLSearchParams(clean(params))}`);

export const getClientesRiesgo = () =>
  api.get('/reportes/clientes-riesgo');

// ── Premium ────────────────────────────────────────────────────────────────────

export const getSegmentosRFM = () =>
  api.get('/reportes/ml/segmentos-rfm');

export const getPerfilesML = () =>
  api.get('/reportes/ml/perfiles');

export const getRetencion = () =>
  api.get('/reportes/retencion');

export const getForecastDemanda = () =>
  api.get('/reportes/ml/forecast-demanda');

export const getOportunidadesDescuento = () =>
  api.get('/reportes/ml/oportunidades-descuento');

export const recalcularML = () =>
  api.post('/reportes/ml/recalcular');
