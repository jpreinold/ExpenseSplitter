import { useMemo, useState, useRef, useEffect } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { ConfirmationOptions } from './ConfirmDialog'
import type { Participant, ParticipantGroup, ParticipantId } from '../types/domain'
import { EventSubNav } from './EventSubNav'
import { EventHeader } from './EventHeader'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

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
  notes?: string
}

type Suggestion = 
  | { type: 'participant'; participant: Participant }
  | { type: 'group'; group: ParticipantGroup }

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
  allParticipants: Participant[]
  groups: ParticipantGroup[]
  onBack: () => void
  onAddExpense: () => void
  onShowSummary: () => void
  onAddParticipant: (name: string) => void
  onAddExistingParticipant: (participantId: ParticipantId) => void
  onAddGroup: (groupId: string) => void
  onRemoveParticipant: (participantId: string) => void
  onEditParticipant: (participantId: string) => void
  onEditEventName: () => void
  onRemoveExpense: (expenseId: string) => void
  onEditExpense: (expenseId: string) => void
  onDeleteEvent: () => void | Promise<void>
  onNavigateToParticipants: () => void
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
  allParticipants,
  groups,
  onBack,
  onAddExpense,
  onShowSummary,
  onAddParticipant,
  onAddExistingParticipant,
  onAddGroup,
  onRemoveParticipant,
  onEditParticipant,
  onEditEventName,
  onRemoveExpense,
  onEditExpense,
  onDeleteEvent,
  onNavigateToParticipants,
  requestConfirmation,
}: EventDetailProps) {
  const [participantName, setParticipantName] = useState('')
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [showAmbiguousModal, setShowAmbiguousModal] = useState(false)
  const [ambiguousMatches, setAmbiguousMatches] = useState<Participant[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(showAmbiguousModal)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const expensesSectionRef = useRef<HTMLDivElement>(null)

  const trimmedParticipantName = participantName.trim()
  
  const currentEventParticipantIds = useMemo(() => new Set(participants.map(p => p.id)), [participants])
  const totalFormatted = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }).format(totals.expenses),
    [currency, totals.expenses],
  )

  // Filter suggestions based on input
  useEffect(() => {
    const trimmed = participantName.trim().toLowerCase()
    if (!trimmed) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const newSuggestions: Suggestion[] = []

    // Add matching participants (not already in this event)
    allParticipants
      .filter(p => 
        !currentEventParticipantIds.has(p.id) &&
        p.name.toLowerCase().includes(trimmed)
      )
      .forEach(p => {
        newSuggestions.push({ type: 'participant', participant: p })
      })

    // Add matching groups
    groups
      .filter(g => g.name.toLowerCase().includes(trimmed))
      .forEach(g => {
        newSuggestions.push({ type: 'group', group: g })
      })

    setSuggestions(newSuggestions)
    setShowSuggestions(newSuggestions.length > 0)
    setSelectedSuggestionIndex(-1)
  }, [participantName, allParticipants, groups, currentEventParticipantIds])

  // Check for exact matches
  const getExactMatches = (name: string): Participant[] => {
    const trimmed = name.trim().toLowerCase()
    return allParticipants.filter(
      p => !currentEventParticipantIds.has(p.id) && p.name.toLowerCase() === trimmed
    )
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    if (suggestion.type === 'participant') {
      onAddExistingParticipant(suggestion.participant.id)
    } else {
      onAddGroup(suggestion.group.id)
    }
    setParticipantName('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleSubmitParticipant = async (event: FormEvent) => {
    event.preventDefault()
    if (!trimmedParticipantName) return

    if (suggestions.length > 0) {
      const suggestion =
        selectedSuggestionIndex >= 0 ? suggestions[selectedSuggestionIndex] : suggestions[0]
      handleSuggestionClick(suggestion)
      return
    }

    // Check for exact matches
    const exactMatches = getExactMatches(trimmedParticipantName)
    
    if (exactMatches.length > 0) {
      // Show modal to choose between new or existing
      setAmbiguousMatches(exactMatches)
      setShowAmbiguousModal(true)
      return
    }

    // No exact match, create new participant
    onAddParticipant(trimmedParticipantName)
    setParticipantName('')
    setShowSuggestions(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const hasSuggestions = suggestions.length > 0

    if (event.key === 'Enter' && hasSuggestions) {
      event.preventDefault()
      const suggestion =
        selectedSuggestionIndex >= 0 ? suggestions[selectedSuggestionIndex] : suggestions[0]
      handleSuggestionClick(suggestion)
      return
    }

    if (!showSuggestions || !hasSuggestions) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedSuggestionIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (event.key === 'Enter' && selectedSuggestionIndex >= 0) {
      event.preventDefault()
      handleSuggestionClick(suggestions[selectedSuggestionIndex])
    } else if (event.key === 'Escape') {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }

  const handleCreateNew = () => {
    const trimmed = participantName.trim()
    if (!trimmed) return
    onAddParticipant(trimmed)
    setParticipantName('')
    setShowSuggestions(false)
    setShowAmbiguousModal(false)
    setAmbiguousMatches([])
    inputRef.current?.focus()
  }

  const handleUseExisting = (participantId: ParticipantId) => {
    onAddExistingParticipant(participantId)
    setParticipantName('')
    setShowSuggestions(false)
    setShowAmbiguousModal(false)
    setAmbiguousMatches([])
    inputRef.current?.focus()
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
      <div className="event-top-stack">
        <button className="back-button" onClick={onBack}>
          ← Events List
        </button>
        <EventHeader
          name={name}
          dateRange={dateRange}
          location={location}
          participantsCount={participants.length}
          expenseCount={expenses.length}
          totalLabel={totalFormatted}
          onEdit={onEditEventName}
          onDelete={() => {
            void onDeleteEvent()
          }}
        />
        <EventSubNav
          activeTab="expenses"
          onSelectExpenses={() => {
            if (expensesSectionRef.current) {
              expensesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }}
          onSelectSettle={onShowSummary}
        />
      </div>

      <section aria-labelledby="participants-heading" className="participants-panel">
        <div className="panel-heading">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
            <h3 id="participants-heading">Participants</h3>
            <button
              type="button"
              className="edit-name-button edit-name-button--import"
              aria-label="Open participants tab"
              onClick={onNavigateToParticipants}
              style={{ padding: '0.05rem', lineHeight: 0 }}
            >
              <svg
                aria-hidden="true"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                <path
                  d="M12 4V14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 10L12 14L16 10"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 18H18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <span className="badge">{participants.length}</span>
        </div>
        <form className="inline-form participant-form" onSubmit={handleSubmitParticipant}>
          <label className="sr-only" htmlFor="new-participant">
            New participant name
          </label>
          <div className="input-group" style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              id="new-participant"
              type="text"
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) {
                  setShowSuggestions(true)
                }
              }}
              onBlur={() => {
                // Delay to allow click events on suggestions
                setTimeout(() => {
                  if (!suggestionsRef.current?.contains(document.activeElement)) {
                    setShowSuggestions(false)
                  }
                }, 200)
              }}
              placeholder="Add a participant"
              className="input-group__control"
              autoComplete="off"
            />
            <button type="submit" className="input-group__button" aria-label="Add participant">
              Add
            </button>
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '0.25rem',
                  background: 'var(--color-surface, #ffffff)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  zIndex: 1000,
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.type === 'participant' ? suggestion.participant.id : suggestion.group.id}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      textAlign: 'left',
                      background: selectedSuggestionIndex === index 
                        ? 'var(--color-surface-secondary, rgba(148, 163, 184, 0.1))' 
                        : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                      {suggestion.type === 'participant' 
                        ? suggestion.participant.name 
                        : suggestion.group.name}
                    </span>
                    {suggestion.type === 'group' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Group • {suggestion.group.participantIds.length} participant{suggestion.group.participantIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {suggestion.type === 'participant' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Participant
                      </span>
                    )}
                  </button>
                ))}
                {trimmedParticipantName && (
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    onMouseDown={(e) => e.preventDefault()}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      textAlign: 'left',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      background: 'transparent',
                      borderTop: '1px solid rgba(148, 163, 184, 0.15)',
                      marginTop: '0.25rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      Add "{trimmedParticipantName}" as new
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      Create a new participant with this name
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </form>
        {participants.length === 0 ? (
          <div className="empty-state">
            <strong>No participants yet</strong>
            Add the crew so you can split expenses properly.
          </div>
        ) : (
          <ul className="participant-pill-list">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="participant-pill"
                onClick={() => {
                  onEditParticipant(participant.id)
                }}
                style={{ cursor: 'pointer' }}
              >
                <span>{participant.name}</span>
                <button
                  aria-label={`Remove ${participant.name}`}
                  type="button"
                  className="icon-button icon-button--danger"
                  onClick={(event) => {
                    event.stopPropagation()
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

      <section aria-labelledby="expenses-heading" ref={expensesSectionRef}>
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
                  onClick={() => {
                    setOpenNoteId(null)
                    onEditExpense(expense.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setOpenNoteId(null)
                      onEditExpense(expense.id)
                    }
                  }}
                >
                  <div className="expense-card__main">
                    <div className="expense-card__title-row">
                      <p className="expense-title">{expense.description}</p>
                      {expense.notes ? (
                        <div className="expense-note-anchor">
                          <button
                            type="button"
                            className="ghost-button ghost-button--small expense-note-button"
                            aria-label={`Show notes for ${expense.description}`}
                            aria-expanded={openNoteId === expense.id}
                            aria-controls={`expense-note-${expense.id}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setOpenNoteId((current) => (current === expense.id ? null : expense.id))
                            }}
                          >
                            i
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="expense-meta">
                      <div className="expense-meta__line">
                        Paid by {expense.paidBy.map((payer) => payer.replace(/\s*\(.*?\)\s*$/, '')).join(', ')}
                      </div>
                      {expense.date && (
                        <div className="expense-meta__line">
                          {expense.date}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="expense-amount">
                    <span>{expense.formattedAmount}</span>
                    <div className="expense-amount__meta">
                      <div className="expense-amount__line">
                        {(() => {
                          const match = expense.splitSummary.match(/(\d+)\s+participants?/)
                          if (!match) return ''
                          const count = parseInt(match[1], 10)
                          return `${count} ${count === 1 ? 'participant' : 'participants'}`
                        })()}
                      </div>
                      <div className="expense-amount__line">
                        {expense.splitSummary.split('·')[0]?.trim() || expense.splitSummary.split('•')[0]?.trim() || ''}
                      </div>
                    </div>
                  </div>
                  {expense.notes && openNoteId === expense.id ? (
                    <div className="expense-note-popover" id={`expense-note-${expense.id}`} role="dialog">
                      <div className="expense-note-popover__content">{expense.notes}</div>
                    </div>
                  ) : null}
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
                      setOpenNoteId(null)
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

      {showAmbiguousModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowAmbiguousModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2>Participant already exists</h2>
              <p>"{participantName}" matches an existing participant. Would you like to add the existing participant or create a new one?</p>
            </header>
            <div className="modal__form">
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  Existing participant{ambiguousMatches.length > 1 ? 's' : ''}:
                </label>
                {ambiguousMatches.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    onClick={() => handleUseExisting(participant.id)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      textAlign: 'left',
                      background: 'var(--color-surface-secondary, rgba(148, 163, 184, 0.1))',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                    }}
                  >
                    {participant.name}
                  </button>
                ))}
              </div>
              <div className="modal__actions">
                <button type="button" className="ghost-button" onClick={() => setShowAmbiguousModal(false)}>
                  Cancel
                </button>
                <button type="button" className="primary-button" onClick={handleCreateNew}>
                  Create new participant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export type { ParticipantProfile, ExpensePreview }

