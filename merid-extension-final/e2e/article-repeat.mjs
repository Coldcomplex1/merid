// The two things readers reported about a Vietnamese news article.
//
//   1. "Tổng Bí thư mà cứ suggest chữ thư." The scanner reached the last
//      syllable of a title and swapped it on its own, because it could not
//      match a phrase longer than two words - `tokenize` emits whitespace as
//      its own token, so the old [3,2,1] token windows topped out at two.
//
//   2. "Hiển thị hơi nhiều lần trong cùng 1 bài báo." The same word came back
//      again and again down one article. Duplicates are barred per post, but
//      the article was not resolving to one post: its paragraphs are wrapped in
//      <div>s holding nothing but inline markup, and those used to pass for
//      feed items - so every paragraph became its own post with its own
//      allowance and its own duplicate check.
//
// The fixture is that markup, deliberately: no <article>, no <main>, no class
// the selectors know, and a title repeated the way a news piece repeats one.
//
// The context check is off here - this is about what the scan puts on the page.
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';

const EXT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

// "thư" is a C2 Vietnamese meaning of "missive" (dataset-C2.csv); the title it sits in is not a
// dataset entry at all, which is the whole point - nothing longer covers it, so
// only the guard can stop it being swapped.
const TITLE = 'Tổng Bí thư, Chủ tịch nước Tô Lâm';
const PARAS = [
    // Bait for the lone-syllable rule, and it has to lead: the allowance is
    // three words for the whole piece and is released by depth, so a sentence
    // at the foot of the article is never reached with anything left to spend -
    // it would read as "no lone syllable swapped" whatever the rule was.
    // Offered first, one syllable at a time this sentence yields two wrong
    // words: the "tầng" of "hạ tầng" (infrastructure) is a stratum, and a bare
    // "giảm" is an abatement. Both are C2 entries and both used to be taken.
    `Ngân sách dành cho hạ tầng đã giảm trong năm nay.`,
    `${TITLE} tại sân bay quốc tế Nội Bài ngày 9/8.`,
    `Đây là lần đầu tiên ${TITLE} tới Australia trên cương vị mới.`,
    `Chuyến thăm của ${TITLE} khẳng định đường lối đối ngoại của Việt Nam.`,
    `Tại Australia, ${TITLE} sẽ dự Diễn đàn TechConnect về công nghệ.`,
    `${TITLE} cũng sẽ tới New Zealand trong khuôn khổ chuyến đi.`,
    `Hai bên nhất trí nâng cấp quan hệ lên Đối tác Chiến lược Toàn diện.`,
    `Thứ trưởng cho biết hợp tác sẽ đi vào chiều sâu, thực chất và hiệu quả.`,
    `Diễn đàn thúc đẩy liên kết giữa chính phủ, doanh nghiệp và các trường đại học.`
];

// Each paragraph is a <div> of inline runs - a <b> and a <span>, no blocks.
// This is the shape that used to be mistaken for a feed item.
const body = PARAS.map((text, i) => {
    const [head, ...rest] = text.split(' ');
    return `<div class="c" data-para="${i}"><b>${head}</b> <span>${rest.join(' ')}</span></div>`;
}).join('\n');

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bản tin</title>
<style>body{margin:0;font:17px/1.8 system-ui;padding:24px} .c{margin:0 0 18px}</style>
</head><body><div id="wrap">${body}</div></body></html>`;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/tin/bai-viet`;

const ctx = await chromium.launchPersistentContext(
    path.join(process.env.TMPDIR || '/tmp', 'merid-article-repeat-' + Date.now()),
    {
        headless: true,
        viewport: { width: 1000, height: 800 },
        executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    }
);

const fail = [];
const ok = [];
const check = (c, label, extra = '') => (c ? ok : fail).push(label + (extra ? ` -> ${extra}` : ''));

let sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
for (let i = 0; i < 60; i++) {
    if (await sw.evaluate(() => typeof chrome !== 'undefined' && !!chrome.storage).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
}
await sw.evaluate(async () => {
    for (let i = 0; i < 80; i++) {
        const c = (await chrome.storage.local.get('vm_vocab_cache')).vm_vocab_cache;
        if (c && Array.isArray(c.data) && c.data.length) return;
        await new Promise((r) => setTimeout(r, 100));
    }
});

/** Load the page at one replacement mode and report what landed on it. */
async function readPage(replacementMode) {
    await sw.evaluate(async (mode) => {
        await chrome.storage.sync.set({
            // Locked-in: the most words Merid will ever put on a page. If the
            // duplicate rules hold here they hold everywhere.
            datasetKey: 'c2', focusSize: 0, frequency: 80, replacementMode: mode,
            extensionEnabled: true, aiCheckEnabled: false
        });
        await chrome.storage.local.remove(['vm_ai_cache', 'vm_profile', 'knownWords', 'savedWords']);
        await self.loadVocabulary('c2');
    }, replacementMode);

    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.vocab-master-highlight', { timeout: 15000 }).catch(() => { });
    await page.waitForTimeout(1500);

    const spans = await page.$$eval('.vocab-master-highlight', (els) => els.map((e) => ({
        word: e.dataset.word,
        original: e.dataset.original,
        para: Number(e.closest('[data-para]').dataset.para)
    })));
    await page.close();
    return { spans, errors };
}

// --- 1. Default mode: the reported page, read the way it was reported ---
const replace = await readPage('replace');

const badSyllable = replace.spans.filter((s) => (s.original || '').toLowerCase() === 'thư');
check(badSyllable.length === 0,
    'the "thư" of "Tổng Bí thư" is left alone',
    badSyllable.length ? `${badSyllable.length} swapped` : 'none swapped');

// The general form of that, and the rule the scan now runs on: a lone syllable
// is a piece of a word, not a word, and which word it belongs to is settled by
// the syllable beside it. "thư" was the reported case; "tầng" out of "hạ tầng"
// and a bare "giảm" are the same shape, and this page carries both.
const lone = replace.spans.filter((s) => !!(s.original || '').trim() && !/\s/.test((s.original || '').trim()));
check(lone.length === 0, 'no lone syllable is swapped at all',
    lone.length ? lone.map((s) => `${s.original}→${s.word}`).join(', ') : 'every swap is a phrase');

const counts = {};
replace.spans.forEach((s) => {
    const key = (s.word || '').toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
});
const repeated = Object.entries(counts).filter(([, n]) => n > 1);
check(repeated.length === 0, 'no word is used twice in one article',
    repeated.length ? repeated.map(([w, n]) => `${w}x${n}`).join(', ') : 'all distinct');

const originals = {};
replace.spans.forEach((s) => {
    const key = (s.original || '').toLowerCase();
    originals[key] = (originals[key] || 0) + 1;
});
const repeatedVi = Object.entries(originals).filter(([, n]) => n > 1);
check(repeatedVi.length === 0, 'no Vietnamese phrase is swapped twice either',
    repeatedVi.length ? repeatedVi.map(([w, n]) => `${w}x${n}`).join(', ') : 'all distinct');

// Locked-in on a piece this short allows three (POST_WORD_CAPS, first row).
// More than that means the paragraphs were each treated as their own post.
check(replace.spans.length > 0 && replace.spans.length <= 3,
    'the article is one post, not one per paragraph',
    `${replace.spans.length} words in ${PARAS.length} paragraphs`);

check(!replace.errors.length, 'no console/page errors', replace.errors.join(' | '));

// --- 2. Highlight mode: nothing is ever swapped, so nothing can be checked ---
//
// The cap used to be enforced only by the post-check prune, which in this mode
// never had a verdict to act on - so the page kept every over-provisioned
// candidate and came out marked up far past the reader's setting. This is the
// mode the screenshot in the report was taken in.
const highlight = await readPage('highlight');
check(highlight.spans.length > 0 && highlight.spans.length <= 3,
    'highlight mode respects the same cap',
    `${highlight.spans.length} highlights`);
check(!highlight.spans.some((s) => (s.original || '').toLowerCase() === 'thư'),
    'highlight mode leaves the title syllable alone too');
check(!highlight.errors.length, 'no console/page errors in highlight mode',
    highlight.errors.join(' | '));

await ctx.close();
server.close();

console.log('\n=== PASS ===');
ok.forEach((l) => console.log('  + ' + l));
if (fail.length) {
    console.log('\n=== FAIL ===');
    fail.forEach((l) => console.log('  - ' + l));
}
console.log(`\n${ok.length} passed, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
