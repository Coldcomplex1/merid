/**
 * custom-datasets.js - chrome.storage.local persistence for user-uploaded
 * vocabulary datasets. Loaded by the background service worker, which is the
 * single writer for every vm_custom_* key (the popup and options page go
 * through runtime messages instead of writing storage themselves).
 *
 * Storage layout:
 *   vm_custom_index        [{ id, name, count, createdAt, updatedAt }]
 *   vm_custom_data_<id>    { id, entries: VocabularyEntry[] }  - one key per
 *                          dataset so saving one never rewrites the others.
 *
 * Privacy: everything stays in chrome.storage.local. Custom datasets are never
 * written to chrome.storage.sync and are invisible to the optional Firestore
 * deck sync (lib/sync.js only mirrors savedWords/knownWords/geminiApiKey).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;      // Node / tests
    } else {
        root.VMCustom = api;       // service worker
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const INDEX_KEY = 'vm_custom_index';
    const DATA_PREFIX = 'vm_custom_data_';

    function dataKeyFor(id) { return DATA_PREFIX + id; }

    function newId() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'ds-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    /** A storage write that failed (in practice: quota) becomes a stable code
     *  the UI can turn into "storage is full - delete a dataset" copy. */
    async function safeSet(obj) {
        try {
            await chrome.storage.local.set(obj);
        } catch (e) {
            const err = new Error('storage write failed');
            err.code = 'STORAGE_FULL';
            throw err;
        }
    }

    async function list() {
        const r = await chrome.storage.local.get([INDEX_KEY]);
        return Array.isArray(r[INDEX_KEY]) ? r[INDEX_KEY] : [];
    }

    async function getMeta(id) {
        const index = await list();
        return index.find(d => d.id === id) || null;
    }

    /** Returns the stored entries array, or null when the dataset is missing. */
    async function getEntries(id) {
        const key = dataKeyFor(id);
        const r = await chrome.storage.local.get([key]);
        const rec = r[key];
        return rec && Array.isArray(rec.entries) ? rec.entries : null;
    }

    /** Store a new dataset under a pre-minted id. Cleans up the data key if
     *  the index write fails so no orphaned blobs are left behind. */
    async function create(id, name, entries) {
        const index = await list();
        const now = Date.now();
        const meta = { id, name, count: entries.length, createdAt: now, updatedAt: now };
        await safeSet({ [dataKeyFor(id)]: { id, entries } });
        try {
            await safeSet({ [INDEX_KEY]: index.concat([meta]) });
        } catch (e) {
            await chrome.storage.local.remove(dataKeyFor(id));
            throw e;
        }
        return meta;
    }

    /** Overwrite an existing dataset's entries. Returns updated meta or null. */
    async function replace(id, entries) {
        const index = await list();
        const meta = index.find(d => d.id === id);
        if (!meta) return null;
        await safeSet({ [dataKeyFor(id)]: { id, entries } });
        meta.count = entries.length;
        meta.updatedAt = Date.now();
        await safeSet({ [INDEX_KEY]: index });
        return meta;
    }

    /** Rename a dataset (metadata only). Returns updated meta or null. */
    async function rename(id, name) {
        const index = await list();
        const meta = index.find(d => d.id === id);
        if (!meta) return null;
        meta.name = name;
        meta.updatedAt = Date.now();
        await safeSet({ [INDEX_KEY]: index });
        return meta;
    }

    /** Delete a dataset's entries and index row. Safe to call twice. */
    async function remove(id) {
        const index = await list();
        await chrome.storage.local.set({ [INDEX_KEY]: index.filter(d => d.id !== id) });
        await chrome.storage.local.remove(dataKeyFor(id));
    }

    return { INDEX_KEY, DATA_PREFIX, dataKeyFor, newId, list, getMeta, getEntries, create, replace, rename, remove };
});
