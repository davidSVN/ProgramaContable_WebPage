import { useState, useRef, useCallback } from 'react'
import { useWhatsApp } from './useWhatsApp'
import { CATEGORIES } from './templates'
import { sendMessage } from './provider'
import './WhatsAppCenter.css'

function getNegocio() {
  try {
    const cached = localStorage.getItem('washflow_negocio_config')
    if (cached) {
      const cfg = JSON.parse(cached)
      return cfg.nombre_negocio || cfg.nombre || 'Mi Lavandería'
    }
  } catch (e) {}
  return 'Mi Lavandería'
}

// Render WhatsApp markdown: *bold* → <strong>, _italic_ → <em>
function renderWAMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br />')
}

export default function WhatsAppCenter({ user }) {
  const { templates, loading, saving, saveTemplates, resetTemplate, buildMessage } = useWhatsApp()
  const negocio = getNegocio()

  const [activeCategory, setActiveCategory] = useState('cobros')
  const [selectedTemplate, setSelectedTemplate] = useState('deuda')
  const [editingText, setEditingText] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testVars, setTestVars] = useState({})
  const [toast, setToast] = useState(null)
  const textareaRef = useRef(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const categoryTemplates = Object.values(templates).filter(t => t.category === activeCategory)

  const currentTemplate = templates[selectedTemplate]

  // When switching template, init test vars with template variables
  const handleSelectTemplate = (tplId) => {
    setSelectedTemplate(tplId)
    setIsEditing(false)
    const tpl = templates[tplId]
    if (tpl) {
      const vars = {}
      tpl.variables?.forEach(v => {
        if (v === 'negocio') vars[v] = negocio
        else vars[v] = testVars[v] || ''
      })
      setTestVars(vars)
    }
  }

  // When switching category, auto-select first template
  const handleCategoryChange = (catId) => {
    setActiveCategory(catId)
    setIsEditing(false)
    const first = Object.values(templates).find(t => t.category === catId)
    if (first) handleSelectTemplate(first.id)
  }

  const handleStartEdit = () => {
    setEditingText(currentTemplate?.custom || currentTemplate?.default || '')
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    const updated = {
      ...templates,
      [selectedTemplate]: { ...currentTemplate, custom: editingText }
    }
    const ok = await saveTemplates(updated)
    if (ok) {
      showToast('Plantilla guardada correctamente')
      setIsEditing(false)
    } else {
      showToast('Error al guardar la plantilla', 'error')
    }
  }

  const handleReset = () => {
    resetTemplate(selectedTemplate)
    setIsEditing(false)
    showToast('Plantilla restaurada al valor original')
  }

  // Insert variable pill at cursor
  const insertVar = (varName) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const insert = `{{${varName}}}`
    const newText = editingText.slice(0, start) + insert + editingText.slice(end)
    setEditingText(newText)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + insert.length, start + insert.length)
    }, 0)
  }

  // Build preview message
  const previewVars = { ...testVars, negocio }
  const previewMessage = buildMessage(selectedTemplate, previewVars)

  const handleSend = () => {
    if (!testPhone) {
      showToast('Ingresa un número de teléfono para probar', 'error')
      return
    }
    sendMessage(testPhone, previewMessage)
  }

  if (loading) {
    return (
      <div className="wac-root">
        <div className="wac-loading">Cargando plantillas...</div>
      </div>
    )
  }

  return (
    <div className="wac-root">
      {/* Header */}
      <div className="wac-header">
        <div className="wac-header__left">
          <h1 className="wac-title">
            <span className="wac-title__icon">💬</span>
            Centro de Mensajes WhatsApp
          </h1>
          <p className="wac-subtitle">Personaliza y envía mensajes a tus clientes</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="wac-tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`wac-tab ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="wac-content">
        {/* LEFT: Template list + editor */}
        <div className="wac-left">
          <div className="wac-left__title">Plantillas</div>

          {categoryTemplates.length === 0 ? (
            <div className="wac-empty">No hay plantillas en esta categoría</div>
          ) : (
            categoryTemplates.map(tpl => {
              const isSelected = selectedTemplate === tpl.id
              const preview = (tpl.custom || tpl.default || '').slice(0, 60) + '...'
              return (
                <div
                  key={tpl.id}
                  className={`wac-tpl-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectTemplate(tpl.id)}
                >
                  <div className="wac-tpl-card__head">
                    <span className="wac-tpl-card__label">{tpl.label}</span>
                    {isSelected && isAdmin && (
                      <button
                        className="wac-tpl-edit-btn"
                        onClick={e => { e.stopPropagation(); handleStartEdit() }}
                      >
                        {isEditing ? '✕ Cancelar' : '✏️ Editar'}
                      </button>
                    )}
                  </div>
                  {tpl.custom && (
                    <span className="wac-tpl-custom-badge">Personalizada</span>
                  )}
                  {!isEditing && (
                    <p className="wac-tpl-card__preview">{preview}</p>
                  )}

                  {/* Inline editor */}
                  {isSelected && isEditing && (
                    <div className="wac-editor" onClick={e => e.stopPropagation()}>
                      <div className="wac-editor__vars-label">Variables disponibles:</div>
                      <div className="wac-editor__pills">
                        {(tpl.variables || []).map(v => (
                          <button
                            key={v}
                            className="wac-var-pill"
                            onClick={() => insertVar(v)}
                            title={`Insertar {{${v}}}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <textarea
                        ref={textareaRef}
                        className="wac-editor__textarea"
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        rows={8}
                      />
                      <div className="wac-editor__actions">
                        <button
                          className="wac-btn wac-btn--primary"
                          onClick={handleSaveEdit}
                          disabled={saving}
                        >
                          {saving ? '...' : '💾 Guardar'}
                        </button>
                        <button
                          className="wac-btn wac-btn--ghost"
                          onClick={handleReset}
                        >
                          ↺ Restaurar default
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* RIGHT: Preview + send panel */}
        <div className="wac-right">
          <div className="wac-preview-section">
            <div className="wac-section-label">Vista previa</div>
            <div className="wac-wa-container">
              <div className="wac-wa-header">
                <div className="wac-wa-dot" />
                <span>WhatsApp</span>
              </div>
              <div className="wac-wa-body">
                {previewMessage ? (
                  <div
                    className="wac-wa-bubble"
                    dangerouslySetInnerHTML={{ __html: renderWAMarkdown(previewMessage) }}
                  />
                ) : (
                  <div className="wac-wa-empty">Selecciona una plantilla para ver la vista previa</div>
                )}
              </div>
            </div>
          </div>

          <div className="wac-test-section">
            <div className="wac-section-label">Probar con datos reales</div>

            <div className="wac-field">
              <label className="wac-field-label">Teléfono</label>
              <input
                className="wac-input"
                type="tel"
                placeholder="310 452 7891"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
            </div>

            {currentTemplate?.variables?.filter(v => v !== 'negocio').map(v => (
              <div key={v} className="wac-field">
                <label className="wac-field-label">{v}</label>
                <input
                  className="wac-input"
                  type="text"
                  placeholder={`Valor para {{${v}}}`}
                  value={testVars[v] || ''}
                  onChange={e => setTestVars(prev => ({ ...prev, [v]: e.target.value }))}
                />
              </div>
            ))}

            <div className="wac-field">
              <label className="wac-field-label">negocio</label>
              <input
                className="wac-input"
                type="text"
                value={negocio}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <span className="wac-field-hint">Auto-completado desde Configuración</span>
            </div>

            <button className="wac-send-btn" onClick={handleSend}>
              <span>📱</span> Abrir en WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`wac-toast wac-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
