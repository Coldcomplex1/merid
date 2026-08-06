# Merid brand assets

Masters for the Merid identity: a navy tile, a cream **M**, and a gold bar struck through it
(the highlight the extension draws on a swapped word). Everything shipped by the website or the
extension is derived from the files here — edit or replace a master, re-run the generator, never
hand-edit a generated file.

```bash
node scripts/gen-brand-assets.js          # icons + social card
node scripts/gen-brand-assets.js icons    # skip the Chromium render
```

The generator borrows the dependency-free PNG codec at
`merid-extension-final/scripts/png-resize.js` — that file has callers on both sides of the repo,
so it is not extension-only.

## Palette

| | Hex | Used for |
|---|---|---|
| Navy | `#16233f` | tile, the M on light surfaces |
| Cream | `#f7f6f3` | the M on dark surfaces |
| Gold | `#f3c33c` | the highlight bar |

These are the logo's own colours and sit a shade off the site's UI tokens
(`--color-navy-900`, `--color-gold-400` in `src/index.css`), which are deliberately unchanged.

## Masters (committed)

| File | What it is |
|---|---|
| `merid-icon-dark-{16,32,48,128,512,1024}.png` | the tile: cream M on navy, transparent rounded corners |
| `merid-icon-light-512.png` | reversed tile: navy M on cream |
| `merid-mark-navy-512.png` | bare mark, navy M, transparent — for light backgrounds |
| `merid-lockup-{light,dark}-1520.png` | mark + "merid" wordmark; **opaque backgrounds baked in**, so these are reference art, not drop-in assets |

## Generated

| File | Source | Where it is used |
|---|---|---|
| `brand/merid-mark-cream-512.png` | recoloured `merid-mark-navy-512.png` | dark surfaces: extension popup/options, store art |
| `public/favicon.ico` | pack's 16/32/48 renders, wrapped in an ICO | browsers, search results |
| `public/favicon.svg` | traced vector (see below) | modern browsers, crisp at any size |
| `public/apple-touch-icon.png` | 1024 master flattened onto navy, resized to 180 | iOS home screen (it masks corners itself, so this one is opaque and full-bleed) |
| `public/og-image.png`, `public/og-card.jpg` | `assets/og-card.html` | social previews (the JPEG stays under 100 KB for Zalo/WhatsApp) |
| `merid-extension-final/icon{16,32,48,128}.png` | copied verbatim | `manifest.json` icons + toolbar action |
| `merid-extension-final/logo-mark.png` | cream mark at 128 | popup and options headers |

## Which variant goes where

- **Light background** → tile (`icon-dark`) or the bare navy mark.
- **Dark background** → the bare cream mark; a navy tile disappears into it.
- **Site navbar/footer/deck** → `src/components/ui/MeridMark.tsx`, an inline SVG traced from
  `merid-icon-dark-1024.png`. It shows the tile in light theme and drops to the bare cream mark in
  dark theme — the two share identical inner geometry, so nothing shifts. `variant="tile"` pins the
  tile for the demo mockups, which draw a fixed-palette light Chrome UI regardless of site theme.
- **Favicons / app icons** → always the tile; it has to hold up against unknown browser chrome.

`scripts/trace-mark.js` regenerates the SVG geometry from the 1024 master and pixel-diffs the
result against it, so the vector and the PNGs can never drift apart silently.
