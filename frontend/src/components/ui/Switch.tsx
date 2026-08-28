export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Label shown when off / on, e.g. "Restricted" / "Trusted". Purely visual — pair with a separate <label> for the accessible name. */
  offLabel: string
  onLabel: string
  'aria-label'?: string
  disabled?: boolean
}

/**
 * Two-state glass toggle. Used for settings that are strictly binary (e.g.
 * trust mode) where a <select> would be overkill — the track doubles as a
 * label so the current state reads at a glance without extra copy.
 */
export function Switch({ checked, onChange, offLabel, onLabel, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="glass-inset relative flex h-9 w-[7.5rem] shrink-0 items-center rounded-full p-0.5 text-caption font-semibold transition-fast disabled:opacity-40 disabled:pointer-events-none"
      {...rest}
    >
      <span
        className="glass-pill absolute top-0.5 h-8 w-[3.75rem] rounded-full transition-fast"
        style={{
          left: checked ? 'calc(100% - 3.75rem - 0.125rem)' : '0.125rem',
          background: checked
            ? 'linear-gradient(155deg, rgba(255,255,255,0.35), var(--color-accent) 70%)'
            : undefined,
        }}
        aria-hidden="true"
      />
      <span className={`relative z-10 flex-1 text-center ${!checked ? 'text-text-primary' : 'text-text-muted'}`}>
        {offLabel}
      </span>
      <span className={`relative z-10 flex-1 text-center ${checked ? 'text-bg' : 'text-text-muted'}`}>
        {onLabel}
      </span>
    </button>
  )
}
