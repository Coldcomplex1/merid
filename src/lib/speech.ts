/** Word pronunciation, shared by the replica popup card and the deck.
 *
 *  Browser speech synthesis only - no audio files, no TTS request - so it works
 *  offline and for any word the user has saved, including rows stored long
 *  before the deck grew a speaker button. */
export function speak(word: string) {
  try {
    // Cancel first: tapping through several words in a list should replace the
    // utterance, not queue up a backlog that keeps talking after you stop.
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(word)
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  } catch {
    /* speech not available */
  }
}
