import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { EventDetail } from './components/EventDetail'
import { EventCreateModal } from './components/EventCreateModal'
import { EventList } from './components/EventList'
import { ExpenseEditor } from './components/ExpenseEditor'
import { Summary } from './components/Summary'
import { SettlementDetailModal } from './components/SettlementDetailModal'
import { useLocalStore } from './state/useLocalStore'
import type { EventDraft, ExpenseDraft } from './state/useLocalStore'
import { calculateEventBalances, describeSplit, suggestSettlements } from './utils/calculations'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { ConfirmationOptions } from './components/ConfirmDialog'

type ViewMode = 'events' | 'detail' | 'summary' | 'editor'

function App() {
  const { state, actions } = useLocalStore()
  const events = state.events

  const [view, setView] = useState<ViewMode>('events')
  const [isCreateEventModalOpen, setIsCreateEventModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [openSettlement, setOpenSettlement] = useState<{ fromId: string; toId: string } | null>(null)
  const [confirmState, setConfirmState] = useState<(ConfirmationOptions & { resolve: (value: boolean) => void }) | null>(
    null,
  )

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    if (!html || !body) return
    
    // Ensure pull-to-refresh works on iOS
    html.style.setProperty('overscroll-behavior-y', 'auto')
    html.style.setProperty('-webkit-overflow-scrolling', 'touch')
    body.style.setProperty('overscroll-behavior-y', 'auto')
    body.style.setProperty('-webkit-overflow-scrolling', 'touch')
    
    return () => {
      html.style.removeProperty('overscroll-behavior-y')
      html.style.removeProperty('-webkit-overflow-scrolling')
      body.style.removeProperty('overscroll-behavior-y')
      body.style.removeProperty('-webkit-overflow-scrolling')
    }
  }, [])

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
    return eventExpenses.map((expense) => {
      const note = expense.notes?.trim()
      return {
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        formattedAmount: formatter ? formatter.format(expense.amount) : expense.amount.toFixed(2),
        date: expense.createdAt ? new Date(expense.createdAt).toLocaleDateString() : undefined,
        notes: note ? note : undefined,
        paidBy: expense.paidBy.map((allocation) => {
          const participant = participantMap.get(allocation.participantId)
          const name = participant?.name ?? 'Unknown'
          const formatted = formatter ? formatter.format(allocation.amount) : allocation.amount.toFixed(2)
          return `${name} (${formatted})`
        }),
        splitSummary: describeSplit(expense, participantMap),
      }
    })
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

    const settlementTracking = selectedEvent.settlementTracking ?? []
    const settlements = suggestSettlements(balances).map((settlement) => {
      const tracking = settlementTracking.find(
        (t) => t.fromParticipantId === settlement.from && t.toParticipantId === settlement.to,
      )
      const totalPaid = tracking?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0
      const isComplete = totalPaid >= settlement.amount - 0.01 // Allow small floating point differences
      return {
        from: participantMap.get(settlement.from)?.name ?? 'Unknown',
        to: participantMap.get(settlement.to)?.name ?? 'Unknown',
        fromId: settlement.from,
        toId: settlement.to,
        amount: settlement.amount,
        isComplete,
      }
    })

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

  const requestConfirmation = (options: ConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve })
    })
  }

  const handleConfirmAccept = () => {
    if (!confirmState) return
    confirmState.resolve(true)
    setConfirmState(null)
  }

  const handleConfirmCancel = () => {
    if (!confirmState) return
    confirmState.resolve(false)
    setConfirmState(null)
  }

  const handleAddExpense = () => {
    setEditingExpenseId(null)
    setView('editor')
  }

  const handleEditExpense = (expenseId: string) => {
    setEditingExpenseId(expenseId)
    setView('editor')
  }

  const handleDeleteEvent = async (eventId: string) => {
    const eventToDelete = events.find((eventItem) => eventItem.id === eventId)
    const confirmed = await requestConfirmation({
      title: 'Delete event',
      message: `Delete "${eventToDelete?.name ?? 'this event'}"? This will remove all participants and expenses.`,
      confirmLabel: 'Delete event',
      cancelLabel: 'Keep event',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    actions.deleteEvent(eventId)
    if (selectedEventId === eventId) {
      setView('events')
      setEditingExpenseId(null)
    }
  }

  const handleSettlementClick = (fromId: string, toId: string) => {
    if (!selectedEvent) return
    setOpenSettlement({ fromId, toId })
  }

  const handleCloseSettlementModal = () => {
    setOpenSettlement(null)
  }

  const openSettlementData = useMemo(() => {
    if (!selectedEvent || !openSettlement) return null

    const settlement = summary.settlements.find(
      (s) => s.fromId === openSettlement.fromId && s.toId === openSettlement.toId,
    )
    if (!settlement) return null

    const tracking = selectedEvent.settlementTracking?.find(
      (t) => t.fromParticipantId === openSettlement.fromId && t.toParticipantId === openSettlement.toId,
    ) ?? {
      payments: [],
      markedComplete: false,
    }

    return {
      settlement,
      tracking,
    }
  }, [selectedEvent, openSettlement, summary.settlements])

  const handleAddSettlementPayment = (amount: number) => {
    if (!selectedEvent || !openSettlement || !openSettlementData) return
    actions.addSettlementPayment(
      selectedEvent.id,
      openSettlement.fromId,
      openSettlement.toId,
      amount,
      openSettlementData.settlement.amount,
    )
  }

  const handleRemoveSettlementPayment = (paymentId: string) => {
    if (!selectedEvent || !openSettlement || !openSettlementData) return
    actions.removeSettlementPayment(
      selectedEvent.id,
      openSettlement.fromId,
      openSettlement.toId,
      paymentId,
      openSettlementData.settlement.amount,
    )
  }


  const activeView = selectedEvent ? view : 'events'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Expense Settler</h1>
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
          <EventList
            events={eventList}
            onSelect={handleSelectEvent}
            onCreate={handleOpenCreateEventModal}
            onDelete={handleDeleteEvent}
          />
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
            onDeleteEvent={() => handleDeleteEvent(selectedEvent.id)}
            requestConfirmation={requestConfirmation}
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
            onSettlementClick={handleSettlementClick}
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

      <ConfirmDialog
        isOpen={Boolean(confirmState)}
        onCancel={handleConfirmCancel}
        onConfirm={handleConfirmAccept}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        tone={confirmState?.tone}
      />

      {openSettlementData && (
        <SettlementDetailModal
          isOpen={Boolean(openSettlement)}
          onClose={handleCloseSettlementModal}
          fromName={openSettlementData.settlement.from}
          toName={openSettlementData.settlement.to}
          settlementAmount={openSettlementData.settlement.amount}
          currency={selectedEvent?.currency ?? 'USD'}
          tracking={openSettlementData.tracking}
          onAddPayment={handleAddSettlementPayment}
          onRemovePayment={handleRemoveSettlementPayment}
        />
      )}
    </div>
  )
}

export default App
