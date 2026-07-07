import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Navbar from './components/sections/Navbar'
import Footer from './components/sections/Footer'
import Home from './pages/Home'
import Tutorial from './pages/Tutorial'

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
    <BrowserRouter>
      <ScrollManager />
      <div className="min-h-screen bg-navy-900 text-white">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tutorial" element={<Tutorial />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
