import type {
  Event,
  Expense,
  Participant,
  ParticipantId,
  SettlementGroup,
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

function distributeReceipt(totalCents: number, split: Extract<SplitInstruction, { type: 'receipt' }>): ShareCents[] {
  const perParticipantCents: Record<ParticipantId, number> = {}

  split.items.forEach((item) => {
    const itemCents = toCents(item.amount)
    const participants = item.assignedParticipantIds ?? []
    if (participants.length === 0) return

    const base = Math.floor(itemCents / participants.length)
    let remainder = itemCents - base * participants.length

    participants.forEach((participantId) => {
      const cents = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder -= 1
      perParticipantCents[participantId] = (perParticipantCents[participantId] ?? 0) + cents
    })
  })

  if (split.distribution) {
    split.distribution.shares.forEach((share) => {
      perParticipantCents[share.participantId] =
        (perParticipantCents[share.participantId] ?? 0) + toCents(share.amount)
    })
  }

  const shares = Object.entries(perParticipantCents).map(([participantId, cents]) => ({
    participantId,
    cents,
  }))

  const allocated = shares.reduce((sum, entry) => sum + entry.cents, 0)
  const difference = totalCents - allocated
  if (difference !== 0 && shares.length > 0) {
    shares[0].cents += difference
  }

  return shares
}

export function calculateExpenseShares(expense: Expense): ExpenseShare[] {
  const totalCents = toCents(expense.amount)

  let shares: ShareCents[]
  if (expense.split.type === 'even') {
    shares = distributeEven(totalCents, expense.split.participantIds)
  } else if (expense.split.type === 'shares') {
    shares = distributeShares(totalCents, expense.split)
  } else if (expense.split.type === 'receipt') {
    shares = distributeReceipt(totalCents, expense.split)
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

/**
 * Settlement where from/to can be a group ID or participant ID.
 * Used when settlement groups are active.
 */
export interface GroupedSettlement extends Settlement {
  from: string
  to: string
}

export function suggestGroupedSettlements(
  balances: ParticipantBalance[],
  settlementGroups: SettlementGroup[],
  tolerance = 0.01,
): GroupedSettlement[] {
  if (settlementGroups.length === 0) {
    return suggestSettlements(balances, tolerance)
  }

  const participantToGroup = new Map<ParticipantId, string>()
  for (const group of settlementGroups) {
    for (const pid of group.participantIds) {
      participantToGroup.set(pid, group.id)
    }
  }

  const balanceByEntity = new Map<string, { participantId: string; paid: number; owes: number; net: number }>()

  for (const group of settlementGroups) {
    let paid = 0
    let owes = 0
    for (const pid of group.participantIds) {
      const bal = balances.find((b) => b.participantId === pid)
      if (bal) {
        paid += bal.paid
        owes += bal.owes
      }
    }
    const net = Number((paid - owes).toFixed(2))
    balanceByEntity.set(group.id, {
      participantId: group.id,
      paid,
      owes,
      net,
    })
  }

  for (const bal of balances) {
    if (participantToGroup.has(bal.participantId)) continue
    balanceByEntity.set(bal.participantId, {
      participantId: bal.participantId,
      paid: bal.paid,
      owes: bal.owes,
      net: bal.net,
    })
  }

  const mergedBalances = Array.from(balanceByEntity.values()).map((b) => ({
    participantId: b.participantId,
    paid: b.paid,
    owes: b.owes,
    net: b.net,
  }))

  return suggestSettlements(mergedBalances, tolerance) as GroupedSettlement[]
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

export interface ExpenseBreakdownItem {
  expenseId: string
  description: string
  totalAmount: number
  paidAmount: number
  owedAmount: number
  netAmount: number
}

export function getParticipantExpenseBreakdown(
  event: Event,
  participantId: ParticipantId,
): ExpenseBreakdownItem[] {
  const result: ExpenseBreakdownItem[] = []

  for (const expense of event.expenses) {
    const paidAmount =
      expense.paidBy
        .filter((a) => a.participantId === participantId)
        .reduce((sum, a) => sum + a.amount, 0) ?? 0

    const shares = calculateExpenseShares(expense)
    const share = shares.find((s) => s.participantId === participantId)
    const owedAmount = share?.amount ?? 0

    if (paidAmount === 0 && owedAmount === 0) continue

    const netAmount = Number((paidAmount - owedAmount).toFixed(2))
    result.push({
      expenseId: expense.id,
      description: expense.description,
      totalAmount: expense.amount,
      paidAmount,
      owedAmount,
      netAmount,
    })
  }

  return result
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
    case 'receipt': {
      const participantIds = new Set<ParticipantId>()
      expense.split.items.forEach((item) => {
        item.assignedParticipantIds.forEach((id) => participantIds.add(id))
      })
      const names = Array.from(participantIds)
        .map((id) => participants.get(id)?.name ?? 'Unknown')
        .filter(Boolean)
        .join(', ')
      return `Receipt split · ${expense.split.items.length} items (${names})`
    }
    default:
      return 'Custom split'
  }
}

