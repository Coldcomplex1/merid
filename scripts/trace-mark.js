// Trace the Merid mark from brand/merid-icon-dark-1024.png into exact vector
// geometry, then prove the vector matches the raster.
//
//   node scripts/trace-mark.js
//
// Writes:
//   src/components/ui/meridMarkGeometry.ts   (shared by MeridMark.tsx)
//   public/favicon.svg
//
// The mark is three flat shapes - a rounded tile, a rounded highlight bar and a
// straight-edged M - so it vectorises exactly. Edges are found with marching
// squares over a sub-pixel coverage field, straight runs are collapsed with
// Douglas-Peucker, and near-equal coordinates are snapped so the path reads as
// deliberate numbers instead of trace noise. The final SVG is rendered by
// headless Chromium and diffed against the master; anything under 99.5% of
// pixels matching fails the run rather than shipping a drifted logo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { decode } = require(path.join(root, 'merid-extension-final/scripts/png-resize.js'));

const MASTER = path.join(root, 'brand/merid-icon-dark-1024.png');
const VIEW = 512; // viewBox units; the master is 2x this
const NAVY = '#16233f';
const CREAM = '#f7f6f3';
const GOLD = '#f3c33c';

const master = decode(MASTER);
const { width: W, height: H, rgba } = master;
const at = (x, y, c) => rgba[(y * W + x) * 4 + c];

// ------------------------------------------------------------------ fields
// Blue separates the M from everything else: navy 0x3f, gold 0x3c, cream 0xf3.
const creamField = (x, y) => {
    if (at(x, y, 3) < 128) return 0;
    return clamp01((at(x, y, 2) - 0x50) / (0xf3 - 0x50));
};
// Gold needs both channels: red tells it from navy (0x16 vs 0xf3) and low blue
// tells it from cream (0x3c vs 0xf3). Red alone would score the M's anti-aliased
// rim as half-gold and drag the bar's measured box out over the whole letter.
const goldField = (x, y) => {
    if (at(x, y, 3) < 128) return 0;
    return Math.min(
        clamp01((at(x, y, 0) - 0x16) / (0xf3 - 0x16)),
        clamp01((0x64 - at(x, y, 2)) / 0x20),
    );
};
const alphaField = (x, y) => at(x, y, 3) / 255;

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ------------------------------------------------------- marching squares
// Samples sit at pixel centres, so a cell spans (x+0.5, y+0.5)..(x+1.5, y+1.5).
function contour(field, iso = 0.5) {
    const segs = [];
    const lerp = (p, q, fp, fq) => {
        const t = (iso - fp) / (fq - fp);
        return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
            const f = [field(x, y), field(x + 1, y), field(x + 1, y + 1), field(x, y + 1)];
            const p = [
                [x + 0.5, y + 0.5], [x + 1.5, y + 0.5],
                [x + 1.5, y + 1.5], [x + 0.5, y + 1.5],
            ];
            const code = (f[0] >= iso ? 1 : 0) | (f[1] >= iso ? 2 : 0) | (f[2] >= iso ? 4 : 0) | (f[3] >= iso ? 8 : 0);
            if (code === 0 || code === 15) continue;
            // Edge crossings: 0=top, 1=right, 2=bottom, 3=left.
            const e = [
                () => lerp(p[0], p[1], f[0], f[1]),
                () => lerp(p[1], p[2], f[1], f[2]),
                () => lerp(p[3], p[2], f[3], f[2]),
                () => lerp(p[0], p[3], f[0], f[3]),
            ];
            // Segments are emitted so the filled side stays on the left.
            const push = (a, b) => segs.push([e[a](), e[b]()]);
            switch (code) {
                case 1: push(3, 0); break;
                case 2: push(0, 1); break;
                case 3: push(3, 1); break;
                case 4: push(1, 2); break;
                case 5: { // saddle
                    const mid = (f[0] + f[1] + f[2] + f[3]) / 4;
                    if (mid >= iso) { push(3, 2); push(1, 0); } else { push(3, 0); push(1, 2); }
                    break;
                }
                case 6: push(0, 2); break;
                case 7: push(3, 2); break;
                case 8: push(2, 3); break;
                case 9: push(2, 0); break;
                case 10: { // saddle
                    const mid = (f[0] + f[1] + f[2] + f[3]) / 4;
                    if (mid >= iso) { push(2, 1); push(0, 3); } else { push(2, 3); push(0, 1); }
                    break;
                }
                case 11: push(2, 1); break;
                case 12: push(1, 3); break;
                case 13: push(1, 0); break;
                case 14: push(0, 3); break;
            }
        }
    }
    return chain(segs);
}

// Walk the segment soup into closed rings.
function chain(segs) {
    const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const from = new Map();
    for (const s of segs) {
        const k = key(s[0]);
        if (!from.has(k)) from.set(k, []);
        from.get(k).push(s);
    }
    const used = new Set();
    const rings = [];
    for (const s0 of segs) {
        if (used.has(s0)) continue;
        const ring = [s0[0]];
        let cur = s0;
        while (cur && !used.has(cur)) {
            used.add(cur);
            ring.push(cur[1]);
            const next = (from.get(key(cur[1])) ?? []).find((s) => !used.has(s));
            cur = next;
        }
        if (ring.length > 3) rings.push(ring);
    }
    return rings.sort((a, b) => b.length - a.length);
}

// ------------------------------------------------------------- simplifying
function douglasPeucker(pts, eps) {
    if (pts.length < 3) return pts;
    let maxD = 0, idx = 0;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    for (let i = 1; i < pts.length - 1; i++) {
        const d = pointLineDistance(pts[i], a, b);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [a, b];
    return [
        ...douglasPeucker(pts.slice(0, idx + 1), eps).slice(0, -1),
        ...douglasPeucker(pts.slice(idx), eps),
    ];
}

function pointLineDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/**
 * Turn a traced ring into an exact polygon: Douglas-Peucker finds roughly where
 * the corners are, then every edge is re-fitted to all of its contour points and
 * consecutive edges are intersected. Corner positions therefore come from whole
 * straight runs rather than from whichever sample DP happened to keep, which is
 * what makes the vector land on the raster to a fraction of a pixel.
 */
function regularize(ring, eps) {
    // Rotate so the ring starts at its top-left-most point (a true corner).
    let start = 0;
    for (let i = 1; i < ring.length; i++) {
        if (ring[i][1] < ring[start][1] - 1e-6
            || (Math.abs(ring[i][1] - ring[start][1]) < 1e-6 && ring[i][0] < ring[start][0])) start = i;
    }
    const closed = ring.slice(0, -1);
    const pts = [...closed.slice(start), ...closed.slice(0, start)];

    const simplified = douglasPeucker([...pts, pts[0]], eps);
    simplified.pop();
    const corners = simplified.map((v) => pts.indexOf(v));

    const lines = corners.map((ci, k) => {
        const cj = corners[(k + 1) % corners.length];
        const run = [];
        for (let i = ci; ; i = (i + 1) % pts.length) {
            run.push(pts[i]);
            if (i === cj) break;
        }
        // Drop a fifth at each end so corner rounding can't tilt the fit.
        const trim = Math.floor(run.length / 5);
        const body = run.length - 2 * trim >= 4 ? run.slice(trim, run.length - trim) : run;
        return fitLine(body);
    });

    return corners.map((_, k) => {
        const a = lines[(k - 1 + lines.length) % lines.length];
        const b = lines[k];
        return intersect(a, b) ?? pts[corners[k]];
    });
}

/** Total-least-squares line through points: returns { c: centroid, d: direction }. */
function fitLine(points) {
    const nPts = points.length;
    const cx = points.reduce((s, p) => s + p[0], 0) / nPts;
    const cy = points.reduce((s, p) => s + p[1], 0) / nPts;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of points) {
        const dx = p[0] - cx, dy = p[1] - cy;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    // Principal eigenvector of the 2x2 covariance matrix.
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { c: [cx, cy], d: [Math.cos(theta), Math.sin(theta)] };
}

function intersect(a, b) {
    const det = a.d[0] * -b.d[1] - a.d[1] * -b.d[0];
    if (Math.abs(det) < 1e-6) return null; // parallel: keep the DP corner
    const rx = b.c[0] - a.c[0], ry = b.c[1] - a.c[1];
    const t = (rx * -b.d[1] - ry * -b.d[0]) / det;
    return [a.c[0] + a.d[0] * t, a.c[1] + a.d[1] * t];
}

/** Snap coordinates that agree within `tol` onto a shared value. */
function snapAxis(values, tol) {
    const sorted = [...values].sort((a, b) => a - b);
    const groups = [];
    for (const v of sorted) {
        const g = groups[groups.length - 1];
        if (g && v - g[g.length - 1] <= tol) g.push(v);
        else groups.push([v]);
    }
    const map = new Map();
    for (const g of groups) {
        const mean = g.reduce((s, v) => s + v, 0) / g.length;
        // Quarter-pixel grid at master scale keeps the numbers readable.
        const snapped = Math.round(mean * 4) / 4;
        for (const v of g) map.set(v, snapped);
    }
    return map;
}

function snapRing(pts, tol = 1.2) {
    const xs = snapAxis(pts.map((p) => p[0]), tol);
    const ys = snapAxis(pts.map((p) => p[1]), tol);
    return pts.map((p) => [xs.get(p[0]), ys.get(p[1])]);
}

// --------------------------------------------------------------- rounded rects
/** Sub-pixel position where a sampled coverage profile passes 0.5. */
function cross(samples) {
    for (let i = 1; i < samples.length; i++) {
        const [pa, va] = samples[i - 1], [pb, vb] = samples[i];
        if ((va < 0.5) !== (vb < 0.5)) return pa + (0.5 - va) / (vb - va) * (pb - pa);
    }
    return null;
}

const rowProfile = (field, y, reverse = false) => {
    const s = [];
    for (let x = 0; x < W; x++) s.push([x + 0.5, field(x, y)]);
    return reverse ? s.reverse() : s;
};
const colProfile = (field, x, reverse = false) => {
    const s = [];
    for (let y = 0; y < H; y++) s.push([y + 0.5, field(x, y)]);
    return reverse ? s.reverse() : s;
};

/**
 * Measure an axis-aligned rounded rect. `probeRow`/`probeCol` must cross the
 * rect's straight sides, away from both the corners and any shape drawn on top
 * of it. A side that runs off the canvas has no 0.5 crossing and pins to the edge.
 */
function measureRoundedRect(field, { probeRow, probeCol }) {
    const left = cross(rowProfile(field, probeRow)) ?? 0;
    const right = cross(rowProfile(field, probeRow, true)) ?? W;
    const top = cross(colProfile(field, probeCol)) ?? 0;
    const bottom = cross(colProfile(field, probeCol, true)) ?? H;
    return { left, right, top, bottom, radius: measureRadius(field, left, top, bottom) };
}

/**
 * Corner radius from the top-left arc. A scanline `dy` below the top edge is
 * inset by `r - sqrt(r^2 - (r - dy)^2)`, which inverts to
 * `r = inset + dy + sqrt(2 * inset * dy)`. Solving on every scanline that still
 * has an inset and taking the median makes the estimate immune to one noisy row
 * - and, because a true arc gives the same answer at every dy, the spread also
 * tells us whether the corner really is circular (it is: +/-0.1px here).
 */
function measureRadius(field, left, top, bottom) {
    const rs = [];
    for (let y = Math.max(0, Math.floor(top)); y < Math.round((top + bottom) / 2); y++) {
        const dy = y + 0.5 - top;
        if (dy <= 0.5) continue;
        const l = cross(rowProfile(field, y)) ?? 0;
        const inset = l - left;
        if (inset <= 0.2) break; // past the arc, on the straight side
        rs.push(inset + dy + Math.sqrt(2 * inset * dy));
    }
    if (!rs.length) return 0;
    rs.sort((a, b) => a - b);
    return rs[rs.length >> 1];
}

function bbox(field) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (field(x, y) >= 0.5) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
    }
    return { x0, y0, x1, y1 };
}

// ------------------------------------------------------------------- trace
const scale = VIEW / W;
const n = (v) => {
    const r = Math.round(v * 100) / 100;
    return String(r);
};

const mRings = contour(creamField);
if (mRings.length !== 1) throw new Error(`expected 1 ring for the M, got ${mRings.length}`);
const mPts = snapRing(regularize(mRings[0], 2));
const mPath = `M${mPts.map((p) => `${n(p[0] * scale)} ${n(p[1] * scale)}`).join('L')}Z`;

// Probe the bar near its left end, where the M does not cover it.
const goldBox = bbox(goldField);
const bar = measureRoundedRect(goldField, {
    probeRow: Math.round((goldBox.y0 + goldBox.y1) / 2),
    probeCol: goldBox.x0 + Math.round((goldBox.x1 - goldBox.x0) * 0.05),
});
// The tile is full-bleed, so only its corner radius has to be measured.
const tile = measureRoundedRect(alphaField, { probeRow: H >> 1, probeCol: W >> 1 });

const geo = {
    view: VIEW,
    tile: {
        x: n(tile.left * scale), y: n(tile.top * scale),
        w: n((tile.right - tile.left) * scale), h: n((tile.bottom - tile.top) * scale),
        r: n(tile.radius * scale),
    },
    bar: {
        x: n(bar.left * scale), y: n(bar.top * scale),
        w: n((bar.right - bar.left) * scale), h: n((bar.bottom - bar.top) * scale),
        r: n(bar.radius * scale),
    },
    m: mPath,
};

console.log(`M vertices: ${mPts.length}`);
console.log('tile:', geo.tile);
console.log('bar :', geo.bar);

// ------------------------------------------------------------------ outputs
const banner = `// GENERATED by scripts/trace-mark.js from brand/merid-icon-dark-1024.png.
// Do not hand-edit: re-run the script, which also pixel-diffs the result
// against the master PNG so the vector can never drift from the artwork.`;

fs.writeFileSync(path.join(root, 'src/components/ui/meridMarkGeometry.ts'), `${banner}

/** viewBox side length the coordinates below are expressed in. */
export const VIEW = ${geo.view}

/** The rounded tile that backs the mark on light surfaces. */
export const TILE = { x: ${geo.tile.x}, y: ${geo.tile.y}, w: ${geo.tile.w}, h: ${geo.tile.h}, r: ${geo.tile.r} }

/** The gold highlight bar struck through the M. */
export const BAR = { x: ${geo.bar.x}, y: ${geo.bar.y}, w: ${geo.bar.w}, h: ${geo.bar.h}, r: ${geo.bar.r} }

/** The M itself, drawn over the bar. */
export const M_PATH = '${geo.m}'
`);
console.log('ok  src/components/ui/meridMarkGeometry.ts');

const svg = (opts = {}) => {
    const { tileFill = NAVY, mFill = CREAM, withTile = true } = opts;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">
${withTile ? `  <rect x="${geo.tile.x}" y="${geo.tile.y}" width="${geo.tile.w}" height="${geo.tile.h}" rx="${geo.tile.r}" fill="${tileFill}"/>\n` : ''}  <rect x="${geo.bar.x}" y="${geo.bar.y}" width="${geo.bar.w}" height="${geo.bar.h}" rx="${geo.bar.r}" fill="${GOLD}"/>
  <path d="${geo.m}" fill="${mFill}"/>
</svg>
`;
};

fs.writeFileSync(path.join(root, 'public/favicon.svg'), svg());
console.log('ok  public/favicon.svg');

// ------------------------------------------------------------- verification
function findChrome() {
    if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
    const candidates = [];
    if (fs.existsSync('/opt/pw-browsers')) {
        for (const d of fs.readdirSync('/opt/pw-browsers')) candidates.push(path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'));
    }
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
    for (const c of candidates) if (fs.existsSync(c)) return c;
    throw new Error('No Chromium binary found. Set CHROME_BIN to a Chrome/Chromium path.');
}

const MIN_MATCH = 0.995;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'merid-trace-'));
const chrome = findChrome();

function renderSvg(markup, size) {
    const html = path.join(tmp, `r-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0} html,body{background:transparent}
  svg{position:absolute;top:0;left:0;width:${size}px;height:${size}px}
</style>${markup}`);
    const out = path.join(tmp, `r-${Math.random().toString(36).slice(2)}.png`);
    execFileSync(chrome, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
        '--force-device-scale-factor=1', '--default-background-color=00000000',
        `--screenshot=${out}`, `--window-size=${size},${size + 160}`, `file://${html}`,
    ], { stdio: 'pipe' });
    return decode(out);
}

/**
 * Compare over premultiplied RGBA. `match` counts pixels that agree structurally
 * (a tolerance wide enough to forgive one renderer's anti-aliasing against
 * another's), while `mae` catches a shape that has drifted a fraction of a pixel
 * everywhere - that stays inside the tolerance but lifts the mean error.
 */
function compare(render, ref, tol = 64) {
    let same = 0, total = 0, err = 0;
    for (let y = 0; y < ref.height; y++) {
        for (let x = 0; x < ref.width; x++) {
            const i = (y * ref.width + x) * 4;
            const j = (y * render.width + x) * 4;
            total++;
            let worst = 0;
            for (let c = 0; c < 3; c++) {
                const a = ref.rgba[i + c] * ref.rgba[i + 3] / 255;
                const b = render.rgba[j + c] * render.rgba[j + 3] / 255;
                const d = Math.abs(a - b);
                err += d;
                if (d > worst) worst = d;
            }
            const dA = Math.abs(ref.rgba[i + 3] - render.rgba[j + 3]);
            err += dA;
            if (dA > worst) worst = dA;
            if (worst <= tol) same++;
        }
    }
    return { match: same / total, mae: err / (total * 4) };
}

const MAX_MAE = 4; // out of 255

const checks = [
    ['tile', svg(), 'brand/merid-icon-dark-512.png'],
    ['bare mark', svg({ withTile: false, mFill: NAVY }), 'brand/merid-mark-navy-512.png'],
    ['reversed mark', svg({ withTile: false, mFill: CREAM }), 'brand/merid-mark-cream-512.png'],
];
let failed = false;
for (const [name, markup, ref] of checks) {
    const refImg = decode(path.join(root, ref));
    const { match, mae } = compare(renderSvg(markup, refImg.width), refImg);
    const summary = `${(match * 100).toFixed(2)}% of pixels match, mean error ${mae.toFixed(2)}/255`;
    if (match >= MIN_MATCH && mae <= MAX_MAE) console.log(`ok  ${name}: ${summary} (${ref})`);
    else { console.error(`FAIL ${name}: ${summary} (${ref})`); failed = true; }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) process.exit(1);
