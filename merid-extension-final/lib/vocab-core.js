/**
 * vocab-core.js - pure, DOM-free helpers shared by the content script and the
 * Node test suite.
 *
 * Loaded two ways:
 *   - As the FIRST content script in the extension (classic script). It attaches
 *     its API to `globalThis.VMCore`, which the other content scripts read.
 *   - As a CommonJS module in `node --test` (`require('../lib/vocab-core.js')`).
 *
 * Keep this file free of `chrome.*`, `window`, `document` and any DOM access so
 * it stays unit-testable. This file performs NO network access - all matching
 * and CSV handling is pure and local.
 *
 * @typedef {Object} VocabularyEntry
 * @property {string}  id           Stable id: `${dataset}:${word}`.
 * @property {string}  word         English headword (the replacement).
 * @property {string}  vietnamese   Comma-separated Vietnamese meanings.
 * @property {("SAT"|"B2"|"C1"|"C2")} dataset
 * @property {string}  [type]       Part of speech.
 * @property {string}  [definition]
 * @property {string}  [example]
 * @property {string}  [synonyms]   Comma-separated.
 * @property {string}  [antonyms]   Comma-separated.
 * @property {string}  [phon_br]
 * @property {string}  [phon_n_am]
 */

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMCore = api;         // content-script isolated world
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ---------------------------------------------------------------------
    // Dataset registry - adding a new dataset (e.g. B2) is a drop-in: place
    // `dataset-B2.csv` in the repo, add a row here, add a button in the UI.
    // ---------------------------------------------------------------------
    // Listed in the order the two UIs show them, CEFR first: C1 is where most
    // readers start, so it leads and it is the default.
    //
    // `all.files` keeps its own order (SAT, C1, C2) whatever this one is:
    // duplicate headwords keep the FIRST row, so reordering that array would
    // quietly change which entry a shared word resolves to.
    const DATASET_REGISTRY = {
        c1: { label: 'C1', files: ['dataset-C1.csv'], tag: 'C1' },
        c2: { label: 'C2', files: ['dataset-C2.csv'], tag: 'C2' },
        // b2: { label: 'B2', files: ['dataset-B2.csv'], tag: 'B2' }, // TODO: add dataset-B2.csv
        sat: { label: 'SAT', files: ['dataset-SAT.csv'], tag: 'SAT' },
        all: { label: 'All', files: ['dataset-SAT.csv', 'dataset-C1.csv', 'dataset-C2.csv'], tag: 'ALL' }
    };

    // What a reader gets before they choose anything, and what every fallback
    // path lands on. One name so the two can never drift apart.
    const DEFAULT_DATASET_KEY = 'c1';

    function getDatasetFiles(key) {
        if (isCustomKey(key)) return []; // custom datasets load from storage, not bundled files
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY[DEFAULT_DATASET_KEY];
        return entry.files;
    }

    function datasetTagFor(key) {
        if (isCustomKey(key)) return 'CUSTOM';
        const entry = DATASET_REGISTRY[key] || DATASET_REGISTRY[DEFAULT_DATASET_KEY];
        return entry.tag;
    }

    // ---------------------------------------------------------------------
    // Custom (user-uploaded) datasets - key format and limits.
    //
    // A custom dataset is selected with datasetKey = `custom:<stable-id>`;
    // its validated entries live in chrome.storage.local (see
    // lib/custom-datasets.js), never in bundled files and never in
    // chrome.storage.sync.
    // ---------------------------------------------------------------------
    const CUSTOM_KEY_PREFIX = 'custom:';

    function isCustomKey(key) {
        return typeof key === 'string' && key.indexOf(CUSTOM_KEY_PREFIX) === 0;
    }

    function customIdFromKey(key) {
        return isCustomKey(key) ? key.slice(CUSTOM_KEY_PREFIX.length) : null;
    }

    function customKeyFor(id) {
        return CUSTOM_KEY_PREFIX + id;
    }

    // Shared by the options page (preview), the service worker (import) and
    // the docs, so the numbers can never drift apart.
    const CUSTOM_LIMITS = {
        MAX_FILE_CHARS: 2 * 1024 * 1024, // ~2 MB of CSV text
        MAX_ROWS: 5000,                  // data rows per dataset (excluding header)
        MAX_DATASETS: 10,
        MAX_NAME_LEN: 40,
        MAX_ERRORS_REPORTED: 20,         // sample size; stats still count everything
        FIELD_MAX: {
            word: 64, type: 32, cefr: 16, phon_br: 64, phon_n_am: 64,
            definition: 512, example: 1024, vietnamese: 256, synonyms: 256, antonyms: 256
        }
    };

    const CUSTOM_REQUIRED_COLUMNS = ['word', 'vietnamese'];
    const CUSTOM_KNOWN_COLUMNS = ['word', 'type', 'cefr', 'phon_br', 'phon_n_am',
        'definition', 'example', 'vietnamese', 'synonyms', 'antonyms'];

    // ---------------------------------------------------------------------
    // English → English is temporarily withdrawn from the product.
    //
    // The direction itself is finished and works - buildVocabMap indexes it,
    // the scan handles it, the setting persists - it is simply not something
    // Merid offers right now. One flag rather than deleted code: the popup and
    // the Settings page hide their card while it is false, and the scan ignores
    // a stored engEngMode, so nobody is left with a direction running that they
    // have no way to switch off. Flip it to true and everything comes back,
    // including for readers who had turned it on.
    // ---------------------------------------------------------------------
    const ENG_ENG_AVAILABLE = false;

    /** The scan directions this build actually offers, from stored settings. */
    function activeModes(settings) {
        const s = settings || {};
        return [
            s.vieEngMode && 'vieEng',
            ENG_ENG_AVAILABLE && s.engEngMode && 'engEng'
        ].filter(Boolean);
    }

    // ---------------------------------------------------------------------
    // Whether this build draws a picture on the learning card at all.
    //
    // Same shape as ENG_ENG_AVAILABLE above. It was false for 1.7.1, which
    // withdrew the picture a day after 1.7.0 introduced it: the artwork had
    // never been generated, so every card fell through to a coloured box with
    // the word's first letter in it, and a page of those reads as a bug.
    //
    // True again now, and the reason it is safe to be true is no longer "the
    // artwork is there" - it is that visualFor draws only what the index
    // actually names (lib/visual.js) and returns null for everything else. A
    // checkout with no vis/ at all therefore shows cards with no picture panel,
    // which is what 1.7.1 shipped, rather than the letters that made it
    // necessary. The flag stays because the toggle in two UIs and the fetch in
    // the worker all read it, and one switch is still worth having.
    // ---------------------------------------------------------------------
    const VISUALS_AVAILABLE = true;

    /** Whether this build draws a picture on the card, from stored settings. */
    function visualsActive(settings) {
        return VISUALS_AVAILABLE && (settings || {}).visualsEnabled !== false;
    }

    // ---------------------------------------------------------------------
    // Settings model + defaults (single source of truth for both UIs).
    // Local-only: no context-check mode, no backend URL, no API keys.
    // ---------------------------------------------------------------------
    const DEFAULT_SETTINGS = {
        extensionEnabled: true,
        frequency: 50,               // 0..100 - drives BOTH the per-phrase gate and the per-post word budget
        replacementMode: 'highlight',// 'replace' | 'highlight' | 'beside'
        vieEngMode: true,            // match Vietnamese meanings -> show English
        engEngMode: false,           // match English synonyms -> show headword
        datasetKey: DEFAULT_DATASET_KEY,
        // Which palette the learning card wears: 'light' | 'dark'. The reader's
        // call, from the popup header - not something Merid infers from the page
        // it landed on. Light is the card as it was designed, so it is default.
        cardTheme: 'light',
        // Language of the extension's own pages (popup + Settings), NOT of the
        // learning card, which is always English. 'auto' follows merid.site's
        // VI/EN toggle, and the browser's language before the reader has been
        // there. See lib/i18n.js.
        uiLang: 'auto',              // 'auto' | 'en' | 'vi'
        siteLang: '',                // last language chosen on merid.site
        disabledSites: [],           // canonical hostnames the user paused Merid on
        allowedSites: [],            // default-off hostnames the user turned back on
        // AI context check. ON by default now that it needs no setup from the
        // reader: Merid supplies the keys and meters usage server-side. It was
        // off while it required them to create their own API key, which made
        // opting in the only honest default. Turning it off in Settings stops
        // every request - nothing leaves the device with this false.
        aiCheckEnabled: true,
        // The picture on the learning card. ON by default: every image ships
        // inside the extension, so this makes no network request and changes
        // nothing about what leaves the device. A version that hotlinked to an
        // image host would have had to default to off.
        //
        // Adding a setting here is only half of it - background.js asks
        // storage.sync for an explicit list of keys, and a key missing from
        // THAT list always reads back as this default no matter what the reader
        // chose. See the note on 'getSettings'.
        visualsEnabled: true
    };

    // ---------------------------------------------------------------------
    // Per-site pause list ("Turn off on this site" in the popup).
    // Stored in chrome.storage.sync as canonical hostnames.
    // ---------------------------------------------------------------------

    /** Canonical form used for storing/comparing sites: lowercase, no "www." */
    function canonicalHost(hostname) {
        const h = String(hostname || '').toLowerCase().trim();
        return h.indexOf('www.') === 0 ? h.slice(4) : h;
    }

    /**
     * Sites Merid never touches, regardless of settings, and that the user
     * cannot switch back on. Two things put a site here:
     *
     *  - The page is private. The AI context check sends 180-character
     *    sentence snippets off the device (background.js aiCheckContext), and
     *    it is on by default. A DM thread, an inbox, a bank statement or a
     *    government form is not ours to sample, so we never read those pages
     *    at all rather than trusting a setting to be off.
     *  - Getting a word wrong there costs real money or access - payment
     *    flows, sign-in screens, password vaults.
     *
     * Our own site is here for a softer reason: reading about the extension
     * while the extension rewrites the page is genuinely unpleasant - the
     * marketing copy, the tutorial and the deck all say specific words on
     * purpose, and swapping them makes the product look broken. The
     * content-bridge script (sign-in + deck sync) still runs on merid.site;
     * only the word swapping is off.
     *
     * Matching is hostname-only (see matchesHostList), which has one honest
     * gap: Facebook, Instagram and X serve DMs and the feed from the same
     * host, and the feed is one of the best surfaces Merid has. Those DMs
     * cannot be excluded without losing the feed, so they are not here. Same
     * for anything self-hosted - a company webmail, a school's Moodle, a
     * hospital's patient portal on its own domain. The per-site pause in the
     * popup covers those.
     *
     * An entry covers its subdomains, so apex hosts are used wherever the
     * whole property is private, and specific subdomains where the parent is
     * a fine thing to read (mail.google.com, not google.com).
     */
    const BLOCKED_BY_CATEGORY = {
        own: ['merid.site'],

        messaging: [
            'messenger.com', 'm.me', 'whatsapp.com', 'telegram.org', 't.me',
            'zalo.me', 'discord.com', 'discordapp.com', 'slack.com',
            'teams.microsoft.com', 'teams.live.com', 'chat.google.com',
            'meet.google.com', 'zoom.us', 'messages.google.com',
            'messages.android.com', 'voice.google.com', 'chat.reddit.com',
            'signal.org', 'line.me', 'viber.com', 'skype.com', 'wechat.com',
            'weixin.qq.com', 'kakao.com'
        ],

        email: [
            'mail.google.com', 'outlook.com', 'outlook.live.com',
            'outlook.office.com', 'outlook.office365.com', 'mail.yahoo.com',
            'proton.me', 'protonmail.com', 'icloud.com', 'fastmail.com',
            'hey.com', 'tuta.com', 'tutanota.com', 'mail.zoho.com', 'mail.ru',
            'mail.qq.com', 'mail.163.com'
        ],

        // Representative, not exhaustive - there is no complete list of the
        // world's banks, and a missing one is not a bug. Readers pause anything
        // else from the popup.
        banking: [
            'paypal.com', 'stripe.com', 'wise.com', 'revolut.com', 'venmo.com',
            'cash.app', 'americanexpress.com', 'chase.com', 'bankofamerica.com',
            'wellsfargo.com', 'citi.com', 'capitalone.com', 'hsbc.com',
            'barclays.co.uk', 'fidelity.com', 'schwab.com', 'vanguard.com',
            'robinhood.com', 'coinbase.com', 'binance.com', 'kraken.com',
            'vietcombank.com.vn', 'techcombank.com.vn', 'vietinbank.vn',
            'bidv.com.vn', 'agribank.com.vn', 'acb.com.vn', 'mbbank.com.vn',
            'vpbank.com.vn', 'sacombank.com.vn', 'tpb.vn', 'vib.com.vn',
            'hdbank.com.vn', 'msb.com.vn', 'ocb.com.vn', 'momo.vn',
            'zalopay.vn', 'vnpay.vn', 'cake.vn', 'timo.vn'
        ],

        auth: [
            'accounts.google.com', 'login.microsoftonline.com', 'login.live.com',
            'appleid.apple.com', 'login.yahoo.com', 'okta.com', 'auth0.com',
            'onelogin.com', 'duosecurity.com', 'authy.com', '1password.com',
            'bitwarden.com', 'lastpass.com', 'dashlane.com', 'keepersecurity.com',
            'nordpass.com'
        ],

        health: [
            'nhs.uk', 'healthcare.gov', 'medicare.gov', 'teladoc.com',
            'zocdoc.com', 'goodrx.com', '23andme.com'
        ],

        // Named services where the page is somebody's tax return, benefits
        // claim or identity record. The general gov TLDs are the *soft* list
        // below - blocking every *.gov outright would cost a reader nasa.gov
        // and nih.gov, which are some of the best free English on the web.
        publicServices: [
            'irs.gov', 'ssa.gov', 'uscis.gov', 'studentaid.gov', 'login.gov',
            'id.me', 'my.gov.au', 'dichvucong.gov.vn', 'thuedientu.gdt.gov.vn',
            'baohiemxahoi.gov.vn', 'vneid.gov.vn'
        ],

        // Proctored exams are hard-blocked rather than default-off: an
        // extension mutating the DOM mid-exam is an academic-integrity hazard,
        // not a matter of taste.
        exams: [
            'proctorio.com', 'honorlock.com', 'examity.com', 'respondus.com',
            'ets.org'
        ]
    };

    const BUILTIN_BLOCKED_HOSTS = Object.freeze(
        Object.values(BLOCKED_BY_CATEGORY).flat());

    /**
     * Private PAGES on sites that are otherwise Merid's whole point.
     *
     * Facebook, Instagram, X and the rest serve direct messages from the same
     * hostname as the feed. Blocking the host would take the feed with it -
     * scrolling one is the single most common way anyone uses this extension -
     * so the host list above cannot express "not the messages". This can.
     *
     * The stake is not that a swapped word looks odd in a chat. It is that the
     * context check sends a 180-character snippet around each candidate off the
     * device, and it is on by default: a DM is not ours to sample, and the only
     * safe way to keep it that way is never to read the page at all.
     *
     * Prefixes match on segment boundaries, so /messages covers /messages/t/123
     * and never /messagesomething. Each host's entry covers its subdomains
     * (m.facebook.com, www) the same way the host lists do.
     *
     * This will never be complete - a product can add an inbox at a new path
     * tomorrow. It is a floor, not a fence, and the reader can still pause any
     * site outright from the popup.
     */
    const BLOCKED_PATHS = {
        // /messages is the inbox and every thread; /e2ee/t is an encrypted
        // thread opened from Messenger; Marketplace keeps its chat of its own.
        'facebook.com': ['/messages', '/e2ee/t', '/marketplace/inbox'],
        'instagram.com': ['/direct'],
        'x.com': ['/messages'],
        'twitter.com': ['/messages'],
        'linkedin.com': ['/messaging'],
        'tiktok.com': ['/messages'],
        'reddit.com': ['/chat']
    };

    /** True when `path` is `prefix` or lies underneath it. */
    function pathUnder(path, prefix) {
        return path === prefix || path.indexOf(prefix + '/') === 0;
    }

    /**
     * True when this exact page is one Merid must not read, whatever the site
     * around it is allowed to do. Takes a full URL - the path is the point.
     *
     * Anything that is not an http(s) URL answers false: the caller has no page
     * to scan there anyway, and guessing about chrome:// or a blob would only
     * add ways to be wrong.
     */
    function isUrlBlocked(url) {
        let parsed;
        try {
            parsed = new URL(String(url || ''));
        } catch (e) {
            return false;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        const host = canonicalHost(parsed.hostname);
        // Trailing slash off, so /messages/ is the same page as /messages.
        const path = parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
            ? parsed.pathname.slice(0, -1)
            : parsed.pathname;
        return Object.keys(BLOCKED_PATHS).some(site =>
            matchesHostList(host, [site]) &&
            BLOCKED_PATHS[site].some(prefix => pathUnder(path, prefix)));
    }

    /**
     * Chat that floats over a page Merid is otherwise welcome on: the message
     * popups pinned to the corner of a feed, where the URL never changes and
     * `isUrlBlocked` has nothing to go on.
     *
     * Per host, and deliberately short. These are the attributes each site uses
     * to label the surface itself, which is the most stable thing about markup
     * that is otherwise generated. Facebook and Instagram are absent on purpose:
     * their popups are `role="dialog"`, which content.js already refuses to scan
     * everywhere (SKIP_REGION_SELECTOR).
     *
     * Best effort, and honestly so - a site can rename these tomorrow. The
     * deterministic protection is the path list above; this is what catches the
     * cases a path cannot see.
     */
    // What these sites call a chat window, in the terms they hand a screen
    // reader - the one part of a generated DOM that has to stay meaningful,
    // where the class names are `x78zum5 xdt5ytf` and change without notice.
    //
    // `role="log"` leads because it is the standard role for a transcript that
    // updates as it goes, and it says so in every language: Facebook wraps a
    // Messenger conversation in one. Taken from a real thread a reader
    // captured, where there was no dialog anywhere above the message, the whole
    // ancestry was `role="presentation"`, and the only two things that meant
    // anything were that role and a Vietnamese label - hence both, and hence
    // the labels in both languages, since that one follows the reader's own
    // Facebook setting rather than ours.
    const CHAT_LABEL_SELECTOR =
        '[role="log"], [role="dialog"], ' +
        '[aria-label*="chat" i], [aria-label*="message" i], ' +
        '[aria-label*="tin nhắn" i], [aria-label*="trò chuyện" i], ' +
        '[aria-label*="đoạn chat" i]';

    const CHAT_SURFACE_SELECTORS = {
        // The popups pinned to the corner of the feed, and the Messenger panel
        // that opens beside it. Both are labelled; neither has a URL of its own.
        'facebook.com': CHAT_LABEL_SELECTOR,
        'instagram.com': CHAT_LABEL_SELECTOR,
        'threads.net': CHAT_LABEL_SELECTOR,
        'x.com': CHAT_LABEL_SELECTOR + ', [data-testid="DMDrawer"], [data-testid="dmDrawer"]',
        'twitter.com': CHAT_LABEL_SELECTOR + ', [data-testid="DMDrawer"], [data-testid="dmDrawer"]',
        'linkedin.com': CHAT_LABEL_SELECTOR + ', [class*="msg-overlay" i]',
        'tiktok.com': CHAT_LABEL_SELECTOR,
        'reddit.com': CHAT_LABEL_SELECTOR
    };

    /** The chat-surface selector for a host, or '' when it has none. */
    function chatSurfaceSelector(hostname) {
        const host = canonicalHost(hostname);
        const site = Object.keys(CHAT_SURFACE_SELECTORS)
            .find(s => matchesHostList(host, [s]));
        return site ? CHAT_SURFACE_SELECTORS[site] : '';
    }

    /**
     * Sites Merid stays off on until the reader says otherwise. Nothing here is
     * private - it is where a swapped word is simply wrong:
     *
     *  - Editors and code sandboxes: the text on screen is the reader's own
     *    work, and a highlight over it reads as corruption. (content.js already
     *    skips <code>, <pre> and contenteditable, which covers plain markup;
     *    these are the editors that paint code into ordinary divs.)
     *  - Dictionaries, translators and language apps: replacing the word being
     *    looked up defeats the page.
     *  - Coursework: an altered question is a worse answer.
     *  - Government sites at large: mostly fine to read, occasionally a form.
     *    Off by default, one click to read nasa.gov with Merid on.
     *
     * Unlike BUILTIN_BLOCKED_HOSTS these are a default, not a rule - the popup
     * offers "Turn on for this site" and stores the choice in allowedSites.
     */
    const DEFAULT_OFF_BY_CATEGORY = {
        documents: [
            'docs.google.com', 'sheets.google.com', 'slides.google.com',
            'drive.google.com', 'keep.google.com', 'office.com',
            'office.live.com', 'onedrive.live.com', 'sharepoint.com',
            'notion.so', 'notion.com', 'coda.io', 'quip.com', 'airtable.com',
            'evernote.com', 'paper.dropbox.com', 'figma.com', 'canva.com',
            'overleaf.com', 'grammarly.com', 'hackmd.io'
        ],

        // Deliberately not github.com or gitlab.com: READMEs, issues and PR
        // descriptions are prime reading, and file blobs already land in
        // <pre>/<code>, which the content script skips.
        code: [
            'github.dev', 'vscode.dev', 'codesandbox.io', 'stackblitz.com',
            'replit.com', 'glitch.com', 'codepen.io', 'jsfiddle.net',
            'jsbin.com', 'observablehq.com', 'gitpod.io', 'godbolt.org',
            'colab.research.google.com', 'kaggle.com', 'leetcode.com',
            'hackerrank.com', 'hackerearth.com', 'codility.com', 'codeforces.com'
        ],

        reference: [
            'translate.google.com', 'deepl.com', 'translate.yandex.com',
            'linguee.com', 'reverso.net', 'glosbe.com', 'wordreference.com',
            'dictionary.com', 'thesaurus.com', 'merriam-webster.com',
            'dictionary.cambridge.org', 'oxfordlearnersdictionaries.com',
            'collinsdictionary.com', 'ldoceonline.com', 'oed.com',
            'vocabulary.com', 'thefreedictionary.com', 'wiktionary.org',
            'vdict.com', 'laban.vn', 'tratu.soha.vn'
        ],

        learning: [
            'duolingo.com', 'memrise.com', 'busuu.com', 'babbel.com',
            'quizlet.com', 'ankiweb.net', 'kahoot.it', 'quizizz.com',
            'classroom.google.com', 'instructure.com', 'blackboard.com',
            'moodlecloud.com', 'moodle.org', 'schoology.com', 'ielts.org',
            'azota.vn', 'shub.edu.vn', 'olm.vn', 'hocmai.vn', 'onluyen.vn',
            'vnedu.vn', 'k12online.vn'
        ],

        // These lean on the subdomain rule: 'gov' covers every *.gov host,
        // 'gov.vn' every Vietnamese government site.
        government: [
            'gov', 'gov.vn', 'gov.uk', 'gov.au', 'gov.sg', 'gov.in', 'gov.hk',
            'gov.my', 'gov.ph', 'gov.za', 'gov.ie', 'gov.br', 'gov.cn', 'mil',
            'gc.ca', 'canada.ca', 'gouv.fr', 'bund.de', 'admin.ch', 'europa.eu',
            'go.jp', 'go.kr', 'go.th', 'go.id', 'govt.nz', 'gob.mx'
        ]
    };

    const DEFAULT_OFF_HOSTS = Object.freeze(
        Object.values(DEFAULT_OFF_BY_CATEGORY).flat());

    /** Headings for the built-in lists on the options page. */
    const SITE_CATEGORY_LABELS = {
        own: 'Merid',
        messaging: 'Messaging and calls',
        email: 'Email',
        banking: 'Banking and payments',
        auth: 'Sign-in and password managers',
        health: 'Health',
        publicServices: 'Tax, benefits and identity',
        exams: 'Proctored exams',
        documents: 'Documents you are writing',
        code: 'Code editors and sandboxes',
        reference: 'Dictionaries and translators',
        learning: 'Coursework and language apps',
        government: 'Government sites'
    };

    /** Longest list we will write to storage.sync (8 KB per item there). */
    const MAX_SITE_LIST = 200;

    /** True when the host is on the built-in blocklist (not user-editable). */
    function isHostBlocked(hostname) {
        return matchesHostList(canonicalHost(hostname), BUILTIN_BLOCKED_HOSTS);
    }

    /** True when the host ships off by default but the reader may switch it on. */
    function isHostDefaultOff(hostname) {
        return matchesHostList(canonicalHost(hostname), DEFAULT_OFF_HOSTS);
    }

    /** Which built-in category blocks this host, or null. Drives popup copy. */
    function blockedCategory(hostname) {
        const host = canonicalHost(hostname);
        if (!host) return null;
        return Object.keys(BLOCKED_BY_CATEGORY)
            .find(key => matchesHostList(host, BLOCKED_BY_CATEGORY[key])) || null;
    }

    /** Shared matcher: an entry covers its exact host and every subdomain. */
    function matchesHostList(host, list) {
        if (!host || !Array.isArray(list)) return false;
        return list.some(site => {
            const s = canonicalHost(site);
            return s && (host === s || host.endsWith('.' + s));
        });
    }

    /**
     * True when Merid must not run on `hostname`. An entry in any list covers
     * its exact host and every subdomain (news.example.com matches
     * example.com), so pausing a site holds across its www/mobile/amp
     * variants.
     *
     * Precedence, first match wins:
     *   1. the built-in blocklist  -> off, and allowedSites cannot lift it
     *   2. the reader's pause list -> off (an explicit pause beats an explicit
     *      allow, which only matters if both lists were edited by hand)
     *   3. the default-off list    -> off unless the host is in allowedSites
     *   4. otherwise               -> on
     *
     * `allowedSites` is optional: callers that predate it (and the tests that
     * cover the pause list on its own) pass two arguments, which leaves the
     * default-off list simply off - the right answer for a caller that has no
     * opinion.
     */
    function isSiteDisabled(hostname, disabledSites, allowedSites) {
        const host = canonicalHost(hostname);
        if (!host) return false;
        if (matchesHostList(host, BUILTIN_BLOCKED_HOSTS)) return true;
        if (matchesHostList(host, disabledSites)) return true;
        return matchesHostList(host, DEFAULT_OFF_HOSTS) &&
            !matchesHostList(host, allowedSites);
    }

    /**
     * Which of the four site states the popup should render:
     *   'blocked'     - built-in, no toggle
     *   'paused'      - the reader turned it off
     *   'default-off' - ships off, one click turns it on
     *   'on'          - running
     */
    function siteToggleState(hostname, disabledSites, allowedSites) {
        const host = canonicalHost(hostname);
        if (matchesHostList(host, BUILTIN_BLOCKED_HOSTS)) return 'blocked';
        if (matchesHostList(host, disabledSites)) return 'paused';
        if (matchesHostList(host, DEFAULT_OFF_HOSTS)) {
            return matchesHostList(host, allowedSites) ? 'on' : 'default-off';
        }
        return 'on';
    }

    /** Add a host to a site list: canonical, deduped, capped. Never mutates. */
    function addSiteToList(list, hostname) {
        const host = canonicalHost(hostname);
        const current = Array.isArray(list) ? list.map(canonicalHost).filter(Boolean) : [];
        if (!host || current.indexOf(host) !== -1) return current;
        return current.concat(host).slice(0, MAX_SITE_LIST);
    }

    /**
     * Drop every entry that covers `hostname`. An apex entry also covers its
     * subdomains, so removing it re-enables all of them - which is what the
     * reader means by "turn this back on". Never mutates.
     */
    function removeSiteFromList(list, hostname) {
        const host = canonicalHost(hostname);
        if (!host || !Array.isArray(list)) return Array.isArray(list) ? list.slice() : [];
        return list.map(canonicalHost).filter(s =>
            s && !(host === s || host.endsWith('.' + s)));
    }

    const REPLACEMENT_MODES = ['replace', 'highlight', 'beside'];

    /** Fill missing keys with defaults without mutating the input. */
    function withDefaults(settings) {
        return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    // ---------------------------------------------------------------------
    // Intensity: a 0..100 number the reader sets, three levels it resolves to.
    //
    // `frequency` is the stored value and the popup slider moves freely across
    // its whole range, so it holds any number, not just the three anchors
    // below. Everything downstream still asks for a level: normalizeIntensity()
    // and levelOf() do that conversion, and POST_WORD_CAPS is the actual
    // policy. So 51 and 64 buy the same thing - which is why the popup names
    // the level it lands on while the reader drags, rather than letting the
    // track imply a precision the policy does not have.
    //
    // The anchors are what the options page's three buttons write, and what
    // the popup shows as the middle of each level's range.
    // ---------------------------------------------------------------------
    const INTENSITY_LEVELS = ['casual', 'focused', 'locked'];
    const INTENSITY_TO_FREQUENCY = {
        casual: 25, focused: 50, locked: 80,
        // Legacy aliases - settings saved by older versions, and options.html's
        // segmented control, still use these names.
        light: 25, medium: 50, heavy: 80
    };
    function intensityToFrequency(mode) {
        return INTENSITY_TO_FREQUENCY[mode] != null ? INTENSITY_TO_FREQUENCY[mode] : 50;
    }
    function frequencyToIntensity(freq) {
        if (freq <= 35) return 'light';
        if (freq <= 65) return 'medium';
        return 'heavy';
    }

    /** Snap any stored frequency (including in-between values written by older
     *  versions) to one of the three levels. */
    function normalizeIntensity(freq) {
        const f = Number(freq);
        if (!isFinite(f)) return 'focused';   // unreadable setting -> the default
        if (f <= 35) return 'casual';
        if (f <= 65) return 'focused';
        return 'locked';
    }

    /**
     * How many words Merid may replace in one post/article.
     *
     * Rows are post length in words, columns are the three intensity levels.
     * A Facebook-sized post gets one word (two when the reader asked for
     * locked-in); a normal article tops out at three; only genuinely long
     * pieces earn the extra one or two, because a reader who has scrolled
     * through 2000 words has room for them.
     *
     * This table is the whole policy - to retune how much Merid translates,
     * change these numbers and nothing else.
     */
    // Every level must differ from its neighbours in EVERY row. It is not
    // enough for the table to make sense in aggregate: short posts used to give
    // focused and locked-in the same two words, and since a social feed is
    // nothing but short posts, dragging the slider to locked-in changed
    // literally nothing on the sites people use most.
    const POST_WORD_CAPS = [
        // maxWords, casual, focused, locked
        { upTo: 200, casual: 1, focused: 2, locked: 3 },
        { upTo: 1000, casual: 1, focused: 2, locked: 3 },
        { upTo: 2000, casual: 2, focused: 3, locked: 4 },
        { upTo: Infinity, casual: 3, focused: 4, locked: 5 }
    ];

    /**
     * Spare words to swap in beyond the cap, so the context check has
     * something to reject.
     *
     * The cap used to be applied while scanning, which made the AI check
     * purely subtractive: at casual a post got exactly one word, and if the
     * check disliked it the reader got nothing at all. Scanning now replaces
     * cap + this many candidates and the cap is applied AFTER the verdicts
     * come back, so it selects among words known to fit rather than truncating
     * blind. Two is enough slack to lose a couple of candidates without
     * turning every post into an AI request of its own.
     */
    const CANDIDATE_SURPLUS = 2;

    /** How many words the scan may replace before the context check prunes. */
    function postCandidateCap(intensity, postWords) {
        const cap = postWordCap(intensity, postWords);
        return cap > 0 ? cap + CANDIDATE_SURPLUS : 0;
    }

    /**
     * Choose `n` of `positions` spread as evenly as possible across the range
     * they span, so the words that survive the check are distributed through
     * the post instead of bunched in the opening lines.
     *
     * Divides the span from first to last into `n` equal bands and takes the
     * candidate nearest each band's centre, never picking the same one twice.
     *
     * @param {number[]} positions ascending offsets (px down the page, or any
     *                             monotonic measure of "how far into the post")
     * @param {number} n how many to keep
     * @returns {number[]} indices into `positions`, ascending
     */
    function pickSpread(positions, n) {
        const len = positions.length;
        if (n >= len) return positions.map((_, i) => i);
        if (n <= 0) return [];
        if (n === 1) return [0];   // one word: the first one the reader meets

        const first = positions[0];
        const last = positions[len - 1];
        const span = last - first;
        const taken = new Set();
        for (let k = 0; k < n; k++) {
            // Band centres, including both ends: k/(n-1) puts the first pick at
            // the top of the post and the last at the bottom.
            const target = first + (span * k) / (n - 1);
            let best = -1;
            let bestDist = Infinity;
            for (let i = 0; i < len; i++) {
                if (taken.has(i)) continue;
                const d = Math.abs(positions[i] - target);
                if (d < bestDist) { bestDist = d; best = i; }
            }
            if (best >= 0) taken.add(best);
        }
        return Array.from(taken).sort((a, b) => a - b);
    }

    /**
     * Cap for a post of `postWords` words at the given intensity.
     *
     * Note this reads the post's TOTAL length, not how much of it has been
     * scanned so far. The old streaming budget grew as the scan walked down
     * the page, which meant a long article kept earning more slots the further
     * you read; a flat per-post cap is what readers actually expect.
     *
     * @param {string|number} intensity level name, or a legacy 0..100 frequency
     * @param {number} postWords total words in the post
     */
    /**
     * Beyond the last row of the table the allowance stops being a flat number
     * and becomes a density: one more word per this many words of text.
     *
     * Without this the table's ceiling is absurd at the extremes - a 20,000
     * word page (an infinite feed that resolved to a single container, or a
     * very long piece) would get the same five words as a 2,100 word article,
     * so everything past the opening would be bare. These rates are far
     * gentler than the ones Merid shipped with originally (which ran to five
     * words per hundred); one per few hundred words is a reading aid, not a
     * rewrite.
     */
    const LONG_POST_WORDS_PER_EXTRA = { casual: 1200, focused: 800, locked: 600 };
    const LONG_POST_FROM = 2000;

    function levelOf(intensity) {
        if (typeof intensity === 'number') return normalizeIntensity(intensity);
        if (INTENSITY_LEVELS.indexOf(intensity) >= 0) return intensity;
        return normalizeIntensity(intensityToFrequency(intensity));
    }

    function postWordCap(intensity, postWords) {
        // Zero is still "off". The slider cannot produce it any more, but
        // installs that set it before the three-level change have it stored,
        // and a reader who turned Merid down to nothing meant it.
        if (Number(intensity) === 0) return 0;
        const level = levelOf(intensity);
        const words = Math.max(0, Number(postWords) || 0);
        const row = POST_WORD_CAPS.find(r => words <= r.upTo) || POST_WORD_CAPS[POST_WORD_CAPS.length - 1];
        const base = row[level];
        if (words <= LONG_POST_FROM) return base;
        return base + Math.floor((words - LONG_POST_FROM) / LONG_POST_WORDS_PER_EXTRA[level]);
    }

    /**
     * How much of a post's allowance may be spent by the time `wordsSeen` of
     * its `totalWords` have been scanned.
     *
     * The scan walks a post from top to bottom in one pass, so without this it
     * simply spends the whole allowance on the first candidates it meets - the
     * opening paragraphs get every word and the rest of the article gets none.
     * Releasing the allowance in proportion to how far in we are spreads the
     * words down the page instead. The floor of one is a head start, so a
     * short post still gets its first word immediately rather than waiting
     * until the reader is halfway through it.
     */
    // Below this a post is a single screenful and gets its whole allowance at
    // once; above it the allowance is released as the scan works down.
    const SPREAD_FROM_WORDS = 150;

    function spreadAllowance(cap, wordsSeen, totalWords) {
        if (!(cap > 0)) return 0;
        const total = Number(totalWords) || 0;
        if (total <= 0) return cap;                 // unmeasured: do not hold back
        // A short post is one screenful - there is no "further down the page"
        // to spread across, and holding words back only means a feed post that
        // could show two shows one. Spreading is for pieces long enough to
        // scroll through.
        if (total <= SPREAD_FROM_WORDS) return cap;
        const seen = Math.max(0, Number(wordsSeen) || 0);
        const share = Math.ceil(cap * Math.min(1, seen / total));
        return Math.max(1, Math.min(cap, share));
    }

    // Reused rather than rebuilt per call, and stepped with `test` rather than
    // collected with `match`. This is the hottest function in the extension -
    // the scan measures whole posts, and whole pages, with it - and `match`
    // with /g allocates an array holding EVERY word just to read its length,
    // which on a long feed is tens of thousands of throwaway strings. `test`
    // only advances lastIndex. The pattern can never match empty, so the loop
    // always makes progress.
    const WORD_RE = /[\p{L}\p{N}]+/gu;

    /** Word count used to size a post. Counts runs of letters/digits, so
     *  punctuation and emoji do not inflate a short caption into an article. */
    function countWords(text) {
        const s = String(text || '');
        WORD_RE.lastIndex = 0;
        let n = 0;
        while (WORD_RE.test(s)) n++;
        return n;
    }

    // ---------------------------------------------------------------------
    // Text helpers
    // ---------------------------------------------------------------------

    /** Canonical match key: lowercase + collapse whitespace. Accents are kept
     *  on purpose - they are meaningful in Vietnamese. */
    function normalizeKey(str) {
        return (str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    /** Accent-insensitive form (fuzzy fallback / tests). Not used for primary
     *  matching so we do not conflate distinct Vietnamese words. */
    function stripDiacritics(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }

    function escapeRegExp(string) {
        return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(string) {
        return (string || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Split text into tokens, keeping whitespace runs and single punctuation
     *  chars as their own tokens so the text can be losslessly reassembled.
     *  Word tokens contain ASCII word chars or Vietnamese letters (U+00C0..U+1EF9). */
    function tokenize(text) {
        return (text || '').split(/(\s+|[^\s\wÀ-ỹ])/g);
    }

    function isWordToken(token) {
        return !!token && /[\wÀ-ỹ]/.test(token);
    }

    // Quotes and brackets a writer may open a sentence with: they sit between
    // the full stop and the word without being either of them.
    const SENTENCE_LEAD_IN = /[\s"'“”‘’«»()\[\]]+$/u;

    /**
     * Does a word open a sentence, given the text running up to it?
     *
     * `before` is everything before the word inside its own block; empty means
     * the word opens the block, which is a sentence start by definition.
     *
     * Only `. ! ? …` end a sentence here. A colon, a semicolon or a bare
     * opening bracket must not, or "văn hóa (khó" comes back as "văn hóa
     * (Difficult"; and a date like "Ngày 20.8 khó" is left alone because what
     * precedes the space is a digit, not a stop.
     *
     * Deliberately not `isSentenceStart` below. That one answers a different
     * question for `bareSyllableIsSafe` and counts ':', ';' and quotes as
     * boundaries - right for "does this capital mean something", wrong for
     * "does this word carry the sentence's capital".
     */
    function opensSentence(before) {
        const lead = String(before || '').replace(SENTENCE_LEAD_IN, '');
        if (!lead) return true;
        return /[.!?…]$/.test(lead);
    }

    // ---------------------------------------------------------------------
    // Vocabulary map + phrase matching
    // ---------------------------------------------------------------------

    /**
     * Build a Map<searchKey, VocabularyEntry[]> from active vocabulary.
     * Values are ARRAYS so that a Vietnamese phrase mapping to several English
     * words (or vice-versa) does not silently overwrite earlier entries.
     *
     * `modes` accepts a single mode string OR an array of modes. Passing both
     * (`['vieEng','engEng']`) indexes Vietnamese meanings AND English synonyms in
     * one map, so a page can be scanned in both directions at once.
     *
     * @param {VocabularyEntry[]} activeVocab
     * @param {("vieEng"|"engEng")|Array<"vieEng"|"engEng">} modes
     */
    function buildVocabMap(activeVocab, modes) {
        const map = new Map();
        const modeList = (Array.isArray(modes) ? modes : [modes])
            .filter(Boolean);
        // Default to Vietnamese→English if nothing usable was passed.
        if (modeList.length === 0) modeList.push('vieEng');

        const compoundBigrams = new Set(SEED_COMPOUND_BIGRAMS);

        // Every adjacent syllable pair inside a multi-syllable Vietnamese key is,
        // by construction, a real Vietnamese compound - the dataset is its own
        // compound dictionary. See `bareSyllableIsSafe` for what this is for.
        const learnCompounds = (key) => {
            const parts = key.split(' ');
            for (let i = 0; i + 1 < parts.length; i++) {
                compoundBigrams.add(parts[i] + ' ' + parts[i + 1]);
            }
        };

        const addKey = (key, item, vietnamese) => {
            const k = normalizeKey(key);
            if (!k) return;
            if (vietnamese && k.includes(' ')) learnCompounds(k);
            const arr = map.get(k);
            if (arr) {
                if (!arr.some(e => e.word === item.word)) arr.push(item);
            } else {
                map.set(k, [item]);
            }
        };

        (activeVocab || []).forEach(item => {
            if (modeList.includes('engEng')) {
                (item.synonyms || '').split(',').forEach(s => addKey(s, item, false));
            }
            if (modeList.includes('vieEng')) {
                (item.vietnamese || '').split(',').forEach(s => addKey(s, item, true));
            }
        });
        // Hung off the map rather than returned separately so every existing
        // caller keeps working with a plain Map.
        map.compoundBigrams = compoundBigrams;
        return map;
    }

    /**
     * Longest Vietnamese phrase the scanner will try to match, in words.
     *
     * This used to be expressed in TOKENS, as a fixed [3,2,1] walk, and since
     * `tokenize` emits every whitespace run as its own token a 3-token window is
     * two words at most. Vietnamese is written one syllable per word, so that
     * ceiling meant no phrase longer than two syllables could ever match and the
     * ~1,700 three-and-more-syllable Vietnamese keys in the shipped datasets were
     * dead weight: the scanner walked past `Tổng Bí thư` and swapped the bare
     * `thư`, which is what readers complained about. Five words covers every
     * phrase in the datasets bar a long tail of full example sentences.
     */
    const MAX_PHRASE_WORDS = 5;

    /**
     * Word-token windows starting at `startIndex`, longest first.
     *
     * A phrase may only span whitespace: the moment a separator token carries
     * anything else (a comma, a full stop, a bracket, a dash) the phrase has
     * ended, so extension stops there. Returns token counts, since that is what
     * the caller advances by.
     */
    function phraseWindowSizes(tokens, startIndex) {
        const sizes = [];
        let words = 0;
        for (let i = startIndex; i < tokens.length && words < MAX_PHRASE_WORDS; i++) {
            const token = tokens[i];
            if (isWordToken(token)) {
                words++;
                sizes.push(i - startIndex + 1);
                continue;
            }
            // `tokenize` emits empty strings between adjacent separators; they
            // neither end a phrase nor count towards it.
            if (token === '') continue;
            if (!/^\s+$/.test(token)) break;
        }
        return sizes.reverse();
    }

    // Vietnamese titles and compounds common in news prose whose parts are not
    // themselves multi-syllable dataset keys, so `buildVocabMap` cannot learn
    // them from the CSVs. Kept deliberately short: the capitalisation rule in
    // `bareSyllableIsSafe` already covers most titles, and this is the backstop
    // for the ones a writer left lowercase.
    const SEED_COMPOUND_BIGRAMS = [
        'bí thư', 'tổng bí', 'thủ tướng', 'chủ tịch', 'phó chủ', 'phó thủ',
        'đại sứ', 'bộ trưởng', 'thứ trưởng', 'tổng thống', 'tổng thư', 'thư ký',
        'chính phủ', 'nhà nước', 'quốc hội', 'trung ương', 'bộ chính',
        'thư viện', 'thư điện', 'công văn', 'văn phòng'
    ];

    /** True when `token` opens with an uppercase letter (Vietnamese included). */
    function startsCapitalized(token) {
        const first = (token || '').charAt(0);
        return !!first && first !== first.toLowerCase() && first === first.toUpperCase();
    }

    /**
     * Should a bare single syllable be swapped here?
     *
     * A Vietnamese syllable on its own is rarely a word in the sense a reader
     * would recognise - it is usually one piece of a compound. `Tổng Bí thư` is
     * the reported case: `thư` alone means "letter", and highlighting it inside
     * the title for "General Secretary" is noise. Two signals say "this syllable
     * belongs to something bigger":
     *
     *   - a PRECEDING word capitalised mid-sentence. Vietnamese capitalises
     *     mid-sentence only for names and titles, and a compound title puts its
     *     head first, so the capital on `Bí` is the writer telling us `thư` is
     *     not standing alone. Only the preceding side counts: a FOLLOWING capital
     *     is usually just the next proper noun (`thăm Australia`, `tại Hà Nội`)
     *     and says nothing about the syllable before it.
     *   - a neighbour on either side that forms a known compound with it, per the
     *     bigram set `buildVocabMap` derives from the datasets.
     *
     * Anything else - a plain lowercase syllable in ordinary prose - still matches.
     */
    function bareSyllableIsSafe(tokens, startIndex, size, key, compounds) {
        const prevIndex = previousWordIndex(tokens, startIndex);
        const nextIndex = nextWordIndex(tokens, startIndex + size - 1);
        const prev = prevIndex === -1 ? '' : tokens[prevIndex];
        const next = nextIndex === -1 ? '' : tokens[nextIndex];

        // Sentence-initial capitals say nothing - every sentence has one.
        if (prev && startsCapitalized(prev) && !isSentenceStart(tokens, prevIndex)) return false;

        if (compounds && compounds.size) {
            if (prev && compounds.has(normalizeKey(prev) + ' ' + key)) return false;
            if (next && compounds.has(key + ' ' + normalizeKey(next))) return false;
        }
        return true;
    }

    /** Index of the nearest word token before `index`, or -1. Stops at sentence
     *  punctuation, which is a boundary rather than a neighbour. */
    function previousWordIndex(tokens, index) {
        for (let i = index - 1; i >= 0; i--) {
            const token = tokens[i];
            if (isWordToken(token)) return i;
            if (token && !/^\s*$/.test(token)) return -1;
        }
        return -1;
    }

    /** Index of the nearest word token after `index`, or -1. */
    function nextWordIndex(tokens, index) {
        for (let i = index + 1; i < tokens.length; i++) {
            const token = tokens[i];
            if (isWordToken(token)) return i;
            if (token && !/^\s*$/.test(token)) return -1;
        }
        return -1;
    }

    /** True when the word token at `index` opens a sentence: nothing but
     *  whitespace before it, or sentence-ending punctuation. */
    function isSentenceStart(tokens, index) {
        for (let i = index - 1; i >= 0; i--) {
            const token = tokens[i];
            if (!token || /^\s*$/.test(token)) continue;
            return /[.!?:;"'“”‘’()\[\]…]/.test(token);
        }
        return true;
    }

    /**
     * Try to match a vocabulary phrase starting at `tokens[startIndex]`.
     * Greedy longest-first, up to MAX_PHRASE_WORDS words.
     *
     * `size` in the result is a TOKEN count, so callers can advance by it.
     *
     * @returns {{size:number, matchedText:string, key:string, items:VocabularyEntry[]}|null}
     */
    function findMatch(tokens, startIndex, vocabMap, opts) {
        opts = opts || {};
        const allowSingleWord = opts.allowSingleWord !== false; // default: allow
        const minSingleWordLen = opts.minSingleWordLen || 2;
        const guardBareSyllables = opts.guardBareSyllables === true;

        if (!isWordToken(tokens[startIndex])) return null;

        for (const size of phraseWindowSizes(tokens, startIndex)) {
            const slice = tokens.slice(startIndex, startIndex + size);
            const matchedText = slice.join('');
            const key = normalizeKey(matchedText);
            if (!vocabMap.has(key)) continue;

            const isSingleWord = !key.includes(' ');
            if (isSingleWord) {
                if (!allowSingleWord || key.length < minSingleWordLen) continue;
                if (guardBareSyllables &&
                    !bareSyllableIsSafe(tokens, startIndex, size, key, vocabMap.compoundBigrams)) continue;
            }

            return { size, matchedText, key, items: vocabMap.get(key) };
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Deterministic replacement-intensity gate
    // ---------------------------------------------------------------------

    /** Stable non-negative integer hash of a string. */
    function hashToInt(str) {
        let hash = 0;
        for (let i = 0; i < (str || '').length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    /**
     * Deterministic replace/skip decision. Same key + frequency always yields the
     * same answer, so re-renders and MutationObserver passes are stable (unlike
     * Math.random). `frequency` is 0..100 - higher means more replacements.
     */
    function gateByFrequency(key, frequency) {
        const f = Math.max(0, Math.min(100, Number(frequency)));
        if (f >= 100) return true;
        if (f <= 0) return false;
        return (hashToInt('gate|' + key) % 100) < f;
    }

    // ---------------------------------------------------------------------
    // CSV parsing + entry validation/normalization
    // ---------------------------------------------------------------------

    /** Split a single CSV line honoring double-quoted fields (which may contain commas). */
    function splitCsvLine(line) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                out.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map(v => v.trim());
    }

    /** Parse CSV text into row objects keyed by header. Tolerates BOM, CRLF and blank lines. */
    function parseCSV(text) {
        const clean = (text || '').replace(/^﻿/, '');
        const lines = clean.split(/\r?\n/);
        if (!lines.length || !lines[0]) return [];
        const headers = splitCsvLine(lines[0]).map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || !lines[i].trim()) continue;
            const parts = splitCsvLine(lines[i]);
            const entry = {};
            headers.forEach((header, idx) => { entry[header] = parts[idx] != null ? parts[idx] : ''; });
            rows.push(entry);
        }
        return rows;
    }

    /** Minimal sanity check - an entry needs at least an English word + a Vietnamese meaning. */
    function validateEntry(entry) {
        return !!(entry && typeof entry.word === 'string' && entry.word.trim() &&
            typeof entry.vietnamese === 'string' && entry.vietnamese.trim());
    }

    /** Map a raw CSV row onto the VocabularyEntry shape (keeps original fields too). */
    function normalizeEntry(entry, datasetKey) {
        const tag = datasetTagFor(datasetKey);
        const word = (entry.word || '').trim();
        return Object.assign({}, entry, {
            id: tag + ':' + word.toLowerCase(),
            word,
            dataset: tag
        });
    }

    // ---------------------------------------------------------------------
    // Custom-dataset import: robust CSV parsing + validation.
    //
    // `parseCSV` above splits on newlines first, which is fine for the bundled
    // datasets (curated, single-line records) but breaks on user files where a
    // quoted field legitimately contains a line break. Uploads therefore go
    // through this character-level RFC-4180 parser instead. Everything here is
    // pure and synchronous so the options page (preview) and the service
    // worker (authoritative import) run the exact same code, and node:test
    // can cover it directly.
    // ---------------------------------------------------------------------

    /**
     * Parse CSV text into records. Quoted fields may contain commas, escaped
     * quotes ("") and embedded line breaks. Tolerates BOM, CRLF/LF and a
     * missing trailing newline; blank records are dropped.
     *
     * @returns {{records: Array<{fields:string[], line:number}>,
     *            error: null|{line:number, code:'UNTERMINATED_QUOTE'}}}
     */
    function parseCsvRecords(text) {
        const src = (text || '').replace(/^﻿/, '');
        const records = [];
        let field = '';
        let record = [];
        let inQuotes = false;
        let line = 1;       // physical line being read (1-based, for messages)
        let recordLine = 1; // line where the current record started

        const endField = () => { record.push(field); field = ''; };
        const endRecord = () => {
            endField();
            if (record.some(f => f.trim() !== '')) records.push({ fields: record, line: recordLine });
            record = [];
        };

        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (src[i + 1] === '"') { field += '"'; i++; }
                    else inQuotes = false;
                } else {
                    if (ch === '\n') line++;
                    field += ch;
                }
                continue;
            }
            if (ch === '"') { inQuotes = true; continue; }
            if (ch === ',') { endField(); continue; }
            if (ch === '\r' && src[i + 1] === '\n') continue; // CRLF: the \n ends the record
            if (ch === '\n' || ch === '\r') {
                endRecord();
                line++;
                recordLine = line;
                continue;
            }
            field += ch;
        }
        if (inQuotes) return { records: [], error: { line: recordLine, code: 'UNTERMINATED_QUOTE' } };
        endRecord(); // file may lack a trailing newline
        return { records, error: null };
    }

    /**
     * Clean one uploaded field: NFC-normalize (CSV-sourced Vietnamese often
     * arrives decomposed), strip control/zero-width characters, collapse
     * whitespace (this also flattens embedded line breaks), trim, and cap the
     * length. Returns { value, truncated }.
     */
    function sanitizeFieldText(value, maxLen) {
        let v = String(value == null ? '' : value);
        if (typeof v.normalize === 'function') v = v.normalize('NFC');
        v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, '');
        v = v.replace(/\s+/g, ' ').trim();
        const truncated = maxLen > 0 && v.length > maxLen;
        if (truncated) v = v.slice(0, maxLen).trim();
        return { value: v, truncated };
    }

    /** Clean a user-supplied dataset name. Returns '' when nothing usable remains. */
    function sanitizeDatasetName(name) {
        return sanitizeFieldText(name, CUSTOM_LIMITS.MAX_NAME_LEN).value;
    }

    /**
     * Validate and sanitize an uploaded CSV into storable row objects.
     *
     * Dedupe rule (documented in the UI, README and merid.site/create-dataset):
     * when the same English headword appears more than once, the FIRST row
     * wins - the same rule the bundled "All" dataset uses for overlaps.
     *
     * @returns {{
     *   ok: boolean,
     *   errorCode: null|'EMPTY_FILE'|'TOO_LARGE'|'MALFORMED_CSV'|'MISSING_HEADER'
     *             |'MISSING_COLUMNS'|'TOO_MANY_ROWS'|'NO_VALID_ROWS',
     *   missingColumns: string[],
     *   entries: Object[],   // sanitized, deduped rows (recognized columns only)
     *   stats: {totalRows:number, valid:number, invalid:number, duplicates:number},
     *   errors: Array<{row:number, code:'MISSING_WORD'|'MISSING_VIETNAMESE'|'UNTERMINATED_QUOTE', message:string, sample?:string}>,
     *   duplicates: Array<{row:number, word:string}>,
     *   warnings: Array<{code:'UNKNOWN_COLUMNS'|'TRUNCATED_FIELDS', message:string}>
     * }}
     */
    function validateDatasetCsv(text) {
        const report = {
            ok: false,
            errorCode: null,
            missingColumns: [],
            entries: [],
            stats: { totalRows: 0, valid: 0, invalid: 0, duplicates: 0 },
            errors: [],
            duplicates: [],
            warnings: []
        };
        const raw = String(text == null ? '' : text);
        if (!raw.trim()) { report.errorCode = 'EMPTY_FILE'; return report; }
        if (raw.length > CUSTOM_LIMITS.MAX_FILE_CHARS) { report.errorCode = 'TOO_LARGE'; return report; }

        const parsed = parseCsvRecords(raw);
        if (parsed.error) {
            report.errorCode = 'MALFORMED_CSV';
            report.errors.push({
                row: parsed.error.line,
                code: parsed.error.code,
                message: 'A double quote opened near line ' + parsed.error.line + ' is never closed.'
            });
            return report;
        }
        if (!parsed.records.length) { report.errorCode = 'EMPTY_FILE'; return report; }

        // Header: trim + lowercase so " Word ,VIETNAMESE" still matches.
        const headers = parsed.records[0].fields.map(h => h.trim().toLowerCase());
        if (!headers.some(h => CUSTOM_KNOWN_COLUMNS.includes(h))) {
            report.errorCode = 'MISSING_HEADER';
            return report;
        }
        report.missingColumns = CUSTOM_REQUIRED_COLUMNS.filter(c => !headers.includes(c));
        if (report.missingColumns.length) { report.errorCode = 'MISSING_COLUMNS'; return report; }
        const unknown = headers.filter(h => h && !CUSTOM_KNOWN_COLUMNS.includes(h));
        if (unknown.length) {
            report.warnings.push({
                code: 'UNKNOWN_COLUMNS',
                message: 'Ignored unrecognized column(s): ' + unknown.join(', ')
            });
        }

        const dataRecords = parsed.records.slice(1);
        report.stats.totalRows = dataRecords.length;
        if (dataRecords.length > CUSTOM_LIMITS.MAX_ROWS) { report.errorCode = 'TOO_MANY_ROWS'; return report; }

        const byWord = new Map();
        let truncatedFields = 0;
        const rowError = (row, code, message, sample) => {
            report.stats.invalid++;
            if (report.errors.length < CUSTOM_LIMITS.MAX_ERRORS_REPORTED) {
                report.errors.push({ row, code, message, sample });
            }
        };

        for (const rec of dataRecords) {
            const entry = {};
            headers.forEach((header, idx) => {
                if (!CUSTOM_KNOWN_COLUMNS.includes(header)) return;
                const cleaned = sanitizeFieldText(
                    rec.fields[idx] != null ? rec.fields[idx] : '',
                    CUSTOM_LIMITS.FIELD_MAX[header] || 256
                );
                if (cleaned.truncated) truncatedFields++;
                entry[header] = cleaned.value;
            });
            const sample = rec.fields.join(',').slice(0, 60);
            if (!entry.word) { rowError(rec.line, 'MISSING_WORD', 'Missing the English word.', sample); continue; }
            if (!entry.vietnamese) { rowError(rec.line, 'MISSING_VIETNAMESE', 'Missing the Vietnamese meaning.', sample); continue; }
            const wordKey = entry.word.toLowerCase();
            if (byWord.has(wordKey)) {
                report.stats.duplicates++;
                if (report.duplicates.length < CUSTOM_LIMITS.MAX_ERRORS_REPORTED) {
                    report.duplicates.push({ row: rec.line, word: entry.word });
                }
                continue;
            }
            byWord.set(wordKey, entry);
        }

        if (truncatedFields) {
            report.warnings.push({
                code: 'TRUNCATED_FIELDS',
                message: truncatedFields + ' overlong field value(s) were shortened.'
            });
        }
        report.entries = Array.from(byWord.values());
        report.stats.valid = report.entries.length;
        if (!report.entries.length) { report.errorCode = 'NO_VALID_ROWS'; return report; }
        report.ok = true;
        return report;
    }

    /**
     * Map a validated custom row onto the VocabularyEntry shape. The id embeds
     * the dataset's stable id so entries stay unique across custom datasets.
     */
    function normalizeCustomEntry(entry, datasetId) {
        const word = (entry.word || '').trim();
        return Object.assign({}, entry, {
            id: CUSTOM_KEY_PREFIX + datasetId + ':' + word.toLowerCase(),
            word,
            dataset: 'CUSTOM'
        });
    }

/**
 * Give `replacement` the capitalisation `source` was wearing.
 *
 * The datasets store every headword in lower case, so a word standing where
 * "Khó" or "KHÓ KHĂN" stood used to arrive as "difficult" and announce itself
 * as a substitution - at the start of a sentence, and loudest in headlines,
 * which is where whole-caps text lives.
 *
 * Case is read off the Vietnamese, not guessed from position: a word mid-
 * sentence that was already capitalised (a name, a title) keeps that too.
 *
 * Unicode-aware on purpose. Vietnamese carries its tone marks on the vowel, so
 * `\p{Lu}`/`\p{Ll}` are what distinguish "Ở" from "ở" - an /[A-Z]/ test sees
 * neither as a letter at all and would leave every accented word lower case.
 * toUpperCase() preserves the marks, so "khó" -> "KHÓ", never "KHO".
 */
function matchCase(source, replacement) {
    const src = String(source || '');
    const out = String(replacement || '');
    if (!out) return out;

    const cased = src.match(/\p{Lu}|\p{Ll}/gu);
    if (!cased) return out;   // digits, punctuation: nothing to copy

    // ALL CAPS, and meant: at least two cased letters, none of them lower.
    if (cased.length > 1 && !cased.some(ch => /\p{Ll}/u.test(ch))) return out.toUpperCase();

    // Otherwise only the first letter speaks for the word.
    if (/\p{Lu}/u.test(cased[0])) return out.charAt(0).toUpperCase() + out.slice(1);
    return out;
}

/**
 * Capitalise the first letter and leave the rest of the word alone.
 *
 * The positional half of the rule `matchCase` covers by copying: a word that
 * stands at the front of a sentence is capitalised even where the writer left
 * the Vietnamese it replaced in lower case, which is how much of an informal
 * feed is written. A word already shouting comes back unchanged, and
 * toUpperCase() keeps Vietnamese tone marks - "ở" -> "Ở", never "O".
 */
function capitalizeFirst(text) {
    const out = String(text || '');
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

    return {
        // datasets/settings
        DATASET_REGISTRY, DEFAULT_DATASET_KEY, getDatasetFiles, datasetTagFor,
        DEFAULT_SETTINGS, REPLACEMENT_MODES, withDefaults,
        ENG_ENG_AVAILABLE, activeModes,
        VISUALS_AVAILABLE, visualsActive,
        canonicalHost, isSiteDisabled, isHostBlocked, BUILTIN_BLOCKED_HOSTS,
        BLOCKED_PATHS, isUrlBlocked, CHAT_SURFACE_SELECTORS, chatSurfaceSelector,
        isHostDefaultOff, DEFAULT_OFF_HOSTS, BLOCKED_BY_CATEGORY,
        DEFAULT_OFF_BY_CATEGORY, SITE_CATEGORY_LABELS, blockedCategory,
        siteToggleState, addSiteToList, removeSiteFromList, MAX_SITE_LIST,
        INTENSITY_LEVELS, INTENSITY_TO_FREQUENCY, intensityToFrequency, frequencyToIntensity,
        normalizeIntensity, POST_WORD_CAPS, postWordCap, countWords,
        CANDIDATE_SURPLUS, postCandidateCap, pickSpread, spreadAllowance, SPREAD_FROM_WORDS,
        LONG_POST_WORDS_PER_EXTRA, LONG_POST_FROM,
        // text
        normalizeKey, stripDiacritics, escapeRegExp, escapeHtml, tokenize, isWordToken,
        opensSentence,
        // matching
        buildVocabMap, findMatch,
        MAX_PHRASE_WORDS, SEED_COMPOUND_BIGRAMS, phraseWindowSizes, bareSyllableIsSafe,
        // intensity gate
        hashToInt, gateByFrequency,
        // csv
        splitCsvLine, parseCSV, validateEntry, normalizeEntry,
        // display
        matchCase, capitalizeFirst,
        // custom datasets
        CUSTOM_KEY_PREFIX, CUSTOM_LIMITS, CUSTOM_REQUIRED_COLUMNS, CUSTOM_KNOWN_COLUMNS,
        isCustomKey, customIdFromKey, customKeyFor,
        parseCsvRecords, sanitizeFieldText, sanitizeDatasetName,
        validateDatasetCsv, normalizeCustomEntry
    };
});
