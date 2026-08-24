// Zero-dependency production build: copy the shippable extension files into
// dist/ (excluding backend, tests, docs, node_modules) and zip them for the
// Chrome Web Store. Also runs a final secret scan on the output.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Explicit whitelist - only these ship.
const FILES = [
    'manifest.json',
    '_locales/en/messages.json',
    '_locales/vi/messages.json',
    'background.js',
    'content.js',
    'status-badge.js',
    'content.css',
    // The tutorial poster: the overlay, the page it falls back to, and the sheet.
    'tutorial.js', 'tutorial.html', 'tutorial-vi.webp',
    // The first-run wizard: the overlay and the page it opens as on install.
    // Its mode pictures are matched dynamically below, so the step still works
    // before they have been drawn.
    'onboarding.js', 'onboarding.html',
    'popup.html', 'popup.js', 'popup.css',
    'options.html', 'options.js', 'options.css',
    'content-bridge.js',
    'lib/vocab-core.js',
    'lib/visual.js',
    'lib/i18n.js',
    'lib/profile.js',
    'lib/custom-datasets.js',
    'lib/firebase-config.js',
    'lib/firebase-rest.js',
    'lib/ai-proxy.js',
    'lib/sync.js',
    'fonts/Outfit-latin.woff2',
    'fonts/Inter-latin.woff2',
    // Vietnamese block: the other two files are latin subsets and lack it.
    'fonts/Inter-vietnamese.woff2',
    'icon16.png',
    'icon32.png',
    'icon48.png',
    'icon128.png',
    // Reversed mark for the popup/options headers (both pages are navy).
    'logo-mark.png'
];

// Datasets are matched dynamically so a future dataset-B2.csv ships automatically.
for (const f of fs.readdirSync(root)) {
    if (/^dataset-.*\.csv$/.test(f)) FILES.push(f);
}

// The wizard's mode pictures, matched the same way and for the same reason:
// they are artwork, dropped in on their own schedule, and a build must not fail
// because one of them has not been drawn yet. The step falls back to drawing
// the mode itself when a picture is absent (see onboarding.js).
const onboardingDir = path.join(root, 'onboarding');
if (fs.existsSync(onboardingDir)) {
    for (const f of fs.readdirSync(onboardingDir)) {
        if (/^mode-.*\.(png|webp)$/.test(f)) FILES.push(path.join('onboarding', f));
    }
}

// The card artwork and the index that maps words onto it. Matched dynamically
// for the same reason onboarding/mode-* is: these are pictures, added on their
// own schedule, and a build must not fail because a word has not been given one
// yet - a word with no picture wears a generated glyph instead.
//
// The size gate lives HERE rather than in the generator. The generator is run
// by hand when the datasets change; the build runs every time something ships.
// A limit you can ship without running is not a limit.
const VIS_BUDGET_BYTES = 6.0 * 1024 * 1024;   // whole vis/ directory
const VIS_FILE_MAX = 9 * 1024;                // one picture

const visDir = path.join(root, 'vis');
if (fs.existsSync(visDir)) {
    let total = 0;
    for (const f of fs.readdirSync(visDir)) {
        // CREDITS.json rides along in the same directory but is not a picture:
        // it is read once by the Settings page and is far over the per-file cap
        // by design, so it is exempt from both limits.
        if (f === 'CREDITS.json') { FILES.push(path.join('vis', f)); continue; }
        if (!/\.(avif|webp)$/.test(f)) continue;
        const size = fs.statSync(path.join(visDir, f)).size;
        if (size > VIS_FILE_MAX) {
            throw new Error(`vis/${f} is ${size}B, over the ${VIS_FILE_MAX}B per-picture cap`);
        }
        total += size;
        FILES.push(path.join('vis', f));
    }
    if (total > VIS_BUDGET_BYTES) {
        throw new Error(`vis/ is ${total}B, over the ${VIS_BUDGET_BYTES}B budget`);
    }
}
if (fs.existsSync(path.join(root, 'visual-index.json'))) FILES.push('visual-index.json');

function copyFile(rel) {
    const src = path.join(root, rel);
    const dest = path.join(dist, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

// Fresh dist/
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

let missing = 0;
for (const rel of FILES) {
    if (!fs.existsSync(path.join(root, rel))) { console.error(`MISSING ${rel}`); missing++; continue; }
    copyFile(rel);
}
if (missing) { console.error(`\n${missing} required file(s) missing. Aborting.`); process.exit(1); }

// Safety: fail the build if a secret-looking key slipped into the bundle.
const SECRET_RE = /sk-(proj-)?[A-Za-z0-9_-]{20,}/;
for (const rel of FILES) {
    if (/\.(png|csv|woff2?)$/.test(rel)) continue;
    const txt = fs.readFileSync(path.join(dist, rel), 'utf8');
    if (SECRET_RE.test(txt)) {
        console.error(`\nSECRET DETECTED in ${rel} - refusing to build. Remove the key first.`);
        process.exit(1);
    }
}

console.log(`Copied ${FILES.length} files to dist/`);

// Zip (optional - needs the `zip` CLI).
try {
    const zipPath = path.join(root, 'dist.zip');
    fs.rmSync(zipPath, { force: true });
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: dist });
    console.log('Created dist.zip - ready to upload to the Chrome Web Store.');
} catch (e) {
    console.log('dist/ is ready. (Install `zip` to auto-create dist.zip, or zip the dist/ folder manually.)');
}
