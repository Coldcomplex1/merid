// =============================================================
// Merid - minimal Firebase REST client (MV3-safe, no SDK bundle).
//
// Manifest V3 forbids remotely hosted code, and shipping the full Firebase JS
// SDK adds ~300 KB for the handful of calls we need, so we talk to the
// documented REST endpoints directly:
//   - Identity Toolkit  : email/password sign-up / sign-in
//   - Secure Token      : refresh-token -> short-lived ID token (JWT)
//   - Firestore v1      : atomic document commits (create/update/delete)
//
// Security notes (A02/A07/A09):
//   - Passwords go straight to Google over TLS and are hashed server-side
//     with scrypt; nothing password-derived is ever stored locally.
//   - Callers keep the ID token in memory only; the long-lived refresh token
//     is the single persisted credential (chrome.storage.local).
//   - No function in this file logs tokens, emails or payloads. Errors are
//     surfaced as coarse codes for the UI to translate.
// =============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root.VMFirebaseConfig);
    else root.VMFirebase = factory(root.VMFirebaseConfig);
})(typeof self !== 'undefined' ? self : globalThis, function (CONFIG) {
    'use strict';

    const cfg = CONFIG || { apiKey: '', projectId: '' };

    function configured() {
        return !!(cfg.apiKey && cfg.projectId);
    }

    // ---------------------------------------------------------
    // Low-level fetch helper. Never throws raw server messages upward with
    // payload context - callers get { code, status, httpStatus } only.
    // ---------------------------------------------------------
    async function call(url, options) {
        let resp;
        try {
            resp = await fetch(url, options);
        } catch (e) {
            const err = new Error('network');
            err.code = 'NETWORK';
            throw err;
        }
        let body = null;
        try { body = await resp.json(); } catch (e) { /* empty body is fine */ }
        if (!resp.ok) {
            const err = new Error('request-failed');
            err.httpStatus = resp.status;
            // Identity Toolkit puts a machine code in error.message
            // (e.g. EMAIL_EXISTS); Firestore puts one in error.status
            // (e.g. PERMISSION_DENIED, ALREADY_EXISTS).
            const apiError = body && body.error ? body.error : {};
            err.code = apiError.status || apiError.message || ('HTTP_' + resp.status);
            // Only keep the machine-readable first token ("TOO_MANY_ATTEMPTS_TRY_LATER : ...").
            err.code = String(err.code).split(':')[0].trim();
            err.retryable = resp.status >= 500 || resp.status === 429;
            throw err;
        }
        return body;
    }

    function identityUrl(endpoint) {
        return 'https://identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=' + encodeURIComponent(cfg.apiKey);
    }

    function postJson(url, payload) {
        return call(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    // ---------------------------------------------------------
    // Auth (Identity Toolkit + Secure Token)
    // ---------------------------------------------------------
    async function signUp(email, password) {
        const r = await postJson(identityUrl('signUp'), { email, password, returnSecureToken: true });
        return { uid: r.localId, idToken: r.idToken, refreshToken: r.refreshToken, expiresIn: Number(r.expiresIn) };
    }

    async function signIn(email, password) {
        const r = await postJson(identityUrl('signInWithPassword'), { email, password, returnSecureToken: true });
        return { uid: r.localId, idToken: r.idToken, refreshToken: r.refreshToken, expiresIn: Number(r.expiresIn) };
    }

    /** Trade the long-lived refresh token for a fresh ID token (JWT, ~1h). */
    async function refresh(refreshToken) {
        const url = 'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(cfg.apiKey);
        const body = 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken);
        const r = await call(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        return { uid: r.user_id, idToken: r.id_token, refreshToken: r.refresh_token, expiresIn: Number(r.expires_in) };
    }

    // ---------------------------------------------------------
    // Firestore v1 REST
    // ---------------------------------------------------------
    const FS_BASE = 'https://firestore.googleapis.com/v1';

    function dbRoot() {
        return 'projects/' + cfg.projectId + '/databases/(default)/documents';
    }

    function docName(path) {
        return dbRoot() + '/' + path;
    }

    /** JS scalar/array -> Firestore REST Value. Only the types Merid uses. */
    function enc(v) {
        if (typeof v === 'string') return { stringValue: v };
        if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
        throw new Error('unsupported-value');
    }

    function encFields(obj) {
        const fields = {};
        for (const k of Object.keys(obj)) fields[k] = enc(obj[k]);
        return fields;
    }

    /** GET a document. Returns decoded fields or null when it doesn't exist.
     *  (Only the URL needs percent-encoding - write paths travel raw inside
     *  the commit JSON body so document IDs stay byte-identical to the SDK's.) */
    async function getDoc(idToken, path) {
        const encodedPath = path.split('/').map(encodeURIComponent).join('/');
        try {
            const r = await call(FS_BASE + '/' + dbRoot() + '/' + encodedPath, {
                headers: { Authorization: 'Bearer ' + idToken }
            });
            return decodeFields(r.fields || {});
        } catch (e) {
            if (e.httpStatus === 404) return null;
            throw e;
        }
    }

    function decodeFields(fields) {
        const out = {};
        for (const k of Object.keys(fields)) {
            const v = fields[k];
            if ('stringValue' in v) out[k] = v.stringValue;
            else if ('integerValue' in v) out[k] = Number(v.integerValue);
            else if ('doubleValue' in v) out[k] = v.doubleValue;
            else if ('booleanValue' in v) out[k] = v.booleanValue;
            else if ('timestampValue' in v) out[k] = v.timestampValue;
            else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map(x => decodeFields({ x }).x);
        }
        return out;
    }

    /** Atomic multi-write commit - the REST equivalent of an SDK batch, so it
     *  satisfies rules that getAfter() the daily counter alongside the word. */
    function commit(idToken, writes) {
        return call(FS_BASE + '/' + dbRoot().replace('/documents', '') + '/documents:commit', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ writes })
        });
    }

    // ---- Write builders (shapes for commit()) ----

    /** Full create of a document that must not exist yet. serverTimeFields are
     *  filled by Firestore itself (rules require createdAt == request.time). */
    function createWrite(path, data, serverTimeFields) {
        return {
            update: { name: docName(path), fields: encFields(data) },
            updateTransforms: (serverTimeFields || []).map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })),
            currentDocument: { exists: false }
        };
    }

    /** Masked update: only the listed fields change, everything else
     *  (word/createdAt/fields written by the web app) is preserved. */
    function updateWrite(path, data, serverTimeFields) {
        return {
            update: { name: docName(path), fields: encFields(data) },
            updateMask: { fieldPaths: Object.keys(data) },
            updateTransforms: (serverTimeFields || []).map(f => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })),
            currentDocument: { exists: true }
        };
    }

    function deleteWrite(path) {
        return { delete: docName(path) };
    }

    return {
        configured,
        signUp, signIn, refresh,
        getDoc, commit,
        createWrite, updateWrite, deleteWrite
    };
});
