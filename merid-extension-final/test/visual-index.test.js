const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/vocab-core.js');
const Visual = require('../lib/visual.js');

const ROOT = path.join(__dirname, '..');
const VIS_DIR = path.join(ROOT, 'vis');
const INDEX_FILE = path.join(ROOT, 'visual-index.json');

const VIS_BUDGET_BYTES = 6.0 * 1024 * 1024;   // must match scripts/build.js
const VIS_FILE_MAX = 9 * 1024;

// ---------------------------------------------------------------------------
// Load the datasets the way the worker does.
//
// Deliberately NOT a re-implementation. background.js's loadVocabulary reads
// each file with C.parseCSV, keeps rows C.validateEntry accepts, shapes them
// with C.normalizeEntry, and dedupes on entry.word.toLowerCase() with the FIRST
// row winning. Every one of those steps is called here, from the same module,
// so a slug computed by this test cannot drift from the slug the browser
// computes for the same entry. A private copy of the parsing would be exactly
// the kind of second implementation this feature is trying not to have.
// ---------------------------------------------------------------------------
function loadEntries(datasetKey) {
    const byWord = new Map();
    for (const file of C.getDatasetFiles(datasetKey)) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const row of C.parseCSV(text)) {
            if (!C.validateEntry(row)) continue;
            const entry = C.normalizeEntry(row, datasetKey);
            const key = entry.word.toLowerCase();
            if (key && !byWord.has(key)) byWord.set(key, entry);
        }
    }
    return Array.from(byWord.values());
}

const MODES = ['sat', 'c1', 'c2', 'all'];

function readIndex() {
    if (!fs.existsSync(INDEX_FILE)) return null;
    return Visual.parseIndex(JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')));
}

const EMPTY_INDEX = Visual.parseIndex({ v: 1, fmt: 'avif', photo: [], icon: {} });

// ---------------------------------------------------------------------------
// Glyph table
// ---------------------------------------------------------------------------

test('every concept bucket has a glyph and a hue', () => {
    for (const id of Visual.ICON_IDS) {
        assert.ok(Visual.GLYPH[id], `${id} has no glyph`);
        assert.ok(Visual.drawGlyph(id).includes('<path'), `${id} draws nothing`);
        assert.strictEqual(typeof Visual.BUCKET_HUE[id], 'number', `${id} has no hue`);
    }
    // A hue with no glyph is a bucket the mapper may hand back and the card
    // cannot draw.
    for (const id of Object.keys(Visual.BUCKET_HUE)) {
        assert.ok(Visual.GLYPH[id], `hue for unknown bucket ${id}`);
    }
});

test('the three kind glyphs are drawable but not offered to the mapper', () => {
    for (const id of Visual.KIND_IDS) {
        assert.ok(Visual.GLYPH[id], `${id} has no glyph`);
        assert.ok(Visual.drawGlyph(id).includes('<path'), `${id} draws nothing`);
        assert.strictEqual(typeof Visual.BUCKET_HUE[id], 'number', `${id} has no hue`);
        // 02b-iconmap.mjs asks the model to choose from ICON_IDS. If these were
        // in it, "kind-object" would start coming back for abstract words - a
        // worse answer than any of the 56, and indistinguishable in the index
        // from a concrete word that genuinely fell back to it.
        assert.ok(!Visual.ICON_IDS.includes(id), `${id} must not be a concept the mapper can pick`);
    }
});

test('drawGlyph refuses a bucket it does not know', () => {
    assert.strictEqual(Visual.drawGlyph('not-a-bucket'), '');
    assert.strictEqual(Visual.drawGlyph(undefined), '');
});

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

test('slug keys on the meaning, so one headword can hold two senses', () => {
    // The reason this feature keys on the definition at all. `delegate` is a
    // verb in SAT ("to hand over responsibility") and a noun in C1 ("a person
    // who is chosen to represent a group") - one abstract, one a photograph of
    // a person. Whichever a reader sees depends on their dataset setting, so a
    // headword key would be right for some readers and wrong for others.
    //
    // If someone ever "simplifies" slugFor down to the headword, this is the
    // test that stops it. It is not incidental coverage.
    const satSense = { word: 'delegate', definition: 'to hand over responsibility for something' };
    const c1Sense = { word: 'delegate', definition: 'a person who is chosen or elected to represent the views of a group of people' };
    assert.notStrictEqual(Visual.slugFor(satSense), Visual.slugFor(c1Sense));
});

test('slug survives the 29 headwords that are not plain letters', () => {
    const def = 'some definition';
    // Composed and decomposed forms of the same word must agree. Without
    // stripDiacritics the bare [^a-z0-9] strip turns NFC 'facade' into
    // "fa-ade" and NFD into "fac-ade" - two keys for one word, and a picture
    // that vanishes on whichever machine normalizes the other way.
    const nfc = Visual.slugFor({ word: 'façade', definition: def });
    const nfd = Visual.slugFor({ word: 'façade', definition: def });
    assert.strictEqual(nfc, nfd);
    assert.ok(nfc.startsWith('facade-'), nfc);

    assert.ok(Visual.slugFor({ word: 'naïve', definition: def }).startsWith('naive-'));
    assert.ok(Visual.slugFor({ word: 'e.g.', definition: def }).startsWith('e-g-'));
    assert.ok(Visual.slugFor({ word: 'largess/largesse', definition: def }).startsWith('largess-largesse-'));
    assert.ok(Visual.slugFor({ word: 'decision-making', definition: def }).startsWith('decision-making-'));
});

test('slug suffix is always four characters', () => {
    // hashToInt returns 0..2^31, whose base-36 form runs 1 to 6 characters, so
    // a naive slice would give ragged suffixes and lose spread on small values.
    for (const definition of ['', 'a', 'x'.repeat(400), 'Reduce, diminish']) {
        const slug = Visual.slugFor({ word: 'word', definition });
        assert.match(slug, /^word-[0-9a-z]{4}$/, slug);
    }
});

test('slugs do not collide across the whole corpus', () => {
    const seen = new Map();
    for (const entry of loadEntries('all')) {
        const slug = Visual.slugFor(entry);
        const prev = seen.get(slug);
        assert.ok(!prev, `slug ${slug} shared by "${prev && prev.word}" and "${entry.word}"`);
        seen.set(slug, entry);
    }
    assert.ok(seen.size > 2500, `expected the full corpus, got ${seen.size}`);
});

// ---------------------------------------------------------------------------
// visualFor
// ---------------------------------------------------------------------------

test('every entry in every dataset mode gets something to draw', () => {
    const index = readIndex() || EMPTY_INDEX;
    for (const mode of MODES) {
        const entries = loadEntries(mode);
        assert.ok(entries.length > 0, `${mode} loaded nothing`);
        for (const entry of entries) {
            const vis = Visual.visualFor(entry, index, {});
            assert.ok(vis, `${mode}: ${entry.word} got nothing`);
            assert.ok(['photo', 'icon', 'generic'].includes(vis.kind),
                `${mode}: ${entry.word} got kind ${vis.kind}`);
            assert.ok(vis.hue >= 0 && vis.hue < 360, `${entry.word} hue ${vis.hue}`);
            assert.ok(vis.angle >= 0 && vis.angle < 180, `${entry.word} angle ${vis.angle}`);
            assert.ok([0, 1, 2].includes(vis.pattern), `${entry.word} pattern ${vis.pattern}`);
            if (vis.kind === 'icon') assert.ok(Visual.GLYPH[vis.iconId], `${entry.word} -> ${vis.iconId}`);
            if (vis.kind === 'generic') assert.ok(vis.letter, `${entry.word} has no letter`);
        }
    }
});

test('a word the index has never heard of still gets a card', () => {
    // Someone's own uploaded dataset. There is no fourth state.
    const vis = Visual.visualFor({ word: 'zzunknown', definition: 'x' }, EMPTY_INDEX, {});
    assert.strictEqual(vis.kind, 'generic');
    assert.strictEqual(vis.letter, 'Z');
});

test('decoration is deterministic', () => {
    const entry = { word: 'abate', definition: 'Reduce, diminish' };
    const a = Visual.visualFor(entry, EMPTY_INDEX, {});
    const b = Visual.visualFor(entry, EMPTY_INDEX, {});
    assert.deepStrictEqual(a, b);
});

test('words in one bucket look related but not identical', () => {
    // ~56 buckets over ~1,800 abstract words is ~32 words a bucket. Hue alone
    // would make five sorrowful adjectives five identical cards, which a reader
    // reads as a bug - "the picture didn't change" - rather than as a family.
    // Angle and texture are the other two axes that stop that.
    const words = ['melancholy', 'despondent', 'morose', 'lugubrious', 'doleful', 'plaintive'];
    const entries = words.map(word => ({ word, definition: 'sad in manner or appearance' }));
    const index = Visual.parseIndex({
        v: 1, fmt: 'avif', photo: [],
        icon: { 'emotion-sorrow': entries.map(Visual.slugFor).join(' ') }
    });

    const base = Visual.BUCKET_HUE['emotion-sorrow'];
    const looks = new Set();
    for (const entry of entries) {
        const vis = Visual.visualFor(entry, index, {});
        assert.strictEqual(vis.kind, 'icon');
        assert.strictEqual(vis.iconId, 'emotion-sorrow');

        // Related: every one stays within the family's hue range.
        const delta = Math.min(Math.abs(vis.hue - base), 360 - Math.abs(vis.hue - base));
        assert.ok(delta <= 22, `${entry.word} strayed ${delta} degrees from its family`);

        looks.add(`${vis.hue}|${vis.angle}|${vis.pattern}`);
    }
    // Not identical: six words, six distinguishable cards.
    assert.strictEqual(looks.size, entries.length,
        `${entries.length} words collapsed into ${looks.size} distinct cards`);
});

test('a picture that fails to load is not asked for again', () => {
    const index = Visual.parseIndex({ v: 1, fmt: 'avif', photo: ['abate-x'], icon: {} });
    const entry = { word: 'abate', definition: 'Reduce, diminish' };
    const slug = Visual.slugFor(entry);
    const live = Visual.parseIndex({ v: 1, fmt: 'avif', photo: [slug], icon: {} });

    assert.strictEqual(Visual.visualFor(entry, live, {}).kind, 'photo');
    assert.strictEqual(
        Visual.visualFor(entry, live, { missing: new Set([slug]) }).kind, 'generic');
    void index;
});

test('three failures in a row take photos off the table for the session', () => {
    const entry = { word: 'abate', definition: 'Reduce, diminish' };
    const live = Visual.parseIndex({
        v: 1, fmt: 'avif', photo: [Visual.slugFor(entry)], icon: {}
    });
    assert.strictEqual(Visual.visualFor(entry, live, { photoFailures: 2 }).kind, 'photo');
    assert.strictEqual(Visual.visualFor(entry, live, { photoFailures: 3 }).kind, 'generic');
});

test('the index format decides the file extension, not the code', () => {
    const entry = { word: 'abate', definition: 'Reduce, diminish' };
    const slug = Visual.slugFor(entry);
    for (const fmt of ['avif', 'webp']) {
        const idx = Visual.parseIndex({ v: 1, fmt, photo: [slug], icon: {} });
        assert.strictEqual(Visual.visualFor(entry, idx, {}).file, `vis/${slug}.${fmt}`);
    }
});

test('alt text comes from the entry, costing the dataset nothing', () => {
    assert.strictEqual(
        Visual.altFor({ word: 'abate', definition: 'Reduce, diminish' }),
        'abate: Reduce, diminish');
    assert.strictEqual(Visual.altFor({ word: 'abate', definition: '' }), 'abate');
});

// ---------------------------------------------------------------------------
// Settings plumbing
//
// A setting has to be named in three separate explicit lists before a reader's
// choice actually reaches the card. background.js already carries a comment
// about the day aiCheckEnabled was missing from one of them. This is that
// comment turned into something that fails.
// ---------------------------------------------------------------------------

test('visualsEnabled is named everywhere it has to be named', () => {
    assert.strictEqual(C.withDefaults({}).visualsEnabled, true);
    assert.strictEqual(C.withDefaults({ visualsEnabled: false }).visualsEnabled, false);

    const worker = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
    const getSettings = worker.slice(worker.indexOf("case 'getSettings'"));
    const keyList = getSettings.slice(0, getSettings.indexOf(']'));
    assert.ok(keyList.includes("'visualsEnabled'"),
        "getSettings does not ask storage.sync for visualsEnabled, so the content " +
        "script will always read the default no matter what the reader chose");

    const options = fs.readFileSync(path.join(ROOT, 'options.js'), 'utf8');
    const syncKeys = options.slice(options.indexOf('const SYNC_KEYS'));
    assert.ok(syncKeys.slice(0, syncKeys.indexOf(']')).includes("'visualsEnabled'"),
        'SYNC_KEYS omits visualsEnabled, so the Settings toggle will render the ' +
        'default instead of the stored choice after a reload');
});

test('toggling the picture never rewrites the page', () => {
    // The scan picks words; this setting only changes how the card looks, and
    // the card is rebuilt on the next hover. Outside the COSMETIC set it would
    // trigger revertPage() + a rescan, rewriting the paragraph under the reader.
    const content = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
    const line = content.slice(content.indexOf('const COSMETIC'));
    assert.ok(line.slice(0, line.indexOf(')')).includes("'visualsEnabled'"));
});

// ---------------------------------------------------------------------------
// The shipped artwork
//
// Skipped wholesale until vis/ exists. The pictures arrive on their own
// schedule and a word without one wears a glyph, which is exactly why
// scripts/build.js matches them with a glob instead of a manifest - the build
// must not fail because a word has not been given a picture yet, and neither
// must this.
// ---------------------------------------------------------------------------

test('shipped artwork matches the index', { skip: !fs.existsSync(VIS_DIR) }, () => {
    const index = readIndex();
    assert.ok(index, 'vis/ exists but visual-index.json does not');

    const onDisk = new Set(fs.readdirSync(VIS_DIR)
        .filter(f => /\.(avif|webp)$/.test(f))
        .map(f => f.replace(/\.(avif|webp)$/, '')));

    for (const slug of index.photo) {
        assert.ok(onDisk.has(slug), `index promises ${slug} but vis/ has no such file`);
    }
    for (const slug of onDisk) {
        assert.ok(index.photo.has(slug),
            `vis/${slug} is shipped but nothing references it - dead weight in the package`);
    }

    for (const [, iconId] of index.icon) {
        assert.ok(Visual.GLYPH[iconId],
            `index maps a word to bucket "${iconId}", which has no glyph`);
    }
});

test('every shipped picture is reachable from some dataset mode',
    { skip: !fs.existsSync(VIS_DIR) }, () => {
        // 88 of C1's rows are shadowed by the first-wins dedupe and can never be
        // shown. A picture built for one of them is package weight no reader can
        // ever see.
        const index = readIndex();
        const reachable = new Set();
        for (const mode of MODES) {
            for (const entry of loadEntries(mode)) reachable.add(Visual.slugFor(entry));
        }
        for (const slug of index.photo) {
            assert.ok(reachable.has(slug),
                `${slug} is shipped but no dataset mode can ever resolve to it`);
        }
    });

test('artwork stays inside its size budget', { skip: !fs.existsSync(VIS_DIR) }, () => {
    let total = 0;
    for (const f of fs.readdirSync(VIS_DIR)) {
        if (!/\.(avif|webp)$/.test(f)) continue;   // CREDITS.json is exempt by design
        const size = fs.statSync(path.join(VIS_DIR, f)).size;
        assert.ok(size <= VIS_FILE_MAX, `vis/${f} is ${size}B, over the ${VIS_FILE_MAX}B cap`);
        total += size;
    }
    assert.ok(total <= VIS_BUDGET_BYTES, `vis/ is ${total}B, over ${VIS_BUDGET_BYTES}B`);
});

// ---------------------------------------------------------------------------
// The beside-the-card layout is described in two files, and it has to be the
// same layout in both.
//
// content.js chooses between beside and above from window.innerWidth, before
// the card is rendered - it cannot ask the stylesheet how wide the panel is
// going to be, because nothing has been laid out yet. So the widths live in
// both files, and the failure mode if they drift is quiet: JS decides there is
// room for a 200px panel, CSS draws a 240px one, and the card hangs off the
// side of the window on exactly the screens that were tight to begin with.
// ---------------------------------------------------------------------------
test('the aside panel is the same size in content.js and content.css', () => {
    const js = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'content.css'), 'utf8');

    const num = (src, re, what) => {
        const m = src.match(re);
        assert.ok(m, 'could not find ' + what);
        return Number(m[1]);
    };

    const cardW = num(js, /const CARD_W = (\d+)/, 'CARD_W in content.js');
    const asideW = num(js, /const ASIDE_W = (\d+)/, 'ASIDE_W in content.js');
    const gap = num(js, /const ASIDE_GAP = (\d+)/, 'ASIDE_GAP in content.js');

    // CARD_W is a copy of the tooltip's own width, and the aside layout must
    // NOT change it: the card is drawn identically whether or not a picture is
    // beside it. A .vm-tip--aside rule that sets a width would reflow it.
    const tipW = num(css, /\.vocab-master-tooltip\b[^}]*?width:\s*min\((\d+)px/s,
        '.vocab-master-tooltip width');
    assert.strictEqual(cardW, tipW, 'CARD_W must be the width the card is drawn at');
    assert.ok(!/\.vocab-master-tooltip\.vm-tip--aside\s*\{[^}]*width:/s.test(css),
        '.vm-tip--aside must not set a width - the card has to be drawn the same ' +
        'with a picture beside it as without one');

    const asideBlock = css.match(/^\.vm-aside\s*\{[^}]*\}/ms);
    assert.ok(asideBlock, 'no .vm-aside rule');
    assert.strictEqual(num(asideBlock[0], /width:\s*(\d+)px/, '.vm-aside width'), asideW,
        'ASIDE_W must be the panel width CSS draws');
    assert.strictEqual(
        num(asideBlock[0], /left:\s*calc\(100% \+ (\d+)px\)/, '.vm-aside offset'), gap,
        'ASIDE_GAP must be the gap CSS leaves between the card and the panel');

    // Out of flow, so getBoundingClientRect cannot see it and content.js has to
    // add it back when clamping. If it ever became part of the card's box the
    // clamp would double-count it.
    assert.match(asideBlock[0], /position:\s*absolute/,
        'the panel must stay out of flow, or it reflows the card');
});

test('a picture beside the card is only chosen when it fits', () => {
    const js = fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8');
    // The guard has to involve all three widths. A version that forgot the gap
    // still worked on a wide screen and clipped the panel at exactly the
    // window widths the guard exists for.
    assert.match(js, /window\.innerWidth >= CARD_W \+ ASIDE_W \+ ASIDE_GAP/,
        'the beside/above decision must be made against all three widths');
    // And it must be settled before the card is measured for positioning.
    const decide = js.indexOf('const asideFits');
    const measure = js.indexOf('tooltipElement.getBoundingClientRect()');
    assert.ok(decide > 0 && measure > decide,
        'the layout must be chosen before the card is measured, or the card is ' +
        'positioned using the size of a card that no longer exists');

    // The clamp has to account for a panel it cannot measure, on whichever side
    // the panel ended up. Clamping only the card lets the panel hang off the
    // window - and the card hides 120ms after the pointer leaves the word, so
    // there is no scrolling over to see what was cut off.
    assert.match(js, /vm-tip--aside-left/,
        'there must be a left-hand side to flip to when the right has no room');
    assert.match(js, /left \+ tRect\.width \+ padRight > window\.innerWidth/,
        'the clamp must include the panel width on the side it is on');
});

// ---------------------------------------------------------------------------
// The credits card.
//
// THIRD-PARTY.md promises that "the Settings page shows it". None of the three
// archives obliges us to credit anybody - CC0, Public Domain and the Pexels
// Licence all waive attribution - which is exactly why this is easy to let rot:
// nothing breaks and nobody complains. So the promise is checked here.
// ---------------------------------------------------------------------------
test('Settings can show where every shipped picture came from', () => {
    const html = fs.readFileSync(path.join(ROOT, 'options.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'options.js'), 'utf8');

    assert.match(html, /id="creditsCard"[^>]*\shidden/,
        'the credits card must start hidden - a checkout with no artwork would ' +
        'otherwise promise credits it does not have');
    for (const id of ['creditsSummary', 'creditsToggle', 'creditsList']) {
        assert.ok(html.includes('id="' + id + '"'), 'options.html is missing #' + id);
    }

    assert.match(js, /vis\/CREDITS\.json/, 'options.js must read vis/CREDITS.json');
    // Asked of the worker first, so an ordinary checkout does not log a failed
    // fetch to the console every time Settings is opened.
    const ask = js.indexOf("action: 'getVisualIndex'");
    const fetchAt = js.indexOf("'vis/CREDITS.json'");
    assert.ok(ask > 0 && fetchAt > ask,
        'the index must be consulted before the credits file is fetched');

    // Author names come from three public archives and are shown as-is.
    assert.match(js, /function escHtml/, 'options.js must escape credit strings');
    assert.ok(!/\+ (c\.author|who) \+/.test(js.replace(/escHtml\([^)]*\)/g, 'ESC')),
        'an author name must never reach innerHTML unescaped');
});

test('CREDITS.json is not reachable from a web page', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const exposed = (manifest.web_accessible_resources || [])
        .flatMap(r => r.resources || []);
    // The pictures have to be reachable - a content script points <img> at them.
    assert.ok(exposed.some(r => /^vis\/\*\.(avif|webp)$/.test(r)),
        'the pictures themselves must stay web-accessible');
    // Their provenance does not, and a bare vis/* would expose it to every page.
    assert.ok(!exposed.some(r => r === 'vis/*' || /CREDITS/.test(r)),
        'CREDITS.json must not be exposed to web pages - Settings reads it as an ' +
        'extension page, which needs no such grant');
});
