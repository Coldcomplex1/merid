// Cleans rendered article HTML before it reaches a public page.
//
// Server-only: sanitize-html is Node-oriented, and this module is deliberately
// not imported by the admin preview so its dependency tree stays out of the
// browser bundle.
//
// Why sanitise content only the site owner can write: the admin account is a
// single point of failure. If it were ever taken over, stored XSS on a public,
// crawled page is a considerably worse outcome than a defaced post, and it
// would persist until someone noticed. The allowlist costs nothing at render
// time and removes that ceiling entirely.
//
// Markdown allows raw HTML by design, so this is not theoretical even without
// a compromise - a stray <script> pasted into the editor would otherwise ship.
import sanitizeHtml from 'sanitize-html'

const OPTIONS = {
  // Everything the renderer in ./markdown.js can emit, and nothing else.
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote',
    'strong', 'em', 'del', 'sup', 'sub', 'mark',
    'ul', 'ol', 'li',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'code', 'pre', 'span', 'div',
  ],

  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'decoding', 'width', 'height'],
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
    // The renderer uses these two for the article's own presentation, and posts
    // use `swap` to mark an English word standing in for a Vietnamese one.
    div: ['class'],
    span: ['class'],
    code: ['class'],
  },

  // No javascript:, no data: - the only image sources that make sense here are
  // the site itself, Firebase Storage, and an https URL the author pasted.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,

  // Keeps a bad paste from turning into a broken page rather than silently
  // dropping the text inside an unknown tag.
  disallowedTagsMode: 'discard',

  transformTags: {
    // Any link that survives to a public page and points off-site opens safely,
    // whether the renderer added the attributes or the author wrote raw HTML.
    a: (tagName, attribs) => {
      const href = attribs.href || ''
      const external = /^https?:\/\//i.test(href) && !/(^|\/\/|\.)merid\.site/i.test(href)
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
          : attribs,
      }
    },
  },

  // Class names are attacker-controlled in the compromise scenario, so restrict
  // them to the handful the stylesheet actually defines.
  allowedClasses: {
    div: ['table-scroll'],
    span: ['swap', 'note'],
    code: ['language-*'],
  },
}

/**
 * @param {string} html Output of toHtml() from ./markdown.js.
 * @returns {string} The same HTML with anything outside the allowlist removed.
 */
export function sanitizeArticleHtml(html) {
  if (!html) return ''
  return sanitizeHtml(html, OPTIONS)
}
