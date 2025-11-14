import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'

type ParticipantEditModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => void
  currentName: string
}

export function ParticipantEditModal({ isOpen, onClose, onSave, currentName }: ParticipantEditModalProps) {
  const [name, setName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

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
      setName(currentName)
    }
  }, [isOpen, currentName])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    onSave(trimmedName)
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
          <h2 id="edit-participant-title">Edit participant name</h2>
          <p>Update the name for this participant.</p>
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
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!name.trim()}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

