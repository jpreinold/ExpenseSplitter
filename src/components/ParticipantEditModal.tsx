import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type ParticipantEditModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, id?: string) => void
  currentName: string
  currentId?: string
  allowIdEdit?: boolean
  idError?: string | null
}

export function ParticipantEditModal({
  isOpen,
  onClose,
  onSave,
  currentName,
  currentId,
  allowIdEdit = false,
  idError = null,
}: ParticipantEditModalProps) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const focusTimeout = window.requestAnimationFrame(() => {
      if (allowIdEdit && idInputRef.current) {
        idInputRef.current.focus()
        idInputRef.current.select()
      } else {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      }
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusTimeout)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, allowIdEdit])

  useEffect(() => {
    if (isOpen) {
      setName(currentName)
      setId(currentId ?? '')
    }
  }, [isOpen, currentName, currentId])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    if (allowIdEdit && id.trim()) {
      const trimmedId = id.trim()
      if (trimmedId && trimmedId !== currentId) {
        onSave(trimmedName, trimmedId)
      } else {
        onSave(trimmedName)
      }
    } else {
      onSave(trimmedName)
    }
    onClose()
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-participant-title" onClick={handleOverlayClick}>
      <div className="modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <h2 id="edit-participant-title">{allowIdEdit ? 'Edit participant' : 'Edit participant name'}</h2>
          <p>{allowIdEdit ? 'Update the name and ID for this participant.' : 'Update the name for this participant.'}</p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            <span>Name</span>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Participant name"
              required
            />
          </label>
          {allowIdEdit && (
            <label>
              <span>ID</span>
              <input
                ref={idInputRef}
                type="text"
                value={id}
                onChange={(event) => setId(event.target.value)}
                placeholder="Participant ID"
                required
              />
              {idError && <span className="error-text" style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{idError}</span>}
            </label>
          )}
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!name.trim() || (allowIdEdit && !id.trim())}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

