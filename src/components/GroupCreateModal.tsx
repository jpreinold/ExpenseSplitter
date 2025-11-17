import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Participant } from '../types/domain'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type GroupCreateModalProps = {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string) => void
  initialName?: string
  selectedParticipants?: Participant[]
}

export function GroupCreateModal({ isOpen, onClose, onCreate, initialName, selectedParticipants = [] }: GroupCreateModalProps) {
  const [name, setName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const focusTimeout = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
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
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      setName(initialName ?? '')
    }
  }, [isOpen, initialName])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    onCreate(trimmedName)
    onClose()
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-group-title" onClick={handleOverlayClick}>
      <div className="modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <h2 id="create-group-title">Create group</h2>
          <p>Give this group a name to easily add these participants to future events.</p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          {selectedParticipants.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Selected participants ({selectedParticipants.length})
              </label>
              <div style={{ 
                padding: '0.75rem', 
                background: 'var(--color-surface-secondary, rgba(148, 163, 184, 0.1))', 
                borderRadius: '0.5rem',
                fontSize: '0.875rem'
              }}>
                {selectedParticipants.map((p) => p.name).join(', ')}
              </div>
            </div>
          )}
          <label>
            <span>Group name</span>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Family, Roommates, Work Team"
              required
            />
          </label>
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Go back
            </button>
            <button type="submit" className="primary-button" disabled={!name.trim()}>
              Create group
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

