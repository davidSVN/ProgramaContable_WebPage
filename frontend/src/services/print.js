/**
 * WashFlow Thermal Printer Service
 * Uses Web Serial API — works in Chrome/Edge with zero installation.
 * Sends ESC/POS commands directly to USB thermal printer (80mm).
 */

const STORAGE_KEY = 'washflow_printer_port_info'
const BAUD_RATE = 9600  // Most thermal printers: 9600 or 19200

// ── ESC/POS command helpers ────────────────────────────────────

const ESC = 0x1B
const GS  = 0x1D

const CMD = {
  INIT:            [ESC, 0x40],
  ALIGN_LEFT:      [ESC, 0x61, 0x00],
  ALIGN_CENTER:    [ESC, 0x61, 0x01],
  ALIGN_RIGHT:     [ESC, 0x61, 0x02],
  BOLD_ON:         [ESC, 0x45, 0x01],
  BOLD_OFF:        [ESC, 0x45, 0x00],
  DOUBLE_SIZE_ON:  [ESC, 0x21, 0x30],
  DOUBLE_SIZE_OFF: [ESC, 0x21, 0x00],
  FEED_3:          [ESC, 0x64, 0x03],
  CUT:             [GS,  0x56, 0x41, 0x00],
}

function encodeText(text) {
  return new TextEncoder().encode(text)
}

function buildReceipt(negocio, orden) {
  const chunks = []

  const push = (...args) => {
    for (const a of args) {
      if (typeof a === 'string')     chunks.push(encodeText(a))
      else if (Array.isArray(a))     chunks.push(new Uint8Array(a))
      else if (a instanceof Uint8Array) chunks.push(a)
    }
  }

  const line = (char = '-', len = 32) => char.repeat(len) + '\n'
  const center = (text, width = 32) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2))
    return ' '.repeat(pad) + text + '\n'
  }
  const fmt = (value) => {
    const n = Math.round(Number(value) || 0)
    return '$' + n.toLocaleString('es-CO')
  }

  // INIT
  push(CMD.INIT)

  // HEADER — business name large
  push(CMD.ALIGN_CENTER, CMD.DOUBLE_SIZE_ON, CMD.BOLD_ON)
  push((negocio.nombre || 'LAVANDERIA').toUpperCase() + '\n')
  push(CMD.DOUBLE_SIZE_OFF, CMD.BOLD_OFF)

  if (negocio.slogan)    push(encodeText(negocio.slogan + '\n'))
  if (negocio.direccion) push(encodeText(negocio.direccion + '\n'))
  if (negocio.nit)       push(encodeText('NIT: ' + negocio.nit + '\n'))

  push(encodeText(line()))

  // CONTACT
  if (negocio.telefono) {
    push(CMD.BOLD_ON)
    push(encodeText('DOMICILIOS / CONTACTO\n'))
    push(encodeText(negocio.telefono + '\n'))
    push(CMD.BOLD_OFF)
    push(encodeText(line()))
  }

  // ORDER NUMBER
  push(CMD.DOUBLE_SIZE_ON, CMD.BOLD_ON)
  push(encodeText(center('ORDEN #' + (orden.numero || '0'))))
  push(CMD.DOUBLE_SIZE_OFF, CMD.BOLD_OFF)
  push(encodeText('\n'))

  // CLIENT
  push(CMD.ALIGN_CENTER)
  push(encodeText('Cliente\n'))
  push(CMD.BOLD_ON)
  push(encodeText((orden.cliente || '').toUpperCase() + '\n'))
  push(CMD.BOLD_OFF)
  push(CMD.ALIGN_LEFT)
  if (orden.telefono_cliente)
    push(encodeText('Telefono : ' + orden.telefono_cliente + '\n'))
  push(encodeText('Fecha    : ' + orden.fecha + '\n'))
  push(encodeText(line()))

  // ITEMS HEADER
  push(CMD.BOLD_ON)
  push(encodeText('Cant Detalle         V.Unit  V.Tot\n'))
  push(CMD.BOLD_OFF)
  push(encodeText(line()))

  // ITEMS
  let totalPzs = 0
  for (const item of (orden.items || [])) {
    const cant = Math.round(item.cantidad || 1)
    totalPzs += cant
    const det = String(item.detalle || '').slice(0, 13).padEnd(13)
    const vu  = fmt(item.vlr_unit).padStart(7)
    const vt  = fmt(item.vlr_total).padStart(7)
    push(encodeText(`${cant}    ${det}${vu}${vt}\n`))
  }

  push(encodeText(line()))

  // TOTALS
  push(encodeText(`Total Pzs. ${totalPzs}\n`))
  push(CMD.ALIGN_RIGHT)
  push(encodeText(`Subtotal: ${fmt(orden.subtotal)}\n`))
  push(encodeText(`Abono:    ${fmt(orden.abono || 0)}\n`))
  push(encodeText(line()))
  push(CMD.ALIGN_LEFT, CMD.BOLD_ON)
  const estado = (orden.estado_pago || 'PENDIENTE').slice(0, 18).padEnd(18)
  push(encodeText(`${estado} ${fmt(orden.total)}\n`))
  push(CMD.BOLD_OFF)

  // FOOTER
  push(CMD.ALIGN_CENTER)
  push(encodeText('\n'))
  if (negocio.mensaje_pie)
    push(encodeText(negocio.mensaje_pie + '\n'))
  push(CMD.FEED_3)
  push(CMD.CUT)

  // Merge all chunks into single Uint8Array
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
  const result = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    result.set(c, offset)
    offset += c.length
  }
  return result
}

// ── Port management ────────────────────────────────────────────

let _cachedPort = null  // keep port reference in memory

export function isWebSerialSupported() {
  return 'serial' in navigator
}

export async function isPrintAvailable() {
  if (!isWebSerialSupported()) return false
  try {
    const ports = await navigator.serial.getPorts()
    return ports.length > 0
  } catch {
    return false
  }
}

export async function requestPrinterPort() {
  if (!isWebSerialSupported()) {
    alert('Tu navegador no soporta Web Serial. Usa Chrome o Edge.')
    return false
  }
  try {
    const port = await navigator.serial.requestPort()
    _cachedPort = port
    const info = port.getInfo()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      usbVendorId: info.usbVendorId,
      usbProductId: info.usbProductId,
      configured: true,
      configuredAt: new Date().toISOString(),
    }))
    return true
  } catch (err) {
    if (err.name === 'NotFoundError') return false  // user cancelled
    console.error('Serial port error:', err)
    return false
  }
}

export function getPrinterPortInfo() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearPrinterPort() {
  _cachedPort = null
  localStorage.removeItem(STORAGE_KEY)
}

// ── Core print function ────────────────────────────────────────

async function getPort() {
  if (_cachedPort) return _cachedPort
  const ports = await navigator.serial.getPorts()
  if (ports.length > 0) {
    _cachedPort = ports[0]
    return _cachedPort
  }
  return null
}

export function buildPrintPayload(orden, negocioConfig, copias = 1) {
  const fecha = new Date(orden.created_at || orden.date)
  const fechaStr = isNaN(fecha)
    ? new Date().toLocaleString('es-CO')
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
      detalle: orden.items_description.slice(0, 40),
      vlr_unit: orden.order_value || orden.total_amount || 0,
      vlr_total: orden.order_value || orden.total_amount || 0,
    }]
  } else if (orden.items) {
    // Already in receipt format (e.g. from printTest)
    items = orden.items
  }

  return {
    numero:           orden.order_id  || orden.id     || orden.numero           || '0',
    cliente:          orden.user_name || orden.cliente || '',
    telefono_cliente: orden.user_contact || orden.telefono_cliente || '',
    fecha:            orden.fecha || fechaStr,
    items,
    subtotal:    orden.order_value    || orden.total_amount || orden.subtotal || 0,
    abono:       orden.abono          || 0,
    total:       orden.restante       ?? orden.balance_due ?? orden.total_amount ?? orden.total ?? 0,
    estado_pago: orden.estado_pago || (
      (orden.restante > 0 || orden.balance_due > 0) ? 'PENDIENTE CANCELAR' : 'PAGADA'
    ),
  }
}

export async function printOrden(orden, negocioConfig, copias = 1) {
  if (!isWebSerialSupported()) return { success: false, reason: 'no_web_serial' }

  const port = await getPort()
  if (!port) return { success: false, reason: 'no_port_configured' }

  try {
    await port.open({ baudRate: BAUD_RATE })
    const writer = port.writable.getWriter()
    const ordenData = buildPrintPayload(orden, negocioConfig)
    const receipt = buildReceipt(negocioConfig || {}, ordenData)

    for (let i = 0; i < copias; i++) {
      await writer.write(receipt)
      if (copias > 1 && i < copias - 1) await new Promise(r => setTimeout(r, 500))
    }

    writer.releaseLock()
    await port.close()
    return { success: true }
  } catch (err) {
    try { await port.close() } catch {}
    _cachedPort = null
    return { success: false, reason: err.message }
  }
}

export async function printTest(negocioConfig) {
  const testOrden = {
    numero: '0000',
    cliente: 'CLIENTE DE PRUEBA',
    telefono_cliente: '3100000000',
    fecha: new Date().toLocaleString('es-CO').toUpperCase(),
    items: [{ cantidad: 1, detalle: 'Recibo de prueba', vlr_unit: 0, vlr_total: 0 }],
    subtotal: 0, abono: 0, total: 0,
    estado_pago: 'PRUEBA DE IMPRESION',
  }
  return printOrden(testOrden, negocioConfig || { nombre: 'WASHFLOW' }, 1)
}
