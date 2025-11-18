import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import type {
  ParticipantId,
  ReceiptLineItem,
  ReceiptMetadata,
} from '../../types/domain'
import type { ParticipantProfile } from '../EventDetail'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useReceiptOcr } from '../../hooks/useReceiptOcr'
import { calculateReceiptAllocations } from '../../utils/receiptAllocation'
import { parseReceiptText } from '../../utils/receiptParser'
import type { ParsedReceiptData } from '../../utils/receiptParser'
import { extractReceiptItemsWithAI } from '../../utils/receiptAi'

type LineOrigin = 'ocr' | 'summary' | 'manual'

type ReceiptLineDraft = {
  id: string
  description: string
  amount: string
  assignedParticipantIds: ParticipantId[]
  confidence?: number
  sourceText?: string
  origin: LineOrigin
}

type ReceiptSummaryState = {
  subtotal: string
  tax: string
  tip: string
  total: string
}

export type ReceiptSplitResult = {
  receipt: ReceiptMetadata
  allocations: Record<ParticipantId, number>
  total: number
}

type ReceiptSplitModalProps = {
  isOpen: boolean
  onClose: () => void
  onApply: (result: ReceiptSplitResult) => void
  participants: ParticipantProfile[]
  currency: string
  existingReceipt?: ReceiptMetadata
  openAiApiKey?: string
}

const defaultSummary: ReceiptSummaryState = {
  subtotal: '',
  tax: '',
  tip: '',
  total: '',
}

function createLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function numberToInput(value?: number) {
  if (value === undefined || Number.isNaN(value)) return ''
  return value.toFixed(2)
}

function draftFromReceipt(receipt: ReceiptMetadata): ReceiptLineDraft[] {
  return receipt.items.map((item) => ({
    id: item.id,
    description: item.description,
    amount: item.amount.toFixed(2),
    assignedParticipantIds: item.assignedParticipantIds,
    confidence: item.confidence,
    sourceText: item.sourceText,
    origin: 'manual',
  }))
}

type DraftBuildResult = {
  drafts: ReceiptLineDraft[]
  summary: ReceiptSummaryState
}

function buildDraftsFromParsedData(parsed: ParsedReceiptData, options?: { defaultConfidence?: number }): DraftBuildResult {
  const defaultConfidence = options?.defaultConfidence ?? 0.6
  const drafts: ReceiptLineDraft[] = parsed.items.map((item) => ({
    id: item.id,
    description: item.description,
    amount: item.amount.toFixed(2),
    assignedParticipantIds: [],
    confidence: item.confidence ?? defaultConfidence,
    sourceText: item.sourceLine,
    origin: 'ocr',
  }))

  return {
    drafts,
    summary: {
      subtotal: numberToInput(parsed.subtotal),
      tax: numberToInput(parsed.tax),
      tip: numberToInput(parsed.tip),
      total: numberToInput(parsed.total),
    },
  }
}

function buildDraftsFromRawText(rawText: string) {
  const parsed = parseReceiptText(rawText)
  return buildDraftsFromParsedData(parsed)
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read file.')))
    reader.readAsDataURL(file)
  })
}

export function ReceiptSplitModal({
  isOpen,
  onClose,
  onApply,
  participants,
  currency,
  existingReceipt,
  openAiApiKey,
}: ReceiptSplitModalProps) {
  const [imagePreview, setImagePreview] = useState(existingReceipt?.image.dataUrl ?? '')
  const [imageName, setImageName] = useState(existingReceipt?.image.name ?? '')
  const [imageCapturedAt, setImageCapturedAt] = useState(existingReceipt?.image.capturedAt ?? '')
  const [rawText, setRawText] = useState(existingReceipt?.rawText ?? '')
  const [lines, setLines] = useState<ReceiptLineDraft[]>(
    existingReceipt ? draftFromReceipt(existingReceipt) : [],
  )
  const [summary, setSummary] = useState<ReceiptSummaryState>(() =>
    existingReceipt
      ? {
          subtotal: numberToInput(existingReceipt.subtotal),
          tax: numberToInput(existingReceipt.tax),
          tip: numberToInput(existingReceipt.tip),
          total: numberToInput(existingReceipt.total),
        }
      : defaultSummary,
  )
  const [parseFeedback, setParseFeedback] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle')
  const [parserSource, setParserSource] = useState<'manual' | 'basic' | 'ai'>(
    existingReceipt?.ocrProvider === 'openai'
      ? 'ai'
      : existingReceipt?.ocrProvider
        ? 'basic'
        : 'manual',
  )
  const [autoDistributionMode, setAutoDistributionMode] = useState<'none' | 'even' | 'proportional'>(
    existingReceipt?.distribution?.mode ?? 'none',
  )
  const [autoDistribution, setAutoDistribution] = useState<Record<ParticipantId, number>>(() => {
    const distribution = existingReceipt?.distribution
    if (!distribution) return {}
    return distribution.shares.reduce<Record<ParticipantId, number>>((acc, share) => {
      acc[share.participantId] = share.amount
      return acc
    }, {})
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { status: ocrStatus, progress, error: ocrError, recognise, reset } = useReceiptOcr()
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return
    setImagePreview(existingReceipt?.image.dataUrl ?? '')
    setImageName(existingReceipt?.image.name ?? '')
    setImageCapturedAt(existingReceipt?.image.capturedAt ?? '')
    setRawText(existingReceipt?.rawText ?? '')
    setLines(existingReceipt ? draftFromReceipt(existingReceipt) : [])
    setSummary(
      existingReceipt
        ? {
            subtotal: numberToInput(existingReceipt.subtotal),
            tax: numberToInput(existingReceipt.tax),
            tip: numberToInput(existingReceipt.tip),
            total: numberToInput(existingReceipt.total),
          }
        : defaultSummary,
    )
    setParseFeedback(null)
    setParserSource(
      existingReceipt?.ocrProvider === 'openai'
        ? 'ai'
        : existingReceipt?.ocrProvider
          ? 'basic'
          : 'manual',
    )
    setAiStatus('idle')
    if (existingReceipt?.distribution) {
      setAutoDistributionMode(existingReceipt.distribution.mode)
      const nextDistribution = existingReceipt.distribution.shares.reduce<Record<ParticipantId, number>>(
        (acc, share) => {
          acc[share.participantId] = share.amount
          return acc
        },
        {},
      )
      setAutoDistribution(nextDistribution)
    } else {
      setAutoDistributionMode('none')
      setAutoDistribution({})
    }
    reset()
  }, [existingReceipt, isOpen, reset])

  const preparedItems = useMemo<ReceiptLineItem[]>(() => {
    return lines
      .map((line) => ({
        id: line.id,
        description: line.description.trim(),
        amount: Number.parseFloat(line.amount),
        assignedParticipantIds: line.assignedParticipantIds,
        confidence: line.confidence,
        sourceText: line.sourceText,
      }))
      .filter(
        (item) =>
          item.description.length > 0 &&
          Number.isFinite(item.amount) &&
          item.amount > 0,
      )
  }, [lines])

  const allocation = useMemo(() => calculateReceiptAllocations(preparedItems), [preparedItems])

  const combinedAllocation = useMemo(() => {
    const combined: Record<ParticipantId, number> = { ...allocation.perParticipant }
    Object.entries(autoDistribution).forEach(([participantId, amount]) => {
      combined[participantId as ParticipantId] = Number(
        ((combined[participantId as ParticipantId] ?? 0) + amount).toFixed(2),
      )
    })
    return combined
  }, [allocation.perParticipant, autoDistribution])

  const itemsTotal = useMemo(
    () => preparedItems.reduce((sum, item) => sum + item.amount, 0),
    [preparedItems],
  )

  const remainingDifference = useMemo(() => {
    const totalValue = Number.parseFloat(summary.total)
    if (!Number.isFinite(totalValue)) return 0
    const distributed = Object.values(autoDistribution).reduce((sum, value) => sum + value, 0)
    return Number((totalValue - itemsTotal - distributed).toFixed(2))
  }, [itemsTotal, summary.total, autoDistribution])

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }),
    [currency],
  )

  const hasUnassigned = allocation.unassignedItemIds.length > 0
  const canApply = imagePreview && preparedItems.length > 0 && !hasUnassigned
  const allocationParticipants = participants.filter(
    (participant) => combinedAllocation[participant.id] !== undefined,
  )

  const applyDraftResult = (result: DraftBuildResult, source: 'basic' | 'ai') => {
    const detectedCount = result.drafts.length
    const nextDrafts = detectedCount > 0 ? result.drafts : [createManualLine()]
    setLines(nextDrafts)
    setSummary(result.summary)
    setAutoDistributionMode('none')
    setAutoDistribution({})
    if (source === 'basic') {
      setParserSource('basic')
      setParseFeedback(
        detectedCount === 0
          ? 'No line items detected automatically — add them manually below.'
          : `${detectedCount} line item${detectedCount === 1 ? '' : 's'} were extracted. Review and assign people.`,
      )
    } else {
      setParserSource('ai')
      setParseFeedback(
        detectedCount === 0
          ? 'No line items were extracted. Edit the items manually below.'
          : `${detectedCount} line item${detectedCount === 1 ? '' : 's'} were extracted. Review and assign people.`,
      )
    }
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const dataUrl = await fileToDataUrl(file)
      setImagePreview(dataUrl)
      setImageName(file.name || 'Receipt photo')
      setImageCapturedAt(new Date().toISOString())

      const text = await recognise(file)
      setRawText(text)

        const basicResult = buildDraftsFromRawText(text)
      applyDraftResult(basicResult, 'basic')

      if (openAiApiKey) {
        setAiStatus('working')
        try {
          const aiParsed = await extractReceiptItemsWithAI(text, openAiApiKey)
          const aiResult = buildDraftsFromParsedData(aiParsed, { defaultConfidence: 0.85 })
          applyDraftResult(aiResult, 'ai')
          setAiStatus('success')
        } catch (aiError) {
          console.error(aiError)
          setAiStatus('error')
          setParseFeedback('OpenAI could not improve this receipt. Showing the basic extraction instead.')
          setParserSource('basic')
        }
      } else {
        setAiStatus('idle')
      }
    } catch (error) {
      setRawText('')
      setParseFeedback(
        error instanceof Error
          ? error.message
          : 'We could not read this receipt. Try again or add items manually.',
      )
      setParserSource('manual')
      setAiStatus('idle')
      if (lines.length === 0) {
        setLines([createManualLine()])
      }
    }
  }

  const handleRetake = () => {
    setImagePreview('')
    setImageName('')
    setImageCapturedAt('')
    setRawText('')
    setLines([])
    setSummary(defaultSummary)
    setParseFeedback(null)
    setAiStatus('idle')
    setParserSource('manual')
    setAutoDistributionMode('none')
    setAutoDistribution({})
    reset()
    fileInputRef.current?.focus()
  }

  const handleAddLine = () => {
    setLines((prev) => [...prev, createManualLine()])
  }

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => prev.filter((line) => line.id !== lineId))
  }

  const handleLineChange = (
    lineId: string,
    field: 'description' | 'amount',
    value: string,
  ) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return { ...line, [field]: value }
      }),
    )
  }

  const handleToggleParticipant = (lineId: string, participantId: ParticipantId) => {
    setLines((prev) =>
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
  }

  const handleAssignAll = (lineId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return {
          ...line,
          assignedParticipantIds: participants.map((participant) => participant.id),
        }
      }),
    )
  }

  const handleClearAssignments = (lineId: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line
        return {
          ...line,
          assignedParticipantIds: [],
        }
      }),
    )
  }

  const handleSummaryChange = (field: keyof ReceiptSummaryState, value: string) => {
    setSummary((prev) => ({ ...prev, [field]: value }))
    setAutoDistributionMode('none')
    setAutoDistribution({})
  }

  const preparedSummary = {
    subtotal: Number.parseFloat(summary.subtotal) || undefined,
    tax: Number.parseFloat(summary.tax) || undefined,
    tip: Number.parseFloat(summary.tip) || undefined,
    total: Number.parseFloat(summary.total) || undefined,
  }

  const handleApplyDistribution = (mode: 'even' | 'proportional') => {
    if (remainingDifference <= 0.01) {
      setAutoDistributionMode('none')
      setAutoDistribution({})
      return
    }
    const targets = allocationParticipants.length > 0 ? allocationParticipants : participants
    if (targets.length === 0) {
      setAutoDistributionMode('none')
      setAutoDistribution({})
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
      const totalBase = targets.reduce((sum, participant) => sum + (allocation.perParticipant[participant.id] ?? 0), 0)
      if (totalBase <= 0) {
        handleApplyDistribution('even')
        return
      }
      const provisional = targets.map((participant) => {
        const baseShare = allocation.perParticipant[participant.id] ?? 0
        const exact = (baseShare / totalBase) * cents
        return {
          participantId: participant.id,
          cents: Math.floor(exact),
          fraction: exact - Math.floor(exact),
        }
      })
      let allocated = provisional.reduce((sum, entry) => sum + entry.cents, 0)
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
    setAutoDistributionMode(mode)
    setAutoDistribution(shares)
  }

  const clearDistribution = () => {
    setAutoDistributionMode('none')
    setAutoDistribution({})
  }

  const handleApply = () => {
    if (!canApply) return
    const receiptItems: ReceiptLineItem[] = preparedItems.map((item) => ({
      ...item,
      amount: Number(item.amount.toFixed(2)),
      assignedParticipantIds: item.assignedParticipantIds,
    }))

    const distributionPayload =
      autoDistributionMode !== 'none' && Object.keys(autoDistribution).length > 0
        ? {
            mode: autoDistributionMode,
            total: Number(
              Object.values(autoDistribution).reduce((sum, value) => sum + value, 0).toFixed(2),
            ),
            shares: Object.entries(autoDistribution).map(([participantId, amount]) => ({
              participantId,
              amount,
            })),
          }
        : undefined

    const receipt: ReceiptMetadata = {
      image: {
        id: existingReceipt?.image.id ?? createLocalId('receipt_image'),
        name: imageName || 'Receipt photo',
        dataUrl: imagePreview,
        capturedAt: imageCapturedAt || new Date().toISOString(),
      },
      items: receiptItems,
      subtotal: preparedSummary.subtotal,
      tax: preparedSummary.tax,
      tip: preparedSummary.tip,
      total: preparedSummary.total ?? Number(itemsTotal.toFixed(2)),
      currency,
      rawText,
      ocrProvider: parserSource === 'ai' ? 'openai' : rawText ? 'tesseract-js' : 'manual',
      distribution: distributionPayload,
    }

    const distributedTotal = Number(
      (allocation.total + Object.values(autoDistribution).reduce((sum, value) => sum + value, 0)).toFixed(2),
    )

    onApply({
      receipt,
      allocations: combinedAllocation,
      total: distributedTotal,
    })
    onClose()
  }

  if (!isOpen) {
    return null
  }

  const manualItemsPlaceholder =
    lines.length === 0 ? (
      <div className="empty-state">
        <p>No items yet. Start by scanning a receipt or add items manually.</p>
        <button type="button" className="primary-button" onClick={handleAddLine}>
          Add first item
        </button>
      </div>
    ) : null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleOverlayClick}>
      <div className="modal receipt-modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <h2>Scan receipt</h2>
          <p>Snap or upload a receipt, pick who ate each item, and we&apos;ll fill in the custom split.</p>
        </header>
        <div className="receipt-modal__body">
          <section className="receipt-modal__capture">
            {imagePreview ? (
              <figure className="receipt-preview">
                <img src={imagePreview} alt="Receipt preview" />
                <figcaption>
                  <span>{imageName || 'Receipt photo'}</span>
                  <button type="button" className="ghost-button" onClick={handleRetake}>
                    Retake
                  </button>
                </figcaption>
              </figure>
            ) : (
                <label className="upload-card">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} />
                <strong>Take a photo or upload</strong>
                <span>Use your camera for best results. We keep the image locally.</span>
              </label>
            )}
            <div className="scan-status">
              {ocrStatus === 'processing' && (
                <div className="progress">
                  <span>Scanning receipt… {progress}%</span>
                  <div className="progress-bar">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              {aiStatus === 'working' && (
                <p className="helper-text">Asking OpenAI to organize the items…</p>
              )}
              {aiStatus === 'error' && (
                <p className="error">OpenAI couldn&apos;t parse this receipt. Showing the basic extraction instead.</p>
              )}
              {ocrError && <p className="error">{ocrError}</p>}
              {parseFeedback && aiStatus !== 'error' && <p className="helper-text">{parseFeedback}</p>}
            </div>
            <div className="receipt-summary">
              <h4>Receipt totals</h4>
              <div className="summary-grid">
                {(['subtotal', 'tax', 'tip', 'total'] as (keyof ReceiptSummaryState)[]).map((field) => (
                  <label key={field}>
                    <span>{field === 'total' ? 'Total' : field.charAt(0).toUpperCase() + field.slice(1)}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={summary[field]}
                      onChange={(event) => handleSummaryChange(field, event.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                ))}
              </div>
              <p className="helper-text">
                Totals are optional and help you verify we captured the right numbers.
              </p>
            </div>
          </section>
          <section className="receipt-modal__items">
            <div className="items-header">
              <div>
                <h4>Line items</h4>
                <p className="helper-text">
                  Tap the people who shared each item. Amounts are split evenly across selected people.
                </p>
              </div>
              <button type="button" className="ghost-button" onClick={handleAddLine}>
                Add item
              </button>
            </div>
            {manualItemsPlaceholder}
            <div className="receipt-items">
              {lines.map((line) => {
                const assignedNames = line.assignedParticipantIds
                  .map((participantId) => participants.find((p) => p.id === participantId)?.name)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <article key={line.id} className="receipt-item">
                    <div className="receipt-item__inputs">
                      <label>
                        <span>Description</span>
                        <input
                          type="text"
                          value={line.description}
                          onChange={(event) => handleLineChange(line.id, 'description', event.target.value)}
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
                          onChange={(event) => handleLineChange(line.id, 'amount', event.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                    <div className="receipt-item__meta">
                      <span className="confidence">
                        {line.origin === 'manual'
                          ? 'Manual entry'
                          : `Confidence ${Math.round((line.confidence ?? 0.6) * 100)}%`}
                      </span>
                      <div className="receipt-item__actions">
                        <button type="button" onClick={() => handleAssignAll(line.id)}>
                          Assign all
                        </button>
                        <button type="button" onClick={() => handleClearAssignments(line.id)}>
                          Assign none
                        </button>
                        <button type="button" onClick={() => handleRemoveLine(line.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="receipt-item__participants">
                      {participants.map((participant) => {
                        const checked = line.assignedParticipantIds.includes(participant.id)
                        return (
                          <label key={participant.id} className={checked ? 'participant-chip active' : 'participant-chip'}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleParticipant(line.id, participant.id)}
                            />
                            <span>{participant.name}</span>
                          </label>
                        )
                      })}
                    </div>
                    {assignedNames && (
                      <p className="helper-text">
                        {assignedNames} will split {currencyFormatter.format(Number.parseFloat(line.amount) || 0)}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
            {remainingDifference > 0.01 && (
              <div className="receipt-distribution">
                <p>
                  {currencyFormatter.format(remainingDifference)} remains (likely tax/tip). Apply it across participants:
                </p>
                <div className="distribution-actions">
                  <button type="button" className="ghost-button" onClick={() => handleApplyDistribution('even')}>
                    Distribute evenly
                  </button>
                  <button type="button" className="ghost-button" onClick={() => handleApplyDistribution('proportional')}>
                    Distribute proportionally
                  </button>
                  {autoDistributionMode !== 'none' && (
                    <button type="button" className="ghost-button" onClick={clearDistribution}>
                      Clear distribution
                    </button>
                  )}
                </div>
                {autoDistributionMode !== 'none' && (
                  <p className="helper-text">
                    Applying {autoDistributionMode} distribution to cover the remaining amount.
                  </p>
                )}
              </div>
            )}
            <div className="receipt-preview-card">
              <div>
                <strong>Items total</strong>
                <span>{currencyFormatter.format(Number(itemsTotal.toFixed(2)) || 0)}</span>
              </div>
              <div>
                <strong>Split preview</strong>
                <ul>
                  {allocationParticipants.map((participant) => (
                    <li key={participant.id}>
                      {participant.name}: {currencyFormatter.format(combinedAllocation[participant.id] ?? 0)}
                    </li>
                  ))}
                </ul>
              </div>
              {hasUnassigned && (
                <p className="error">
                  Assign every item before applying (missing: {allocation.unassignedItemIds.length}).
                </p>
              )}
            </div>
          </section>
        </div>
        <div className="modal__actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!canApply} onClick={handleApply}>
            Use receipt split
          </button>
        </div>
      </div>
    </div>
  )

  function createManualLine(): ReceiptLineDraft {
    return {
      id: createLocalId('receipt_item'),
      description: '',
      amount: '',
      assignedParticipantIds: [],
      confidence: 0.5,
      origin: 'manual',
    }
  }
}


