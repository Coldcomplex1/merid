// Unit tests for the blog's pure pieces: slugs, Markdown, sanitisation, the
// paste format, and the rendered HTML.
//
// The parts that need a database live in test/firestore-rules.test.mjs (the
// security boundary) and are exercised against the emulator, because that is
// where "a draft is unreachable" is actually decided.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findFreeSlug, postId, slugify } from '../api/_lib/slug.js'
import { extractToc, readingMinutes, stripTags, toHtml } from '../api/_lib/markdown.js'
import { sanitizeArticleHtml } from '../api/_lib/sanitize.js'
import { formatStructuredPost, parseStructuredPost } from '../api/_lib/structured-post.js'
import { renderIndexPage, renderNotFound, renderPostPage } from '../api/_lib/blog-html.js'

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

test('Vietnamese titles produce readable ASCII slugs', () => {
    // The whole reason slugify normalises rather than stripping: a naive
    // [^a-z0-9] filter turns this into "hc-t-vng-ting-anh".
    assert.equal(slugify('Học từ vựng tiếng Anh'), 'hoc-tu-vung-tieng-anh')
    assert.equal(slugify('Toucan có hỗ trợ tiếng Việt không?'), 'toucan-co-ho-tro-tieng-viet-khong')
    assert.equal(slugify('Cần bao nhiêu từ vựng để đọc báo?'), 'can-bao-nhieu-tu-vung-de-doc-bao')
})

test('đ becomes d, since NFD leaves it intact', () => {
    // đ is its own letter, not a d carrying a diacritic, so normalisation alone
    // does not touch it. Without the explicit map it would be stripped entirely.
    assert.equal(slugify('Đọc báo mỗi ngày'), 'doc-bao-moi-ngay')
    assert.equal(slugify('đường'), 'duong')
})

test('punctuation and runs of whitespace collapse to single hyphens', () => {
    assert.equal(slugify('  Multiple   spaces & symbols!!  '), 'multiple-spaces-symbols')
    assert.equal(slugify('a---b'), 'a-b')
    assert.equal(slugify('!!!'), '')
})

test('a slug never ends in a hyphen, even when truncated', () => {
    const slug = slugify('a'.repeat(70) + ' ' + 'b'.repeat(40))
    assert.ok(slug.length <= 80)
    assert.ok(!slug.endsWith('-'), `"${slug}" must not end in a hyphen`)
})

test('the document id encodes the URL', () => {
    assert.equal(postId('vie', 'hoc-tu-vung'), 'vie__hoc-tu-vung')
})

test('a colliding slug gets a numeric suffix', async () => {
    const taken = new Set(['bai-viet', 'bai-viet-2'])
    const free = await findFreeSlug('Bài viết', (s) => Promise.resolve(taken.has(s)))
    assert.equal(free, 'bai-viet-3')
})

test('editing a post does not walk its own slug forward', async () => {
    // Without the currentSlug check, every save of an existing post would see
    // its own slug as taken and rename it foo -> foo-2 -> foo-3.
    const taken = new Set(['bai-viet'])
    const free = await findFreeSlug('Bài viết', (s) => Promise.resolve(taken.has(s)), 'bai-viet')
    assert.equal(free, 'bai-viet')
})

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

test('headings get ids derived from the same slugify the URLs use', () => {
    const html = toHtml('## Câu hỏi đầu tiên là gì?')
    assert.match(html, /<h2 id="cau-hoi-dau-tien-la-gi"/)
})

test('the table of contents is read back out of the rendered HTML', () => {
    // Deriving it from the output rather than the source is what guarantees the
    // anchors resolve: there is only one slugifier involved, not two agreeing.
    const html = toHtml('## First\n\ntext\n\n## Second\n\ntext\n\n### Not in the TOC')
    const toc = extractToc(html)
    assert.equal(toc.length, 2)
    assert.deepEqual(toc.map((e) => e.label), ['First', 'Second'])
    for (const entry of toc) {
        assert.ok(html.includes(`id="${entry.id}"`), `${entry.id} must exist on the page`)
    }
})

test('images render as figures with the alt text as a caption', () => {
    const html = toHtml('![A deck of 25 words](/blog/screenshots/my-deck.png)')
    assert.match(html, /<figure>/)
    assert.match(html, /alt="A deck of 25 words"/)
    assert.match(html, /<figcaption>A deck of 25 words<\/figcaption>/)
    assert.match(html, /loading="lazy"/)
})

test('tables are wrapped so they scroll instead of widening the page', () => {
    const html = toHtml('| a | b |\n| --- | --- |\n| 1 | 2 |')
    assert.match(html, /<div class="table-scroll">/)
    assert.match(html, /<th>a<\/th>/)
    assert.match(html, /<td>2<\/td>/)
})

test('external links open safely, internal ones do not', () => {
    const external = toHtml('[x](https://example.com)')
    assert.match(external, /rel="noopener noreferrer"/)
    assert.match(external, /target="_blank"/)

    for (const href of ['/tutorial', 'https://merid.site/tutorial']) {
        assert.ok(
            !toHtml(`[x](${href})`).includes('target="_blank"'),
            `${href} is internal and should not open in a new tab`,
        )
    }
})

test('reading time is never zero and counts Vietnamese faster', () => {
    const text = Array(300).fill('word').join(' ')
    assert.ok(readingMinutes(text, 'en') > readingMinutes(text, 'vie'))
    assert.equal(readingMinutes('one word', 'vie'), 1)
    assert.equal(readingMinutes('', 'en'), 1)
})

test('stripTags leaves the words and drops the markup', () => {
    assert.equal(stripTags('<p>Hello <strong>there</strong></p>'), 'Hello there')
    assert.equal(stripTags('<script>evil()</script>text'), 'text')
})

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

test('scripts and event handlers never survive to a public page', () => {
    // Markdown permits raw HTML by design, so this is reachable without any
    // compromise: it only takes one careless paste.
    const dirty = toHtml('Hello <script>alert(1)</script> and <img src=x onerror="alert(2)">')
    const clean = sanitizeArticleHtml(dirty)
    assert.ok(!clean.includes('<script'), 'script tag must be removed')
    assert.ok(!clean.includes('alert(1)'), 'script body must be removed')
    assert.ok(!clean.includes('onerror'), 'event handler must be stripped')
    assert.ok(clean.includes('Hello'), 'surrounding text must survive')
})

test('javascript: and data: URLs are refused', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
        const clean = sanitizeArticleHtml(`<a href="${href}">click</a>`)
        assert.ok(!clean.includes('javascript:'), `${href} must not survive`)
        assert.ok(!clean.includes('data:text/html'), `${href} must not survive`)
    }
})

test('the classes the stylesheet defines are kept, arbitrary ones are not', () => {
    const clean = sanitizeArticleHtml(
        '<span class="swap">captivate</span><span class="evil">x</span>',
    )
    assert.match(clean, /class="swap"/)
    assert.ok(!clean.includes('evil'), 'undeclared classes should be dropped')
})

test('ordinary article markup passes through untouched', () => {
    const html = toHtml(
        '## Heading\n\nA paragraph with **bold** and [a link](/x).\n\n| a |\n| --- |\n| 1 |\n\n![alt](/img.png)',
    )
    const clean = sanitizeArticleHtml(html)
    for (const fragment of ['<h2 id=', '<strong>', '<table>', '<figure>', 'table-scroll']) {
        assert.ok(clean.includes(fragment), `${fragment} should survive sanitisation`)
    }
})

// ---------------------------------------------------------------------------
// The paste format
// ---------------------------------------------------------------------------

const SAMPLE = `TITLE: Toucan có hỗ trợ tiếng Việt không?
SLUG: toucan-co-ho-tro-tieng-viet-khong
LANG: vie
EXCERPT: Không, và lý do nằm ở chiều dịch.
SEO TITLE: Toucan có hỗ trợ tiếng Việt không?
SEO DESCRIPTION: Toucan không có tiếng Việt trong danh sách.
TAGS: toucan, học từ vựng
TRANSLATION KEY: toucan-vietnamese-support
COVER IMAGE IDEA: a screenshot of the language dropdown
FAQ:
Q: Toucan có miễn phí không?
A: Có bản miễn phí.
Q: Còn tiếng Nhật?
A: Có.
ARTICLE:
## Câu hỏi đầu tiên

Nội dung: có dấu hai chấm ở đây.

## TITLE: this looks like a field but is a heading`

test('a structured paste fills every field', () => {
    const { fields } = parseStructuredPost(SAMPLE)
    assert.equal(fields.title, 'Toucan có hỗ trợ tiếng Việt không?')
    assert.equal(fields.slug, 'toucan-co-ho-tro-tieng-viet-khong')
    assert.equal(fields.lang, 'vie')
    assert.equal(fields.translationKey, 'toucan-vietnamese-support')
    assert.deepEqual(fields.tags, ['toucan', 'học từ vựng'])
    assert.equal(fields.faq.length, 2)
    assert.deepEqual(fields.faq[0], { question: 'Toucan có miễn phí không?', answer: 'Có bản miễn phí.' })
})

test('ARTICLE swallows everything after it, colons and all', () => {
    // This is why ARTICLE comes last. A heading or a colon inside the body must
    // never be mistaken for a field header.
    const { fields } = parseStructuredPost(SAMPLE)
    assert.match(fields.content, /^## Câu hỏi đầu tiên/)
    assert.ok(fields.content.includes('Nội dung: có dấu hai chấm ở đây.'))
    assert.ok(
        fields.content.includes('## TITLE: this looks like a field but is a heading'),
        'a heading that resembles a field header must stay in the body',
    )
})

test('the cover image idea is reported, not imported as a URL', () => {
    const { fields, warnings } = parseStructuredPost(SAMPLE)
    assert.equal(fields.coverImage, undefined)
    assert.ok(warnings.some((w) => w.includes('Cover image idea')))
})

test('plain Markdown with no headers is treated as the body', () => {
    const { fields } = parseStructuredPost('## Just a heading\n\nAnd a paragraph.')
    assert.equal(fields.content, '## Just a heading\n\nAnd a paragraph.')
    assert.equal(fields.title, undefined)
})

test('lang accepts vi as well as vie, since both are natural to type', () => {
    assert.equal(parseStructuredPost('TITLE: x\nLANG: vi\nARTICLE:\nbody').fields.lang, 'vie')
    assert.equal(parseStructuredPost('TITLE: x\nLANG: vie\nARTICLE:\nbody').fields.lang, 'vie')
    assert.equal(parseStructuredPost('TITLE: x\nLANG: en\nARTICLE:\nbody').fields.lang, 'en')
})

test('format and parse round-trip', () => {
    const post = {
        title: 'A title',
        slug: 'a-title',
        lang: 'en',
        excerpt: 'An excerpt.',
        seoTitle: 'SEO title',
        seoDescription: 'SEO description.',
        tags: ['one', 'two'],
        translationKey: 'key',
        faq: [{ question: 'Q1?', answer: 'A1.' }],
        content: '## Heading\n\nBody text.',
    }
    const { fields } = parseStructuredPost(formatStructuredPost(post))
    for (const key of ['title', 'slug', 'lang', 'excerpt', 'seoTitle', 'seoDescription', 'translationKey', 'content']) {
        assert.equal(fields[key], post[key], `${key} must survive the round trip`)
    }
    assert.deepEqual(fields.tags, post.tags)
    assert.deepEqual(fields.faq, post.faq)
})

// ---------------------------------------------------------------------------
// Rendered pages
// ---------------------------------------------------------------------------

function samplePost(overrides = {}) {
    return {
        slug: 'bai-thu-nghiem',
        lang: 'vie',
        title: 'Bài thử nghiệm',
        excerpt: 'Một đoạn tóm tắt ngắn.',
        content: '## Câu hỏi đầu tiên\n\nĐoạn thân bài nằm trong HTML thô.\n\n## Câu thứ hai\n\nĐoạn nữa.',
        author: 'Van Quyet Doan',
        status: 'published',
        publishedAt: '2026-08-08T00:00:00Z',
        updatedAt: '2026-08-08T00:00:00Z',
        tags: ['toucan'],
        seoTitle: 'SEO title',
        seoDescription: 'SEO description for the meta tag.',
        translationKey: 'test',
        ...overrides,
    }
}

test('the article body is in the raw HTML, not assembled by JavaScript', () => {
    // The single most important property of this whole system: the crawlers this
    // content targets do not run JS, so the words have to be in the bytes.
    const html = renderPostPage(samplePost(), null)
    assert.ok(html.includes('Đoạn thân bài nằm trong HTML thô.'))
    assert.ok(html.includes('Câu hỏi đầu tiên'))
    // No bundle, no hydration, no framework runtime.
    assert.ok(!html.includes('type="module"'), 'a blog page must ship no module script')
})

test('the excerpt precedes the table of contents and the body in the DOM', () => {
    const html = renderPostPage(samplePost(), null)
    const lede = html.indexOf('Một đoạn tóm tắt ngắn.')
    const toc = html.indexOf('blog-toc')
    const body = html.indexOf('Đoạn thân bài')
    assert.ok(lede > 0 && toc > 0 && body > 0)
    assert.ok(lede < toc, 'the excerpt must come before the contents list')
    assert.ok(toc < body, 'the contents list must come before the body')
})

test('SEO fields override their fallbacks', () => {
    const html = renderPostPage(samplePost(), null)
    assert.match(html, /<title>SEO title<\/title>/)
    assert.match(html, /<meta name="description" content="SEO description for the meta tag\." \/>/)
})

test('title and description fall back when no SEO fields are set', () => {
    const html = renderPostPage(samplePost({ seoTitle: '', seoDescription: '' }), null)
    assert.match(html, /<title>Bài thử nghiệm<\/title>/)
    assert.match(html, /content="Một đoạn tóm tắt ngắn\."/)
})

test('canonical is self-referencing unless overridden', () => {
    const plain = renderPostPage(samplePost(), null)
    assert.match(plain, /<link rel="canonical" href="https:\/\/merid\.site\/blog\/vie\/bai-thu-nghiem" \/>/)

    const syndicated = renderPostPage(
        samplePost({ canonicalUrl: 'https://medium.com/@x/y' }),
        null,
    )
    assert.match(syndicated, /<link rel="canonical" href="https:\/\/medium\.com\/@x\/y" \/>/)
})

test('hreflang appears only when the counterpart is actually published', () => {
    const alone = renderPostPage(samplePost(), null)
    assert.ok(
        !alone.includes('rel="alternate" hreflang'),
        'an alternate pointing at a page that does not exist is worse than none',
    )

    const paired = renderPostPage(samplePost(), { lang: 'en', slug: 'test-post' })
    assert.match(paired, /hreflang="vi" href="https:\/\/merid\.site\/blog\/vie\/bai-thu-nghiem"/)
    assert.match(paired, /hreflang="en" href="https:\/\/merid\.site\/blog\/en\/test-post"/)
    assert.match(paired, /hreflang="x-default" href="https:\/\/merid\.site\/blog\/vie\/bai-thu-nghiem"/)
})

test('Article JSON-LD carries a Person author with sameAs links', () => {
    const html = renderPostPage(samplePost(), null)
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')))

    const article = blocks.find((b) => b['@type'] === 'Article')
    assert.ok(article, 'an Article node must be present')
    assert.equal(article.author['@type'], 'Person')
    assert.equal(article.author.name, 'Van Quyet Doan')
    assert.ok(article.author.sameAs.some((u) => u.includes('chromewebstore')))
    assert.ok(article.author.sameAs.some((u) => u.includes('linkedin')))
    assert.equal(article.datePublished, '2026-08-08T00:00:00Z')
    assert.equal(article.inLanguage, 'vi-VN')

    assert.ok(blocks.some((b) => b['@type'] === 'BreadcrumbList'))
})

test('FAQPage JSON-LD appears only when the post has FAQ entries', () => {
    const without = renderPostPage(samplePost(), null)
    assert.ok(!without.includes('FAQPage'))

    const withFaq = renderPostPage(
        samplePost({ faq: [{ question: 'Q?', answer: 'A.' }] }),
        null,
    )
    const faq = [...withFaq.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')))
        .find((b) => b['@type'] === 'FAQPage')
    assert.ok(faq)
    assert.equal(faq.mainEntity[0].name, 'Q?')
    assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'A.')
})

test('a title containing markup cannot break out of the JSON-LD block', () => {
    const html = renderPostPage(samplePost({ title: 'A </script><script>alert(1)</script>' }), null)
    assert.ok(!html.includes('</script><script>alert(1)'), 'the title must not close the JSON-LD script')
    assert.ok(html.includes('\\u003c'), 'angle brackets in JSON-LD must be escaped')
})

test('the index lists posts and links them at the right URLs', () => {
    const html = renderIndexPage('vie', [samplePost()])
    assert.ok(html.includes('href="/blog/vie/bai-thu-nghiem"'))
    assert.ok(html.includes('Bài thử nghiệm'))
    assert.match(html, /<link rel="canonical" href="https:\/\/merid\.site\/blog" \/>/)
})

test('an empty index renders a real empty state rather than a blank page', () => {
    const html = renderIndexPage('en', [])
    assert.ok(html.includes('No posts yet'))
    assert.match(html, /<link rel="canonical" href="https:\/\/merid\.site\/blog\/en" \/>/)
})

test('the 404 page is marked noindex', () => {
    const html = renderNotFound('vie')
    assert.match(html, /<meta name="robots" content="noindex, follow" \/>/)
})

test('every page links the stable stylesheet and sets the right html lang', () => {
    // Stable rather than hashed: dist/ is not on the serverless function's
    // filesystem, so a hashed name could never be looked up at request time.
    for (const html of [
        renderPostPage(samplePost(), null),
        renderIndexPage('vie', [samplePost()]),
        renderNotFound('vie'),
    ]) {
        assert.ok(html.includes('<link rel="stylesheet" href="/blog.css" />'), 'must link /blog.css')
    }
    assert.match(renderPostPage(samplePost(), null), /<html lang="vi">/)
    assert.match(renderPostPage(samplePost({ lang: 'en' }), null), /<html lang="en">/)
})
