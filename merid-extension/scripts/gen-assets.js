// Render the branded PNG assets (extension icons + Chrome Web Store images) from
// the HTML sources in assets/ using the headless Chromium that ships with this
// environment. Zero npm dependencies.
//
//   node scripts/gen-assets.js
//
// Outputs:
//   icon16.png / icon48.png / icon128.png        -> repo root (shipped in the extension)
//   store-assets/screenshot-*.png (1280x800)     -> store listing (not shipped)
//   store-assets/promo-tile-440x280.png          -> store listing (not shipped)
//   store-assets/marquee-1400x560.png            -> store listing (not shipped)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { resizePng, cropPng } = require('./png-resize.js');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const storeDir = path.join(root, 'store-assets');

// Headless Chromium here clamps windows to a ~500px minimum width, so anything
// narrower must be rendered large and downscaled.
const MIN = 500;
// --headless=new reserves ~87px of the requested height for browser UI, so we
// render taller than needed and crop the exact top region back out.
const HPAD = 140;

// Locate a Chromium binary (this environment ships one under /opt/pw-browsers).
function findChrome() {
    const envBin = process.env.CHROME_BIN;
    if (envBin && fs.existsSync(envBin)) return envBin;
    const candidates = [];
    const base = '/opt/pw-browsers';
    if (fs.existsSync(base)) {
        for (const d of fs.readdirSync(base)) {
            candidates.push(path.join(base, d, 'chrome-linux', 'chrome'));
        }
    }
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('No Chromium binary found. Set CHROME_BIN to a Chrome/Chromium path.');
}

const CHROME = findChrome();

const TMP = path.join(os.tmpdir(), 'merid-assets');
fs.mkdirSync(TMP, { recursive: true });

// Render a source templated to an exact px size, then downscale to the target.
// The master render size is bumped to >= MIN so Chromium doesn't clamp it.
function renderScaled(srcName, outPng, targetW, targetH) {
    const scale = Math.max(1, Math.ceil(MIN / Math.min(targetW, targetH)));
    const mw = targetW * scale, mh = targetH * scale;
    let template = fs.readFileSync(path.join(assets, srcName), 'utf8')
        .replace(/<!--include:([\w.\-]+)-->/g, (_, f) => fs.readFileSync(path.join(assets, f), 'utf8'));
    template = template
        .replace(/__W__/g, String(mw)).replace(/__H__/g, String(mh))
        .replace(/__SIZE__/g, String(Math.min(mw, mh)))
        .replace(/__SCALE__/g, String(scale));
    const tmpHtml = path.join(TMP, `${path.basename(srcName, '.html')}-${mw}x${mh}.html`);
    fs.writeFileSync(tmpHtml, template);

    // Render taller than needed, then crop the exact mw×mh top region.
    const base = path.basename(outPng, '.png');
    const padded = path.join(TMP, `${base}-padded.png`);
    const master = path.join(TMP, `${base}-master.png`);
    shot(tmpHtml, padded, mw, mh + HPAD);
    cropPng(padded, master, mw, mh);

    if (scale === 1) {
        fs.copyFileSync(master, outPng);
    } else {
        resizePng(master, outPng, targetW, targetH);
    }
    const { width, height } = pngSize(outPng);
    if (width !== targetW || height !== targetH) throw new Error(`${path.basename(outPng)} is ${width}x${height}, expected ${targetW}x${targetH}`);
    console.log(`ok  ${path.relative(root, outPng)}  (${width}x${height}${scale > 1 ? `, from ${mw}x${mh}` : ''})`);
}

function shot(srcHtml, outPng, w, h) {
    const src = path.isAbsolute(srcHtml) ? srcHtml : path.join(assets, srcHtml);
    fs.mkdirSync(path.dirname(outPng), { recursive: true });
    execFileSync(CHROME, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--screenshot=${outPng}`,
        `--window-size=${w},${h}`,
        `file://${src}`
    ], { stdio: 'pipe' });
    const { width, height } = pngSize(outPng);
    if (width !== w || height !== h) {
        throw new Error(`${path.basename(outPng)} is ${width}x${height}, expected ${w}x${h}`);
    }
}

function pngSize(file) {
    const buf = fs.readFileSync(file);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- Extension icons (shipped) ---
renderScaled('icon.html', path.join(root, 'icon128.png'), 128, 128);
renderScaled('icon.html', path.join(root, 'icon48.png'), 48, 48);
renderScaled('icon.html', path.join(root, 'icon16.png'), 16, 16);

// --- Store screenshots (1280x800) ---
for (const name of ['screenshot-1', 'screenshot-2', 'screenshot-3', 'screenshot-4']) {
    if (fs.existsSync(path.join(assets, `${name}.html`))) renderScaled(`${name}.html`, path.join(storeDir, `${name}.png`), 1280, 800);
}

// --- Promo images ---
if (fs.existsSync(path.join(assets, 'promo-tile.html')))
    renderScaled('promo-tile.html', path.join(storeDir, 'promo-tile-440x280.png'), 440, 280);
if (fs.existsSync(path.join(assets, 'marquee.html')))
    renderScaled('marquee.html', path.join(storeDir, 'marquee-1400x560.png'), 1400, 560);

console.log('\nAll assets generated.');
