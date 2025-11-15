import { useCallback, useEffect, useReducer, useRef } from 'react'
import type {
  Event,
  EventId,
  Expense,
  ExpenseId,
  Participant,
  ParticipantId,
  ParticipantGroup,
  PayerAllocation,
  SettlementTracking,
  SplitInstruction,
  SplitState,
  SplitStrategy,
} from '../types/domain'

const STORAGE_KEY = 'split-expense::state'
const CURRENT_VERSION = 3

type EventMetaUpdates = Partial<Pick<Event, 'name' | 'description' | 'location' | 'startDate' | 'endDate' | 'currency' | 'archived'>>

type ParticipantDraft = {
  id?: ParticipantId
  name: string
  color?: string
  archived?: boolean
}

type ExpenseDraft = {
  id?: ExpenseId
  description: string
  amount: number
  currency?: string
  category?: string
  notes?: string
  paidBy: PayerAllocation[]
  split: SplitInstruction
  createdAt?: string
  updatedAt?: string
}

type EventDraft = {
  name: string
  description?: string
  location?: string
  startDate?: string
  endDate?: string
  currency?: string
  participants?: ParticipantDraft[]
}

type GroupDraft = {
  id?: string
  name: string
  participantIds: ParticipantId[]
}

type Action =
  | { type: 'replace'; state: SplitState }
  | { type: 'create-event'; event: Event }
  | { type: 'update-event'; eventId: EventId; updates: EventMetaUpdates }
  | { type: 'delete-event'; eventId: EventId }
  | { type: 'set-last-viewed'; eventId?: EventId }
  | { type: 'upsert-participant'; eventId: EventId; participant: Participant }
  | { type: 'remove-participant'; eventId: EventId; participantId: ParticipantId }
  | { type: 'upsert-expense'; eventId: EventId; expense: Expense }
  | { type: 'remove-expense'; eventId: EventId; expenseId: ExpenseId }
  | { type: 'add-settlement-payment'; eventId: EventId; fromId: ParticipantId; toId: ParticipantId; amount: number; settlementAmount: number }
  | { type: 'remove-settlement-payment'; eventId: EventId; fromId: ParticipantId; toId: ParticipantId; paymentId: string; settlementAmount: number }
  | { type: 'mark-settlement-complete'; eventId: EventId; fromId: ParticipantId; toId: ParticipantId; complete: boolean }
  | { type: 'create-group'; group: ParticipantGroup }
  | { type: 'update-group'; groupId: string; updates: Partial<Pick<ParticipantGroup, 'name' | 'participantIds'>> }
  | { type: 'delete-group'; groupId: string }
  | { type: 'update-participant-id'; eventId: EventId; participantId: ParticipantId; newId: ParticipantId }
  | { type: 'create-unassigned-participant'; participant: Participant }
  | { type: 'remove-unassigned-participant'; participantId: ParticipantId }
  | { type: 'delete-participant-completely'; participantId: ParticipantId }

function createId(prefix: string) {
  const random = cryptoRandomId()
  return `${prefix}_${random}`
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().split('-')[0]
  }
  return Math.random().toString(36).slice(2, 10)
}

function generateParticipantId(name: string): string {
  const baseId = name.toLowerCase().replace(/\s+/g, '')
  const randomString = cryptoRandomId()
  return `${baseId}${randomString}`
}

function nowIso() {
  return new Date().toISOString()
}

function normalisePayers(amount: number, payers: PayerAllocation[]): PayerAllocation[] {
  if (payers.length === 0) {
    throw new Error('At least one payer is required.')
  }

  const total = payers.reduce((sum, allocation) => sum + allocation.amount, 0)
  const roundedTotal = Number(total.toFixed(2))
  const roundedAmount = Number(amount.toFixed(2))
  const difference = Number((roundedAmount - roundedTotal).toFixed(2))

  if (Math.abs(difference) > 0.01) {
    const [first, ...rest] = payers
    return [{ ...first, amount: Number((first.amount + difference).toFixed(2)) }, ...rest]
  }

  return payers
}

function normaliseSplit(amount: number, split: SplitInstruction): SplitInstruction {
  if (split.type === 'even') {
    const participants = Array.from(new Set(split.participantIds))
    return { type: 'even', participantIds: participants }
  }

  if (split.type === 'shares') {
    const shares = split.shares.filter((entry) => entry.weight > 0)
    const totalWeight = shares.reduce((sum, entry) => sum + entry.weight, 0)
    if (shares.length === 0 || totalWeight <= 0) {
      const participantIds = split.shares.map((entry) => entry.participantId)
      return { type: 'even', participantIds }
    }
    return {
      type: 'shares',
      shares: shares.map((entry) => ({
        participantId: entry.participantId,
        weight: entry.weight,
      })),
    }
  }

  if (split.type === 'exact') {
    const total = split.allocations.reduce((sum, entry) => sum + entry.amount, 0)
    const difference = Number((amount - total).toFixed(2))
    if (Math.abs(difference) > 0.01 && split.allocations.length > 0) {
      const [first, ...rest] = split.allocations
      return {
        type: 'exact',
        allocations: [{ ...first, amount: Number((first.amount + difference).toFixed(2)) }, ...rest],
      }
    }
    return {
      type: 'exact',
      allocations: split.allocations.map((entry) => ({
        participantId: entry.participantId,
        amount: Number(entry.amount.toFixed(2)),
      })),
    }
  }

  return split
}

function removeParticipantFromSplit(split: SplitInstruction, participantId: ParticipantId): SplitInstruction {
  if (split.type === 'even') {
    return {
      type: 'even',
      participantIds: split.participantIds.filter((id) => id !== participantId),
    }
  }
  if (split.type === 'shares') {
    return {
      type: 'shares',
      shares: split.shares.filter((share) => share.participantId !== participantId),
    }
  }
  return {
    type: 'exact',
    allocations: split.allocations.filter((allocation) => allocation.participantId !== participantId),
  }
}

function createParticipant(draft: ParticipantDraft): Participant {
  const timestamp = nowIso()
  return {
    id: draft.id ?? generateParticipantId(draft.name),
    name: draft.name.trim(),
    color: draft.color,
    createdAt: timestamp,
    updatedAt: timestamp,
    archived: draft.archived ?? false,
  }
}

function updateParticipantEntity(current: Participant, updates: ParticipantDraft): Participant {
  return {
    ...current,
    name: updates.name ?? current.name,
    color: updates.color ?? current.color,
    archived: updates.archived ?? current.archived,
    updatedAt: nowIso(),
  }
}

function createExpense(eventCurrency: string, draft: ExpenseDraft): Expense {
  const timestamp = nowIso()
  const currency = draft.currency ?? eventCurrency
  const amount = Number(draft.amount.toFixed(2))
  return {
    id: draft.id ?? createId('expense'),
    description: draft.description.trim(),
    amount,
    currency,
    category: draft.category,
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: draft.updatedAt ?? timestamp,
    notes: draft.notes,
    paidBy: normalisePayers(amount, draft.paidBy),
    split: normaliseSplit(amount, draft.split),
  }
}

function updateExpenseEntity(eventCurrency: string, current: Expense, updates: Partial<ExpenseDraft>): Expense {
  const currency = updates.currency ?? current.currency ?? eventCurrency
  const amount = updates.amount !== undefined ? Number(updates.amount.toFixed(2)) : current.amount
  return {
    ...current,
    description: updates.description?.trim() ?? current.description,
    amount,
    currency,
    category: updates.category ?? current.category,
    notes: updates.notes ?? current.notes,
    updatedAt: nowIso(),
    paidBy: updates.paidBy ? normalisePayers(amount, updates.paidBy) : current.paidBy,
    split: updates.split ? normaliseSplit(amount, updates.split) : current.split,
  }
}

function createEventEntity(draft: EventDraft): Event {
  const timestamp = nowIso()
  const currency = draft.currency ?? 'USD'
  const participantEntities = (draft.participants ?? []).map((participant) => createParticipant(participant))

  return {
    id: createId('event'),
    name: draft.name.trim(),
    description: draft.description,
    location: draft.location,
    startDate: draft.startDate,
    endDate: draft.endDate,
    currency,
    createdAt: timestamp,
    updatedAt: timestamp,
    archived: false,
    participants: participantEntities,
    expenses: [],
  }
}

function ensureEventUpdated(event: Event): Event {
  return { ...event, updatedAt: nowIso() }
}

function createGroupEntity(draft: GroupDraft): ParticipantGroup {
  const timestamp = nowIso()
  return {
    id: draft.id ?? createId('group'),
    name: draft.name.trim(),
    participantIds: draft.participantIds,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function ensureGroupUpdated(group: ParticipantGroup): ParticipantGroup {
  return { ...group, updatedAt: nowIso() }
}

function getOrCreateSettlementTracking(
  event: Event,
  fromId: ParticipantId,
  toId: ParticipantId,
): SettlementTracking {
  const tracking = event.settlementTracking?.find(
    (t) => t.fromParticipantId === fromId && t.toParticipantId === toId,
  )
  if (tracking) {
    return tracking
  }
  return {
    fromParticipantId: fromId,
    toParticipantId: toId,
    payments: [],
    markedComplete: false,
  }
}

function updateSettlementTracking(
  event: Event,
  fromId: ParticipantId,
  toId: ParticipantId,
  updater: (tracking: SettlementTracking) => SettlementTracking,
): Event {
  const currentTracking = event.settlementTracking ?? []
  const existingIndex = currentTracking.findIndex(
    (t) => t.fromParticipantId === fromId && t.toParticipantId === toId,
  )

  let updatedTracking: SettlementTracking[]
  if (existingIndex >= 0) {
    updatedTracking = currentTracking.map((t, idx) =>
      idx === existingIndex ? updater(t) : t,
    )
  } else {
    const newTracking = updater(getOrCreateSettlementTracking(event, fromId, toId))
    updatedTracking = [...currentTracking, newTracking]
  }

  return ensureEventUpdated({
    ...event,
    settlementTracking: updatedTracking,
  })
}

function reducer(state: SplitState, action: Action): SplitState {
  switch (action.type) {
    case 'replace':
      return action.state
    case 'create-event': {
      const events = [...state.events, action.event]
      return {
        ...state,
        events,
        lastViewedEventId: action.event.id,
      }
    }
    case 'update-event': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        return ensureEventUpdated({
          ...event,
          ...action.updates,
        })
      })
      return { ...state, events }
    }
    case 'delete-event': {
      const events = state.events.filter((event) => event.id !== action.eventId)
      const lastViewedEventId =
        state.lastViewedEventId === action.eventId ? events.at(-1)?.id : state.lastViewedEventId
      return { ...state, events, lastViewedEventId }
    }
    case 'set-last-viewed':
      return { ...state, lastViewedEventId: action.eventId }
    case 'upsert-participant': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        const index = event.participants.findIndex((participant) => participant.id === action.participant.id)
        const participants =
          index === -1
            ? [...event.participants, action.participant]
            : event.participants.map((participant, idx) =>
                idx === index ? action.participant : participant,
              )
        return ensureEventUpdated({
          ...event,
          participants,
        })
      })
      return { ...state, events }
    }
    case 'remove-participant': {
      let removedParticipant: Participant | null = null
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        const participants = event.participants.filter((participant) => {
          if (participant.id === action.participantId) {
            removedParticipant = participant
            return false
          }
          return true
        })
        const expenses = event.expenses.map((expense) => ({
          ...expense,
          paidBy: expense.paidBy.filter((payer) => payer.participantId !== action.participantId),
          split: removeParticipantFromSplit(expense.split, action.participantId),
        }))
        return ensureEventUpdated({
          ...event,
          participants,
          expenses,
        })
      })

      let unassignedParticipants = state.unassignedParticipants
      if (removedParticipant) {
        const stillInEvents = events.some((event) =>
          event.participants.some((participant) => participant.id === removedParticipant!.id),
        )
        const alreadyUnassigned = unassignedParticipants.some(
          (participant) => participant.id === removedParticipant!.id,
        )
        if (!stillInEvents && !alreadyUnassigned) {
          unassignedParticipants = [...unassignedParticipants, removedParticipant]
        }
      }

      return { ...state, events, unassignedParticipants }
    }
    case 'upsert-expense': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        const index = event.expenses.findIndex((expense) => expense.id === action.expense.id)
        const expenses =
          index === -1
            ? [...event.expenses, action.expense]
            : event.expenses.map((expense, idx) => (idx === index ? action.expense : expense))
        return ensureEventUpdated({
          ...event,
          expenses,
          settlementTracking: [], // Clear settlement tracking when expenses change
        })
      })
      return { ...state, events }
    }
    case 'remove-expense': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        const expenses = event.expenses.filter((expense) => expense.id !== action.expenseId)
        return ensureEventUpdated({
          ...event,
          expenses,
          settlementTracking: [], // Clear settlement tracking when expenses change
        })
      })
      return { ...state, events }
    }
    case 'add-settlement-payment': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        return updateSettlementTracking(event, action.fromId, action.toId, (tracking) => {
          const newPayments = [
            ...tracking.payments,
            {
              id: createId('payment'),
              amount: Number(action.amount.toFixed(2)),
              paidAt: nowIso(),
            },
          ]
          const totalPaid = newPayments.reduce((sum, p) => sum + p.amount, 0)
          const isComplete = totalPaid >= action.settlementAmount - 0.01 // Allow small floating point differences
          return {
            ...tracking,
            payments: newPayments,
            markedComplete: isComplete,
            markedCompleteAt: isComplete && !tracking.markedComplete ? nowIso() : tracking.markedCompleteAt,
          }
        })
      })
      return { ...state, events }
    }
    case 'remove-settlement-payment': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        return updateSettlementTracking(event, action.fromId, action.toId, (tracking) => {
          const newPayments = tracking.payments.filter((p) => p.id !== action.paymentId)
          const totalPaid = newPayments.reduce((sum, p) => sum + p.amount, 0)
          const isComplete = totalPaid >= action.settlementAmount - 0.01 // Allow small floating point differences
          return {
            ...tracking,
            payments: newPayments,
            markedComplete: isComplete,
            markedCompleteAt: isComplete ? tracking.markedCompleteAt : undefined,
          }
        })
      })
      return { ...state, events }
    }
    case 'mark-settlement-complete': {
      const events = state.events.map((event) => {
        if (event.id !== action.eventId) return event
        return updateSettlementTracking(event, action.fromId, action.toId, (tracking) => ({
          ...tracking,
          markedComplete: action.complete,
          markedCompleteAt: action.complete ? nowIso() : undefined,
        }))
      })
      return { ...state, events }
    }
    case 'create-group': {
      const groups = [...state.groups, action.group]
      return { ...state, groups }
    }
    case 'update-group': {
      const groups = state.groups.map((group) => {
        if (group.id !== action.groupId) return group
        return ensureGroupUpdated({
          ...group,
          ...action.updates,
        })
      })
      return { ...state, groups }
    }
    case 'delete-group': {
      const groups = state.groups.filter((group) => group.id !== action.groupId)
      return { ...state, groups }
    }
    case 'update-participant-id': {
      // Update participant ID across all events and groups
      const events = state.events.map((event) => {
        const participantIndex = event.participants.findIndex((p) => p.id === action.participantId)
        if (participantIndex === -1) return event

        const updatedParticipants = event.participants.map((p) =>
          p.id === action.participantId ? { ...p, id: action.newId } : p,
        )

        const updatedExpenses = event.expenses.map((expense) => {
          const updatedPaidBy = expense.paidBy.map((payer) =>
            payer.participantId === action.participantId ? { ...payer, participantId: action.newId } : payer,
          )

          let updatedSplit = expense.split
          if (expense.split.type === 'even') {
            updatedSplit = {
              ...expense.split,
              participantIds: expense.split.participantIds.map((id) => (id === action.participantId ? action.newId : id)),
            }
          } else if (expense.split.type === 'shares') {
            updatedSplit = {
              ...expense.split,
              shares: expense.split.shares.map((share) =>
                share.participantId === action.participantId ? { ...share, participantId: action.newId } : share,
              ),
            }
          } else if (expense.split.type === 'exact') {
            updatedSplit = {
              ...expense.split,
              allocations: expense.split.allocations.map((allocation) =>
                allocation.participantId === action.participantId ? { ...allocation, participantId: action.newId } : allocation,
              ),
            }
          }

          return {
            ...expense,
            paidBy: updatedPaidBy,
            split: updatedSplit,
          }
        })

        const updatedSettlementTracking = event.settlementTracking?.map((tracking) => ({
          ...tracking,
          fromParticipantId: tracking.fromParticipantId === action.participantId ? action.newId : tracking.fromParticipantId,
          toParticipantId: tracking.toParticipantId === action.participantId ? action.newId : tracking.toParticipantId,
        }))

        return ensureEventUpdated({
          ...event,
          participants: updatedParticipants,
          expenses: updatedExpenses,
          settlementTracking: updatedSettlementTracking,
        })
      })

      const groups = state.groups.map((group) => ({
        ...group,
        participantIds: group.participantIds.map((id) => (id === action.participantId ? action.newId : id)),
      }))

      return { ...state, events, groups }
    }
    case 'create-unassigned-participant': {
      const unassignedParticipants = [...state.unassignedParticipants, action.participant]
      return { ...state, unassignedParticipants }
    }
    case 'remove-unassigned-participant': {
      const unassignedParticipants = state.unassignedParticipants.filter((p) => p.id !== action.participantId)
      return { ...state, unassignedParticipants }
    }
    case 'delete-participant-completely': {
      // Remove from all events
      const events = state.events.map((event) => {
        const participantIndex = event.participants.findIndex((p) => p.id === action.participantId)
        if (participantIndex === -1) return event

        const participants = event.participants.filter((p) => p.id !== action.participantId)
        const expenses = event.expenses.map((expense) => ({
          ...expense,
          paidBy: expense.paidBy.filter((payer) => payer.participantId !== action.participantId),
          split: removeParticipantFromSplit(expense.split, action.participantId),
        }))
        return ensureEventUpdated({
          ...event,
          participants,
          expenses,
        })
      })

      // Remove from unassigned participants
      const unassignedParticipants = state.unassignedParticipants.filter((p) => p.id !== action.participantId)

      // Remove from groups (remove participant ID from all groups)
      const groups = state.groups.map((group) => ({
        ...group,
        participantIds: group.participantIds.filter((id) => id !== action.participantId),
      })).filter((group) => group.participantIds.length > 0) // Remove empty groups

      return { ...state, events, unassignedParticipants, groups }
    }
    default:
      return state
  }
}

function safeParseState(raw: string | null): SplitState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SplitState>
    if (typeof parsed !== 'object' || parsed === null) return null
    if (typeof parsed.version !== 'number') return null
    if (!Array.isArray(parsed.events)) return null
    return migrateToLatest(parsed)
  } catch {
    return null
  }
}

function migrateToLatest(state: Partial<SplitState>): SplitState {
  if (!state.version || state.version < 1) {
    return createDemoState()
  }

  const events = (state.events ?? []).map((event) => ({
    ...event,
    participants: (event.participants ?? []).map((participant) => ({
      ...participant,
      archived: participant.archived ?? false,
    })),
    expenses: (event.expenses ?? []).map((expense) => ({
      ...expense,
      paidBy: (expense.paidBy ?? []).map((payer) => ({
        participantId: payer.participantId,
        amount: Number(payer.amount ?? 0),
      })),
    })),
    settlementTracking: (event.settlementTracking ?? []).map((tracking) => ({
      ...tracking,
      payments: (tracking.payments ?? []).map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount ?? 0),
        paidAt: payment.paidAt,
      })),
      markedComplete: tracking.markedComplete ?? false,
    })),
  }))

  // Migrate from version 1 to 2: add groups array
  const groups = state.version === 1 ? [] : (state.groups ?? [])
  
  // Migrate from version 2 to 3: add unassignedParticipants array
  const unassignedParticipants = state.version < 3 ? [] : (state.unassignedParticipants ?? [])

  return {
    version: CURRENT_VERSION,
    lastViewedEventId: state.lastViewedEventId,
    events,
    groups,
    unassignedParticipants,
  }
}

function loadState(): SplitState | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  return safeParseState(raw)
}

function persistState(state: SplitState) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function createDemoState(): SplitState {
  return {
    version: CURRENT_VERSION,
    lastViewedEventId: undefined,
    events: [],
    groups: [],
    unassignedParticipants: [],
  }
}

function initState(): SplitState {
  return loadState() ?? createDemoState()
}

export function useLocalStore() {
  const [state, dispatch] = useReducer(reducer, undefined, initState)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
    persistState(state)
  }, [state])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return
      const nextState = safeParseState(event.newValue)
      if (!nextState) return
      const currentSerialized = JSON.stringify(stateRef.current)
      const incomingSerialized = JSON.stringify(nextState)
      if (currentSerialized === incomingSerialized) return
      dispatch({ type: 'replace', state: nextState })
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setLastViewedEvent = useCallback((eventId?: EventId) => {
    dispatch({ type: 'set-last-viewed', eventId })
  }, [])

  const createEvent = useCallback((draft: EventDraft) => {
    const event = createEventEntity(draft)
    dispatch({ type: 'create-event', event })
    return event
  }, [])

  const updateEventMeta = useCallback((eventId: EventId, updates: EventMetaUpdates) => {
    dispatch({ type: 'update-event', eventId, updates })
  }, [])

  const deleteEvent = useCallback((eventId: EventId) => {
    dispatch({ type: 'delete-event', eventId })
  }, [])

  const upsertParticipant = useCallback((eventId: EventId, draft: ParticipantDraft) => {
    const event = stateRef.current.events.find((item) => item.id === eventId)
    if (!event) {
      throw new Error('Event not found.')
    }

    const existing = draft.id ? event.participants.find((participant) => participant.id === draft.id) : undefined
    const participant = existing ? updateParticipantEntity(existing, draft) : createParticipant(draft)
    dispatch({ type: 'upsert-participant', eventId, participant })
    return participant
  }, [])

  const removeParticipant = useCallback((eventId: EventId, participantId: ParticipantId) => {
    dispatch({ type: 'remove-participant', eventId, participantId })
  }, [])

  const upsertExpense = useCallback((eventId: EventId, draft: ExpenseDraft) => {
    const event = stateRef.current.events.find((item) => item.id === eventId)
    if (!event) {
      throw new Error('Event not found.')
    }

    const existing = draft.id ? event.expenses.find((expense) => expense.id === draft.id) : undefined
    const expense = existing ? updateExpenseEntity(event.currency, existing, draft) : createExpense(event.currency, draft)
    dispatch({ type: 'upsert-expense', eventId, expense })
    return expense
  }, [])

  const removeExpense = useCallback((eventId: EventId, expenseId: ExpenseId) => {
    dispatch({ type: 'remove-expense', eventId, expenseId })
  }, [])

  const addSettlementPayment = useCallback(
    (eventId: EventId, fromId: ParticipantId, toId: ParticipantId, amount: number, settlementAmount: number) => {
      dispatch({ type: 'add-settlement-payment', eventId, fromId, toId, amount, settlementAmount })
    },
    [],
  )

  const removeSettlementPayment = useCallback(
    (eventId: EventId, fromId: ParticipantId, toId: ParticipantId, paymentId: string, settlementAmount: number) => {
      dispatch({ type: 'remove-settlement-payment', eventId, fromId, toId, paymentId, settlementAmount })
    },
    [],
  )

  const markSettlementComplete = useCallback(
    (eventId: EventId, fromId: ParticipantId, toId: ParticipantId, complete: boolean) => {
      dispatch({ type: 'mark-settlement-complete', eventId, fromId, toId, complete })
    },
    [],
  )

  const replaceState = useCallback((nextState: SplitState) => {
    dispatch({ type: 'replace', state: migrateToLatest(nextState) })
  }, [])

  const resetToDemo = useCallback(() => {
    dispatch({ type: 'replace', state: createDemoState() })
  }, [])

  const createGroup = useCallback((draft: GroupDraft) => {
    const group = createGroupEntity(draft)
    dispatch({ type: 'create-group', group })
    return group
  }, [])

  const updateGroup = useCallback((groupId: string, updates: Partial<Pick<ParticipantGroup, 'name' | 'participantIds'>>) => {
    dispatch({ type: 'update-group', groupId, updates })
  }, [])

  const deleteGroup = useCallback((groupId: string) => {
    dispatch({ type: 'delete-group', groupId })
  }, [])

  const updateParticipantId = useCallback((eventId: EventId, participantId: ParticipantId, newId: ParticipantId) => {
    // Validate ID uniqueness across all events and unassigned participants
    const allParticipantIds = new Set<string>()
    stateRef.current.events.forEach((event) => {
      event.participants.forEach((p) => {
        if (p.id !== participantId) {
          allParticipantIds.add(p.id)
        }
      })
    })
    stateRef.current.unassignedParticipants.forEach((p) => {
      if (p.id !== participantId) {
        allParticipantIds.add(p.id)
      }
    })
    if (allParticipantIds.has(newId)) {
      throw new Error('Participant ID already exists')
    }
    dispatch({ type: 'update-participant-id', eventId, participantId, newId })
  }, [])

  const createUnassignedParticipant = useCallback((draft: ParticipantDraft) => {
    const participant = createParticipant(draft)
    dispatch({ type: 'create-unassigned-participant', participant })
    return participant
  }, [])

  const removeUnassignedParticipant = useCallback((participantId: ParticipantId) => {
    dispatch({ type: 'remove-unassigned-participant', participantId })
  }, [])

  const deleteParticipantCompletely = useCallback((participantId: ParticipantId) => {
    dispatch({ type: 'delete-participant-completely', participantId })
  }, [])

  return {
    state,
    actions: {
      setLastViewedEvent,
      createEvent,
      updateEventMeta,
      deleteEvent,
      upsertParticipant,
      removeParticipant,
      upsertExpense,
      removeExpense,
      addSettlementPayment,
      removeSettlementPayment,
      markSettlementComplete,
      createGroup,
      updateGroup,
      deleteGroup,
      updateParticipantId,
      createUnassignedParticipant,
      removeUnassignedParticipant,
      deleteParticipantCompletely,
      replaceState,
      resetToDemo,
    },
  }
}

export type { EventDraft, ExpenseDraft, GroupDraft, ParticipantDraft, SplitStrategy }

