import Navbar from './components/sections/Navbar'
import Hero from './components/sections/Hero'
import LiveDemo from './components/sections/LiveDemo'
import Features from './components/sections/Features'
import PanelShowcase from './components/sections/PanelShowcase'
import HowItWorks from './components/sections/HowItWorks'
import Benefits from './components/sections/Benefits'
import Waitlist from './components/sections/Waitlist'
import Footer from './components/sections/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-navy-900 text-white">
      <Navbar />
      <main>
        <Hero />
        <LiveDemo />
        <Features />
        <PanelShowcase />
        <HowItWorks />
        <Benefits />
        <Waitlist />
      </main>
      <Footer />
    </div>
  )
}
