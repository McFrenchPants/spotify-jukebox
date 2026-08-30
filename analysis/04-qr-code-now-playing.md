# Analysis: item 4 — guest-connect discoverability on the master device

## Original ask (as written in BACKLOG.md)

> Add a small icon/affordance on the main (now playing) screen that reveals
> the QR code for controlling the jukebox from a guest's own phone. Intent:
> when the bridge device is sitting on a table unattended, people nearby
> should be able to discover that they can control it remotely. Placement
> TBD — should not clutter the primary layout.

## Problem it's actually solving, and for whom

The app's whole value proposition is guest-driven queueing, but today
there is no way for a bystander looking at the bridge/master device's
screen to discover that they *can* control it from their own phone. The
only existing QR/guest-link affordance
([GuestUrlCard.tsx](../frontend/src/components/admin/GuestUrlCard.tsx))
lives inside the PIN-gated admin Settings page — unreachable by a random
guest. This is a real discoverability gap in the core use case (a bridge
device sitting unattended at a gathering), not cosmetic polish.

This only matters for people who **haven't connected yet**. Anyone already
using the app on their own phone has, by definition, already discovered
and reached it — the gap is specifically about the master/bridge device's
own screen, which is the one surface a not-yet-connected bystander
actually sees.

## User check-in (2026-08-30) — this reframed the item

Shared the above problem/value read and a placement question (corner icon
+ modal vs. always-visible thumbnail vs. sketch options). The user's
response substantially reframed the item, and this analysis reflects that
reframing, not the original one-liner:

> Now that we have a Master Device mode, I think the UI should reflect a
> slightly different experience for a guest than the bridge/jukebox
> device. A call to action like "Control the music from your own device!"
> only makes sense to show on the master device, because anyone else would
> have already connected in order to view the app anyway. Right now we
> have a "Me" nav item, which is only useful on guest devices. On the
> master device, we should instead show a "Connect" nav item which shows a
> friendly page with instructions and the QR code.

So this isn't a Now Playing icon/modal anymore — it's **conditional
navigation based on device identity**: the master/bridge device's nav
shows a "Connect" tab instead of "Me" (a personal favorites/nickname tab
that doesn't make sense for a shared bridge device to have its own
identity in), leading to a dedicated page with the QR code, the guest
URL, and brief instructions.

## What already exists vs. what's new

Already exists, reusable as-is:
- Client-side QR generation via the `qrcode` npm package
  ([GuestUrlCard.tsx](../frontend/src/components/admin/GuestUrlCard.tsx))
  — same `window.location.origin` approach applies here.
- A stable per-browser `clientId`
  ([clientId.ts](../frontend/src/lib/clientId.ts), `getOrCreateClientId()`)
  already used to identify "this browser, potentially the registered
  Jukebox device" — already sent unauthenticated on the public SSE
  connection (`/api/events?clientId=...`), so there's precedent for a
  client's own id being usable outside the admin-gated surface.
- Device registration itself (`POST /api/admin/jukebox-device/register`,
  `GET /api/admin/jukebox-device`) — but both currently require the admin
  token, so a plain guest-facing page can't call them to find out its own
  status.

New, not yet built:
- A **public** way for a client to learn "is my own clientId the
  currently-registered Jukebox device?" — e.g. a small unauthenticated
  `GET /api/jukebox-device/mine?clientId=...` returning `{ isRegistered:
  boolean }`. Deliberately scoped to answer only for the caller's own id
  (never exposes the registered id to a client that doesn't already hold
  it), so it doesn't leak device identity to arbitrary guests.
- Nav conditionally swapping "Me" ↔ "Connect" in
  [navItems.tsx](../frontend/src/components/nav/navItems.tsx)/[BottomNav.tsx](../frontend/src/components/nav/BottomNav.tsx)/[SideNav.tsx](../frontend/src/components/nav/SideNav.tsx)
  based on that check.
- A new "Connect" page: QR code + guest URL (reusing `GuestUrlCard`'s
  generation approach, likely as a shared/extracted piece rather than a
  copy) + short guest-facing instructional copy.

## Value vs. cost

Still genuinely core, not a nice-to-have — closes the one real
discoverability gap in the app's primary use case. The cost is modest and
mostly reuse: one small new public endpoint, a conditional nav swap, and
a page that's largely `GuestUrlCard` repurposed. No design spec tier
needed — this reads as "small," matching how items 10/12/13/15/16 were
scoped directly without one.

## Alternatives considered, and why they're not preferred

- **Icon/modal on Now Playing itself** (the original literal ask): works,
  but treats every device identically and requires guests-who-are-already-
  connected to see connect-prompting chrome that's irrelevant to them.
  The nav-swap approach the user steered toward only shows this to the
  one device where it's actually useful.
- **Always-visible QR thumbnail**: rejected already in the original
  backlog entry's own "should not clutter the primary layout" concern;
  superseded anyway by the nav-swap direction.
- **Keep "Me" and add "Connect" as a sixth nav item everywhere**: rejected
  — "Me" (favorites/nickname) doesn't meaningfully apply to a shared
  bridge device with no personal identity of its own, so swapping (not
  adding) is both more correct and avoids nav clutter.

## Open questions (still idea/needs-research tier — not yet answered)

- Exact copy/instructions for the "Connect" page — not scoped yet.
- Whether "master device" here should mean specifically the registered
  Jukebox device from Master Device Mode (item 8, native Android build),
  or more generally "whatever device the admin is running the app from" —
  needs clarifying, since Master Device Mode is optional/self-hoster-only
  and plenty of deployments won't have a registered Jukebox device at
  all. If there's no registered device, does the regular "Me" tab stay as
  the default everywhere? (Likely yes — the conditional only fires when a
  Jukebox device *is* registered and this client's id matches it.)
- Whether the public `isRegistered` check should be a one-shot fetch on
  mount or also live-updated over SSE (e.g. if the admin re-registers a
  different device mid-session, should nav in an already-open tab of the
  old device flip back to "Me" without a reload?). Likely low-priority
  edge case, not a launch blocker.
