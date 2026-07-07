import Hero from '../components/sections/Hero'
import LiveDemo from '../components/sections/LiveDemo'
import Features from '../components/sections/Features'
import PanelShowcase from '../components/sections/PanelShowcase'
import HowItWorks from '../components/sections/HowItWorks'
import Benefits from '../components/sections/Benefits'
import Faq from '../components/sections/Faq'
import Waitlist from '../components/sections/Waitlist'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

export default function Home() {
  const { t } = useLang()
  usePageTitle(t.meta.title)

  return (
    <>
      <Hero />
      <LiveDemo />
      <Features />
      <PanelShowcase />
      <HowItWorks />
      <Benefits />
      <Faq />
      <Waitlist />
    </>
  )
}
