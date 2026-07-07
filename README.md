# Contextual by Merid — Landing Page

Marketing homepage for **Contextual**, a Chrome extension that helps Vietnamese users learn
English passively: while browsing Vietnamese websites, selected Vietnamese words are highlighted
or replaced with high-value English vocabulary (SAT / B2 / C1 / C2 datasets).

## Stack

- [React 19](https://react.dev) + [Vite 7](https://vite.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) (design tokens in `src/index.css` via `@theme`)
- Self-hosted fonts via [Fontsource](https://fontsource.org) — Be Vietnam Pro (UI, full Vietnamese
  glyph coverage) and Lora (Wikipedia-style demo text)
- No other runtime dependencies — all animation is hand-rolled CSS

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

- **Live demo** (`LiveDemo.tsx`): the Vietnamese paragraph is data-driven. Each vocab entry is
  tagged with datasets and a frequency tier, so switching SAT/B2/C1/C2 or moving the slider
  visibly changes which words are replaced. Hovering/clicking a highlighted word opens the
  popup card anchored to the word (it flips above the word near the card bottom).
- **Extension panel** (`ExtensionPanel.tsx`): fully interactive mockup — dataset buttons,
  frequency slider, toggles, and the Extension ON/OFF button all hold real state.
- Reduced-motion preferences are respected (`prefers-reduced-motion` disables the loops).
