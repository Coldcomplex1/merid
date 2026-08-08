// The blog admin's front page: every post, drafts included, with the actions.
//
// Deliberately one table and nothing else. The brief for this system was that it
// stay small enough to understand at a glance months later, so there is no
// dashboard, no analytics, no filters beyond what the table itself shows.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  deletePost,
  listAllPosts,
  publishPost,
  unpublishPost,
  type Post,
} from '../../lib/posts'

function formatWhen(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusPill({ status }: { status: Post['status'] }) {
  const published = status === 'published'
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
        published
          ? 'bg-gold-200 text-navy-900'
          : 'border border-line-strong text-muted'
      }`}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  )
}

export default function BlogAdmin() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    try {
      setPosts(await listAllPosts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load posts.')
      setPosts([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function withBusy(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusyId('')
    }
  }

  async function onDelete(post: Post) {
    const warning =
      post.status === 'published'
        ? `Delete "${post.title}"?\n\nIt is published, so any link to it will start returning 404. If you only want it off the site, use Unpublish instead.`
        : `Delete the draft "${post.title}"? This cannot be undone.`
    if (!window.confirm(warning)) return
    await withBusy(post.id, () => deletePost(post.id))
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-heading">Blog admin</h1>
          <p className="mt-1 text-sm text-muted">
            Nothing here publishes itself. A post goes live when you press Publish.
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

      {posts === null ? (
        <p className="mt-10 text-muted" role="status">
          Loading…
        </p>
      ) : posts.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="font-semibold text-heading">No posts yet.</p>
          <p className="mt-1 text-sm text-muted">
            Create one, or paste in something Claude wrote for you.
          </p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-3 font-bold text-heading">Title</th>
                <th className="px-4 py-3 font-bold text-heading">Lang</th>
                <th className="px-4 py-3 font-bold text-heading">Status</th>
                <th className="px-4 py-3 font-bold text-heading">Published</th>
                <th className="px-4 py-3 font-bold text-heading">Updated</th>
                <th className="px-4 py-3 font-bold text-heading">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const busy = busyId === post.id
                const url = `/blog/${post.lang}/${post.slug}`
                return (
                  <tr key={post.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-heading">{post.title}</span>
                      <code className="mt-0.5 block text-xs text-muted">{url}</code>
                    </td>
                    <td className="px-4 py-3 text-muted uppercase">{post.lang}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={post.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{formatWhen(post.publishedAt)}</td>
                    <td className="px-4 py-3 text-muted">{formatWhen(post.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 font-semibold">
                        <Link to={`/admin/blog/${post.id}/edit`} className="text-accent hover:underline">
                          Edit
                        </Link>

                        {post.status === 'published' ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          <Link
                            to={`/admin/blog/${post.id}/edit?preview=1`}
                            className="text-accent hover:underline"
                          >
                            Preview
                          </Link>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            withBusy(post.id, () =>
                              post.status === 'published' ? unpublishPost(post) : publishPost(post),
                            )
                          }
                          className="text-accent hover:underline disabled:opacity-50"
                        >
                          {post.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onDelete(post)}
                          className="text-red-500 hover:underline disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-muted">
        A brand-new post appears at its URL immediately. An edit to an already-published post can
        take up to five minutes to show, because the CDN caches the rendered page. See
        BLOG_WORKFLOW.md.
      </p>
    </div>
  )
}
