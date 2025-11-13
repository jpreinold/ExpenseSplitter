import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ConfirmationOptions } from './ConfirmDialog'

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
  onDeleteEvent: () => void | Promise<void>
  requestConfirmation: (options: ConfirmationOptions) => Promise<boolean>
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
  onDeleteEvent,
  requestConfirmation,
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

  const handleRemoveParticipant = async (participantId: string, participantName: string) => {
    const confirmed = await requestConfirmation({
      title: 'Remove participant',
      message: `Remove ${participantName} from this event? They will be taken out of any expense splits.`,
      confirmLabel: 'Remove participant',
      cancelLabel: 'Keep participant',
      tone: 'danger',
    })
    if (!confirmed) return

    onRemoveParticipant(participantId)
  }

  return (
    <section className="surface view-section">
      <header className="section-header">
        <button className="ghost-button" onClick={onBack}>
          ← Events
        </button>
        <div className="section-heading section-heading--event">
          <div className="section-heading__row">
            <h2 className="section-title">{name}</h2>
            <button
              type="button"
              className="icon-button icon-button--danger"
              aria-label="Delete event"
              onClick={() => {
                void onDeleteEvent()
              }}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
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
            <strong>Settle</strong>
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
                  onClick={() => {
                    void handleRemoveParticipant(participant.id, participant.name)
                  }}
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
          <div className="panel-heading__actions">
            <span className="badge">{expenses.length}</span>
            <button
              type="button"
              className="icon-button icon-button--primary"
              aria-label="Add expense"
              onClick={onAddExpense}
            >
              <span aria-hidden>+</span>
            </button>
          </div>
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
                    onClick={async (event) => {
                      event.stopPropagation()
                      const confirmed = await requestConfirmation({
                        title: 'Remove expense',
                        message: 'Remove this expense? This action cannot be undone.',
                        confirmLabel: 'Remove expense',
                        cancelLabel: 'Keep expense',
                        tone: 'danger',
                      })
                      if (!confirmed) return
                      onRemoveExpense(expense.id)
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

