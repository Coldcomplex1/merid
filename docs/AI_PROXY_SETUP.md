# Running the AI context check on Merid's own keys

The extension no longer asks every user for an API key. It calls `/api/check`
on merid.site, which holds the keys and counts each person's daily usage. This
page is how you set that up.

**Two providers, in order.** Qwen (Alibaba Model Studio) answers first; Gemini
sits underneath and only sees a request when Qwen cannot serve it. Section 1
covers Gemini, section 1b covers Qwen, and either one alone is a working
deployment - a deploy with no `QWEN_API_KEYS` behaves exactly as it did before
Qwen existed.

**Handing the setup to someone else?** `HUONG-DAN-VERCEL.md` is a
click-by-click Vietnamese walkthrough of steps 2-4 for a non-developer. Fill in
the `<...>` placeholders and send it privately - the values are secrets and are
deliberately absent from the copy in this repo.

**Why a server at all.** A Chrome extension is a zip file on the user's disk.
Any key inside it can be read in about a minute, and a daily limit the
extension counts is a limit the user can reset by clearing storage. Moving both
to a server is the only arrangement where the keys stay yours and the limit
means something.

---

## 1. Create the Gemini keys (the fallback)

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

### The caps are currently counted, not enforced

While the user base is small, `api/check.js` ships **unmetered**: every reader
gets the check on every page, the per-user counter keeps running underneath,
and the limits above only describe what *would* apply. Nothing is being
withheld, so the extension says "No daily limit at the moment" rather than
"N of 50 left".

Turn metering back on by setting **`MERID_AI_METERED=1`** in the deployment -
it takes effect on the next request, no code change and no redeploy of the
extension. Do that as soon as the numbers justify it: unmetered, a single
abusive client can drain the whole key pool in an afternoon, and the counter
in Upstash (`merid:q:<uid>:<YYYY-MM-DD>`) is what tells you when that day has
come.

---

## 1b. Create the Qwen key (Alibaba Model Studio)

This is the provider that answers by default. One key is enough to start.

<https://modelstudio.console.alibabacloud.com/> → **API Keys** → create one.
It looks like `sk-…`. `QWEN_API_KEYS` takes a comma-separated list, exactly
like `GEMINI_API_KEYS`, so more keys can be added later without a code change.

### Get the region right, or nothing works

**This is the one mistake that costs an afternoon.** Model Studio runs two
separate consoles with two separate endpoints, and a key from one is a flat
**401** on the other - not a clear error, just "invalid api key" on every call:

| Console | Endpoint |
| --- | --- |
| International (Singapore) - **the default** | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| Mainland China (Beijing) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

The proxy defaults to the international endpoint. If your key came from the
mainland console, set `QWEN_BASE_URL` to the second URL. Nothing else changes.

### Which model answers

The proxy hardcodes no model names here either. It asks the key what it can run
(`GET /compatible-mode/v1/models`), ranks the answer, and re-checks hourly.
The ranking is **flash first**, then plus, then the open-weight sizes, then max,
newest version first within each tier.

Flash is not a compromise for this task - the whole job is one true/false
verdict plus at most one replacement word. It is also how the free allowance
gets spent well: **every model in the quota table carries its own 1M-token
grant**, so walking down the list multiplies the free capacity, and the walk
should start where a request costs least. Dated snapshots (`qwen3.7-max-2026-06-08`)
stay in the list below their alias for the same reason - same model, separate
grant, free fallback capacity.

Only `qwen-*` ids are used. The same account usually also serves `deepseek-*`
and `glm-*`; they are fine models, but this pool reports which model answered
and mixing them in would make that report a lie. `QWEN_MODELS="a,b,c"` overrides
the ranking with an explicit ordered list if you ever want them, or want to pin
one model while testing.

Non-text models (vl, asr, tts, image, embedding, coder, …) are filtered out, and
so are `-thinking` variants: Model Studio refuses structured output while
thinking is on, and structured output is all this endpoint asks for.

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

### 4a. The code is already on `main`

The proxy lives in `api/check.js`, merged in PR #36, so Vercel builds it with
every deploy of `main`. Nothing to do here unless the Production Branch was
changed in **Settings → Git**.

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
| `QWEN_API_KEYS` | The Model Studio keys, comma-separated, no spaces or quotes: `sk-a,sk-b` |
| `QWEN_BASE_URL` | *(optional)* only if your key is from the **mainland** console - see 1b |
| `QWEN_MODELS` | *(optional)* pin an explicit ordered list instead of the ranking |
| `MERID_AI_PROVIDERS` | *(optional)* `qwen,gemini` is the default. Set `gemini` to take Qwen out without a deploy. |
| `GEMINI_API_KEYS` | The Gemini keys, comma-separated, no spaces or quotes: `key1,key2` |
| `UPSTASH_REDIS_REST_URL` | The `https://….upstash.io` URL |
| `UPSTASH_REDIS_REST_TOKEN` | The Upstash REST token |
| `FIREBASE_PROJECT_ID` | `merid-49dd5` |
| `MERID_LIMIT_SIGNED_IN` | *(optional)* `50` - only applies while metered |
| `MERID_LIMIT_ANONYMOUS` | *(optional)* `20` - only applies while metered |
| `MERID_AI_METERED` | *(optional)* `1` to enforce the two limits above; unset = unmetered |

Two things that silently break this:

- **Do not wrap values in quotes.** Vercel stores the value literally, so
  `"key1,key2"` makes the quotes part of the key and every call 403s.
- **Use the Upstash token that can write.** Upstash offers a read-only token
  as well; the counter uses `INCR`, so a read-only token fails every write.
  Unmetered that costs you the usage record only; the moment you set
  `MERID_AI_METERED=1` the quota fails closed and the AI check stays off for
  everyone.

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
`server-misconfigured`** means `FIREBASE_PROJECT_ID` is missing (or, while
`MERID_AI_METERED=1`, the Upstash pair).

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
# Qwen - run this FIRST. A 401 here means the region is wrong, see 1b.
curl -s https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models \
  -H "Authorization: Bearer $QWEN_API_KEYS" | head -20

# Gemini
curl -s "https://generativelanguage.googleapis.com/v1beta/models?pageSize=3&key=YOUR_KEY" | head -5
```
Both expect a JSON list of models. For Qwen, `InvalidApiKey` on a key you just
copied almost always means it came from the other console.

**4. End to end, from the extension.** Load the extension, open
**Settings → AI context check → Test the AI check**. It runs one real check and
names whichever link is broken rather than just failing:

| What it says | What to fix |
| --- | --- |
| Working (model: qwen3.7-flash …) | Nothing - Qwen is answering. |
| Working (model: gemini-…) | Working, but Qwen is not answering. Check `QWEN_API_KEYS` and step 3. |
| The AI context check is switched off | The toggle above it. |
| Could not create an account for this device | Step 3 - anonymous sign-in is not enabled. |
| Could not reach the Merid AI endpoint | Not deployed, or no connection. |
| …missing its environment variables | Step 4b. |
| …cannot reach its quota store | The Upstash URL/token, step 2. |
| …every Gemini key failed | **Both** providers failed, not just Gemini - the wording is the extension's and predates Qwen. Out of quota, or the keys are wrong. Run step 3 for each. |
| …rejected this device's token | `FIREBASE_PROJECT_ID` does not match the extension's Firebase project. |

**5. The server on its own** (needs live keys, spends real quota):
```bash
QWEN_API_KEYS="sk-…" node test/manual/live-proxy.mjs                  # the default path
MERID_AI_PROVIDERS=gemini GEMINI_API_KEYS="key1,key2" node test/manual/live-proxy.mjs   # the fallback
QWEN_API_KEYS="sk-deliberately-wrong" GEMINI_API_KEYS="key1" node test/manual/live-proxy.mjs  # failover
```
Runs the real handler against the real provider with a local stand-in for
Upstash - the only check that proves the handler, the prompt, model selection
across the key pool, the quota window and token verification all work together.
It prints which provider and model answered, so the third line above should say
`gemini` and not return a 502.

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

`QWEN_API_KEYS`, `GEMINI_API_KEYS` and `UPSTASH_REDIS_REST_TOKEN` are real
secrets, and Vercel's environment variables are the only place they belong. Any
key that has been in a chat, an email, a screenshot or a commit should be
replaced once setup works:

- **Qwen:** Model Studio console → **API Keys** → delete the old key, create a
  new one, update `QWEN_API_KEYS`, redeploy.
- **Gemini:** <https://aistudio.google.com/apikey> → delete the old key, create
  a new one in the same project, update `GEMINI_API_KEYS`, redeploy.
- **Upstash:** console → the database → **Details → Reset token**, update
  `UPSTASH_REDIS_REST_TOKEN`, redeploy.

Rotating costs one redeploy and no downtime worth mentioning. Leaving a leaked
model key live means someone else spends your allowance - and on Qwen's
pay-as-you-go that is a bill, not just a quota; leaving a leaked Upstash token
live means someone can clear every user's counter.
