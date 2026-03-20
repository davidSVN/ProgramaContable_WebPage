/**
 * Default message templates.
 * Variables use {{variable}} syntax for replacement.
 * Admin can override these via AppSettings key 'whatsapp_templates'
 */

export const DEFAULT_TEMPLATES = {
  // ── Órdenes por cobrar ─────────────────────────────────
  deuda: {
    id: 'deuda',
    label: 'Recordatorio de deuda',
    category: 'cobros',
    variables: ['nombre', 'negocio', 'orden_id', 'saldo', 'descripcion'],
    default: `Hola {{nombre}}, te saludamos de *{{negocio}}* 👋

Te recordamos que tienes un saldo pendiente de *${{saldo}}* correspondiente a la orden #{{orden_id}}.
🧺 _{{descripcion}}_

¿Cuándo podrías pasar a cancelarlo? ¡Muchas gracias! 🙏`,
  },

  // ── Usuarios generales ─────────────────────────────────
  saludo: {
    id: 'saludo',
    label: 'Saludo general',
    category: 'general',
    variables: ['nombre', 'negocio'],
    default: `Hola {{nombre}}, te saludamos de *{{negocio}}* 👋
¿En qué podemos ayudarte hoy?`,
  },

  promo: {
    id: 'promo',
    label: 'Promoción / publicidad',
    category: 'marketing',
    variables: ['nombre', 'negocio', 'promocion'],
    default: `Hola {{nombre}} 🎉 Tenemos una *oferta especial* para ti en *{{negocio}}*:

✨ {{promocion}}

¡No te la pierdas! Te esperamos 🧺`,
  },

  // ── RFM Segments ──────────────────────────────────────
  rfm_campeon: {
    id: 'rfm_campeon',
    label: 'Campeones 🏆',
    category: 'rfm',
    variables: ['nombre', 'negocio'],
    default: `Hola {{nombre}} 🏆 Eres uno de nuestros mejores clientes en *{{negocio}}*.

Queremos agradecerte tu fidelidad con un beneficio exclusivo. ¡Contáctanos para reclamarlo!`,
  },

  rfm_leal: {
    id: 'rfm_leal',
    label: 'Leales 💚',
    category: 'rfm',
    variables: ['nombre', 'negocio'],
    default: `Hola {{nombre}} 💚 En *{{negocio}}* valoramos mucho tu preferencia.

¡Gracias por seguir eligiéndonos! Pronto tendremos sorpresas para ti 🎁`,
  },

  rfm_nuevo: {
    id: 'rfm_nuevo',
    label: 'Nuevos ✨',
    category: 'rfm',
    variables: ['nombre', 'negocio'],
    default: `Hola {{nombre}} ✨ ¡Bienvenido a *{{negocio}}*!

Nos alegra tenerte como cliente. Si tienes alguna duda, estamos aquí para ayudarte 🧺`,
  },

  rfm_riesgo: {
    id: 'rfm_riesgo',
    label: 'En riesgo ⚠️',
    category: 'rfm',
    variables: ['nombre', 'negocio', 'dias'],
    default: `Hola {{nombre}}, te saludamos de *{{negocio}}* 👋

Notamos que llevas {{dias}} días sin visitarnos y nos gustaría volverte a ver.
¿Podemos ayudarte con algo? ¡Te esperamos! 🙏`,
  },

  rfm_perdido: {
    id: 'rfm_perdido',
    label: 'Perdidos 💔',
    category: 'rfm',
    variables: ['nombre', 'negocio', 'descuento'],
    default: `Hola {{nombre}} 💔 En *{{negocio}}* te extrañamos.

Como gesto especial, queremos ofrecerte un *{{descuento}}% de descuento* en tu próxima visita.
¡Esperamos verte pronto! 🧺`,
  },
}

export const CATEGORIES = [
  { id: 'cobros',    label: 'Cobros',    emoji: '💰' },
  { id: 'general',   label: 'General',   emoji: '💬' },
  { id: 'marketing', label: 'Marketing', emoji: '📣' },
  { id: 'rfm',       label: 'Segmentos RFM', emoji: '🎯' },
]
