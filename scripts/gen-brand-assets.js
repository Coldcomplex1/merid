// Derive every shipped brand asset from the masters in brand/.
//
//   node scripts/gen-brand-assets.js          # icons + social card
//   node scripts/gen-brand-assets.js icons    # skip the Chromium render
//   node scripts/gen-brand-assets.js og
//
// Zero npm dependencies: the PNG codec is the one the extension already uses
// (merid-extension-final/scripts/png-resize.js) and the social card is rendered
// by the headless Chromium that ships with this environment.
//
// Outputs:
//   brand/merid-mark-cream-512.png          -> reversed mark for dark surfaces
//   public/favicon.ico                      -> 16 + 32 + 48, from the pack's own renders
//   public/apple-touch-icon.png             -> 180x180, opaque (iOS masks corners itself)
//   public/og-image.png, public/og-card.jpg -> social preview (1200x630)
//   merid-extension-final/icon{16,32,48,128}.png, logo-mark.png
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// The extension owns the dependency-free PNG codec; both pipelines share it.
const { decode, resample, encode } = require(
    path.join(root, 'merid-extension-final/scripts/png-resize.js'),
);

const brand = (f) => path.join(root, 'brand', f);
const web = (f) => path.join(root, 'public', f);
const ext = (f) => path.join(root, 'merid-extension-final', f);

// Brand palette, measured from the master PNGs.
const NAVY = [0x16, 0x23, 0x3f];
const CREAM = [0xf7, 0xf6, 0xf3];
const GOLD = [0xf3, 0xc3, 0x3c];

function ok(file, note = '') {
    const { size } = fs.statSync(file);
    console.log(`ok  ${path.relative(root, file)}  (${(size / 1024).toFixed(1)} KB${note ? `, ${note}` : ''})`);
}

// ---------------------------------------------------------------- cream mark
// The mark is three flat colours: navy M over a gold bar over transparency.
// Every pixel is therefore either a pure colour at some alpha (outer edges) or
// a blend of navy and gold (where the M crosses the bar). Solving for the navy
// share t and re-mixing cream at the same t recolours the M without hardening
// a single anti-aliased edge.
function creamMark() {
    const img = decode(brand('merid-mark-navy-512.png'));
    const d = img.rgba;
    // Project onto the navy->gold axis once; the denominator is constant.
    const axis = NAVY.map((v, i) => v - GOLD[i]);
    const denom = axis.reduce((s, v) => s + v * v, 0);
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        let dot = 0;
        for (let c = 0; c < 3; c++) dot += (d[i + c] - GOLD[c]) * axis[c];
        const t = Math.max(0, Math.min(1, dot / denom));
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(CREAM[c] * t + GOLD[c] * (1 - t));
    }
    encode(img, brand('merid-mark-cream-512.png'));
    ok(brand('merid-mark-cream-512.png'), '512x512');
}

// ------------------------------------------------------------------ favicon
// An .ico is just a directory of images; modern browsers read PNG members, so
// the pack's own 16/32/48 renders go in untouched rather than being downscaled.
function favicon() {
    const sizes = [16, 32, 48];
    const pngs = sizes.map((s) => fs.readFileSync(brand(`merid-icon-dark-${s}.png`)));
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(sizes.length, 4);
    const dir = Buffer.alloc(16 * sizes.length);
    let offset = header.length + dir.length;
    sizes.forEach((s, i) => {
        const e = i * 16;
        dir[e] = s === 256 ? 0 : s; // width
        dir[e + 1] = s === 256 ? 0 : s; // height
        dir[e + 2] = 0; // palette size (0 = truecolour)
        dir[e + 3] = 0; // reserved
        dir.writeUInt16LE(1, e + 4); // colour planes
        dir.writeUInt16LE(32, e + 6); // bits per pixel
        dir.writeUInt32LE(pngs[i].length, e + 8);
        dir.writeUInt32LE(offset, e + 12);
        offset += pngs[i].length;
    });
    fs.writeFileSync(web('favicon.ico'), Buffer.concat([header, dir, ...pngs]));
    ok(web('favicon.ico'), `${sizes.join('/')} px`);
}

// iOS rounds the corners itself, so the touch icon must be a full-bleed opaque
// square - transparent corners would show through as a second, larger radius.
function appleTouchIcon() {
    const img = decode(brand('merid-icon-dark-1024.png'));
    const d = img.rgba;
    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        for (let c = 0; c < 3; c++) d[i + c] = Math.round(d[i + c] * a + NAVY[c] * (1 - a));
        d[i + 3] = 255;
    }
    encode(resample(img, 180, 180), web('apple-touch-icon.png'));
    ok(web('apple-touch-icon.png'), '180x180 opaque');
}

// ---------------------------------------------------------------- extension
function extensionIcons() {
    for (const s of [16, 32, 48, 128]) {
        fs.copyFileSync(brand(`merid-icon-dark-${s}.png`), ext(`icon${s}.png`));
        ok(ext(`icon${s}.png`), `${s}x${s}`);
    }
    // Popup and options are navy (#0a192f); they need the reversed mark.
    encode(resample(decode(brand('merid-mark-cream-512.png')), 128, 128), ext('logo-mark.png'));
    ok(ext('logo-mark.png'), '128x128');
}

// --------------------------------------------------------------- social card
// Same approach as merid-extension-final/scripts/gen-assets.js: render an HTML
// source with headless Chromium. Kept here (not there) because the card is a
// website asset.
function findChrome() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    const candidates = [];
    const base = '/opt/pw-browsers';
    if (fs.existsSync(base)) {
        for (const d of fs.readdirSync(base)) candidates.push(path.join(base, d, 'chrome-linux', 'chrome'));
    }
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('No Chromium binary found. Set CHROME_BIN to a Chrome/Chromium path.');
}

const OG_W = 1200;
const OG_H = 630;
// --headless=new reserves ~87px of the window height for browser UI.
const HPAD = 140;
// Zalo/WhatsApp fetch the preview client-side, so the card has a size budget.
const OG_MAX_BYTES = 100 * 1024;

function socialCard() {
    const chrome = findChrome();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merid-og-'));

    // The template renders from a temp dir, so its asset references are
    // rewritten to absolute paths first. Fonts come from the installed
    // @fontsource packages - the same files the site itself ships.
    const fonts = path.join(root, 'node_modules/@fontsource/be-vietnam-pro/files');
    const lora = path.join(root, 'node_modules/@fontsource/lora/files');
    if (!fs.existsSync(fonts)) throw new Error('run `npm install` first - the card needs the @fontsource files');
    const src = path.join(tmp, 'og-card.html');
    fs.writeFileSync(src, fs.readFileSync(path.join(root, 'assets', 'og-card.html'), 'utf8')
        .replace(/__FONTS__/g, fonts)
        .replace(/__LORA__/g, lora)
        .replace(/__BRAND__/g, path.join(root, 'brand')));
    const padded = path.join(tmp, 'og-padded.png');
    execFileSync(chrome, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1', '--default-background-color=00000000',
        `--screenshot=${padded}`, `--window-size=${OG_W},${OG_H + HPAD}`,
        `file://${src}`,
    ], { stdio: 'pipe' });

    // Crop the exact card out of the padded shot.
    const shot = decode(padded);
    const out = Buffer.alloc(OG_W * OG_H * 4);
    for (let y = 0; y < OG_H; y++) {
        shot.rgba.copy(out, y * OG_W * 4, y * shot.width * 4, (y * shot.width + OG_W) * 4);
    }
    encode({ width: OG_W, height: OG_H, rgba: out }, web('og-image.png'));
    ok(web('og-image.png'), `${OG_W}x${OG_H}`);

    // Chromium only screenshots PNG, so the JPEG is re-encoded in-page through a
    // canvas and read back from the DOM. Quality steps down until it fits budget.
    const pngB64 = fs.readFileSync(web('og-image.png')).toString('base64');
    for (const q of [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68]) {
        const page = path.join(tmp, 'to-jpeg.html');
        fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><img id="s" src="data:image/png;base64,${pngB64}">
<script>
  const img = document.getElementById('s');
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = ${OG_W}; c.height = ${OG_H};
    c.getContext('2d').drawImage(img, 0, 0);
    document.title = c.toDataURL('image/jpeg', ${q}).split(',')[1];
  };
</script></body>`);
        const dom = execFileSync(chrome, [
            '--headless=new', '--no-sandbox', '--disable-gpu', '--virtual-time-budget=5000',
            '--dump-dom', `file://${page}`,
        ], { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString();
        const b64 = dom.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
        if (!b64) throw new Error('canvas JPEG encode produced no data');
        const jpeg = Buffer.from(b64, 'base64');
        if (jpeg.length <= OG_MAX_BYTES || q === 0.68) {
            fs.writeFileSync(web('og-card.jpg'), jpeg);
            ok(web('og-card.jpg'), `${OG_W}x${OG_H}, quality ${q}`);
            if (jpeg.length > OG_MAX_BYTES) console.warn(`warn  og-card.jpg is over the ${OG_MAX_BYTES / 1024} KB budget`);
            break;
        }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
}

const step = process.argv[2] ?? 'all';
if (step === 'all' || step === 'icons') {
    creamMark();
    favicon();
    appleTouchIcon();
    extensionIcons();
}
if (step === 'all' || step === 'og') socialCard();
console.log('\nBrand assets generated.');
