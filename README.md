# Merid Landing Page

Marketing homepage for **Merid**, a Chrome extension that helps Vietnamese users learn
English passively: while browsing Vietnamese websites, selected Vietnamese words are highlighted
or replaced with high-value English vocabulary (SAT / B2 / C1 / C2 datasets).

## Stack

- [React 19](https://react.dev) + [Vite 7](https://vite.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) (design tokens in `src/index.css` via `@theme`)
- [React Router 7](https://reactrouter.com) for the homepage and tutorial pages
- Self-hosted fonts via [Fontsource](https://fontsource.org): Be Vietnam Pro (UI, full Vietnamese
  glyph coverage) and Lora (Wikipedia-style demo text)
- No other runtime dependencies; all animation is hand-rolled CSS

## Getting started

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check + production build
npm run preview  # preview the production build
```

## Project structure

```
src/
  index.css                  # Tailwind theme tokens, keyframes, component classes
  data/vocab.ts              # vocabulary entries + interactive demo paragraph
  hooks/useInView.ts         # IntersectionObserver hook for scroll reveals
  pages/
    Home.tsx                 # landing page section stack
    Tutorial.tsx             # step-by-step "how to use Merid" walkthrough
  components/
    ui/
      VocabPopupCard.tsx     # the floating "ELABORATE" explanation card
      ExtensionPanel.tsx     # interactive dark-navy settings panel mockup
      BrowserMockup.tsx      # animated fake browser with Vietnamese article
      Toggle.tsx             # extension-style pill toggle
      Reveal.tsx             # fade-up on scroll wrapper
      SectionHeading.tsx     # eyebrow + title + subtitle block
    sections/
      AnnouncementBanner.tsx  Navbar.tsx  Hero.tsx  LiveDemo.tsx  Features.tsx
      PanelShowcase.tsx  HowItWorks.tsx  Benefits.tsx  Faq.tsx  FinalCta.tsx  Footer.tsx
  pages/admin/               # private blog CMS (list + editor), see BLOG_WORKFLOW.md
  lib/posts.ts               # blog post CRUD against Firestore
  lib/blogImages.ts          # image upload, signed server-side (see api/blog-upload-signature.js)
api/
  blog-render.js             # serves every public /blog URL as finished HTML
  _lib/blog-html.js          # post -> full HTML page (meta, JSON-LD, hreflang)
  _lib/markdown.js           # Markdown -> HTML, shared by server and admin preview
  _lib/slug.js               # slugs, with Vietnamese diacritic handling
```

## Notable behavior

- **Blog**: `/blog/vie/[slug]` and `/blog/en/[slug]` are **not** SPA routes. Posts live in
  Firestore and are written through a private CMS at `/admin/blog`; `api/blog-render.js`
  turns each request into finished HTML with **zero framework JavaScript on the page**,
  because the AI crawlers this content targets do not execute JS. Publishing is manual and
  immediate: a post goes live when someone presses Publish, and there is no schedule, cron,
  or background job anywhere in the system. Drafts return a real 404 and are absent from the
  sitemap, enforced by Firestore rules rather than by the UI. **Read
  [`BLOG_WORKFLOW.md`](BLOG_WORKFLOW.md) before touching any of it.** Two things are easy to
  break: links from the SPA into `/blog` must be plain `<a href>` rather than react-router
  `<Link>` (the client router has no `/blog` route), and blog page styling lives as real CSS
  in `src/index.css` because Tailwind never scans the Node function that emits that markup.
  Still **zero framework JavaScript**: the page's only scripts are the theme bootstrap, the
  JSON-LD blocks, the language sync and the visitor beacon, none of which render anything —
  turn JavaScript off and the markup is unchanged. Blog views are counted from that beacon rather
  than inside `api/blog-render.js`, because these responses are CDN-cached (`s-maxage=300`)
  and a server-side count would only ever see cache misses.
- **Install links**: every "Add to Chrome" / "Install" action links to the official Chrome
  Web Store listing. The URL is defined once in `src/config.ts` (`CHROME_STORE_URL`); change it
  there if the listing ever moves (see the comment in that file). The link is never wrapped or
  redirected — the click counter below fires alongside the navigation, not in front of it.
- **Visitor counts** (`/admin`): the site keeps its own counters — page views, unique visitors,
  "Add to Chrome" clicks by placement, real installs and uninstalls (first hits on `/welcome` and
  `/goodbye`, the two pages the extension opens), uninstall reasons, referring domains and blog
  post views. First-party and cookieless: no third-party script, no identifier, and no IP address
  or user-agent ever stored — a returning visitor is deduplicated through a one-way daily hash fed
  into a HyperLogLog. `api/pulse.js` takes the beacons (always 204, silently no-ops when
  unconfigured) and `api/analytics-summary.js` reads them back for admins only. Counts live in
  Upstash Redis, the same store as the AI-check quota, so this needs `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN`; without them nothing is recorded and `/admin` shows a setup panel.
  `src/lib/analytics.ts` is the client half — **adding a new "Add to Chrome" button means passing
  a `where` prop**, which `tsc` enforces. The extension is not involved and was not changed.
  Anything counted here must also be described in the privacy policy (section 7, both languages).
- **Languages**: Vietnamese is the default; the navbar VI/EN toggle switches all marketing
  copy and persists in `localStorage` (`merid-lang`). Strings live in
  `src/i18n/translations.ts`; the tiny provider is `src/i18n/LanguageContext.tsx`. Product
  mockups (extension panel, vocab popup, fake Wikipedia page) intentionally stay in their
  original language since they represent the real extension UI.
- **Social previews**: Open Graph and Twitter tags live in `index.html` (absolute URLs on
  https://merid.site) with the preview image at `public/og-card.jpg` (1200 x 630, kept under 100 KB for WhatsApp/Zalo client-side fetching).
  The card is generated, not hand-made: edit `assets/og-card.html`, then run
  `node scripts/gen-brand-assets.js og`.
- **Branding**: every logo asset comes from the masters in [`brand/`](./brand) - see
  [`brand/README.md`](./brand/README.md) for which variant belongs where. `MeridMark`
  (`src/components/ui/MeridMark.tsx`) renders the mark inline as SVG, traced from the master
  PNG by `scripts/trace-mark.js`, so it stays sharp at any size and drops its navy tile in dark
  mode. Favicons, the app icon and the extension icons are written by
  `node scripts/gen-brand-assets.js`.

- **Routing** (`App.tsx`): `/` is the landing page, `/tutorial` is the walkthrough. A small
  `ScrollManager` scrolls to hash targets (e.g. `/#demo`) across page navigations. `vercel.json`
  routes `/blog/*`, `/sitemap.xml` and `/llms.txt` to `api/blog-render.js`, and rewrites
  everything else to `index.html` so deep links work in production.
- **Indexing.** Because every path falls back to one `index.html`, each public page would
  otherwise serve the homepage's canonical and claim to be a duplicate of it.
  `scripts/prerender-seo.mjs` runs after the build and writes one copy of the shell per route
  (`dist/tutorial.html`, …) with its own canonical and `og:url`; `cleanUrls` in `vercel.json`
  serves those at the clean path. `usePageMeta` (`src/i18n/LanguageContext.tsx`) keeps the head
  correct across client-side navigation and the language toggle. Adding a public page means
  adding it to `MARKETING_PATHS` in `api/_lib/blog-config.js`, which feeds both the prerender
  step and the sitemap. `test/seo.test.mjs` covers all of it.
- **Live demo** (`LiveDemo.tsx`): the Vietnamese page is data-driven. Each vocab entry is
  tagged with datasets and a frequency tier, so switching the dataset (SAT/C1/C2/All) or moving
  the intensity slider visibly changes which words are replaced. Hovering/clicking a highlighted
  word opens the popup card anchored to the word (it flips above the word near the card bottom).
- **Extension panel** (`ExtensionPanel.tsx`): fully interactive mockup. Dataset buttons,
  frequency slider, toggles, and the Extension ON/OFF button all hold real state.
- Reduced-motion preferences are respected (`prefers-reduced-motion` disables the loops).

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Short version: the site is on Vercel, and every push to
`main` republishes it automatically.
