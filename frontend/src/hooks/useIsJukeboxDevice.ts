import { useEffect, useState } from 'react'
import { getOrCreateClientId } from '../lib/clientId'
import { getJukeboxDeviceMine } from '../lib/api'

/**
 * Whether THIS browser is the currently-registered "Jukebox device" (Master
 * Device Mode) — i.e. this is the bridge/master device rather than a regular
 * guest browser. Drives the nav swap of "Me" -> "Connect" (C2).
 *
 * Defaults to `false` (and stays `false` on any fetch failure) since that's
 * the safe fallback: a regular guest device just keeps seeing "Me" as today.
 * Never flips to `true` speculatively while loading, to avoid flashing
 * "Connect" incorrectly on a slow network.
 */
export function useIsJukeboxDevice(): boolean {
  const [isJukeboxDevice, setIsJukeboxDevice] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const clientId = getOrCreateClientId()
        const { isRegistered } = await getJukeboxDeviceMine(clientId)
        if (!cancelled) setIsJukeboxDevice(isRegistered)
      } catch {
        if (!cancelled) setIsJukeboxDevice(false)
      }
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [])

  return isJukeboxDevice
}
