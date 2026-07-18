import { useEffect } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider, RequireAuth } from './auth/AuthContext'
import AnnouncementBanner from './components/sections/AnnouncementBanner'
import Navbar from './components/sections/Navbar'
import Footer from './components/sections/Footer'
import Home from './pages/Home'
import Tutorial from './pages/Tutorial'
import CreateDataset from './pages/CreateDataset'
import ApiKeyGuide from './pages/ApiKeyGuide'
import MyDeck from './pages/MyDeck'
import AuthPage from './pages/AuthPage'
import Welcome from './pages/Welcome'
import Goodbye from './pages/Goodbye'

/** Scrolls to the hash target on navigation (e.g. /#demo from the tutorial page), else to top. */
function ScrollManager() {
  const location = useLocation()

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1))
      if (el) {
        el.scrollIntoView()
        return
      }
    }
    window.scrollTo(0, 0)
  }, [location])

  return null
}

/** Marketing-site chrome: banner + navbar + footer around every page except
 *  /my-deck, which is a standalone app-like screen with its own header. */
function SiteLayout() {
  return (
    <>
      <AnnouncementBanner />
      <Navbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollManager />
            <div className="min-h-screen bg-canvas text-body">
              <Routes>
                <Route element={<SiteLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/tutorial" element={<Tutorial />} />
                  <Route path="/create-dataset" element={<CreateDataset />} />
                  <Route path="/api-key-guide" element={<ApiKeyGuide />} />
                  {/* Opened by the extension: first install / after uninstall. */}
                  <Route path="/welcome" element={<Welcome />} />
                  <Route path="/goodbye" element={<Goodbye />} />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/signup" element={<AuthPage mode="signup" />} />
                  <Route path="*" element={<Home />} />
                </Route>
                <Route
                  path="/my-deck"
                  element={
                    <RequireAuth>
                      <MyDeck />
                    </RequireAuth>
                  }
                />
              </Routes>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
