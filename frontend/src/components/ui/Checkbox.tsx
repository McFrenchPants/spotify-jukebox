export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label'?: string
  disabled?: boolean
}

/** Custom glass checkbox — a translucent square that fills with the accent color when checked. */
export function Checkbox({ checked, onChange, disabled, ...rest }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="glass-inset flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.4rem] transition-fast active:scale-90 disabled:opacity-40 disabled:pointer-events-none"
      style={
        checked
          ? {
              background: 'linear-gradient(155deg, rgba(255,255,255,0.35), var(--color-accent) 70%)',
              borderColor: 'rgba(255,255,255,0.4)',
              boxShadow: '0 0 0 4px rgba(47,214,111,0.16), inset 0 1px 0 rgba(255,255,255,0.3)',
            }
          : undefined
      }
      {...rest}
    >
      {checked && (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="var(--color-bg)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
