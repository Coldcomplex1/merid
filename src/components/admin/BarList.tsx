// A top-N table where each row carries its own proportional bar. Plain divs -
// the bar is a width percentage, which needs no SVG and no library.

interface BarListProps {
  title: string
  rows: { label: string; value: number }[]
  /** Shown instead of the table when there is nothing yet. */
  empty: string
  /** Optional note under the title, for the caveats that stop a number lying. */
  note?: string
}

export default function BarList({ title, rows, empty, note }: BarListProps) {
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <section className="rounded-2xl border border-line p-5">
      <h2 className="text-sm font-extrabold tracking-wide text-heading uppercase">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-semibold text-body" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-bold text-heading tabular-nums">
                  {row.value.toLocaleString('en-GB')}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent/60"
                  style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
