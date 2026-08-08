# The blog

Posts live as MDX in `src/content/blog/` and are rendered to **static HTML at
build time**. There is no CMS, no Firestore collection, and no "published" flag.
A post is live when its `publishAt` date has passed and the site has been rebuilt
since. A daily cron job does that rebuilding.

The reason for all of this is one constraint: GPTBot, ClaudeBot and PerplexityBot
do not execute JavaScript. A client-rendered blog is, to them, an empty `<div>`.
So blog pages ship as complete HTML with **no framework JavaScript at all** — no
React, no hydration, no bundle. Just markup, the site's stylesheet, and a
pre-paint theme script.

The SPA is untouched by any of this. Only `/blog/*` and `/en/blog/*` are
prerendered.

---

## Adding a post

1. Create **two** files, one per language. Both are required: a post with only
   one language fails the build, because a half-paired `translationKey` is
   exactly what makes `hreflang` point at a page that does not exist.

   ```
   src/content/blog/my-post-slug.vi.mdx
   src/content/blog/my-post-english-slug.en.mdx
   ```

   The filename is `<slug>.<lang>.mdx` and it is the source of truth. Frontmatter
   that disagrees with it fails the build rather than quietly winning.

   The two files do **not** need the same slug. They need the same
   `translationKey`. The English post is meant to be a rewrite for a different
   reader, so it usually wants its own slug.

2. Write the frontmatter (see the table below) and the body.

3. Regenerate and commit the manifest:

   ```bash
   npm run blog:manifest      # rewrites api/_generated/posts.js
   git add src/content/blog api/_generated/posts.js
   ```

   Forgetting this does not ship a broken site: `npm run build` re-runs the
   generator and **fails** if the committed file is stale.

4. Build and look at it:

   ```bash
   npm run build
   npm run preview            # then open /blog
   ```

### Body structure

Every post follows the same order, because it is what the answer-extraction
surfaces reward:

```
H1 (from frontmatter.title)
answer block  (from frontmatter.answer, first prose in the DOM)
table of contents  (generated from your H2s)
body
FAQ  (from frontmatter.faq)
author box
Chrome Web Store CTA
related posts
```

You write only the body. Everything else is assembled from frontmatter.

Phrase **every H2 as a question a reader would actually type**, and answer it in
the first 40 to 60 words underneath before elaborating. That first paragraph is
what gets lifted into an AI Overview.

---

## Frontmatter reference

| Field | Required | Rule | Why the rule exists |
|---|---|---|---|
| `title` | yes | ≤ 60 chars | Longer gets truncated in search results. |
| `description` | yes | 120–155 chars | Shorter and Google rewrites it; longer and it cuts. Build fails outside the range. |
| `slug` | yes | kebab-case, matches filename | Stops a copy-pasted post from silently overwriting its source. |
| `lang` | yes | `vi` or `en`, matches filename | Decides which URL tree and which index the post lands in. |
| `translationKey` | yes | identical across the pair | Drives `hreflang`. Must pair exactly one `vi` with one `en`. |
| `publishAt` | yes | ISO date, e.g. `'2026-08-11'` | **A future date excludes the post entirely**: no HTML, no sitemap, no RSS. Both languages of a topic must share a date. |
| `targetKeyword` | yes | free text | Emitted as `keywords` in Article JSON-LD. |
| `answer` | yes | **40–60 words** | Rendered as the first block in the DOM, ahead of the TOC. This is the extraction target. Build fails outside the range. |
| `faq` | no | `[{question, answer}]` | Renders an FAQ section and generates `FAQPage` JSON-LD. Omit it and neither appears. |
| `related` | no | array of slugs, same language | Slugs pointing at unpublished posts are dropped silently, so forward references do not break the build. |
| `canonicalUrl` | no | absolute URL | Overrides the self-referencing canonical. Use when syndicating to Medium or Dev.to so the original keeps the ranking. |
| `cover` | no | `/blog/screenshots/x.png` | Used for `og:image`. Defaults to the site card. |
| `coverAlt` | no | free text | Alt text for the cover. |
| `updatedAt` | no | ISO date | Adds `dateModified` to the JSON-LD and an "updated" line to the byline. |

Quote `publishAt` in the YAML (`publishAt: '2026-08-11'`). Unquoted, YAML parses
it as a date object rather than a string.

### Warnings that do not fail the build

Judgement calls, not defects, so they print and carry on:

- Body word count outside 1200–1800 (vi) or 900–1400 (en)
- Fewer than two H2s, so no table of contents renders
- An unresolved `TODO_STAT` / `TODO_SCREENSHOT` / `TODO_IMAGE` still in the body
- An image referenced by a post but missing from `public/`

---

## Images

Put them in `public/blog/screenshots/` and reference them from the root:

```mdx
![What the reader is looking at](/blog/screenshots/wikipedia-amalgamate.png)
```

The `alt` text is also rendered as the visible caption, so write it as a caption.
Images get a year-long immutable cache header (`vercel.json`), so **change the
filename when you change the picture** rather than overwriting it.

Already available:

| File | Shows |
|---|---|
| `landing-hero.png` | The site hero with the ELABORATE card |
| `wikipedia-amalgamate.png` | Real vi.wikipedia article, AMALGAMATE card open |
| `vnexpress-pulchritude.png` | VnExpress article, PULCHRITUDE card, full side panel |
| `facebook-captivate.png` | Facebook in dark mode, with the AI context check visible |
| `sidepanel-facebook.png` | Settings panel next to a Facebook page |
| `my-deck.png` | A real deck: 25 words, 15 learning, 10 known |
| `no-flashcards.png` | The "no flashcards first" card |
| `merid-banner.png` | Wide 1400x560 banner |

---

## Changing the publish schedule

Everything lives in **`src/content/publish.config.ts`**:

```ts
export const PUBLISH_START = '2026-08-08'   // topic 1 goes live on this date
export const INTERVAL_DAYS = 3              // gap between topics
```

`dateForTopic(n)` in that file computes `PUBLISH_START + (n-1) × INTERVAL_DAYS`.
Changing the constants does **not** rewrite existing posts — each post's
`publishAt` is stored in its own frontmatter, which is what makes the schedule
inspectable in a diff. To move the whole run, change the constants and update the
`publishAt` fields to match, then `npm run blog:manifest`.

To pull one post forward, just edit its `publishAt` (in **both** language files)
and redeploy. To push a published post back, set a future date and redeploy: its
HTML disappears from the next build.

### Checking the schedule without reading files

```bash
curl -s https://merid.site/api/publish-queue | jq
```

Returns which posts are live, which are pending, and `nextPublishAt` with the
posts landing on that date. Set `PUBLISH_QUEUE_TOKEN` in Vercel to require
`?token=…` — worth doing, since the pending list reveals unpublished titles.

---

## How scheduled publishing actually works

```
02:00 UTC daily
  └─ Vercel Cron  →  GET /api/cron/rebuild   (Authorization: Bearer $CRON_SECRET)
       ├─ nothing crossed its publishAt in the last 25h  →  200, no deploy
       └─ something did  →  POST $VERCEL_DEPLOY_HOOK_URL
            └─ Vercel rebuilds  →  the post now has HTML, a sitemap entry, an RSS entry
                 └─ build ends by submitting the URL list to IndexNow
```

The 25-hour lookback (rather than 24) means a cron that fires late, or a deploy
that failed and left yesterday's post unpublished, still gets picked up. Building
twice is harmless; missing a publish for a day is not.

It deliberately does **not** redeploy nightly. A deploy producing byte-identical
output still invalidates caches, burns build minutes, and buries the real
publishes in the deployment list.

---

## Manual setup in the Vercel dashboard

These cannot be done from the repo. Do them once.

### 1. Create the Deploy Hook

**Project → Settings → Git → Deploy Hooks.** Name it `blog-publish`, point it at
the production branch (`main`), create it, and copy the URL. It looks like
`https://api.vercel.com/v1/integrations/deploy/prj_xxx/yyy`.

Treat that URL as a secret. Anyone holding it can trigger unlimited builds.

### 2. Set the environment variables

**Project → Settings → Environment Variables**, all scoped to **Production**:

| Variable | Value | Required |
|---|---|---|
| `VERCEL_DEPLOY_HOOK_URL` | the URL from step 1 | yes, or nothing ever publishes |
| `CRON_SECRET` | `openssl rand -hex 32` | yes — without it `/api/cron/rebuild` returns 500 and refuses to run |
| `INDEXNOW_KEY` | `openssl rand -hex 16` | optional |
| `PUBLISH_QUEUE_TOKEN` | any random string | optional, gates `/api/publish-queue` |

`CRON_SECRET` is a Vercel convention: once it is set, Vercel automatically sends
`Authorization: Bearer $CRON_SECRET` on every cron invocation. You do not wire
that up yourself. The endpoint **fails closed** if the variable is missing,
rather than sitting on the internet as an unauthenticated deploy button.

### 3. Confirm the cron registered

The schedule is declared in `vercel.json` and registers on the next production
deploy. Check **Project → Settings → Cron Jobs** afterwards; you should see
`/api/cron/rebuild` at `0 2 * * *`.

On the **Hobby plan crons run once per day**, which `0 2 * * *` satisfies. If you
ever want a tighter window than "some time after 02:00 UTC", that needs Pro.

Test it by hand without waiting for 02:00:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://merid.site/api/cron/rebuild
```

### 4. IndexNow (optional)

If you set `INDEXNOW_KEY`, also commit a key file so the submission can be
verified:

```bash
echo -n "$INDEXNOW_KEY" > "public/$INDEXNOW_KEY.txt"
```

The file's name and contents must both be the key. Without it, IndexNow rejects
the submission.

### 5. Google Search Console, one time

**Google has no working ping endpoint.** The `google.com/ping?sitemap=` URL was
retired in 2023 and returns 404, and the Indexing API only accepts `JobPosting`
and `BroadcastEvent`. Anything claiming otherwise is calling a dead URL.

What actually works:

1. Add and verify `merid.site` at [search.google.com/search-console](https://search.google.com/search-console).
2. **Sitemaps → submit `sitemap.xml`.** Once. Google re-crawls it on its own
   afterwards, and `robots.txt` carries the `Sitemap:` line as a second signal.
3. Use **URL Inspection → Request Indexing** for a post you want picked up
   quickly.

IndexNow covers Bing, Yandex and others automatically on every build.

---

## Architecture, for when this needs changing

```
npm run build
  ├─ tsc -b                                          type-check everything
  ├─ vite build                                      the SPA → dist/  (unchanged)
  ├─ vite build --ssr src/blog/entry-server.tsx      blog renderer → .blog-ssr/
  └─ node scripts/prerender.mjs --check-manifest     → dist/blog/**, feeds
```

| File | Job |
|---|---|
| `src/content/publish.config.ts` | Schedule, URLs, author. The file you edit. |
| `src/content/schema.ts` | Frontmatter validation. Throws, naming file and field. |
| `src/content/loader.ts` | Globs the MDX, validates, splits live from pending. |
| `src/blog/entry-server.tsx` | Renders everything, returns `{path, body}[]`. |
| `src/blog/PostPage.tsx` | Post layout. DOM order is deliberate; see its header. |
| `src/blog/mdx-components.tsx` | How MDX elements get styled. Posts carry no classes. |
| `src/blog/document.ts` | The HTML shell: head, meta, JSON-LD, theme bootstrap. |
| `src/blog/feeds.ts` | sitemap.xml, rss.xml, llms.txt, robots.txt. |
| `scripts/prerender.mjs` | Writes files. Deliberately does no rendering. |
| `api/_generated/posts.js` | Generated, committed. What the endpoints read. |

Two constraints that are easy to break by accident:

- **Everything under `src/blog/` must render without a browser.** No `useLang`,
  no `useAuth`, no `localStorage`, no `useEffect`, no react-router `<Link>`.
  There is no client runtime on these pages to make any of it work.
- **Links from the SPA to `/blog` must be plain `<a href>`.** A `<Link to="/blog">`
  hands the URL to the client router, which has no `/blog` route and falls
  through to the catch-all that renders the homepage. See the comments in
  `Navbar.tsx` and `Footer.tsx`.

The table of contents is built by reading the `<h2 id>`s back out of the rendered
HTML rather than from the MDX source. That is deliberate: the ids come from
`rehype-slug` during the same render, so there is no second slugifier that could
disagree about how to handle a Vietnamese heading with diacritics.

Blog pages link the SPA's own hashed stylesheet, found via `dist/.vite/manifest.json`.
One stylesheet for the whole site, and the self-hosted Vietnamese font subsets
come along without a second declaration.
