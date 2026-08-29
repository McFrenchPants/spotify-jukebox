import { useOutletContext } from 'react-router-dom'
import { SearchAndQueue } from '../components/search/SearchAndQueue'
import type { RootLayoutContext } from '../components/RootLayout'

/** Find Music tab (P4.8) — the existing P4.2 search + add-to-queue UI, moved here unchanged. */
export function SearchPage() {
  const { subscribe } = useOutletContext<RootLayoutContext>()

  return <SearchAndQueue subscribe={subscribe} />
}
