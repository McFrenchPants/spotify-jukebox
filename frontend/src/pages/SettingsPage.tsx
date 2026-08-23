import { Button } from '../components/ui/Button'
import { PinEntry } from '../components/admin/PinEntry'
import { SettingsForm } from '../components/admin/SettingsForm'
import { QueueModeration } from '../components/admin/QueueModeration'
import { DeviceSelector } from '../components/admin/DeviceSelector'
import { GuestUrlCard } from '../components/admin/GuestUrlCard'
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext'

/**
 * Authenticated admin view: settings form, queue moderation, device
 * selector, guest URL/QR — in that order (mode-affecting settings first,
 * since that's the control the rest of the app's behavior depends on).
 */
function AdminPanel() {
  const { token, logout } = useAdminAuth()

  // token is guaranteed non-null here (only rendered from the authenticated
  // branch below), but TypeScript doesn't know that from the context shape.
  if (!token) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-caption text-text-muted">Admin panel</p>
        <Button variant="secondary" size="md" className="px-3" onClick={logout}>
          Log out
        </Button>
      </div>

      <SettingsForm token={token} />
      <QueueModeration token={token} />
      <DeviceSelector token={token} />
      <GuestUrlCard />
    </div>
  )
}

function SettingsPageInner() {
  const { isAuthenticated } = useAdminAuth()
  return isAuthenticated ? <AdminPanel /> : <PinEntry />
}

/**
 * Settings tab (P4.6) — PIN login, settings form (P3.2), queue moderation
 * (P3.4), device selector (P1.4), and QR/guest-URL display, all behind a
 * PIN-gated admin session. AdminAuthProvider is scoped locally to this page
 * (not global in main.tsx) since only this tab needs admin auth.
 */
export function SettingsPage() {
  return (
    <AdminAuthProvider>
      <SettingsPageInner />
    </AdminAuthProvider>
  )
}
