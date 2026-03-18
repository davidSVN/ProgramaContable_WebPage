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
      <div style="white-space: pre; font-size: 10px;">


</div>
    </div>
  `
}

const THERMAL_CSS = `
  #washflow-receipt-container {
    display: none;
    position: absolute;
    left: -9999px;
    top: 0;
  }

  @media print {
    html, body {
      visibility: hidden !important;
    }

    #washflow-receipt-container {
      visibility: visible !important;
      display: block !important;
      position: fixed !important;
      left: 0 !important;
      top: 0 !important;
      width: 76mm !important;
      height: auto !important;
      overflow: visible !important;
      background: white !important;
      page-break-after: avoid;
      break-after: avoid;
    }

    #washflow-receipt-container .receipt {
      visibility: visible !important;
    }

    #washflow-receipt-container .receipt * {
      visibility: visible !important;
    }

    @page {
      size: 80mm auto;
      margin: 0mm 2mm;
    }

    .receipt {
      width: 76mm;
      max-width: 76mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000 !important;
      background: #fff !important;
      padding: 2mm 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    .logo {
      display: block !important;
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
      display: block !important;
    }

    .slogan { font-size: 10px; display: block !important; }
    .info   { font-size: 10px; display: block !important; }

    .separator {
      border-top: 1px dashed #000;
      margin: 4px 0;
      display: block !important;
    }

    .contact {
      text-align: center;
      font-size: 10px;
      margin: 3px 0;
      display: block !important;
    }

    .order-number {
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      margin: 5px 0;
      display: block !important;
    }

    .client-section { margin: 3px 0; display: block !important; }
    .client-label   { text-align: center; font-size: 10px; display: block !important; }
    .client-name    {
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      display: block !important;
    }
    .client-info { font-size: 10px; display: block !important; }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      display: table !important;
    }
    .items-table thead { display: table-header-group !important; }
    .items-table tbody { display: table-row-group !important; }
    .items-table tr    { display: table-row !important; }
    .items-table th,
    .items-table td    { display: table-cell !important; padding: 1px 0; }
    .items-table th    { font-weight: bold; }

    .qty   { width: 10mm; text-align: center; }
    .desc  { width: 36mm; text-align: left; }
    .price { width: 15mm; text-align: right; }

    .totals      { font-size: 10px; margin: 2px 0; display: block !important; }
    .total-pzs   { margin-bottom: 2px; display: block !important; }
    .total-row   {
      display: flex !important;
      justify-content: space-between;
    }

    .grand-total {
      display: flex !important;
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
      display: block !important;
    }
  }
`

// NOTE: Paper cut is handled automatically by the POS-80
// Windows driver setting "Cut paper after each job".
// To enable: Windows > Printers > POS-80-Series >
// Printing Preferences > Options > Cut paper = Automatic
// No ESC/POS cut() command needed from browser.

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

  const total_amount = orden.total_amount || orden.order_value || 0
  const balance_due  = orden.balance_due  ?? orden.restante ?? 0
  const abono        = orden.abono        || orden.total_paid || 0

  return {
    numero:           orden.order_id  || orden.id,
    cliente:          orden.user_name || '',
    telefono_cliente: orden.user_contact || orden.user_phone || '',
    fecha:            fechaStr,
    items,
    subtotal:    total_amount,
    abono:       abono,
    total:       balance_due,
    estado_pago: (balance_due > 0)
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

    // Force reflow so browser processes the HTML
    void container.offsetHeight

    // Double rAF + buffer guarantees paint before print
    await new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 250)
        })
      })
    })

    window.print()

    // Clean up after dialog closes
    window.addEventListener('afterprint', () => {
      container.innerHTML = ''
    }, { once: true })

    return { success: true }
  } catch (err) {
    console.error('[WashFlow Print]', err)
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
