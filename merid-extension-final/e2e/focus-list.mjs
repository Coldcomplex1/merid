// End-to-end check of the focus list ("words in play", lib/focus.js) against a
// real Chromium with the unpacked extension loaded.
//
// The page is BUILT FROM the list rather than written by hand: the draw is
// random, so a fixed article would only exercise the feature on the days the
// dice agreed. This asks the worker what it drew, looks the Vietnamese up in
// the dataset cache, and serves a page made of exactly those phrases - plus one
// phrase for a word deliberately left OUT of the list, which is what proves the
// filter is doing anything at all.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

let PAGE = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thử</title></head><body></body></html>';
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise(r => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-focus-' + Date.now()),
    {
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (cond, label, extra = '') => (cond ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

async function until(read, timeout = 30000, step = 200) {
    const deadline = Date.now() + timeout;
    for (; ;) {
        const value = await read();
        if (value) return value;
        if (Date.now() >= deadline) return null;
        await new Promise((r) => setTimeout(r, step));
    }
}

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const extId = new URL(sw.url()).host;
check(!!extId, 'service worker booted', extId);

// Let the worker's own boot-time dataset load finish before touching storage.
await sw.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise(r => setTimeout(r, 100));
    }
});

const readFocus = () => sw.evaluate(async () => (await chrome.storage.local.get('vm_focus')).vm_focus);
const entryFor = (list, w) => (list.words || []).find(e => e.w === w);
const listWords = (list) => (list.words || []).map(e => e.w);

/** Settle the worker to a known state at `size`, and hand back the fresh list. */
async function resetTo(size) {
    await sw.evaluate(async (n) => {
        // Drain the write chain before clearing anything. A `shown` or `open`
        // flushed as the last page unloaded is still queued behind it, and an
        // event that landed AFTER this reset would credit a word in the new
        // draw for something the reader did to the old one.
        await self.focusEdit(() => null);
        await chrome.storage.sync.set({
            datasetKey: 'c1', frequency: 100, replacementMode: 'replace',
            extensionEnabled: true, aiCheckEnabled: false, focusSize: n,
            // A fresh install arms the setup wizard, and the popup hands itself
            // over to it the first time it opens - popup.html would close under
            // the checks below.
            onboardingPending: false, onboardingDone: true
        });
        await chrome.storage.local.remove(['vm_focus', 'vm_profile', 'knownWords', 'savedWords', 'vm_ai_cache']);
        await self.loadVocabulary('c1');
        await self.ensureFocus();
    }, size);
    return readFocus();
}

/**
 * Vietnamese phrases that will actually match, for the given headwords.
 *
 * The scan refuses single Vietnamese syllables (`allowSingleWord: false`), so a
 * meaning has to be at least two syllables to be worth putting on the page.
 */
async function phrasesFor(words) {
    return sw.evaluate(async (list) => {
        const cache = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        const out = {};
        for (const entry of cache.data) {
            const w = String(entry.word || '').toLowerCase();
            if (!list.includes(w) || out[w]) continue;
            const vi = String(entry.vietnamese || '').split(',')
                .map(s => s.trim()).filter(s => s.includes(' '));
            if (vi.length) out[w] = vi[0];
        }
        return out;
    }, words);
}

let list = await resetTo(25);
check(!!list && list.words.length === 25, 'a 25-word set was drawn', list && String(list.words.length));
check(!!list && list.size === 25 && list.datasetKey === 'c1', 'the set records its size and dataset');

// Three words that are in play, and one that is deliberately not.
const inPlay = await phrasesFor(listWords(list));
const inPlayWords = Object.keys(inPlay).slice(0, 3);
const outsideWord = await sw.evaluate(async (held) => {
    const cache = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
    for (const entry of cache.data) {
        const w = String(entry.word || '').toLowerCase();
        if (held.includes(w)) continue;
        const vi = String(entry.vietnamese || '').split(',')
            .map(s => s.trim()).filter(s => s.includes(' '));
        if (vi.length) return { word: w, vi: vi[0] };
    }
    return null;
}, listWords(list));

check(inPlayWords.length >= 3, 'found matchable phrases for words in play', inPlayWords.join(','));
check(!!outsideWord, 'found a dataset word left out of the set', outsideWord && outsideWord.word);

/** Serve a page carrying every phrase, one per paragraph. */
function buildPage(pairs) {
    PAGE = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thử</title></head><body>' +
        pairs.map(([, vi]) => `<p>Chúng tôi thấy rằng ${vi} là điều quan trọng trong năm nay.</p>`).join('') +
        '</body></html>';
}

buildPage(inPlayWords.map(w => [w, inPlay[w]]).concat([[outsideWord.word, outsideWord.vi]]));

/** Load the page once, read what landed, then close it (which flushes events). */
async function visit(hold) {
    const p = await ctx.newPage();
    await p.goto(origin + '/kinh-doanh/bai-viet', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const swapped = await p.$$eval('.vocab-master-highlight',
        els => els.map(e => (e.dataset.word || '').toLowerCase()));
    if (hold) await hold(p);
    // Navigating away rather than just closing: content.js flushes its queued
    // events on `pagehide`, and closing a Playwright page skips the lifecycle -
    // so every impression this test counts would be dropped before it landed.
    await p.goto('about:blank', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(250);   // let the flushed batch reach the worker
    await p.close();
    return swapped;
}

const firstVisit = await visit();
check(firstVisit.length > 0, 'words in play were swapped onto the page', firstVisit.join(','));
check(!firstVisit.includes(outsideWord.word),
    'a word outside the set was left alone', outsideWord.word);
check(firstVisit.every(w => listWords(list).includes(w)),
    'everything swapped came from the set', firstVisit.join(','));

// -----------------------------------------------------------------
// Counting, and retirement after six silent impressions
// -----------------------------------------------------------------
const tracked = firstVisit[0];
const counted = await until(async () => {
    const f = await readFocus();
    const e = entryFor(f, tracked);
    return e && e.shown >= 1 ? e : null;
});
check(!!counted, 'an impression was counted against the word', counted && `shown=${counted.shown}`);

for (let i = 0; i < 4; i++) await visit();
const atFive = await until(async () => {
    const f = await readFocus();
    const e = entryFor(f, tracked);
    return e && e.shown >= 5 ? e : null;
});
check(!!atFive, 'five impressions, still in play', atFive && `shown=${atFive.shown}`);

await visit();
const retired = await until(async () => {
    const f = await readFocus();
    return f && !listWords(f).includes(tracked) ? f : null;
});
check(!!retired, 'a sixth silent impression retires the word', tracked);
check(!!retired && retired.retired.includes(tracked), 'the retired word is remembered as retired');
check(!!retired && retired.words.length === 25, 'and a new word took its place',
    retired && String(retired.words.length));

// -----------------------------------------------------------------
// Reading the card is what saves a word from retirement
// -----------------------------------------------------------------
list = await resetTo(25);
const held = await phrasesFor(listWords(list));
const keeper = Object.keys(held)[0];
buildPage([[keeper, held[keeper]]]);

// One long hover: over OPEN_DWELL_MS, so it counts as reading the card.
await visit(async (p) => {
    await p.evaluate(() => {
        const span = document.querySelector('.vocab-master-highlight');
        if (span) span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await p.waitForTimeout(1100);
});
const acted = await until(async () => {
    const f = await readFocus();
    const e = entryFor(f, keeper);
    return e && e.acted >= 1 ? e : null;
});
check(!!acted, 'a card held open counts as interaction', acted && `acted=${acted.acted}`);

for (let i = 0; i < 8; i++) await visit();
const survivor = await until(async () => {
    const f = await readFocus();
    const e = entryFor(f, keeper);
    return e && e.shown > 6 ? e : null;
}, 40000);
check(!!survivor, 'and the word survives well past six impressions',
    survivor && `shown=${survivor.shown}`);

// A hover flicked away in under the dwell time must NOT vouch for the word.
list = await resetTo(25);
const brushed = await phrasesFor(listWords(list));
const passerby = Object.keys(brushed)[0];
buildPage([[passerby, brushed[passerby]]]);
await visit(async (p) => {
    await p.evaluate(() => {
        const span = document.querySelector('.vocab-master-highlight');
        if (span) span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await p.waitForTimeout(200);   // well under OPEN_DWELL_MS
    await p.evaluate(() => document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await p.waitForTimeout(700);
});
const brushedGone = await until(async () => {
    const f = await readFocus();
    const e = entryFor(f, passerby);
    return e && e.shown >= 1 ? e : null;
});
check(!!brushedGone && brushedGone.acted === 0,
    'a hover flicked away does not vouch for the word',
    brushedGone && `acted=${brushedGone.acted}`);

// -----------------------------------------------------------------
// Save grows the set; known frees a slot
// -----------------------------------------------------------------
list = await resetTo(25);
const deck = await phrasesFor(listWords(list));
const saveMe = Object.keys(deck)[0];
buildPage([[saveMe, deck[saveMe]]]);

await visit(async (p) => {
    await p.evaluate(() => {
        const span = document.querySelector('.vocab-master-highlight');
        if (span) span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await p.waitForTimeout(300);
    await p.click('.vocab-master-tooltip .vm-save');
    await p.waitForTimeout(300);
});
const grown = await until(async () => {
    const f = await readFocus();
    return f && f.words.length === 26 ? f : null;
});
check(!!grown, 'Save to Deck adds a word to the set', grown && String(grown.words.length));
check(!!grown && listWords(grown).includes(saveMe), 'and the saved word itself stays in play');

// These call the worker's own functions rather than posting a runtime message:
// chrome.runtime.sendMessage from a service worker never reaches that worker's
// own onMessage listener, so a send from here would silently do nothing. It is
// the same function the listener invokes.
const knownRes = await sw.evaluate(async (w) => {
    const before = (await chrome.storage.local.get('vm_focus')).vm_focus.words.length;
    await self.focusMarkLearned(w);
    const after = (await chrome.storage.local.get('vm_focus')).vm_focus;
    const known = (await chrome.storage.local.get('knownWords')).knownWords || [];
    return { before, after: after.words.length, held: after.words.map(e => e.w), known };
}, saveMe);
check(knownRes.after === knownRes.before - 1,
    'marking a word known above the base frees a slot',
    `${knownRes.before} -> ${knownRes.after}`);
check(!knownRes.held.includes(saveMe), 'the learned word left the set');
check(knownRes.known.includes(saveMe), 'and it was written to the known list', saveMe);

// At the base, the set tops itself back up instead of shrinking.
const atBase = await sw.evaluate(async () => {
    const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
    const target = f.words[0].w;
    await self.focusMarkLearned(target);
    const after = (await chrome.storage.local.get('vm_focus')).vm_focus;
    return { target, count: after.words.length, held: after.words.map(e => e.w) };
});
check(atBase.count === 25, 'marking a word known at the base refills the set', String(atBase.count));
check(!atBase.held.includes(atBase.target), 'and the learned word is still gone');

// -----------------------------------------------------------------
// The ceiling, and the badge that announces it
// -----------------------------------------------------------------
list = await resetTo(25);
const full = await sw.evaluate(async () => {
    // Save every word in play, then keep going: the set must stop at twice the
    // chosen size and not one word further.
    for (let round = 0; round < 4; round++) {
        const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
        for (const e of f.words) {
            await self.applyProfileEvents([{ word: e.w, event: 'saved' }]);
        }
    }
    const after = (await chrome.storage.local.get('vm_focus')).vm_focus;
    return after.words.length;
});
check(full === 50, 'the set stops at twice the chosen size', String(full));

const badge = await until(async () => {
    const text = await sw.evaluate(() => chrome.action.getBadgeText({}));
    return text ? text : null;
}, 10000);
check(badge === '!', 'a full set raises the toolbar badge', JSON.stringify(badge));

// The popup says so too - the badge only signals that something needs looking at.
const popup = await ctx.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
await popup.waitForTimeout(1200);
const notice = await popup.evaluate(() => {
    const el = document.getElementById('focus-full');
    return { hidden: el.hidden, text: document.getElementById('focus-full-text').textContent };
});
check(notice.hidden === false, 'the popup shows the full-set notice');
check(/50/.test(notice.text), 'and names the count it is capped at', notice.text.slice(0, 80));
await popup.close();


await sw.evaluate(async () => {
    const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
    await self.focusMarkLearned(f.words[0].w);
});
const cleared = await until(async () => {
    const text = await sw.evaluate(() => chrome.action.getBadgeText({}));
    return text === '' ? 'cleared' : null;
}, 10000);
check(!!cleared, 'and clearing a slot lowers it again');

// Raising the number is the other way out of a full set.
await sw.evaluate(async () => {
    for (let round = 0; round < 4; round++) {
        const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
        for (const e of f.words) {
            await self.applyProfileEvents([{ word: e.w, event: 'saved' }]);
        }
    }
});
const raised = await sw.evaluate(async () => {
    const before = (await chrome.storage.local.get('vm_focus')).vm_focus;
    await new Promise(r => chrome.storage.sync.set({ focusSize: 50 }, r));
    await self.ensureFocus();
    const after = (await chrome.storage.local.get('vm_focus')).vm_focus;
    return {
        beforeCount: before.words.length,
        kept: before.words.every(e => after.words.some(x => x.w === e.w)),
        size: after.size,
        count: after.words.length,
        badge: await chrome.action.getBadgeText({})
    };
});
check(raised.kept, 'raising the number keeps every word already in play',
    `${raised.beforeCount} -> ${raised.count}`);
check(raised.size === 50 && raised.badge === '', 'and the set is no longer full');

const quietPopup = await ctx.newPage();
await quietPopup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
await quietPopup.waitForTimeout(1200);
const quiet = await quietPopup.evaluate(() => document.getElementById('focus-full').hidden);
check(quiet === true, 'and the notice is gone once the set has room again');
await quietPopup.close();

// -----------------------------------------------------------------
// Resizing down, and switching to All
// -----------------------------------------------------------------
list = await resetTo(100);
const shrunk = await sw.evaluate(async () => {
    const before = (await chrome.storage.local.get('vm_focus')).vm_focus;
    // Ten words the reader has engaged with must outrank ninety they have not.
    const kept = before.words.slice(0, 10).map(e => e.w);
    for (const w of kept) {
        await self.applyProfileEvents([{ word: w, event: 'up' }]);
    }
    await new Promise(r => chrome.storage.sync.set({ focusSize: 10 }, r));
    await self.ensureFocus();
    const after = (await chrome.storage.local.get('vm_focus')).vm_focus;
    return { kept, count: after.words.length, held: after.words.map(e => e.w) };
});
check(shrunk.count === 10, 'shrinking lands on the new size', String(shrunk.count));
check(shrunk.kept.every(w => shrunk.held.includes(w)),
    'and keeps the words the reader engaged with');

// "All" puts the whole dataset back in play - the pre-1.8.0 behaviour.
await sw.evaluate(async () => {
    await new Promise(r => chrome.storage.sync.set({ focusSize: 0 }, r));
    await self.ensureFocus();
});
const allList = await readFocus();
check(!!allList && allList.size === 0 && allList.words.length === 0,
    '"All" clears the set', allList && String(allList.words.length));

buildPage([[outsideWord.word, outsideWord.vi]]);
const allVisit = await visit();
check(allVisit.includes(outsideWord.word),
    'and a word that was outside the set is swapped again', allVisit.join(','));

// -----------------------------------------------------------------
// Switching dataset redraws from the new one
// -----------------------------------------------------------------
const redrawn = await sw.evaluate(async () => {
    await new Promise(r => chrome.storage.sync.set({ focusSize: 25, datasetKey: 'c2' }, r));
    await self.loadVocabulary('c2');
    await self.ensureFocus();
    const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
    const cache = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
    const c2 = new Set(cache.data.map(e => String(e.word).toLowerCase()));
    return { key: f.datasetKey, all: f.words.every(e => c2.has(e.w)), count: f.words.length };
});
check(redrawn.key === 'c2' && redrawn.count === 25 && redrawn.all,
    'switching dataset redraws the set from the new one',
    `${redrawn.key} ${redrawn.count}`);

// -----------------------------------------------------------------
// The Settings page shows and edits the set
// -----------------------------------------------------------------
const opts = await ctx.newPage();
await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: 'domcontentloaded' });
await opts.waitForTimeout(1500);
const rows = await opts.$$eval('#focusList .custom-row-item',
    els => els.map(e => e.querySelector('.custom-name').textContent));
check(rows.length === 25, 'Settings lists every word in play', String(rows.length));
const info = await opts.$eval('#focusInfo', e => e.textContent);
check(/25/.test(info) && /50/.test(info), 'and states the count and the ceiling', info);
check(!/\bshown\b/i.test(info), 'without ever showing the reader a counter');

const rowText = await opts.$eval('#focusList .custom-row-item', e => e.textContent);
check(rowText.length > (rows[0] || '').length, 'each row carries the Vietnamese meaning');

await opts.fill('#focusFilter', rows[0]);
await opts.waitForTimeout(200);
const filtered = await opts.$$eval('#focusList .custom-row-item', els => els.length);
check(filtered >= 1 && filtered < 25, 'the filter narrows the list', String(filtered));
await opts.fill('#focusFilter', '');
await opts.waitForTimeout(200);

// "I know this" from Settings: the slot frees and the word joins knownWords.
const target = rows[0];
await opts.click('#focusList .custom-row-item .btn.mini');
const settingsKnown = await until(async () => {
    const state = await sw.evaluate(async (w) => {
        const f = (await chrome.storage.local.get('vm_focus')).vm_focus;
        const known = (await chrome.storage.local.get('knownWords')).knownWords || [];
        return { gone: !f.words.some(e => e.w === w.toLowerCase()), known: known.includes(w.toLowerCase()) };
    }, target);
    return state.gone && state.known ? state : null;
}, 15000);
check(!!settingsKnown, 'Settings can mark a word learned', target);

await ctx.close();
server.close();

console.log('\n=== PASS ===');
ok.forEach(l => console.log('  +', l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach(l => console.log('  -', l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
