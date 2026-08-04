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

### What one project actually gives you

Only text-out models can answer a context check. From a current free-tier
project:

| Model | Requests/min | Requests/day |
| --- | --- | --- |
| Gemini 3.1 Flash Lite | 15 | **500** |
| Gemini 3.5 Flash Lite | 15 | **500** |
| Gemini 2.5 Flash Lite | 10 | 20 |
| Gemini 2.5 / 3 / 3.5 / 3.6 Flash | 5 each | 20 each |

That is roughly **1,100 requests per day per project**, almost all of it from
the two Flash Lite models. At 50 checks/day per signed-in reader that is about
**22 readers per project per day**; ten projects, about 220.

The proxy does not hardcode any of these names. It asks each key which models
it can actually run (`GET /v1beta/models`), ranks the answer, and re-checks
hourly - so a model Google adds or retires needs no code change. Non-text
models (TTS, image, embedding, computer-use) are filtered out.

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

## 4. Set the Vercel environment variables

Vercel project → **Settings → Environment Variables**. Add all of these for
**Production** (and Preview, if you test there), then redeploy.

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEYS` | Your keys, comma-separated. Add more any time - no redeploy of the extension needed. |
| `UPSTASH_REDIS_REST_URL` | From step 2. |
| `UPSTASH_REDIS_REST_TOKEN` | From step 2. |
| `FIREBASE_PROJECT_ID` | `merid-49dd5` - the proxy rejects tokens issued for any other project. |
| `MERID_LIMIT_SIGNED_IN` | Optional, default `50`. |
| `MERID_LIMIT_ANONYMOUS` | Optional, default `20`. |

`GEMINI_API_KEYS` is a real secret. It exists only here.

---

## 5. Check it works

```bash
curl -i -X POST https://merid.site/api/check \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"word":"abolish","original":"bãi bỏ","sentence":"Bãi bỏ quy định cũ."}]}'
```

Expect **401 `unauthorized`** - no token was sent. That single response already
proves the function deployed, is reachable, and is not open to the public.

For the real path: load the extension, open a Vietnamese page, and watch
Settings → *AI context check*. It shows how many checks are left today.

---

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
