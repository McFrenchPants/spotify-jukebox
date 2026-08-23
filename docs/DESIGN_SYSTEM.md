# Design System

Guest Jukebox is a dark, album-art-driven, phone-first PWA. This doc covers the design
tokens and component primitives defined in P0.5. Everything below is implemented in
`frontend/src/index.css` (tokens, via Tailwind v4's `@theme` block) and
`frontend/src/components/ui/` (primitives). Live examples: run the app and visit
`/style-guide`.

No `tailwind.config.js` exists — this is Tailwind v4, which reads theme tokens from CSS
custom properties in `@theme { ... }`. Tailwind auto-generates utility classes from those
tokens (e.g. `--color-accent` → `bg-accent`, `text-accent`, `border-accent`, `fill-accent`, ...).

## Color

Three tiers: dark neutral scale, one accent, semantic colors.

| Token | Hex | Utility | Use for |
|---|---|---|---|
| `--color-bg` | `#0a0a0b` | `bg-bg` | Page background (near-black) |
| `--color-surface` | `#151517` | `bg-surface` | Cards, default raised content |
| `--color-surface-raised` | `#1e1e21` | `bg-surface-raised` | Toasts, sheets, one tier above surface |
| `--color-surface-overlay` | `#26262a` | `bg-surface-overlay` | Skeletons, hover/overlay fills |
| `--color-border` | `#2c2c30` | `border-border` | Default hairline border |
| `--color-border-strong` | `#3f3f45` | `border-border-strong` | Emphasized border (active states) |
| `--color-text-primary` | `#f5f5f7` | `text-text-primary` | Headings, primary content |
| `--color-text-secondary` | `#a8a8ae` | `text-text-secondary` | Supporting text |
| `--color-text-muted` | `#6c6c73` | `text-text-muted` | Captions, disabled/placeholder text |
| `--color-accent` | `#2fd66f` | `bg-accent` / `text-accent` | Primary action color (deliberately distinct from Spotify's `#1DB954`) |
| `--color-accent-hover` | `#29bd62` | `bg-accent-hover` | Hover fill for accent surfaces |
| `--color-accent-active` | `#22a354` | `bg-accent-active` | Pressed fill for accent surfaces |
| `--color-success` | `#34d399` | `bg-success` / `text-success` | Success toasts, confirmations |
| `--color-error` | `#f87171` | `bg-error` / `text-error` | Error toasts, danger button |
| `--color-warning` | `#fbbf24` | `bg-warning` / `text-warning` | Guardrail-rejection messages (explicit content blocked, duplicate track, rate limit) |

Rule: **no raw hex values or Tailwind's default neutral/green palette (`neutral-*`,
`green-*`, etc.) in app code.** Every color used by a component should trace back to one
of these tokens. (`App.tsx`'s placeholder still uses `neutral-*` from before this task —
replace it when Phase 4 builds the real `/` screen.)

### Ambient background

The "now playing" background is a blurred/darkened rendering of the current track's
album art (implementation choice: CSS `blur()` filter + a dark gradient overlay, or
dominant-color extraction — decide in the phase that builds now-playing). Falls back to
a static gradient built from `--color-bg` and `--color-accent` at low opacity when
nothing is playing or art is unavailable. See the "Ambient background mock" section on
`/style-guide` for a rough approximation using existing tokens only.

## Typography

Single system font stack (no web font loading — this is a LAN-only app, so there's no
benefit to shipping font files, and system fonts render instantly):

```
system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif,
"Apple Color Emoji", "Segoe UI Emoji"
```

One type scale, four steps, each a paired Tailwind v4 `--text-{name}` /
`--text-{name}--line-height` / `--text-{name}--font-weight` token exposed as a
`text-{name}` utility:

| Name | Size | Line height | Weight | Use for |
|---|---|---|---|---|
| `text-display` | 2.25rem (36px) | 2.5rem | 700 | Page-level heading (e.g. app title) |
| `text-title` | 1.25rem (20px) | 1.75rem | 600 | Section headings, modal/sheet titles, card titles |
| `text-body` | 1rem (16px) | 1.5rem | 400 | Default body copy, buttons |
| `text-caption` | 0.8125rem (13px) | 1.125rem | 400 | Metadata, timestamps, helper text, toast descriptions |

Don't reach for Tailwind's default `text-sm`/`text-lg`/etc. scale in app code — use the
four semantic names above so type usage stays consistent app-wide.

## Spacing

Uses Tailwind's standard spacing scale (`--spacing: 0.25rem` base, so `p-4` = 1rem,
`gap-2` = 0.5rem, etc.) rather than a second custom scale — Tailwind v4's numeric
spacing utilities already give a complete, consistent scale, and introducing a parallel
one would just create two ways to express the same gap. Use the numeric utilities
(`p-*`, `gap-*`, `m-*`, `space-y-*`) directly; don't hardcode `px`/`rem` spacing values
in component code.

## Radius

| Token | Value | Utility | Use for |
|---|---|---|---|
| `--radius-sm` | 0.375rem | `rounded-sm` | Small controls (dismiss buttons, chips) |
| `--radius-md` | 0.625rem | `rounded-md` | Buttons, form inputs, skeleton blocks |
| `--radius-lg` | 1rem | `rounded-lg` | Cards |
| `--radius-xl` | 1.5rem | `rounded-xl` | Modal/sheet containers |
| `--radius-full` | 9999px | `rounded-full` | Avatars, dots, pill badges |

## Motion

One easing curve, three durations, defined once and reused everywhere:

| Token | Value |
|---|---|
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--duration-fast` | 120ms |
| `--duration-base` | 200ms |
| `--duration-slow` | 320ms |

Tailwind v4 doesn't have a themeable duration namespace, so these are plain CSS custom
properties plus three convenience utility classes defined in `index.css`:
`.transition-fast`, `.transition-base`, `.transition-slow` (each sets
`transition-duration` + `transition-timing-function` together). Use `fast` for
micro-interactions (button press), `base` for most UI transitions (toast enter/exit,
sheet open), `slow` for larger layout shifts (ambient background crossfade).

`index.css` also includes a global `prefers-reduced-motion: reduce` media query that
collapses all animation/transition durations to near-zero. Primitives don't need to
handle this themselves — it's handled once, globally.

## Component primitives

All under `frontend/src/components/ui/`, one file per primitive.

### `Button` (`Button.tsx`)
Props: `variant?: 'primary' | 'secondary' | 'danger'` (default `primary`), `size?: 'md' | 'lg'`
(default `md`), plus all native `<button>` props.
- **primary**: the one main action on a screen (add to queue, confirm).
- **secondary**: everything else (cancel, alternate actions).
- **danger**: destructive/admin actions (skip track, remove guest, delete).
- Visible pressed state via `active:scale-[0.97]` plus a color shift per variant — this
  app is touch-only, so pressed feedback substitutes for hover.

### `Card` (`Card.tsx`)
Props: `noPadding?: boolean`, plus native `<div>` props. Generic bordered surface
(`bg-surface` + `border-border` + `rounded-lg`). Use for queue rows, track detail
panels, admin list items. Pass `noPadding` when the child manages its own layout.

### `Toast` (`Toast.tsx`)
Props: `variant?: 'success' | 'error' | 'warning' | 'info'`, `title: string`,
`description?: ReactNode`, `onDismiss?: () => void`. Left-accent-bar + dot indicate
severity. `warning` is specifically for guardrail-rejection messages. This component is
presentational only — a toast host/queue with auto-dismiss timing is a later-phase
concern.

### `Skeleton` (`Skeleton.tsx`)
Props: `variant?: 'line' | 'circle' | 'block'`. Pulsing placeholder
(`animate-pulse` + `bg-surface-overlay`). Compose multiple to mock a row, e.g. a
`circle` (art) + two `line`s (title/artist) for a loading track item.

### `Modal` (`Modal.tsx`)
Props: `open: boolean`, `onClose: () => void`, `title?: string`, `layout?: 'modal' | 'sheet'`
(default `sheet`). Renders via `createPortal` to `document.body`, closes on
backdrop click or Escape. `sheet` docks to the bottom of the viewport (default — better
for one-handed phone use); `modal` centers as a dialog card, best for short
confirmations. Will be reused by the admin panel and track-detail views in later phases.

## `/style-guide` route

`frontend/src/pages/StyleGuide.tsx`, mounted at `/style-guide` via `react-router-dom`
(added in this task; `frontend/src/main.tsx` now wraps the app in a `BrowserRouter` with
routes for `/` and `/style-guide`). Renders every token category (color swatches, type
scale, spacing steps, radius steps, motion demo) and every primitive in its variants,
including an interactive pressed-state demo for `Button` and open/close triggers for
`Modal`. The route is always registered (not gated behind `import.meta.env.DEV`) — this
is a small internal tool with no sensitive data, so the simplicity of an always-present
route outweighs the benefit of stripping it from production builds. Gate it behind
`import.meta.env.DEV` later if that changes.
