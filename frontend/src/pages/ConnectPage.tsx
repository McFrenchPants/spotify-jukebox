import { GuestUrlCard } from '../components/GuestUrlCard'

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
    </div>
  )
}
