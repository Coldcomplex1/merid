/**
 * A single blog post, rendered once at build time and never hydrated.
 *
 * The body arrives as an HTML string rather than a component because the table
 * of contents is built by reading the headings back out of the rendered markup.
 * Rendering the body first is what makes the ids in the TOC guaranteed to match
 * the ids on the page, instead of two code paths agreeing by convention.
 *
 * DOM order is deliberate and is the reason this file exists:
 *   H1 -> answer -> TOC -> body -> FAQ -> author -> CTA -> related
 * The answer block sits above everything so an extractive model reading the raw
 * HTML top-down hits the 40-60 word answer before any preamble.
 */
import { AUTHOR, CWS_URL, type Lang } from '../content/publish.config'
import type { Frontmatter } from '../content/schema'
import { BLOG_STRINGS, formatDate } from './strings'
import { BlogChrome } from './BlogChrome'

export interface TocEntry {
  id: string
  label: string
}

export interface RelatedLink {
  href: string
  title: string
  description: string
}

export interface PostPageProps {
  frontmatter: Frontmatter
  bodyHtml: string
  toc: TocEntry[]
  related: RelatedLink[]
  /** Path to the same post in the other language, when it is live. */
  alternateHref: string | null
  readingMinutes: number
}

function AuthorBox({ lang }: { lang: Lang }) {
  const t = BLOG_STRINGS[lang]
  return (
    <section className="mt-14 rounded-2xl border border-line bg-surface-2/50 p-6">
      <h2 className="text-sm font-bold tracking-wider text-muted uppercase">{t.aboutAuthor}</h2>
      <div className="mt-4 flex items-start gap-4">
        {AUTHOR.photo ? (
          <img
            src={AUTHOR.photo}
            alt={AUTHOR.name}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <div>
          <p className="text-lg font-bold text-heading">{AUTHOR.name}</p>
          <p className="mt-1 leading-relaxed text-body">{AUTHOR.bio[lang]}</p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
              href={CWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent hover:underline"
            >
              Merid trên Chrome Web Store
            </a>
            <a
              href={AUTHOR.sameAs[1]}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent hover:underline"
            >
              LinkedIn
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}

function Cta({ lang }: { lang: Lang }) {
  const t = BLOG_STRINGS[lang]
  return (
    <section className="mt-10 rounded-2xl border border-gold-500/40 bg-gold-200/20 p-6 sm:p-8">
      <h2 className="text-xl font-extrabold text-heading sm:text-2xl">{t.ctaHeading}</h2>
      <p className="mt-2 leading-relaxed text-body">{t.ctaBody}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={CWS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-gold-400 px-6 py-3 font-bold text-navy-900 transition-colors hover:bg-gold-300"
        >
          {t.ctaButton}
        </a>
        <a
          href="/#demo"
          className="rounded-full border border-line-strong px-6 py-3 font-bold text-heading transition-colors hover:border-accent hover:text-accent"
        >
          {t.ctaSecondary}
        </a>
      </div>
    </section>
  )
}

export default function PostPage({
  frontmatter: fm,
  bodyHtml,
  toc,
  related,
  alternateHref,
  readingMinutes,
}: PostPageProps) {
  const t = BLOG_STRINGS[fm.lang]

  return (
    <BlogChrome lang={fm.lang} alternateHref={alternateHref}>
      <article className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6">
        <nav className="text-sm text-muted">
          <a href="/" className="hover:text-accent">
            {t.home}
          </a>
          <span className="mx-2">/</span>
          <a href={fm.lang === 'vi' ? '/blog' : '/en/blog'} className="hover:text-accent">
            {t.blog}
          </a>
        </nav>

        <h1 className="mt-4 text-3xl leading-tight font-extrabold text-heading sm:text-4xl">
          {fm.title}
        </h1>

        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{AUTHOR.name}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={fm.publishAt}>
            {t.publishedOn} {formatDate(fm.publishAt, fm.lang)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{t.readingTime(readingMinutes)}</span>
          {fm.updatedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={fm.updatedAt}>
                {t.updatedOn} {formatDate(fm.updatedAt, fm.lang)}
              </time>
            </>
          ) : null}
        </p>

        {/* The extraction target. First prose block in the DOM, before the TOC
            and before the body, so a model reading top-down finds the answer
            without having to work out which paragraph is the summary. */}
        <div className="mt-8 rounded-2xl border-l-4 border-gold-400 bg-surface-2/60 p-5 sm:p-6">
          <p className="text-lg leading-[1.7] font-medium text-heading">{fm.answer}</p>
        </div>

        {toc.length > 1 ? (
          <nav aria-label={t.toc} className="mt-8 rounded-xl border border-line p-5">
            <h2 className="text-sm font-bold tracking-wider text-muted uppercase">{t.toc}</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {toc.map((entry, i) => (
                <li key={entry.id}>
                  <a href={`#${entry.id}`} className="text-body hover:text-accent">
                    <span className="mr-2 font-mono text-muted">{i + 1}.</span>
                    {entry.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div
          className="prose-merid mt-4"
          // Already rendered by renderToStaticMarkup from MDX we author ourselves;
          // there is no user input anywhere in this path.
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {fm.faq?.length ? (
          <section className="mt-14">
            <h2 className="text-2xl font-extrabold text-heading sm:text-3xl">{t.faq}</h2>
            <dl className="mt-6 space-y-6">
              {fm.faq.map((entry) => (
                <div key={entry.question} className="rounded-xl border border-line p-5">
                  <dt className="font-bold text-heading">{entry.question}</dt>
                  <dd className="mt-2 leading-[1.75] text-body">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <AuthorBox lang={fm.lang} />
        <Cta lang={fm.lang} />

        {related.length ? (
          <section className="mt-14">
            <h2 className="text-2xl font-extrabold text-heading">{t.related}</h2>
            <ul className="mt-6 space-y-4">
              {related.map((post) => (
                <li key={post.href}>
                  <a
                    href={post.href}
                    className="block rounded-xl border border-line p-5 transition-colors hover:border-accent"
                  >
                    <span className="block font-bold text-heading">{post.title}</span>
                    <span className="mt-1 block text-sm text-muted">{post.description}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </BlogChrome>
  )
}
