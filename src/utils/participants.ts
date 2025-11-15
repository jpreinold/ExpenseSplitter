import type { Event, Expense, Participant, ParticipantId } from '../types/domain'

/**
 * Generate a participant ID from a name
 * Format: lowercase name (no spaces) + random number
 */
export function generateParticipantId(name: string): string {
  const baseId = name.toLowerCase().replace(/\s+/g, '')
  const randomNum = Math.floor(Math.random() * 10000)
  return `${baseId}${randomNum}`
}

/**
 * Get all unique participants across all events
 */
export function getAllParticipants(events: Event[]): Participant[] {
  const participantMap = new Map<ParticipantId, Participant>()
  events.forEach((event) => {
    event.participants.forEach((participant) => {
      if (!participantMap.has(participant.id)) {
        participantMap.set(participant.id, participant)
      }
    })
  })
  return Array.from(participantMap.values())
}

/**
 * Get all events where a participant appears
 */
export function getParticipantEvents(participantId: ParticipantId, events: Event[]): Event[] {
  return events.filter((event) => event.participants.some((p) => p.id === participantId))
}

/**
 * Get all expenses where a participant appears (across all events)
 */
export function getParticipantExpenses(participantId: ParticipantId, events: Event[]): Expense[] {
  const expenses: Expense[] = []
  events.forEach((event) => {
    event.expenses.forEach((expense) => {
      // Check if participant is in paidBy
      if (expense.paidBy.some((payer) => payer.participantId === participantId)) {
        expenses.push(expense)
        return
      }
      // Check if participant is in split
      if (expense.split.type === 'even') {
        if (expense.split.participantIds.includes(participantId)) {
          expenses.push(expense)
          return
        }
      } else if (expense.split.type === 'shares') {
        if (expense.split.shares.some((share) => share.participantId === participantId)) {
          expenses.push(expense)
          return
        }
      } else if (expense.split.type === 'exact') {
        if (expense.split.allocations.some((allocation) => allocation.participantId === participantId)) {
          expenses.push(expense)
          return
        }
      }
    })
  })
  return expenses
}

/**
 * Validate that a participant ID is unique across all events
 */
export function validateParticipantId(id: string, existingIds: string[]): boolean {
  return !existingIds.includes(id)
}

