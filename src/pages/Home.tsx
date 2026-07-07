import Hero from '../components/sections/Hero'
import LiveDemo from '../components/sections/LiveDemo'
import Features from '../components/sections/Features'
import PanelShowcase from '../components/sections/PanelShowcase'
import HowItWorks from '../components/sections/HowItWorks'
import Benefits from '../components/sections/Benefits'
import Waitlist from '../components/sections/Waitlist'

export default function Home() {
  return (
    <>
      <Hero />
      <LiveDemo />
      <Features />
      <PanelShowcase />
      <HowItWorks />
      <Benefits />
      <Waitlist />
    </>
  )
}
