/**
 * A language's blog index. Lists live posts newest first.
 *
 * Pending posts are not listed, not counted, and not hinted at. A "coming soon"
 * row would be a URL a crawler could try and a reader could bookmark, for a page
 * that does not exist yet.
 */
import { AUTHOR, CWS_URL, type Lang } from '../content/publish.config'
import { BLOG_STRINGS, formatDate } from './strings'
import { BlogChrome } from './BlogChrome'

export interface IndexEntry {
  href: string
  title: string
  description: string
  publishAt: string
  readingMinutes: number
}

export interface IndexPageProps {
  lang: Lang
  posts: IndexEntry[]
  alternateHref: string | null
}

export default function IndexPage({ lang, posts, alternateHref }: IndexPageProps) {
  const t = BLOG_STRINGS[lang]

  return (
    <BlogChrome lang={lang} alternateHref={alternateHref}>
      <div className="mx-auto max-w-4xl px-4 pt-12 pb-20 sm:px-6">
        <h1 className="text-4xl font-extrabold text-heading sm:text-5xl">{t.indexHeading}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-body">{t.indexSubheading}</p>

        {posts.length ? (
          <ul className="mt-12 space-y-6">
            {posts.map((post) => (
              <li key={post.href}>
                <a
                  href={post.href}
                  className="block rounded-2xl border border-line p-6 transition-colors hover:border-accent"
                >
                  <h2 className="text-xl font-extrabold text-heading sm:text-2xl">{post.title}</h2>
                  <p className="mt-2 leading-relaxed text-body">{post.description}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <time dateTime={post.publishAt}>{formatDate(post.publishAt, lang)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{t.readingTime(post.readingMinutes)}</span>
                  </p>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-12 rounded-2xl border border-dashed border-line p-8 text-center text-muted">
            {t.empty}
          </p>
        )}

        <section className="mt-16 rounded-2xl border border-gold-500/40 bg-gold-200/20 p-6 sm:p-8">
          <h2 className="text-xl font-extrabold text-heading sm:text-2xl">{t.ctaHeading}</h2>
          <p className="mt-2 leading-relaxed text-body">{t.ctaBody}</p>
          <a
            href={CWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-full bg-gold-400 px-6 py-3 font-bold text-navy-900 transition-colors hover:bg-gold-300"
          >
            {t.ctaButton}
          </a>
        </section>

        <section className="mt-10 rounded-2xl border border-line bg-surface-2/50 p-6">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">{t.aboutAuthor}</h2>
          <p className="mt-3 text-lg font-bold text-heading">{AUTHOR.name}</p>
          <p className="mt-1 leading-relaxed text-body">{AUTHOR.bio[lang]}</p>
        </section>
      </div>
    </BlogChrome>
  )
}
