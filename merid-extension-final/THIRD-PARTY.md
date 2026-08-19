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
| [Openverse](https://openverse.org) | CC0 1.0, Public Domain Mark |
| [Wikimedia Commons](https://commons.wikimedia.org) | CC0, Public Domain only — read from each file's own licence metadata |
| [Pexels](https://pexels.com) | Pexels Licence |

None of these obliges us to credit anybody. `vis/CREDITS.json` records the
source, licence, author and original URL of every picture anyway, and the
Settings page shows it: a picture whose provenance we cannot state is one we
should not have shipped.

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
