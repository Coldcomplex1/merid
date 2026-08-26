# Changelog

## 1.8.0 — 2026-08-26

**Merid now works on a small set of words at a time, instead of the whole dataset.**

- **Words in play.** Merid draws a set of words from your dataset and shows you only those, so a word comes back often enough to actually stick. Before this, which words you met was decided by whatever happened to be on the page — you could meet a word once and never see it again. **Everyone starts at 100 words.** You will notice fewer different words than before; you will notice the same ones more often, which is the point.
- **The set looks after itself.** A word shown more than five times that you never once react to is quietly dropped and replaced — it clearly is not landing. Save a word to your deck and the set grows by one. Mark a word as known and it leaves, making room.
- **Choose your own number** in Settings → Words in play: 25, 50, 100, 200, All, or type any number you like. "All" is how Merid behaved before this release, if you prefer it that way.
- **The set can fill up.** Saving words grows it to twice the number you chose (100 becomes 200). When it is full, the toolbar icon shows a mark and the popup says so. Mark some words as known to free up room, or just raise the number.
- **See and edit the set** in Settings. Every word is listed with its meaning, and you can mark one as known, swap one out, add a specific word, or draw a whole new set.
- **Marking a word learned on merid.site now reaches the extension.** The deck only ever synced upwards, so a word you marked as known on the website kept appearing while you browsed. If you are signed in, those marks now come back down to your browser.
- Opening a learning card only counts as interest if you actually read it — a click inside it, or leaving it open for a moment. The mouse passing over a word on its way somewhere else no longer speaks for you.
- The list of words Merid is working on with you stays on this device. It holds words from the dataset and counters, and no page text.

## 1.7.1 — 2026-08-24

**A quieter mark on the word, and the picture on the learning card is off for now.**

- A word Merid put on the page now wears a dotted gold underline and nothing else. The pale yellow wash behind it is gone, and so is the way it darkened under the pointer — the page keeps its own background, and the word is marked rather than lit up. Hovering still opens the card.
- Hovering a word shows its meaning without a picture again. The card is the definition, the example and the buttons, as it was before 1.7.0.
- The On/Off control for it is gone from the toolbar popup and from Settings, along with the "Where the pictures come from" list, rather than left there switching something that no longer appears.
- Nothing else about the card changed: the display modes, the deck buttons, the theme and the long-card scrolling all work as they did.
- Whatever you had it set to is remembered. Nobody has to set it again on the day the picture comes back.

## 1.7.0 — 2026-08-22

**A picture on the learning card, and a card that stays on the screen.**

- Hovering a word now shows a picture beside its meaning. Words you can point a camera at get a photograph; the rest — the adjectives, the states, the words for ideas — get a symbol for what they are about, on a colour of their own. Every word gets one or the other, so the card never looks half-finished.
- The pictures come with Merid rather than from the web. Nothing is downloaded while you read, nothing is requested from anyone, and the pictures work on sites that block outside images and on a plane with no signal. Merid still makes no network request of its own.
- A word with two meanings gets two pictures. "Delegate" is a person in one dataset and an act in another, and each one is illustrated as what it actually means rather than sharing whichever picture came first.
- Turn it off from the toolbar popup, or in Settings under Replacement. The words on the page do not move when you do — only the card changes.
- Settings lists where every picture came from, under "Where the pictures come from": the archive, the photographer where one is named, and the licence. None of the licences require it. It is there because these pictures travel inside Merid rather than being fetched from someone else's server, and a picture whose origin cannot be stated is one that should not have shipped.
- On a narrow window the picture goes back above the meaning, where there is room for it.
- A long card no longer runs off the bottom of a short window. It now stops at the edge of the screen and scrolls inside itself, so the buttons stay where you can reach them. Before this, anything past the bottom of the window was unreachable: scrolling down to read it moved the pointer off the word and closed the card.

## 1.6.6 — 2026-08-20

**Five fixes: a lost "I know this", lower-case words where a capital belongs, a badge in the way, and a badge that could stop words appearing at all.**

- Marking a word "Đã thuộc" in your deck sticks. Signing in on a device cleared that device's record of what it had already sent, after which the extension re-introduced every word it knew and stamped its own "still learning" over marks made on the site — so a deck marked up on merid.site came back untouched at the next sign-in. The extension now only sends a saved/known state when it is the thing that changed it.
- A word standing where a capitalised one stood is capitalised too: "Khó" gives "Difficult" and a headline's "KHÓ KHĂN" gives "DIFFICULT", instead of a lower-case word announcing itself as a substitution. Vietnamese tone marks survive the change.
- A word standing at the front of a sentence takes the sentence's capital, even where the writer left the Vietnamese without one — which is how most of a feed and nearly every comment is written. Reading the case off the Vietnamese only carries as far as the writer's own capital, so where there was none the swapped word opened the sentence on a small letter and gave itself away, which is the very thing the capital was added to stop. A word after a full stop, a question or exclamation mark, or at the start of a paragraph, heading or list item now takes it regardless. A word inside a sentence is untouched, and in "từ (word)" mode the Vietnamese still leads and still keeps its own case.
- A card in the deck turns back to the word when you mark it known. The tick lives on the meaning side, so pressing it used to leave the card face-down on its own definition — a grid of them stopped reading as a deck of words.
- The reading badge sits bottom-left instead of bottom-right, out from under Facebook's new-message button and the chat bubbles, back-to-top arrows and support widgets that live in that corner. You can drag it anywhere, and it stays where you drop it on every site.
- Merid keeps working on a page where the reading badge cannot be set up. Most often that is a second copy of Merid installed alongside this one: both reach for the same badge, the second one fails to claim it, and because the badge is set up in the middle of the reading check it took the check down with it — no word was ever cleared to appear, and Merid looked switched off. The badge now shares the one already on the page, and nothing that goes wrong with it can stop a page being read.

## 1.6.5 — 2026-08-16

**A short setup on the day you install Merid, and a deck you can look through.**

- Installing now asks which vocabulary you want and how the English should appear, rather than starting on our defaults without telling you either was a choice.
- The setup waits for you. It appears the first time you open Merid from the toolbar, over the page you are on rather than in a tab of its own, so you answer it where the answers apply.
- It closes on "Bỏ qua" and nowhere else. Clicking past it will not dismiss it, and both ways out save what is on screen.
- The three display modes are shown instead of described, and selecting one says what it does.
- Reopen the setup any time from "Hướng dẫn nhanh" in the popup. Reopened, it starts from the settings you are actually on.
- The popup no longer says a page is off in warning red. On sites Merid stays out of — your messages, your bank, our own site — it says so in the same dark blue as the rest of the footer, and the states you cannot change now look unclickable instead of hovering as though you could.
- Your deck opens on a Library: a grid of one card per word, gold while you are learning it and green once you know it, with search, a SAT/C1/C2 filter and a card that turns over to the meaning. The old list is still there under View, for words whose definitions want the room.

## 1.6.4 — 2026-08-13

**Privacy fix for direct messages, plus popup and reading-flow polish.**

- Cleaned up the per-site tooltips so the blocked-site messages read in one short breath.
- Stopped scanning direct messages on sites that also serve feeds, so DMs are no longer touched.
- Removed the "you're signed out" scolding from the bottom of the popup.
- Let readers pick the panel's language from the site or Settings.
- Readers now start on C1, with C1 leading the dataset list.
- Words are only shown once the context check has cleared them, and highlighted words are checked too, not just swapped ones.
- Simplified the intensity control to three stops in a single column of buttons, and gave the card a dark palette when light isn't available.

## 1.6.3 — earlier

- See git history for changes prior to this changelog.
