import { Card } from '../components/ui/Card'

/**
 * Settings tab (P4.8) — placeholder only. The real admin panel (PIN login,
 * settings form, queue moderation, device selector, QR code) is P4.6, a
 * separate not-yet-built task. This just keeps the tab from being a dead
 * link.
 */
export function SettingsPage() {
  return (
    <Card className="flex flex-col items-center gap-1 py-8 text-center">
      <p className="text-body text-text-secondary">Admin settings — coming soon</p>
      <p className="text-caption text-text-muted">PIN login and moderation tools are on the way.</p>
    </Card>
  )
}
