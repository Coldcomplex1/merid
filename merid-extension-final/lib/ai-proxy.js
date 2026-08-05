/**
 * ai-proxy.js - talks to Merid's own AI endpoint.
 *
 * The alternative was shipping Merid's Gemini keys inside the extension. An
 * extension is a zip file on the user's disk, so those keys would be public
 * within a day, and a daily limit counted here would be a limit the user can
 * reset by clearing storage. Both live on the server instead; this file only
 * proves who is asking and passes the answer back.
 *
 * Identity: the signed-in Firebase session if there is one, otherwise an
 * anonymous Firebase account minted once per device. Anonymous identities are
 * cheap to replace, which is exactly why they get a smaller daily allowance -
 * the server decides that, not this file.
 *
 * Everything here fails soft. The AI check is an enhancement; if the endpoint,
 * the network or the account is unavailable, the extension keeps working
 * exactly as it does with the check turned off.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(root.VMFirebase, root.VMFirebaseConfig);
    else root.VMAiProxy = factory(root.VMFirebase, root.VMFirebaseConfig);
})(typeof self !== 'undefined' ? self : globalThis, function (FB, CONFIG) {
    'use strict';

    const cfg = CONFIG || {};
    const AUTH_KEY = 'vm_auth';        // the signed-in session (lib/sync.js owns this)
    const ANON_KEY = 'vm_anon_auth';   // { uid, refreshToken } for this device
    const QUOTA_KEY = 'vm_ai_quota';   // last known { used, limit, resetAt, anonymous }

    // Cached access token for the current identity (never persisted).
    let token = null; // { idToken, uid, expiresAt }

    function storeGet(keys) {
        return new Promise(resolve => chrome.storage.local.get(keys, resolve));
    }
    function storeSet(obj) {
        return new Promise(resolve => chrome.storage.local.set(obj, resolve));
    }

    function endpoint() {
        return cfg.aiProxyUrl || '';
    }

    /** The proxy is only usable when both it and Firebase auth are configured. */
    function available() {
        return !!(endpoint() && FB && FB.configured());
    }

    /**
     * A refresh token for this device: the real account when signed in,
     * otherwise an anonymous one, created on first use and reused after that.
     */
    async function getIdentity() {
        const r = await storeGet([AUTH_KEY, ANON_KEY]);
        const signedIn = r[AUTH_KEY];
        if (signedIn && signedIn.refreshToken) {
            return { uid: signedIn.uid, refreshToken: signedIn.refreshToken, anonymous: false };
        }
        const anon = r[ANON_KEY];
        if (anon && anon.refreshToken) {
            return { uid: anon.uid, refreshToken: anon.refreshToken, anonymous: true };
        }
        const created = await FB.signUpAnonymous();
        const record = { uid: created.uid, refreshToken: created.refreshToken };
        await storeSet({ [ANON_KEY]: record });
        // Reuse the token we were just handed instead of spending a refresh.
        token = {
            idToken: created.idToken,
            uid: created.uid,
            expiresAt: Date.now() + (created.expiresIn - 60) * 1000
        };
        return Object.assign({ anonymous: true }, record);
    }

    /** A valid ID token, refreshed only when the cached one is close to expiry. */
    async function getToken() {
        const identity = await getIdentity();
        if (token && token.uid === identity.uid && Date.now() < token.expiresAt) {
            return { idToken: token.idToken, anonymous: identity.anonymous };
        }
        const refreshed = await FB.refresh(identity.refreshToken);
        token = {
            idToken: refreshed.idToken,
            uid: refreshed.uid,
            expiresAt: Date.now() + (refreshed.expiresIn - 60) * 1000
        };
        // A rotated refresh token must be persisted or the next wake re-mints
        // an anonymous account and silently resets the device's quota.
        if (refreshed.refreshToken && refreshed.refreshToken !== identity.refreshToken && identity.anonymous) {
            await storeSet({ [ANON_KEY]: { uid: refreshed.uid, refreshToken: refreshed.refreshToken } });
        }
        return { idToken: token.idToken, anonymous: identity.anonymous };
    }

    /** Remember what the server said, so the popup can explain a quiet check. */
    async function recordQuota(patch) {
        const cur = (await storeGet([QUOTA_KEY]))[QUOTA_KEY] || {};
        await storeSet({ [QUOTA_KEY]: Object.assign({}, cur, patch, { at: Date.now() }) });
    }

    async function getQuota() {
        return (await storeGet([QUOTA_KEY]))[QUOTA_KEY] || null;
    }

    /**
     * Ask the proxy to check a batch.
     *
     * @param {Array<{word:string, original:string, sentence:string}>} items
     * @param {string} persona Compact preference summary, or ''.
     * @returns {Promise<{ok:boolean, verdicts?:number[], betters?:string[],
     *                    model?:string, reason?:string, status?:number}>}
     */
    async function check(items, persona) {
        if (!available()) return { ok: false, reason: 'not-configured' };

        let auth;
        try {
            auth = await getToken();
        } catch (e) {
            // Almost always "Anonymous sign-in is not enabled in Firebase".
            return { ok: false, reason: 'auth', code: (e && e.code) || '', detail: (e && e.message) || '' };
        }

        let resp;
        try {
            resp = await fetch(endpoint(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + auth.idToken
                },
                body: JSON.stringify({ items, persona: persona || '' })
            });
        } catch (e) {
            return { ok: false, reason: 'network' };
        }

        let data = null;
        try { data = await resp.json(); } catch (e) { /* non-JSON body */ }

        if (resp.status === 429 && data && data.code === 'quota-exceeded') {
            await recordQuota({
                used: data.used, limit: data.limit,
                resetAt: Date.now() + (Number(data.resetIn) || 0) * 1000,
                anonymous: !!data.anonymous,
                exhausted: true
            });
            return { ok: false, reason: 'quota', limit: data.limit, anonymous: !!data.anonymous };
        }

        if (!resp.ok || !data || !data.ok || !Array.isArray(data.verdicts)) {
            // Carry the server's own code through. "It failed" is useless when
            // the causes are as different as a missing environment variable, an
            // unreachable quota store and an exhausted key.
            return {
                ok: false, reason: 'upstream', status: resp.status,
                code: (data && data.code) || '', detail: (data && data.reason) || ''
            };
        }

        await recordQuota({
            used: data.used, limit: data.limit,
            resetAt: Date.now() + (Number(data.resetIn) || 0) * 1000,
            anonymous: auth.anonymous,
            exhausted: false
        });

        return {
            ok: true,
            verdicts: data.verdicts.map(v => (v ? 1 : 0)),
            betters: Array.isArray(data.betters) ? data.betters : [],
            model: data.model || ''
        };
    }

    return { available, check, getQuota, getToken, QUOTA_KEY, ANON_KEY };
});
