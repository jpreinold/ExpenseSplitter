import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type OpenAiKeyModalProps = {
  isOpen: boolean
  initialKey?: string | null
  onSave: (apiKey: string) => void
  onClose: () => void
  onRemove?: () => void
}

export function OpenAiKeyModal({ isOpen, initialKey, onSave, onClose, onRemove }: OpenAiKeyModalProps) {
  const [value, setValue] = useState(initialKey ?? '')
  const [error, setError] = useState('')

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (isOpen) {
      setValue(initialKey ?? '')
      setError('')
    }
  }, [initialKey, isOpen])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!value.trim()) {
      setError('Enter a valid OpenAI API key.')
      return
    }
    onSave(value.trim())
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal modal--key" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>Connect OpenAI</h2>
          <p>
            Paste your OpenAI API key to let us ask an AI model to read the OCR text. Your key never leaves this device –
            it&apos;s stored in this browser and used directly from here when you scan a receipt.
          </p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label className="expense-form__field">
            <span>OpenAI API key</span>
            <input
              type="password"
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setError('')
              }}
              placeholder="sk-..."
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <p className="helper-text">
            We send the OCR text (not the photo) to OpenAI. You can revoke the key any time from your OpenAI dashboard.
          </p>
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              {initialKey ? 'Cancel' : 'Skip for now'}
            </button>
            {onRemove && initialKey ? (
              <button type="button" className="ghost-button" onClick={onRemove}>
                Remove key
              </button>
            ) : null}
            <button type="submit" className="primary-button">
              Save key
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


