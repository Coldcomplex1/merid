import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { createFirestoreDeck } from '../deck/firestoreDeck'
import DeckView from '../components/study/DeckView'
import { useLang, usePageTitle } from '../i18n/LanguageContext'

/** Cloud deck for the signed-in user. Route is wrapped in <RequireAuth>, so
 *  user is always present here. */
export default function MyDeck() {
  const { t } = useLang()
  const { user } = useAuth()
  usePageTitle(`${t.deck.title} · Merid`)

  const source = useMemo(() => createFirestoreDeck(user!.uid), [user])

  return <DeckView source={source} title={t.deck.title} />
}
