import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import ExtensionPanel from '../components/ui/ExtensionPanel'
import VocabPopupCard from '../components/ui/VocabPopupCard'
import Toggle from '../components/ui/Toggle'
import { VOCAB } from '../data/vocab'

/* ── Step layout ─────────────────────────────────────────────── */

interface StepProps {
  number: string
  title: string
  children: ReactNode
  visual: ReactNode
  caption?: string
}

function Step({ number, title, children, visual, caption }: StepProps) {
  return (
    <Reveal>
      <div className="grid items-center gap-10 rounded-3xl bg-navy-850/60 p-8 ring-1 ring-navy-600/40 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="text-5xl font-extrabold text-gold-400/30">{number}</span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-cream-50 sm:text-3xl">
            {title}
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-navy-200">{children}</div>
        </div>
        <div className="flex flex-col items-center gap-3">
          {visual}
          {caption && <p className="text-xs font-semibold text-gold-300">{caption}</p>}
        </div>
      </div>
    </Reveal>
  )
}

function Bullet({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
      <span>
        <span className="font-bold text-cream-50">{term}</span> {children}
      </span>
    </li>
  )
}

/* ── Step visuals ────────────────────────────────────────────── */

function ToolbarDemo() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-2xl shadow-card ring-1 ring-navy-600/60">
      <div className="flex items-center gap-2 bg-cream-100 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f26d5f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f5c14e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5ec269]" />
        <div className="ml-2 flex-1 rounded-full bg-white/85 px-3 py-1 text-[11px] text-navy-500">
          vnexpress.net
        </div>
        <span className="h-6 w-6 rounded-md bg-navy-200/60" />
        <span className="h-6 w-6 rounded-md bg-navy-200/60" />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-gold-400 text-sm font-extrabold text-navy-900 ring-2 ring-gold-300 ring-offset-2 ring-offset-cream-100">
          M
        </span>
      </div>
      <div className="bg-navy-800 px-4 py-3 text-center text-xs font-semibold text-gold-300">
        Pinned next to the address bar, always one click away
      </div>
    </div>
  )
}

function IntensityDemo() {
  const [freq, setFreq] = useState(1)
  const LABELS = ['Casual', 'Focused', 'Locked-in']
  const NOTES = [
    'A gentle drip: roughly 2 to 3 new words per page.',
    'A steady stream of new words on every article.',
    'Maximum exposure. Popular right before exams.',
  ]

  return (
    <div className="w-80 max-w-full rounded-3xl bg-navy-850 p-6 shadow-panel ring-1 ring-navy-600/50">
      <p className="text-sm text-cream-50">highlight frequency</p>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={freq}
        aria-label="Highlight frequency"
        onChange={(e) => setFreq(Number(e.target.value))}
        className="slider-gold mt-3"
        style={{ '--slider-fill': `${(freq / 2) * 100}%` } as React.CSSProperties}
      />
      <div className="mt-1 flex justify-between">
        {LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setFreq(i)}
            className={`cursor-pointer text-[11px] transition-colors ${
              freq === i ? 'font-bold text-gold-400' : 'text-navy-300 hover:text-cream-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-navy-800 px-4 py-3 text-center text-xs text-navy-200 ring-1 ring-navy-600/40">
        {NOTES[freq]}
      </p>
    </div>
  )
}

function ModeDemo() {
  const [replace, setReplace] = useState(true)
  const entry = VOCAB.significant

  return (
    <div className="w-full max-w-sm rounded-3xl bg-cream-50 p-6 text-ink shadow-card">
      <p className="font-wiki text-lg leading-loose font-semibold">
        Một vài từ{' '}
        <span className={replace ? 'hl-en' : 'hl-vi'}>{replace ? entry.word : entry.vi}</span> sẽ xuất
        hiện ngay trong câu bạn đang đọc.
      </p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-navy-200/60 pt-4">
        <span className="text-sm font-semibold text-navy-700">Replace words directly</span>
        <Toggle on={replace} onChange={setReplace} label="Replace words directly" surface="light" />
      </div>
    </div>
  )
}

function HoverDemo() {
  const [open, setOpen] = useState(false)
  const entry = VOCAB.elaborate

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-3xl bg-cream-50 p-6 text-ink shadow-card">
        <p className="font-wiki text-lg leading-loose font-semibold">
          Khi gặp một từ{' '}
          <button
            type="button"
            className="hl-en font-wiki text-inherit"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen(true)}
          >
            {entry.word}
          </button>
          , hãy di chuột lên từ đó.
        </p>
      </div>
      {open && (
        <div className="mt-4 animate-pop-in">
          <VocabPopupCard entry={entry} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function ProgressDemo() {
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const BARS = [3, 5, 2, 6, 4, 1, 2]
  const max = Math.max(...BARS)

  return (
    <div className="w-80 max-w-full rounded-3xl bg-navy-850 p-6 shadow-panel ring-1 ring-navy-600/50">
      <p className="text-[11px] font-extrabold tracking-[0.18em] text-gold-400 uppercase">
        Words mastered this week
      </p>
      <div className="mt-4 flex items-end justify-between border-b border-gold-400/60 pb-2">
        {DAYS.map((day, i) => (
          <div key={day} className="group flex w-8 flex-col items-center gap-1.5">
            <span className="text-[9px] font-bold text-gold-300">{BARS[i]}</span>
            <div className="flex h-16 items-end">
              <div
                className="w-2 origin-bottom animate-bar-grow rounded-full bg-gold-400 transition-colors group-hover:bg-gold-300"
                style={{ height: `${(BARS[i] / max) * 100}%`, animationDelay: `${i * 90}ms` }}
              />
            </div>
            <span className="text-[10px] font-semibold tracking-wide text-navy-200">{day}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-navy-200">
        <span className="font-bold text-gold-300">{BARS.reduce((a, b) => a + b, 0)} words</span>{' '}
        mastered this week. Keep the streak alive.
      </p>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────── */

export default function Tutorial() {
  useEffect(() => {
    document.title = 'Tutorial: How to use Merid'
    return () => {
      document.title = 'Merid: Learn English while browsing Vietnamese websites'
    }
  }, [])

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(640px circle at 50% 0%, rgb(245 197 66 / 0.08), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-extrabold tracking-[0.22em] text-gold-400 uppercase">Tutorial</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
            How to use Merid
          </h1>
          <p className="mt-4 text-lg text-navy-200">
            A five minute walkthrough, from installing the extension to mastering your first words.
            Every mockup on this page is interactive, so try things as you read.
          </p>
        </div>

        <div className="mt-16 space-y-8">
          <Step
            number="01"
            title="Install and pin Merid"
            visual={<ToolbarDemo />}
          >
            <p>
              Merid is currently in private beta. When your invite arrives, the install takes under a
              minute:
            </p>
            <ul className="space-y-3">
              <Bullet term="Add it.">Open the install link in Chrome and click "Add to Chrome".</Bullet>
              <Bullet term="Pin it.">
                Click the puzzle icon at the top right of Chrome, then press the pin next to Merid.
              </Bullet>
            </ul>
            <p>
              Once pinned, the gold M sits next to your address bar. That icon is the whole interface:
              one click opens everything.
            </p>
          </Step>

          <Step
            number="02"
            title="Open the panel and choose your dataset"
            visual={<ExtensionPanel />}
            caption="This is the real panel. Click around."
          >
            <p>
              Click the gold M to open the control panel. The first thing to pick is your vocabulary
              dataset, which decides what kind of words Merid teaches you:
            </p>
            <ul className="space-y-3">
              <Bullet term="SAT.">Vocabulary for the SAT and similar admission tests.</Bullet>
              <Bullet term="B2, C1, C2.">
                CEFR levels, from upper-intermediate up to near-native academic English.
              </Bullet>
              <Bullet term="All.">Every dataset at once, for maximum variety.</Bullet>
            </ul>
            <p>
              You can switch datasets any time. Words you have already mastered stay hidden no matter
              which dataset is active.
            </p>
          </Step>

          <Step
            number="03"
            title="Set your intensity"
            visual={<IntensityDemo />}
            caption="Drag the slider or tap a label."
          >
            <p>
              The highlight frequency slider decides how many words Merid touches on each page:
            </p>
            <ul className="space-y-3">
              <Bullet term="Casual.">A few words per page. Reading stays almost untouched.</Bullet>
              <Bullet term="Focused.">A steady stream of new vocabulary on every article.</Bullet>
              <Bullet term="Locked-in.">
                Maximum exposure. Every eligible word gets highlighted.
              </Bullet>
            </ul>
            <p>Start on Casual for the first week, then move up as it starts feeling natural.</p>
          </Step>

          <Step
            number="04"
            title="Choose how words appear"
            visual={<ModeDemo />}
            caption="Flip the toggle and watch the sentence change."
          >
            <p>Two switches change how Merid presents new words:</p>
            <ul className="space-y-3">
              <Bullet term="Replace words directly ON.">
                The Vietnamese word is swapped for the English one right inside the sentence, so the
                surrounding context teaches you the meaning.
              </Bullet>
              <Bullet term="Replace words directly OFF.">
                The Vietnamese word stays put, highlighted, and the English appears when you hover.
              </Bullet>
            </ul>
            <p>
              Below that, <strong className="text-cream-50">Vie - Eng mode</strong> shows Vietnamese
              meanings in the popup, while <strong className="text-cream-50">Eng - Eng mode</strong>{' '}
              explains English words in English. Switching to Eng - Eng is excellent practice once you
              reach C1.
            </p>
          </Step>

          <Step
            number="05"
            title="Read, hover, learn"
            visual={<HoverDemo />}
            caption="Try it: hover the highlighted word."
          >
            <p>
              Now just browse like you always do. When you meet a highlighted word, hover over it (or
              tap it on a touchscreen). A popup opens with everything you need:
            </p>
            <ul className="space-y-3">
              <Bullet term="The essentials.">
                Part of speech, pronunciation, and a short English definition.
              </Bullet>
              <Bullet term="Synonyms and opposites.">
                Gold chips are words with a similar meaning, pale chips are opposites.
              </Bullet>
              <Bullet term="Context.">
                An example sentence, the Vietnamese meaning, and the original word that was replaced.
              </Bullet>
            </ul>
          </Step>

          <Step
            number="06"
            title="Save it or clear it"
            visual={<VocabPopupCard entry={VOCAB.solitude} />}
            caption="Every popup ends with these two buttons."
          >
            <p>The two buttons at the bottom of each popup keep your learning organized:</p>
            <ul className="space-y-3">
              <Bullet term="Save to Deck.">
                Adds the word to your personal review deck so you can practice it later.
              </Bullet>
              <Bullet term="I know this.">
                Marks the word as mastered. Merid never highlights it again, on any page.
              </Bullet>
            </ul>
            <p>
              Be honest with "I know this". The cleaner your mastered list, the smarter the highlights
              become, because Merid only spends your attention on words you actually need.
            </p>
          </Step>

          <Step
            number="07"
            title="Watch your progress"
            visual={<ProgressDemo />}
          >
            <p>
              The weekly chart at the top of the panel counts the words you mastered each day. It is a
              small thing, but streaks are surprisingly motivating.
            </p>
            <p>
              When a dataset starts feeling easy, that is your signal: raise the frequency, switch to a
              harder dataset, or turn on Eng - Eng mode.
            </p>
          </Step>
        </div>

        <Reveal>
          <div className="mt-20 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              That is the whole workflow.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-navy-200">
              Reading is the habit you already have. Merid just upgrades it.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/#demo"
                className="rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95"
              >
                Try the interactive demo
              </Link>
              <Link
                to="/#waitlist"
                className="rounded-full border-2 border-navy-500 px-7 py-3 text-base font-bold text-cream-50 transition-all hover:-translate-y-0.5 hover:border-gold-400 hover:text-gold-300 active:scale-95"
              >
                Join the Waitlist
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
