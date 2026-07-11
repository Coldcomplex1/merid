import ChromeIcon from './ChromeIcon'
import { CHROME_STORE_URL } from '../../config'

type Variant = 'primary' | 'compact' | 'menu' | 'link'

interface InstallButtonProps {
  label: string
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
 *  Chrome Web Store listing and opens in a new tab with a safe rel. */
export default function InstallButton({
  label,
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
    >
      {showIcon && <ChromeIcon size={ICON_SIZE[variant]} />}
      {label}
    </a>
  )
}
