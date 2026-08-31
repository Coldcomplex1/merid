# Third-party material in Merid

Merid ships no third-party code. Everything under `lib/` is written for this
extension, there are no runtime dependencies, and no script is loaded from
anywhere but the package itself (MV3 CSP `script-src 'self'`).

Two kinds of third-party *material* are involved, one shipped and one not.

## Shipped: the pictures in `vis/`

Each picture on a learning card comes from a public archive, and every one is
under a licence that permits redistribution — a stricter requirement than "free
to use", because these files are inside the package a reader installs rather
than fetched from someone else's server.

| Source | Licences accepted |
|---|---|
| [Openverse](https://openverse.org) | CC0 1.0, Public Domain Mark, CC BY |
| [Wikimedia Commons](https://commons.wikimedia.org) | CC0, Public Domain, CC BY — read from each file's own licence metadata, never from the search index |
| [Pexels](https://pexels.com) | Pexels Licence |

**Refused, deliberately: `-SA`, `-ND` and `-NC`.** Every picture here is cropped
to 320×160 and re-encoded, which makes it a derivative work. Share-alike would
therefore put the `.avif` files themselves under CC BY-SA — a commitment about
the package, not a line in a credits table. No-derivatives forbids the crop
outright. Non-commercial is a grey area next to a commercial store, and not
worth entering for a photograph. The rule is one function,
`scripts/visual/lib/licence.mjs`, which refuses anything it does not positively
recognise.

**CC BY is accepted, and its price is attribution.** It asks for four things —
the author's name, the licence and a link to it, a link to the original, and a
statement that the work was changed — and all four ship:

| Owed | Where it is |
|---|---|
| Author | `vis/CREDITS.json`, shown in Settings → "Where the pictures come from" |
| Licence, and a link to its terms | same row, the licence name links to the deed |
| Link to the original | same row, links to the file's page at the archive |
| That the picture was changed | said once above the list: cropped to 320×160 and re-encoded |

That page is built from `vis/CREDITS.json`, which records the source, licence,
licence URL, author and original URL of every picture. A picture whose
provenance we cannot state is one we should not have shipped.

**Unsplash is deliberately not used.** The Unsplash Licence would permit the
display, but their API Terms require hotlinking through `images.unsplash.com`
and forbid redistributing the files — which is exactly what bundling does.

The concept symbols on cards for abstract words are not third-party art. They
are drawn for this extension and live in `lib/visual.js`.

## Not shipped: the concreteness norms

The dataset pipeline uses the Brysbaert concreteness ratings to decide which
words a photograph could honestly illustrate. The file is downloaded on first
run into `scripts/visual/state/` and is not part of the repository or the
package.

> Brysbaert, M., Warriner, A.B., & Kuperman, V. (2014). Concreteness ratings
> for 40 thousand generally known English word lemmas. *Behavior Research
> Methods*, 46, 904-911.

## Fonts

`fonts/` carries subsets of Inter and Outfit, both under the SIL Open Font
License 1.1.
