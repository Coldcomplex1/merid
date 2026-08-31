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

/**
 * @param {object}  [opts]
 * @param {boolean} [opts.rateLimitFirstCall] 429 the first Pexels call only.
 * @param {boolean} [opts.rateLimitPexels]    429 EVERY Pexels call, for as long
 *   as the server is up. This is the case that used to cost a minute an entry:
 *   stage 03 slept RATE_WAIT_MS, retried, was refused again, and did it all
 *   over on the next word. A test for it has to be able to keep saying no.
 */
export async function startFakeArchives({
    rateLimitFirstCall = false,
    rateLimitPexels = false
} = {}) {
    // The key runFetch and the preflight cases pass. Anything else is refused,
    // which is what lets a test tell a good key from a bad one.
    const PEXELS_KEY = 'test-key';
    let pexelsCalls = 0;
    let openverseCalls = 0;
    let wikimediaCalls = 0;

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const json = (obj, status = 200) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
        };

        if (url.pathname === '/v1/images/') {
            openverseCalls++;
            const q = url.searchParams.get('q') || '';
            const n = Number(url.searchParams.get('page_size') || 6);
            // The stage must be asking for redistributable work only.
            if (url.searchParams.get('license') !== 'cc0,pdm,by') return json({ results: [] });
            // One of these is share-alike, which the archive was NOT asked for.
            // It is here because an archive answering with something outside
            // the filter is exactly what the stage's own re-check is for: the
            // question is what the file is licensed as, not what a search
            // engine believed.
            const licences = [
                { license: 'cc0', license_version: '1.0' },
                { license: 'by', license_version: '4.0' },
                { license: 'by-sa', license_version: '4.0' }
            ];
            return json({
                results: Array.from({ length: Math.min(n, licences.length) }, (_, i) => ({
                    id: 'ov-' + q.replace(/\W+/g, '') + '-' + i,
                    title: q + ' ' + i,
                    creator: 'Openverse Contributor ' + i,
                    ...licences[i],
                    license_url: 'https://example.invalid/deed/' + licences[i].license,
                    foreign_landing_url: 'https://example.invalid/ov/' + i,
                    thumbnail: 'http://127.0.0.1:' + server.address().port + '/img/ov' + i + '.png'
                }))
            });
        }

        if (url.pathname === '/w/api.php') {
            wikimediaCalls++;
            const search = url.searchParams.get('gsrsearch') || '';
            const port = server.address().port;
            // Three keepable, three that must be filtered out. Every refusal
            // here is a different obligation the project declined: share-alike
            // on a crop, no-derivatives against a crop, non-commercial next to
            // a commercial store.
            const licences = [
                'CC0', 'CC BY-SA 4.0', 'Public domain',
                'CC BY 3.0', 'CC BY-ND 4.0', 'CC BY-NC 2.0'
            ];
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
                            LicenseUrl: { value: 'https://example.invalid/wm-deed/' + i },
                            Artist: { value: '<a href="#">Wiki Author ' + i + '</a>' }
                        }
                    }]
                };
            });
            return json({ query: { pages } });
        }

        if (url.pathname === '/v1/search') {
            pexelsCalls++;
            // Pexels rejects a wrong key exactly as it rejects a missing one, and
            // the difference matters to run.mjs's preflight: "no key" is a NOTE
            // it prints without asking anybody, "wrong key" is a refusal only
            // the archive can report. So the fixture has to be able to say the
            // second, which means knowing which key is the right one.
            if (req.headers.authorization !== PEXELS_KEY) {
                return json({ error: 'invalid api key' }, 401);
            }
            if (rateLimitPexels) return json({ error: 'slow down' }, 429);
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
    return {
        base, server,
        stop: () => server.close(),
        calls: () => ({ pexelsCalls, openverseCalls, wikimediaCalls })
    };
}
