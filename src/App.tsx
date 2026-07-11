import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { AuthProvider, RequireAuth } from './auth/AuthContext'
import AnnouncementBanner from './components/sections/AnnouncementBanner'
import Navbar from './components/sections/Navbar'
import Footer from './components/sections/Footer'
import Home from './pages/Home'
import Tutorial from './pages/Tutorial'
import MyDeck from './pages/MyDeck'
import AuthPage from './pages/AuthPage'

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

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollManager />
            <div className="min-h-screen bg-canvas text-body">
              <AnnouncementBanner />
              <Navbar />
              <main>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/tutorial" element={<Tutorial />} />
                  <Route
                    path="/my-deck"
                    element={
                      <RequireAuth>
                        <MyDeck />
                      </RequireAuth>
                    }
                  />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/signup" element={<AuthPage mode="signup" />} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}
