const PB = 'http://localhost:8765'

export async function isPrintAvailable() {
  try { return (await fetch(`${PB}/status`,{signal:AbortSignal.timeout(800)})).ok }
  catch { return false }
}

export async function getPrinters() {
  try {
    const d=await(await fetch(`${PB}/status`,{signal:AbortSignal.timeout(800)})).json()
    return {available:d.available_printers||[], current:d.current_printer}
  } catch { return {available:[],current:null} }
}

export async function configurePrinter(name) {
  try {
    await fetch(`${PB}/configure`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({printer_name:name})})
    return true
  } catch { return false }
}

export function buildPrintPayload(orden, neg, copias=1) {
  const fecha=new Date(orden.created_at||orden.date)
  const fechaStr=isNaN(fecha)
    ? new Date().toLocaleString('es-CO').toUpperCase()
    : fecha.toLocaleString('es-CO',{weekday:'short',day:'2-digit',
        month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).toUpperCase()
  let items=[]
  if(orden.servicios_data?.length>0)
    items=orden.servicios_data.map(s=>({
      cantidad:s.qty||1, detalle:s.name||'',
      vlr_unit:s.value||0, vlr_total:(s.qty||1)*(s.value||0)
    }))
  else if(orden.items_description)
    items=[{cantidad:1,detalle:orden.items_description.slice(0,30),
      vlr_unit:orden.total_amount||0,vlr_total:orden.total_amount||0}]
  const bd=orden.balance_due??orden.restante??0
  return {
    negocio: neg||{},
    orden: {
      numero:orden.order_id||orden.id,
      cliente:orden.user_name||'',
      telefono_cliente:orden.user_contact||'',
      fecha:fechaStr, items,
      subtotal:orden.total_amount||orden.order_value||0,
      abono:orden.abono||0, total:bd,
      estado_pago:bd>0?'PENDIENTE CANCELAR':'PAGADA'
    },
    copias
  }
}

export async function printOrden(orden, neg, copias=1) {
  if(!await isPrintAvailable()) return {success:false,reason:'offline'}
  try {
    const res=await fetch(`${PB}/print`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(buildPrintPayload(orden,neg,copias)),
      signal:AbortSignal.timeout(8000)})
    const d=await res.json()
    return {success:d.status==='ok',printer:d.printer,reason:d.message}
  } catch(e) { return {success:false,reason:e.message} }
}

export async function printTest(neg) {
  if(!await isPrintAvailable()) return {success:false,reason:'offline'}
  try {
    const res=await fetch(`${PB}/test`,{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(neg||{}),
      signal:AbortSignal.timeout(8000)})
    const d=await res.json()
    return {success:d.status==='ok',reason:d.message}
  } catch(e) { return {success:false,reason:e.message} }
}

export function isWebSerialSupported(){return false}
export function getPrinterPortInfo(){return {configured:true,method:'printbridge'}}
