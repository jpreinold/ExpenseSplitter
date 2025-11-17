import { useEffect, useMemo, useState } from 'react'
import type { Event, Participant, ParticipantGroup, ParticipantId } from '../types/domain'
import { getAllParticipants } from '../utils/participants'
import { GroupCreateModal } from './GroupCreateModal'
import { GroupEditModal } from './GroupEditModal'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

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

type EventSelectionSet = {
  id: string
  name: string
  participantIds: ParticipantId[]
  participantNames: string[]
  event: Event
}

type ParticipantsFilterResult = {
  participants: Participant[]
  groups: ParticipantGroup[]
  events: EventSelectionSet[]
  descriptor: string | null
  mode: 'group' | 'participant' | 'event' | null
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
  const [participantQuery, setParticipantQuery] = useState('')

  useBodyScrollLock(showAddToEventModal)
  const [targetEventId, setTargetEventId] = useState<string>('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

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

  const createParticipantFromQuery = () => {
    const trimmed = participantQuery.trim()
    if (!trimmed) return
    onCreateParticipant(trimmed)
    setParticipantQuery('')
  }

  const handleSubmitParticipant = (event: React.FormEvent) => {
    event.preventDefault()
    createParticipantFromQuery()
  }

  const participantMap = useMemo(() => {
    const map = new Map<ParticipantId, Participant>()
    allParticipants.forEach((p) => map.set(p.id, p))
    unassignedParticipants.forEach((p) => map.set(p.id, p))
    return map
  }, [allParticipants, unassignedParticipants])

  const participantOptions = useMemo(() => Array.from(participantMap.values()), [participantMap])

  const eventSelectionSets = useMemo<EventSelectionSet[]>(() => {
    return events.map((event) => ({
      id: event.id,
      name: event.name,
      participantIds: event.participants.map((participant) => participant.id),
      participantNames: event.participants.map((participant) => participant.name),
      event,
    }))
  }, [events])

  const normalizedFilter = participantQuery.trim().toLowerCase()

  const filterResults = useMemo<ParticipantsFilterResult>(() => {
    if (!normalizedFilter) {
      return {
        participants: uniqueParticipants,
        groups,
        events: eventSelectionSets,
        descriptor: null,
        mode: null,
      }
    }

    const groupMatches = groups.filter((group) =>
      group.name.toLowerCase().includes(normalizedFilter),
    )

    if (groupMatches.length > 0) {
      const participantIdsFromGroups = new Set(
        groupMatches.flatMap((group) => group.participantIds),
      )
      return {
        participants: uniqueParticipants.filter((participant) =>
          participantIdsFromGroups.has(participant.id),
        ),
        groups: groupMatches,
        events: eventSelectionSets.filter((eventSet) =>
          eventSet.participantIds.some((id) => participantIdsFromGroups.has(id)),
        ),
        descriptor:
          groupMatches.length === 1
            ? `group “${groupMatches[0].name}”`
            : `${groupMatches.length} groups`,
        mode: 'group',
      }
    }

    const participantMatches = uniqueParticipants.filter((participant) =>
      participant.name.toLowerCase().includes(normalizedFilter),
    )

    if (participantMatches.length > 0) {
      const participantIds = new Set(participantMatches.map((participant) => participant.id))
      return {
        participants: participantMatches,
        groups: groups.filter((group) =>
          group.participantIds.some((id) => participantIds.has(id)),
        ),
        events: eventSelectionSets.filter((eventSet) =>
          eventSet.participantIds.some((id) => participantIds.has(id)),
        ),
        descriptor:
          participantMatches.length === 1
            ? `participant “${participantMatches[0].name}”`
            : `${participantMatches.length} participants`,
        mode: 'participant',
      }
    }

    const eventMatches = eventSelectionSets.filter((eventSet) =>
      eventSet.name.toLowerCase().includes(normalizedFilter),
    )

    if (eventMatches.length > 0) {
      const participantIdsFromEvents = new Set(
        eventMatches.flatMap((eventSet) => eventSet.participantIds),
      )
      return {
        participants: uniqueParticipants.filter((participant) =>
          participantIdsFromEvents.has(participant.id),
        ),
        groups: groups.filter((group) =>
          group.participantIds.some((id) => participantIdsFromEvents.has(id)),
        ),
        events: eventMatches,
        descriptor:
          eventMatches.length === 1
            ? `event “${eventMatches[0].name}”`
            : `${eventMatches.length} events`,
        mode: 'event',
      }
    }

    return {
      participants: [],
      groups: [],
      events: [],
      descriptor: null,
      mode: null,
    }
  }, [normalizedFilter, eventSelectionSets, groups, uniqueParticipants])

  const participantsToRender = filterResults.participants
  const groupsToRender = filterResults.groups
  const eventsToRender = filterResults.events
  const filterDescriptor = filterResults.descriptor
  const isFiltering = normalizedFilter.length > 0
  const selectedGroupName = selectedGroupId
    ? groups.find((group) => group.id === selectedGroupId)?.name ?? null
    : null
  const selectedEventName = selectedEventId
    ? events.find((event) => event.id === selectedEventId)?.name ?? null
    : null

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

      const matchingGroupId = checkIfSelectionMatchesGroup(next)
      setSelectedGroupId(matchingGroupId)
      if (selectedEventId) {
        setSelectedEventId(null)
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
      setSelectedEventId(null)
      setSelectedParticipantIds(new Set())
    } else {
      // Select group
      setSelectedGroupId(groupId)
      setSelectedEventId(null)
      setSelectedParticipantIds(new Set(group.participantIds))
    }
  }

  const handleEventToggle = (eventId: string) => {
    const eventSet = eventSelectionSets.find((event) => event.id === eventId)
    if (!eventSet) return

    if (selectedEventId === eventId) {
      setSelectedEventId(null)
      setSelectedParticipantIds(new Set())
      setSelectedGroupId(null)
      return
    }

    setSelectedEventId(eventId)
    setSelectedGroupId(null)
    setSelectedParticipantIds(new Set(eventSet.participantIds))
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
    setSelectedEventId(null)
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
    setSelectedEventId(null)
  }

  const clearSelection = () => {
    setSelectedParticipantIds(new Set())
    setSelectedGroupId(null)
    setSelectedEventId(null)
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
      <section className="surface view-section participants-board">
        <header className="section-header">
          <div className="section-heading">
            <h2 className="section-title">Participants</h2>
            <p className="section-subtitle">Manage people, groups, and reusable sets</p>
          </div>
        </header>

        <div className="participant-toolbar">
          <form className="participant-search" onSubmit={handleSubmitParticipant}>
            <label className="sr-only" htmlFor="participant-query-input">
              Search or add participants
            </label>
            <div className="input-group participant-search__group">
              <input
                id="participant-query-input"
                type="text"
                value={participantQuery}
                onChange={(event) => setParticipantQuery(event.target.value)}
                placeholder="Search names, groups, or events — or add someone new"
                className="input-group__control"
                autoComplete="off"
              />
              <button
                type="submit"
                className="input-group__button"
                aria-label="Add participant"
                disabled={!participantQuery.trim()}
              >
                Add new
              </button>
            </div>
          </form>
          {isFiltering && (
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={() => setParticipantQuery('')}
            >
              Clear filter
            </button>
          )}
        </div>

        {isFiltering && (
          <div className="filter-hint">
            Showing matches for “{participantQuery.trim()}”
            {filterDescriptor ? <span> · Based on {filterDescriptor}</span> : null}
          </div>
        )}

        {selectedParticipantIds.size > 0 && (
          <div className="selection-summary">
            <div className="selection-summary__details">
              <span className="selection-summary__count">{selectedParticipantIds.size}</span>
              selected
              {selectedGroupName && (
                <span className="selection-summary__context"> · group {selectedGroupName}</span>
              )}
              {selectedEventName && (
                <span className="selection-summary__context"> · event {selectedEventName}</span>
              )}
            </div>
            <div className="selection-summary__actions">
              <button className="primary-button" onClick={handleAddToEvent} type="button">
                Add to event
              </button>
              {selectedParticipantIds.size > 1 && !matchingSelectedGroupId && (
                <button className="ghost-button" onClick={() => setShowCreateGroupModal(true)} type="button">
                  Save as group
                </button>
              )}
              <button className="ghost-button ghost-button--muted" type="button" onClick={clearSelection}>
                Clear selection
              </button>
            </div>
          </div>
        )}

        <div className="participants-layout">
          <div className="participants-column">
            <div className="panel-heading panel-heading--subtle">
              <h3 id="participants-heading">{isFiltering ? 'Matching people' : 'All participants'}</h3>
              <span className="badge">{participantsToRender.length}</span>
            </div>

            {participantsToRender.length === 0 ? (
              <div className="empty-state empty-state--narrow">
                {isFiltering ? (
                  <>
                    <strong>No people match</strong>
                    <p>Try another search, or add them as a brand-new participant.</p>
                    {participantQuery.trim() && (
                      <button type="button" className="primary-button" onClick={createParticipantFromQuery}>
                        Add “{participantQuery.trim()}”
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <strong>No participants yet</strong>
                    <p>Start by adding someone new to your workspace.</p>
                  </>
                )}
              </div>
            ) : (
              <ul className="people-grid">
                {participantsToRender.map((participant) => {
                  const isSelected = selectedParticipantIds.has(participant.id)
                  return (
                    <li
                      key={participant.id}
                      className={`participant-card participant-card--compact${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleParticipantToggle(participant.id)}
                    >
                      <div className="participant-card__top">
                        <label className="checkbox-chip" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => {
                              event.stopPropagation()
                              handleParticipantToggle(participant.id)
                            }}
                          />
                          <span aria-hidden />
                        </label>
                        <div className="participant-card__actions">
                          <button
                            type="button"
                            className="edit-name-button"
                            aria-label={`Edit ${participant.name}`}
                            onClick={(event) => handleEditParticipant(participant.id, event)}
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
                            aria-label={`Delete ${participant.name}`}
                            onClick={(event) => handleDeleteParticipant(participant.id, event)}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </div>
                      </div>
                      <div className="participant-card__info">
                        <p className="participant-card__name">{participant.name}</p>
                        <p className="participant-card__meta" title={participant.id}>
                          {participant.id}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <aside className="collections-column">
            <section className="collection-panel">
              <div className="panel-heading panel-heading--subtle">
                <h3 id="groups-heading">{isFiltering ? 'Matching groups' : 'Groups'}</h3>
                <span className="badge">{groupsToRender.length}</span>
              </div>
              {groupsToRender.length === 0 ? (
                <div className="empty-state empty-state--narrow">
                  {isFiltering ? (
                    <>
                      <strong>No groups match</strong>
                      <p>Keep typing or select multiple people to save a new group.</p>
                    </>
                  ) : (
                    <>
                      <strong>No groups yet</strong>
                      <p>Group frequent travelers, teams, or families to reuse later.</p>
                    </>
                  )}
                </div>
              ) : (
                <ul className="collection-grid collection-grid--compact">
                  {groupsToRender.map((group) => {
                    const isSelected = selectedGroupId === group.id
                    const groupParticipantNames = group.participantIds
                      .map((id) => participantMap.get(id)?.name)
                      .filter(Boolean)
                      .join(', ')
                    return (
                      <li
                        key={group.id}
                        className={`collection-card collection-card--compact${isSelected ? ' is-selected' : ''}`}
                        onClick={() => handleGroupToggle(group.id)}
                      >
                        <div className="collection-card__top">
                          <label className="checkbox-chip" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(event) => {
                                event.stopPropagation()
                                handleGroupToggle(group.id)
                              }}
                            />
                            <span aria-hidden />
                          </label>
                          <div className="collection-card__actions">
                            <button
                              type="button"
                              className="edit-name-button"
                              aria-label={`Edit group ${group.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                setEditingGroupId(group.id)
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
                              aria-label={`Delete group ${group.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                onDeleteGroup(group.id)
                              }}
                            >
                              <span aria-hidden>×</span>
                            </button>
                          </div>
                        </div>
                        <div className="collection-card__info">
                          <p className="collection-card__title">{group.name}</p>
                          <p className="collection-card__meta" title={groupParticipantNames || undefined}>
                            {groupParticipantNames || 'No participants yet'}
                          </p>
                        </div>
                        <span className="collection-card__count">{group.participantIds.length}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="collection-panel">
              <div className="panel-heading panel-heading--subtle">
                <h3>Event participant sets</h3>
                <span className="badge">{eventsToRender.length}</span>
              </div>
              {eventsToRender.length === 0 ? (
                <div className="empty-state empty-state--narrow">
                  {isFiltering ? (
                    <>
                      <strong>No events match</strong>
                      <p>The search doesn&apos;t match existing events.</p>
                    </>
                  ) : (
                    <>
                      <strong>No events available</strong>
                      <p>Create an event to reuse its participant list here.</p>
                    </>
                  )}
                </div>
              ) : (
                <ul className="collection-grid">
                  {eventsToRender.map((eventSet) => {
                    const isEventSelected = selectedEventId === eventSet.id
                    const previewNames = eventSet.participantNames.slice(0, 4).join(', ')
                    return (
                      <li
                        key={eventSet.id}
                        className={`collection-card collection-card--event${isEventSelected ? ' is-selected' : ''}`}
                        onClick={() => handleEventToggle(eventSet.id)}
                      >
                        <div className="collection-card__header">
                          <label className="checkbox-chip" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isEventSelected}
                              onChange={(event) => {
                                event.stopPropagation()
                                handleEventToggle(eventSet.id)
                              }}
                            />
                            <span aria-hidden />
                          </label>
                          <div className="collection-card__titles">
                            <p className="collection-card__title">{eventSet.name}</p>
                            <p
                              className="collection-card__meta"
                              title={eventSet.participantNames.join(', ') || undefined}
                            >
                              {previewNames}
                              {eventSet.participantNames.length > 4 ? '…' : ''}
                            </p>
                          </div>
                          <span className="collection-card__count">{eventSet.participantIds.length}</span>
                        </div>
                        <div className="collection-card__actions">
                          {onNavigateToEvent && (
                            <button
                              type="button"
                              className="ghost-button ghost-button--small"
                              onClick={(event) => {
                                event.stopPropagation()
                                onNavigateToEvent(eventSet.id)
                              }}
                            >
                              View event
                            </button>
                          )}
                          <button
                            type="button"
                            className="primary-button primary-button--compact"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleEventToggle(eventSet.id)
                            }}
                          >
                            {isEventSelected ? 'Deselect' : 'Select all'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
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
