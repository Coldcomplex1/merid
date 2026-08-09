// A daily trend line, drawn by hand.
//
// No chart library: this project ships React, the router, marked and Firebase,
// and nothing else. A single sparkline is not worth a dependency, an audit
// surface, or 40 KB in a bundle every visitor downloads.

interface Point {
  day: string
  value: number
  second?: number
}

interface TrendChartProps {
  points: Point[]
  /** Names the two series, and the chart, for screen readers and the caption. */
  label: string
  secondLabel?: string
}

const W = 720
const H = 180
const PAD_Y = 8

function path(points: Point[], pick: (p: Point) => number, max: number): string {
  if (points.length === 0) return ''
  const stepX = points.length > 1 ? W / (points.length - 1) : 0
  const y = (v: number) => H - PAD_Y - (v / max) * (H - PAD_Y * 2)
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(pick(p)).toFixed(1)}`)
    .join(' ')
}

function area(points: Point[], pick: (p: Point) => number, max: number): string {
  const line = path(points, pick, max)
  if (!line) return ''
  return `${line} L${W},${H} L0,${H} Z`
}

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function TrendChart({ points, label, secondLabel }: TrendChartProps) {
  // The floor matters: on the day this ships every value is zero, and dividing
  // by that max makes every coordinate NaN and the whole <path> invalid.
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.second ?? 0)))
  const hasSecond = secondLabel !== undefined && points.some((p) => p.second !== undefined)

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        // The chart stretches to whatever width it is given; non-scaling-stroke
        // then keeps every line a true 2px instead of thickening with the box.
        preserveAspectRatio="none"
        role="img"
        aria-labelledby="trend-title"
      >
        <title id="trend-title">{label}</title>

        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            y1={H * f}
            x2={W}
            y2={H * f}
            stroke="var(--color-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area(points, (p) => p.value, max)} fill="var(--color-accent)" fillOpacity="0.14" />
        <path
          d={path(points, (p) => p.value, max)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hasSecond && (
          <path
            d={path(points, (p) => p.second ?? 0, max)}
            fill="none"
            stroke="var(--color-gold-500)"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" aria-hidden="true" />
            {label}
          </span>
          {hasSecond && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-gold-500" aria-hidden="true" />
              {secondLabel}
            </span>
          )}
        </span>
        <span>
          {points.length > 0 && `${formatDay(points[0].day)} – ${formatDay(points[points.length - 1].day)}`}
        </span>
      </figcaption>

      {/* A hand-rolled chart has no built-in accessibility story, and this is
       *  also the "let me read the actual numbers" affordance. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">{label}</th>
            {hasSecond && <th scope="col">{secondLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <th scope="row">{p.day}</th>
              <td>{p.value}</td>
              {hasSecond && <td>{p.second ?? 0}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
