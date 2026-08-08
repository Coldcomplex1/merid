/**
 * How MDX elements become Merid-styled HTML.
 *
 * Everything here has to be renderable with no browser: no hooks, no effects,
 * no event handlers. These components run once through renderToStaticMarkup at
 * build time and the resulting markup is all a reader ever gets.
 *
 * Post bodies never carry class names of their own. All styling decisions live
 * here so Tailwind's scanner can see them in a .tsx file, and so a post's
 * appearance can be changed in one place rather than across twenty MDX files.
 */
import type { ReactNode } from 'react'

type Props = { children?: ReactNode; [key: string]: unknown }

/** Site-relative and anchor links stay in-page; anything external opens safely. */
function Anchor({ href, children, ...rest }: Props & { href?: string }) {
  const external = Boolean(href && /^https?:\/\//i.test(href) && !href.includes('merid.site'))
  return (
    <a
      href={href}
      className="font-semibold text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  )
}

/**
 * Post images are figures with captions. `alt` doubles as the caption, because a
 * screenshot in a how-to post is worth describing to everyone, not only to
 * screen readers.
 */
function Figure({ src, alt, ...rest }: Props & { src?: string; alt?: string }) {
  return (
    <figure className="my-8">
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        className="w-full rounded-xl border border-line shadow-[0_2px_16px_var(--shadow-tint)]"
        {...rest}
      />
      {alt ? (
        <figcaption className="mt-3 text-center text-sm text-muted">{alt}</figcaption>
      ) : null}
    </figure>
  )
}

/** Tables are the comparison-post workhorse, and they must not blow out the page on mobile. */
function Table({ children, ...rest }: Props) {
  return (
    <div className="my-8 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-sm" {...rest}>
        {children}
      </table>
    </div>
  )
}

export const mdxComponents = {
  a: Anchor,
  img: Figure,
  table: Table,

  h2: (props: Props) => (
    <h2
      className="mt-12 scroll-mt-24 text-2xl font-extrabold text-heading sm:text-3xl"
      {...props}
    />
  ),
  h3: (props: Props) => (
    <h3 className="mt-8 scroll-mt-24 text-xl font-bold text-heading" {...props} />
  ),
  h4: (props: Props) => (
    <h4 className="mt-6 scroll-mt-24 text-lg font-bold text-heading" {...props} />
  ),

  p: (props: Props) => <p className="mt-4 leading-[1.75] text-body" {...props} />,
  ul: (props: Props) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 leading-[1.75] text-body" {...props} />
  ),
  ol: (props: Props) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 leading-[1.75] text-body" {...props} />
  ),
  li: (props: Props) => <li className="pl-1" {...props} />,

  blockquote: (props: Props) => (
    <blockquote
      className="my-6 border-l-4 border-gold-400 bg-surface-2/60 py-3 pr-4 pl-5 text-body italic"
      {...props}
    />
  ),

  thead: (props: Props) => <thead className="bg-surface-2" {...props} />,
  th: (props: Props) => (
    <th className="border-b border-line px-4 py-3 font-bold text-heading" {...props} />
  ),
  td: (props: Props) => (
    <td className="border-b border-line px-4 py-3 align-top text-body" {...props} />
  ),

  code: (props: Props) => (
    <code
      className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-heading"
      {...props}
    />
  ),
  pre: (props: Props) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 text-sm"
      {...props}
    />
  ),

  hr: (props: Props) => <hr className="my-10 border-line" {...props} />,
  strong: (props: Props) => <strong className="font-bold text-heading" {...props} />,
}

/**
 * A production note left in the copy on purpose.
 *
 * TODO_STAT and TODO_SCREENSHOT markers are meant to be visible while drafting
 * and impossible to miss in review. They render as a dashed amber block that
 * looks nothing like body copy, so shipping one by accident is obvious on the
 * page rather than something you have to grep for.
 */
export function Todo({ kind, children }: { kind: 'stat' | 'screenshot' | 'image'; children: ReactNode }) {
  const label = kind === 'stat' ? 'TODO_STAT' : kind === 'image' ? 'TODO_IMAGE' : 'TODO_SCREENSHOT'
  return (
    <div className="my-6 rounded-xl border-2 border-dashed border-gold-500 bg-gold-200/25 px-4 py-3 text-sm text-heading">
      <span className="mr-2 font-mono text-xs font-bold tracking-wider text-gold-600">
        {label}
      </span>
      {children}
    </div>
  )
}
