# Display-mode preview images

The three pictures the onboarding wizard shows at step 3, one per display mode.
Drop them in this folder with exactly these names:

| File | What it should show |
| --- | --- |
| `mode-replace.webp` | a Vietnamese word **swapped out** for its English one |
| `mode-highlight.webp` | the Vietnamese kept, **marked in gold** |
| `mode-beside.webp` | `tiếng Việt (english)`, the English alongside |

Shoot the same sentence in all three, or the difference between the modes is
lost in the difference between the paragraphs.

`.png` or `.webp` both work. Trim the transparent margin off before committing
and keep each under ~60 KB: a full-page export is mostly empty canvas, which
`object-fit: contain` then shrinks the actual card to fit, so an untrimmed file
is both far heavier and far smaller on screen than it should be. The card's
plate is set to the artwork's own 1.85:1, so replacements should keep roughly
that shape or they will letterbox.

A cut-out with a transparent background is fine too. The card lays a
cream plate (`#fdfcf7`) behind the picture before drawing it, so dark text
does not sink into the navy panel around it.

## Nothing here yet?

The wizard does not wait for these. A card whose picture is missing or fails to
load draws the mode itself instead, in HTML, from the same
`.vocab-master-highlight` rule (`content.css`) that marks words on a real page.
Adding the files is a straight swap, with no code changes.

Whatever lands here must also go in the `FILES` list in `scripts/build.js` and
in `web_accessible_resources` in `manifest.json`, or it will not ship.
