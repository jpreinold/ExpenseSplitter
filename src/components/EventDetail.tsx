import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

type ParticipantProfile = {
  id: string
  name: string
}

type ExpensePreview = {
  id: string
  description: string
  amount: number
  formattedAmount: string
  paidBy: string[]
  splitSummary: string
  date?: string
}

type EventDetailProps = {
  name: string
  dateRange?: string
  location?: string
  currency: string
  totals: {
    expenses: number
    participants: number
  }
  participants: ParticipantProfile[]
  expenses: ExpensePreview[]
  onBack: () => void
  onAddExpense: () => void
  onShowSummary: () => void
  onAddParticipant: (name: string) => void
  onRemoveParticipant: (participantId: string) => void
  onRemoveExpense: (expenseId: string) => void
  onEditExpense: (expenseId: string) => void
}

export function EventDetail({
  name,
  dateRange,
  location,
  currency,
  totals,
  participants,
  expenses,
  onBack,
  onAddExpense,
  onShowSummary,
  onAddParticipant,
  onRemoveParticipant,
  onRemoveExpense,
  onEditExpense,
}: EventDetailProps) {
  const [participantName, setParticipantName] = useState('')
  const totalFormatted = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(totals.expenses),
    [currency, totals.expenses],
  )

  const handleSubmitParticipant = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = participantName.trim()
    if (!trimmed) return
    onAddParticipant(trimmed)
    setParticipantName('')
  }

  const handleRemoveParticipant = (participantId: string) => {
    if (window.confirm('Remove this participant from the event? They will be removed from splits.')) {
      onRemoveParticipant(participantId)
    }
  }

  return (
    <section className="surface view-section">
      <header className="section-header">
        <button className="ghost-button" onClick={onBack}>
          ← Events
        </button>
        <div className="section-heading">
          <h2 className="section-title">{name}</h2>
          <div className="meta">
            {dateRange && <span>{dateRange}</span>}
            {location && <span>{location}</span>}
            <span>{participants.length} participants</span>
            <span>{expenses.length} expenses</span>
            <span>{totalFormatted}</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={onShowSummary}>
            View summary
          </button>
          <button className="primary-button" onClick={onAddExpense}>
            Add expense
          </button>
        </div>
      </header>

      <section aria-labelledby="participants-heading" className="participants-panel">
        <div className="panel-heading">
          <h3 id="participants-heading">Participants</h3>
          <span className="badge">{participants.length}</span>
        </div>
        <form className="inline-form participant-form" onSubmit={handleSubmitParticipant}>
          <label className="sr-only" htmlFor="new-participant">
            New participant name
          </label>
          <div className="input-group">
            <input
              id="new-participant"
              type="text"
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              placeholder="Add someone new"
              className="input-group__control"
            />
            <button type="submit" className="input-group__button" aria-label="Add participant">
              Add
            </button>
          </div>
        </form>
        {participants.length === 0 ? (
          <div className="empty-state">
            <strong>No participants yet</strong>
            Add the crew so you can split expenses properly.
          </div>
        ) : (
          <ul>
            {participants.map((participant) => (
              <li key={participant.id}>
                <span>{participant.name}</span>
                <button
                  aria-label={`Remove ${participant.name}`}
                  type="button"
                  className="icon-button icon-button--danger"
                  onClick={() => handleRemoveParticipant(participant.id)}
                >
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="expenses-heading">
        <div className="panel-heading">
          <h3 id="expenses-heading">Expenses</h3>
          <span className="badge">{expenses.length}</span>
        </div>

        {expenses.length === 0 ? (
          <div className="empty-state">
            <strong>No expenses yet</strong>
            Add your first bill or purchase to start tracking.
          </div>
        ) : (
          <ul className="expense-list">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <div
                  className="expense-card expense-card--interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => onEditExpense(expense.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onEditExpense(expense.id)
                    }
                  }}
                >
                  <div>
                    <p className="expense-title">{expense.description}</p>
                    <p className="expense-meta">
                      Paid by {expense.paidBy.join(', ')}
                      {expense.date ? ` • ${expense.date}` : ''}
                    </p>
                  </div>
                  <div className="expense-amount">
                    <span>{expense.formattedAmount}</span>
                    <small>{expense.splitSummary}</small>
                  </div>
                  <button
                    className="icon-button icon-button--danger expense-card__remove"
                    type="button"
                    aria-label="Remove expense"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (window.confirm('Remove this expense? You can’t undo this yet.')) {
                        onRemoveExpense(expense.id)
                      }
                    }}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export type { ParticipantProfile, ExpensePreview }

