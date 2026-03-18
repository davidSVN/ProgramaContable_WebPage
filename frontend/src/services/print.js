/**
 * WashFlow Thermal Printer Service
 * Uses window.print() with CSS optimized for 80mm thermal printers.
 * Works with any printer installed on Windows. Zero configuration.
 */

function fmt(value) {
  const n = Math.round(Number(value) || 0)
  return '$' + n.toLocaleString('es-CO')
}

function buildReceiptHTML(negocio, orden) {
  const items = orden.items || []
  const totalPzs = items.reduce((sum, i) => sum + (i.cantidad || 1), 0)

  const itemsHTML = items.map(item => `
    <tr>
      <td class="qty">${Math.round(item.cantidad || 1)}</td>
      <td class="desc">${String(item.detalle || '').slice(0, 20)}</td>
      <td class="price">${fmt(item.vlr_unit)}</td>
      <td class="price">${fmt(item.vlr_total)}</td>
    </tr>
  `).join('')

  const logoHTML = negocio.logo_base64
    ? `<img src="${negocio.logo_base64}" class="logo" alt="logo"/>`
    : ''

  return `
    <div class="receipt">
      ${logoHTML}
      <div class="header">
        <div class="business-name">${(negocio.nombre || 'LAVANDERIA').toUpperCase()}</div>
        ${negocio.slogan    ? `<div class="slogan">${negocio.slogan}</div>` : ''}
        ${negocio.direccion ? `<div class="info">${negocio.direccion}</div>` : ''}
        ${negocio.nit       ? `<div class="info">NIT: ${negocio.nit}</div>` : ''}
      </div>

      ${negocio.telefono ? `
        <div class="separator"></div>
        <div class="contact">
          <strong>DOMICILIOS / CONTACTO</strong><br/>
          ${negocio.telefono}
        </div>
      ` : ''}

      <div class="separator"></div>
      <div class="order-number">ORDEN #${orden.numero || '0'}</div>

      <div class="client-section">
        <div class="client-label">Cliente</div>
        <div class="client-name">${(orden.cliente || '').toUpperCase()}</div>
        ${orden.telefono_cliente
          ? `<div class="client-info">Telefono : ${orden.telefono_cliente}</div>`
          : ''}
        <div class="client-info">Fecha    : ${orden.fecha}</div>
      </div>

      <div class="separator"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th class="qty">Cant</th>
            <th class="desc">Detalle</th>
            <th class="price">V.Unit</th>
            <th class="price">V.Tot</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
      </table>

      <div class="separator"></div>

      <div class="totals">
        <div class="total-pzs">Total Pzs. ${totalPzs}</div>
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${fmt(orden.subtotal)}</span>
        </div>
        <div class="total-row">
          <span>Abono:</span>
          <span>${fmt(orden.abono || 0)}</span>
        </div>
      </div>

      <div class="separator"></div>

      <div class="grand-total">
        <span class="estado">${orden.estado_pago || 'PENDIENTE'}</span>
        <span class="amount">${fmt(orden.total)}</span>
      </div>

      ${negocio.mensaje_pie ? `
        <div class="separator"></div>
        <div class="footer">${negocio.mensaje_pie}</div>
      ` : ''}
    </div>
  `
}

const THERMAL_CSS = `
  @media print {
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body > *:not(#washflow-receipt-container) { display: none !important; }
    #washflow-receipt-container { display: block !important; }

    @page {
      size: 80mm auto;
      margin: 2mm 3mm;
    }

    .receipt {
      width: 74mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      color: #000;
      background: #fff;
    }

    .logo {
      display: block;
      max-width: 60mm;
      max-height: 25mm;
      margin: 0 auto 4px auto;
      object-fit: contain;
    }

    .header { text-align: center; margin-bottom: 4px; }
    .business-name {
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 1px;
    }
    .slogan { font-size: 10px; }
    .info   { font-size: 10px; }

    .separator {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }

    .contact {
      text-align: center;
      font-size: 10px;
      margin: 3px 0;
    }

    .order-number {
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      margin: 5px 0;
    }

    .client-section { margin: 3px 0; }
    .client-label { text-align: center; font-size: 10px; }
    .client-name  {
      text-align: center;
      font-weight: bold;
      font-size: 12px;
    }
    .client-info { font-size: 10px; }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    .items-table th {
      font-weight: bold;
      padding: 1px 0;
    }
    .items-table td { padding: 1px 0; }
    .qty   { width: 8mm;  text-align: center; }
    .desc  { width: 32mm; text-align: left; }
    .price { width: 17mm; text-align: right; }

    .totals { font-size: 10px; margin: 2px 0; }
    .total-pzs { margin-bottom: 2px; }
    .total-row {
      display: flex;
      justify-content: space-between;
    }

    .grand-total {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 11px;
      margin: 2px 0;
    }
    .estado { font-size: 10px; }
    .amount { font-size: 12px; }

    .footer {
      text-align: center;
      font-size: 10px;
      margin-top: 4px;
    }
  }

  #washflow-receipt-container {
    display: none;
  }
`

let _styleInjected = false
function injectPrintStyles() {
  if (_styleInjected) return
  const style = document.createElement('style')
  style.id = 'washflow-print-styles'
  style.textContent = THERMAL_CSS
  document.head.appendChild(style)
  _styleInjected = true
}

function getOrCreateContainer() {
  let container = document.getElementById('washflow-receipt-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'washflow-receipt-container'
    document.body.appendChild(container)
  }
  return container
}

// ── Public API ────────────────────────────────────────────────

export function isWebSerialSupported() { return false }

export async function isPrintAvailable() {
  return true
}

export function getPrinterPortInfo() {
  return { configured: true, method: 'window.print' }
}

export function buildPrintPayload(orden, negocioConfig) {
  const fecha = new Date(orden.created_at || orden.date)
  const fechaStr = isNaN(fecha)
    ? new Date().toLocaleString('es-CO').toUpperCase()
    : fecha.toLocaleString('es-CO', {
        weekday: 'short', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit',
      }).toUpperCase()

  let items = []
  if (orden.servicios_data?.length > 0) {
    items = orden.servicios_data.map(s => ({
      cantidad: s.qty || s.quantity || 1,
      detalle: s.name || s.service_name || '',
      vlr_unit: s.value || s.unit_price || 0,
      vlr_total: (s.qty || s.quantity || 1) * (s.value || s.unit_price || 0),
    }))
  } else if (orden.items_description) {
    items = [{
      cantidad: 1,
      detalle: orden.items_description.slice(0, 30),
      vlr_unit: orden.order_value || orden.total_amount || 0,
      vlr_total: orden.order_value || orden.total_amount || 0,
    }]
  }

  return {
    numero:           orden.order_id  || orden.id,
    cliente:          orden.user_name || '',
    telefono_cliente: orden.user_contact || '',
    fecha:            fechaStr,
    items,
    subtotal:    orden.order_value  || orden.total_amount || 0,
    abono:       orden.abono        || 0,
    total:       orden.restante     ?? orden.balance_due ?? orden.total_amount ?? 0,
    estado_pago: (orden.restante > 0 || orden.balance_due > 0)
      ? 'PENDIENTE CANCELAR' : 'PAGADA',
  }
}

export async function printOrden(orden, negocioConfig, copias = 1) {
  try {
    injectPrintStyles()
    const container = getOrCreateContainer()
    const ordenData = buildPrintPayload(orden, negocioConfig)
    const negocio = negocioConfig || {}

    let html = ''
    for (let i = 0; i < copias; i++) {
      html += buildReceiptHTML(negocio, ordenData)
      if (i < copias - 1) {
        html += '<div style="page-break-after: always;"></div>'
      }
    }
    container.innerHTML = html

    await new Promise(r => setTimeout(r, 100))
    window.print()

    return { success: true }
  } catch (err) {
    return { success: false, reason: err.message }
  }
}

export async function printTest(negocioConfig) {
  const testOrden = {
    order_id: '0000',
    user_name: 'CLIENTE DE PRUEBA',
    user_contact: '3100000000',
    created_at: new Date().toISOString(),
    servicios_data: [{ name: 'Recibo de prueba', qty: 1, value: 0 }],
    order_value: 0, restante: 0, abono: 0,
  }
  return printOrden(testOrden, negocioConfig || {}, 1)
}
