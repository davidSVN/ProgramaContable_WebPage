import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { DEFAULT_TEMPLATES } from './templates'
import { sendMessage } from './provider'

export function useWhatsApp() {
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load saved templates from AppSettings
  useEffect(() => {
    api.get('/configuracion/whatsapp-templates')
      .then(data => {
        if (data?.templates) {
          // Merge saved with defaults (new templates added in updates stay)
          setTemplates(prev => ({ ...prev, ...data.templates }))
        }
      })
      .catch(() => {}) // use defaults if not found
      .finally(() => setLoading(false))
  }, [])

  const saveTemplates = useCallback(async (updated) => {
    setSaving(true)
    try {
      await api.put('/configuracion/whatsapp-templates', { templates: updated })
      setTemplates(updated)
      return true
    } catch { return false }
    finally { setSaving(false) }
  }, [])

  const resetTemplate = useCallback((templateId) => {
    const updated = {
      ...templates,
      [templateId]: { ...templates[templateId], custom: undefined }
    }
    setTemplates(updated)
    saveTemplates(updated)
  }, [templates, saveTemplates])

  // Build final message replacing {{variables}}
  const buildMessage = useCallback((templateId, variables = {}) => {
    const tpl = templates[templateId]
    if (!tpl) return ''
    const text = tpl.custom || tpl.default
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `[${key}]`)
  }, [templates])

  const send = useCallback((phone, templateId, variables = {}) => {
    const message = buildMessage(templateId, variables)
    return sendMessage(phone, message)
  }, [buildMessage])

  return { templates, loading, saving, saveTemplates, resetTemplate, buildMessage, send }
}
