import { useEffect, useMemo, useState } from 'react'
import type { Event, Participant, ParticipantGroup, ParticipantId } from '../types/domain'
import { getAllParticipants } from '../utils/participants'
import { GroupCreateModal } from './GroupCreateModal'
import { GroupEditModal } from './GroupEditModal'

type ParticipantsTabProps = {
  events: Event[]
  groups: ParticipantGroup[]
  participants: Participant[]
  unassignedParticipants: Participant[]
  onEditParticipant: (participantId: ParticipantId, eventId: string) => void
  onDeleteParticipant: (participantId: ParticipantId) => void
  onCreateParticipant: (name: string) => void
  onAddParticipantsToEvent: (participantIds: ParticipantId[], eventId: string) => void
  onNavigateToEvent?: (eventId: string) => void
  onCreateGroup: (draft: { name: string; participantIds: ParticipantId[] }) => void
  onDeleteGroup: (groupId: string) => void
  onUpdateGroup: (groupId: string, updates: { name: string; participantIds: ParticipantId[] }) => void
}

export function ParticipantsTab({
  events,
  groups,
  participants: allParticipants,
  unassignedParticipants,
  onEditParticipant,
  onDeleteParticipant,
  onCreateParticipant,
  onAddParticipantsToEvent,
  onNavigateToEvent,
  onCreateGroup,
  onDeleteGroup,
  onUpdateGroup,
}: ParticipantsTabProps) {
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<ParticipantId>>(new Set())
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [showAddToEventModal, setShowAddToEventModal] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [pendingGroupName, setPendingGroupName] = useState('')
  const [newParticipantName, setNewParticipantName] = useState('')
  const [targetEventId, setTargetEventId] = useState<string>('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const uniqueParticipants = useMemo(() => {
    const eventParticipants = getAllParticipants(events)
    const all = [...eventParticipants, ...unassignedParticipants]
    // Deduplicate by ID
    const participantMap = new Map<ParticipantId, Participant>()
    all.forEach((p) => {
      if (!participantMap.has(p.id)) {
        participantMap.set(p.id, p)
      }
    })
    return Array.from(participantMap.values())
  }, [events, unassignedParticipants])

  const handleSubmitParticipant = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = newParticipantName.trim()
    if (!trimmed) return
    onCreateParticipant(trimmed)
    setNewParticipantName('')
  }

  const participantMap = useMemo(() => {
    const map = new Map<ParticipantId, Participant>()
    allParticipants.forEach((p) => map.set(p.id, p))
    unassignedParticipants.forEach((p) => map.set(p.id, p))
    return map
  }, [allParticipants, unassignedParticipants])

  const participantOptions = useMemo(() => Array.from(participantMap.values()), [participantMap])

  const checkIfSelectionMatchesGroup = (selectedIds: Set<ParticipantId>): string | null => {
    const selectedArray = Array.from(selectedIds).sort()
    const matchingGroup = groups.find((g) => {
      const groupArray = [...g.participantIds].sort()
      return selectedArray.length === groupArray.length && selectedArray.every((id, idx) => id === groupArray[idx])
    })
    return matchingGroup?.id ?? null
  }

  const handleParticipantToggle = (participantId: ParticipantId) => {
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }

      // Check if selection matches an existing group
      const matchingGroupId = checkIfSelectionMatchesGroup(next)
      // If selection no longer matches the selected group, deselect it
      if (selectedGroupId && matchingGroupId !== selectedGroupId) {
        setSelectedGroupId(null)
      } else {
        setSelectedGroupId(matchingGroupId)
      }

      return next
    })
  }

  const handleGroupToggle = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return

    if (selectedGroupId === groupId) {
      // Deselect group
      setSelectedGroupId(null)
      setSelectedParticipantIds(new Set())
    } else {
      // Select group
      setSelectedGroupId(groupId)
      setSelectedParticipantIds(new Set(group.participantIds))
    }
  }

  const matchingSelectedGroupId = checkIfSelectionMatchesGroup(selectedParticipantIds)

  const handleAddToEvent = () => {
    if (selectedParticipantIds.size === 0) return
    if (events.length === 0) return

    // Set default event if not set
    if (!targetEventId) {
      setTargetEventId(events[0].id)
    }

    // Always show modal to select event
    setShowAddToEventModal(true)
  }

  const handleConfirmAddToEvent = () => {
    if (selectedParticipantIds.size === 0) return
    const eventId = targetEventId || events[0].id
    const matchingGroupId = checkIfSelectionMatchesGroup(selectedParticipantIds)
    
    // If group name is provided and selection doesn't match an existing group, create the group
    if (selectedParticipantIds.size > 1 && pendingGroupName.trim() && !matchingGroupId) {
      onCreateGroup({
        name: pendingGroupName.trim(),
        participantIds: Array.from(selectedParticipantIds),
      })
    }
    
    onAddParticipantsToEvent(Array.from(selectedParticipantIds), eventId)
    setShowAddToEventModal(false)
    setSelectedParticipantIds(new Set())
    setSelectedGroupId(null)
    setPendingGroupName('')
    
    // Navigate to the event
    if (onNavigateToEvent) {
      onNavigateToEvent(eventId)
    }
  }

  const handleEditParticipant = (participantId: ParticipantId, event: React.MouseEvent) => {
    event.stopPropagation()
    const participantEvents = events.filter((e) => e.participants.some((p) => p.id === participantId))
    if (participantEvents.length > 0) {
      onEditParticipant(participantId, participantEvents[0].id)
    } else if (unassignedParticipants.some((p) => p.id === participantId)) {
      // For unassigned participants, use the first event as a fallback (or create a dummy eventId)
      // The handler should handle unassigned participants
      if (events.length > 0) {
        onEditParticipant(participantId, events[0].id)
      } else {
        // If no events exist, we still need to allow editing
        // We'll use a special marker or handle it differently
        onEditParticipant(participantId, '')
      }
    }
  }

  const handleDeleteParticipant = (participantId: ParticipantId, event: React.MouseEvent) => {
    event.stopPropagation()
    onDeleteParticipant(participantId)
  }

  const handleCreateGroupCancel = () => {
    setShowAddToEventModal(false)
    setPendingGroupName('')
  }

  const handleCreateGroup = (name: string) => {
    if (selectedParticipantIds.size <= 1) return
    onCreateGroup({
      name,
      participantIds: Array.from(selectedParticipantIds),
    })
    setShowCreateGroupModal(false)
    setPendingGroupName('')
    setSelectedParticipantIds(new Set())
    setSelectedGroupId(null)
  }

  const handleCreateGroupModalClose = () => {
    setShowCreateGroupModal(false)
    setPendingGroupName('')
  }

  const editingGroup = editingGroupId ? groups.find((g) => g.id === editingGroupId) ?? null : null

  const handleSaveEditedGroup = (groupId: string, updates: { name: string; participantIds: ParticipantId[] }) => {
    onUpdateGroup(groupId, updates)
    setEditingGroupId(null)
  }

  const handleCloseEditGroupModal = () => {
    setEditingGroupId(null)
  }

  useEffect(() => {
    if (editingGroupId && !groups.some((group) => group.id === editingGroupId)) {
      setEditingGroupId(null)
    }
  }, [editingGroupId, groups])

  return (
    <>
      <section className="surface view-section">
        <header className="section-header">
          <div className="section-heading">
            <h2 className="section-title">Participants</h2>
            <p className="section-subtitle">Manage all participants across all events</p>
          </div>
          {selectedParticipantIds.size > 0 && (
            <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button className="primary-button" onClick={handleAddToEvent} type="button">
                Add participants to an event ({selectedParticipantIds.size})
              </button>
              {selectedParticipantIds.size > 1 && !matchingSelectedGroupId && (
                <button className="ghost-button" onClick={() => setShowCreateGroupModal(true)} type="button">
                  Create group ({selectedParticipantIds.size})
                </button>
              )}
            </div>
          )}
        </header>

        <section aria-labelledby="participants-heading">
          <div className="panel-heading">
            <h3 id="participants-heading">All Participants</h3>
            <span className="badge">{uniqueParticipants.length}</span>
          </div>
          <form className="inline-form participant-form" onSubmit={handleSubmitParticipant}>
            <label className="sr-only" htmlFor="new-participant">
              New participant name
            </label>
            <div className="input-group" style={{ flex: '1' }}>
              <input
                id="new-participant"
                type="text"
                value={newParticipantName}
                onChange={(event) => setNewParticipantName(event.target.value)}
                placeholder="Add someone new"
                className="input-group__control"
              />
              <button type="submit" className="input-group__button" aria-label="Add participant" disabled={!newParticipantName.trim()}>
                Add
              </button>
            </div>
          </form>
          {uniqueParticipants.length === 0 ? (
            <div className="empty-state">
              <strong>No participants</strong>
              <p>Participants will appear here once added to events.</p>
            </div>
          ) : (
            <ul className="participant-pill-list" style={{ marginTop: '1rem' }}>
              {uniqueParticipants.map((participant) => {
                const isSelected = selectedParticipantIds.has(participant.id)
                const participantEvents = events.filter((e) => e.participants.some((p) => p.id === participant.id))
                const firstEventId = participantEvents[0]?.id

                return (
                  <li
                    key={participant.id}
                    className="participant-pill"
                    style={{
                      position: 'relative',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                      cursor: 'pointer',
                      width: 'auto',
                      maxWidth: '100%',
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      handleParticipantToggle(participant.id)
                    }}
                  >
                    <label
                      style={{
                        position: 'absolute',
                        left: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleParticipantToggle(participant.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                      />
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: isSelected ? '2px solid #2563eb' : '2px solid rgba(148, 163, 184, 0.6)',
                          background: isSelected ? '#2563eb' : 'transparent',
                          boxShadow: isSelected ? 'inset 0 0 0 3px #eef2ff' : 'none',
                          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      ></span>
                    </label>
                    <div style={{ 
                      flex: 1,
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.25rem',
                      minWidth: '6rem',
                      paddingRight: '2.5rem',
                    }}>
                      <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{participant.name}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-secondary)',
                          fontWeight: '400',
                        }}
                      >
                        {participant.id}
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        display: 'flex',
                        gap: '0.25rem',
                      }}
                    >
                      <button
                        type="button"
                        className="edit-name-button"
                        onClick={(e) => handleEditParticipant(participant.id, e)}
                        aria-label={`Edit ${participant.name}`}
                        style={{
                          padding: '0.25rem',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.5 1.5L14.5 4.5L5.5 13.5L2.5 10.5L11.5 1.5Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.5 3.5L12.5 6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M2.5 10.5L1.5 14.5L5.5 13.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={(e) => handleDeleteParticipant(participant.id, e)}
                        aria-label={`Delete ${participant.name}`}
                        style={{
                          padding: '0.25rem',
                        }}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {groups.length > 0 && (
          <section aria-labelledby="groups-heading" style={{ marginTop: '2rem' }}>
            <div className="panel-heading">
              <h3 id="groups-heading">Groups</h3>
              <span className="badge">{groups.length}</span>
            </div>
            <ul className="participant-pill-list" style={{ marginTop: '1rem' }}>
              {groups.map((group) => {
                const isSelected = selectedGroupId === group.id
                const groupParticipantNames = group.participantIds
                  .map((id) => participantMap.get(id)?.name)
                  .filter(Boolean)
                  .join(', ')

                return (
                  <li
                    key={group.id}
                    className="participant-pill"
                    style={{
                      position: 'relative',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                      cursor: 'pointer',
                      width: 'auto',
                      maxWidth: '100%',
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      handleGroupToggle(group.id)
                    }}
                  >
                    <label
                      style={{
                        position: 'absolute',
                        left: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleGroupToggle(group.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                      />
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          border: isSelected ? '2px solid #2563eb' : '2px solid rgba(148, 163, 184, 0.6)',
                          background: isSelected ? '#2563eb' : 'transparent',
                          boxShadow: isSelected ? 'inset 0 0 0 3px #eef2ff' : 'none',
                          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      ></span>
                    </label>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingRight: '1.25rem' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{group.name}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-secondary)',
                          fontWeight: '400',
                        }}
                      >
                        {groupParticipantNames}
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        display: 'flex',
                        gap: '0.25rem',
                      }}
                    >
                      <button
                        type="button"
                        className="edit-name-button"
                        aria-label={`Edit group ${group.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingGroupId(group.id)
                        }}
                        style={{
                          padding: '0.25rem',
                        }}
                      >
                        <svg
                          aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M11.5 1.5L14.5 4.5L5.5 13.5L2.5 10.5L11.5 1.5Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.5 3.5L12.5 6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M2.5 10.5L1.5 14.5L5.5 13.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteGroup(group.id)
                        }}
                        aria-label={`Delete group ${group.name}`}
                        style={{
                          padding: '0.25rem',
                        }}
                      >
                        <span aria-hidden>×</span>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </section>

      {showAddToEventModal && (() => {
        const matchingGroupId = checkIfSelectionMatchesGroup(selectedParticipantIds)
        const matchingGroup = matchingGroupId ? groups.find((g) => g.id === matchingGroupId) : null
        const allowNewGroup = selectedParticipantIds.size > 1 && !matchingGroup
        
        return (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleCreateGroupCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <header className="modal__header">
                <h2>Add participants to event</h2>
                <p>Select which event to add {selectedParticipantIds.size} participant{selectedParticipantIds.size !== 1 ? 's' : ''} to.</p>
              </header>
              <div className="modal__form">
                {matchingGroup && (
                  <div style={{ 
                    marginBottom: '1rem', 
                    padding: '0.75rem', 
                    background: 'var(--color-surface-secondary, rgba(148, 163, 184, 0.1))', 
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem'
                  }}>
                    <strong>Group:</strong> {matchingGroup.name}
                  </div>
                )}
                <label>
                  <span>Select event</span>
                  <select
                    value={targetEventId || events[0].id}
                    onChange={(e) => setTargetEventId(e.target.value)}
                    autoFocus={!!matchingGroup}
                  >
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </label>
                {allowNewGroup && (
                  <label>
                    <span>Group name (optional)</span>
                    <input
                      type="text"
                      value={pendingGroupName}
                      onChange={(e) => setPendingGroupName(e.target.value)}
                      placeholder="e.g. Family, Roommates, Work Team"
                      autoFocus
                    />
                  </label>
                )}
                <div className="modal__actions">
                  <button type="button" className="ghost-button" onClick={handleCreateGroupCancel}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleConfirmAddToEvent}
                  >
                    {pendingGroupName.trim() && allowNewGroup ? 'Create group and add' : 'Add to event'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {showCreateGroupModal && (
        <GroupCreateModal
          isOpen={showCreateGroupModal}
          onClose={handleCreateGroupModalClose}
          onCreate={handleCreateGroup}
          selectedParticipants={Array.from(selectedParticipantIds)
            .map((id) => participantMap.get(id))
            .filter((p): p is Participant => p !== undefined)}
        />
      )}

      {editingGroup && (
        <GroupEditModal
          isOpen={Boolean(editingGroup)}
          group={editingGroup}
          participants={participantOptions}
          onClose={handleCloseEditGroupModal}
          onSave={handleSaveEditedGroup}
        />
      )}
    </>
  )
}
