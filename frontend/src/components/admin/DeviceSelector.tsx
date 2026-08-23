import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getDevice, selectDevice, type Device } from '../../lib/api'
import { useToast } from '../../context/ToastContext'

export interface DeviceSelectorProps {
  token: string
}

/**
 * Device selector (P1.4). Fetches the public GET /api/device (resolved
 * device + full visible list) on mount, and lets the admin pick a device
 * via POST /api/device/select when the resolution is ambiguous (or just to
 * switch). Re-fetches after a successful select to confirm the change.
 */
export function DeviceSelector({ token }: DeviceSelectorProps) {
  const [resolved, setResolved] = useState<Device | null | undefined>(undefined)
  const [devices, setDevices] = useState<Device[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const { showToast } = useToast()

  const load = useCallback(() => {
    getDevice()
      .then((data) => {
        setResolved(data.resolved)
        setDevices(data.devices)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load devices.')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSelect(deviceId: string) {
    setSelectingId(deviceId)
    try {
      const device = await selectDevice(token, deviceId)
      showToast('success', `Playing on ${device.name}`)
      load()
    } catch (err) {
      showToast('error', 'Could not select device', err instanceof ApiError ? err.message : undefined)
    } finally {
      setSelectingId(null)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-title text-text-primary">Playback device</p>

      {loadError && (
        <div className="rounded-md border border-error-muted bg-error-muted px-4 py-3 text-center text-caption text-error">
          {loadError}
        </div>
      )}

      {resolved === undefined && !loadError && (
        <div className="flex flex-col gap-2">
          <Skeleton variant="block" />
        </div>
      )}

      {resolved !== undefined && (
        <>
          <p className="text-caption text-text-secondary">
            {resolved
              ? `Currently playing on: ${resolved.name}`
              : 'No device selected yet — choose one below.'}
          </p>

          {devices.length === 0 && !loadError && (
            <p className="text-caption text-text-muted">No devices are currently visible to Spotify.</p>
          )}

          {devices.length > 0 && (
            <div className="flex flex-col gap-2">
              {devices.map((device) => {
                const isCurrent = resolved?.id === device.id
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => void handleSelect(device.id)}
                    disabled={selectingId !== null}
                    className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-fast active:scale-[0.98] disabled:opacity-60 ${
                      isCurrent
                        ? 'border-accent bg-accent-muted'
                        : 'border-border bg-surface-raised hover:bg-surface-overlay'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-text-primary">{device.name}</p>
                      <p className="truncate text-caption text-text-muted">
                        {device.type}
                        {device.is_active ? ' · active' : ''}
                      </p>
                    </div>
                    {isCurrent && <span className="shrink-0 text-caption text-accent">Selected</span>}
                    {!isCurrent && selectingId === device.id && (
                      <span className="shrink-0 text-caption text-text-muted">Selecting…</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
