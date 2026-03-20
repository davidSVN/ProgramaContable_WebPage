/**
 * WhatsApp Provider — Transport layer.
 * TODAY: opens wa.me link
 * FUTURE: replace sendMessage() with WhatsApp Business API call
 * No other file needs to change when API is integrated.
 */

const PROVIDER = 'wame' // future: 'business_api'

export function sendMessage(phone, message) {
  if (PROVIDER === 'wame') {
    const clean = phone.replace(/\D/g, '')
    const number = clean.startsWith('57') ? clean : `57${clean}`
    const encoded = encodeURIComponent(message)
    window.open(`https://wa.me/${number}?text=${encoded}`, '_blank')
    return { success: true, method: 'wame' }
  }
  // FUTURE: call WhatsApp Business API
  // return await fetch('/api/whatsapp/send', { method: 'POST', body: ... })
}

export function formatPhone(phone) {
  const clean = (phone || '').replace(/\D/g, '')
  return clean.startsWith('57') ? clean : `57${clean}`
}
