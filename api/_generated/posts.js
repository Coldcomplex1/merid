// GENERATED FILE, DO NOT EDIT.
// Written by scripts/prerender.mjs from the frontmatter in src/content/blog.
// Regenerate with: npm run blog:manifest
//
// This is committed so the publish-queue and cron endpoints can read the
// schedule at runtime. Serverless functions cannot reliably reach src/content
// on the deployed filesystem, and generating it during the build would race
// function bundling.
export const posts = [
  {
    "slug": "fixture-live",
    "lang": "en",
    "translationKey": "fixture-live",
    "title": "Published fixture post",
    "publishAt": "2026-01-01",
    "url": "https://merid.site/en/blog/fixture-live"
  },
  {
    "slug": "fixture-live",
    "lang": "vi",
    "translationKey": "fixture-live",
    "title": "Bài fixture đã đăng",
    "publishAt": "2026-01-01",
    "url": "https://merid.site/blog/fixture-live"
  },
  {
    "slug": "fixture-pending",
    "lang": "en",
    "translationKey": "fixture-pending",
    "title": "Unpublished fixture post",
    "publishAt": "2099-01-01",
    "url": "https://merid.site/en/blog/fixture-pending"
  },
  {
    "slug": "fixture-pending",
    "lang": "vi",
    "translationKey": "fixture-pending",
    "title": "Bài fixture chưa tới ngày đăng",
    "publishAt": "2099-01-01",
    "url": "https://merid.site/blog/fixture-pending"
  }
]

export default posts
