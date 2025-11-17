import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ParticipantProfile } from './EventDetail'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type AmountMap = Record<string, string>

type TaxTipToolModalProps = {
  isOpen: boolean
  onClose: () => void
  onApply: (amounts: AmountMap) => void
  participants: ParticipantProfile[]
  currency: string
  totalExpense: number
  originalAmounts: AmountMap
}

export function TaxTipToolModal({
  isOpen,
  onClose,
  onApply,
  participants,
  currency,
  totalExpense,
  originalAmounts,
}: TaxTipToolModalProps) {
  const [amounts, setAmounts] = useState<AmountMap>(originalAmounts)
  const [baseAmounts, setBaseAmounts] = useState<AmountMap>(originalAmounts)
  const [selectedPreview, setSelectedPreview] = useState<'none' | 'even' | 'proportional'>('none')

  useBodyScrollLock(isOpen)

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
      }),
    [currency],
  )

  useEffect(() => {
    if (isOpen) {
      setAmounts(originalAmounts)
      setBaseAmounts(originalAmounts)
      setSelectedPreview('none')
    }
  }, [isOpen, originalAmounts])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Calculate total from base amounts (last manually edited values) - for preview calculations
  const totalBaseEntered = useMemo(() => {
    return participants.reduce((sum, participant) => {
      const value = Number.parseFloat(baseAmounts[participant.id] ?? '0')
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [baseAmounts, participants])

  const baseDifference = Number((totalExpense - totalBaseEntered).toFixed(2))

  // Calculate total from current amounts (what's displayed in inputs) - for display
  const totalCurrentEntered = useMemo(() => {
    return participants.reduce((sum, participant) => {
      const value = Number.parseFloat(amounts[participant.id] ?? '0')
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [amounts, participants])

  const currentDifference = Number((totalExpense - totalCurrentEntered).toFixed(2))

  // Calculate even split preview (based on base amounts, not current amounts)
  const evenSplitPreview = useMemo(() => {
    if (participants.length === 0 || baseDifference === 0) return null

    const differenceCents = Math.round(baseDifference * 100)
    const base = Math.floor(differenceCents / participants.length)
    let remainder = differenceCents - base * participants.length

    const preview: AmountMap = {}
    participants.forEach((participant) => {
      const currentValue = Number.parseFloat(baseAmounts[participant.id] ?? '0')
      const currentAmount = Number.isFinite(currentValue) ? currentValue : 0
      const additionalCents = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) {
        remainder -= 1
      }
      const additional = additionalCents / 100
      const newAmount = currentAmount + additional
      preview[participant.id] = newAmount.toFixed(2)
    })

    return preview
  }, [participants, baseDifference, baseAmounts])

  // Calculate proportional split preview (based on base amounts, not current amounts)
  const proportionalSplitPreview = useMemo(() => {
    if (participants.length === 0 || baseDifference === 0 || totalBaseEntered <= 0) return null

    const differenceCents = Math.round(baseDifference * 100)
    const totalEnteredCents = Math.round(totalBaseEntered * 100)

    const allocations = participants.map((participant) => {
      const currentValue = Number.parseFloat(baseAmounts[participant.id] ?? '0')
      const currentAmount = Number.isFinite(currentValue) && currentValue >= 0 ? currentValue : 0
      const currentCents = Math.round(currentAmount * 100)
      const proportion = totalEnteredCents > 0 ? currentCents / totalEnteredCents : 0
      const exact = proportion * differenceCents
      return {
        participantId: participant.id,
        currentAmount,
        exact,
        cents: Math.floor(exact),
        fraction: exact - Math.floor(exact),
      }
    })

    const allocated = allocations.reduce((sum, entry) => sum + entry.cents, 0)
    let remainder = differenceCents - allocated

    const sorted = allocations
      .slice()
      .sort((a, b) => b.fraction - a.fraction)
      .map((entry) => ({ participantId: entry.participantId, currentAmount: entry.currentAmount, cents: entry.cents }))

    for (let index = 0; index < sorted.length && remainder > 0; index += 1) {
      sorted[index].cents += 1
      remainder -= 1
    }

    const preview: AmountMap = {}
    sorted.forEach((entry) => {
      const additional = entry.cents / 100
      const newAmount = entry.currentAmount + additional
      preview[entry.participantId] = newAmount.toFixed(2)
    })

    return preview
  }, [participants, baseDifference, totalBaseEntered, baseAmounts])

  // Update amounts when preview selection changes (but not when previews recalculate)
  useEffect(() => {
    if (selectedPreview === 'even' && evenSplitPreview) {
      setAmounts(evenSplitPreview)
    } else if (selectedPreview === 'proportional' && proportionalSplitPreview) {
      setAmounts(proportionalSplitPreview)
    } else if (selectedPreview === 'none') {
      setAmounts(baseAmounts)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreview])

  if (!isOpen) {
    return null
  }

  const handleSelectEven = () => {
    setSelectedPreview(selectedPreview === 'even' ? 'none' : 'even')
  }

  const handleSelectProportional = () => {
    setSelectedPreview(selectedPreview === 'proportional' ? 'none' : 'proportional')
  }

  const handleApply = () => {
    onApply(amounts)
    onClose()
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  const showProportionalButton = totalBaseEntered > 0 && baseDifference > 0 && baseDifference < totalExpense

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tax-tip-tool-title"
      onClick={handleOverlayClick}
    >
      <div className="modal" onClick={handleDialogClick}>
        <header className="modal__header">
          <h2 id="tax-tip-tool-title">Tax/Tip tool</h2>
          <p>
            Enter each person's base amount, then preview how the remaining difference (tax, tip, etc.) would be
            distributed evenly or proportionally. Select the method you prefer, or manually adjust amounts.
          </p>
        </header>
        <div className="modal__form">
          <div className="split-grid" style={{ marginBottom: '1rem' }}>
            {participants.map((participant) => {
              const currentAmount = Number.parseFloat(amounts[participant.id] ?? '0')
              const baseAmount = Number.parseFloat(baseAmounts[participant.id] ?? '0')
              const additional = currentAmount - baseAmount
              const showAdditional = selectedPreview !== 'none' && Math.abs(additional) > 0.001

              // Get preview values for both methods (relative to base amounts)
              // Only show the other method's preview when no method is selected
              const evenAdditional =
                evenSplitPreview && selectedPreview === 'none'
                  ? Number.parseFloat(evenSplitPreview[participant.id] ?? '0') - baseAmount
                  : null
              const proportionalAdditional =
                proportionalSplitPreview && selectedPreview === 'none'
                  ? Number.parseFloat(proportionalSplitPreview[participant.id] ?? '0') - baseAmount
                  : null

              const hasOtherPreviews = (evenAdditional !== null && Math.abs(evenAdditional) > 0.001) ||
                (proportionalAdditional !== null && Math.abs(proportionalAdditional) > 0.001)
              const needsExtraSpace = showAdditional || hasOtherPreviews

              return (
                <label
                  key={participant.id}
                  style={{
                    display: 'grid',
                    gap: '0.35rem',
                    marginBottom: needsExtraSpace ? (showAdditional && hasOtherPreviews ? '2.5rem' : '1.75rem') : '0',
                  }}
                >
                  <span>{participant.name}</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={amounts[participant.id] ?? '0'}
                      onChange={(event) => {
                        const newAmounts = { ...amounts, [participant.id]: event.target.value }
                        setAmounts(newAmounts)
                        setBaseAmounts(newAmounts)
                        setSelectedPreview('none')
                      }}
                      onFocus={(event) => event.target.select()}
                      style={{ width: '100%' }}
                    />
                    {showAdditional && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          marginTop: '0.25rem',
                          left: 0,
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          fontWeight: 600,
                        }}
                      >
                        +{currencyFormatter.format(additional)}
                      </div>
                    )}
                    {hasOtherPreviews && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          marginTop: showAdditional ? '1.5rem' : '0.25rem',
                          left: 0,
                          fontSize: '0.7rem',
                          color: '#64748b',
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        {evenAdditional !== null && Math.abs(evenAdditional) > 0.001 && (
                          <span>Even: +{currencyFormatter.format(evenAdditional)}</span>
                        )}
                        {proportionalAdditional !== null && Math.abs(proportionalAdditional) > 0.001 && (
                          <span>Prop: +{currencyFormatter.format(proportionalAdditional)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(248, 250, 252, 0.9)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
              <span>
                Entered total: <strong>{currencyFormatter.format(totalCurrentEntered)}</strong>
              </span>
              <span style={{ color: Math.abs(currentDifference) < 0.02 ? '#15803d' : '#dc2626' }}>
                Difference: <strong>{currencyFormatter.format(currentDifference)}</strong>
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem', display: 'grid', gap: '0.75rem' }}>
            {baseDifference !== 0 && (
              <button
                type="button"
                className={selectedPreview === 'even' ? 'primary-button' : 'ghost-button'}
                onClick={handleSelectEven}
              >
                Cover difference evenly
              </button>
            )}
            {showProportionalButton && (
              <button
                type="button"
                className={selectedPreview === 'proportional' ? 'primary-button' : 'ghost-button'}
                onClick={handleSelectProportional}
              >
                Cover difference proportionally
              </button>
            )}
            {selectedPreview !== 'none' && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSelectedPreview('none')}
                style={{ fontSize: '0.85rem' }}
              >
                Clear selection
              </button>
            )}
          </div>

          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={handleApply}>
              Apply changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

