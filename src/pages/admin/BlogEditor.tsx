// The post editor. One form, three buttons, no wizard.
//
// Preview renders through api/_lib/markdown.js, the same module the server uses,
// inside the same .prose-merid container the public page uses. It is not a
// separate previewer that happens to look similar; it is the same renderer, so
// what you approve here is what ships.
//
// The one thing it cannot show is the sanitiser, which only runs server-side
// (see api/_lib/sanitize.js). In practice that only matters if you paste raw
// HTML into the body, and the note under the preview says so.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  emptyPost,
  findCounterpart,
  getPost,
  listAllPosts,
  publishTopic,
  saveDraft,
  slugify,
  suggestSlug,
  unpublishTopic,
  type Post,
  type PostLang,
} from '../../lib/posts'
import { ImageUploadError, uploadBlogImage } from '../../lib/blogImages'
import { toHtml } from '../../../api/_lib/markdown.js'
import { parseStructuredPost } from '../../../api/_lib/structured-post.js'

const LABEL = 'block text-sm font-bold text-heading'
const INPUT =
  'mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-body outline-none transition-colors focus:border-accent'
const HINT = 'mt-1 text-xs text-muted'

/** Google truncates past roughly these lengths, so the counters turn amber there. */
const TITLE_LIMIT = 60
const DESCRIPTION_LIMIT = 155

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit
  return (
    <span className={over ? 'font-semibold text-gold-600' : 'text-muted'}>
      {value.length}/{limit}
      {over ? ' — will be truncated in search results' : ''}
    </span>
  )
}

export default function BlogEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [post, setPost] = useState<Post>(() => emptyPost())
  const [loading, setLoading] = useState(Boolean(id))
  const [tab, setTab] = useState<'write' | 'preview'>(
    searchParams.get('preview') ? 'preview' : 'write',
  )
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<'cover' | 'body' | ''>('')
  const [slugTouched, setSlugTouched] = useState(Boolean(id))
  const [pasteText, setPasteText] = useState('')
  const [pasteNotes, setPasteNotes] = useState<string[]>([])
  /** The other language's post for this topic, when one exists. */
  const [counterpart, setCounterpart] = useState<Post | null>(null)
  /** Posts in the other language that have no partner yet, for the Topic picker. */
  const [pairable, setPairable] = useState<Post[]>([])

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const bodyInputRef = useRef<HTMLInputElement>(null)

  const isNew = !id

  useEffect(() => {
    if (!id) return
    let active = true
    getPost(id)
      .then((found) => {
        if (!active) return
        if (found) setPost(found)
        else setError('That post no longer exists.')
        setLoading(false)
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Could not load that post.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const set = useCallback(<K extends keyof Post>(key: K, value: Post[K]) => {
    setPost((prev) => ({ ...prev, [key]: value }))
    setStatus('')
  }, [])

  const refreshCounterpart = useCallback(async (current: Post) => {
    setCounterpart(await findCounterpart(current).catch(() => null))
  }, [])

  // Which existing posts this one could pair with: the other language, and not
  // already spoken for. Loaded once, because the list only changes when you
  // create a post, and you are not doing that from inside this screen.
  useEffect(() => {
    let active = true
    listAllPosts()
      .then((all) => {
        if (!active) return
        const keysWithBoth = new Set(
          all
            .filter((p) => p.translationKey)
            .map((p) => p.translationKey)
            .filter((key) => {
              const group = all.filter((p) => p.translationKey === key)
              return group.some((p) => p.lang === 'vie') && group.some((p) => p.lang === 'en')
            }),
        )
        setPairable(all.filter((p) => !p.translationKey || !keysWithBoth.has(p.translationKey)))
      })
      .catch(() => setPairable([]))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!post.translationKey || !post.slug) {
      setCounterpart(null)
      return
    }
    void refreshCounterpart(post)
  }, [post.translationKey, post.lang, post.slug, refreshCounterpart])

  // On a new post the slug tracks the title until the author edits it by hand.
  // On an existing post it never moves: the slug is the post's address, and
  // changing it silently would break every link that already points at it.
  useEffect(() => {
    if (!isNew || slugTouched || !post.title) return
    set('slug', slugify(post.title))
  }, [post.title, isNew, slugTouched, set])

  const previewHtml = useMemo(() => toHtml(post.content), [post.content])

  function validate(): string {
    if (!post.title.trim()) return 'The post needs a title.'
    if (!post.slug.trim()) return 'The post needs a slug.'
    if (!post.excerpt.trim()) return 'The excerpt is used on the listing and as the meta description, so it cannot be empty.'
    if (!post.content.trim()) return 'The post has no content yet.'
    return ''
  }

  /** Saves, then runs an optional follow-up (publish/unpublish) on the pair. */
  async function run(
    after: ((saved: Post) => Promise<unknown>) | null,
    done: string,
    { requirePair = false } = {},
  ) {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    if (requirePair && !counterpart) {
      setError(
        'Every published post needs both languages. Write the ' +
          (post.lang === 'vie' ? 'English' : 'Vietnamese') +
          ' version with the same topic first, then publish from the admin list.',
      )
      return
    }

    setBusy(true)
    setError('')
    try {
      // A brand-new post claims its slug at save time, so two posts written the
      // same day cannot both land on the same URL.
      let next = post
      if (isNew) {
        const free = await suggestSlug(post.slug, post.lang, undefined)
        if (free !== post.slug) {
          next = { ...post, slug: free }
          setPost(next)
        }
      }

      await saveDraft(next)
      if (after) await after(next)

      setStatus(done)
      if (isNew) navigate(`/admin/blog/${next.lang}__${next.slug}/edit`, { replace: true })
      else await refreshCounterpart(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Fills the form from a pasted draft.
   *
   * Only fields the paste actually contains are overwritten, so pasting a body
   * into a half-written post does not wipe the title you already liked. The
   * slug is left to auto-fill from the title unless the paste names one.
   */
  function applyPaste() {
    const { fields, warnings } = parseStructuredPost(pasteText)
    const notes = [...warnings]

    setPost((prev) => {
      const next: Post = { ...prev }
      if (fields.title) next.title = String(fields.title)
      if (fields.excerpt) next.excerpt = String(fields.excerpt)
      if (fields.content) next.content = String(fields.content)
      if (fields.seoTitle) next.seoTitle = String(fields.seoTitle)
      if (fields.seoDescription) next.seoDescription = String(fields.seoDescription)
      if (fields.author) next.author = String(fields.author)
      if (fields.coverImage) next.coverImage = String(fields.coverImage)
      if (fields.coverAlt) next.coverAlt = String(fields.coverAlt)
      if (fields.translationKey) next.translationKey = String(fields.translationKey)
      if (fields.canonicalUrl) next.canonicalUrl = String(fields.canonicalUrl)
      if (fields.tags?.length) next.tags = fields.tags as string[]
      if (fields.faq?.length) next.faq = fields.faq as Post['faq']

      // Language and slug are part of the address, so they only move on a post
      // that has not been created yet.
      if (isNew) {
        if (fields.lang) next.lang = fields.lang as PostLang
        if (fields.slug) {
          next.slug = slugify(String(fields.slug))
          setSlugTouched(true)
        }
      } else if (fields.slug && slugify(String(fields.slug)) !== prev.slug) {
        notes.push(
          `The paste has slug "${fields.slug}" but this post is already at "${prev.slug}". Kept the existing one, because it is the post's address.`,
        )
      }

      return next
    })

    notes.push('Fields filled. Nothing saved yet.')
    setPasteNotes(notes)
    setStatus('')
  }

  async function onUpload(file: File, target: 'cover' | 'body') {
    setUploading(target)
    setError('')
    try {
      const url = await uploadBlogImage(file)
      if (target === 'cover') {
        set('coverImage', url)
      } else {
        // Insert at the cursor rather than appending, so an image can land in
        // the middle of a draft where it belongs.
        const el = bodyRef.current
        const snippet = `\n\n![Describe what this shows](${url})\n\n`
        const at = el?.selectionStart ?? post.content.length
        set('content', post.content.slice(0, at) + snippet + post.content.slice(at))
      }
      setStatus('Image uploaded.')
    } catch (e) {
      setError(
        e instanceof ImageUploadError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Upload failed.',
      )
    } finally {
      setUploading('')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
        <span className="animate-pulse">…</span>
      </div>
    )
  }

  const publicUrl = `/blog/${post.lang}/${post.slug}`

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <nav className="text-sm">
        <Link to="/admin/blog" className="font-semibold text-accent hover:underline">
          ← All posts
        </Link>
      </nav>

      <header className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-extrabold text-heading">
          {isNew ? 'New post' : 'Edit post'}
        </h1>
        <p className="text-sm text-muted">
          {post.status === 'published' ? 'Published' : 'Draft'} ·{' '}
          <code className="text-xs">{publicUrl}</code>
        </p>
      </header>

      {error ? (
        <p className="mt-5 rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-body">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="mt-5 rounded-xl border border-gold-500/50 bg-gold-200/25 px-4 py-3 text-sm text-body">
          {status}
        </p>
      ) : null}

      {/* The paste path from BLOG_WORKFLOW.md step 5. Claude returns one block
          in this shape; dropping it here fills every field at once instead of
          nine separate copy-pastes. Plain Markdown with no headers works too and
          simply lands in the body. */}
      <details className="mt-8 rounded-xl border border-line px-4 py-3" open={isNew}>
        <summary className="cursor-pointer text-sm font-bold text-heading">
          Paste a draft (from Claude, or anywhere)
        </summary>
        <textarea
          className={`${INPUT} min-h-[120px] font-mono text-xs`}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'TITLE: …\nSLUG: …\nEXCERPT: …\nTAGS: …\nARTICLE:\n## First question'}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={applyPaste}
            disabled={!pasteText.trim()}
            className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Fill the form
          </button>
          <span className="text-xs text-muted">
            Overwrites any field the paste contains. Nothing is saved or published by this.
          </span>
        </div>
        {pasteNotes.length ? (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {pasteNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        ) : null}
      </details>

      <div className="mt-8 space-y-6">
        <div>
          <label className={LABEL} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            className={INPUT}
            value={post.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Toucan có hỗ trợ tiếng Việt không?"
          />
          <p className={HINT}>
            <Counter value={post.title} limit={TITLE_LIMIT} />
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-[1fr_140px]">
          <div>
            <label className={LABEL} htmlFor="slug">
              Slug
            </label>
            <input
              id="slug"
              className={INPUT}
              value={post.slug}
              disabled={!isNew}
              onChange={(e) => {
                setSlugTouched(true)
                set('slug', slugify(e.target.value))
              }}
            />
            <p className={HINT}>
              {isNew
                ? 'Fills in from the title. Vietnamese accents are handled, so "Học từ vựng" becomes "hoc-tu-vung".'
                : 'Fixed once created, because it is the post’s address. To change it, create a new post.'}
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="lang">
              Language
            </label>
            <select
              id="lang"
              className={INPUT}
              value={post.lang}
              disabled={!isNew}
              onChange={(e) => set('lang', e.target.value as PostLang)}
            >
              <option value="vie">vie</option>
              <option value="en">en</option>
            </select>
          </div>
        </div>

        {/* Pairing, surfaced as a first-class field rather than buried in the
            SEO section, because a post cannot publish without it. */}
        <div
          className={`rounded-xl border p-4 ${
            counterpart ? 'border-line' : 'border-gold-500/50 bg-gold-200/15'
          }`}
        >
          <label className={LABEL} htmlFor="topic">
            Topic
          </label>
          <p className={HINT}>
            Every published post needs a Vietnamese and an English version. The topic is what links
            them.
          </p>

          <select
            id="topic"
            className={INPUT}
            value={post.translationKey ?? ''}
            onChange={(e) => set('translationKey', e.target.value)}
          >
            <option value="">— pick or start a topic —</option>
            {post.translationKey &&
            !pairable.some((p) => p.translationKey === post.translationKey) ? (
              <option value={post.translationKey}>{post.translationKey}</option>
            ) : null}
            {pairable
              .filter((p) => p.lang !== post.lang && p.translationKey)
              .map((p) => (
                <option key={p.id} value={p.translationKey}>
                  Pair with {p.lang}: {p.title}
                </option>
              ))}
          </select>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!post.title.trim()}
              onClick={() => set('translationKey', slugify(post.title))}
              className="rounded-full border border-line-strong px-3 py-1 text-xs font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
            >
              Start a new topic from the title
            </button>
            {counterpart ? (
              <span className="text-xs font-semibold text-heading">
                Paired with {counterpart.lang}: {counterpart.title}
              </span>
            ) : (
              <span className="text-xs text-muted">
                No {post.lang === 'vie' ? 'English' : 'Vietnamese'} version yet, so this cannot
                publish.
              </span>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="excerpt">
            Excerpt
          </label>
          <textarea
            id="excerpt"
            className={`${INPUT} min-h-[80px]`}
            value={post.excerpt}
            onChange={(e) => set('excerpt', e.target.value)}
          />
          <p className={HINT}>
            Shown on the listing, and used as the meta description unless you set one below.{' '}
            <Counter value={post.excerpt} limit={DESCRIPTION_LIMIT} />
          </p>
        </div>

        <div>
          <span className={LABEL}>Cover image</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <input
              className={`${INPUT} mt-0 flex-1`}
              value={post.coverImage}
              onChange={(e) => set('coverImage', e.target.value)}
              placeholder="/blog/screenshots/landing-hero.png or paste a URL"
            />
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUpload(file, 'cover')
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={uploading !== ''}
              onClick={() => coverInputRef.current?.click()}
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {uploading === 'cover' ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {post.coverImage ? (
            <img
              src={post.coverImage}
              alt=""
              className="mt-3 max-h-48 rounded-lg border border-line object-cover"
            />
          ) : null}
          <input
            className={INPUT}
            value={post.coverAlt}
            onChange={(e) => set('coverAlt', e.target.value)}
            placeholder="Alt text: describe what the image shows"
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="tags">
            Tags
          </label>
          <input
            id="tags"
            className={INPUT}
            value={post.tags.join(', ')}
            onChange={(e) =>
              set(
                'tags',
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 12),
              )
            }
            placeholder="Học từ vựng, Merid, Toucan"
          />
          <p className={HINT}>Comma separated, up to 12.</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className={LABEL}>Content</span>
            <div className="flex items-center gap-2">
              <input
                ref={bodyInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onUpload(file, 'body')
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={uploading !== ''}
                onClick={() => bodyInputRef.current?.click()}
                className="rounded-full border border-line-strong px-3 py-1 text-xs font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {uploading === 'body' ? 'Uploading…' : 'Insert image'}
              </button>
              {(['write', 'preview'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    tab === t
                      ? 'bg-gold-400 text-navy-900'
                      : 'border border-line-strong text-body hover:border-accent'
                  }`}
                >
                  {t === 'write' ? 'Write' : 'Preview'}
                </button>
              ))}
            </div>
          </div>

          {tab === 'write' ? (
            <textarea
              ref={bodyRef}
              className={`${INPUT} min-h-[420px] font-mono text-sm leading-relaxed`}
              value={post.content}
              onChange={(e) => set('content', e.target.value)}
              placeholder={'## Câu hỏi đầu tiên là gì?\n\nTrả lời ngay trong 40 tới 60 chữ đầu.'}
            />
          ) : (
            <>
              <div
                className="prose-merid mt-1.5 min-h-[420px] rounded-lg border border-line-strong bg-surface p-5"
                // Rendered by the same module the server uses, from content the
                // signed-in admin just typed. The public path additionally
                // sanitises; see the note below.
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              <p className={HINT}>
                Rendered with the same Markdown renderer the live page uses. Raw HTML you paste in
                is stripped on the public page but not here, so keep to Markdown.
              </p>
            </>
          )}
        </div>

        <details className="rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-heading">
            SEO and translation pairing
          </summary>

          <div className="mt-4 space-y-5">
            <div>
              <label className={LABEL} htmlFor="seoTitle">
                SEO title
              </label>
              <input
                id="seoTitle"
                className={INPUT}
                value={post.seoTitle}
                onChange={(e) => set('seoTitle', e.target.value)}
                placeholder="Defaults to the title"
              />
              <p className={HINT}>
                <Counter value={post.seoTitle || post.title} limit={TITLE_LIMIT} />
              </p>
            </div>

            <div>
              <label className={LABEL} htmlFor="seoDescription">
                SEO description
              </label>
              <textarea
                id="seoDescription"
                className={`${INPUT} min-h-[70px]`}
                value={post.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
                placeholder="Defaults to the excerpt"
              />
              <p className={HINT}>
                <Counter
                  value={post.seoDescription || post.excerpt}
                  limit={DESCRIPTION_LIMIT}
                />
              </p>
            </div>

            <div>
              <label className={LABEL} htmlFor="canonicalUrl">
                Canonical URL
              </label>
              <input
                id="canonicalUrl"
                className={INPUT}
                value={post.canonicalUrl ?? ''}
                onChange={(e) => set('canonicalUrl', e.target.value)}
                placeholder="Leave blank unless this was published elsewhere first"
              />
            </div>
          </div>
        </details>
      </div>

      <div className="sticky bottom-0 mt-10 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 py-4 backdrop-blur">
        <button
          type="button"
          disabled={busy || uploading !== ''}
          onClick={() => run(null, 'Draft saved.')}
          className="rounded-full border border-line-strong px-5 py-2.5 font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Save draft
        </button>

        <button
          type="button"
          onClick={() => setTab(tab === 'preview' ? 'write' : 'preview')}
          className="rounded-full border border-line-strong px-5 py-2.5 font-bold text-heading transition-colors hover:border-accent hover:text-accent"
        >
          {tab === 'preview' ? 'Back to writing' : 'Preview'}
        </button>

        {post.status === 'published' ? (
          <button
            type="button"
            disabled={busy || uploading !== ''}
            onClick={() =>
              run(
                async (saved) => unpublishTopic({
                  translationKey: saved.translationKey ?? '',
                  vie: saved.lang === 'vie' ? saved : counterpart,
                  en: saved.lang === 'en' ? saved : counterpart,
                }),
                'Unpublished. Both languages are drafts again and the URLs now 404.',
              )
            }
            className="rounded-full border border-line-strong px-5 py-2.5 font-bold text-heading transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Unpublish both
          </button>
        ) : null}

        <button
          type="button"
          disabled={busy || uploading !== '' || !counterpart}
          title={counterpart ? undefined : 'Both languages must exist before a topic can publish.'}
          onClick={() =>
            run(
              async (saved) => publishTopic({
                translationKey: saved.translationKey ?? '',
                vie: saved.lang === 'vie' ? saved : counterpart,
                en: saved.lang === 'en' ? saved : counterpart,
              }),
              post.status === 'published'
                ? 'Saved. Changes to a live post can take up to five minutes to appear.'
                : 'Published, both languages. They are live at their URLs now.',
              { requirePair: true },
            )
          }
          className="rounded-full bg-gold-400 px-6 py-2.5 font-bold text-navy-900 transition-colors hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {post.status === 'published' ? 'Save changes' : 'Publish both'}
        </button>

        {!counterpart ? (
          <span className="text-sm text-muted">
            Needs a {post.lang === 'vie' ? 'Vietnamese and English' : 'Vietnamese'} pair before it
            can go live.
          </span>
        ) : null}
      </div>
    </div>
  )
}
