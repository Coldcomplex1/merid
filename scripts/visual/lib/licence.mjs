// Which licences let this project ship a cropped copy of a photograph.
//
// Its own file because it is the one rule here with consequences outside the
// repository, and because it has to be testable without running a stage: a
// licence check that is only exercised by a two-hour fetch is a licence check
// nobody exercises.

/**
 * Whether a licence lets this project ship a cropped copy of the picture.
 *
 * Refuse first, then allow, and anything the allow-list does not recognise is
 * refused too. A licence check that fails open is not a check.
 *
 * The three refusals are not difficulty, they are obligations this project has
 * decided not to take on:
 *
 *   -SA  share-alike. Every picture here is cropped to 320x160 and re-encoded,
 *        which makes it a derivative work, which would put the .avif files
 *        themselves under CC BY-SA. That is a real commitment about the
 *        package, not a line in a credits table.
 *   -ND  no derivatives. Cropping is precisely what -ND forbids.
 *   -NC  non-commercial. The extension is free, but it lives on a commercial
 *        store, and that is a grey area not worth walking into for a picture.
 *
 * What is left - CC0, public domain, and plain CC BY - is redistributable, and
 * CC BY's price is attribution: author, licence, a link to each, and saying
 * that the picture was changed. All four are carried through to the package's
 * own credits (vis/CREDITS.json and the Settings page); THIRD-PARTY.md is where
 * that promise is written down.
 *
 * Both archives run their own filter server-side and both are asked to. This
 * still re-checks what came back, because the question is what licence the FILE
 * carries, not what a search engine believed when it indexed it.
 */
export function acceptableLicence(text) {
    const t = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!t) return false;
    // NC/ND/SA in any spelling: "CC BY-SA 4.0", "CC BY-NC-ND 2.0", "BY_SA".
    if (/\b(BY)?[-_ ]?(SA|ND|NC)\b/.test(t)) return false;
    // PEXELS is here because all three sources have to answer to the same
    // function. It was not, once, and the Pexels pictures already in the
    // package were shippable by the rule everyone believed in and refused by
    // the rule as written - which is how a check ends up not covering the
    // source it matters most for.
    return /^(CC0|CC-0|PUBLIC DOMAIN|PDM|PD\b|CC BY\b|BY\b|PEXELS)/.test(t);
}

/**
 * A link to the licence itself, when the archive did not hand one over.
 *
 * CC BY obliges us to name the licence AND point at it - a reader who wants to
 * know what they are allowed to do with a picture has to be able to go and
 * read the terms. Both archives usually supply the URL; this covers the ones
 * that do not, from the licence code they did supply.
 *
 * Returns '' rather than a guessed URL when the code is not one of the three
 * shapes below. An empty credit is honest; a link to the wrong licence is not.
 */
export function licenceDeed(code, version) {
    const c = String(code || '').toLowerCase().trim();
    const v = String(version || '').trim() || (c.match(/([\d.]+)\s*$/) || [])[1] || '4.0';
    if (/^cc0|^cc-0/.test(c)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
    if (/^pdm|public domain/.test(c)) return 'https://creativecommons.org/publicdomain/mark/1.0/';
    // Plain BY only. acceptableLicence has already refused the rest, and a deed
    // URL for a licence we do not ship would be a link nobody should follow.
    if (/^(cc )?by$/.test(c.replace(/[\d.\s]+$/, '').trim())) {
        return 'https://creativecommons.org/licenses/by/' + v + '/';
    }
    // Pexels writes its own licence rather than using a Creative Commons one,
    // and it has a stable page for it. Named here with the others so that
    // "which licences can we point a reader at" has exactly one answer.
    if (c === 'pexels') return 'https://www.pexels.com/license/';
    return '';
}

