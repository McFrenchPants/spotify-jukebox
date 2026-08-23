import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/**
 * QR code + plain-text guest URL, for showing/printing so guests can scan
 * their way to the app. Uses `window.location.origin`, which is correct in
 * production (this frontend is served from the same LAN-reachable origin
 * guests use) but shows `http://localhost:5173` in local dev, which isn't
 * guest-reachable — an inherent dev-environment limitation, not a bug.
 *
 * QR generation happens client-side via the `qrcode` npm package (no
 * external QR-generation web service), matching the app's LAN-only,
 * no-WAN-dependency design.
 */
export function GuestUrlCard() {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const guestUrl = window.location.origin

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(guestUrl, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError('Could not generate QR code.')
      })
    return () => {
      cancelled = true
    }
  }, [guestUrl])

  return (
    <Card className="flex flex-col items-center gap-3 text-center print:shadow-none">
      <p className="text-title text-text-primary">Guest link</p>

      {dataUrl && (
        <img
          src={dataUrl}
          alt={`QR code linking to ${guestUrl}`}
          className="h-48 w-48 rounded-md bg-white p-2"
        />
      )}
      {!dataUrl && !error && (
        <div className="h-48 w-48 animate-pulse rounded-md bg-surface-overlay" />
      )}
      {error && <p className="text-caption text-error">{error}</p>}

      <p className="select-all break-all text-caption text-text-secondary">{guestUrl}</p>

      <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
        Print
      </Button>
    </Card>
  )
}
