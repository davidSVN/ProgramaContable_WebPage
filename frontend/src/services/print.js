const PRINTBRIDGE_URL = 'http://localhost:8765';

// Check if PrintBridge is running on this PC
export async function isPrintAvailable() {
  try {
    const res = await fetch(`${PRINTBRIDGE_URL}/status`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false; // silently fails on mobile/tablet without printer
  }
}

// Get available printers from local PC
export async function getPrinters() {
  try {
    const res = await fetch(`${PRINTBRIDGE_URL}/status`);
    const data = await res.json();
    return data.available_printers || [];
  } catch {
    return [];
  }
}

// Configure which printer to use
export async function configurePrinter(printerName) {
  try {
    await fetch(`${PRINTBRIDGE_URL}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_name: printerName }),
    });
    return true;
  } catch {
    return false;
  }
}

// Build order payload from WashFlow order data
export function buildPrintPayload(orden, negocioConfig, copias = 1) {
  const fecha = new Date(orden.created_at || orden.date);
  const fechaStr = isNaN(fecha)
    ? new Date().toLocaleString('es-CO')
    : fecha.toLocaleString('es-CO', {
        weekday: 'short', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).toUpperCase();

  let items = [];
  if (orden.servicios_data && orden.servicios_data.length > 0) {
    items = orden.servicios_data.map(s => ({
      cantidad: s.qty || s.quantity || 1,
      detalle: s.name || s.service_name || '',
      vlr_unit: s.value || s.unit_price || 0,
      vlr_total: (s.qty || s.quantity || 1) * (s.value || s.unit_price || 0),
    }));
  } else if (orden.items_description) {
    items = [{
      cantidad: 1,
      detalle: orden.items_description.slice(0, 40),
      vlr_unit: orden.order_value || orden.total_amount || 0,
      vlr_total: orden.order_value || orden.total_amount || 0,
    }];
  }

  return {
    negocio: negocioConfig || {},
    orden: {
      numero: orden.order_id || orden.id,
      cliente: orden.user_name || '',
      telefono_cliente: orden.user_contact || '',
      fecha: fechaStr,
      items,
      subtotal: orden.order_value || orden.total_amount || 0,
      abono: orden.abono || 0,
      total: orden.restante ?? orden.balance_due ?? orden.total_amount ?? 0,
      estado_pago: (orden.restante > 0 || orden.balance_due > 0)
        ? 'PENDIENTE CANCELAR' : 'PAGADA',
    },
    copias,
  };
}

// Main print function — silently fails if no printer available
export async function printOrden(orden, negocioConfig, copias = 1) {
  const available = await isPrintAvailable();
  if (!available) return { success: false, reason: 'no_printer' };

  try {
    const payload = buildPrintPayload(orden, negocioConfig, copias);
    const res = await fetch(`${PRINTBRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return { success: data.status === 'ok', data };
  } catch (e) {
    return { success: false, reason: e.message };
  }
}
