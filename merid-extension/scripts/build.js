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
    'background.js',
    'content.js',
    'content.css',
    'popup.html', 'popup.js', 'popup.css',
    'options.html', 'options.js', 'options.css',
    'deck.html', 'deck.js', 'deck.css',
    'lib/vocab-core.js',
    'fonts/Outfit-latin.woff2',
    'fonts/Inter-latin.woff2',
    'icon16.png',
    'icon48.png',
    'icon128.png'
];

// Datasets are matched dynamically so a future dataset-B2.csv ships automatically.
for (const f of fs.readdirSync(root)) {
    if (/^dataset-.*\.csv$/.test(f)) FILES.push(f);
}

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
