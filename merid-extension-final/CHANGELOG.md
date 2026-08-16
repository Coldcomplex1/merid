# Changelog

## 1.6.6 — 2026-08-16

**Three fixes: a lost "I know this", lower-case words in headlines, and a badge in the way.**

- Marking a word "Đã thuộc" in your deck sticks. Signing in on a device cleared that device's record of what it had already sent, after which the extension re-introduced every word it knew and stamped its own "still learning" over marks made on the site — so a deck marked up on merid.site came back untouched at the next sign-in. The extension now only sends a saved/known state when it is the thing that changed it.
- A word standing where a capitalised one stood is capitalised too: "Khó" gives "Difficult" and a headline's "KHÓ KHĂN" gives "DIFFICULT", instead of a lower-case word announcing itself as a substitution. Vietnamese tone marks survive the change.
- The reading badge sits bottom-left instead of bottom-right, out from under Facebook's new-message button and the chat bubbles, back-to-top arrows and support widgets that live in that corner. You can drag it anywhere, and it stays where you drop it on every site.

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
