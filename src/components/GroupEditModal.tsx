import { useEffect, useMemo, useState } from 'react'
import type { Participant, ParticipantGroup, ParticipantId } from '../types/domain'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

type GroupEditModalProps = {
  isOpen: boolean
  group: ParticipantGroup | null
  participants: Participant[]
  onClose: () => void
  onSave: (groupId: string, updates: { name: string; participantIds: ParticipantId[] }) => void
}

export function GroupEditModal({ isOpen, group, participants, onClose, onSave }: GroupEditModalProps) {
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<ParticipantId>>(new Set())

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (isOpen && group) {
      setName(group.name)
      setSelectedIds(new Set(group.participantIds))
    }
  }, [group, isOpen])

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name)),
    [participants],
  )

  if (!isOpen || !group) {
    return null
  }

  const toggleParticipant = (participantId: ParticipantId) => {
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

  const canSave = name.trim().length > 0 && selectedIds.size > 1

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    onSave(group.id, { name: name.trim(), participantIds: Array.from(selectedIds) })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-group-title" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2 id="edit-group-title">Edit group</h2>
          <p>Rename the group and adjust which participants belong to it.</p>
        </header>
        <form className="modal__form" onSubmit={handleSubmit}>
          <label>
            <span>Group name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" required />
          </label>

          <div style={{ marginTop: '1rem' }}>
            <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Group participants</span>
            <div
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
              {sortedParticipants.map((participant) => (
                <label key={participant.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(participant.id)}
                    onChange={() => toggleParticipant(participant.id)}
                  />
                  <span>{participant.name}</span>
                </label>
              ))}
            </div>
            <small style={{ display: 'block', marginTop: '0.5rem', color: selectedIds.size > 1 ? 'inherit' : '#dc2626' }}>
              Select at least two participants ({selectedIds.size} selected)
            </small>
          </div>

          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={!canSave}>
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


