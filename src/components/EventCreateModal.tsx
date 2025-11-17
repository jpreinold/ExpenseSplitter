import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { EventDraft } from '../state/useLocalStore'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type EventCreateModalProps = {
  isOpen: boolean
  onClose: () => void
  onCreate: (draft: EventDraft) => void
}

const currencyOptions = [
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British Pound (GBP)' },
  { value: 'CAD', label: 'Canadian Dollar (CAD)' },
  { value: 'AUD', label: 'Australian Dollar (AUD)' },
]

export function EventCreateModal({ isOpen, onClose, onCreate }: EventCreateModalProps) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const focusTimeout = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
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
    if (!isOpen) return
    setName('')
    setLocation('')
    setStartDate('')
    setEndDate('')
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    onCreate({
      name: trimmedName,
      location: location.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      currency,
    })
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-event-title" onClick={handleOverlayClick}>
      <div className="modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <h2 id="create-event-title">Create a new event</h2>
          <p>Give it a name, set the details, and you are ready to start splitting.</p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            <span>Event name</span>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Summer cabin weekend"
              required
            />
          </label>
          <label>
            <span>Location (optional)</span>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Lake Tahoe, CA"
            />
          </label>
          <div className="modal__grid">
            <label>
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <label>
            <span>Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {currencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!name.trim()}>
              Create event
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


