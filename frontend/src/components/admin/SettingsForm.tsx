import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import {
  AdminSettingsValidationError,
  ApiError,
  getAdminSettings,
  updateAdminSettings,
  type AdminSettings,
} from '../../lib/api'
import { useToast } from '../../context/ToastContext'

export interface SettingsFormProps {
  token: string
  /** Fired after a successful save, so the parent can toast/refresh anything downstream. */
  onSaved?: (settings: AdminSettings) => void
}

/** Local editable form state — same shape as AdminSettings minus the read-only spotifyDeviceId. */
type FormState = Omit<AdminSettings, 'spotifyDeviceId'>

const MS_PER_MINUTE = 60_000
const MS_PER_SECOND = 1000

type OverrideField = 'allowPauseResume' | 'allowSkip' | 'allowVolume' | 'allowReorder'

const OVERRIDE_FIELDS: { key: OverrideField; label: string }[] = [
  { key: 'allowPauseResume', label: 'Pause / resume' },
  { key: 'allowSkip', label: 'Skip' },
  { key: 'allowVolume', label: 'Volume' },
  { key: 'allowReorder', label: 'Reorder queue' },
]

function toFormState(settings: AdminSettings): FormState {
  const { spotifyDeviceId: _spotifyDeviceId, ...rest } = settings
  return rest
}

/**
 * Settings form (P3.2). Converts the raw-ms fields to admin-friendly units
 * (rate-limit window in minutes, duration bounds in seconds) for display and
 * converts back on save; everything else is sent as-is. Sends the whole
 * current form state as the PUT body (not just changed fields) — simpler and
 * still correct since the endpoint accepts any subset, and the form always
 * holds the full last-known-good shape.
 */
export function SettingsForm({ token, onSaved }: SettingsFormProps) {
  const [form, setForm] = useState<FormState | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    getAdminSettings(token)
      .then((data) => {
        if (cancelled) return
        setForm(toFormState(data))
        setDeviceId(data.spotifyDeviceId)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof ApiError ? err.message : 'Could not load settings.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit() {
    if (!form || saving) return
    setSaving(true)
    setValidationErrors(null)
    try {
      const updated = await updateAdminSettings(token, form)
      setForm(toFormState(updated))
      setDeviceId(updated.spotifyDeviceId)
      showToast('success', 'Settings saved')
      onSaved?.(updated)
    } catch (err) {
      if (err instanceof AdminSettingsValidationError) {
        setValidationErrors(err.details)
        showToast('error', 'Could not save settings', 'Fix the highlighted issues and try again.')
      } else {
        showToast('error', 'Could not save settings', err instanceof ApiError ? err.message : undefined)
      }
    } finally {
      setSaving(false)
    }
  }

  function setOverride(key: OverrideField, value: boolean | null) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (loadError) {
    return (
      <Card>
        <p className="text-body text-error">{loadError}</p>
      </Card>
    )
  }

  if (!form) {
    return (
      <Card className="flex flex-col gap-3">
        <Skeleton variant="line" className="w-1/3" />
        <Skeleton variant="block" />
        <Skeleton variant="block" />
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-5">
      <p className="text-title text-text-primary">Settings</p>

      <p className="text-caption text-text-muted">
        Current device: {deviceId ?? 'No device selected'}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">Trust mode</span>
        <select
          value={form.activeMode}
          onChange={(e) =>
            setForm({ ...form, activeMode: e.target.value as AdminSettings['activeMode'] })
          }
          className="h-11 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
        >
          <option value="restricted">Restricted</option>
          <option value="trusted">Trusted</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-3">
        <span className="text-caption text-text-secondary">Explicit filter enabled</span>
        <input
          type="checkbox"
          checked={form.explicitFilterEnabled}
          onChange={(e) => setForm({ ...form, explicitFilterEnabled: e.target.checked })}
          className="h-5 w-5 accent-accent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">Rate-limit window (minutes)</span>
        <input
          type="number"
          min={0}
          step="any"
          value={form.rateLimitWindowMs / MS_PER_MINUTE}
          onChange={(e) =>
            setForm({ ...form, rateLimitWindowMs: Math.round(Number(e.target.value) * MS_PER_MINUTE) })
          }
          className="h-11 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-secondary">Min duration (seconds)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={form.minDurationMs / MS_PER_SECOND}
            onChange={(e) =>
              setForm({ ...form, minDurationMs: Math.round(Number(e.target.value) * MS_PER_SECOND) })
            }
            className="h-11 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-secondary">Max duration (seconds)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={form.maxDurationMs / MS_PER_SECOND}
            onChange={(e) =>
              setForm({ ...form, maxDurationMs: Math.round(Number(e.target.value) * MS_PER_SECOND) })
            }
            className="h-11 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-text-muted">
          Permission overrides
        </p>
        {OVERRIDE_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-caption text-text-secondary">{label}</span>
            <select
              value={form[key] === null ? 'inherit' : form[key] ? 'allow' : 'deny'}
              onChange={(e) => {
                const v = e.target.value
                setOverride(key, v === 'inherit' ? null : v === 'allow')
              }}
              className="h-11 rounded-md border border-border bg-surface-raised px-3 text-body text-text-primary outline-none focus-visible:border-accent"
            >
              <option value="inherit">Inherit from mode</option>
              <option value="allow">Always allow</option>
              <option value="deny">Always deny</option>
            </select>
          </label>
        ))}
      </div>

      {validationErrors && (
        <div className="rounded-md border border-error-muted bg-error-muted px-4 py-3 text-caption text-error">
          <ul className="list-disc pl-4">
            {validationErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={() => void handleSubmit()} disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </Card>
  )
}
