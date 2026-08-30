import { NavLink } from 'react-router-dom'
import { NAV_ITEMS, CONNECT_NAV_ITEM } from './navItems'
import { useIsJukeboxDevice } from '../../hooks/useIsJukeboxDevice'

/**
 * Fixed bottom tab bar (P4.8) — the app's 4-tab primary navigation. Rendered
 * by AppShell via its `bottomBar` prop so it stays mounted (and its active
 * state persists) across route changes within RootLayout's nested routes.
 * `/style-guide` is a separate top-level route and never renders this.
 * Hidden `sm` and up (L1.2), where `SideNav` takes over — both stay mounted
 * simultaneously so route-active state is consistent regardless of which is
 * visually shown, and CSS breakpoints (not JS) decide which one renders.
 */
export function BottomNav() {
  const isJukeboxDevice = useIsJukeboxDevice()
  const navItems = NAV_ITEMS.map((item) => (item.to === '/me' && isJukeboxDevice ? CONNECT_NAV_ITEM : item))

  return (
    <nav
      className="glass-chrome fixed inset-x-0 bottom-0 z-20 border-x-0 border-b-0 sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary"
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-around px-2 py-1.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex flex-1 flex-col items-center justify-center gap-1 py-1.5 text-caption transition-fast ${
                isActive ? 'text-accent' : 'text-text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-fast ${
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
