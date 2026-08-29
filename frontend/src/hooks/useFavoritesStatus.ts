import { useEffect, useState } from 'react'
import { addFavorite, getFavoritesStatus, removeFavorite, type Track } from '../lib/api'
import { useSession } from '../context/SessionContext'

export type FavoriteStatusEntry = { favoritedByMe: boolean; favoritedByAnyone: boolean }
export type FavoritesStatusMap = Record<string, FavoriteStatusEntry>

const EMPTY_STATUS: FavoriteStatusEntry = { favoritedByMe: false, favoritedByAnyone: false }

/**
 * Tracks favorites status ({favoritedByMe, favoritedByAnyone}) for a set of
 * track ids (F3.1). Fetches on mount/whenever the track-id set changes,
 * re-fetches on the `favorites-update` SSE event (fired when *any* guest
 * toggles a favorite, so this guest's view of favoritedByAnyone stays in
 * sync), and exposes an optimistic `toggle`.
 *
 * `subscribe` is passed in (from useOutletContext<RootLayoutContext>()
 * rather than reached for internally via useEventStream()) to keep this
 * hook decoupled from routing context — mirrors Leaderboard.tsx/QueueList.tsx's
 * existing subscribe-as-param pattern for `leaderboard-update`/`queue-update`.
 */
export function useFavoritesStatus(
  trackIds: string[],
  subscribe: (eventName: string, handler: (data: unknown) => void) => () => void
): { status: FavoritesStatusMap; toggle: (track: Track) => void } {
  const { token } = useSession()
  const [status, setStatus] = useState<FavoritesStatusMap>({})
  // Compare by content, not array identity — callers will likely pass a
  // fresh array each render.
  const idsKey = trackIds.join(',')

  useEffect(() => {
    const ids = idsKey === '' ? [] : idsKey.split(',')
    let cancelled = false

    // Default every id to "not favorited" before the fetch resolves, so
    // consumers never read undefined for a known id.
    setStatus((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        if (!next[id]) next[id] = EMPTY_STATUS
      }
      return next
    })

    getFavoritesStatus(ids, token)
      .then((result) => {
        if (cancelled) return
        setStatus((prev) => ({ ...prev, ...result }))
      })
      .catch(() => {
        // Leave the defaulted/previous status in place on failure.
      })

    return () => {
      cancelled = true
    }
  }, [idsKey, token])

  useEffect(() => {
    return subscribe('favorites-update', () => {
      const ids = idsKey === '' ? [] : idsKey.split(',')
      getFavoritesStatus(ids, token)
        .then((result) => {
          // Merge in — don't wipe entries for ids outside the current list,
          // and don't touch ids not returned by this fetch.
          setStatus((prev) => ({ ...prev, ...result }))
        })
        .catch(() => {
          // Ignore — status just stays as it was until the next successful sync.
        })
    })
  }, [idsKey, subscribe, token])

  function toggle(track: Track) {
    if (!token) return // session not ready — shouldn't happen, App only renders once loaded

    const current = status[track.id] ?? EMPTY_STATUS
    const nextFavoritedByMe = !current.favoritedByMe
    // Optimistic flip: favoritedByAnyone is already true if we're now
    // favoriting it; leave it as-is if we're unfavoriting since other
    // guests may still have it favorited.
    const optimistic: FavoriteStatusEntry = {
      favoritedByMe: nextFavoritedByMe,
      favoritedByAnyone: nextFavoritedByMe ? true : current.favoritedByAnyone,
    }

    setStatus((prev) => ({ ...prev, [track.id]: optimistic }))

    const request = nextFavoritedByMe ? addFavorite(track.id, token) : removeFavorite(track.id, token)

    request.catch(() => {
      setStatus((prev) => ({ ...prev, [track.id]: current }))
    })
  }

  return { status, toggle }
}
