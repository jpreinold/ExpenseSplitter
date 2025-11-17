import { describe, expect, test } from 'vitest'
import type { ReceiptLineItem } from '../../types/domain'
import { calculateReceiptAllocations } from '../receiptAllocation'

const baseItem = (override: Partial<ReceiptLineItem>): ReceiptLineItem => ({
  id: `item-${Math.random().toString(36).slice(2, 8)}`,
  description: 'Item',
  amount: 10,
  assignedParticipantIds: ['a'],
  ...override,
})

describe('calculateReceiptAllocations', () => {
  test('splits each line item evenly across assigned participants', () => {
    const items: ReceiptLineItem[] = [
      baseItem({ amount: 12, assignedParticipantIds: ['a', 'b'] }),
      baseItem({ amount: 9, assignedParticipantIds: ['b'] }),
    ]

    const summary = calculateReceiptAllocations(items)

    expect(summary.perParticipant.a).toBeCloseTo(6, 2)
    expect(summary.perParticipant.b).toBeCloseTo(15, 2)
    expect(summary.total).toBeCloseTo(21, 2)
    expect(summary.unassignedItemIds).toHaveLength(0)
  })

  test('flags items without assignments', () => {
    const items: ReceiptLineItem[] = [
      baseItem({ id: 'x', amount: 5, assignedParticipantIds: [] }),
      baseItem({ id: 'y', amount: 5, assignedParticipantIds: ['a'] }),
    ]

    const summary = calculateReceiptAllocations(items)

    expect(summary.unassignedItemIds).toEqual(['x'])
    expect(summary.perParticipant.a).toBeCloseTo(5, 2)
    expect(summary.total).toBeCloseTo(10, 2)
  })
})


