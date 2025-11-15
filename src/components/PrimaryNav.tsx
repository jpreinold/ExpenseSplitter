type PrimaryNavProps = {
  active: 'events' | 'participants'
  onChange: (view: 'events' | 'participants') => void
}

export function PrimaryNav({ active, onChange }: PrimaryNavProps) {
  return (
    <nav className="primary-nav" aria-label="Primary views">
      <button
        type="button"
        className={`primary-nav__button ${active === 'events' ? 'active' : ''}`}
        onClick={() => onChange('events')}
      >
        Events
      </button>
      <button
        type="button"
        className={`primary-nav__button ${active === 'participants' ? 'active' : ''}`}
        onClick={() => onChange('participants')}
      >
        Participants
      </button>
    </nav>
  )
}

