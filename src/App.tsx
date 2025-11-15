import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { EventDetail } from './components/EventDetail'
import { EventCreateModal } from './components/EventCreateModal'
import { EventList } from './components/EventList'
import { ExpenseEditor } from './components/ExpenseEditor'
import { Summary } from './components/Summary'
import { SettlementDetailModal } from './components/SettlementDetailModal'
import { ParticipantEditModal } from './components/ParticipantEditModal'
import { EventNameEditModal } from './components/EventNameEditModal'
import { ParticipantsTab } from './components/ParticipantsTab'
import { PrimaryNav } from './components/PrimaryNav'
import { useLocalStore } from './state/useLocalStore'
import type { EventDraft, ExpenseDraft, GroupDraft } from './state/useLocalStore'
import { calculateEventBalances, describeSplit, suggestSettlements } from './utils/calculations'
import { getAllParticipants } from './utils/participants'
import type { Participant } from './types/domain'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { ConfirmationOptions } from './components/ConfirmDialog'
import PullToRefresh from 'pulltorefreshjs'

type ViewMode = 'events' | 'participants' | 'eventOverview' | 'eventSummary' | 'editor'

function App() {
  const { state, actions } = useLocalStore()
  const events = state.events

  const [view, setView] = useState<ViewMode>('events')
  const [isCreateEventModalOpen, setIsCreateEventModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null)
  const [editingParticipantEventId, setEditingParticipantEventId] = useState<string | null>(null)
  const [isEditingEventName, setIsEditingEventName] = useState(false)
  const [openSettlement, setOpenSettlement] = useState<{ fromId: string; toId: string } | null>(null)
  const [participantIdError, setParticipantIdError] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<(ConfirmationOptions & { resolve: (value: boolean) => void }) | null>(
    null,
  )

  const ptrInstanceRef = useRef<ReturnType<typeof PullToRefresh.init> | null>(null)

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

  useEffect(() => {
    // Initialize PullToRefresh
    // Works in both regular browser and PWA standalone mode (especially useful for iOS PWA where native pull-to-refresh is disabled)
    const ptr = PullToRefresh.init({
      mainElement: 'body',
      onRefresh() {
        window.location.reload()
      },
    })

    ptrInstanceRef.current = ptr

    return () => {
      if (ptrInstanceRef.current) {
        ptrInstanceRef.current.destroy()
        ptrInstanceRef.current = null
      }
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

  const eventDateRange = useMemo(() => {
    if (!selectedEvent?.startDate || !selectedEvent.endDate) {
      return undefined
    }
    try {
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).formatRange(
        new Date(selectedEvent.startDate),
        new Date(selectedEvent.endDate),
      )
    } catch {
      return undefined
    }
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
    setView('eventOverview')
  }

  const handleSaveExpense = (draft: ExpenseDraft) => {
    if (!selectedEvent) return
    actions.upsertExpense(selectedEvent.id, draft)
    setView('eventOverview')
    setEditingExpenseId(null)
  }

  const handleAddParticipantToEvent = (name: string) => {
    if (!selectedEvent) return
    actions.upsertParticipant(selectedEvent.id, { name })
  }

  const handleAddExistingParticipantToEvent = (participantId: string) => {
    if (!selectedEvent) return
    const participant = allParticipants.find((p) => p.id === participantId)
    if (participant && !selectedEvent.participants.find((p) => p.id === participantId)) {
      actions.upsertParticipant(selectedEvent.id, { id: participant.id, name: participant.name })
      // Remove from unassigned if it was there
      const unassignedParticipant = state.unassignedParticipants.find((p) => p.id === participantId)
      if (unassignedParticipant) {
        actions.removeUnassignedParticipant(participantId)
      }
    }
  }

  const handleAddGroupToEvent = (groupId: string) => {
    if (!selectedEvent) return
    const group = state.groups.find((g) => g.id === groupId)
    if (!group) return
    
    group.participantIds.forEach((participantId) => {
      const participant = allParticipants.find((p) => p.id === participantId) ||
        state.unassignedParticipants.find((p) => p.id === participantId)
      if (participant && !selectedEvent.participants.find((p) => p.id === participantId)) {
        actions.upsertParticipant(selectedEvent.id, { id: participant.id, name: participant.name })
        // Remove from unassigned if it was there
        if (state.unassignedParticipants.find((p) => p.id === participantId)) {
          actions.removeUnassignedParticipant(participantId)
        }
      }
    })
  }

  const handleRemoveParticipantFromEvent = (participantId: string) => {
    if (!selectedEvent) return
    actions.removeParticipant(selectedEvent.id, participantId)
  }

  const handleEditParticipant = (participantId: string) => {
    setEditingParticipantId(participantId)
    if (selectedEvent) {
      setEditingParticipantEventId(selectedEvent.id)
    }
  }

  const handleEditParticipantFromTab = (participantId: string, eventId: string) => {
    setEditingParticipantId(participantId)
    setEditingParticipantEventId(eventId)
  }

  const handleCloseParticipantEditModal = () => {
    setEditingParticipantId(null)
    setEditingParticipantEventId(null)
    setParticipantIdError(null)
  }

  const handleSaveParticipant = (name: string, newId?: string) => {
    if (!editingParticipantId) return
    
    // Check if participant is unassigned
    const unassignedParticipant = state.unassignedParticipants.find((p) => p.id === editingParticipantId)
    
    if (unassignedParticipant) {
      // Handle unassigned participant editing
      try {
        if (newId && newId !== unassignedParticipant.id) {
          // Check if new ID already exists
          const allParticipantIds = new Set<string>()
          events.forEach((e) => {
            e.participants.forEach((p) => {
              if (p.id !== editingParticipantId) allParticipantIds.add(p.id)
            })
          })
          state.unassignedParticipants.forEach((p) => {
            if (p.id !== editingParticipantId) allParticipantIds.add(p.id)
          })
          
          if (allParticipantIds.has(newId)) {
            setParticipantIdError('This ID is already in use by another participant')
            return
          }
          
          // Update ID in unassigned participants
          const updatedUnassigned = state.unassignedParticipants.map((p) =>
            p.id === editingParticipantId ? { ...p, id: newId, name } : p
          )
          // Also need to update in groups
          const updatedGroups = state.groups.map((group) => ({
            ...group,
            participantIds: group.participantIds.map((id) => (id === editingParticipantId ? newId : id)),
          }))
          
          // Update state manually for unassigned participants
          actions.replaceState({
            ...state,
            unassignedParticipants: updatedUnassigned,
            groups: updatedGroups,
          })
        } else {
          // Just update name
          const updatedUnassigned = state.unassignedParticipants.map((p) =>
            p.id === editingParticipantId ? { ...p, name } : p
          )
          actions.replaceState({
            ...state,
            unassignedParticipants: updatedUnassigned,
          })
        }
        
        setEditingParticipantId(null)
        setEditingParticipantEventId(null)
        setParticipantIdError(null)
      } catch (error) {
        if (error instanceof Error && error.message === 'Participant ID already exists') {
          setParticipantIdError('This ID is already in use by another participant')
        } else {
          setParticipantIdError('Failed to update participant ID')
        }
      }
      return
    }
    
    // Handle event participant editing
    if (!editingParticipantEventId) return
    const event = events.find((e) => e.id === editingParticipantEventId)
    if (!event) return

    const participant = event.participants.find((p) => p.id === editingParticipantId)
    if (!participant) return

    try {
      if (newId && newId !== participant.id) {
        // Update participant ID
        actions.updateParticipantId(editingParticipantEventId, participant.id, newId)
      }
      // Update participant name
      actions.upsertParticipant(editingParticipantEventId, { id: newId ?? participant.id, name })
      setEditingParticipantId(null)
      setEditingParticipantEventId(null)
      setParticipantIdError(null)
    } catch (error) {
      if (error instanceof Error && error.message === 'Participant ID already exists') {
        setParticipantIdError('This ID is already in use by another participant')
      } else {
        setParticipantIdError('Failed to update participant ID')
      }
    }
  }

  const handleEditEventName = () => {
    setIsEditingEventName(true)
  }

  const handleCloseEventNameEditModal = () => {
    setIsEditingEventName(false)
  }

  const handleSaveEventName = (name: string) => {
    if (!selectedEvent) return
    actions.updateEventMeta(selectedEvent.id, { name })
    setIsEditingEventName(false)
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
    setView('eventOverview')
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

  const handleNavigateToParticipantsTab = () => {
    setView('participants')
  }

  const handleCreateGroup = (draft: GroupDraft) => {
    actions.createGroup(draft)
  }

  const handleDeleteGroup = (groupId: string) => {
    actions.deleteGroup(groupId)
  }

  const allParticipants = useMemo(() => {
    const eventParticipants = getAllParticipants(events)
    const all = [...eventParticipants, ...state.unassignedParticipants]
    // Deduplicate by ID
    const participantMap = new Map<string, Participant>()
    all.forEach((p) => {
      if (!participantMap.has(p.id)) {
        participantMap.set(p.id, p)
      }
    })
    return Array.from(participantMap.values())
  }, [events, state.unassignedParticipants])

  const activeView = selectedEvent ? view : 'events'

  useEffect(() => {
    if (
      !selectedEvent &&
      (view === 'eventOverview' || view === 'eventSummary' || view === 'editor')
    ) {
      setView('events')
    }
  }, [selectedEvent, view])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Expense Settler</h1>
          <p className="app-subtitle">A lightweight PWA to split group trips, weekends, and celebrations.</p>
        </div>
        <div className="app-header__controls">
          <PrimaryNav
            active={view === 'participants' ? 'participants' : 'events'}
            onChange={(target) => {
              if (target === 'participants') {
                setView('participants')
              } else {
                setView(selectedEvent ? 'eventOverview' : 'events')
              }
            }}
          />
        </div>
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

        {activeView === 'eventOverview' && selectedEvent ? (
          <EventDetail
            name={selectedEvent.name}
            currency={selectedEvent.currency}
            dateRange={eventDateRange}
            location={selectedEvent.location}
            totals={summary.totals}
            participants={eventParticipants}
            expenses={eventExpensePreviews}
            allParticipants={allParticipants}
            groups={state.groups}
            onBack={() => setView('events')}
            onAddExpense={handleAddExpense}
            onShowSummary={() => setView('eventSummary')}
            onAddParticipant={handleAddParticipantToEvent}
            onAddExistingParticipant={handleAddExistingParticipantToEvent}
            onAddGroup={handleAddGroupToEvent}
            onRemoveParticipant={handleRemoveParticipantFromEvent}
            onEditParticipant={handleEditParticipant}
            onEditEventName={handleEditEventName}
            onRemoveExpense={handleRemoveExpense}
            onEditExpense={handleEditExpense}
            onDeleteEvent={() => handleDeleteEvent(selectedEvent.id)}
            onNavigateToParticipants={handleNavigateToParticipantsTab}
            requestConfirmation={requestConfirmation}
          />
        ) : null}

        {view === 'participants' && (
          <ParticipantsTab
            events={events}
            groups={state.groups}
            participants={allParticipants}
            unassignedParticipants={state.unassignedParticipants}
            onEditParticipant={handleEditParticipantFromTab}
            onDeleteParticipant={(participantId) => {
              actions.deleteParticipantCompletely(participantId)
            }}
            onCreateParticipant={(name) => {
              actions.createUnassignedParticipant({ name })
            }}
            onAddParticipantsToEvent={(participantIds, eventId) => {
              participantIds.forEach((participantId) => {
                // Check if participant is in unassigned or in other events
                const unassignedParticipant = state.unassignedParticipants.find((p) => p.id === participantId)
                const participant = unassignedParticipant || allParticipants.find((p) => p.id === participantId)
                if (participant && !events.find((e) => e.id === eventId)?.participants.find((p) => p.id === participantId)) {
                  actions.upsertParticipant(eventId, { id: participant.id, name: participant.name })
                  // Remove from unassigned if it was there
                  if (unassignedParticipant) {
                    actions.removeUnassignedParticipant(participantId)
                  }
                }
              })
            }}
            onNavigateToEvent={(eventId) => {
              actions.setLastViewedEvent(eventId)
              setView('eventOverview')
            }}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onUpdateGroup={(groupId, updates) => {
              actions.updateGroup(groupId, updates)
            }}
          />
        )}

        {activeView === 'editor' && selectedEvent ? (
          <ExpenseEditor
            participants={eventParticipants}
            currency={selectedEvent.currency}
            onCancel={() => {
              setView('eventOverview')
              setEditingExpenseId(null)
            }}
            onSave={handleSaveExpense}
            initialExpense={editingExpense ?? undefined}
          />
        ) : null}

        {activeView === 'eventSummary' && selectedEvent ? (
          <Summary
            eventName={selectedEvent.name}
            dateRange={eventDateRange}
            location={selectedEvent.location}
            totals={summary.totals}
            balances={summary.balances}
            settlements={summary.settlements}
            onBack={() => setView('eventOverview')}
            currency={selectedEvent.currency}
            onSettlementClick={handleSettlementClick}
            expenseCount={selectedEvent.expenses.length}
            onNavigateToOverview={() => setView('eventOverview')}
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

      {editingParticipantId && (
        <ParticipantEditModal
          isOpen={Boolean(editingParticipantId)}
          onClose={handleCloseParticipantEditModal}
          onSave={handleSaveParticipant}
          currentName={
            editingParticipantEventId
              ? events
                  .find((e) => e.id === editingParticipantEventId)
                  ?.participants.find((p) => p.id === editingParticipantId)?.name ??
                state.unassignedParticipants.find((p) => p.id === editingParticipantId)?.name ??
                ''
              : state.unassignedParticipants.find((p) => p.id === editingParticipantId)?.name ?? ''
          }
          currentId={
            editingParticipantEventId
              ? events
                  .find((e) => e.id === editingParticipantEventId)
                  ?.participants.find((p) => p.id === editingParticipantId)?.id ??
                state.unassignedParticipants.find((p) => p.id === editingParticipantId)?.id
              : state.unassignedParticipants.find((p) => p.id === editingParticipantId)?.id
          }
          allowIdEdit={view === 'participants'}
          idError={participantIdError}
        />
      )}

      {isEditingEventName && selectedEvent && (
        <EventNameEditModal
          isOpen={isEditingEventName}
          onClose={handleCloseEventNameEditModal}
          onSave={handleSaveEventName}
          currentName={selectedEvent.name}
        />
      )}
    </div>
  )
}

export default App
