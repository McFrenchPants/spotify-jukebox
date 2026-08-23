import { useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ApiError } from '../../lib/api'
import { useAdminAuth } from '../../context/AdminAuthContext'

/**
 * PIN-entry login screen shown when the Settings tab has no valid admin
 * token. An inline error message near the input (rather than a transient
 * toast) is used for "wrong PIN" — this is a login form, so the error should
 * stick around until the next attempt, not disappear after 4 seconds.
 */
export function PinEntry() {
  const { login } = useAdminAuth()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (pin.trim() === '' || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await login(pin)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect PIN. Try again.')
      } else if (err instanceof ApiError) {
        setError(err.message || 'Login failed.')
      } else {
        setError('Could not reach the server — check your connection.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-title text-text-primary">Admin access</p>
        <p className="text-caption text-text-muted">Enter the host PIN to manage settings.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value)
            if (error) setError(null)
          }}
          placeholder="PIN"
          aria-label="Admin PIN"
          className="h-12 rounded-md border border-border bg-surface-raised px-4 text-center text-title tracking-widest text-text-primary outline-none transition-fast focus-visible:border-accent"
        />

        {error && (
          <p role="alert" className="text-center text-caption text-error">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pin.trim() === '' || submitting}>
          {submitting ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
    </Card>
  )
}
