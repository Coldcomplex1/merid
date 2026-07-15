// Options page controller. Uses window.VMCore for defaults/registry.
// The deck lives on merid.site/my-deck (synced via the optional account
// below). The optional AI context check uses the user's own Gemini API key,
// stored in chrome.storage.local only.
const C = window.VMCore;

const SYNC_KEYS = ['frequency', 'replacementMode', 'vieEngMode', 'engEngMode', 'datasetKey'];

const els = {
    modeSeg: document.getElementById('modeSeg'),
    intensitySeg: document.getElementById('intensitySeg'),
    directionCards: document.getElementById('directionCards'),
    datasetSeg: document.getElementById('datasetSeg'),
    datasetInfo: document.getElementById('datasetInfo'),
    aiSeg: document.getElementById('aiSeg'),
    aiKey: document.getElementById('aiKey'),
    aiSaveBtn: document.getElementById('aiSaveBtn'),
    aiTestBtn: document.getElementById('aiTestBtn'),
    aiStatus: document.getElementById('aiStatus'),
    clearAll: document.getElementById('clearAll'),
    savedTag: document.getElementById('savedTag')
};

function flashSaved() {
    els.savedTag.textContent = 'Saved ✓';
    els.savedTag.classList.add('flash');
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => {
        els.savedTag.textContent = 'Settings save automatically';
        els.savedTag.classList.remove('flash');
    }, 1200);
}

function saveSync(obj) { chrome.storage.sync.set(obj, flashSaved); }

function setActive(seg, val) {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === val));
}

function setCard(mode, on) {
    const card = els.directionCards.querySelector(`.mode-card[data-mode="${mode}"]`);
    if (!card) return;
    card.classList.toggle('active', !!on);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function cardOn(mode) {
    return !!els.directionCards.querySelector(`.mode-card[data-mode="${mode}"]`)?.classList.contains('active');
}

// ---- Load ----
function load() {
    chrome.storage.sync.get(SYNC_KEYS, sync => {
        const s = C.withDefaults(sync);
        setActive(els.modeSeg, s.replacementMode);
        setActive(els.intensitySeg, C.frequencyToIntensity(s.frequency));
        setCard('vieEng', !!s.vieEngMode);
        setCard('engEng', !!s.engEngMode);
        setActive(els.datasetSeg, s.datasetKey);
        refreshDatasetInfo();
    });
    // AI context check: toggle lives in sync, the key stays local-only.
    chrome.storage.sync.get(['aiCheckEnabled'], s => {
        setActive(els.aiSeg, s.aiCheckEnabled ? 'on' : 'off');
    });
    chrome.storage.local.get(['geminiApiKey'], l => {
        if (l.geminiApiKey) els.aiKey.value = l.geminiApiKey;
    });
}

function showAiStatus(msg, isError) {
    els.aiStatus.textContent = msg;
    els.aiStatus.hidden = !msg;
    els.aiStatus.classList.toggle('auth-error', !!isError);
}

function refreshDatasetInfo() {
    chrome.runtime.sendMessage({ action: 'getStatus' }, res => {
        if (chrome.runtime.lastError || !res) { els.datasetInfo.textContent = ''; return; }
        els.datasetInfo.textContent = `Loaded: ${res.vocabCount} words (${(C.DATASET_REGISTRY[res.datasetKey] || {}).label || res.datasetKey}).`;
    });
}

// ---- Wire up ----
function wire() {
    els.modeSeg.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        setActive(els.modeSeg, btn.dataset.val);
        saveSync({ replacementMode: btn.dataset.val });
    });
    els.intensitySeg.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        setActive(els.intensitySeg, btn.dataset.val);
        saveSync({ frequency: C.intensityToFrequency(btn.dataset.val) });
    });
    els.directionCards.addEventListener('click', e => {
        const card = e.target.closest('.mode-card'); if (!card) return;
        setCard(card.dataset.mode, !card.classList.contains('active'));
        saveSync({ vieEngMode: cardOn('vieEng'), engEngMode: cardOn('engEng') });
    });
    els.datasetSeg.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        setActive(els.datasetSeg, btn.dataset.val);
        chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: btn.dataset.val }, () => {
            void chrome.runtime.lastError;
            flashSaved();
            refreshDatasetInfo();
        });
    });

    els.aiSeg.addEventListener('click', e => {
        const btn = e.target.closest('button'); if (!btn) return;
        setActive(els.aiSeg, btn.dataset.val);
        saveSync({ aiCheckEnabled: btn.dataset.val === 'on' });
        if (btn.dataset.val === 'on' && !els.aiKey.value.trim()) {
            showAiStatus('Enabled - now paste your Gemini API key below and press "Save key".', false);
        } else {
            showAiStatus('', false);
        }
    });

    els.aiSaveBtn.addEventListener('click', () => {
        const key = els.aiKey.value.trim();
        chrome.storage.local.set({ geminiApiKey: key }, () => {
            flashSaved();
            showAiStatus(key ? 'Key saved on this device.' : 'Key removed.', false);
        });
    });

    els.aiTestBtn.addEventListener('click', () => {
        const key = els.aiKey.value.trim();
        if (!key) { showAiStatus('Paste an API key first.', true); return; }
        els.aiTestBtn.disabled = true;
        showAiStatus('Testing key…', false);
        chrome.runtime.sendMessage({ type: 'MERID_AI_TEST_KEY', key }, res => {
            els.aiTestBtn.disabled = false;
            if (chrome.runtime.lastError || !res) { showAiStatus('Could not test the key. Check your connection.', true); return; }
            if (res.ok) showAiStatus('Key works ✓', false);
            else if (res.status === 400 || res.status === 401 || res.status === 403) showAiStatus('Key was rejected by Google. Double-check it.', true);
            else if (res.status === 429) showAiStatus('Key works but is rate-limited right now.', false);
            else showAiStatus('Test failed (network or Google error). Try again.', true);
        });
    });

    els.clearAll.addEventListener('click', () => {
        if (!confirm('Delete ALL stored data (settings + your deck)? This cannot be undone.')) return;
        chrome.storage.local.clear(() => chrome.storage.sync.clear(() => location.reload()));
    });
}

// =============================================================
// Account & sync (optional cloud backup via the service worker).
// The card stays hidden entirely when Firebase isn't configured, keeping the
// extension honest about being local-only in that build.
// =============================================================
const account = {
    card: document.getElementById('accountCard'),
    signedOut: document.getElementById('signedOutView'),
    signedIn: document.getElementById('signedInView'),
    email: document.getElementById('authEmail'),
    password: document.getElementById('authPassword'),
    error: document.getElementById('authError'),
    who: document.getElementById('authWho'),
    syncState: document.getElementById('syncState'),
    signInBtn: document.getElementById('signInBtn'),
    signUpBtn: document.getElementById('signUpBtn'),
    signOutBtn: document.getElementById('signOutBtn')
};

// Coarse error codes from the service worker -> friendly copy. Sign-in
// failures deliberately collapse into one message so the UI never reveals
// whether an email is registered (anti-enumeration, A07).
const AUTH_ERRORS = {
    EMAIL_EXISTS: 'An account with this email already exists. Try signing in.',
    INVALID_LOGIN_CREDENTIALS: 'Email or password is incorrect.',
    INVALID_PASSWORD: 'Email or password is incorrect.',
    EMAIL_NOT_FOUND: 'Email or password is incorrect.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    WEAK_PASSWORD: 'Password must be at least 8 characters.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Please try again later.',
    NETWORK: 'No connection. Check your internet and try again.'
};

function showAuthError(code) {
    account.error.textContent = code ? (AUTH_ERRORS[code] || 'Something went wrong. Please try again.') : '';
    account.error.hidden = !code;
}

function renderSyncState(status) {
    const map = {
        'syncing': 'Syncing your deck…',
        'rate-limited': 'Daily sync limit reached - remaining words sync tomorrow.',
        'error': 'Sync paused (connection issue). It retries automatically.',
        'idle': status.lastSyncAt ? 'Deck is backed up.' : 'Ready to sync.'
    };
    account.syncState.textContent = map[status.state] || '';
}

function refreshAccountCard() {
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status || status.state === 'disabled') {
            if (account.card) account.card.hidden = true;
            return;
        }
        account.card.hidden = false;
        const signedIn = status.state !== 'signed-out';
        account.signedOut.hidden = signedIn;
        account.signedIn.hidden = !signedIn;
        if (signedIn) {
            account.who.textContent = status.email || '';
            renderSyncState(status);
        }
    });
}

function submitAuth(isNewAccount) {
    const email = account.email.value.trim();
    const password = account.password.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError('INVALID_EMAIL'); return; }
    if (password.length < 8) { showAuthError('WEAK_PASSWORD'); return; }
    showAuthError(null);
    account.signInBtn.disabled = account.signUpBtn.disabled = true;
    chrome.runtime.sendMessage(
        { type: 'MERID_SYNC_SIGN_IN', email, password, isNewAccount },
        (res) => {
            account.signInBtn.disabled = account.signUpBtn.disabled = false;
            if (chrome.runtime.lastError || !res) { showAuthError('NETWORK'); return; }
            if (!res.ok) { showAuthError(res.code); return; }
            account.password.value = '';
            refreshAccountCard();
        }
    );
}

function wireAccount() {
    if (!account.card) return;
    account.signInBtn.addEventListener('click', () => submitAuth(false));
    account.signUpBtn.addEventListener('click', () => submitAuth(true));
    account.password.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(false); });
    account.signOutBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'MERID_SYNC_SIGN_OUT' }, () => {
            void chrome.runtime.lastError;
            refreshAccountCard();
        });
    });
    refreshAccountCard();
    // Live-update the sync line while the page is open (storage-driven, cheap).
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.vm_sync_status || changes.vm_auth)) refreshAccountCard();
    });
}

document.addEventListener('DOMContentLoaded', () => { load(); wire(); wireAccount(); });
