import type { ReactNode } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { WordStatus } from '../../deck/DeckSource'
import type { Dataset } from '../../data/vocab'
import { ChevronIcon, GridIcon, LevelIcon, ProgressIcon, SearchIcon } from '../ui/DeckIcons'

export type LevelFilter = Dataset | 'all'
export type ProgressFilter = WordStatus | 'all'
export type ViewMode = 'grid' | 'list'

interface Props {
  query: string
  onQuery: (next: string) => void
  level: LevelFilter
  onLevel: (next: LevelFilter) => void
  /** Null until the level index has loaded - the Difficulty control is simply
   *  absent until then, rather than present and unable to filter. */
  levels: readonly Dataset[] | null
  progress: ProgressFilter
  onProgress: (next: ProgressFilter) => void
  counts: { saved: number; known: number }
  view: ViewMode
  onView: (next: ViewMode) => void
}

const CONTROL =
  'appearance-none cursor-pointer rounded-full border border-line-strong bg-surface py-2 pr-9 pl-9 text-sm font-semibold text-body transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

/** A <select> dressed as one of the mockup's pills.
 *
 *  Native on purpose. The look is only a border, an icon and a chevron, and in
 *  exchange the control keeps type-ahead, arrow keys, the platform picker on a
 *  phone and correct screen-reader semantics - none of which a div-and-popover
 *  reimplementation gets for free. `appearance-none` removes the browser's own
 *  arrow so ours can sit where the mockup puts it; both glyphs are
 *  pointer-events-none so clicking either still opens the menu. */
function SelectPill({
  icon,
  label,
  value,
  onChange,
  children,
}: {
  icon: ReactNode
  label: string
  value: string
  onChange: (next: string) => void
  children: ReactNode
}) {
  return (
    <span className="relative inline-flex items-center">
      <span className="pointer-events-none absolute left-3 flex text-muted">{icon}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL}
      >
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-3 text-muted" />
    </span>
  )
}

/** Search, Difficulty, Progress and View, above the Library grid. Every control
 *  is uncontrolled by the deck: they hand their value up and MyDeck does the
 *  filtering, so the study tabs never see a filtered list. */
export default function LibraryToolbar({
  query,
  onQuery,
  level,
  onLevel,
  levels,
  progress,
  onProgress,
  counts,
  view,
  onView,
}: Props) {
  const { t } = useLang()
  const l = t.deck.library

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <span className="relative inline-flex flex-1 items-center sm:flex-initial">
        <SearchIcon className="pointer-events-none absolute left-3 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={l.search}
          aria-label={l.search}
          className="w-full rounded-full border border-line-strong bg-surface py-2 pr-4 pl-9 text-sm text-body transition-colors placeholder:text-faint hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-52"
        />
      </span>

      {levels && (
        <SelectPill
          icon={<LevelIcon />}
          label={l.difficulty}
          value={level}
          onChange={(next) => onLevel(next as LevelFilter)}
        >
          <option value="all">{l.allLevels}</option>
          {levels.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </SelectPill>
      )}

      <SelectPill
        icon={<ProgressIcon />}
        label={l.progress}
        value={progress}
        onChange={(next) => onProgress(next as ProgressFilter)}
      >
        {/* The "all" option carries no count: it would only repeat the total
            already standing in the stat cards directly above the tabs. The two
            below it are worth counting - they say how much of the deck each
            filter would leave on screen. */}
        <option value="all">{l.allProgress}</option>
        <option value="saved">{l.countedLabel(t.deck.savedLabel, counts.saved)}</option>
        <option value="known">{l.countedLabel(t.deck.knownLabel, counts.known)}</option>
      </SelectPill>

      <SelectPill
        icon={<GridIcon />}
        label={l.view}
        value={view}
        onChange={(next) => onView(next as ViewMode)}
      >
        <option value="grid">{l.viewGrid}</option>
        <option value="list">{l.viewList}</option>
      </SelectPill>
    </div>
  )
}
