/**
 * visual.js - the picture on the learning card, and the rules for choosing it.
 *
 * Loaded two ways, like vocab-core.js:
 *   - As a content script, straight after lib/vocab-core.js (it uses
 *     VMCore.hashToInt and VMCore.stripDiacritics). Attaches to
 *     `globalThis.VMVisual`.
 *   - As a CommonJS module in `node --test`.
 *
 * DOM-free and network-free on purpose. `visualFor` returns a plain description
 * of what to draw; content.js turns that into elements. That split is what lets
 * the tests and the dataset pipeline call the SAME slug function the browser
 * calls, rather than a copy of it that drifts.
 *
 * Two kinds of picture:
 *
 *   PHOTO   - a small AVIF bundled in vis/, for words you can point a camera at.
 *   ICON    - a glyph on a generated gradient, for words you cannot. Roughly
 *             two thirds of an academic word list is abstract, so this is the
 *             common case, not the fallback.
 *
 * and GENERIC, the first letter on a gradient, for a word the index has never
 * heard of (someone's own uploaded dataset). There is no fourth state: every
 * entry gets something.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMVisual = api;       // content-script isolated world
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const C = (typeof module !== 'undefined' && module.exports)
        ? require('./vocab-core.js')
        : (typeof globalThis !== 'undefined' ? globalThis.VMCore : null);

    // ---------------------------------------------------------------------
    // Concept glyphs
    //
    // Drawn here rather than pulled from an icon set. A set would be a
    // third-party asset to license, credit and keep in sync for the sake of
    // fifty-odd shapes that have to read at 54px on a coloured background -
    // which is a stricter brief than a general-purpose icon set is designed
    // for. These are 24x24, 2px round stroke, and deliberately plain.
    //
    // The bucket name is the API. 02b-iconmap.mjs may only answer with a name
    // from this table, and the test asserts every name in the shipped index
    // exists here - so a model inventing "sadness-2" fails the build rather
    // than showing an empty box to a reader.
    // ---------------------------------------------------------------------

    /** Inner markup of each glyph; wrapped in a shared <svg> by drawGlyph. */
    const GLYPH = {
        // -- change ------------------------------------------------------
        'growth':        'M4 20l6-7 4 4 6-9M20 8h-4M20 8v4',
        'decline':       'M4 8l6 7 4-4 6 9M20 20h-4M20 20v-4',
        'beginning':     'M12 21V9M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 12C12 9 10 7 7 7c0 3 2 5 5 5z',
        'end':           'M6 4v16M6 4h11l-2.5 4L17 12H6',
        'repetition':    'M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7M18 3v3.5h-3.5M6 21v-3.5h3.5',
        'transformation':'M5 8h9l-2.5-3M19 16h-9l2.5 3M6 14.5A3.5 3.5 0 0 1 6 8M18 9.5a3.5 3.5 0 0 1 0 6.5',
        'movement':      'M12 4v16M4 12h16M12 4l-3 3M12 4l3 3M12 20l-3-3M12 20l3-3',
        'stillness':     'M9 5v14M15 5v14',
        // -- relation ----------------------------------------------------
        'conflict':      'M4 4l16 16M20 4L4 20',
        'accord':        'M3 12h7l-2-2M21 12h-7l2 2M10 12h4',
        'connection':    'M9 12h6M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2',
        'separation':    'M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2M12 4v3M12 17v3',
        'contrast':      'M12 3a9 9 0 0 0 0 18zM12 3a9 9 0 0 1 0 18',
        'similarity':    'M10 12a5 5 0 1 0 0-.01M14 12a5 5 0 1 1 0-.01',
        'cause':         'M4 12h11M15 12l-4-4M15 12l-4 4M19 9v6',
        'result':        'M12 3v18M12 21l-4-4M12 21l4-4M5 6h14',
        // -- feeling -----------------------------------------------------
        'emotion-joy':   'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01',
        'emotion-sorrow':'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 15.5a4.5 4.5 0 0 1 7 0M9 9.5h.01M15 9.5h.01',
        'emotion-fear':  'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM12 8v4M12 15.5h.01',
        'emotion-anger': 'M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1 0 1-4 1-8z',
        'emotion-love':  'M12 20S4 15 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z',
        'praise':        'M7 21V10l5-7 1.5 1v6H20l-2 11z',
        'blame':         'M12 3L2 20h20zM12 10v4M12 17h.01',
        // -- knowing -----------------------------------------------------
        'certainty':     'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
        'doubt':         'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3 2.5v2M12 17h.01',
        'knowledge':     'M4 5v13a2 2 0 0 1 2-2h13V3H6a2 2 0 0 0-2 2zM19 16v5H6a2 2 0 0 1 0-4',
        'ignorance':     'M4 5v13a2 2 0 0 1 2-2h13V3H6a2 2 0 0 0-2 2zM11 8.5a1.5 1.5 0 1 1 1.8 1.5v1.5',
        'revelation':    'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
        'secrecy':       'M4 4l16 16M10 6.5A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7M6.6 7.6A16 16 0 0 0 2 12s3.5 6 10 6c1.5 0 2.8-.3 4-.8',
        'deceit':        'M3 8h18v3a6 6 0 0 1-6 6 3 3 0 0 1-6 0 6 6 0 0 1-6-6zM8 12h.01M16 12h.01',
        'honesty':       'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6zM9 12l2 2 4-4',
        'communication': 'M4 5h16v11H9l-5 4z',
        'silence':       'M4 5h16v11H9l-5 4zM8 8l8 8M16 8l-8 8',
        // -- amount ------------------------------------------------------
        'quantity-more': 'M4 18h16M4 13h16M4 8h7M17 5v6M14 8h6',
        'quantity-less': 'M4 18h16M4 13h16M4 8h7M14 8h6',
        'abundance':     'M5 9h14l-1.5 11h-11zM5 9l2-5h10l2 5M9 13v3M12 13v3M15 13v3',
        'scarcity':      'M5 9h14l-1.5 11h-11zM5 9l2-5h10l2 5M9 17h6',
        // -- time --------------------------------------------------------
        'time-past':     'M12 3a9 9 0 1 1-8.6 11.6M12 7v5l3 2M3 6v4h4',
        'time-future':   'M12 3a9 9 0 1 0 8.6 11.6M12 7v5l3 2M21 6v4h-4',
        'speed-fast':    'M4 7l5 5-5 5M12 7l5 5-5 5',
        'speed-slow':    'M7 3h10M7 21h10M8 3c0 4 4 5 4 9s-4 5-4 9M16 3c0 4-4 5-4 9s4 5 4 9',
        // -- structure ---------------------------------------------------
        'order':         'M4 6h16M4 12h16M4 18h16',
        'chaos':         'M4 7h9M8 12h12M4 17h7M15 7h4M4 12h1',
        'law':           'M12 3v18M7 21h10M12 6l-7 2 3 6 4-1zM12 6l7 2-3 6-4-1z',
        'restriction':   'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
        'freedom':       'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0',
        'power':         'M13 2L4 14h7l-1 8 9-12h-7z',
        'weakness':      'M13 2L4 14h4M11 22l2-8h-2M17 10h-3l1-4',
        // -- quality -----------------------------------------------------
        'beauty':        'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 4v3M20.5 5.5h-3',
        'ugliness':      'M4 6l4 3-3 3 4 3-3 3 4 3M20 6l-4 3 3 3-4 3 3 3-4 3',
        'purity':        'M12 3c4 5 6 7.5 6 10a6 6 0 0 1-12 0c0-2.5 2-5 6-10z',
        'corruption':    'M12 3c4 5 6 7.5 6 10a6 6 0 0 1-12 0c0-2.5 2-5 6-10zM9 12l2 2-1.5 2L12 18',
        'difficulty':    'M2 19h20L14 5l-4 7-2-2z',
        'ease':          'M3 7c6 0 6 10 12 10 3 0 6-2 6-5M18 10l3 2-3 2',
        'uniqueness':    'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.4 6.2L12 17l-5.6 3 1.4-6.2L3 9.5l6.4-.7z',
        'formality':     'M8 3h8l-1 4 3 14H6l3-14zM10 7h4'
    };

    /** Base hue per bucket, so words in one family look related. */
    const BUCKET_HUE = {
        'growth': 142, 'decline': 22, 'beginning': 96, 'end': 8, 'repetition': 200, 'transformation': 168,
        'movement': 190, 'stillness': 215,
        'conflict': 0, 'accord': 160, 'connection': 175, 'separation': 30,
        'contrast': 260, 'similarity': 185, 'cause': 210, 'result': 205,
        'emotion-joy': 48, 'emotion-sorrow': 222, 'emotion-fear': 275,
        'emotion-anger': 12, 'emotion-love': 340, 'praise': 45, 'blame': 18,
        'certainty': 150, 'doubt': 268, 'knowledge': 232, 'ignorance': 248,
        'revelation': 195, 'secrecy': 250, 'deceit': 288, 'honesty': 168,
        'communication': 205, 'silence': 238,
        'quantity-more': 130, 'quantity-less': 34, 'abundance': 120, 'scarcity': 40,
        'time-past': 28, 'time-future': 198, 'speed-fast': 180, 'speed-slow': 226,
        'order': 212, 'chaos': 320, 'law': 240, 'restriction': 256, 'freedom': 188,
        'power': 52, 'weakness': 300,
        'beauty': 330, 'ugliness': 88, 'purity': 192, 'corruption': 76,
        'difficulty': 16, 'ease': 165, 'uniqueness': 282, 'formality': 218
    };

    /** Hue for a word with no bucket at all (custom datasets). */
    const GENERIC_HUE = 210;

    /**
     * One glyph as SVG markup.
     *
     * `stroke="currentColor"` so the card's palette decides the colour; the
     * gradient underneath is dark enough in both schemes that white reads.
     */
    function drawGlyph(iconId) {
        const d = GLYPH[iconId];
        if (!d) return '';
        return '<svg viewBox="0 0 24 24" width="54" height="54" aria-hidden="true" ' +
            'focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" ' +
            'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
    }

    // ---------------------------------------------------------------------
    // Slugs
    // ---------------------------------------------------------------------

    /**
     * The key an entry's picture is filed under.
     *
     * Keyed on the MEANING, not the headword, and that is the whole point.
     * 520 of the 2,810 headwords carry more than one row across the three
     * datasets and 113 of those differ in part of speech - `delegate` is "to
     * hand over responsibility" in SAT and "a person elected to represent a
     * group" in C1. One picture cannot serve both, and which one a reader gets
     * depends on their dataset setting, so a headword key would be right for
     * some readers and wrong for others with nothing in the code to show it.
     *
     * The definition hash separates them. Editing a definition therefore
     * changes a slug and orphans its picture - caught by
     * test/visual-index.test.js, which is the trade: a red test rather than a
     * wrong picture.
     *
     * stripDiacritics before the a-z filter matters for the 29 headwords that
     * are not plain letters. `façade` composed is f-a-ç-a-d-e and decomposed is
     * f-a-c-<cedilla>-a-d-e; a bare [^a-z0-9] strip turns the first into
     * "fa-ade" and the second into "fac-ade". stripDiacritics normalizes to NFD
     * and removes the marks, so both arrive as "facade".
     */
    function slugFor(entry) {
        if (!entry) return '';
        const base = C.stripDiacritics(entry.word || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        // hashToInt returns 0..2^31, whose base-36 form is 1 to 6 characters.
        // Taking the FIRST four would make the suffix vary in length and lose
        // most of its spread on small values; the last four are the low digits
        // and are always four wide.
        const h4 = C.hashToInt(entry.definition || '').toString(36).padStart(4, '0').slice(-4);
        return base + '-' + h4;
    }

    /**
     * Turn the shipped JSON into the shape lookups want.
     *
     * The file stores `icon` as bucket -> space-separated slugs because that
     * way round is about three times smaller; this flips it once per tab.
     */
    function parseIndex(json) {
        const photo = new Set(Array.isArray(json && json.photo) ? json.photo : []);
        const icon = new Map();
        const groups = (json && json.icon) || {};
        for (const iconId of Object.keys(groups)) {
            for (const slug of String(groups[iconId]).split(/\s+/)) {
                if (slug) icon.set(slug, iconId);
            }
        }
        return { photo, icon, fmt: (json && json.fmt) || 'avif', v: (json && json.v) || 0 };
    }

    /**
     * What to draw for one entry, or null if the reader has pictures off.
     *
     * Pure table lookups - no I/O, nothing async, nothing that can fail. It is
     * called from a mouseover handler, so it has to be free.
     *
     * `state` carries what this tab has learned at runtime: slugs whose file
     * turned out to be missing, slugs already decoded once, and how many image
     * loads have failed in a row. Three consecutive failures reads as "this
     * browser cannot decode the format we ship" and takes photos off the table
     * for the rest of the session - which also covers a case no probe would:
     * whatever else might make every image fail at once.
     */
    function visualFor(entry, index, state) {
        if (!entry || !index) return null;
        const s = state || {};
        const slug = slugFor(entry);
        const iconId = index.icon.get(slug) || null;
        const h = C.hashToInt(slug);

        // Computed for every kind, photos included: it is what shows under the
        // skeleton while the file decodes, and it is what the box is already
        // wearing if that decode fails and content.js swaps the glyph in.
        const decor = {
            slug,
            iconId,
            letter: iconId ? null : (entry.word || '?').charAt(0).toUpperCase(),
            hue: (((iconId && BUCKET_HUE[iconId] != null ? BUCKET_HUE[iconId] : GENERIC_HUE)
                + (h % 45) - 22) % 360 + 360) % 360,
            angle: (h >> 5) % 180,
            pattern: (h >> 11) % 3
        };

        const photosOff = (s.photoFailures || 0) >= 3;
        if (!photosOff && index.photo.has(slug) && !(s.missing && s.missing.has(slug))) {
            return Object.assign({
                kind: 'photo',
                file: 'vis/' + slug + '.' + index.fmt,
                warm: !!(s.warm && s.warm.has(slug))
            }, decor);
        }
        return Object.assign({ kind: iconId ? 'icon' : 'generic' }, decor);
    }

    /** Alt text, from what the entry already carries. Costs no dataset bytes. */
    function altFor(entry) {
        const word = (entry && entry.word) || '';
        const def = ((entry && entry.definition) || '').trim();
        return def ? word + ': ' + def.slice(0, 90) : word;
    }

    return {
        GLYPH, BUCKET_HUE, GENERIC_HUE, ICON_IDS: Object.keys(GLYPH),
        drawGlyph, slugFor, parseIndex, visualFor, altFor
    };
});
