import Hero from '../components/sections/Hero'
import LiveDemo from '../components/sections/LiveDemo'
import Features from '../components/sections/Features'
import PanelShowcase from '../components/sections/PanelShowcase'
import HowItWorks from '../components/sections/HowItWorks'
import Benefits from '../components/sections/Benefits'
import Faq from '../components/sections/Faq'
import FinalCta from '../components/sections/FinalCta'
import { useLang, usePageMeta } from '../i18n/LanguageContext'

export default function Home() {
  const { t } = useLang()
  usePageMeta(t.meta.title, t.meta.description)

  return (
    <>
      <Hero />
      <LiveDemo />
      <Features />
      <PanelShowcase />
      <HowItWorks />
      <Benefits />
      <Faq />
      <FinalCta />
    </>
  )
}
