import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ExpenseDraft, SplitStrategy } from '../state/useLocalStore'
import { calculateExpenseShares } from '../utils/calculations'
import type { ParticipantProfile } from './EventDetail'

type SplitMode = SplitStrategy

type SelectionMap = Record<string, boolean>
type WeightMap = Record<string, string>
type AmountMap = Record<string, string>

type ExpenseEditorProps = {
  participants: ParticipantProfile[]
  currency: string
  onCancel: () => void
  onSave: (draft: ExpenseDraft) => void
}

const splitModes: { value: SplitMode; label: string; helper: string }[] = [
  { value: 'even', label: 'Even split', helper: 'Split the cost evenly across selected people.' },
  {
    value: 'shares',
    label: 'Weighted shares',
    helper: 'Assign relative shares like “2 seats” or “half share” per person.',
  },
  {
    value: 'exact',
    label: 'Custom amounts',
    helper: 'Enter exact amounts owed per person (great for reimbursements).',
  },
]

function initializeSelection(participants: ParticipantProfile[]): SelectionMap {
  return participants.reduce<SelectionMap>((accumulator, participant) => {
    accumulator[participant.id] = true
    return accumulator
  }, {})
}

function initializeWeights(participants: ParticipantProfile[]): WeightMap {
  return participants.reduce<WeightMap>((accumulator, participant) => {
    accumulator[participant.id] = '1'
    return accumulator
  }, {})
}

function initializeAmounts(participants: ParticipantProfile[]): AmountMap {
  return participants.reduce<AmountMap>((accumulator, participant) => {
    accumulator[participant.id] = '0.00'
    return accumulator
  }, {})
}

function buildSplitInstruction(
  mode: SplitMode,
  participantIds: string[],
  weights: WeightMap,
  amounts: AmountMap,
): ExpenseDraft['split'] | null {
  if (participantIds.length === 0) return null

  if (mode === 'even') {
    return {
      type: 'even',
      participantIds,
    }
  }

  if (mode === 'shares') {
    const shares = participantIds.map((participantId) => {
      const value = Number.parseFloat(weights[participantId] ?? '1')
      const weight = Number.isFinite(value) && value > 0 ? value : 1
      return {
        participantId,
        weight,
      }
    })
    return {
      type: 'shares',
      shares,
    }
  }

  const allocations = participantIds.map((participantId) => {
    const value = Number.parseFloat(amounts[participantId] ?? '0')
    const amount = Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : 0
    return {
      participantId,
      amount,
    }
  })

  return {
    type: 'exact',
    allocations,
  }
}

export function ExpenseEditor({ participants, currency, onCancel, onSave }: ExpenseEditorProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [paidBy, setPaidBy] = useState(participants[0]?.id ?? '')
  const [splitMode, setSplitMode] = useState<SplitMode>('even')
  const [selected, setSelected] = useState<SelectionMap>(() => initializeSelection(participants))
  const [weights, setWeights] = useState<WeightMap>(() => initializeWeights(participants))
  const [amounts, setAmounts] = useState<AmountMap>(() => initializeAmounts(participants))
  const [note, setNote] = useState('')

  const selectedParticipants = useMemo(() => {
    const list = participants.filter((participant) => selected[participant.id])
    return list.length > 0 ? list : participants
  }, [participants, selected])

  const parsedAmount = useMemo(() => {
    const value = Number.parseFloat(amount)
    return Number.isFinite(value) ? value : 0
  }, [amount])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!description.trim() || parsedAmount <= 0 || !paidBy) {
      return
    }

    const participantIds = selectedParticipants.map((participant) => participant.id)
    const split = buildSplitInstruction(splitMode, participantIds, weights, amounts)
    if (!split) return

    const draft: ExpenseDraft = {
      description: description.trim(),
      amount: Number(parsedAmount.toFixed(2)),
      paidBy: [{ participantId: paidBy, amount: Number(parsedAmount.toFixed(2)) }],
      split,
      notes: note.trim() || undefined,
      createdAt: date ? new Date(`${date}T00:00:00`).toISOString() : undefined,
    }

    onSave(draft)

    setDescription('')
    setAmount('')
    setPaidBy(participants[0]?.id ?? '')
    setSplitMode('even')
    setSelected(initializeSelection(participants))
    setWeights(initializeWeights(participants))
    setAmounts(initializeAmounts(participants))
    setDate('')
    setNote('')
  }

  const handleToggleParticipant = (participantId: string) => {
    const currentlySelected = selected[participantId]
    if (currentlySelected && selectedParticipants.length <= 1) {
      return
    }
    setSelected((prev) => ({
      ...prev,
      [participantId]: !currentlySelected,
    }))
  }

  const handleWeightChange = (participantId: string, value: string) => {
    setWeights((prev) => ({
      ...prev,
      [participantId]: value,
    }))
  }

  const handleExactAmountChange = (participantId: string, value: string) => {
    setAmounts((prev) => ({
      ...prev,
      [participantId]: value,
    }))
  }

  const previewShares = useMemo(() => {
    const participantIds = selectedParticipants.map((participant) => participant.id)
    const split = buildSplitInstruction(splitMode, participantIds, weights, amounts)
    if (!split || parsedAmount <= 0) {
      return []
    }

    const defaultParticipant = selectedParticipants[0]?.id ?? ''

    return calculateExpenseShares({
      id: 'preview',
      description: 'preview',
      amount: parsedAmount,
      currency,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: undefined,
      category: undefined,
      paidBy: [{ participantId: paidBy || defaultParticipant, amount: parsedAmount }],
      split,
    })
  }, [amounts, currency, paidBy, parsedAmount, selectedParticipants, splitMode, weights])

  const totalExact = useMemo(() => {
    if (splitMode !== 'exact') return 0
    return selectedParticipants.reduce((sum, participant) => {
      const value = Number.parseFloat(amounts[participant.id] ?? '0')
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [amounts, selectedParticipants, splitMode])

  const exactDifference = splitMode === 'exact' ? Number((parsedAmount - totalExact).toFixed(2)) : 0

  const isValid =
    description.trim().length > 0 &&
    parsedAmount > 0 &&
    Boolean(paidBy) &&
    selectedParticipants.length > 0 &&
    (splitMode !== 'shares' ||
      selectedParticipants.some((participant) => {
        const value = Number.parseFloat(weights[participant.id] ?? '0')
        return Number.isFinite(value) && value > 0
      }))

  return (
    <section className="surface view-section">
      <header className="section-header">
        <button className="ghost-button" onClick={onCancel}>
          ← Back
        </button>
        <div className="section-heading">
          <h2 className="section-title">Add expense</h2>
          <p className="section-subtitle">
            Start with the basics, then we will layer in advanced splits next.
          </p>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="submit" form="expense-form" disabled={!isValid}>
            Save draft
          </button>
        </div>
      </header>

      <form id="expense-form" className="expense-form" onSubmit={handleSubmit}>
        <label>
          <span>Description</span>
          <input
            type="text"
            value={description}
            placeholder="Boat rental, groceries, etc."
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>

        <label>
          <span>Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            placeholder="0.00"
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>

        <label>
          <span>Date (optional)</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <label>
          <span>Who paid?</span>
          <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required>
            <option value="" disabled>
              Select person
            </option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Split method</legend>
          <div className="split-modes">
            {splitModes.map((mode) => (
              <label key={mode.value} className={splitMode === mode.value ? 'split-card active' : 'split-card'}>
                <input
                  type="radio"
                  name="splitMode"
                  value={mode.value}
                  checked={splitMode === mode.value}
                  onChange={() => setSplitMode(mode.value)}
                />
                <div>
                  <p>{mode.label}</p>
                  <small>{mode.helper}</small>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Who participates?</legend>
          <div className="participant-selector">
            {participants.map((participant) => (
              <label key={participant.id} className="participant-chip">
                <input
                  type="checkbox"
                  checked={selected[participant.id] ?? false}
                  onChange={() => handleToggleParticipant(participant.id)}
                />
                <span>{participant.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {splitMode === 'shares' && (
          <div className="split-detail">
            <h4>Assign weights</h4>
            <p className="helper-text">Think of weights as seats or portions. 2 = twice as much as 1.</p>
            <div className="split-grid">
              {selectedParticipants.map((participant) => (
                <label key={participant.id}>
                  <span>{participant.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={weights[participant.id] ?? '1'}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      handleWeightChange(participant.id, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {splitMode === 'exact' && (
          <div className="split-detail">
            <h4>Exact amounts</h4>
            <p className="helper-text">
              Enter the exact amount each person should cover. Differences are adjusted automatically on save.
            </p>
            <div className="split-grid">
              {selectedParticipants.map((participant) => (
                <label key={participant.id}>
                  <span>{participant.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amounts[participant.id] ?? '0'}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      handleExactAmountChange(participant.id, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
            <div className="totals-row">
              <span>
                Entered total:{' '}
                <strong>
                  {currency} {totalExact.toFixed(2)}
                </strong>
              </span>
              <span className={Math.abs(exactDifference) < 0.02 ? 'positive' : 'negative'}>
                Difference:{' '}
                <strong>
                  {currency} {exactDifference.toFixed(2)}
                </strong>
              </span>
            </div>
          </div>
        )}

        <label>
          <span>Notes (optional)</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context, receipts, or reminders."
          />
        </label>

        {previewShares.length > 0 && (
          <aside className="coming-soon preview">
            <strong>Split preview</strong>
            <ul>
              {previewShares.map((share) => {
                const participant = participants.find((person) => person.id === share.participantId)
                return (
                  <li key={share.participantId}>
                    {participant?.name ?? share.participantId}: {currency} {share.amount.toFixed(2)}
                  </li>
                )
              })}
            </ul>
          </aside>
        )}
      </form>
    </section>
  )
}

export type { SplitMode }

