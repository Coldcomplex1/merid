# Display-mode preview images

The three pictures the onboarding wizard shows at step 3, one per display mode.
Drop them in this folder with exactly these names:

| File | What it should show |
| --- | --- |
| `mode-replace.png` | a Vietnamese word **swapped out** for its English one |
| `mode-highlight.png` | the Vietnamese kept, **marked in gold** |
| `mode-beside.png` | `tiếng Việt (english)` — the English alongside |

Shoot the same sentence in all three, or the difference between the modes is
lost in the difference between the paragraphs.

`.png` or `.webp` both work; keep each under 60 KB. Any aspect ratio is fine —
the card sizes them with `object-fit: contain`, so nothing is stretched.

A cut-out with a transparent background is fine too. The card lays a
cream plate (`#fdfcf7`) behind the picture before drawing it, so dark text
does not sink into the navy panel around it.

## Nothing here yet?

The wizard does not wait for these. A card whose picture is missing or fails to
load draws the mode itself instead, in HTML, from the same
`.vocab-master-highlight` rule (`content.css`) that marks words on a real page.
Adding the files is a straight swap — no code changes.

Whatever lands here must also go in the `FILES` list in `scripts/build.js` and
in `web_accessible_resources` in `manifest.json`, or it will not ship.
