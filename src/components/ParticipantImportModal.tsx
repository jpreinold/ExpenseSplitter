import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Event, Participant, ParticipantGroup, ParticipantId } from '../types/domain'

type ParticipantImportModalProps = {
  isOpen: boolean
  onClose: () => void
  onImport: (participantIds: ParticipantId[]) => void
  onCreateGroup: (name: string, participantIds: ParticipantId[]) => void
  groups: ParticipantGroup[]
  events: Event[]
  currentEventId: string
  allParticipants: Participant[]
}

export function ParticipantImportModal({
  isOpen,
  onClose,
  onImport,
  onCreateGroup,
  groups,
  events,
  currentEventId,
  allParticipants,
}: ParticipantImportModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<ParticipantId>>(new Set())
  const [eventParticipantSelections, setEventParticipantSelections] = useState<Map<string, Set<ParticipantId>>>(new Map())
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [pendingGroupName, setPendingGroupName] = useState('')
  const [pendingGroupParticipants, setPendingGroupParticipants] = useState<ParticipantId[]>([])

  const currentEvent = useMemo(() => events.find((e) => e.id === currentEventId), [events, currentEventId])
  const currentEventParticipantIds = useMemo(() => new Set(currentEvent?.participants.map((p) => p.id) ?? []), [currentEvent])

  const otherEvents = useMemo(() => events.filter((e) => e.id !== currentEventId), [events, currentEventId])

  const participantMap = useMemo(() => {
    const map = new Map<ParticipantId, Participant>()
    allParticipants.forEach((p) => map.set(p.id, p))
    return map
  }, [allParticipants])

  const handleGroupSelect = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    setSelectedGroupId(groupId)
    // All participants from group are selected by default
    setSelectedParticipantIds(new Set(group.participantIds))
    // Clear event selections when selecting a group
    setEventParticipantSelections(new Map())
  }

  const handleGroupParticipantToggle = (participantId: ParticipantId) => {
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }
      return next
    })
  }

  const handleEventParticipantToggle = (eventId: string, participantId: ParticipantId) => {
    setEventParticipantSelections((prev) => {
      const next = new Map(prev)
      const eventSelections = next.get(eventId) ?? new Set<ParticipantId>()
      const updated = new Set(eventSelections)
      if (updated.has(participantId)) {
        updated.delete(participantId)
      } else {
        updated.add(participantId)
      }
      next.set(eventId, updated)
      return next
    })
    // Clear group selection when selecting from events
    setSelectedGroupId(null)
    setSelectedParticipantIds(new Set())
  }

  const handleCreateGroupFromEvent = (eventId: string) => {
    const event = events.find((e) => e.id === eventId)
    if (!event) return

    const selected = eventParticipantSelections.get(eventId) ?? new Set(event.participants.map((p) => p.id))
    setPendingGroupParticipants(Array.from(selected))
    setShowCreateGroupModal(true)
  }

  const handleCreateGroupConfirm = (name: string) => {
    onCreateGroup(name, pendingGroupParticipants)
    setShowCreateGroupModal(false)
    setPendingGroupName('')
    setPendingGroupParticipants([])
  }

  const handleImport = () => {
    let participantIdsToImport: ParticipantId[] = []

    if (selectedGroupId) {
      // Import from selected group
      participantIdsToImport = Array.from(selectedParticipantIds)
    } else {
      // Import from selected events
      const allSelected = new Set<ParticipantId>()
      eventParticipantSelections.forEach((selections) => {
        selections.forEach((id) => allSelected.add(id))
      })
      participantIdsToImport = Array.from(allSelected)
    }

    // Filter out participants already in current event
    participantIdsToImport = participantIdsToImport.filter((id) => !currentEventParticipantIds.has(id))

    if (participantIdsToImport.length > 0) {
      onImport(participantIdsToImport)
      onClose()
    }
  }

  const getImportableParticipants = () => {
    if (selectedGroupId) {
      return Array.from(selectedParticipantIds).filter((id) => !currentEventParticipantIds.has(id))
    } else {
      const allSelected = new Set<ParticipantId>()
      eventParticipantSelections.forEach((selections) => {
        selections.forEach((id) => allSelected.add(id))
      })
      return Array.from(allSelected).filter((id) => !currentEventParticipantIds.has(id))
    }
  }

  const importableCount = getImportableParticipants().length

  if (!isOpen) {
    return null
  }

  const handleOverlayClick = () => {
    onClose()
  }

  const handleDialogClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  return (
    <>
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-participants-title" onClick={handleOverlayClick}>
        <div className="modal modal--large" onClick={handleDialogClick}>
          <header className="modal__header">
            <h2 id="import-participants-title">Import participants</h2>
            <p>Select participants from existing groups or events to add to this event.</p>
          </header>
          <div className="modal__content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {groups.length > 0 && (
              <section style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>Groups</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {groups.map((group) => (
                    <div key={group.id} style={{ border: '1px solid var(--color-border)', borderRadius: '0.5rem', padding: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="import-source"
                          checked={selectedGroupId === group.id}
                          onChange={() => handleGroupSelect(group.id)}
                        />
                        <strong>{group.name}</strong>
                        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                          ({group.participantIds.length} participants)
                        </span>
                      </label>
                      {selectedGroupId === group.id && (
                        <div style={{ marginLeft: '1.5rem', marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {group.participantIds.map((participantId) => {
                            const participant = participantMap.get(participantId)
                            if (!participant) return null
                            const isSelected = selectedParticipantIds.has(participantId)
                            const alreadyInEvent = currentEventParticipantIds.has(participantId)
                            return (
                              <label
                                key={participantId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: alreadyInEvent ? 'var(--color-surface-secondary)' : isSelected ? 'var(--color-primary-light)' : 'transparent',
                                  cursor: alreadyInEvent ? 'not-allowed' : 'pointer',
                                  opacity: alreadyInEvent ? 0.5 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={alreadyInEvent}
                                  onChange={() => handleGroupParticipantToggle(participantId)}
                                />
                                <span style={{ fontSize: '0.875rem' }}>{participant.name}</span>
                                {alreadyInEvent && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>(already added)</span>}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {otherEvents.length > 0 && (
              <section>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '600' }}>Events</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {otherEvents.map((event) => {
                    const eventSelections =
                      eventParticipantSelections.get(event.id) ??
                      new Set(event.participants.map((p) => p.id))
                    return (
                      <div key={event.id} style={{ border: '1px solid var(--color-border)', borderRadius: '0.5rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div>
                            <strong>{event.name}</strong>
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>
                              ({event.participants.length} participants)
                            </span>
                          </div>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleCreateGroupFromEvent(event.id)}
                            style={{ fontSize: '0.875rem' }}
                          >
                            Create group
                          </button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {event.participants.map((participant) => {
                            const isSelected = eventSelections.has(participant.id)
                            const alreadyInEvent = currentEventParticipantIds.has(participant.id)
                            return (
                              <label
                                key={participant.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: alreadyInEvent ? 'var(--color-surface-secondary)' : isSelected ? 'var(--color-primary-light)' : 'transparent',
                                  cursor: alreadyInEvent ? 'not-allowed' : 'pointer',
                                  opacity: alreadyInEvent ? 0.5 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={alreadyInEvent}
                                  onChange={() => handleEventParticipantToggle(event.id, participant.id)}
                                />
                                <span style={{ fontSize: '0.875rem' }}>{participant.name}</span>
                                {alreadyInEvent && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>(already added)</span>}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {groups.length === 0 && otherEvents.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                <p>No groups or events available to import from.</p>
              </div>
            )}
          </div>
          <div className="modal__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary-button" onClick={handleImport} disabled={importableCount === 0}>
              Import {importableCount > 0 ? `(${importableCount})` : ''}
            </button>
          </div>
        </div>
      </div>

      {showCreateGroupModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal__header">
              <h2>Create group</h2>
              <p>Give this group a name to easily add these participants to future events.</p>
            </header>
            <div className="modal__form">
              <label>
                <span>Group name</span>
                <input
                  type="text"
                  value={pendingGroupName}
                  onChange={(e) => setPendingGroupName(e.target.value)}
                  placeholder="e.g. Family, Roommates, Work Team"
                  autoFocus
                />
              </label>
              <div className="modal__actions">
                <button type="button" className="ghost-button" onClick={() => setShowCreateGroupModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleCreateGroupConfirm(pendingGroupName)}
                  disabled={!pendingGroupName.trim()}
                >
                  Create group
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

