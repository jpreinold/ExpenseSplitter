import { describe, expect, test } from 'vitest'
import {
  calculateEventBalances,
  calculateExpenseShares,
  describeSplit,
  suggestSettlements,
} from '../calculations'
import type { Event, Expense, Participant } from '../../types/domain'

const now = new Date().toISOString()

const participants: Participant[] = [
  { id: 'a', name: 'Alex', createdAt: now, updatedAt: now },
  { id: 'b', name: 'Blair', createdAt: now, updatedAt: now },
  { id: 'c', name: 'Casey', createdAt: now, updatedAt: now },
  { id: 'd', name: 'Drew', createdAt: now, updatedAt: now },
]

const baseExpense: Omit<Expense, 'id'> = {
  description: 'Test expense',
  amount: 100,
  currency: 'USD',
  category: undefined,
  createdAt: now,
  updatedAt: now,
  notes: undefined,
  paidBy: [{ participantId: 'a', amount: 100 }],
  split: {
    type: 'even',
    participantIds: ['a', 'b', 'c', 'd'],
  },
}

const createExpense = (override: Partial<Expense>): Expense => ({
  id: `exp-${Math.random().toString(36).slice(2, 8)}`,
  ...baseExpense,
  ...override,
})

describe('calculateExpenseShares', () => {
  test('splits evenly across all participants', () => {
    const expense = createExpense({})
    const shares = calculateExpenseShares(expense)
    expect(shares).toHaveLength(4)
    shares.forEach((share) => {
      expect(share.amount).toBeCloseTo(25, 2)
    })
    const total = shares.reduce((sum, share) => sum + share.amount, 0)
    expect(total).toBeCloseTo(expense.amount, 2)
  })

  test('distributes by weights with remainder handled', () => {
    const expense = createExpense({
      amount: 75,
      split: {
        type: 'shares',
        shares: [
          { participantId: 'a', weight: 2 },
          { participantId: 'b', weight: 1 },
          { participantId: 'c', weight: 1 },
        ],
      },
    })
    const shares = calculateExpenseShares(expense)
    expect(shares).toEqual([
      { participantId: 'a', amount: 37.5 },
      { participantId: 'b', amount: 18.75 },
      { participantId: 'c', amount: 18.75 },
    ])
  })

  test('respects exact amounts and corrects rounding differences', () => {
    const expense = createExpense({
      amount: 120,
      split: {
        type: 'exact',
        allocations: [
          { participantId: 'a', amount: 40 },
          { participantId: 'b', amount: 40 },
          { participantId: 'c', amount: 39.99 },
        ],
      },
    })
    const shares = calculateExpenseShares(expense)
    const total = shares.reduce((sum, share) => sum + share.amount, 0)
    expect(total).toBeCloseTo(120, 2)
  })
})

describe('describeSplit', () => {
  test('describes even splits with participant names', () => {
    const expense = createExpense({})
    const map = new Map(participants.map((participant) => [participant.id, participant]))
    const summary = describeSplit(expense, map)
    expect(summary).toContain('Even split')
    expect(summary).toContain('Alex')
  })
})

describe('calculateEventBalances & suggestSettlements', () => {
  const event: Event = {
    id: 'event-1',
    name: 'Test event',
    createdAt: now,
    updatedAt: now,
    currency: 'USD',
    participants,
    expenses: [
      createExpense({
        id: 'exp-1',
        amount: 400,
        paidBy: [{ participantId: 'a', amount: 400 }],
        split: { type: 'even', participantIds: ['a', 'b', 'c', 'd'] },
      }),
      createExpense({
        id: 'exp-2',
        amount: 120,
        paidBy: [{ participantId: 'b', amount: 120 }],
        split: {
          type: 'shares',
          shares: [
            { participantId: 'a', weight: 1 },
            { participantId: 'b', weight: 1 },
            { participantId: 'c', weight: 1 },
          ],
        },
      }),
      createExpense({
        id: 'exp-3',
        amount: 90,
        paidBy: [{ participantId: 'c', amount: 90 }],
        split: {
          type: 'exact',
          allocations: [
            { participantId: 'a', amount: 20 },
            { participantId: 'b', amount: 20 },
            { participantId: 'c', amount: 25 },
            { participantId: 'd', amount: 25 },
          ],
        },
      }),
    ],
  }

  test('computes totals and balances per participant', () => {
    const summary = calculateEventBalances(event)
    expect(summary.totals.participants).toBe(4)
    expect(summary.totals.expenses).toBeCloseTo(610, 2)

    const alex = summary.balances.find((balance) => balance.participantId === 'a')
    expect(alex?.paid).toBeCloseTo(400, 2)
    expect(alex?.owes).toBeGreaterThan(0)
    expect(alex?.net).toBeGreaterThan(0)
  })

  test('suggests settlements that balance the group', () => {
    const { balances } = calculateEventBalances(event)
    const settlements = suggestSettlements(balances)
    expect(settlements.length).toBeGreaterThan(0)

    const netAfterSettlements = new Map(balances.map((balance) => [balance.participantId, balance.net]))
    settlements.forEach((settlement) => {
      netAfterSettlements.set(
        settlement.from,
        Number(((netAfterSettlements.get(settlement.from) ?? 0) + settlement.amount).toFixed(2)),
      )
      netAfterSettlements.set(
        settlement.to,
        Number(((netAfterSettlements.get(settlement.to) ?? 0) - settlement.amount).toFixed(2)),
      )
    })

    netAfterSettlements.forEach((value) => {
      expect(Math.abs(value)).toBeLessThan(0.02)
    })
  })
})

