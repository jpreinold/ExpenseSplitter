type EventSubNavProps = {
  activeTab: 'expenses' | 'settle'
  onSelectExpenses: () => void
  onSelectSettle: () => void
}

export function EventSubNav({ activeTab, onSelectExpenses, onSelectSettle }: EventSubNavProps) {
  return (
    <div className="event-subnav">
      <div className="event-subnav__tabs" role="tablist" aria-label="Event views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'expenses'}
          className={`event-subnav__tab ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={onSelectExpenses}
        >
          Expenses
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settle'}
          className={`event-subnav__tab ${activeTab === 'settle' ? 'active' : ''}`}
          onClick={onSelectSettle}
        >
          Settle up
        </button>
      </div>
    </div>
  )
}

