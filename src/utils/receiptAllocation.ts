import type { ParticipantId, ReceiptLineItem } from '../types/domain'

export interface ReceiptAllocationSummary {
  perParticipant: Record<ParticipantId, number>
  unassignedItemIds: string[]
  total: number
}

export function calculateReceiptAllocations(items: ReceiptLineItem[]): ReceiptAllocationSummary {
  const perParticipantCents: Record<ParticipantId, number> = {}
  const unassignedItemIds: string[] = []
  let totalCents = 0

  items.forEach((item) => {
    const itemCents = Math.round(item.amount * 100)
    totalCents += itemCents
    const participants = item.assignedParticipantIds ?? []
    if (participants.length === 0) {
      unassignedItemIds.push(item.id)
      return
    }

    const base = Math.floor(itemCents / participants.length)
    let remainder = itemCents - base * participants.length

    participants.forEach((participantId) => {
      const cents = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) {
        remainder -= 1
      }
      perParticipantCents[participantId] =
        (perParticipantCents[participantId] ?? 0) + cents
    })
  })

  const perParticipant = Object.entries(perParticipantCents).reduce<Record<ParticipantId, number>>(
    (accumulator, [participantId, cents]) => {
      accumulator[participantId] = Number((cents / 100).toFixed(2))
      return accumulator
    },
    {},
  )

  return {
    perParticipant,
    unassignedItemIds,
    total: Number((totalCents / 100).toFixed(2)),
  }
}


