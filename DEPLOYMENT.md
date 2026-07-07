# Publishing this site (Vercel)

The site is hosted on [Vercel](https://vercel.com). Vercel watches this GitHub repository:
every time the `main` branch changes, it automatically rebuilds the site and puts the new
version online in about a minute. You never need to "upload" anything manually.

---

## One-time setup (~5 minutes)

You only ever do this once.

1. **Create the account.** Go to <https://vercel.com/signup> and click **Continue with GitHub**.
   Log in with the GitHub account that owns this repo (`Coldcomplex1`) and click **Authorize**.
   Choose the free **Hobby** plan if asked.

2. **Give Vercel access to the repo.** On the Vercel dashboard, click **Add New… → Project**.
   Under *Import Git Repository*, if you don't see `merid` listed, click
   **Install GitHub App / Adjust GitHub App Permissions** and grant Vercel access to the
   `merid` repository (or to all your repositories, your choice).

3. **Import the project.** Back on the *Add New Project* screen, click **Import** next to
   `Coldcomplex1/merid`.

4. **Check the settings (they should already be correct).** Vercel auto-detects everything:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
   - Environment Variables: none needed

   Don't change anything, just click **Deploy**.

5. **Wait ~1 minute.** When the confetti screen appears, your site is live. The URL looks like
   `https://merid.vercel.app` (or `merid-xxxx.vercel.app` if the name is taken). Click
   **Continue to Dashboard** → the URL is shown under *Domains*.

6. *(Optional)* **Nicer address:** Project → **Settings → Domains** lets you rename the free
   `*.vercel.app` subdomain or attach a custom domain you own (e.g. `merid.vn`).

---

## Activating the waitlist (one time, ~3 minutes)

The waitlist form submits to [Formspree](https://formspree.io), a free form backend.
**Until you connect it, submissions show a success message but are NOT stored anywhere**
(a browser console warning reminds you of this).

1. Create a free account at <https://formspree.io/register>.
2. Click **+ New form**, name it e.g. "Merid waitlist", and create it.
3. Copy the form's endpoint URL. It looks like `https://formspree.io/f/xyzabcde`.
4. Open **`src/config.ts`** in this repo and replace the placeholder value of
   `WAITLIST_FORM_ENDPOINT` with your URL (the comment in that file marks the exact spot).
5. Commit and push to `main`. Done: every signup now appears in your Formspree
   dashboard, with optional email notifications and CSV export.

The endpoint URL is public by design (it is not a secret key), so keeping it in the
frontend code is safe and is how Formspree is meant to be used.

---

## Making an edit and putting it online again

After the one-time setup, the rule is simply:

> **Whatever lands on the `main` branch of GitHub goes live automatically.**

Pick whichever editing style you like:

### Option A: Ask Claude
Tell Claude what to change. When Claude commits and pushes the change to `main`,
Vercel picks it up and the live site updates ~1 minute later. Nothing else to do.

### Option B: Edit on your own computer
```bash
git clone https://github.com/Coldcomplex1/merid.git   # first time only
cd merid
npm install                                            # first time only

npm run dev        # opens a live preview at http://localhost:5173
# ... edit files in src/ , save, and the preview updates instantly ...

git add -A
git commit -m "Describe what you changed"
git push origin main                                   # <-- this publishes it
```

### Option C: Quick text change in the browser
On <https://github.com/Coldcomplex1/merid>, open any file, click the **pencil icon**,
make the change, and click **Commit changes** (directly to `main`). Vercel redeploys
automatically.

### Checking a deploy
The Vercel dashboard → your project → **Deployments** shows every publish with a
✅ Ready / ❌ Error status and full build logs. If a deploy fails, the live site keeps
serving the previous good version. Broken code never replaces the working site.

### Bonus: preview before publishing
If you push changes to a **branch** and open a Pull Request instead of committing to
`main`, the Vercel bot comments on the PR with a private **preview URL** so you can
look at the result online before merging it into the live site.

---

## Where things live

| What | Where |
|---|---|
| Page sections (hero, demo, features…) | `src/components/sections/` |
| Popup card / extension panel / browser mockup | `src/components/ui/` |
| Vocabulary words & demo sentence | `src/data/vocab.ts` |
| Colors, fonts, animations | `src/index.css` |
| Page title & meta description | `index.html` |
