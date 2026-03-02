import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ExpenseDraft, SplitStrategy } from '../state/useLocalStore'
import { calculateExpenseShares } from '../utils/calculations'
import type { ParticipantProfile } from './EventDetail'
import type { Expense, ParticipantId, ReceiptLineItem } from '../types/domain'
import { TaxTipToolModal } from './TaxTipToolModal'
import { calculateReceiptAllocations } from '../utils/receiptAllocation'

type SplitMode = SplitStrategy

type SelectionMap = Record<string, boolean>
type WeightMap = Record<string, string>
type AmountMap = Record<string, string>

type ReceiptLineDraft = {
  id: string
  description: string
  amount: string
  assignedParticipantIds: ParticipantId[]
}

type ExpenseEditorProps = {
  participants: ParticipantProfile[]
  currency: string
  onCancel: () => void
  onSave: (draft: ExpenseDraft) => void
  initialExpense?: Expense
}

const splitModes: { value: SplitMode; label: string; helper: string }[] = [
  { value: 'even', label: 'Even split', helper: 'Split the cost evenly across selected people.' },
  {
    value: 'receipt',
    label: 'Receipt split',
    helper: 'Add line items from a receipt and assign who shared each.',
  },
  {
    value: 'shares',
    label: 'Weighted shares',
    helper: 'Assign relative shares like "2 seats" or "half share" per person.',
  },
  {
    value: 'exact',
    label: 'Custom amounts',
    helper: 'Enter exact amounts owed per person (great for reimbursements).',
  },
]

function createLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

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

function createEmptyLine(): ReceiptLineDraft {
  return {
    id: createLocalId('receipt_item'),
    description: '',
    amount: '',
    assignedParticipantIds: [],
  }
}

function buildSplitInstruction(
  mode: SplitMode,
  participantIds: string[],
  weights: WeightMap,
  amounts: AmountMap,
): ExpenseDraft['split'] | null {
  if (mode === 'receipt') {
    return null
  }

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

export function ExpenseEditor({
  participants,
  currency,
  onCancel,
  onSave,
  initialExpense,
}: ExpenseEditorProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [paidBy, setPaidBy] = useState(participants[0]?.id ?? '')
  const [splitMode, setSplitMode] = useState<SplitMode>('even')
  const [selected, setSelected] = useState<SelectionMap>(() => initializeSelection(participants))
  const [weights, setWeights] = useState<WeightMap>(() => initializeWeights(participants))
  const [amounts, setAmounts] = useState<AmountMap>(() => initializeAmounts(participants))
  const [note, setNote] = useState(initialExpense?.notes ?? '')
  const [isTaxTipToolOpen, setIsTaxTipToolOpen] = useState(false)
  const [originalAmountsForTool, setOriginalAmountsForTool] = useState<AmountMap>({})
  const [pendingSplitModeChange, setPendingSplitModeChange] = useState<SplitMode | null>(null)

  const [receiptLines, setReceiptLines] = useState<ReceiptLineDraft[]>([createEmptyLine()])
  const [distributionMode, setDistributionMode] = useState<'none' | 'even' | 'proportional'>('none')
  const [distribution, setDistribution] = useState<Record<ParticipantId, number>>({})

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }),
    [currency],
  )

  useEffect(() => {
    const defaultPayer = participants[0]?.id ?? ''

    if (initialExpense) {
      setDescription(initialExpense.description)
      setAmount(initialExpense.amount.toFixed(2))
      setPaidBy(initialExpense.paidBy[0]?.participantId ?? defaultPayer)
      setSplitMode(initialExpense.split.type)
      setNote(initialExpense.notes ?? '')

      const createdDate =
        initialExpense.createdAt && Number.isFinite(Date.parse(initialExpense.createdAt))
          ? new Date(initialExpense.createdAt).toISOString().slice(0, 10)
          : ''
      setDate(createdDate)

      const selection = initializeSelection(participants)
      Object.keys(selection).forEach((key) => {
        selection[key] = false
      })
      const baseWeights = initializeWeights(participants)
      const baseAmounts = initializeAmounts(participants)

      if (initialExpense.split.type === 'even') {
        initialExpense.split.participantIds.forEach((participantId) => {
          selection[participantId] = true
        })
        setReceiptLines([createEmptyLine()])
        setDistributionMode('none')
        setDistribution({})
      } else if (initialExpense.split.type === 'shares') {
        initialExpense.split.shares.forEach((share) => {
          selection[share.participantId] = true
          baseWeights[share.participantId] = share.weight.toString()
        })
        setReceiptLines([createEmptyLine()])
        setDistributionMode('none')
        setDistribution({})
      } else if (initialExpense.split.type === 'exact') {
        initialExpense.split.allocations.forEach((allocation) => {
          selection[allocation.participantId] = true
          baseAmounts[allocation.participantId] = allocation.amount.toFixed(2)
        })
        setReceiptLines([createEmptyLine()])
        setDistributionMode('none')
        setDistribution({})
      } else if (initialExpense.split.type === 'receipt') {
        const lines = initialExpense.split.items.map((item) => ({
          id: item.id,
          description: item.description,
          amount: item.amount.toFixed(2),
          assignedParticipantIds: item.assignedParticipantIds,
        }))
        setReceiptLines(lines.length > 0 ? lines : [createEmptyLine()])
        if (initialExpense.split.distribution) {
          setDistributionMode(initialExpense.split.distribution.mode)
          const dist = initialExpense.split.distribution.shares.reduce<Record<ParticipantId, number>>(
            (acc, share) => {
              acc[share.participantId] = share.amount
              return acc
            },
            {},
          )
          setDistribution(dist)
        } else {
          setDistributionMode('none')
          setDistribution({})
        }
        initialExpense.split.items.forEach((item) => {
          item.assignedParticipantIds.forEach((participantId) => {
            selection[participantId] = true
          })
        })
      }

      setSelected(selection)
      setWeights(baseWeights)
      setAmounts(baseAmounts)
    } else {
      setDescription('')
      setAmount('')
      setDate('')
      setPaidBy(defaultPayer)
      setSplitMode('even')
      setSelected(initializeSelection(participants))
      setWeights(initializeWeights(participants))
      setAmounts(initializeAmounts(participants))
      setNote('')
      setReceiptLines([createEmptyLine()])
      setDistributionMode('none')
      setDistribution({})
    }
  }, [initialExpense, participants])

  const selectedParticipants = useMemo(() => {
    const list = participants.filter((participant) => selected[participant.id])
    return list.length > 0 ? list : participants
  }, [participants, selected])

  const parsedAmount = useMemo(() => {
    const value = Number.parseFloat(amount)
    return Number.isFinite(value) ? value : 0
  }, [amount])

  const preparedReceiptItems = useMemo<ReceiptLineItem[]>(() => {
    return receiptLines
      .map((line) => ({
        id: line.id,
        description: line.description.trim(),
        amount: Number.parseFloat(line.amount),
        assignedParticipantIds: line.assignedParticipantIds,
      }))
      .filter(
        (item) =>
          item.description.length > 0 &&
          Number.isFinite(item.amount) &&
          item.amount > 0,
      )
  }, [receiptLines])

  const receiptAllocation = useMemo(
    () => calculateReceiptAllocations(preparedReceiptItems),
    [preparedReceiptItems],
  )

  const receiptItemsTotal = useMemo(
    () => preparedReceiptItems.reduce((sum, item) => sum + item.amount, 0),
    [preparedReceiptItems],
  )

  const combinedReceiptAllocation = useMemo(() => {
    const combined: Record<ParticipantId, number> = { ...receiptAllocation.perParticipant }
    Object.entries(distribution).forEach(([participantId, amt]) => {
      combined[participantId as ParticipantId] = Number(
        ((combined[participantId as ParticipantId] ?? 0) + amt).toFixed(2),
      )
    })
    return combined
  }, [receiptAllocation.perParticipant, distribution])

  const receiptParticipants = useMemo(() => {
    return participants.filter(
      (participant) => combinedReceiptAllocation[participant.id] !== undefined,
    )
  }, [participants, combinedReceiptAllocation])

  const receiptBreakdownByParticipant = useMemo(() => {
    if (splitMode !== 'receipt') return {}

    const breakdown: Record<
      ParticipantId,
      { items: Array<{ description: string; share: number }>; itemsTotal: number; distributionAmount: number }
    > = {}

    preparedReceiptItems.forEach((item) => {
      const assignedCount = item.assignedParticipantIds.length
      if (assignedCount === 0) return
      const shareAmount = Number((item.amount / assignedCount).toFixed(2))

      item.assignedParticipantIds.forEach((participantId) => {
        if (!breakdown[participantId]) {
          breakdown[participantId] = { items: [], itemsTotal: 0, distributionAmount: 0 }
        }
        breakdown[participantId].items.push({
          description: item.description,
          share: shareAmount,
        })
        breakdown[participantId].itemsTotal = Number(
          (breakdown[participantId].itemsTotal + shareAmount).toFixed(2),
        )
      })
    })

    Object.entries(distribution).forEach(([participantId, amt]) => {
      if (!breakdown[participantId]) {
        breakdown[participantId] = { items: [], itemsTotal: 0, distributionAmount: 0 }
      }
      breakdown[participantId].distributionAmount = amt
    })

    return breakdown
  }, [splitMode, preparedReceiptItems, distribution])

  const remainingDifference = useMemo(() => {
    if (splitMode !== 'receipt') return 0
    const distributed = Object.values(distribution).reduce((sum, value) => sum + value, 0)
    return Number((parsedAmount - receiptItemsTotal - distributed).toFixed(2))
  }, [splitMode, parsedAmount, receiptItemsTotal, distribution])

  const hasUnassignedItems = receiptAllocation.unassignedItemIds.length > 0

  const handleAddLine = () => {
    setReceiptLines((prev) => [...prev, createEmptyLine()])
  }

  const handleRemoveLine = (lineId: string) => {
    setReceiptLines((prev) => {
      const filtered = prev.filter((line) => line.id !== lineId)
      return filtered.length > 0 ? filtered : [createEmptyLine()]
    })
  }

  const handleLineChange = (lineId: string, field: 'description' | 'amount', value: string) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return { ...line, [field]: value }
      }),
    )
    setDistributionMode('none')
    setDistribution({})
  }

  const handleToggleLineParticipant = (lineId: string, participantId: ParticipantId) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        const currentlyAssigned = line.assignedParticipantIds.includes(participantId)
        return {
          ...line,
          assignedParticipantIds: currentlyAssigned
            ? line.assignedParticipantIds.filter((id) => id !== participantId)
            : [...line.assignedParticipantIds, participantId],
        }
      }),
    )
    setDistributionMode('none')
    setDistribution({})
  }

  const handleAssignAllToLine = (lineId: string) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return {
          ...line,
          assignedParticipantIds: selectedParticipants.map((p) => p.id),
        }
      }),
    )
    setDistributionMode('none')
    setDistribution({})
  }

  const handleClearLineAssignments = (lineId: string) => {
    setReceiptLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return {
          ...line,
          assignedParticipantIds: [],
        }
      }),
    )
    setDistributionMode('none')
    setDistribution({})
  }

  const handleApplyDistribution = (mode: 'even' | 'proportional') => {
    if (remainingDifference <= 0.01) {
      setDistributionMode('none')
      setDistribution({})
      return
    }
    const targets = receiptParticipants.length > 0 ? receiptParticipants : participants
    if (targets.length === 0) {
      setDistributionMode('none')
      setDistribution({})
      return
    }
    const cents = Math.round(remainingDifference * 100)
    let shares: Record<ParticipantId, number> = {}
    if (mode === 'even') {
      const base = Math.floor(cents / targets.length)
      let remainder = cents - base * targets.length
      shares = targets.reduce<Record<ParticipantId, number>>((acc, participant) => {
        const extra = remainder > 0 ? 1 : 0
        if (remainder > 0) remainder -= 1
        acc[participant.id] = Number(((base + extra) / 100).toFixed(2))
        return acc
      }, {})
    } else {
      const totalBase = targets.reduce(
        (sum, participant) => sum + (receiptAllocation.perParticipant[participant.id] ?? 0),
        0,
      )
      if (totalBase <= 0) {
        handleApplyDistribution('even')
        return
      }
      const provisional = targets.map((participant) => {
        const baseShare = receiptAllocation.perParticipant[participant.id] ?? 0
        const exact = (baseShare / totalBase) * cents
        return {
          participantId: participant.id,
          cents: Math.floor(exact),
          fraction: exact - Math.floor(exact),
        }
      })
      const allocated = provisional.reduce((sum, entry) => sum + entry.cents, 0)
      let remainder = cents - allocated
      provisional
        .slice()
        .sort((a, b) => b.fraction - a.fraction)
        .forEach((entry) => {
          if (remainder > 0) {
            entry.cents += 1
            remainder -= 1
          }
        })
      shares = provisional.reduce<Record<ParticipantId, number>>((acc, entry) => {
        acc[entry.participantId] = Number((entry.cents / 100).toFixed(2))
        return acc
      }, {})
    }
    setDistributionMode(mode)
    setDistribution(shares)
  }

  const handleClearDistribution = () => {
    setDistributionMode('none')
    setDistribution({})
  }

  const hasReceiptData = preparedReceiptItems.length > 0

  const handleSplitModeChange = (newMode: SplitMode) => {
    if (splitMode === 'receipt' && newMode !== 'receipt' && hasReceiptData) {
      setPendingSplitModeChange(newMode)
    } else {
      setSplitMode(newMode)
    }
  }

  const handleConfirmSplitModeChange = () => {
    if (pendingSplitModeChange) {
      setSplitMode(pendingSplitModeChange)
      setReceiptLines([createEmptyLine()])
      setDistributionMode('none')
      setDistribution({})
      setPendingSplitModeChange(null)
    }
  }

  const handleCancelSplitModeChange = () => {
    setPendingSplitModeChange(null)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!description.trim() || !paidBy) {
      return
    }

    let split: ExpenseDraft['split']
    let finalAmount: number

    if (splitMode === 'receipt') {
      if (preparedReceiptItems.length === 0 || hasUnassignedItems) {
        return
      }
      finalAmount = parsedAmount > 0 ? parsedAmount : receiptItemsTotal
      if (finalAmount <= 0) {
        return
      }
      const distributionPayload =
        distributionMode !== 'none' && Object.keys(distribution).length > 0
          ? {
              mode: distributionMode,
              total: Number(
                Object.values(distribution)
                  .reduce((sum, value) => sum + value, 0)
                  .toFixed(2),
              ),
              shares: Object.entries(distribution).map(([participantId, amt]) => ({
                participantId,
                amount: amt,
              })),
            }
          : undefined

      split = {
        type: 'receipt',
        items: preparedReceiptItems.map((item) => ({
          ...item,
          amount: Number(item.amount.toFixed(2)),
        })),
        distribution: distributionPayload,
      }
    } else {
      if (parsedAmount <= 0) {
        return
      }
      finalAmount = parsedAmount
      const participantIds = selectedParticipants.map((participant) => participant.id)
      const builtSplit = buildSplitInstruction(splitMode, participantIds, weights, amounts)
      if (!builtSplit) return
      split = builtSplit
    }

    const draft: ExpenseDraft = {
      id: initialExpense?.id,
      description: description.trim(),
      amount: Number(finalAmount.toFixed(2)),
      paidBy: [{ participantId: paidBy, amount: Number(finalAmount.toFixed(2)) }],
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
    setReceiptLines([createEmptyLine()])
    setDistributionMode('none')
    setDistribution({})
  }

  const handleToggleParticipant = (participantId: string) => {
    const currentlySelected = selected[participantId]
    if (currentlySelected && selectedParticipants.length <= 1) {
      return
    }

    const newSelection = {
      ...selected,
      [participantId]: !currentlySelected,
    }

    setSelected(newSelection)

    if (currentlySelected && splitMode === 'receipt') {
      setReceiptLines((prev) =>
        prev.map((line) => ({
          ...line,
          assignedParticipantIds: line.assignedParticipantIds.filter((id) => id !== participantId),
        })),
      )
      setDistribution((prev) => {
        const updated = { ...prev }
        delete updated[participantId]
        return updated
      })
    }
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

  const handleOpenTaxTipTool = () => {
    setOriginalAmountsForTool({ ...amounts })
    setIsTaxTipToolOpen(true)
  }

  const handleCloseTaxTipTool = () => {
    setIsTaxTipToolOpen(false)
  }

  const handleApplyTaxTipTool = (newAmounts: AmountMap) => {
    setAmounts(newAmounts)
  }

  const previewShares = useMemo(() => {
    if (splitMode === 'receipt') {
      return Object.entries(combinedReceiptAllocation).map(([participantId, amt]) => ({
        participantId,
        amount: amt,
      }))
    }

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
  }, [
    amounts,
    combinedReceiptAllocation,
    currency,
    paidBy,
    parsedAmount,
    selectedParticipants,
    splitMode,
    weights,
  ])

  const totalExact = useMemo(() => {
    if (splitMode !== 'exact') return 0
    return selectedParticipants.reduce((sum, participant) => {
      const value = Number.parseFloat(amounts[participant.id] ?? '0')
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [amounts, selectedParticipants, splitMode])

  const exactDifference = splitMode === 'exact' ? Number((parsedAmount - totalExact).toFixed(2)) : 0

  const isValid = useMemo(() => {
    if (!description.trim() || !paidBy) {
      return false
    }

    if (splitMode === 'receipt') {
      const amountToUse = parsedAmount > 0 ? parsedAmount : receiptItemsTotal
      return preparedReceiptItems.length > 0 && !hasUnassignedItems && amountToUse > 0
    }

    if (parsedAmount <= 0) {
      return false
    }

    if (selectedParticipants.length === 0) {
      return false
    }

    if (splitMode === 'shares') {
      return selectedParticipants.some((participant) => {
        const value = Number.parseFloat(weights[participant.id] ?? '0')
        return Number.isFinite(value) && value > 0
      })
    }

    return true
  }, [
    description,
    parsedAmount,
    paidBy,
    splitMode,
    preparedReceiptItems.length,
    hasUnassignedItems,
    selectedParticipants,
    weights,
    receiptItemsTotal,
  ])

  const isEditing = Boolean(initialExpense)

  return (
    <section className="surface view-section">
      <header className="section-header">
        <button className="back-button" onClick={onCancel}>
          ← Back
        </button>
        <div className="section-heading">
          <h2 className="section-title">{isEditing ? 'Edit expense' : 'Add expense'}</h2>
          <p className="section-subtitle">
            {isEditing
              ? 'Update the details, who paid, or how the cost is split.'
              : 'Start with the basics, then layer in advanced splits next.'}
          </p>
        </div>
        <div className="header-actions">
          <button className="primary-button" type="submit" form="expense-form" disabled={!isValid}>
            {isEditing ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </header>

      <form id="expense-form" className="expense-form" onSubmit={handleSubmit}>
        <label className="expense-form__field">
          <span>Expense name</span>
          <input
            type="text"
            value={description}
            placeholder="Boat rental, groceries, etc."
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>

        <fieldset>
          <legend>Split method</legend>
          <div className="split-modes">
            {splitModes.map((mode) => (
              <label
                key={mode.value}
                className={splitMode === mode.value ? 'split-card active' : 'split-card'}
              >
                <input
                  type="radio"
                  name="splitMode"
                  value={mode.value}
                  checked={splitMode === mode.value}
                  onChange={() => handleSplitModeChange(mode.value)}
                />
                <div>
                  <p>{mode.label}</p>
                  <small>{mode.helper}</small>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        {splitMode === 'receipt' && (
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
        )}

        {splitMode === 'receipt' && (
          <div className="split-detail receipt-inline">
            <div className="items-header">
              <div>
                <h4>Line items</h4>
                <p className="helper-text">
                  Add each item from the receipt and tap the people who shared it.
                </p>
              </div>
              <button type="button" className="ghost-button" onClick={handleAddLine}>
                Add item
              </button>
            </div>

            <div className="receipt-items">
              {receiptLines.map((line) => {
                const assignedNames = line.assignedParticipantIds
                  .map((participantId) => participants.find((p) => p.id === participantId)?.name)
                  .filter(Boolean)
                  .join(', ')
                const lineAmount = Number.parseFloat(line.amount) || 0
                return (
                  <article key={line.id} className="receipt-item">
                    <div className="receipt-item__inputs">
                      <label>
                        <span>Description</span>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(event) =>
                            handleLineChange(line.id, 'description', event.target.value)
                          }
                          placeholder="e.g., Pad Thai"
                        />
                      </label>
                      <label>
                        <span>Amount</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={line.amount}
                          onChange={(event) =>
                            handleLineChange(line.id, 'amount', event.target.value)
                          }
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                    <div className="receipt-item__meta">
                      <div className="receipt-item__actions">
                        <button type="button" onClick={() => handleAssignAllToLine(line.id)}>
                          Assign all
                        </button>
                        <button type="button" onClick={() => handleClearLineAssignments(line.id)}>
                          Clear
                        </button>
                        <button type="button" onClick={() => handleRemoveLine(line.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="receipt-item__participants">
                      {selectedParticipants.map((participant) => {
                        const checked = line.assignedParticipantIds.includes(participant.id)
                        return (
                          <label
                            key={participant.id}
                            className={checked ? 'participant-chip active' : 'participant-chip'}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleLineParticipant(line.id, participant.id)}
                            />
                            <span>{participant.name}</span>
                          </label>
                        )
                      })}
                    </div>
                    {assignedNames && (
                      <p className="helper-text">
                        {assignedNames} will split {currencyFormatter.format(lineAmount)}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>

            <div className="receipt-summary-inline">
              <button type="button" className="ghost-button" onClick={handleAddLine}>
                Add item
              </button>
              <div className="totals-row">
                <span>
                  Items total: <strong>{currencyFormatter.format(receiptItemsTotal)}</strong>
                </span>
              </div>
              {hasUnassignedItems && (
                <p className="error">
                  Assign people to all items before saving (missing:{' '}
                  {receiptAllocation.unassignedItemIds.length}).
                </p>
              )}
            </div>
          </div>
        )}

        <div className="expense-form__row">
          <label className="expense-form__field">
            <span>Amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              placeholder="0.00"
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>

          <label className="expense-form__field">
            <span>Date (optional)</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        {splitMode === 'receipt' && remainingDifference > 0.01 && distributionMode === 'none' && (
          <div className="receipt-distribution">
            <p>
              {currencyFormatter.format(remainingDifference)} remains (likely tax/tip). Apply it
              across participants:
            </p>
            <div className="distribution-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleApplyDistribution('even')}
              >
                Distribute evenly
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleApplyDistribution('proportional')}
              >
                Distribute proportionally
              </button>
            </div>
          </div>
        )}

        {splitMode === 'receipt' && distributionMode !== 'none' && (
          <div className="receipt-distribution applied">
            <div className="distribution-header">
              <strong>
                Tax/tip distributed ({distributionMode === 'even' ? 'evenly' : 'proportionally'})
              </strong>
              <button type="button" className="ghost-button" onClick={handleClearDistribution}>
                Undo
              </button>
            </div>
            <ul className="distribution-breakdown">
              {Object.entries(distribution).map(([participantId, amt]) => {
                const participant = participants.find((p) => p.id === participantId)
                return (
                  <li key={participantId}>
                    {participant?.name ?? participantId}: +{currencyFormatter.format(amt)}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <label className="expense-form__field">
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

        {splitMode !== 'receipt' && (
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
        )}

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
                    inputMode="decimal"
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
              Enter the exact amount each person should cover. Differences are adjusted automatically
              on save.
            </p>
            <div className="split-grid">
              {selectedParticipants.map((participant) => (
                <label key={participant.id}>
                  <span>{participant.name}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={amounts[participant.id] ?? '0'}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      handleExactAmountChange(participant.id, event.target.value)
                    }
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              ))}
            </div>
            <div className="split-actions" style={{ paddingLeft: 0 }}>
              <button
                type="button"
                className="back-button"
                onClick={handleOpenTaxTipTool}
                style={{ paddingLeft: 0 }}
              >
                Need help splitting tax/tip?
              </button>
            </div>
            <div className="totals-row">
              <span>
                Entered total: <strong>{currencyFormatter.format(totalExact)}</strong>
              </span>
              <span className={Math.abs(exactDifference) < 0.02 ? 'positive' : 'negative'}>
                Difference: <strong>{currencyFormatter.format(exactDifference)}</strong>
              </span>
            </div>
          </div>
        )}

        <label className="expense-form__field">
          <span>Notes (optional)</span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context, receipts, or reminders."
          />
        </label>

        {previewShares.length > 0 && splitMode !== 'receipt' && (
          <aside className="coming-soon preview">
            <strong>Split preview</strong>
            <ul>
              {previewShares.map((share) => {
                const participant = participants.find((person) => person.id === share.participantId)
                return (
                  <li key={share.participantId}>
                    {participant?.name ?? share.participantId}: {currencyFormatter.format(share.amount)}
                  </li>
                )
              })}
            </ul>
          </aside>
        )}

        {splitMode === 'receipt' && Object.keys(receiptBreakdownByParticipant).length > 0 && (
          <aside className="coming-soon preview receipt-preview-detailed">
            <strong>Split preview</strong>
            <div className="receipt-preview-list">
              {Object.entries(receiptBreakdownByParticipant).map(([participantId, data]) => {
                const participant = participants.find((p) => p.id === participantId)
                const total = Number((data.itemsTotal + data.distributionAmount).toFixed(2))
                return (
                  <div key={participantId} className="receipt-preview-person">
                    <div className="receipt-preview-person__header">
                      <span className="receipt-preview-person__name">
                        {participant?.name ?? participantId}
                      </span>
                      <span className="receipt-preview-person__total">
                        {currencyFormatter.format(total)}
                      </span>
                    </div>
                    <ul className="receipt-preview-person__items">
                      {data.items.map((item, idx) => (
                        <li key={idx}>
                          {item.description}: {currencyFormatter.format(item.share)}
                        </li>
                      ))}
                      {data.distributionAmount > 0 && (
                        <li className="distribution-item">
                          Tax/tip: +{currencyFormatter.format(data.distributionAmount)}
                        </li>
                      )}
                    </ul>
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        <div className="form-footer">
          <button className="primary-button" type="submit" disabled={!isValid}>
            {isEditing ? 'Save changes' : 'Save expense'}
          </button>
        </div>
      </form>

      <TaxTipToolModal
        isOpen={isTaxTipToolOpen}
        onClose={handleCloseTaxTipTool}
        onApply={handleApplyTaxTipTool}
        participants={selectedParticipants}
        currency={currency}
        totalExpense={parsedAmount}
        originalAmounts={originalAmountsForTool}
      />

      {pendingSplitModeChange && (
        <div className="modal-overlay" onClick={handleCancelSplitModeChange}>
          <div className="modal modal--confirm" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h3>Change split method?</h3>
            </header>
            <div className="modal__body">
              <p>
                Switching from Receipt split will clear all your line items and assignments. This
                cannot be undone.
              </p>
            </div>
            <footer className="modal__actions">
              <button type="button" className="ghost-button" onClick={handleCancelSplitModeChange}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button danger"
                onClick={handleConfirmSplitModeChange}
              >
                Clear and switch
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}

export type { SplitMode }
