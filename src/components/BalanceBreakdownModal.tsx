import { useEffect } from 'react'
import type { ExpenseBreakdownItem } from '../utils/calculations'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type BalanceBreakdownModalProps = {
  isOpen: boolean
  participantName: string
  currency: string
  paid: number
  owes: number
  balance: number
  breakdown: ExpenseBreakdownItem[]
  onClose: () => void
}

export function BalanceBreakdownModal({
  isOpen,
  participantName,
  currency,
  paid,
  owes,
  balance,
  breakdown,
  onClose,
}: BalanceBreakdownModalProps) {
  useBodyScrollLock(isOpen)

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="balance-breakdown-title"
      onClick={onClose}
    >
      <div className="modal balance-breakdown-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 id="balance-breakdown-title">Balance breakdown: {participantName}</h2>
          <div className="balance-breakdown-modal__summary">
            <div className="balance-breakdown-modal__summary-row">
              <span>Paid</span>
              <strong>{formatter.format(paid)}</strong>
            </div>
            <div className="balance-breakdown-modal__summary-row">
              <span>Owes</span>
              <strong>{formatter.format(owes)}</strong>
            </div>
            <div
              className={`balance-breakdown-modal__summary-row balance-breakdown-modal__summary-row--net ${
                balance >= 0 ? 'positive' : 'negative'
              }`}
            >
              <span>Net balance</span>
              <strong>
                {balance >= 0 ? '+' : '-'}
                {formatter.format(Math.abs(balance))}
              </strong>
            </div>
          </div>
        </header>

        <div className="modal__content">
          <h3 className="balance-breakdown-modal__expenses-heading">Expenses</h3>
          {breakdown.length === 0 ? (
            <p className="balance-breakdown-modal__empty">No expenses involving this participant.</p>
          ) : (
            <ul className="balance-breakdown-modal__list">
              {breakdown.map((item) => (
                <li key={item.expenseId} className="balance-breakdown-modal__item">
                  <div className="balance-breakdown-modal__item-header">
                    <span className="balance-breakdown-modal__item-desc">{item.description}</span>
                    <span className="balance-breakdown-modal__item-total">
                      {formatter.format(item.totalAmount)}
                    </span>
                  </div>
                  <div className="balance-breakdown-modal__item-details">
                    {item.paidAmount > 0 && (
                      <div className="balance-breakdown-modal__detail-row balance-breakdown-modal__detail-row--paid">
                        <span>Paid</span>
                        <span>+{formatter.format(item.paidAmount)}</span>
                      </div>
                    )}
                    {item.owedAmount > 0 && (
                      <div className="balance-breakdown-modal__detail-row balance-breakdown-modal__detail-row--owed">
                        <span>Owes</span>
                        <span>-{formatter.format(item.owedAmount)}</span>
                      </div>
                    )}
                    <div
                      className={`balance-breakdown-modal__detail-row balance-breakdown-modal__detail-row--net ${
                        item.netAmount >= 0 ? 'positive' : 'negative'
                      }`}
                    >
                      <span>Net</span>
                      <span>
                        {item.netAmount >= 0 ? '+' : ''}
                        {formatter.format(item.netAmount)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal__actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
