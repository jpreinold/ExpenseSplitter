import { useEffect, useRef, useState } from 'react'
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { SettlementPayment } from '../types/domain'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type SettlementDetailModalProps = {
  isOpen: boolean
  onClose: () => void
  fromName: string
  toName: string
  settlementAmount: number
  currency: string
  tracking: {
    payments: SettlementPayment[]
    markedComplete: boolean
  }
  onAddPayment: (amount: number) => void
  onRemovePayment: (paymentId: string) => void
}

export function SettlementDetailModal({
  isOpen,
  onClose,
  fromName,
  toName,
  settlementAmount,
  currency,
  tracking,
  onAddPayment,
  onRemovePayment,
}: SettlementDetailModalProps) {
  const [paymentAmount, setPaymentAmount] = useState('')
  const paymentInputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(isOpen)

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })

  const totalPaid = tracking.payments.reduce((sum, payment) => sum + payment.amount, 0)
  const remainingBalance = Math.max(0, settlementAmount - totalPaid)
  const isComplete = totalPaid >= settlementAmount - 0.01 // Allow small floating point differences

  useEffect(() => {
    if (!isOpen) return

    const focusTimeout = window.requestAnimationFrame(() => {
      paymentInputRef.current?.focus()
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
    if (!isOpen) {
      setPaymentAmount('')
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) return
    if (amount > remainingBalance) return

    onAddPayment(amount)
    setPaymentAmount('')
    paymentInputRef.current?.focus()
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const handleMarkComplete = () => {
    // Add a payment for the remaining balance
    if (remainingBalance > 0) {
      onAddPayment(remainingBalance)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-detail-title"
      onClick={handleOverlayClick}
    >
      <div className="modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <h2 id="settlement-detail-title">Settlement Details</h2>
              <p style={{ marginTop: '0.5rem' }}>
                <span className="settlement-name">{fromName}</span> → {formatter.format(settlementAmount)} →{' '}
                <span className="settlement-name">{toName}</span>
              </p>
            </div>
            <span
              className={`status-pill ${isComplete ? 'status-pill--complete' : 'status-pill--incomplete'}`}
            >
              {isComplete ? 'Completed' : 'Incomplete'}
            </span>
          </div>
        </header>

        <div className="modal__form">
          <div className="settlement-balance">
            <div className="settlement-balance__row">
              <span>Settlement Amount:</span>
              <strong>{formatter.format(settlementAmount)}</strong>
            </div>
            <div className="settlement-balance__row">
              <span>Total Paid:</span>
              <strong>{formatter.format(totalPaid)}</strong>
            </div>
            <div className="settlement-balance__row settlement-balance__row--remaining">
              <span>Remaining Balance:</span>
              <strong>{formatter.format(remainingBalance)}</strong>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label>
              <span>Payment Amount</span>
              <input
                ref={paymentInputRef}
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalance}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder={`Max: ${formatter.format(remainingBalance)}`}
                disabled={remainingBalance <= 0}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
              <button
                type="submit"
                className="primary-button"
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || parseFloat(paymentAmount) > remainingBalance || remainingBalance <= 0}
                style={{ flex: 1 }}
              >
                Add Payment
              </button>
              {!isComplete && remainingBalance > 0 && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleMarkComplete}
                  style={{ flex: 1 }}
                >
                  Mark as Complete
                </button>
              )}
            </div>
          </form>

          {tracking.payments.length > 0 && (
            <div className="payment-logs">
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>
                Payment History
              </h3>
              <ul className="payment-logs__list">
                {tracking.payments.map((payment) => (
                  <li key={payment.id} className="payment-logs__item">
                    <div className="payment-logs__info">
                      <span className="payment-logs__amount">{formatter.format(payment.amount)}</span>
                      <span className="payment-logs__date">{formatDate(payment.paidAt)}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      onClick={() => onRemovePayment(payment.id)}
                      aria-label="Delete payment"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

