# Favorites — Design Spec (non-technical)

**Backlog item:** [BACKLOG.md #3 "Favorites / like a song"](../../../BACKLOG.md)
**Status:** proposal

## What this feature is

A guest can mark any song they see in the app — whether it's currently
playing, sitting in the queue, or already played — as a **Favorite**. All
their favorited songs collect into one list they can browse, search, and
sort from the **Find Music** page. From there they can quickly re-add a
favorite to the queue.

Favorites belong to the guest, not to a Spotify account (guests don't log
in). Since there's no login, "the guest" is identified by a **Guest ID**
described below, and favorites are saved on the server against that ID —
not just in that one browser — so they survive a page reload or the guest
re-opening the app later.

## Guest ID and the new "Me" tab

The app doesn't currently have any way to tell one guest's phone apart from
another's — the "device ID" visible today in Settings is the Spotify
playback device (the speaker/output the jukebox plays through), not a
guest identifier. This feature introduces a new, separate one:

- The first time someone loads the app, it generates a random Guest ID and
  saves it in that browser's local storage. Every request the guest makes
  (favoriting a song, adding to queue, etc.) is tagged with that ID.
- Alongside the ID, the app captures whatever basic info the browser makes
  available about the device — e.g. "iPhone · Safari" or "Windows · Chrome" —
  and uses that as a default, human-readable label for the guest.
- **This is deliberately kept separate from the existing Settings page**,
  which is admin-facing (playback device, queue moderation, PIN-gated).
  Instead, a new nav item is added — icon-only avatar glyph, labeled
  **"Me"** — that opens the guest's own profile:
  - Shows their auto-generated device label and Guest ID.
  - Lets them enter a **nickname**.
  - Lets them pick an **avatar** from a small built-in set of simple icons
    (e.g. a curated set of emoji, or an open-source icon set like
    [Lucide](https://lucide.dev) or a small hand-picked emoji palette —
    exact source TBD at implementation time, just needs to be free to use
    and visually simple, not photo uploads).
  - Setting a nickname/avatar is optional. Until a guest sets one, they're
    just an anonymous heart/queue entry with no name shown to others —
    nothing changes for guests who don't engage with "Me" at all.
- **Limitation to flag:** this identifies a *browser*, not a *physical
  device*. Clearing browser data, using a different browser, or switching
  devices all produce a brand-new Guest ID with no favorites, nickname, or
  avatar — there's no login to recover the old one. This is a deliberate
  trade-off to avoid requiring guests to sign in.

## Where "Favorite" shows up

Every place a song is already shown to a guest gets a small heart control
next to it:

1. **Now Playing** — the song currently playing gets a heart.
2. **Up Next / Queue** — each queued song gets a heart.
3. **History** — each previously-played song in the leaderboard/recently-played
   list gets a heart.

Tapping the heart toggles the favorite on/off for that song. Since
favorites are no longer purely private, the heart is color-coded to show
favorite status at a glance, for anyone looking at the screen:

- **Gray heart** — nobody has favorited this song.
- **Yellow/amber heart** — one or more *other* guests have favorited it,
  but the current guest hasn't.
- **Red heart** — the current guest has favorited it (regardless of
  whether others have too).

Tapping toggles the current guest's own favorite; it never removes someone
else's. The state is reflected everywhere that song appears — favoriting it
from the queue also shows it as favorited later in History, and vice versa.

### Attribution: who added it, who favorited it

Now that guests can optionally set a nickname/avatar, this is also the
natural place to show **who queued a song**:

- Each entry in **Up Next / Queue** shows the avatar (and nickname, if set)
  of the guest who added it, next to the song info.
- Guests who haven't set a nickname/avatar show no attribution — this
  isn't retroactive or required, it only applies where a guest opted in.
- Favorites don't need a full attribution list in the UI (no "favorited by:
  Alex, Sam, Jordan" roster) — the heart's color already communicates the
  needed signal (mine / someone else's / nobody's) without cluttering the
  song row.

## The Favorites list (on Find Music)

The **Find Music** page gains a new section (or tab) called **Favorites**,
alongside the existing search UI. It shows every song the guest has
favorited, most-recently-favorited first by default.

Each row shows the same basic info guests already see elsewhere — song
title, artist, and album art — plus:

- A filled heart (tap to remove from Favorites).
- An **Add to Queue** action, so a favorite can be requeued in one tap
  without needing to search for it again.

### Filtering and sorting

Above the Favorites list, guests get controls to:

- **Sort by:** Song Name (A–Z / Z–A) or Artist (A–Z / Z–A). Default sort is
  most-recently-favorited.
- **Filter/search:** a text box to narrow the list down as the guest types,
  matching against song name or artist — useful once someone has favorited
  a lot of songs.

### Empty state

If a guest hasn't favorited anything yet, the Favorites section shows a
friendly empty state (e.g. "No favorites yet — tap the heart on any song to
save it here") instead of an empty list.

## Behavior notes

- Favoriting a song does **not** change the queue or playback in any way —
  it's purely a personal bookmark.
- A song can be favorited whether it's playing, queued, or historical; the
  heart control works the same everywhere.
- Favorites are stored server-side against the guest's Guest ID, so they
  persist indefinitely (no automatic expiry) as long as the guest keeps
  using the same browser — clearing that browser's storage or switching
  devices orphans the old favorites, per the Guest ID limitation above.
- No limit is proposed on how many songs a guest can favorite.
- This is separate from the **most-played leaderboard already on History**
  — that's the closest thing the app has to an "app-wide favorites" view
  today (songs everyone plays most), and this proposal doesn't change it.
  Favorites stay a personal, per-guest list; the leaderboard stays the
  global signal.

## Visual theming

The app has an established "slick glass" look (frosted/translucent cards,
soft borders, restrained color use — see existing components like
[Card.tsx](../../../frontend/src/components/ui/Card.tsx) and the nav bars).
Everything new here — the heart states, avatars, and the "Me" tab — should
be designed to fit that existing language rather than introduce a new
visual style:

- The gray/yellow/red heart states should read as accent-color changes
  within the existing glass aesthetic, not as bright/saturated UI chrome.
- Avatars should stay small, simple, and consistent with the app's current
  restrained icon style (the nav icons are a good reference point) —
  nothing skeuomorphic or heavy.
- The "Me" tab's nav icon follows the same style as the other four nav
  icons (line-art, `currentColor` stroke) so it doesn't stand out as a
  different kind of control.

## Open questions for scoping

- Any cap on favorites list size worth enforcing for UI/performance reasons?
- Exact avatar icon set/source (see "Me" tab above) — needs a concrete
  pick before implementation, just needs to be free-to-use and simple.
