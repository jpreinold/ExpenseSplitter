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
  totals: {
    expenses: number
    participants: number
  }
  balances: BalanceRow[]
  settlements: Settlement[]
  onBack: () => void
  currency: string
  onSettlementClick?: (fromId: string, toId: string) => void
}

export function Summary({ eventName, totals, balances, settlements, onBack, currency, onSettlementClick }: SummaryProps) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  })

  return (
    <section className="surface view-section">
      <header className="section-header">
        <button className="ghost-button" onClick={onBack}>
          ← Back to event
        </button>
        <div className="section-heading">
          <h2 className="section-title">{eventName} · Summary</h2>
          <p className="section-subtitle">
            {totals.participants} {totals.participants === 1 ? 'person' : 'people'} ·{' '}
            {formatter.format(totals.expenses)} total spend
          </p>
        </div>
      </header>

      <section aria-labelledby="settlements-heading">
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

