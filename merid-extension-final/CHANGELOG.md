# Changelog

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
