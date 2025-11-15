type EventHeaderProps = {
  name: string
  dateRange?: string
  location?: string
  participantsCount: number
  expenseCount: number
  totalLabel: string
  onEdit?: () => void
  onDelete?: () => void | Promise<void>
}

export function EventHeader({
  name,
  dateRange,
  location,
  participantsCount,
  expenseCount,
  totalLabel,
  onEdit,
  onDelete,
}: EventHeaderProps) {
  const participantLabel = `${participantsCount} ${participantsCount === 1 ? 'participant' : 'participants'}`
  const expenseLabel = `${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'}`

  return (
    <div className="event-heading">
      <div className="event-heading__row">
        <div className="event-heading__title">
          <h2 className="section-title">{name}</h2>
          {onEdit ? (
            <button
              type="button"
              className="edit-name-button"
              aria-label="Edit event name"
              onClick={onEdit}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
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
          ) : null}
        </div>
        {onDelete ? (
          <button
            type="button"
            className="icon-button icon-button--danger"
            aria-label="Delete event"
            onClick={() => {
              void onDelete()
            }}
          >
            <span aria-hidden>×</span>
          </button>
        ) : null}
      </div>
      {dateRange ? <p className="event-heading__date">{dateRange}</p> : null}
      <div className="event-heading__meta">
        {location ? <span>{location}</span> : null}
        <span>{participantLabel}</span>
        <span>{expenseLabel}</span>
        <span>{totalLabel}</span>
      </div>
    </div>
  )
}

