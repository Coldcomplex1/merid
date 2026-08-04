# Running the AI context check on Merid's own keys

The extension no longer asks every user for a Gemini API key. It calls
`/api/check` on merid.site, which holds the keys and counts each person's daily
usage. This page is how you set that up.

**Why a server at all.** A Chrome extension is a zip file on the user's disk.
Any key inside it can be read in about a minute, and a daily limit the
extension counts is a limit the user can reset by clearing storage. Moving both
to a server is the only arrangement where the keys stay yours and the limit
means something.

---

## 1. Create the Gemini keys

**Each key must be in its own Google Cloud project.** Free-tier quota is per
*project*, not per key - ten keys in one project all share one project's
allowance and buy you nothing.

For each project: <https://aistudio.google.com/apikey> → **Create API key** →
choose **a new project** each time → copy the key.

### What one key actually gives you

Verified against a real key on 2026-08-04: **31 usable text models**, and the
proxy's ranking picks `gemini-3.5-flash-lite` first. Only text-out models can
answer a context check, and the free tier splits them sharply:

| Model tier | Requests/min | Requests/day |
| --- | --- | --- |
| Flash Lite (3.5, 3.1, 2.5) | 10-15 each | **500 each** for the newest two |
| Flash (2.5, 3, 3.5, 3.6) | 5 each | 20 each |
| Pro | - | 0 on the free tier |

That is roughly **1,100 requests per day per project**, almost all of it from
the two newest Flash Lite models. At 50 checks/day per signed-in reader that is
about **22 readers per project per day**.

The proxy hardcodes none of these names. It asks each key what it can run
(`GET /v1beta/models`), ranks the answer, and re-checks hourly - so a model
Google adds or retires needs no code change. Non-text models (TTS, image,
embedding, computer-use) are filtered out.

**Check whether your keys are in the same project.** Two keys in one project
share one project's allowance and buy no extra capacity. In
<https://aistudio.google.com/apikey> each key lists its project - if they match,
create the next key with **a new project** to actually add headroom.

### How far a reader gets on their allowance

A page costs at most 3 requests, and repeat sentences are answered from a
30-day cache on the device. So 50/day is roughly **17 fresh pages a day**, and
more in practice. If that turns out to be tight, raise
`MERID_LIMIT_SIGNED_IN`; if the key pool starts running dry, lower it.

---

## 2. Create the quota store

The daily counter needs somewhere atomic to live. [Upstash](https://upstash.com)
Redis has a free tier and speaks HTTP, which a serverless function can use
without a connection pool.

1. <https://console.upstash.com> → **Create Database** → any region near your users.
2. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**.

Each check costs 2 Redis commands. The free tier allows 10,000/day, so it runs
out at roughly 5,000 checks/day - well past what the key pool can serve anyway.

---

## 3. Turn on anonymous sign-in

Readers who have not made an account still need an identity to be metered by.

Firebase console → **Authentication → Sign-in method → Anonymous → Enable**.

Without this the extension cannot get a token, and the AI check stays off for
everyone who has not signed in.

---

## 4. Deploy it on Vercel

Everything below is on <https://vercel.com/dashboard> → the **merid** project.

### 4a. Get the code onto the deployed branch

The proxy lives in `api/` on the branch
`claude/english-vocab-chrome-extension-sksk6c`. Vercel builds `main`, so the
branch has to be merged (or the Production Branch changed in
**Settings → Git**). Until then `/api/check` returns Vercel's 404 page.

`vercel.json` rewrites everything except `/api/*` to `index.html`, so the SPA
keeps working and the function stays reachable. Note that **`vercel.json`
rejects unknown keys**, including a `"//"` used as a comment - adding one fails
the deployment with a schema error before anything is built, which is why the
file has no comments in it.

### 4b. Add the environment variables

**Settings → Environment Variables.** For each row: paste the name, paste the
value, tick **Production** (and **Preview** if you test there), **Save**.

| Name | Value |
| --- | --- |
| `GEMINI_API_KEYS` | The Gemini keys, comma-separated, no spaces or quotes: `key1,key2` |
| `UPSTASH_REDIS_REST_URL` | The `https://….upstash.io` URL |
| `UPSTASH_REDIS_REST_TOKEN` | The Upstash REST token |
| `FIREBASE_PROJECT_ID` | `merid-49dd5` |
| `MERID_LIMIT_SIGNED_IN` | *(optional)* `50` |
| `MERID_LIMIT_ANONYMOUS` | *(optional)* `20` |

Two things that silently break this:

- **Do not wrap values in quotes.** Vercel stores the value literally, so
  `"key1,key2"` makes the quotes part of the key and every call 403s.
- **Use the Upstash token that can write.** Upstash offers a read-only token
  as well; the counter uses `INCR`, so a read-only token fails every request
  and - because the quota fails closed - the AI check stays off for everyone.

### 4c. Redeploy

Environment variables only reach a build that starts after they are saved.
**Deployments → the latest one → ⋯ → Redeploy.**

## 5. Check it works

Run these in order. Each one isolates a different failure.

**1. Is the function deployed?**
```bash
curl -i -X POST https://merid.site/api/check \
  -H 'Content-Type: application/json' -d '{"items":[]}'
```
Expect **`401 {"ok":false,"code":"unauthorized"}`** - no token was sent. That
already proves the function exists, is reachable, and is not open to the
public. A **404** means step 4a is not done. A **500
`server-misconfigured`** means `FIREBASE_PROJECT_ID` or the Upstash pair is
missing.

**2. Does Upstash accept the token?** (run this yourself - it needs the token)
```bash
curl -s -X POST "$UPSTASH_REDIS_REST_URL/pipeline" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '[["INCR","merid:smoke"],["GET","merid:smoke"]]'
```
Expect `[{"result":1},{"result":"1"}]`. An error mentioning permissions means
the read-only token was used - go back to 4b.

**3. Does a key still have quota?**
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?pageSize=3&key=YOUR_KEY" | head -5
```
Expect a JSON list of models.

**4. End to end.** Load the extension, open a Vietnamese news page, then
**Settings → AI context check**. It shows how many checks are left today. If it
says nothing, the extension never got an answer - re-run step 1.

## Behaviour worth knowing

- **A personal key still wins.** If a user saves their own key, it is used
  directly from their browser and never touches your endpoint or your quota.
  The UI for it is hidden (`#aiOwnKeyBlock` in `options.html`), not deleted -
  remove the `hidden` attribute to offer it again.
- **Everything fails soft.** No keys, Redis down, quota spent, endpoint
  unreachable: the extension keeps working and simply skips the check. It never
  breaks a page.
- **The quota fails closed.** If the counter cannot be reached the request is
  refused rather than served unmetered - the cost of the alternative is
  unbounded, and the cost of this is one page without an AI check.
- **Anonymous identities are resettable.** Someone who reinstalls gets a new
  uid and a fresh 20. That is the accepted trade for not forcing sign-up, and
  it is why the anonymous limit is lower than the signed-in one.

## What leaves the user's device

Per checked word: the English word, the Vietnamese it replaced, and up to 180
characters of the sentence around it - at most 20 words per request, at most 3
requests per page. Plus a short preference summary built from their own ratings
(for example "prefers C1-level words; reads mostly business").

No URLs, no page titles, no browsing history, no account details beyond the
Firebase uid the quota is counted against. This is a change from the
key-per-user setup, where snippets went straight to Google: `PRIVACY.md` and
the Chrome Web Store data disclosure need to say so.

---

## Rotate anything that has been pasted somewhere else

`GEMINI_API_KEYS` and `UPSTASH_REDIS_REST_TOKEN` are real secrets, and Vercel's
environment variables are the only place they belong. Any key that has been in
a chat, an email, a screenshot or a commit should be replaced once setup works:

- **Gemini:** <https://aistudio.google.com/apikey> → delete the old key, create
  a new one in the same project, update `GEMINI_API_KEYS`, redeploy.
- **Upstash:** console → the database → **Details → Reset token**, update
  `UPSTASH_REDIS_REST_TOKEN`, redeploy.

Rotating costs one redeploy and no downtime worth mentioning. Leaving a leaked
Gemini key live means someone else spends your daily allowance; leaving a
leaked Upstash token live means someone can clear every user's counter.
