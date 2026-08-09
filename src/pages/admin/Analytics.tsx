// The visitor dashboard at /admin.
//
// English only, no i18n - the same choice BlogAdmin and RequireAdmin make. A
// screen two people read does not belong in the bilingual catalog that ships to
// every visitor.
//
// Every number here is directional, not audited, and the page says so where it
// matters. A dashboard that implies precision it does not have is worse than
// one that admits the gap.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import TrendChart from '../../components/admin/TrendChart'
import BarList from '../../components/admin/BarList'

interface Totals {
  pageviews: number
  uniques: number
  cta: number
  installs: number
  uninstalls: number
  surveys: number
  blogViews: number
}

interface Summary {
  ok: true
  range: { from: string; to: string; days: number }
  since: string | null
  totals: Totals
  previous: Totals
  series: {
    day: string
    pageviews: number
    uniques: number
    cta: number
    installs: number
    uninstalls: number
  }[]
  paths: { path: string; pageviews: number }[]
  placements: { where: string; clicks: number }[]
  reasons: { reason: string; count: number }[]
  referrers: { host: string; visits: number }[]
  posts: { post: string; views: number }[]
  langs: { vi: number; en: number }
}

type Failure = { code: string; missing?: string[] }
type State =
  | { status: 'loading' }
  | { status: 'ready'; data: Summary }
  | { status: 'failed'; failure: Failure }

const RANGES = [7, 30, 90] as const

const REQUEST_TIMEOUT_MS = 20_000

async function fetchSummary(idToken: string, days: number): Promise<Summary> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`/api/analytics-summary?days=${days}`, {
      headers: { Authorization: `Bearer ${idToken}` },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || !body?.ok) {
      throw Object.assign(new Error('summary-failed'), {
        failure: { code: body?.code || 'unreachable', missing: body?.missing } as Failure,
      })
    }
    return body as Summary
  } finally {
    clearTimeout(timer)
  }
}

function pct(part: number, whole: number): string {
  if (!whole) return '—'
  return `${((part / whole) * 100).toFixed(1)}%`
}

function delta(now: number, before: number): { text: string; tone: string } | null {
  if (!before) return null
  const change = ((now - before) / before) * 100
  if (!Number.isFinite(change)) return null
  const rounded = Math.round(change)
  if (rounded === 0) return { text: 'no change', tone: 'text-muted' }
  return {
    text: `${rounded > 0 ? '+' : ''}${rounded}% vs previous`,
    tone: rounded > 0 ? 'text-success' : 'text-danger',
  }
}

function Tile({
  label,
  value,
  before,
  note,
}: {
  label: string
  value: number
  before?: number
  note?: string
}) {
  const d = before === undefined ? null : delta(value, before)
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1.5 text-3xl font-extrabold text-heading tabular-nums">
        {value.toLocaleString('en-GB')}
      </p>
      {d && <p className={`mt-0.5 text-xs font-semibold ${d.tone}`}>{d.text}</p>}
      {note && <p className="mt-1 text-xs leading-snug text-muted">{note}</p>}
    </div>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-extrabold text-heading">{title}</h1>
      {children}
    </div>
  )
}

/** The refusals the API can still produce even though RequireAdmin already let
 *  us in - a token can go stale between the two checks. Wording follows
 *  blogImages.ts, which turns the same codes into sentences that say what to fix. */
function FailurePanel({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  if (failure.code === 'not-configured') {
    return (
      <Shell title="The counter is not switched on yet">
        <p className="mt-3 leading-relaxed text-body">
          The site records nothing until an Upstash Redis database is connected, and this page has
          nothing to show until it does. Create one, then add these to the Vercel project&rsquo;s
          environment variables and redeploy:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-2 px-4 py-3 text-left text-sm text-body">
          {(failure.missing?.length ? failure.missing : ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']).join('\n')}
        </pre>
        <p className="mt-2 text-sm text-muted">
          See DEPLOYMENT.md. Nothing else on the site is affected while this is missing.
        </p>
      </Shell>
    )
  }

  const messages: Record<string, string> = {
    'not-admin': 'This account is not on the admin list, so it cannot read the numbers.',
    'rules-not-deployed':
      'The server could not check your admin status because firestore.rules was never deployed. Run "firebase deploy --only firestore:rules".',
    unauthorized: 'Your sign-in has expired. Reload the page to sign in again.',
    'store-unreachable':
      'The counter store did not answer. This is about reading the numbers, not recording them — nothing has been lost.',
  }

  return (
    <Shell title="Could not load the numbers">
      <p className="mt-3 leading-relaxed text-body">
        {messages[failure.code] ?? `The server answered with "${failure.code}".`}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-full border border-line-strong px-5 py-2.5 font-semibold text-heading transition-colors hover:border-accent hover:text-accent"
      >
        Try again
      </button>
    </Shell>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const [days, setDays] = useState<number>(30)
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(
    async (range: number) => {
      if (!user) return
      setState({ status: 'loading' })
      try {
        const data = await fetchSummary(await user.getIdToken(), range)
        setState({ status: 'ready', data })
      } catch (e) {
        const failure = (e as { failure?: Failure }).failure ?? { code: 'unreachable' }
        setState({ status: 'failed', failure })
      }
    },
    [user],
  )

  useEffect(() => {
    void load(days)
  }, [load, days])

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  if (state.status === 'failed') {
    return <FailurePanel failure={state.failure} onRetry={() => void load(days)} />
  }

  const { data } = state
  const { totals, previous } = data
  const stillInstalled = totals.installs - totals.uninstalls
  const nothingYet = totals.pageviews === 0 && totals.cta === 0 && totals.installs === 0

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">Visitors</h1>
          <p className="mt-1 text-sm text-muted">
            {data.range.from} to {data.range.to}
            {data.since && ` · counting since ${data.since}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-line">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`px-3.5 py-1.5 text-sm font-bold transition-colors ${
                  r === days ? 'bg-accent text-canvas' : 'text-muted hover:text-accent'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(days)}
            className="rounded-full border border-line px-3.5 py-1.5 text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Refresh
          </button>
          <Link
            to="/admin/blog"
            className="rounded-full border border-line px-3.5 py-1.5 text-sm font-bold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Blog
          </Link>
        </div>
      </header>

      {nothingYet && (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-5 py-4 text-sm text-muted">
          Nothing recorded in this range yet. If the counter went live recently, give it a day — and
          note that visits to /admin are never counted.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Unique visitors"
          value={totals.uniques}
          before={previous.uniques}
          note="Approximate, deduplicated across the range."
        />
        <Tile label="Page views" value={totals.pageviews} before={previous.pageviews} />
        <Tile label="Add to Chrome clicks" value={totals.cta} before={previous.cta} />
        <Tile
          label="Installs"
          value={totals.installs}
          before={previous.installs}
          note="First visits to /welcome, which the extension opens once on a fresh install."
        />
        <Tile
          label="Uninstalls"
          value={totals.uninstalls}
          before={previous.uninstalls}
          note="First visits to /goodbye, the extension's uninstall URL."
        />
        <Tile label="Net installs" value={stillInstalled} />
      </div>

      <section className="mt-8 rounded-2xl border border-line p-5">
        <h2 className="text-sm font-extrabold tracking-wide text-heading uppercase">
          Traffic over time
        </h2>
        <div className="mt-4">
          <TrendChart
            label="Page views"
            secondLabel="Unique visitors"
            points={data.series.map((d) => ({
              day: d.day,
              value: d.pageviews,
              second: d.uniques,
            }))}
          />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line p-5">
        <h2 className="text-sm font-extrabold tracking-wide text-heading uppercase">Funnel</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Unique visitors', value: totals.uniques, rate: null as string | null },
            { label: 'Clicked install', value: totals.cta, rate: pct(totals.cta, totals.uniques) },
            { label: 'Installed', value: totals.installs, rate: pct(totals.installs, totals.cta) },
            {
              label: 'Uninstalled',
              value: totals.uninstalls,
              rate: pct(totals.uninstalls, totals.installs),
            },
          ].map((step) => (
            <div key={step.label}>
              <p className="text-xs font-bold tracking-wide text-muted uppercase">{step.label}</p>
              <p className="mt-1 text-2xl font-extrabold text-heading tabular-nums">
                {step.value.toLocaleString('en-GB')}
              </p>
              {step.rate && <p className="text-xs font-semibold text-accent">{step.rate}</p>}
            </div>
          ))}
        </div>
        {/* A funnel that hides what it cannot see is worse than no funnel. */}
        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          Read these as floors, not totals. Clicks are clicks on our own links, so the gap to
          installs holds both people who clicked and never installed and people who found Merid by
          searching the Chrome Web Store and never touched this site. Installs and uninstalls depend
          on Chrome managing to open a tab, which it sometimes cannot. Content blockers drop some
          beacons entirely. The Chrome Web Store dashboard is the ground truth to compare against.
        </p>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <BarList
          title="Pages"
          rows={data.paths.map((p) => ({ label: p.path, value: p.pageviews }))}
          empty="No page views yet."
        />
        <BarList
          title="Where install was clicked"
          rows={data.placements.map((p) => ({ label: p.where, value: p.clicks }))}
          empty="No install clicks yet."
        />
        <BarList
          title="Traffic sources"
          rows={data.referrers.map((r) => ({ label: r.host, value: r.visits }))}
          empty="No referrers yet."
          note="Mostly 'direct': browsers withhold the referring page on most cross-site visits, and the Chrome Web Store sends none at all."
        />
        <BarList
          title="Blog posts"
          rows={data.posts.map((p) => ({ label: p.post, value: p.views }))}
          empty="No blog views yet."
        />
        <BarList
          title="Reasons ticked for uninstalling"
          rows={data.reasons.map((r) => ({ label: r.reason, value: r.count }))}
          empty="No survey answers yet."
          note={`Reasons ticked, not people: one submission can tick several. ${data.totals.surveys} submission(s) in this range.`}
        />
        <BarList
          title="Language"
          rows={[
            { label: 'Tiếng Việt', value: data.langs.vi },
            { label: 'English', value: data.langs.en },
          ]}
          empty="No page views yet."
        />
      </div>
    </div>
  )
}
