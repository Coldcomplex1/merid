// Stand-ins for Openverse, Wikimedia Commons and Pexels.
//
// They answer in the real response shapes, so stage 03's three parsers, its
// licence filter, its de-duplication, its rate-limit handling and its download
// path all run for real against them. Only the bytes are invented.
//
// Wikimedia deliberately returns a mix: CC0, public domain, CC-BY-SA and
// CC-BY. The last two MUST be dropped - redistributing them inside the
// extension without carrying their attribution chain would breach the licence -
// and a test that only ever saw well-licensed results would not notice if that
// filter were deleted.
import http from 'node:http';
import { makePng } from './png.mjs';

export async function startFakeArchives({ rateLimitFirstCall = false } = {}) {
    let pexelsCalls = 0;

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const json = (obj, status = 200) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
        };

        if (url.pathname === '/v1/images/') {
            const q = url.searchParams.get('q') || '';
            const n = Number(url.searchParams.get('page_size') || 6);
            // The stage must be asking for redistributable work only.
            if (url.searchParams.get('license') !== 'cc0,pdm') return json({ results: [] });
            return json({
                results: Array.from({ length: Math.min(n, 3) }, (_, i) => ({
                    id: 'ov-' + q.replace(/\W+/g, '') + '-' + i,
                    title: q + ' ' + i,
                    creator: 'Openverse Contributor ' + i,
                    license: i % 2 ? 'cc0' : 'pdm',
                    license_version: '1.0',
                    foreign_landing_url: 'https://example.invalid/ov/' + i,
                    thumbnail: 'http://127.0.0.1:' + server.address().port + '/img/ov' + i + '.png'
                }))
            });
        }

        if (url.pathname === '/w/api.php') {
            const search = url.searchParams.get('gsrsearch') || '';
            const port = server.address().port;
            // Two keepable, two that must be filtered out.
            const licences = ['CC0', 'CC BY-SA 4.0', 'Public domain', 'CC BY 3.0'];
            const pages = {};
            licences.forEach((lic, i) => {
                pages['p' + i] = {
                    pageid: 1000 + i,
                    title: 'File:' + search.split(' ')[0] + '-' + i + '.jpg',
                    imageinfo: [{
                        descriptionurl: 'https://example.invalid/wm/' + i,
                        thumburl: 'http://127.0.0.1:' + port + '/img/wm' + i + '.png',
                        extmetadata: {
                            LicenseShortName: { value: lic },
                            Artist: { value: '<a href="#">Wiki Author ' + i + '</a>' }
                        }
                    }]
                };
            });
            return json({ query: { pages } });
        }

        if (url.pathname === '/v1/search') {
            pexelsCalls++;
            if (!req.headers.authorization) return json({ error: 'no key' }, 401);
            if (rateLimitFirstCall && pexelsCalls === 1) return json({ error: 'slow down' }, 429);
            const q = url.searchParams.get('query') || '';
            const port = server.address().port;
            return json({
                photos: Array.from({ length: 2 }, (_, i) => ({
                    id: 900 + i,
                    alt: q,
                    photographer: 'Pexels Photographer ' + i,
                    url: 'https://example.invalid/px/' + i,
                    src: { large: 'http://127.0.0.1:' + port + '/img/px' + i + '.png' }
                }))
            });
        }

        if (url.pathname.startsWith('/img/')) {
            const seed = url.pathname.length + url.pathname.charCodeAt(5);
            res.writeHead(200, { 'Content-Type': 'image/png' });
            return res.end(makePng(640, 360, seed));
        }

        res.writeHead(404); res.end();
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    return { base, server, stop: () => server.close(), calls: () => ({ pexelsCalls }) };
}
