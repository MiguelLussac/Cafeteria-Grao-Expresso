// Componentes visuais compartilhados.
// Use-os nas telas para manter o padrão visual do design.
import { useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { categoryLabel } from '../utils/format'

export function Button({ variant = 'primary', type = 'button', block = false, className = '', ...props }) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${block ? 'btn-block' : ''} ${className}`}
      {...props}
    />
  )
}

const ALERT_ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }

// variant: 'success' | 'error' | 'info'
export function Alert({ variant = 'info', title, children, onClose, stacked = false }) {
  if (!title && !children) return null
  const Icon = ALERT_ICONS[variant]
  return (
    <div className={`alert alert-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      <Icon className="alert-icon" size={20} aria-hidden="true" />
      <div className={`alert-body ${stacked ? 'alert-stacked' : ''}`}>
        {title && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </div>
      {onClose && (
        <button type="button" className="alert-close" onClick={onClose} aria-label="Fechar mensagem">
          <X size={18} />
        </button>
      )}
    </div>
  )
}

export function Field({ label, id, error, required, optional, hint, children }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
        {optional && <span className="optional"> (opcional)</span>}
      </label>
      {children}
      {(error || hint) && (
        <div className="field-footer">
          {error && (
            <span className="field-error" id={`${id}-error`}>
              <AlertCircle size={16} aria-hidden="true" />
              {error}
            </span>
          )}
          {hint && <span className="field-hint">{hint}</span>}
        </div>
      )}
    </div>
  )
}

export function CategoryBadge({ category }) {
  return <span className={`badge badge-${category}`}>{categoryLabel(category)}</span>
}

export function StatusBadge({ active }) {
  return (
    <span className={`status ${active ? 'status-active' : 'status-inactive'}`}>
      {active ? 'Ativo' : 'Desativado'}
    </span>
  )
}

export function Loading({ text = 'Carregando...' }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

// Modal acessível: fecha com Esc ou clicando fora; foca o elemento com data-autofocus.
export function Modal({ titleId, onClose, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    ref.current?.querySelector('[data-autofocus]')?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        {children}
      </div>
    </div>
  )
}
