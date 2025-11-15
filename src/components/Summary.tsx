import { EventSubNav } from './EventSubNav'
import { EventHeader } from './EventHeader'

type BalanceRow = {
  id: string
  name: string
  paid: number
  owes: number
  balance: number
}

type Settlement = {
  from: string
  to: string
  fromId: string
  toId: string
  amount: number
  isComplete?: boolean
}

type SummaryProps = {
  eventName: string
  dateRange?: string
  location?: string
  totals: {
    expenses: number
    participants: number
  }
  balances: BalanceRow[]
  settlements: Settlement[]
  onBack: () => void
  currency: string
  onSettlementClick?: (fromId: string, toId: string) => void
  expenseCount: number
  onNavigateToOverview: () => void
}

export function Summary({
  eventName,
  dateRange,
  location,
  totals,
  balances,
  settlements,
  onBack,
  currency,
  onSettlementClick,
  expenseCount,
  onNavigateToOverview,
}: SummaryProps) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })
  const totalFormatted = formatter.format(totals.expenses)
  const allSettlementsComplete =
    settlements.length > 0 && settlements.every((settlement) => settlement.isComplete)

  return (
    <section className="surface view-section">
      <div className="event-top-stack">
        <button className="back-button" onClick={onBack}>
          ← Back to expenses
        </button>
        <EventHeader
          name={eventName}
          dateRange={dateRange}
          location={location}
          participantsCount={totals.participants}
          expenseCount={expenseCount}
          totalLabel={totalFormatted}
        />
        <EventSubNav
          activeTab="settle"
          onSelectExpenses={onNavigateToOverview}
          onSelectSettle={() => {
            // already on settle view
          }}
        />
      </div>

      <section aria-labelledby="settlements-heading">
        {allSettlementsComplete ? (
          <div className="success-banner" role="status">
            <span className="success-banner__icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M5 19L19 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M8 5L10 7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M6 9L7.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M14 17L15 19"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M16 14L18 16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="6" cy="5" r="1" fill="currentColor" />
                <circle cx="18" cy="19" r="1" fill="currentColor" />
                <circle cx="11" cy="11" r="1" fill="currentColor" />
              </svg>
            </span>
            <div className="success-banner__body">
              <strong>All settlements are completed</strong>
              Everyone has squared up for this event.
            </div>
          </div>
        ) : null}
        <div className="panel-heading">
          <h3 id="settlements-heading">Settlements</h3>
        </div>

        {settlements.length === 0 ? (
          <div className="empty-state">
            <strong>Everyone is square</strong>
            No transfers needed—balances are already even.
          </div>
        ) : (
          <ul className="settlement-list">
            {settlements.map((settlement) => {
              const amount = formatter.format(Math.abs(settlement.amount))
              const ariaLabel = `${settlement.from} pays ${settlement.to} ${amount}`
              const isComplete = settlement.isComplete ?? false
              const handleClick = () => {
                if (onSettlementClick) {
                  onSettlementClick(settlement.fromId, settlement.toId)
                }
              }
              return (
                <li
                  key={`${settlement.fromId}-${settlement.toId}`}
                  className={`settlement-item ${isComplete ? 'settlement-item--complete' : ''} ${onSettlementClick ? 'settlement-item--clickable' : ''}`}
                  onClick={onSettlementClick ? handleClick : undefined}
                  role={onSettlementClick ? 'button' : undefined}
                  tabIndex={onSettlementClick ? 0 : undefined}
                  onKeyDown={onSettlementClick ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleClick()
                    }
                  } : undefined}
                  aria-label={onSettlementClick ? `${ariaLabel}. Click to view details` : ariaLabel}
                >
                  <span className="settlement-sentence" aria-label={ariaLabel}>
                    <span className="settlement-name">{settlement.from}</span>
                    <span className="settlement-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="settlement-amount">{amount}</span>
                    <span className="settlement-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="settlement-name">{settlement.to}</span>
                  </span>
                  <span className={`settlement-checkmark ${isComplete ? 'settlement-checkmark--visible' : ''}`} aria-label={isComplete ? 'Settlement completed' : undefined}>
                    ✓
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="balances-heading">
        <div className="panel-heading">
          <h3 id="balances-heading">Balances</h3>
        </div>
        <div className="balance-table">
          <div className="balance-table__header">
            <span>Name</span>
            <span>Paid</span>
            <span>Owes</span>
            <span>Difference</span>
          </div>
          {balances.map((row) => (
            <div key={row.id} className="balance-table__row">
              <span className="balance-table__name">{row.name}</span>
              <span>{formatter.format(row.paid)}</span>
              <span>{formatter.format(row.owes)}</span>
              <span className={row.balance >= 0 ? 'positive' : 'negative'}>
                {row.balance >= 0 ? '+' : '-'}
                {formatter.format(Math.abs(row.balance))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

export type { BalanceRow, Settlement }

