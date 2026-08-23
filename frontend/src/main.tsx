import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { RootLayout } from './components/RootLayout.tsx'
import { NowPlayingPage } from './pages/NowPlayingPage.tsx'
import { SearchPage } from './pages/SearchPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import StyleGuide from './pages/StyleGuide.tsx'
import { SessionProvider } from './context/SessionContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <SessionProvider>
              <RootLayout />
            </SessionProvider>
          }
        >
          <Route path="/" element={<NowPlayingPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="/style-guide" element={<StyleGuide />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
