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
      Navbar.tsx  Hero.tsx  LiveDemo.tsx  Features.tsx  PanelShowcase.tsx
      HowItWorks.tsx  Benefits.tsx  Waitlist.tsx  Footer.tsx
```

## Notable behavior

- **Waitlist backend**: the form posts to Formspree. Paste your form endpoint into
  `src/config.ts` (see the comment there and the setup steps in
  [DEPLOYMENT.md](./DEPLOYMENT.md)). Until then, submissions simulate success and log a
  console warning; no email is stored.
- **Languages**: Vietnamese is the default; the navbar VI/EN toggle switches all marketing
  copy and persists in `localStorage` (`merid-lang`). Strings live in
  `src/i18n/translations.ts`; the tiny provider is `src/i18n/LanguageContext.tsx`. Product
  mockups (extension panel, vocab popup, fake Wikipedia page) intentionally stay in their
  original language since they represent the real extension UI.
- **Social previews**: Open Graph and Twitter tags live in `index.html` (absolute URLs on
  https://merid.site) with the preview image at `public/og-image.png` (1200 x 630).

- **Routing** (`App.tsx`): `/` is the landing page, `/tutorial` is the walkthrough. A small
  `ScrollManager` scrolls to hash targets (e.g. `/#demo`) across page navigations. `vercel.json`
  rewrites all paths to `index.html` so deep links work in production.
- **Live demo** (`LiveDemo.tsx`): the Vietnamese paragraph is data-driven. Each vocab entry is
  tagged with datasets and a frequency tier, so switching SAT/B2/C1/C2 or moving the slider
  visibly changes which words are replaced. Hovering/clicking a highlighted word opens the
  popup card anchored to the word (it flips above the word near the card bottom).
- **Extension panel** (`ExtensionPanel.tsx`): fully interactive mockup. Dataset buttons,
  frequency slider, toggles, and the Extension ON/OFF button all hold real state.
- Reduced-motion preferences are respected (`prefers-reduced-motion` disables the loops).

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Short version: the site is on Vercel, and every push to
`main` republishes it automatically.
