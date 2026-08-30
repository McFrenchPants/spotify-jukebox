import { NavLink } from 'react-router-dom'
import { NAV_ITEMS, CONNECT_NAV_ITEM } from './navItems'
import { useIsJukeboxDevice } from '../../hooks/useIsJukeboxDevice'

/**
 * Fixed left side rail (L1.1) — the `sm`-and-up counterpart to `BottomNav`'s
 * fixed bottom tab bar. Renders the same four `NAV_ITEMS` as a vertical list
 * (icon + label side by side per row) instead of BottomNav's icon-over-label
 * stack, with the same `.glass-pill` active-state treatment. Hidden below
 * `sm`. Rendered as a sibling of `AppShell` in `RootLayout.tsx` (L1.2), always
 * mounted alongside `BottomNav` so route-active state stays consistent
 * regardless of which one is visually shown.
 */
export function SideNav() {
  const isJukeboxDevice = useIsJukeboxDevice()
  const navItems = NAV_ITEMS.map((item) => (item.to === '/me' && isJukeboxDevice ? CONNECT_NAV_ITEM : item))

  return (
    <nav
      className="glass-chrome fixed inset-y-0 left-0 z-20 hidden w-48 flex-col border-y-0 border-l-0 sm:flex"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <div className="flex w-full flex-col gap-1 px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-full px-2 py-2 text-body transition-fast ${
                isActive ? 'text-accent' : 'text-text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-fast ${
                    isActive ? 'glass-pill' : 'group-active:bg-white/5'
                  }`}
                >
                  <Icon className="shrink-0" />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
