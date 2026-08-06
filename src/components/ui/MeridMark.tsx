import { BAR, M_PATH, TILE, VIEW } from './meridMarkGeometry'

/**
 * The Merid mark: a cream M struck through by a gold highlight bar, on a navy
 * tile. Geometry is traced from `brand/merid-icon-dark-1024.png` by
 * `scripts/trace-mark.js`, so this renders the same shape as the extension icon
 * and the favicon - vector, so it stays sharp at 16px and on any DPR.
 *
 * The tile colour comes from `--logo-tile`, which the theme drops to transparent
 * in dark mode, leaving the bare cream mark (the pack's own dark lockup). Since
 * both variants share their inner geometry, the M does not move when the theme
 * flips.
 *
 * Mockups paint their own fixed palette rather than following the site theme, so
 * they pin the variant instead of using `auto`: `tile` for the light Chrome UI
 * demos, `bare` for the navy popup replica.
 *
 * Decorative by default: every place it is used already carries the name in text
 * or a title, so labelling the SVG too would just make screen readers say
 * "Merid" twice. Pass a `label` where the mark stands alone.
 */
export default function MeridMark({
  size = 32,
  variant = 'auto',
  className = '',
  label,
}: {
  size?: number
  variant?: 'auto' | 'tile' | 'bare'
  className?: string
  label?: string
}) {
  const tileFill = variant === 'tile' ? '#16233f' : variant === 'bare' ? 'transparent' : 'var(--logo-tile)'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect
        x={TILE.x}
        y={TILE.y}
        width={TILE.w}
        height={TILE.h}
        rx={TILE.r}
        fill={tileFill}
      />
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.r} fill="var(--color-logo-bar)" />
      <path d={M_PATH} fill="var(--color-logo-m)" />
    </svg>
  )
}
