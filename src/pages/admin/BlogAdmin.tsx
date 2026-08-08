// The blog admin's front page.
//
// Organised by topic rather than by post, because the unit that publishes is a
// topic: a piece of writing in both Vietnamese and English. A flat list of posts
// would make the one thing this screen has to communicate - whether a topic is
// complete enough to go live - something you had to work out by scanning.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  deletePost,
  groupIntoTopics,
  listAllPosts,
  publishBlocker,
  publishTopic,
  unpublishTopic,
  type Post,
  type Topic,
} from '../../lib/posts'

function formatWhen(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** A topic is live when either half is; the rules keep both in step. */
function isLive(topic: Topic): boolean {
  return topic.vie?.status === 'published' || topic.en?.status === 'published'
}

function LanguageCell({ post, lang }: { post: Post | null; lang: 'vie' | 'en' }) {
  const label = lang === 'vie' ? 'Tiếng Việt' : 'English'

  if (!post) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-2">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-1 text-sm text-muted">Not written yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold text-heading">{post.title}</p>
      <code className="mt-0.5 block text-xs break-all text-muted">
        /blog/{post.lang}/{post.slug}
      </code>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs font-semibold">
        <Link to={`/admin/blog/${post.id}/edit`} className="text-accent hover:underline">
          Edit
        </Link>
        {post.status === 'published' ? (
          <a
            href={`/blog/${post.lang}/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            View
          </a>
        ) : (
          <Link to={`/admin/blog/${post.id}/edit?preview=1`} className="text-accent hover:underline">
            Preview
          </Link>
        )}
      </p>
    </div>
  )
}

export default function BlogAdmin() {
  const [topics, setTopics] = useState<Topic[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      setTopics(groupIntoTopics(await listAllPosts()))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load posts.')
      setTopics([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy('')
    }
  }

  async function onDelete(post: Post) {
    const warning =
      post.status === 'published'
        ? `Delete "${post.title}"?\n\nIt is published, so any link to it will start returning 404. If you only want it off the site, use Unpublish instead.`
        : `Delete the draft "${post.title}"? This cannot be undone.`
    if (!window.confirm(warning)) return
    await run(post.id, () => deletePost(post.id))
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-heading">Blog admin</h1>
          <p className="mt-1 text-sm text-muted">
            Nothing here publishes itself. A topic goes live when you press Publish, and both
            languages go live together.
          </p>
        </div>
        <Link
          to="/admin/blog/new"
          className="rounded-full bg-gold-400 px-5 py-2.5 font-bold text-navy-900 transition-colors hover:bg-gold-300"
        >
          + New post
        </Link>
      </header>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-body">
          {error}
        </p>
      ) : null}

      {topics === null ? (
        <p className="mt-10 text-muted" role="status">
          Loading…
        </p>
      ) : topics.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-semibold text-heading">No posts yet.</p>
          <p className="mt-1 text-sm text-muted">
            Write the Vietnamese version first, then its English counterpart.
          </p>
        </div>
      ) : (
        <ul className="mt-8 space-y-5">
          {topics.map((topic) => {
            const key = topic.translationKey || (topic.vie ?? topic.en)!.id
            const live = isLive(topic)
            const blocker = publishBlocker(topic)
            // A published topic that no longer satisfies the pairing rule. The
            // only way to reach this is a post published before the rule
            // existed, so it is flagged rather than silently tolerated.
            const violating = live && blocker
            const working = busy === key

            return (
              <li
                key={key}
                className={`rounded-2xl border p-5 ${
                  violating ? 'border-red-400/60 bg-red-400/5' : 'border-line'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        live ? 'bg-gold-200 text-navy-900' : 'border border-line-strong text-muted'
                      }`}
                    >
                      {live ? 'Published' : 'Draft'}
                    </span>
                    <span className="ml-3 text-xs text-muted">
                      Topic <code>{topic.translationKey || '(none)'}</code>
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {live
                      ? `Published ${formatWhen(topic.vie?.publishedAt ?? topic.en?.publishedAt)}`
                      : `Updated ${formatWhen(topic.vie?.updatedAt ?? topic.en?.updatedAt)}`}
                  </p>
                </div>

                {violating ? (
                  <p className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-sm text-body">
                    <strong>This is live but breaks the pairing rule.</strong> {blocker} Write the
                    missing version, or unpublish this one.
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <LanguageCell post={topic.vie} lang="vie" />
                  <LanguageCell post={topic.en} lang="en" />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {live ? (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => run(key, () => unpublishTopic(topic))}
                      className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      Unpublish both
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={working || Boolean(blocker)}
                      title={blocker ?? undefined}
                      onClick={() => run(key, () => publishTopic(topic))}
                      className="rounded-full bg-gold-400 px-4 py-2 text-sm font-bold text-navy-900 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Publish both
                    </button>
                  )}

                  {!live && blocker ? (
                    <span className="text-sm text-muted">{blocker}</span>
                  ) : null}

                  <span className="ml-auto flex gap-3 text-sm font-semibold">
                    {[topic.vie, topic.en].filter(Boolean).map((post) => (
                      <button
                        key={post!.id}
                        type="button"
                        disabled={working}
                        onClick={() => onDelete(post!)}
                        className="text-red-500 hover:underline disabled:opacity-50"
                      >
                        Delete {post!.lang}
                      </button>
                    ))}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Every published topic must exist in both languages, so Publish and Unpublish always act on
        the pair. A brand-new post appears at its URL immediately; an edit to an already-published
        one can take up to five minutes, because the CDN caches the rendered page. See
        BLOG_WORKFLOW.md.
      </p>
    </div>
  )
}
