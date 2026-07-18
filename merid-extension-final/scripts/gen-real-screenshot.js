// OPTIONAL dev tool: renders store-assets/screenshot-5-realpage.png (1280x800)
// by running the REAL content script over assets/realpage.html (a fictional
// Vietnamese news article + chrome.* stub) and hovering a replaced word so the
// learning card is open. This is the "product actually in use" screenshot the
// store guidelines favor.
//
// Unlike the rest of the tooling this needs Playwright (for hover/interaction,
// which plain `chromium --screenshot` can't do). It is NOT a package
// dependency - run it wherever Playwright is installed:
//
//   node scripts/gen-real-screenshot.js
//
// It is not part of npm test / lint / build.

const path = require('path');

function loadPlaywright() {
    const candidates = ['playwright', '/opt/node22/lib/node_modules/playwright'];
    for (const c of candidates) {
        try { return require(c); } catch (e) { /* try next */ }
    }
    console.error('Playwright not found. Install it (npm i -g playwright) and re-run.');
    process.exit(1);
}

(async () => {
    const { chromium } = loadPlaywright();
    const root = path.join(__dirname, '..');
    const fixture = path.join(root, 'assets', 'realpage.html');
    const out = path.join(root, 'store-assets', 'screenshot-5-realpage.png');

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('file://' + fixture);

    // Let the chunked scan + MutationObserver settle, then open the card.
    await page.waitForSelector('.vocab-master-highlight.vocab-replaced', { timeout: 5000 });
    await page.waitForTimeout(400);
    const target = (await page.$('.vocab-master-highlight[data-word="resilient"]')) ||
        (await page.$('.vocab-master-highlight.vocab-replaced'));
    await target.hover();
    await page.waitForSelector('.vocab-master-tooltip .vm-card', { state: 'visible', timeout: 3000 });
    await page.waitForTimeout(350); // let the slide-in animation finish

    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    await browser.close();
    console.log('ok  store-assets/screenshot-5-realpage.png (1280x800)');
})().catch(err => { console.error(err); process.exit(1); });
