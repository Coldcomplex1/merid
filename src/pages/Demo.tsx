import { useMemo } from 'react'
import { createMockDeck } from '../deck/mockDeck'
import DeckView from '../components/study/DeckView'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Testing environment: the entire My Deck experience on mock data — no
 *  account, no Firebase, state kept in this browser only. */
export default function Demo() {
  const { t } = useLang()
  usePageTitle(`${t.deck.demoTitle} · Merid`)

  const source = useMemo(() => createMockDeck(), [])

  return <DeckView source={source} title={t.deck.demoTitle} banner={t.deck.demoBanner} />
}
