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
  amount: number
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
}

export function Summary({ eventName, totals, balances, settlements, onBack, currency }: SummaryProps) {
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
              <span>{row.name}</span>
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

      <section aria-labelledby="settlements-heading">
        <div className="panel-heading">
          <h3 id="settlements-heading">Suggested settlements</h3>
        </div>

        {settlements.length === 0 ? (
          <div className="empty-state">
            <strong>Everyone is square</strong>
            No transfers needed—balances are already even.
          </div>
        ) : (
          <ul className="settlement-list">
            {settlements.map((settlement, index) => (
              <li key={`${settlement.from}-${settlement.to}-${index}`}>
                <span className="settlement-from">{settlement.from}</span>
                <span className="settlement-arrow">→</span>
                <span className="settlement-to">{settlement.to}</span>
                <span className="settlement-amount">{formatter.format(settlement.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

export type { BalanceRow, Settlement }

