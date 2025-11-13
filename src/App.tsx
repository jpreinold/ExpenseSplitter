import { useMemo, useState } from 'react'
import './App.css'
import { EventDetail } from './components/EventDetail'
import { EventCreateModal } from './components/EventCreateModal'
import { EventList } from './components/EventList'
import { ExpenseEditor } from './components/ExpenseEditor'
import { Summary } from './components/Summary'
import { useLocalStore } from './state/useLocalStore'
import type { EventDraft, ExpenseDraft } from './state/useLocalStore'
import { calculateEventBalances, describeSplit, suggestSettlements } from './utils/calculations'

type ViewMode = 'events' | 'detail' | 'summary' | 'editor'

function App() {
  const { state, actions } = useLocalStore()
  const events = state.events

  const [view, setView] = useState<ViewMode>('events')
  const [isCreateEventModalOpen, setIsCreateEventModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  const selectedEventId = state.lastViewedEventId ?? events[0]?.id ?? null

  const selectedEvent = useMemo(
    () => events.find((eventItem) => eventItem.id === selectedEventId) ?? null,
    [events, selectedEventId],
  )

  const eventParticipants = useMemo(() => {
    if (!selectedEvent) return []
    return selectedEvent.participants
  }, [selectedEvent])

  const participantMap = useMemo(() => {
    return new Map(eventParticipants.map((participant) => [participant.id, participant]))
  }, [eventParticipants])

  const eventExpenses = useMemo(() => selectedEvent?.expenses ?? [], [selectedEvent])

  const editingExpense = useMemo(() => {
    if (!selectedEvent || !editingExpenseId) return null
    return selectedEvent.expenses.find((expense) => expense.id === editingExpenseId) ?? null
  }, [editingExpenseId, selectedEvent])

  const eventList = useMemo(() => {
    return events.map((eventItem) => {
      const total = eventItem.expenses.reduce((sum, expense) => sum + expense.amount, 0)
      const currencyFormatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: eventItem.currency,
      })
      const dateRange =
        eventItem.startDate && eventItem.endDate
          ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).formatRange(
              new Date(eventItem.startDate),
              new Date(eventItem.endDate),
            )
          : undefined
      return {
        id: eventItem.id,
        name: eventItem.name,
        dateRange,
        location: eventItem.location ?? undefined,
        total,
        formattedTotal: currencyFormatter.format(total),
        participantCount: eventItem.participants.length,
        expenseCount: eventItem.expenses.length,
      }
    })
  }, [events])

  const eventExpensePreviews = useMemo(() => {
    const formatter =
      selectedEvent &&
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: selectedEvent.currency,
      })
    return eventExpenses.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      formattedAmount: formatter ? formatter.format(expense.amount) : expense.amount.toFixed(2),
      date: expense.createdAt ? new Date(expense.createdAt).toLocaleDateString() : undefined,
      paidBy: expense.paidBy.map((allocation) => {
        const participant = participantMap.get(allocation.participantId)
        const name = participant?.name ?? 'Unknown'
        const formatted = formatter ? formatter.format(allocation.amount) : allocation.amount.toFixed(2)
        return `${name} (${formatted})`
      }),
      splitSummary: describeSplit(expense, participantMap),
    }))
  }, [eventExpenses, participantMap, selectedEvent])

  const summary = useMemo(() => {
    if (!selectedEvent) {
      return {
        totals: { participants: 0, expenses: 0 },
        balances: [],
        settlements: [],
      }
    }

    const { totals, balances } = calculateEventBalances(selectedEvent)

    const balanceRows = balances.map((balance) => {
      const participant = participantMap.get(balance.participantId)
      return {
        id: balance.participantId,
        name: participant?.name ?? 'Unknown',
        paid: balance.paid,
        owes: balance.owes,
        balance: balance.net,
      }
    })

    const settlements = suggestSettlements(balances).map((settlement) => ({
      from: participantMap.get(settlement.from)?.name ?? 'Unknown',
      to: participantMap.get(settlement.to)?.name ?? 'Unknown',
      amount: settlement.amount,
    }))

    return { totals, balances: balanceRows, settlements }
  }, [participantMap, selectedEvent])

  const handleSelectEvent = (eventId: string) => {
    actions.setLastViewedEvent(eventId)
    setView('detail')
  }

  const handleSaveExpense = (draft: ExpenseDraft) => {
    if (!selectedEvent) return
    actions.upsertExpense(selectedEvent.id, draft)
    setView('detail')
    setEditingExpenseId(null)
  }

  const handleAddParticipantToEvent = (name: string) => {
    if (!selectedEvent) return
    actions.upsertParticipant(selectedEvent.id, { name })
  }

  const handleRemoveParticipantFromEvent = (participantId: string) => {
    if (!selectedEvent) return
    actions.removeParticipant(selectedEvent.id, participantId)
  }

  const handleRemoveExpense = (expenseId: string) => {
    if (!selectedEvent) return
    actions.removeExpense(selectedEvent.id, expenseId)
  }

  const handleOpenCreateEventModal = () => {
    setIsCreateEventModalOpen(true)
  }

  const handleCloseCreateEventModal = () => {
    setIsCreateEventModalOpen(false)
  }

  const handleCreateEvent = (draft: EventDraft) => {
    const event = actions.createEvent(draft)
    actions.setLastViewedEvent(event.id)
    setView('detail')
    setIsCreateEventModalOpen(false)
  }

  const handleAddExpense = () => {
    setEditingExpenseId(null)
    setView('editor')
  }

  const handleEditExpense = (expenseId: string) => {
    setEditingExpenseId(expenseId)
    setView('editor')
  }

  const activeView = selectedEvent ? view : 'events'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Split Expense</h1>
          <p className="app-subtitle">A lightweight PWA to split group trips, weekends, and celebrations.</p>
        </div>
        <nav className="pill-nav" aria-label="Primary views">
          <button
            className={`pill-button ${activeView === 'events' ? 'active' : ''}`}
            onClick={() => setView('events')}
            type="button"
          >
            Events
          </button>
          {selectedEvent ? (
            <>
              <button
                className={`pill-button ${activeView === 'detail' ? 'active' : ''}`}
                onClick={() => setView('detail')}
                type="button"
              >
                Details
              </button>
              <button
                className={`pill-button ${activeView === 'summary' ? 'active' : ''}`}
                onClick={() => setView('summary')}
                type="button"
              >
                Summary
              </button>
            </>
          ) : null}
        </nav>
      </header>

      <main className="view-container">
        {activeView === 'events' && (
          <EventList events={eventList} onSelect={handleSelectEvent} onCreate={handleOpenCreateEventModal} />
        )}

        {activeView === 'detail' && selectedEvent ? (
          <EventDetail
            name={selectedEvent.name}
            currency={selectedEvent.currency}
            dateRange={
              selectedEvent.startDate && selectedEvent.endDate
                ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).formatRange(
                    new Date(selectedEvent.startDate),
                    new Date(selectedEvent.endDate),
                  )
                : undefined
            }
            location={selectedEvent.location}
            totals={summary.totals}
            participants={eventParticipants}
            expenses={eventExpensePreviews}
            onBack={() => setView('events')}
            onAddExpense={handleAddExpense}
            onShowSummary={() => setView('summary')}
            onAddParticipant={handleAddParticipantToEvent}
            onRemoveParticipant={handleRemoveParticipantFromEvent}
            onRemoveExpense={handleRemoveExpense}
            onEditExpense={handleEditExpense}
          />
        ) : null}

        {activeView === 'editor' && selectedEvent ? (
          <ExpenseEditor
            participants={eventParticipants}
            currency={selectedEvent.currency}
            onCancel={() => {
              setView('detail')
              setEditingExpenseId(null)
            }}
            onSave={handleSaveExpense}
            initialExpense={editingExpense ?? undefined}
          />
        ) : null}

        {activeView === 'summary' && selectedEvent ? (
          <Summary
            eventName={selectedEvent.name}
            totals={summary.totals}
            balances={summary.balances}
            settlements={summary.settlements}
            onBack={() => setView('detail')}
            currency={selectedEvent.currency}
          />
        ) : null}
      </main>

      <footer className="surface">
        <p className="section-subtitle">
          Your data stays on this device for now. Install on other devices and sync via export/import in future updates.
        </p>
        <p className="section-subtitle">Works great offline—perfect for cabins, boats, and airports.</p>
      </footer>

      <EventCreateModal
        isOpen={isCreateEventModalOpen}
        onClose={handleCloseCreateEventModal}
        onCreate={handleCreateEvent}
      />
    </div>
  )
}

export default App
