export type ParticipantId = string
export type ExpenseId = string
export type EventId = string

export interface Participant {
  id: ParticipantId
  name: string
  color?: string
  createdAt: string
  updatedAt: string
  archived?: boolean
}

export interface PayerAllocation {
  participantId: ParticipantId
  amount: number
}

export interface EvenSplit {
  type: 'even'
  participantIds: ParticipantId[]
}

export interface ShareSplit {
  type: 'shares'
  shares: Array<{
    participantId: ParticipantId
    weight: number
  }>
}

export interface ExactSplit {
  type: 'exact'
  allocations: Array<{
    participantId: ParticipantId
    amount: number
  }>
}

export type SplitInstruction = EvenSplit | ShareSplit | ExactSplit
export type SplitStrategy = SplitInstruction['type']

export interface ReceiptImageAttachment {
  id: string
  name: string
  dataUrl: string
  capturedAt: string
}

export interface ReceiptLineItem {
  id: string
  description: string
  amount: number
  assignedParticipantIds: ParticipantId[]
  confidence?: number
  sourceText?: string
}

export interface ReceiptMetadata {
  image: ReceiptImageAttachment
  items: ReceiptLineItem[]
  subtotal?: number
  tax?: number
  tip?: number
  total?: number
  currency?: string
  rawText?: string
  ocrProvider?: string
}

export interface Expense {
  id: ExpenseId
  description: string
  amount: number
  currency: string
  category?: string
  createdAt: string
  updatedAt: string
  notes?: string
  paidBy: PayerAllocation[]
  split: SplitInstruction
  receipt?: ReceiptMetadata
}

export interface Event {
  id: EventId
  name: string
  description?: string
  location?: string
  startDate?: string
  endDate?: string
  currency: string
  createdAt: string
  updatedAt: string
  archived?: boolean
  participants: Participant[]
  expenses: Expense[]
  settlementTracking?: SettlementTracking[]
}

export interface SettlementPayment {
  id: string
  amount: number
  paidAt: string
}

export interface SettlementTracking {
  fromParticipantId: ParticipantId
  toParticipantId: ParticipantId
  payments: SettlementPayment[]
  markedComplete: boolean
  markedCompleteAt?: string
}

export interface ParticipantGroup {
  id: string
  name: string
  participantIds: ParticipantId[]
  createdAt: string
  updatedAt: string
}

export interface SplitState {
  version: number
  lastViewedEventId?: EventId
  events: Event[]
  groups: ParticipantGroup[]
  unassignedParticipants: Participant[]
}

