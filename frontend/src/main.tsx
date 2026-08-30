import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { RootLayout } from './components/RootLayout.tsx'
import { NowPlayingPage } from './pages/NowPlayingPage.tsx'
import { SearchPage } from './pages/SearchPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { MePage } from './pages/MePage.tsx'
import { ConnectPage } from './pages/ConnectPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import StyleGuide from './pages/StyleGuide.tsx'
import { SessionProvider } from './context/SessionContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'
import { NativeBackendGate } from './components/NativeBackendGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            element={
              <NativeBackendGate>
                <SessionProvider>
                  <RootLayout />
                </SessionProvider>
              </NativeBackendGate>
            }
          >
            <Route path="/" element={<NowPlayingPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="/style-guide" element={<StyleGuide />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
)
