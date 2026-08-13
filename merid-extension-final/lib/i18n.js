// =============================================================
// Merid - UI language for the extension's own pages (popup + Settings).
//
// Why this exists at all: chrome.i18n.getMessage() resolves against the
// BROWSER's UI language and takes no override. A reader on an English-locale
// Chrome could never see the Vietnamese UI, however plainly they had said - on
// merid.site, in the toolbar - that Vietnamese is the language they read in.
//
// So the panel carries its own catalog. It is the same _locales/ data Chrome
// would have loaded, fetched from the extension's own files, which keeps one
// set of strings for both paths and leaves the manifest untouched
// (`connect-src 'self'` already covers a chrome-extension:// fetch, and no new
// permission is involved).
//
// Which language wins, in order:
//   1. uiLang        - the reader's explicit choice in Settings ('en' | 'vi')
//   2. siteLang      - what they last chose on merid.site (VI/EN toggle)
//   3. the browser's UI language, which is where Merid started
//   4. English
//
// NOT used by content.js: the learning card on the page is always English -
// it is the thing being learned, not the interface around it.
// =============================================================
(function (root) {
    'use strict';

    const SUPPORTED = ['en', 'vi'];
    const FALLBACK_LANG = 'en';

    let catalog = {};
    let active = FALLBACK_LANG;

    /** 'vi-VN' and 'vi' both mean Vietnamese; anything else means English. */
    function normalizeLang(value) {
        const v = String(value || '').toLowerCase();
        for (const lang of SUPPORTED) {
            if (v === lang || v.indexOf(lang + '-') === 0) return lang;
        }
        return '';
    }

    function browserLang() {
        try {
            return normalizeLang(chrome.i18n.getUILanguage()) || FALLBACK_LANG;
        } catch (e) {
            return FALLBACK_LANG;
        }
    }

    /** The language the panel should be in, given what storage holds. */
    function resolveLang(stored) {
        const s = stored || {};
        return normalizeLang(s.uiLang) || normalizeLang(s.siteLang) || browserLang();
    }

    function readStored() {
        return new Promise(resolve => {
            try {
                chrome.storage.sync.get(['uiLang', 'siteLang'], raw => {
                    void chrome.runtime.lastError;
                    resolve(raw || {});
                });
            } catch (e) {
                resolve({});
            }
        });
    }

    async function loadCatalog(lang) {
        try {
            const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            console.warn('[VM] locale load failed:', lang, e && e.message);
            return {};
        }
    }

    /**
     * chrome.i18n's substitution, reproduced.
     *
     * A message writes $NAME$ and declares `placeholders: { NAME: { content:
     * "$1" } }`; $$ is a literal dollar. Doing it here rather than pre-baking
     * the strings keeps the catalog exactly the file Chrome itself reads.
     */
    function substitute(entry, subs) {
        let message = entry.message;
        const args = Array.isArray(subs) ? subs : (subs === undefined ? [] : [subs]);
        const holders = entry.placeholders || {};
        for (const name of Object.keys(holders)) {
            const content = String((holders[name] || {}).content || '');
            const index = /^\$(\d+)$/.exec(content);
            const value = index ? (args[Number(index[1]) - 1] !== undefined ? args[Number(index[1]) - 1] : '') : content;
            message = message.replace(new RegExp('\\$' + name + '\\$', 'gi'), value);
        }
        return message.replace(/\$\$/g, '$');
    }

    /**
     * One string. `fallback` is the English written into the markup or the
     * caller, and it is what shows if a key is missing - a blank UI is never
     * the right answer to a translation gap.
     */
    function t(key, fallback, subs) {
        const entry = catalog[key];
        if (entry && entry.message) return substitute(entry, subs);
        return fallback === undefined ? '' : fallback;
    }

    // Static labels are marked up declaratively: data-i18n sets textContent,
    // data-i18n-html sets innerHTML (trusted extension strings only, never user
    // or page content), and the three attribute forms cover the rest.
    const ATTR_BINDINGS = [
        ['i18nPlaceholder', 'placeholder'],
        ['i18nTitle', 'title'],
        ['i18nAriaLabel', 'aria-label']
    ];

    function applyI18n(scope) {
        const el = scope || document;
        el.querySelectorAll('[data-i18n]').forEach(node => {
            const msg = t(node.dataset.i18n, '');
            if (msg) node.textContent = msg;
        });
        el.querySelectorAll('[data-i18n-html]').forEach(node => {
            const msg = t(node.dataset.i18nHtml, '');
            if (msg) node.innerHTML = msg;
        });
        for (const [dataKey, attr] of ATTR_BINDINGS) {
            el.querySelectorAll(`[data-${dataKey.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}]`)
                .forEach(node => {
                    const msg = t(node.dataset[dataKey], '');
                    if (msg) node.setAttribute(attr, msg);
                });
        }
        if (!scope) document.documentElement.lang = active;
    }

    /** Load the catalog for the resolved language. Safe to call again. */
    async function init() {
        active = resolveLang(await readStored());
        catalog = await loadCatalog(active);
        return active;
    }

    /** Re-resolve and re-apply, after uiLang/siteLang changed under us. */
    async function refresh(scope) {
        await init();
        applyI18n(scope);
        return active;
    }

    root.VMI18n = {
        SUPPORTED, FALLBACK_LANG,
        normalizeLang, resolveLang, browserLang,
        init, refresh, t, applyI18n,
        get lang() { return active; }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
