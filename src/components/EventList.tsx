type EventPreview = {
  id: string
  name: string
  dateRange?: string
  location?: string
  total: number
  formattedTotal: string
  participantCount: number
  expenseCount: number
}

type EventListProps = {
  events: EventPreview[]
  onSelect: (eventId: string) => void
  onCreate: () => void
  onDelete: (eventId: string) => void
}

export function EventList({ events, onSelect, onCreate, onDelete }: EventListProps) {
  return (
    <section className="surface view-section">
      <header className="section-header">
        <div>
          <h2 className="section-title">Events</h2>
          <p className="section-subtitle">
            Track weekends, trips, and get-togethers with flexible splits.
          </p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          New event
        </button>
      </header>

      {events.length === 0 ? (
        <div className="empty-state">
          <strong>No events yet</strong>
          Start with one or import from another device soon.
        </div>
      ) : (
        <div className="event-list">
          {events.map((event) => (
            <div key={event.id} className="event-card">
              <button
                type="button"
                className="event-card__body"
                onClick={() => onSelect(event.id)}
              >
                <div className="event-card__header">
                  <h3>{event.name}</h3>
                  <span className="event-card__pill">
                    <span>{event.participantCount}</span>
                    <span>{event.participantCount === 1 ? 'person' : 'people'}</span>
                  </span>
                </div>
                <dl>
                  {event.dateRange && (
                    <div>
                      <dt>Date</dt>
                      <dd>{event.dateRange}</dd>
                    </div>
                  )}
                  {event.location && (
                    <div>
                      <dt>Location</dt>
                      <dd>{event.location}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Expenses</dt>
                    <dd>{event.expenseCount}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{event.formattedTotal}</dd>
                  </div>
                </dl>
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger event-card__delete"
                aria-label={`Delete ${event.name}`}
                onClick={(eventInstance) => {
                  eventInstance.stopPropagation()
                  onDelete(event.id)
                }}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export type { EventPreview }

