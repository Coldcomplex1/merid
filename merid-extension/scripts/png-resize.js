// Dependency-free PNG downscaler (8-bit, non-interlaced, colortype 2/6).
// Decodes with zlib, area-averages to the target size, re-encodes as RGBA.
// Used by gen-assets.js because this environment's headless Chromium clamps
// windows to a ~500px minimum, so small assets must be rendered large + shrunk.
const fs = require('fs');
const zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 ----
const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function decode(file) {
    const d = fs.readFileSync(file);
    if (!d.slice(0, 8).equals(SIG)) throw new Error(`${file}: not a PNG`);
    let pos = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    const idat = [];
    while (pos < d.length) {
        const len = d.readUInt32BE(pos);
        const type = d.toString('ascii', pos + 4, pos + 8);
        const data = d.slice(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
        pos += 12 + len;
    }
    if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`${file}: unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
    }
    const channels = colorType === 6 ? 4 : 3;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;

    // Unfilter into a raw pixel buffer.
    const out = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const inRow = y * (stride + 1) + 1;
        const outRow = y * stride;
        for (let x = 0; x < stride; x++) {
            const rawByte = raw[inRow + x];
            const a = x >= channels ? out[outRow + x - channels] : 0;         // left
            const b = y > 0 ? out[outRow - stride + x] : 0;                   // up
            const c = (x >= channels && y > 0) ? out[outRow - stride + x - channels] : 0; // up-left
            let val;
            switch (filter) {
                case 0: val = rawByte; break;
                case 1: val = rawByte + a; break;
                case 2: val = rawByte + b; break;
                case 3: val = rawByte + ((a + b) >> 1); break;
                case 4: {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
                    val = rawByte + pred;
                    break;
                }
                default: throw new Error(`bad filter ${filter}`);
            }
            out[outRow + x] = val & 0xff;
        }
    }

    // Normalize to RGBA.
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, px = 0; px < width * height; px++) {
        const s = px * channels;
        rgba[i++] = out[s];
        rgba[i++] = out[s + 1];
        rgba[i++] = out[s + 2];
        rgba[i++] = channels === 4 ? out[s + 3] : 255;
    }
    return { width, height, rgba };
}

// Area-average downscale (box filter over the source region each target pixel covers).
function resample(src, tw, th) {
    const { width: sw, height: sh, rgba } = src;
    const out = Buffer.alloc(tw * th * 4);
    const sxRatio = sw / tw;
    const syRatio = sh / th;
    for (let ty = 0; ty < th; ty++) {
        const y0 = ty * syRatio, y1 = (ty + 1) * syRatio;
        const iy0 = Math.floor(y0), iy1 = Math.min(sh, Math.ceil(y1));
        for (let tx = 0; tx < tw; tx++) {
            const x0 = tx * sxRatio, x1 = (tx + 1) * sxRatio;
            const ix0 = Math.floor(x0), ix1 = Math.min(sw, Math.ceil(x1));
            let r = 0, g = 0, b = 0, a = 0, wsum = 0;
            for (let sy = iy0; sy < iy1; sy++) {
                const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
                for (let sx = ix0; sx < ix1; sx++) {
                    const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
                    const w = wx * wy;
                    if (w <= 0) continue;
                    const s = (sy * sw + sx) * 4;
                    const al = rgba[s + 3];
                    // Premultiply so transparent edges don't darken.
                    r += rgba[s] * al * w;
                    g += rgba[s + 1] * al * w;
                    b += rgba[s + 2] * al * w;
                    a += al * w;
                    wsum += w;
                }
            }
            const t = (ty * tw + tx) * 4;
            if (a > 0) {
                out[t] = Math.round(r / a);
                out[t + 1] = Math.round(g / a);
                out[t + 2] = Math.round(b / a);
                out[t + 3] = Math.round(a / wsum);
            } else {
                out[t] = out[t + 1] = out[t + 2] = out[t + 3] = 0;
            }
        }
    }
    return { width: tw, height: th, rgba: out };
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

function encode(img, file) {
    const { width, height, rgba } = img;
    const stride = width * 4;
    const raw = Buffer.alloc(height * (stride + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter: none
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colortype RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const idat = zlib.deflateSync(raw, { level: 9 });
    fs.writeFileSync(file, Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

/** Downscale a PNG file to tw×th (writes outFile). */
function resizePng(inFile, outFile, tw, th) {
    encode(resample(decode(inFile), tw, th), outFile);
}

/** Crop the top-left cw×ch region of a PNG (writes outFile). */
function cropPng(inFile, outFile, cw, ch) {
    const img = decode(inFile);
    if (cw > img.width || ch > img.height) throw new Error(`crop ${cw}x${ch} exceeds ${img.width}x${img.height}`);
    const out = Buffer.alloc(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
        img.rgba.copy(out, y * cw * 4, (y * img.width) * 4, (y * img.width + cw) * 4);
    }
    encode({ width: cw, height: ch, rgba: out }, outFile);
}

module.exports = { decode, resample, encode, resizePng, cropPng };
