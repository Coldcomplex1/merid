/**
 * Loads every post in src/content/blog, validates it, and splits the set into
 * what is live right now and what is still pending.
 *
 * Files are named `<slug>.<lang>.mdx`. The slug and lang in the filename are the
 * source of truth and the frontmatter has to agree with them, so a copy-pasted
 * post that forgot to change its slug fails the build instead of silently
 * overwriting its sibling's HTML.
 *
 * This module runs inside the SSR bundle (Vite compiles the MDX), never in the
 * browser and never in a serverless function.
 */
import type { ComponentType } from 'react'
import type { Lang } from './publish.config'
import { parseFrontmatter, validateCollection, type Frontmatter } from './schema'

export interface LoadedPost {
  frontmatter: Frontmatter
  /** The compiled MDX body. */
  Content: ComponentType<{ components?: Record<string, unknown> }>
  /** Source path, for error messages and warnings. */
  file: string
}

export interface PostSet {
  /** publishAt has passed. These get HTML, sitemap and RSS entries. */
  live: LoadedPost[]
  /** publishAt is still in the future. These are excluded from the build entirely. */
  pending: LoadedPost[]
  /** Every post regardless of date, for the publish-queue manifest. */
  all: LoadedPost[]
}

type MdxModule = {
  default: ComponentType<{ components?: Record<string, unknown> }>
  frontmatter?: Record<string, unknown>
}

const FILENAME = /^(?<slug>[a-z0-9-]+)\.(?<lang>vi|en)\.mdx$/

/**
 * Eagerly pulls in every post. `eager` matters: the prerender script needs all
 * of them synchronously, and there is no code-splitting benefit in a build step.
 */
const modules = import.meta.glob<MdxModule>('./blog/*.mdx', { eager: true })

function loadAll(): LoadedPost[] {
  const posts: LoadedPost[] = []

  for (const [path, mod] of Object.entries(modules)) {
    const basename = path.split('/').pop() ?? path
    const match = FILENAME.exec(basename)
    if (!match?.groups) {
      throw new Error(
        `${path}: filename must be "<slug>.<lang>.mdx" with lang vi or en, e.g. "toucan-vs-merid.vi.mdx"`,
      )
    }

    const { slug, lang } = match.groups
    if (!mod.frontmatter) {
      throw new Error(`${path}: no frontmatter block found. Every post needs one.`)
    }

    posts.push({
      frontmatter: parseFrontmatter(mod.frontmatter, path, slug, lang),
      Content: mod.default,
      file: path,
    })
  }

  validateCollection(posts.map((p) => p.frontmatter))
  return posts
}

/**
 * @param now Injected so the build and the tests can both reason about a fixed
 *   clock. Defaults to the moment the build runs, which is the whole scheduling
 *   mechanism: a rebuild is what makes a post go live.
 */
export function loadPosts(now: Date = new Date()): PostSet {
  const all = loadAll().sort(
    (a, b) =>
      Date.parse(b.frontmatter.publishAt) - Date.parse(a.frontmatter.publishAt) ||
      a.frontmatter.slug.localeCompare(b.frontmatter.slug),
  )

  const live: LoadedPost[] = []
  const pending: LoadedPost[] = []
  for (const post of all) {
    if (Date.parse(post.frontmatter.publishAt) <= now.getTime()) live.push(post)
    else pending.push(post)
  }

  return { live, pending, all }
}

/** Live posts for one language, newest first. */
export function liveForLang(set: PostSet, lang: Lang): LoadedPost[] {
  return set.live.filter((p) => p.frontmatter.lang === lang)
}

/**
 * The published counterpart of a post in the other language, or null.
 *
 * Returning null rather than the pending post is deliberate: hreflang must only
 * ever point at a URL that exists. Since a translationKey pair is required to
 * share a publishAt, in practice both sides go live together.
 */
export function counterpart(set: PostSet, post: LoadedPost): LoadedPost | null {
  return (
    set.live.find(
      (p) =>
        p.frontmatter.translationKey === post.frontmatter.translationKey &&
        p.frontmatter.lang !== post.frontmatter.lang,
    ) ?? null
  )
}

/**
 * Resolves a post's `related` slugs to live posts in the same language.
 * Slugs pointing at unpublished or nonexistent posts are dropped silently,
 * because a scheduled blog would otherwise fail to build every time a post
 * referenced one that had not landed yet.
 */
export function relatedPosts(set: PostSet, post: LoadedPost): LoadedPost[] {
  const wanted = post.frontmatter.related ?? []
  return wanted
    .map((slug) =>
      set.live.find(
        (p) => p.frontmatter.slug === slug && p.frontmatter.lang === post.frontmatter.lang,
      ),
    )
    .filter((p): p is LoadedPost => Boolean(p))
}
