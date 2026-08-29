import { useState } from 'react'
import { useSession } from '../context/SessionContext'
import { useToast } from '../context/ToastContext'
import { updateGuestProfile, ApiError } from '../lib/api'
import { AVATAR_PALETTE } from '../lib/avatars'
import { Card } from '../components/ui/Card'

/**
 * Best-effort device label parsed from navigator.userAgent, e.g.
 * "iPhone · Safari" or "Windows · Chrome". Not exhaustive — just enough to
 * be a friendly, recognizable hint next to the raw Guest ID (F2.2 spec
 * explicitly calls this out as best-effort, not required to be accurate for
 * every UA string).
 */
function describeDevice(userAgent: string): string {
  let platform = 'Unknown device'
  if (/iPhone/.test(userAgent)) platform = 'iPhone'
  else if (/iPad/.test(userAgent)) platform = 'iPad'
  else if (/Android/.test(userAgent)) platform = 'Android'
  else if (/Macintosh/.test(userAgent)) platform = 'Mac'
  else if (/Windows/.test(userAgent)) platform = 'Windows'
  else if (/Linux/.test(userAgent)) platform = 'Linux'

  let browser = 'Unknown browser'
  // Order matters: Edge/Chrome UAs also contain "Safari", and Chrome UAs on
  // Android also contain "Edge"/"OPR" tokens for their own browsers, so the
  // more specific tokens must be checked first.
  if (/Edg\//.test(userAgent)) browser = 'Edge'
  else if (/OPR\//.test(userAgent)) browser = 'Opera'
  else if (/Chrome\//.test(userAgent)) browser = 'Chrome'
  else if (/Firefox\//.test(userAgent)) browser = 'Firefox'
  else if (/Safari\//.test(userAgent)) browser = 'Safari'

  return `${platform} · ${browser}`
}

/**
 * "Me" tab (F2.2) — device/Guest ID info, and editable nickname + avatar
 * for this guest session. Both fields are optional and save individually
 * (nickname on blur, avatar on tap) via PATCH /api/session/me, with the
 * saved value mirrored into SessionContext via setProfile() so the rest of
 * the app reflects it without a reload.
 */
export function MePage() {
  const { token, sessionId, nickname, avatar, setProfile } = useSession()
  const { showToast } = useToast()

  const [nicknameInput, setNicknameInput] = useState(nickname ?? '')
  const [savingAvatar, setSavingAvatar] = useState<string | null>(null)

  const deviceLabel = describeDevice(navigator.userAgent)

  async function handleNicknameBlur() {
    if (!token) return
    const trimmed = nicknameInput
    if (trimmed === (nickname ?? '')) return

    try {
      await updateGuestProfile({ nickname: trimmed }, token)
      setProfile({ nickname: trimmed })
    } catch (err) {
      setNicknameInput(nickname ?? '')
      const message = err instanceof ApiError ? err.message : 'Could not save nickname — check your connection.'
      showToast('warning', 'Could not save nickname', message)
    }
  }

  async function handleAvatarPick(emoji: string) {
    if (!token || emoji === avatar) return

    setSavingAvatar(emoji)
    try {
      await updateGuestProfile({ avatar: emoji }, token)
      setProfile({ avatar: emoji })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save avatar — check your connection.'
      showToast('warning', 'Could not save avatar', message)
    } finally {
      setSavingAvatar(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-4">
      <Card className="flex flex-col gap-1">
        <p className="text-caption text-text-muted">This device</p>
        <p className="text-body text-text-primary">{deviceLabel}</p>
        <p className="text-caption text-text-muted">Guest ID: {sessionId ?? '—'}</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-text-secondary">Nickname</span>
          <input
            type="text"
            autoComplete="off"
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            onBlur={handleNicknameBlur}
            placeholder="What should we call you?"
            className="glass-inset h-11 w-full rounded-md px-3 text-body text-text-primary placeholder:text-text-muted outline-none focus-visible:border-accent"
          />
        </label>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-caption text-text-secondary">Avatar</span>
        <div className="grid grid-cols-5 gap-2">
          {AVATAR_PALETTE.map((emoji) => {
            const isSelected = emoji === avatar
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => handleAvatarPick(emoji)}
                disabled={savingAvatar !== null}
                aria-pressed={isSelected}
                aria-label={`Choose avatar ${emoji}`}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl transition-fast active:scale-[0.97] disabled:pointer-events-none ${
                  isSelected
                    ? 'border-2 border-accent bg-white/[0.08]'
                    : 'glass border border-transparent hover:bg-white/[0.06]'
                }`}
              >
                {emoji}
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
