import type { SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  options: SelectOption[]
  /** Tints the closed control's text/glow — e.g. accent for "allow", error for "deny". */
  tone?: 'default' | 'accent' | 'error'
}

const toneText: Record<NonNullable<SelectProps['tone']>, string> = {
  default: 'text-text-primary',
  accent: 'text-accent',
  error: 'text-error',
}

const toneGlow: Record<NonNullable<SelectProps['tone']>, string> = {
  default: '',
  accent: 'shadow-[0_0_0_1px_rgba(47,214,111,0.25)]',
  error: 'shadow-[0_0_0_1px_rgba(248,113,113,0.25)]',
}

/**
 * Glass-themed dropdown. Wraps a native <select> (kept for accessibility and
 * platform picker UX) with custom glass chrome and a color-coded chevron —
 * an `<option>` element can't be styled to match the glass theme, so the
 * closed control carries the visual weight instead.
 */
export function Select({ options, tone = 'default', ...rest }: SelectProps) {
  return (
    <div className={`glass-inset relative rounded-md transition-fast focus-within:border-accent ${toneGlow[tone]}`}>
      <select
        className={`h-11 w-full appearance-none rounded-md bg-transparent px-3 pr-9 text-body outline-none ${toneText[tone]}`}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-raised text-text-primary">
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${toneText[tone]}`}
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
