import { useEffect, useRef } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type ConfirmTone = 'default' | 'danger'

export type ConfirmationOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type ConfirmDialogProps = ConfirmationOptions & {
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const focusFrame = window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onClick={onCancel}>
      <div className="modal modal--confirm" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p>{message}</p>
        </header>
        <div className="modal__actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`primary-button ${tone === 'danger' ? 'primary-button--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


