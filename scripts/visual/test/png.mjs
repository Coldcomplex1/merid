// A minimal PNG encoder, so tests have real decodable image bytes without
// pulling in an image library or reaching the network. Solid colour with a
// little noise - enough for sharp to resize and for CLIP to embed, which is all
// any test here asks of a picture.
import zlib from 'node:zlib';

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = c ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

/** RGB PNG, `seed` picks the hue so different candidates look different. */
export function makePng(width = 640, height = 360, seed = 0) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    let p = 0;
    for (let y = 0; y < height; y++) {
        raw[p++] = 0;                                  // filter: none
        for (let x = 0; x < width; x++) {
            raw[p++] = (x * 3 + seed * 37) & 0xff;
            raw[p++] = (y * 5 + seed * 91) & 0xff;
            raw[p++] = ((x ^ y) + seed * 53) & 0xff;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type: truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}
