import ChromeIcon from './ChromeIcon'
import { CHROME_STORE_URL } from '../../config'
import { trackInstallClick, type Placement } from '../../lib/analytics'

type Variant = 'primary' | 'compact' | 'menu' | 'link'

interface InstallButtonProps {
  label: string
  /**
   * Which CTA this is, for the install funnel.
   *
   * Required, not optional-with-a-default: `npm run build` runs `tsc -b`, so a
   * new call site that forgets it fails the build instead of quietly joining
   * the funnel as an anonymous click.
   */
  where: Placement
  variant?: Variant
  /** Hide the Chrome glyph (e.g. tight inline contexts). Defaults to shown. */
  showIcon?: boolean
  className?: string
}

/* The gold pill reads well on both light and dark backgrounds, so the fill
 * colours stay fixed; only the `link` variant inherits themed text colour. */
const VARIANTS: Record<Variant, string> = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-base font-bold text-navy-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-lift active:scale-95',
  compact:
    'inline-flex items-center gap-2 rounded-full bg-gold-400 px-4 py-2 text-sm font-bold whitespace-nowrap text-navy-900 transition-all hover:bg-gold-300 hover:shadow-lift active:scale-95',
  menu:
    'flex w-full items-center justify-center gap-2 rounded-lg bg-gold-400 px-4 py-2.5 text-sm font-bold text-navy-900 transition-colors hover:bg-gold-300 active:scale-[0.98]',
  link:
    'inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-accent',
}

const ICON_SIZE: Record<Variant, number> = { primary: 19, compact: 16, menu: 16, link: 15 }

/** Canonical "Add Merid to Chrome" action. Always points at the official
 *  Chrome Web Store listing and opens in a new tab with a safe rel.
 *
 *  Not every store link on the site comes through here: AnnouncementBanner and
 *  PrivacyPolicy use their own anchors because their styling is nothing like
 *  these variants. Both call trackInstallClick directly, so the funnel stays
 *  complete - but do not assume this component is the only place to change. */
export default function InstallButton({
  label,
  where,
  variant = 'primary',
  showIcon = true,
  className = '',
}: InstallButtonProps) {
  return (
    <a
      href={CHROME_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`${VARIANTS[variant]} ${className}`}
      // Recorded alongside the navigation, never in front of it: no
      // preventDefault, no programmatic redirect. If the counter throws, the
      // link still works, which is the only part that actually matters.
      onClick={() => trackInstallClick(where)}
    >
      {showIcon && <ChromeIcon size={ICON_SIZE[variant]} />}
      {label}
    </a>
  )
}
