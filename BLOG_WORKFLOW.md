# The Merid blog

Everything you need to run the blog, written so you can follow it months from
now having forgotten all of it.

**Nothing publishes itself.** A post goes live when you press Publish, and at no
other time. There is no schedule, no cron job, and no automation anywhere in this
system.

**Every published post exists in both languages.** A topic is the unit that goes
live: the Vietnamese post and the English one, together. Publish publishes both,
Unpublish unpublishes both, and the database itself refuses a lone published
post — not just the admin screen.

| I want to… | Go to |
|---|---|
| Write and publish a post | [2. Posting](#2-posting-every-time) |
| Add a picture | [3. Images](#3-images) |
| Have Claude write a post | [4. Claude](#4-using-claude-to-write-a-post) · [5. The prompt](#5-the-reusable-claude-prompt) |
| Fix or remove a post | [6. Editing, unpublishing, deleting](#6-editing-unpublishing-deleting) |
| Understand something odd | [8. Troubleshooting](#8-troubleshooting) |
| Set this up for the first time | [1. One-time setup](#1-one-time-setup) |

---

## 1. One-time setup

You do this **once**. When it is done, never come back to this section.

### 1.1 Find your Firebase user ID

1. Sign in at [merid.site/login](https://merid.site/login) with the account you
   want to write posts from. If you have never signed up, do that first.
2. Open the [Firebase console](https://console.firebase.google.com/) and pick the
   **merid** project.
3. Left sidebar → **Build → Authentication → Users**.
4. Find your email in the list. The long string in the **User UID** column is
   your UID. Copy it.

It looks something like `k3Jd8Fh2mNp0QrS...`. It is not a password and not
secret, but it is the thing that identifies you to the rules.

### 1.2 Make yourself an admin

1. Left sidebar → **Build → Firestore Database**.
2. Click **Start collection** (or the **+** next to the collection list if you
   already have collections).
3. Collection ID: **`admins`** exactly, lowercase, plural.
4. Document ID: **paste your UID from step 1.1**. Do not let it auto-generate one.
5. Add one field so the document is not empty:
   field `grantedAt`, type `string`, value today's date.
6. **Save**.

That document's existence *is* your admin access. There is no UID anywhere in the
code, which means granting or revoking access is this one action and never a
deploy.

**This document does nothing on its own.** Until you finish 1.4, no rule permits
anyone to read it, so the admin still refuses you. Creating the document and
deploying the rules are two halves of one step — do both, then check.

**Check it worked** *(after 1.4, not before)*: go to
[merid.site/admin/blog](https://merid.site/admin/blog). You should see the admin
screen with an empty post list.

The screen names its own cause when it refuses:

| What it says | What is wrong | Fix |
|---|---|---|
| **The security rules are not deployed** | Firestore will not answer the admin question at all. Your document is probably fine. | Do 1.4. |
| **Not an admin account** | Firestore answered: no document for this UID. The ID does not match — usually a stray space from pasting, or a Firebase auto-generated ID. | Recreate it with the exact UID the screen prints. |
| **Could not reach Firestore** | The check never completed. Not a verdict about your account. | Check the connection or a blocking extension, then reload. |

### 1.3 Cloudinary, for image uploads *(optional)*

**Skip this and the blog still works.** Everything except the Upload button
works without it, and you can add images by committing them — see
[3. Images](#3-images). Come back when committing images starts to annoy you.

Images do not live in Firebase. Cloud Storage now requires a billing account
(the Blaze plan) even to store a single file, and a blog does not need a billing
relationship to hold a dozen screenshots. Cloudinary's free tier needs no card.

1. Sign up at [cloudinary.com](https://cloudinary.com/users/register_free).
2. From the dashboard copy three values: **Cloud name**, **API Key**, **API
   Secret**.
3. Vercel dashboard → project **merid** → **Settings** → **Environment
   Variables**. Add each row: paste Key, paste Value, tick the environments,
   **Save**.

   | Key | Value |
   |---|---|
   | `CLOUDINARY_CLOUD_NAME` | your cloud name |
   | `CLOUDINARY_API_KEY` | your API key |
   | `CLOUDINARY_API_SECRET` | your API secret |
   | `FIREBASE_PROJECT_ID` | `merid-49dd5` — already set if the AI proxy is running |
   | `CLOUDINARY_SIGNATURE_ALGORITHM` | *(leave unset)* `sha1` unless Cloudinary has switched your account to `sha256` |

   **Which environments to tick:** **Production** is the one that matters —
   it is `merid.site`, and leaving it unticked is the single most common way to
   end up with variables that exist but never arrive. Tick **Preview** as well
   so branch deploys behave the same. **Development** only affects
   `vercel dev` on your own machine and can be left alone.

   **Do not wrap values in quotes.** Vercel stores the value literally, so
   `"abc123"` makes the quote marks part of the secret and every signature
   comes out wrong. Same trap as `GEMINI_API_KEYS` in `docs/AI_PROXY_SETUP.md`.

4. **Redeploy — this is not optional.** Environment variables only reach a
   build that starts *after* they are saved; the running deploy cannot see
   them. **Deployments → the top one → ⋯ → Redeploy.**

**The secret goes in Vercel and nowhere else.** Not in the repo, not in a
`VITE_` variable, not pasted into a chat. Anything named `VITE_*` is compiled
into the JavaScript that every visitor downloads, which for a secret means
publishing it.

That is the whole reason `/api/blog-upload-signature` exists. The browser cannot
upload on its own: it asks that endpoint, which verifies your Firebase ID token,
checks `admins/{uid}`, and returns a signature good for one file in one folder.
Cloudinary's simpler option — an unsigned upload preset — would put the
credentials in the bundle instead, where anyone reading it could upload to the
account from `curl`. Same admin list as everything else, still defined in exactly
one place.

### 1.4 Deploy the security rules

`firestore.rules` does nothing until it is uploaded. **Until you do this, the
admin refuses you** no matter how correct your `admins` document is.

```bash
npm install -g firebase-tools     # once, if you do not have it
firebase login
firebase deploy --only firestore:rules
```

**Check it worked:** in the Firebase console, **Firestore Database → Rules**
should show a `match /posts/{postId}` block.

No storage rules to deploy — images are Cloudinary's problem now, and
`firebase.json` no longer mentions storage. (A `firebase deploy` naming
`storage` fails on a project without Storage enabled, which is why it is gone.)

### 1.5 Tell Google the site exists

1. Go to [Google Search Console](https://search.google.com/search-console) and
   add + verify `merid.site`.
2. **Sitemaps → submit `sitemap.xml`.** Once. Google re-crawls it by itself
   afterwards, and `robots.txt` carries a `Sitemap:` line as a second signal.

There is no ping step to automate here. Google retired its sitemap ping endpoint
in 2023 and it now returns 404, and the Indexing API only accepts job postings
and broadcast events. Anything claiming otherwise is calling a dead URL.

**Setup is done. You never need this section again.**

---

## 2. Posting, every time

The whole loop, start to finish.

### 2.0 The shape of the work

You write **two posts per topic**, and they publish together. In practice:

1. Write the Vietnamese post, **Save draft**.
2. Write the English post, pick the same **Topic**, **Save draft**.
3. **Publish both.**

Neither can go live alone. Saving drafts one at a time is fine and expected —
that is how you build up to a pair.

### 2.1 Open the admin

[merid.site/admin/blog](https://merid.site/admin/blog) → **+ New post**.

### 2.2 If you have a draft from Claude, paste it

The **Paste a draft** box at the top takes the whole block Claude gives you and
fills every field at once. Paste, press **Fill the form**, done. Skip to 2.4.

Plain Markdown works too and simply lands in the body.

### 2.3 Otherwise fill the fields

**Title** — what the post is called. Keep it under 60 characters or Google cuts
it; the counter underneath turns amber when you go over.

**Slug** — fills in automatically from the title and handles Vietnamese properly,
so *Học từ vựng tiếng Anh* becomes `hoc-tu-vung-tieng-anh`. Change it if you want,
but do it now: **the slug is frozen once the post is created**, because it is the
post's address and changing it would break every link that already points there.

**Language** — `vie` or `en`. Also frozen after creation.

**Excerpt** — two or three sentences. This does more work than it looks: it is the
card text on `/blog`, it is the meta description if you leave the SEO field blank,
and it is rendered in a highlighted box above the article. That box is the first
prose on the page, which is what an AI search result quotes. Write it as a direct
answer to the question in your title.

**Cover image** — see [section 3](#3-images).

**Topic** — the field that pairs this post with its other-language version. On
the first post of a pair, press **Start a new topic from the title**. On the
second, choose the first from the dropdown. Until both exist, Publish stays
disabled and says why.

**Tags** — comma separated. They show on the card and become `keywords` in the
structured data.

**Content** — Markdown. See 2.5.

**SEO** (collapsed) — SEO title and description default to the title and excerpt,
so only fill them if you want something different. Canonical URL is for when the
piece was published somewhere else first.

### 2.4 Writing the body

Markdown. `##` for section headings, `**bold**`, `[text](url)`, `- ` for bullets,
and `|` tables.

Two habits that matter more than anything else in this file:

- **Phrase every `##` heading as a question someone would actually type.**
- **Answer it in the first 40 to 60 words underneath**, before any build-up.

That is what gets a paragraph lifted into an AI Overview or a featured snippet.
Everything else on the page is a distant second.

### 2.5 Preview

Press **Preview**. It renders through the same Markdown renderer the live page
uses, so what you see is what ships. Check the tables, check the images loaded,
check nothing is a wall of text.

### 2.6 Save a draft

**Save draft.** The post now exists but is invisible: its URL returns 404, it is
absent from `/blog`, and it is not in the sitemap. Nobody can reach it, including
by guessing the URL.

Come back to it any time from the admin list.

### 2.7 Publish

**Publish both.** Only available once the topic has both languages.

Both posts are live immediately at `merid.site/blog/vie/your-slug` and
`merid.site/blog/en/your-slug` — brand-new URLs were never cached, so there is
nothing stale to wait for.

Open both and check them on a phone.

### 2.8 The one timing surprise

Editing a post that is **already published** can take **up to five minutes** to
show, because the rendered page is cached at the CDN. Nothing is broken; wait it
out. A brand-new post has no such delay.

---

## 3. Images

The fiddliest part, so it gets its own section.

### 3.1 Uploading

Two upload buttons, and they do different things:

- **Upload** next to the Cover image field → sets the post's cover, which appears
  on the card on `/blog` and as the social sharing preview.
- **Insert image** above the content box → drops an image into the article **at
  your cursor**, so position the cursor first.

Both accept any image file and give you a URL back automatically. They need
Cloudinary configured (1.3); without it they report exactly which environment
variable is missing rather than just failing.

**If you have not set up Cloudinary,** use one of the two routes below instead —
both work with nothing configured:

- **Commit the image.** Drop the file in `public/blog/`, push, and type the path
  into the image field: `/blog/your-image.png`. Vercel serves it. This costs a
  deploy per image, which is the only thing the Upload button buys you.
- **Paste any URL** the image already lives at (3.5).

### 3.2 Size, which is the thing people get wrong

Anything wider than 1600px is automatically shrunk before upload, so you cannot
easily wreck the page. But it is still worth exporting sensibly:

- **Cover images:** 1200 × 630. That is the size social previews want.
- **In-article screenshots:** whatever is natural, up to about 1600px wide.
- **Keep files under ~500 KB** where you can.

Oversized images are the single easiest way to make a fast blog feel slow. The
hard ceiling is 5 MB and you should never get near it.

### 3.3 Alt text is the caption

Merid renders an image's alt text as a **visible caption underneath it**. So write
it as a caption, not as a bare label:

- Good: `Bài VnExpress với từ vẻ đẹp được thay bằng pulchritude`
- Bad: `screenshot1`

One sentence that describes what someone is looking at serves both the reader and
a screen reader, and saves writing the same thing twice.

### 3.4 Images already in the repo

Eight screenshots are committed and always available. Type the path straight into
the field, no upload needed:

| Path | Shows |
|---|---|
| `/blog/screenshots/landing-hero.png` | The site hero with the ELABORATE card |
| `/blog/screenshots/wikipedia-amalgamate.png` | Real vi.wikipedia, AMALGAMATE card open |
| `/blog/screenshots/vnexpress-pulchritude.png` | VnExpress, PULCHRITUDE, full side panel |
| `/blog/screenshots/facebook-captivate.png` | Facebook dark mode, AI context check visible |
| `/blog/screenshots/sidepanel-facebook.png` | Settings panel beside a Facebook page |
| `/blog/screenshots/my-deck.png` | A real deck: 25 words, 15 learning, 10 known |
| `/blog/screenshots/no-flashcards.png` | The "no flashcards first" card |
| `/blog/screenshots/merid-banner.png` | Wide 1400 × 560 banner |

### 3.5 An image hosted somewhere else

Paste the full `https://…` URL into the field. It works, but the image is then
someone else's to delete.

---

## 4. Using Claude to write a post

1. Give Claude your idea, notes, links, or a rough draft, using the prompt in
   [section 5](#5-the-reusable-claude-prompt).
2. Claude returns one structured block: title, slug, excerpt, SEO fields, tags,
   a cover image idea, and the article.
3. **You read it.** Check anything that sounds like a fact. Claude marks things it
   could not verify as `TODO_STAT` — resolve those or cut the sentence.
4. Open [merid.site/admin/blog](https://merid.site/admin/blog) → **New post**.
5. Paste the whole block into **Paste a draft** → **Fill the form**.
6. Add a cover image.
7. **Preview.**
8. **Publish.**

Claude never publishes anything, never touches the site, and has no access to
Firestore. It writes text and hands it to you. Step 8 is always yours.

---

## 5. The reusable Claude prompt

Copy everything in the block below, paste it to Claude, then add your idea at the
end.

````text
You are Merid's blog writer.

MERID, THE PRODUCT
Merid is a free Chrome extension for Vietnamese speakers learning English. While
you read ordinary Vietnamese pages (VnExpress, Tuổi Trẻ, Vietnamese Wikipedia,
Facebook), it swaps a small number of Vietnamese words for their English
equivalents, so everyday reading becomes vocabulary practice with no separate
study session. Word replacement runs locally on the reader's own machine. An
optional AI context check verifies a substituted word genuinely fits its
sentence. It ships three word lists: SAT (988 words), C1 (1,379) and C2 (977).
It is free, and it was built by one person.

WHO IS WRITING
Van Quyet Doan, a student in Ho Chi Minh City, writing in first person singular
as the person who built Merid. Never "we", never "our team". There is no team.

VOICE
- Plain, direct, specific. Short sentences. No marketing register.
- Never open with scene-setting like "In today's fast-paced world".
- Vietnamese posts: spoken register, use "mình" for I. NO EM DASHES. Avoid colons
  in prose. Do not translate word-for-word from English phrasing; write the way a
  Vietnamese student actually talks.
- English posts are a REWRITE for a different reader, not a translation of the
  Vietnamese. Different examples and framing are correct and expected.
- Being honest about what Merid does worse than an alternative makes the post
  more credible, not less. Say it plainly when it is true.

HARD RULES, THESE MATTER MOST
- NEVER invent a statistic, study, citation, install count, price, review, or
  competitor feature. If you cannot verify a number, write
  `TODO_STAT: <what to check>` and write the sentence around it.
- NEVER state a competitor's features or language support as fact from memory.
  Attribute it ("Toucan's published list includes…") and tell the reader where to
  check for themselves.
- Do not claim personal experiences I have not described to you. You may use:
  student in Ho Chi Minh City, built Merid solo, quit every vocabulary app
  previously downloaded. Anything more specific must come from my notes.
- Include at least one thing only I could have written: a real detail from the
  product, a design decision and why, or something from my notes.

STRUCTURE
- Every `##` heading is a question a reader would type into a search box.
- The first 40 to 60 words under each heading answer that question directly,
  before any elaboration. This is the single most important formatting rule.
- 5 to 7 `##` sections. A comparison table where one genuinely helps.
- Length: Vietnamese 1200-1800 words, English 900-1400.
- EXCERPT must be a direct 40-60 word answer to the title's question. It renders
  in a highlighted box above the article and is what AI search results quote.

RETURN EXACTLY THIS FORMAT, NOTHING BEFORE OR AFTER:

TITLE: (max 60 characters)
SLUG: (lowercase, hyphens, no accents, derived from the title)
LANG: (vie or en)
EXCERPT: (40-60 words, a direct answer)
SEO TITLE: (max 60 characters)
SEO DESCRIPTION: (120-155 characters)
TAGS: (3-5, comma separated)
TRANSLATION KEY: (a shared slug, only if this pairs with a post in the other language)
COVER IMAGE IDEA: (one line describing the picture I should make or screenshot)
FAQ:
Q: (a real question a reader would ask)
A: (2-3 sentences)
Q: (another)
A: (another)
ARTICLE:
(the full article in Markdown, starting with a ## heading, no H1)

Notes on the format:
- ARTICLE comes last and everything after it is the body, so colons and headings
  inside it are safe.
- Use Markdown only: ## headings, **bold**, [links](url), - bullets, | tables |.
- For images write `![caption describing the image](TODO_SCREENSHOT: what it shows)`
  and I will replace the path. The alt text renders as a visible caption, so
  write it as one.
- Do not publish anything. Do not call any API. Do not access or modify
  merid.site. Your only job is to produce this text for me to review and publish
  myself.

MY IDEA:
[describe your topic, paste your notes, links, or rough draft here]
````

### Asking for the pair

For both languages of one topic, ask for the Vietnamese first, then say:

> Now write the English version of this. Same TRANSLATION KEY. Rewrite it for
> someone who reads English, do not translate it.

---

## 6. Editing, unpublishing, deleting

### Editing

Admin → **Edit**. Change anything except the slug and language. **Save changes.**

Live posts take up to five minutes to update because of the CDN cache. Drafts
update instantly since nothing caches them.

### Unpublish

Admin → **Unpublish both**. **Both languages** return to draft and both URLs start
returning 404 within about five minutes. Taking down only one would leave a
published post with no pair, which is the state the rule forbids.

The publish date is remembered, so republishing later restores the original date
rather than pretending the post is new.

**Anyone holding the link now gets a 404.** If the post was shared anywhere, that
link is dead until you republish. Unpublishing something that has been circulating
is worth a moment's thought.

### Delete

Admin → **Delete**. Permanent, with a confirmation. There is no undo and no
backup: the text is gone.

**Prefer Unpublish over Delete** for anything that was ever live. Unpublish is
reversible; Delete is not.

### Changing a slug

You cannot, by design. The slug is the post's address, and changing it in place
would silently break every existing link. To genuinely re-address a post: create a
new post at the slug you want, paste the content across, publish it, then
unpublish the old one.

---

## 7. The technical parts you never need to touch

Here so that when something looks strange you can tell whether it is your problem.
In normal use, none of it is.

**Where posts live.** Firestore, collection `posts`, one document per post, id
`<lang>__<slug>`. You can look at them in the Firebase console. You should not
need to edit them there, and editing them there skips the validation the admin
does.

**How a page gets built.** A request to `/blog/...` hits `api/blog-render.js`,
which reads the post from Firestore and returns finished HTML. That is the reason
this system exists in this shape: GPTBot, ClaudeBot and PerplexityBot do not run
JavaScript, so if the page were assembled in the reader's browser those crawlers
would see an empty box. Every blog page ships **zero** framework JavaScript.

**Caching.** Posts cache for 5 minutes at the CDN, listings for 1 minute. This is
the only reason an edit is not instantly visible.

**The sitemap.** `/sitemap.xml` is generated on request from whatever is published
right now. Publishing adds a post to it; unpublishing removes it. Nothing to
regenerate, ever.

**What protects drafts.** Firestore security rules, not the admin screen. A draft
is unreadable to anyone who is not an admin, including someone calling the
database API directly, so the render function *cannot* serve a draft even if it
tried. Verified by tests in `test/firestore-rules.test.mjs`.

**What enforces pairing.** The same rules. Publishing writes both languages in one
batch, and each document's rule checks — with `getAfter()`, which sees the end of
the batch — that its counterpart also ends up published. Publishing one alone is
refused by the database, so the invariant survives someone editing a document in
the Firebase console.

**Why there is a `/api/blog-health`.** A serverless function that dies while
loading reports `FUNCTION_INVOCATION_FAILED` and nothing else. That endpoint
imports nothing that can fail, so it can always answer with which part is broken.
Safe to delete once the blog has been stable for a while.

**No build step for content.** Writing a post does not deploy anything. The site
only rebuilds when you change code.

**Key files, if you or someone else ever needs them:**

| File | Job |
|---|---|
| `api/blog-render.js` | Serves every public blog URL, the sitemap and llms.txt |
| `api/_lib/blog-html.js` | Turns a post into a full HTML page |
| `api/_lib/markdown.js` | Markdown → HTML, shared by the server and the preview |
| `api/_lib/sanitize.js` | Strips anything dangerous before a page goes public |
| `api/_lib/slug.js` | Slugs, including the Vietnamese handling |
| `api/_lib/blog-config.js` | URLs, author, and the site's own strings |
| `src/pages/admin/` | The admin screens |
| `src/lib/posts.ts` | Reading and writing posts from the browser |
| `firestore.rules` | Who may do what. The real security boundary |
| `api/blog-upload-signature.js` | Authorises one image upload, holds the Cloudinary secret |
| `api/_lib/cloudinary.js` | Builds the upload signature |

**Tests:**

```bash
npm run test:api      # slugs, markdown, sanitising, rendering, upload signatures
npm run test:rules    # security rules and pairing, needs the Firebase emulator
```

---

## 8. Troubleshooting

**"Not an admin account" when I open the admin.**
Firestore answered the question, and there is no `admins/<uid>` document for this
account — so the document ID does not match your UID. The error screen shows the
UID it expected; compare it against the document ID in Firestore. A trailing
space from pasting is the usual culprit. See 1.2.

**"The security rules are not deployed" when I open the admin.**
Exactly what it says, and the usual reason a freshly created `admins` document
appears to do nothing. Firestore is refusing to let you read even your own admin
document, which only the default-deny does, so the rules in `firestore.rules`
were never uploaded. Run `firebase deploy --only firestore:rules` (see 1.4)
and reload. Do not touch the `admins` document — it is not the problem.

**I published but the post is not on /blog.**
Wait a minute and refresh; the listing caches for 60 seconds. If it is still
missing, open the admin and confirm the status says Published rather than Draft.

**I edited a live post and the change is not showing.**
Normal. Up to five minutes, because the page is cached at the CDN. Nothing is
broken and nothing needs restarting.

**The post URL returns 404.**
Either it is still a draft, or the URL is wrong. The admin list shows each post's
exact URL under its title. Note the language segment: `/blog/vie/...` not
`/blog/...`.

**Image upload says the server is missing something.**
It names the environment variable. Add it in Vercel → Settings → Environment
Variables and redeploy. See 1.3. The secret belongs there and nowhere else.

**Image upload says Cloudinary refused it.**
The message is Cloudinary's own. "Invalid signature" almost always means
`CLOUDINARY_API_SECRET` in Vercel does not match the one on the Cloudinary
dashboard — copy it again and redeploy.

**Image upload says "Invalid cloud_name" for a name that looks correct.**
Because it was correct, plus an invisible character. A trailing newline or
space survives the paste into Vercel, and Cloudinary prints the name without it,
so the error looks like it contradicts itself. The server now trims every
configuration value, so this should not recur; if it does, the value contains
something stranger than whitespace and the upload error will quote it back to
you.

**Image upload says my session expired.**
The Firebase ID token aged out while the tab sat open. Reload and retry.

**Image upload says the server did not answer in time.**
The signature request got no reply within 20 seconds. Retry once; if it repeats,
the function is failing rather than being slow — check the Vercel deployment
logs for `/api/blog-upload-signature`.

**Image upload says it timed out reaching Cloudinary.**
The image itself did not finish uploading within three minutes. Usually a weak
connection; export the image smaller and retry.

**The Upload button spins forever and never stops.**
It cannot any more, and if it ever does that is a bug worth reporting rather
than a setting to change. Every step of the upload is now bounded and every
bound reports a reason. This used to happen because the server read the request
body in a way that never finished on Vercel; the button had no failure to show,
so it just kept spinning.

**I do not want to set up Cloudinary at all.**
Then do not. Commit images to `public/blog/` and type the path into the image
field. See 3.1.

**"A post's language and slug are part of its address and cannot be changed."**
Working as intended. Create a new post instead; see section 6.

**My slug came out as something like `bai-viet-2`.**
Another post already had that slug in the same language, so a number was added to
avoid two posts fighting over one URL. Edit it before saving if you want something
different.

**A draft is visible to the public.**
It should be impossible: the rules deny it and there are tests for exactly this.
If you can genuinely reproduce it, unpublish everything and check that
`firestore.rules` was actually deployed (Firebase console → Firestore → Rules
should show a `match /posts/{postId}` block).

**Google has not indexed a post.**
Indexing takes days to weeks and is not something you can force. Confirm the post
is in `merid.site/sitemap.xml`, then use Search Console → URL Inspection →
Request Indexing. That is the whole of what is available.

**The blog looks unstyled.**
The render function could not find the site's stylesheet, which happens if
`dist/.vite/manifest.json` is missing from the deploy. Redeploy. The pages
deliberately still render rather than erroring, so this shows up as ugly rather
than broken.

**The blog shows a Vercel error, or "This Serverless Function has crashed".**
Load **[merid.site/api/blog-health](https://merid.site/api/blog-health)**. It
reports which module failed to load, whether Firestore answers, and whether the
stylesheet is deployed, in one page. That endpoint imports nothing that can fail,
so it answers even when the blog itself cannot.

**Publish is greyed out.**
The topic only has one language. Hover it and it tells you which one is missing.
Write the other version, give it the same **Topic**, save it, and Publish becomes
available. Every published post needs both languages.

**A topic is showing in red saying it breaks the pairing rule.**
It was published before that rule existed, so it is live without a counterpart.
Either write the missing language, or press **Unpublish both**. It will keep
serving until you do one of those.

**The blog renders but has no styling at all.**
`dist/blog.css` did not make it into the deploy. It is produced by
`scripts/copy-blog-css.mjs`, which runs as part of `npm run build`. Check the
Vercel build log for the `copy-blog-css` line, and check
`/api/blog-health` — it reports the stylesheet's HTTP status directly.

**Everything is broken and I want to know if it is me.**
Run `npm run test:api`. If those tests pass, the rendering and slug logic are
fine and the problem is configuration — almost always rules not deployed, or the
admin document. Then load `/api/blog-health` for the deployed side.
