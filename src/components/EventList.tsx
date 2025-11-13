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
}

export function EventList({ events, onSelect, onCreate }: EventListProps) {
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
            <button
              key={event.id}
              className="event-card"
              onClick={() => onSelect(event.id)}
            >
              <div className="event-card__header">
                <h3>{event.name}</h3>
                <span className="badge">
                  {event.participantCount} {event.participantCount === 1 ? 'person' : 'people'}
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
          ))}
        </div>
      )}
    </section>
  )
}

export type { EventPreview }

