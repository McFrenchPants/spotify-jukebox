import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getDevice, selectDevice, type Device } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import type { EventStream } from '../../hooks/useEventStream'

export interface DeviceSelectorProps {
  token: string
  /**
   * Optional so existing callers/tests that don't care about live updates
   * don't have to thread a stream through. When provided, the card
   * re-fetches GET /api/device whenever the backend's poller (see
   * backend/src/spotify/nowPlaying.ts) detects the resolved bridge device
   * going offline or coming back online, so the admin sees it live instead
   * of only on next manual reload.
   */
  subscribe?: EventStream['subscribe']
}

/**
 * Device selector (P1.4). Fetches the public GET /api/device (resolved
 * device + full visible list) on mount, and lets the admin pick a device
 * via POST /api/device/select when the resolution is ambiguous (or just to
 * switch). Re-fetches after a successful select to confirm the change, and
 * (P5.4) also re-fetches live on a `device-status` SSE event so a bridge
 * device going offline while this panel is already open is caught without a
 * manual reload.
 */
export function DeviceSelector({ token, subscribe }: DeviceSelectorProps) {
  const [resolved, setResolved] = useState<Device | null | undefined>(undefined)
  const [devices, setDevices] = useState<Device[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const [offlineNotice, setOfflineNotice] = useState(false)
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

  useEffect(() => {
    if (!subscribe) return

    return subscribe('device-status', (data) => {
      const status = data as { online?: boolean } | undefined
      setOfflineNotice(status?.online === false)
      // Re-fetch the full resolution rather than trusting the event payload
      // alone — the existing "No devices are currently visible to Spotify"
      // / resolved-device UI below already covers both directions, this
      // just makes sure it reflects reality without waiting for a reload.
      load()
    })
  }, [subscribe, load])

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
        <div className="rounded-md border border-error-muted/60 bg-error-muted/70 backdrop-blur-md px-4 py-3 text-center text-caption text-error">
          {loadError}
        </div>
      )}

      {offlineNotice && !loadError && (
        <div className="rounded-md border border-warning-muted/60 bg-warning-muted/70 backdrop-blur-md px-4 py-3 text-center text-caption text-warning">
          The bridge device just went offline — pick another device below, or reconnect it.
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
                    className={`flex items-center justify-between gap-3 rounded-md px-4 py-3 text-left transition-fast active:scale-[0.98] disabled:opacity-60 ${
                      isCurrent
                        ? 'glass-inset border-accent/50 shadow-[0_0_0_1px_rgba(47,214,111,0.25)]'
                        : 'glass-inset hover:bg-white/[0.05]'
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
