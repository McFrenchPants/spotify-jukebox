import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, getJukeboxDevice, registerJukeboxDevice } from '../../lib/api'
import { getOrCreateClientId } from '../../lib/clientId'
import { useToast } from '../../context/ToastContext'

export interface JukeboxDeviceCardProps {
  token: string
}

/**
 * Jukebox device registration (M3.2). Only the native Android build can act
 * as the Jukebox device (local system-volume control over SSE — see
 * TrustModeState.jukeboxDevice in api.ts), so this card behaves differently
 * depending on `Capacitor.isNativePlatform()`:
 *
 * - Native: fetches the currently-registered clientId on mount, compares it
 *   against this install's own id (getOrCreateClientId()), and offers a
 *   button to register this device when it isn't already the one on file.
 * - Web (the common case for every existing browser-based deployment):
 *   there's nothing actionable to do, so this renders an inert explanatory
 *   note instead of a working toggle. The card still shows up here so
 *   browser-only admins know the feature exists.
 */
export function JukeboxDeviceCard({ token }: JukeboxDeviceCardProps) {
  const isNative = Capacitor.isNativePlatform()
  const [registeredClientId, setRegisteredClientId] = useState<string | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const { showToast } = useToast()

  const load = useCallback(() => {
    getJukeboxDevice(token)
      .then((data) => {
        setRegisteredClientId(data.clientId)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load Jukebox device status.')
      })
  }, [token])

  useEffect(() => {
    if (!isNative) return
    load()
  }, [isNative, load])

  async function handleRegister() {
    setRegistering(true)
    try {
      const result = await registerJukeboxDevice(token, getOrCreateClientId())
      setRegisteredClientId(result.clientId)
      showToast('success', 'This device is now the Jukebox device')
    } catch (err) {
      showToast(
        'error',
        'Could not register this device',
        err instanceof ApiError ? err.message : undefined
      )
    } finally {
      setRegistering(false)
    }
  }

  const isThisDevice = isNative && registeredClientId !== undefined && registeredClientId === getOrCreateClientId()

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-title text-text-primary">Jukebox device</p>

      {!isNative && (
        <p className="text-caption text-text-secondary">
          Jukebox device mode is only available from the native Android app. Install and open the
          Jukebox app on the Android device you want to use for local volume control, then set it as
          the Jukebox device from its own Settings tab.
        </p>
      )}

      {isNative && (
        <>
          {loadError && (
            <div className="rounded-md border border-error-muted/60 bg-error-muted/70 backdrop-blur-md px-4 py-3 text-center text-caption text-error">
              {loadError}
            </div>
          )}

          {registeredClientId === undefined && !loadError && (
            <div className="flex flex-col gap-2">
              <Skeleton variant="block" />
            </div>
          )}

          {registeredClientId !== undefined && (
            <>
              <p className="text-caption text-text-secondary">
                {isThisDevice
                  ? 'This device is currently registered as the Jukebox device.'
                  : registeredClientId
                    ? 'Another device is currently registered as the Jukebox device.'
                    : 'No Jukebox device is registered yet.'}
              </p>

              {!isThisDevice && (
                <Button variant="primary" size="md" disabled={registering} onClick={() => void handleRegister()}>
                  {registering ? 'Setting…' : 'Set this as the Jukebox device'}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}
