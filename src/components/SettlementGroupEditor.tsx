import { useEffect, useMemo, useState } from 'react'
import type { Participant, ParticipantId, SettlementGroup } from '../types/domain'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type SettlementGroupEditorProps = {
  isOpen: boolean
  group: SettlementGroup | null
  participants: Participant[]
  existingGroups: SettlementGroup[]
  onClose: () => void
  onSave: (group: SettlementGroup) => void
  onDelete?: (groupId: string) => void
}

function createId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}

export function SettlementGroupEditor({
  isOpen,
  group,
  participants,
  existingGroups,
  onClose,
  onSave,
  onDelete,
}: SettlementGroupEditorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<ParticipantId>>(new Set())

  useBodyScrollLock(isOpen)

  const participantIdsInOtherGroups = useMemo(() => {
    const ids = new Set<ParticipantId>()
    for (const g of existingGroups) {
      if (group && g.id === group.id) continue
      for (const pid of g.participantIds) {
        ids.add(pid)
      }
    }
    return ids
  }, [existingGroups, group])

  useEffect(() => {
    if (isOpen) {
      if (group) {
        setSelectedIds(new Set(group.participantIds))
      } else {
        setSelectedIds(new Set())
      }
    }
  }, [group, isOpen])

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name)),
    [participants],
  )

  if (!isOpen) {
    return null
  }

  const toggleParticipant = (participantId: ParticipantId) => {
    const inOtherGroup = participantIdsInOtherGroups.has(participantId)
    if (inOtherGroup && !selectedIds.has(participantId)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }
      return next
    })
  }

  const isParticipantDisabled = (participantId: ParticipantId) => {
    return participantIdsInOtherGroups.has(participantId) && !selectedIds.has(participantId)
  }

  const canSave = selectedIds.size >= 2

  const getGroupName = () => {
    const names = sortedParticipants
      .filter((p) => selectedIds.has(p.id))
      .map((p) => p.name)
    return names.join(' + ')
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    const groupName = getGroupName()
    if (group) {
      onSave({ ...group, name: groupName, participantIds: Array.from(selectedIds) })
    } else {
      onSave({
        id: createId('sg'),
        name: groupName,
        participantIds: Array.from(selectedIds),
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (group && onDelete) {
      onDelete(group.id)
      onClose()
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-group-editor-title"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 id="settlement-group-editor-title">
            {group ? 'Edit settlement group' : 'Add settlement group'}
          </h2>
          <p>
            {group
              ? 'Combine participants so their balances are netted together for settlements.'
              : 'Select participants to group together. Their balances will be combined for fewer transfers.'}
          </p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <div style={{ marginTop: 0 }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Participants in this group
            </span>
            <div
              className="settlement-group-editor__participants"
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                display: 'grid',
                gap: '0.5rem',
              }}
            >
              {sortedParticipants.map((participant) => {
                const disabled = isParticipantDisabled(participant.id)
                return (
                  <label
                    key={participant.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      opacity: disabled ? 0.6 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(participant.id)}
                      onChange={() => toggleParticipant(participant.id)}
                      disabled={disabled}
                    />
                    <span>{participant.name}</span>
                    {disabled && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        (in another group)
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
            <small
              style={{
                display: 'block',
                marginTop: '0.5rem',
                color: selectedIds.size >= 2 ? 'inherit' : 'var(--color-danger, #dc2626)',
              }}
            >
              Select at least two participants ({selectedIds.size} selected)
            </small>
          </div>

          <div className="modal__actions">
            {group && onDelete ? (
              <button type="button" className="ghost-button ghost-button--danger" onClick={handleDelete}>
                Remove group
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
              <button type="button" className="ghost-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={!canSave}>
                {group ? 'Save changes' : 'Add group'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
