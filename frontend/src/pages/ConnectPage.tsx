import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { GuestUrlCard } from '../components/GuestUrlCard'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { AppPinning } from '../lib/appPinningPlugin'

/**
 * "Connect" tab (C2) — shown in place of "Me" on the master/bridge device
 * (the browser registered as the "Jukebox device" under Master Device Mode,
 * see useIsJukeboxDevice). That device is the one plugged into the speaker
 * for setup, not a guest browsing to add songs, so it gets a QR code + guest
 * link to hand out instead of the "Me" nickname/avatar editor.
 */
export function ConnectPage() {
  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-text-primary">Control the music from your own device</h1>
        <p className="text-body text-text-secondary">
          Guests can scan this QR code or visit the link below to join and start adding songs.
        </p>
      </div>

      <GuestUrlCard />
      <PinningStatusCard />
    </div>
  )
}

/**
 * Screen-pinning status + control, native (Android Master Device Mode) only.
 * Renders nothing at all on a plain web build.
 */
function PinningStatusCard() {
  const [pinned, setPinned] = useState<boolean | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    AppPinning.isPinned()
      .then(({ pinned }) => {
        if (!cancelled) setPinned(pinned)
      })
      .catch(() => {
        // Fail gracefully: leave `pinned` as null so the section stays hidden.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Capacitor.isNativePlatform()) return null

  const handleEnablePinning = () => {
    AppPinning.enablePinning()
      .catch(() => {
        // Ignore; the isPinned() re-check below reflects whatever actually happened.
      })
      .then(() => AppPinning.isPinned())
      .then(({ pinned }) => setPinned(pinned))
      .catch(() => {
        // Leave the previously displayed state as-is.
      })
  }

  return (
    <Card className="flex flex-col gap-2">
      {pinned === null && <p className="text-caption text-text-muted">Checking screen pinning&hellip;</p>}
      {pinned === true && <p className="text-body text-text-primary">Screen pinning: On</p>}
      {pinned === false && (
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-primary">Screen pinning: Off</p>
          <Button variant="secondary" onClick={handleEnablePinning}>
            Enable pinning
          </Button>
        </div>
      )}
    </Card>
  )
}
