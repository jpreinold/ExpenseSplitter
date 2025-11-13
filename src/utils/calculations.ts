import type {
  Event,
  Expense,
  Participant,
  ParticipantId,
  SplitInstruction,
} from '../types/domain'

const CENT_FACTOR = 100

type ShareCents = {
  participantId: ParticipantId
  cents: number
}

export interface ExpenseShare {
  participantId: ParticipantId
  amount: number
}

export interface ParticipantBalance {
  participantId: ParticipantId
  paid: number
  owes: number
  net: number
}

export interface Settlement {
  from: ParticipantId
  to: ParticipantId
  amount: number
}

export interface EventBalanceSummary {
  totals: {
    participants: number
    expenses: number
  }
  balances: ParticipantBalance[]
}

const toCents = (value: number) => Math.round(value * CENT_FACTOR)
const fromCents = (value: number) => Number((value / CENT_FACTOR).toFixed(2))

function distributeEven(totalCents: number, participantIds: ParticipantId[]): ShareCents[] {
  const count = participantIds.length || 1
  const base = Math.floor(totalCents / count)
  let remainder = totalCents - base * count

  return participantIds.map((participantId) => {
    const cents = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) {
      remainder -= 1
    }
    return { participantId, cents }
  })
}

function distributeShares(totalCents: number, split: Extract<SplitInstruction, { type: 'shares' }>): ShareCents[] {
  const positiveShares = split.shares.filter((share) => share.weight > 0)
  if (positiveShares.length === 0) {
    return distributeEven(totalCents, split.shares.map((share) => share.participantId))
  }

  const totalWeight = positiveShares.reduce((sum, share) => sum + share.weight, 0)
  const raw = positiveShares.map((share) => ({
    participantId: share.participantId,
    exact: (share.weight / totalWeight) * totalCents,
  }))

  const floored = raw.map((entry) => ({
    participantId: entry.participantId,
    cents: Math.floor(entry.exact),
    fraction: entry.exact - Math.floor(entry.exact),
  }))

  const allocated = floored.reduce((sum, entry) => sum + entry.cents, 0)
  let remainder = totalCents - allocated

  const sorted = floored
    .slice()
    .sort((a, b) => b.fraction - a.fraction)
    .map((entry) => ({ participantId: entry.participantId, cents: entry.cents }))

  for (let index = 0; index < sorted.length && remainder > 0; index += 1) {
    sorted[index].cents += 1
    remainder -= 1
  }

  return sorted
}

function distributeExact(totalCents: number, split: Extract<SplitInstruction, { type: 'exact' }>): ShareCents[] {
  const allocations = split.allocations.map((entry) => ({
    participantId: entry.participantId,
    cents: toCents(entry.amount),
  }))
  const allocated = allocations.reduce((sum, entry) => sum + entry.cents, 0)
  const difference = totalCents - allocated

  if (difference !== 0 && allocations.length > 0) {
    allocations[0] = {
      ...allocations[0],
      cents: allocations[0].cents + difference,
    }
  }

  return allocations
}

export function calculateExpenseShares(expense: Expense): ExpenseShare[] {
  const totalCents = toCents(expense.amount)

  let shares: ShareCents[]
  if (expense.split.type === 'even') {
    shares = distributeEven(totalCents, expense.split.participantIds)
  } else if (expense.split.type === 'shares') {
    shares = distributeShares(totalCents, expense.split)
  } else {
    shares = distributeExact(totalCents, expense.split)
  }

  return shares.map((entry) => ({
    participantId: entry.participantId,
    amount: fromCents(entry.cents),
  }))
}

export function calculateEventBalances(event: Event): EventBalanceSummary {
  const balances = new Map<ParticipantId, ParticipantBalance>()

  event.participants.forEach((participant) => {
    balances.set(participant.id, {
      participantId: participant.id,
      paid: 0,
      owes: 0,
      net: 0,
    })
  })

  let totalExpenses = 0

  event.expenses.forEach((expense) => {
    totalExpenses += expense.amount
    expense.paidBy.forEach((allocation) => {
      const entry = balances.get(allocation.participantId)
      if (entry) {
        entry.paid = Number((entry.paid + allocation.amount).toFixed(2))
      }
    })

    const shares = calculateExpenseShares(expense)
    shares.forEach((share) => {
      const entry = balances.get(share.participantId)
      if (entry) {
        entry.owes = Number((entry.owes + share.amount).toFixed(2))
      }
    })
  })

  const balanceList = Array.from(balances.values()).map((entry) => ({
    participantId: entry.participantId,
    paid: Number(entry.paid.toFixed(2)),
    owes: Number(entry.owes.toFixed(2)),
    net: Number((entry.paid - entry.owes).toFixed(2)),
  }))

  return {
    totals: {
      participants: event.participants.length,
      expenses: Number(totalExpenses.toFixed(2)),
    },
    balances: balanceList,
  }
}

export function suggestSettlements(balances: ParticipantBalance[], tolerance = 0.01): Settlement[] {
  const creditors = balances
    .filter((balance) => balance.net > tolerance)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => b.net - a.net)
  const debtors = balances
    .filter((balance) => balance.net < -tolerance)
    .map((balance) => ({ ...balance }))
    .sort((a, b) => a.net - b.net)

  const settlements: Settlement[] = []

  let creditorIndex = 0
  let debtorIndex = 0

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]
    const amount = Math.min(creditor.net, Math.abs(debtor.net))

    settlements.push({
      from: debtor.participantId,
      to: creditor.participantId,
      amount: Number(amount.toFixed(2)),
    })

    creditor.net = Number((creditor.net - amount).toFixed(2))
    debtor.net = Number((debtor.net + amount).toFixed(2))

    if (creditor.net <= tolerance) {
      creditorIndex += 1
    }
    if (Math.abs(debtor.net) <= tolerance) {
      debtorIndex += 1
    }
  }

  return settlements
}

export function describeSplit(expense: Expense, participants: Map<ParticipantId, Participant>): string {
  const participantNames = (participantIds: ParticipantId[]) =>
    participantIds
      .map((id) => participants.get(id)?.name ?? 'Unknown')
      .filter(Boolean)
      .join(', ')

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: expense.currency,
  })

  switch (expense.split.type) {
    case 'even': {
      const names = participantNames(expense.split.participantIds)
      return `Even split · ${expense.split.participantIds.length} participants (${names})`
    }
    case 'shares': {
      const totalWeight = expense.split.shares.reduce((sum, share) => sum + share.weight, 0)
      const details = expense.split.shares
        .map((share) => {
          const name = participants.get(share.participantId)?.name ?? 'Unknown'
          const percentage = totalWeight > 0 ? ((share.weight / totalWeight) * 100).toFixed(0) : '0'
          return `${name} (${percentage}%)`
        })
        .join(', ')
      return `Weighted shares · ${expense.split.shares.length} participants (${details})`
    }
    case 'exact': {
      const details = expense.split.allocations
        .map((allocation) => {
          const name = participants.get(allocation.participantId)?.name ?? 'Unknown'
          return `${name} (${formatter.format(allocation.amount)})`
        })
        .join(', ')
      return `Exact amounts · ${expense.split.allocations.length} participants (${details})`
    }
    default:
      return 'Custom split'
  }
}

