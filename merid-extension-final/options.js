// Options page controller. Uses window.VMCore for defaults/registry.
// The deck lives on a separate page (deck.html). The optional AI context
// check uses the user's own Gemini API key, stored in chrome.storage.local
// only (never synced).
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
        const label = res.datasetLabel || (C.DATASET_REGISTRY[res.datasetKey] || {}).label || res.datasetKey;
        els.datasetInfo.textContent = `Loaded: ${res.vocabCount} words (${label}).`;
    });
}

// =============================================================
// My datasets (user-uploaded CSVs). All storage writes happen in the
// background service worker via messages; this page only previews files with
// the shared validator and renders state. Every user-derived string is
// rendered with textContent - never innerHTML.
// =============================================================
const custom = {
    notice: document.getElementById('customNotice'),
    empty: document.getElementById('customEmpty'),
    list: document.getElementById('customList'),
    uploadFile: document.getElementById('uploadFile'),
    uploadName: document.getElementById('uploadName'),
    uploadBtn: document.getElementById('uploadBtn'),
    report: document.getElementById('importReport'),
    replaceFile: document.getElementById('replaceFile')
};

let pendingCsvText = null; // validated preview waiting for "Save dataset"
let replaceTargetId = null;

const FILE_ERRORS = {
    EMPTY_FILE: 'The file is empty.',
    TOO_LARGE: `The file is too large (limit ${Math.round(C.CUSTOM_LIMITS.MAX_FILE_CHARS / (1024 * 1024))} MB).`,
    MALFORMED_CSV: 'The file is not valid CSV.',
    MISSING_HEADER: 'The first line must be a header row (e.g. word,type,…,vietnamese,…).',
    MISSING_COLUMNS: 'Required column(s) missing from the header: ',
    TOO_MANY_ROWS: `Too many rows (limit ${C.CUSTOM_LIMITS.MAX_ROWS}). Split the file into smaller datasets.`,
    NO_VALID_ROWS: 'No usable rows - every row needs an English word and a Vietnamese meaning.',
    LIMIT_DATASETS: `You already have ${C.CUSTOM_LIMITS.MAX_DATASETS} datasets. Delete one before adding another.`,
    STORAGE_FULL: 'Extension storage is full. Delete a dataset or upload a smaller file.',
    BAD_NAME: 'Please give the dataset a name.',
    NOT_FOUND: 'That dataset no longer exists.',
    UNKNOWN: 'Something went wrong. Reload Merid at chrome://extensions and try again.'
};

function describeFailure(report) {
    if (!report) return FILE_ERRORS.UNKNOWN;
    let msg = FILE_ERRORS[report.errorCode] || FILE_ERRORS.UNKNOWN;
    if (report.errorCode === 'MISSING_COLUMNS') msg += (report.missingColumns || []).join(', ') + '.';
    return msg;
}

function showReportMessage(message, isError) {
    custom.report.hidden = false;
    custom.report.classList.toggle('err', !!isError);
    custom.report.textContent = '';
    const p = document.createElement('p');
    p.className = 'report-head';
    p.textContent = message;
    custom.report.appendChild(p);
}

/** Render a validation report (preview or final) as safe DOM nodes. */
function renderReport(report, mode) {
    const box = custom.report;
    box.hidden = false;
    box.textContent = '';
    box.classList.toggle('err', !report.ok);

    const head = document.createElement('p');
    head.className = 'report-head';
    if (report.ok) {
        const s = report.stats;
        const bits = [`${s.valid} word${s.valid === 1 ? '' : 's'}`];
        if (s.invalid) bits.push(`${s.invalid} row${s.invalid === 1 ? '' : 's'} skipped`);
        if (s.duplicates) bits.push(`${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'} removed (first row kept)`);
        head.textContent = mode === 'preview'
            ? `File looks good ✓ ${bits.join(' · ')}. Press "Save dataset" to import.`
            : `Saved ✓ ${bits.join(' · ')}.`;
    } else {
        head.textContent = '✗ ' + describeFailure(report);
    }
    box.appendChild(head);

    for (const w of report.warnings || []) {
        const p = document.createElement('p');
        p.className = 'report-warn';
        p.textContent = '⚠ ' + w.message;
        box.appendChild(p);
    }

    const errs = report.errors || [];
    if (errs.length) {
        const list = document.createElement('ul');
        list.className = 'report-rows';
        for (const e of errs) {
            const li = document.createElement('li');
            li.textContent = `Row ${e.row}: ${e.message}` + (e.sample ? ` — ${e.sample}` : '');
            list.appendChild(li);
        }
        const hidden = (report.stats ? report.stats.invalid : 0) - errs.length;
        if (hidden > 0) {
            const li = document.createElement('li');
            li.textContent = `…and ${hidden} more skipped row${hidden === 1 ? '' : 's'}.`;
            list.appendChild(li);
        }
        box.appendChild(list);
    }

    const dups = report.duplicates || [];
    if (dups.length) {
        const p = document.createElement('p');
        p.className = 'report-warn';
        const shown = dups.slice(0, 8).map(d => d.word).join(', ');
        const extra = (report.stats ? report.stats.duplicates : dups.length) - Math.min(dups.length, 8);
        p.textContent = `Duplicates skipped: ${shown}${extra > 0 ? ` (+${extra} more)` : ''}.`;
        box.appendChild(p);
    }
}

function resetUploadForm() {
    pendingCsvText = null;
    custom.uploadBtn.disabled = true;
    custom.uploadFile.value = '';
    custom.uploadName.value = '';
}

function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ''; }
}

function miniBtn(label, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn mini ' + (cls || 'ghost');
    b.textContent = label;
    return b;
}

function refreshCustomUI() {
    chrome.runtime.sendMessage({ action: 'listCustomDatasets' }, res => {
        if (chrome.runtime.lastError || !res || !res.ok) return;
        renderCustomList(res.datasets, res.activeKey);
    });
}

function renderCustomList(datasets, activeKey) {
    custom.list.textContent = '';
    custom.empty.hidden = datasets.length > 0;
    for (const d of datasets) custom.list.appendChild(customRowEl(d, activeKey));
}

function customRowEl(d, activeKey) {
    const li = document.createElement('li');
    li.className = 'custom-row-item';
    const isActive = activeKey === C.customKeyFor(d.id);

    const info = document.createElement('div');
    info.className = 'custom-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'custom-name';
    nameEl.textContent = d.name;
    nameEl.title = d.name;
    const metaEl = document.createElement('span');
    metaEl.className = 'custom-meta';
    metaEl.textContent = `${d.count} ${d.count === 1 ? 'word' : 'words'} · updated ${fmtDate(d.updatedAt)}`;
    info.append(nameEl, metaEl);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    let useBtn;
    if (isActive) {
        useBtn = document.createElement('span');
        useBtn.className = 'badge-active';
        useBtn.textContent = 'Active';
    } else {
        useBtn = miniBtn('Use');
        useBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: C.customKeyFor(d.id) }, () => {
                void chrome.runtime.lastError;
                flashSaved();
                refreshDatasetInfo();
                refreshCustomUI();
            });
        });
    }

    const renameBtn = miniBtn('Rename');
    renameBtn.addEventListener('click', () => startRename(li, d));
    const replaceBtn = miniBtn('Replace');
    replaceBtn.addEventListener('click', () => {
        replaceTargetId = d.id;
        custom.replaceFile.click();
    });
    const deleteBtn = miniBtn('Delete', 'danger');
    deleteBtn.addEventListener('click', () => startDelete(li, d, isActive));

    actions.append(useBtn, renameBtn, replaceBtn, deleteBtn);
    li.append(info, actions);
    return li;
}

function startRename(li, d) {
    li.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'rename-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = C.CUSTOM_LIMITS.MAX_NAME_LEN;
    input.value = d.name;
    input.className = 'rename-input';
    input.setAttribute('aria-label', 'New dataset name');
    const save = miniBtn('Save');
    const cancel = miniBtn('Cancel');
    save.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        chrome.runtime.sendMessage({ action: 'renameCustomDataset', id: d.id, name }, () => {
            void chrome.runtime.lastError;
            flashSaved();
            refreshDatasetInfo();
            refreshCustomUI();
        });
    });
    cancel.addEventListener('click', refreshCustomUI);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') save.click();
        else if (e.key === 'Escape') refreshCustomUI();
    });
    wrap.append(input, save, cancel);
    li.appendChild(wrap);
    input.focus();
    input.select();
}

function startDelete(li, d, isActive) {
    li.textContent = '';
    const strip = document.createElement('div');
    strip.className = 'inline-confirm';
    strip.setAttribute('aria-live', 'assertive');
    const msg = document.createElement('p');
    msg.className = 'confirm-msg';
    msg.textContent = `Delete "${d.name}"? This cannot be undone.`
        + (isActive ? ' This is your active dataset - Merid will switch back to SAT.' : '');
    const btns = document.createElement('div');
    btns.className = 'row-actions';
    const del = miniBtn('Delete', 'danger');
    const cancel = miniBtn('Cancel');
    del.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'deleteCustomDataset', id: d.id }, () => {
            void chrome.runtime.lastError;
            flashSaved();
            refreshDatasetInfo();
            refreshCustomUI();
        });
    });
    cancel.addEventListener('click', refreshCustomUI);
    strip.addEventListener('keydown', e => { if (e.key === 'Escape') refreshCustomUI(); });
    btns.append(del, cancel);
    strip.append(msg, btns);
    li.appendChild(strip);
    cancel.focus();
}

/** Shared pre-checks + read for the upload and replace pickers. */
function readCsvFile(file, onText) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
        showReportMessage('✗ Please choose a .csv file (a plain-text CSV, not Excel .xlsx).', true);
        return;
    }
    if (file.size > C.CUSTOM_LIMITS.MAX_FILE_CHARS * 4) {
        showReportMessage('✗ ' + FILE_ERRORS.TOO_LARGE, true);
        return;
    }
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result || ''));
    reader.onerror = () => showReportMessage('✗ Could not read the file.', true);
    reader.readAsText(file, 'utf-8');
}

function wireCustom() {
    // Point every "create a dataset" link at the fixed merid.site URL (A10).
    document.querySelectorAll('a.create-dataset-url').forEach(a => {
        a.href = window.VMFirebaseConfig.webCreateDatasetUrl;
    });

    // Upload flow: validate locally for an instant preview; the background
    // re-runs the same validator on save and stores the result.
    custom.uploadFile.addEventListener('change', () => {
        pendingCsvText = null;
        custom.uploadBtn.disabled = true;
        const file = custom.uploadFile.files[0];
        readCsvFile(file, text => {
            const report = C.validateDatasetCsv(text);
            renderReport(report, 'preview');
            if (report.ok) {
                pendingCsvText = text;
                custom.uploadBtn.disabled = false;
                if (!custom.uploadName.value.trim()) {
                    custom.uploadName.value = file.name.replace(/\.csv$/i, '')
                        .slice(0, C.CUSTOM_LIMITS.MAX_NAME_LEN);
                }
            }
        });
    });

    custom.uploadBtn.addEventListener('click', () => {
        if (!pendingCsvText) return;
        const name = custom.uploadName.value.trim() || 'My dataset';
        custom.uploadBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'importCustomDataset', name, csvText: pendingCsvText }, res => {
            if (chrome.runtime.lastError || !res) {
                showReportMessage('✗ ' + FILE_ERRORS.UNKNOWN, true);
                custom.uploadBtn.disabled = false;
                return;
            }
            if (!res.ok) {
                if (res.report) renderReport(res.report, 'saved');
                else showReportMessage('✗ ' + (FILE_ERRORS[res.code] || FILE_ERRORS.UNKNOWN), true);
                custom.uploadBtn.disabled = false;
                return;
            }
            renderReport(res.report, 'saved');
            resetUploadForm();
            refreshCustomUI();
            flashSaved();
        });
    });

    // Replace flow: the row's Replace button stamps the target id, then this
    // shared hidden picker sends the file straight to the background.
    custom.replaceFile.addEventListener('change', () => {
        const file = custom.replaceFile.files[0];
        const id = replaceTargetId;
        replaceTargetId = null;
        custom.replaceFile.value = '';
        if (!file || !id) return;
        readCsvFile(file, text => {
            chrome.runtime.sendMessage({ action: 'replaceCustomDataset', id, csvText: text }, res => {
                if (chrome.runtime.lastError || !res) { showReportMessage('✗ ' + FILE_ERRORS.UNKNOWN, true); return; }
                if (!res.ok) {
                    if (res.report) renderReport(res.report, 'saved');
                    else showReportMessage('✗ ' + (FILE_ERRORS[res.code] || FILE_ERRORS.UNKNOWN), true);
                    return;
                }
                renderReport(res.report, 'saved');
                refreshCustomUI();
                refreshDatasetInfo();
                flashSaved();
            });
        });
    });

    // One-shot fallback notice written by the background when the selected
    // custom dataset went missing.
    chrome.storage.local.get(['vm_dataset_notice'], l => {
        if (l.vm_dataset_notice && l.vm_dataset_notice.code === 'CUSTOM_MISSING') {
            custom.notice.textContent = 'Your custom dataset could not be found on this device, so Merid switched back to SAT.';
            custom.notice.hidden = false;
            chrome.storage.local.remove('vm_dataset_notice');
        }
    });

    // Keep the list and seg in step with changes made elsewhere (popup,
    // background fallback, another options tab).
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.vm_custom_index) refreshCustomUI();
        if (area === 'sync' && changes.datasetKey) {
            setActive(els.datasetSeg, changes.datasetKey.newValue);
            refreshDatasetInfo();
            refreshCustomUI();
        }
    });

    refreshCustomUI();
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
        els.aiSaveBtn.disabled = true;
        // The background saves locally AND backs the key up to the signed-in
        // account (users/{uid}/settings/ai) so it follows the user across devices.
        chrome.runtime.sendMessage({ type: 'MERID_AI_SAVE_KEY', key }, res => {
            els.aiSaveBtn.disabled = false;
            if (chrome.runtime.lastError || !res || !res.ok) {
                showAiStatus('Could not save the key. Reload Merid at chrome://extensions and try again.', true);
                return;
            }
            flashSaved();
            const cloud = res.cloud || {};
            if (!key) {
                showAiStatus('Key removed' + (cloud.ok ? ' (here and from your account).' : '.'), false);
            } else if (cloud.ok) {
                showAiStatus('Key saved on this device and backed up to your account.', false);
            } else if (cloud.code === 'SIGNED_OUT') {
                showAiStatus('Key saved on this device. Sign in above to keep it with your account across devices.', false);
            } else {
                showAiStatus('Key saved on this device. Account backup will retry after your next sign-in.', false);
            }
        });
    });

    els.aiTestBtn.addEventListener('click', () => {
        const key = els.aiKey.value.trim();
        if (!key) { showAiStatus('Paste an API key first.', true); return; }
        els.aiTestBtn.disabled = true;
        showAiStatus('Testing key…', false);
        chrome.runtime.sendMessage({ type: 'MERID_AI_TEST_KEY', key }, res => {
            els.aiTestBtn.disabled = false;
            if (chrome.runtime.lastError || !res) {
                showAiStatus('Could not reach the extension background. Reload Merid at chrome://extensions and try again.', true);
                return;
            }
            if (res.ok) { showAiStatus('Key works ✓' + (res.model ? ` (model: ${res.model})` : ''), false); return; }

            const detail = res.detail ? ` Google says: “${res.detail}”` : '';
            if (res.status === 400 || res.status === 401 || res.status === 403) {
                showAiStatus('Key was rejected by Google. Use an API key from aistudio.google.com (with no API restrictions).' + detail, true);
            } else if (res.status === 404) {
                showAiStatus('The Gemini model is not available for this key/project.' + detail, true);
            } else if (res.status === 429) {
                showAiStatus('Key works but hit the free-tier rate limit. Wait a minute and try again.' + detail, false);
            } else if (res.status === 500 || res.status === 503) {
                showAiStatus('Google’s Gemini server is overloaded right now. Wait a moment and try again.' + detail, true);
            } else if (res.status) {
                showAiStatus(`Google returned HTTP ${res.status}.` + detail, true);
            } else {
                showAiStatus('Could not reach Google (' + (res.detail || 'network error') + '). If you just updated Merid, reload it at chrome://extensions → ↻ Reload, then reopen this page.', true);
            }
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
    signOutBtn: document.getElementById('signOutBtn'),
    sendLinkBtn: document.getElementById('sendLinkBtn'),
    linkWait: document.getElementById('linkWait'),
    linkInput: document.getElementById('linkInput'),
    linkSignInBtn: document.getElementById('linkSignInBtn'),
    googleBtn: document.getElementById('googleSignInBtn')
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    NETWORK: 'No connection. Check your internet and try again.',
    // One-click Google sign-in
    GOOGLE_NOT_CONFIGURED: 'Google sign-in isn\'t set up for this build yet: add the OAuth Web client ID as googleClientId in lib/firebase-config.js (see docs/FIREBASE_SETUP.md).',
    GOOGLE_CANCELLED: 'Google sign-in was cancelled.',
    GOOGLE_BAD_RESPONSE: 'Google sign-in failed. Please try again.',
    // Email-link (passwordless) sign-in
    OPERATION_NOT_ALLOWED: 'Email-link sign-in is not enabled for this Firebase project (console → Authentication → Sign-in method → Email link).',
    INVALID_OOB_CODE: 'That link is invalid or was already used. Send yourself a new one.',
    EXPIRED_OOB_CODE: 'That link has expired. Send yourself a new one.',
    BAD_LINK: 'That doesn\'t look like the sign-in link. Paste the full link from the email (it contains "oobCode=").'
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

// --- Passwordless email-link sign-in (no password to remember) ---
function sendSignInLink() {
    const email = account.email.value.trim();
    if (!EMAIL_RE.test(email)) { showAuthError('INVALID_EMAIL'); return; }
    showAuthError(null);
    account.sendLinkBtn.disabled = true;
    account.sendLinkBtn.textContent = 'Sending…';
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_SEND_LINK', email }, (res) => {
        account.sendLinkBtn.disabled = false;
        account.sendLinkBtn.textContent = 'Email me a sign-in link';
        if (chrome.runtime.lastError || !res) { showAuthError('NETWORK'); return; }
        if (!res.ok) { showAuthError(res.code); return; }
        account.linkWait.hidden = false;
        account.linkInput.focus();
    });
}

function completeLinkSignIn() {
    const email = account.email.value.trim();
    const link = account.linkInput.value.trim();
    if (!EMAIL_RE.test(email)) { showAuthError('INVALID_EMAIL'); return; }
    if (!link) { showAuthError('BAD_LINK'); return; }
    showAuthError(null);
    account.linkSignInBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_LINK_SIGNIN', email, link }, (res) => {
        account.linkSignInBtn.disabled = false;
        if (chrome.runtime.lastError || !res) { showAuthError('NETWORK'); return; }
        if (!res.ok) { showAuthError(res.code); return; }
        account.linkInput.value = '';
        account.linkWait.hidden = true;
        refreshAccountCard();
    });
}

function submitAuth(isNewAccount) {
    const email = account.email.value.trim();
    const password = account.password.value;
    if (!EMAIL_RE.test(email)) { showAuthError('INVALID_EMAIL'); return; }
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

// --- One-click Google sign-in (account picker via chrome.identity) ---
function googleSignIn() {
    showAuthError(null);
    account.googleBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_GOOGLE_SIGNIN' }, (res) => {
        account.googleBtn.disabled = false;
        if (chrome.runtime.lastError || !res) { showAuthError('NETWORK'); return; }
        if (!res.ok) { if (res.code !== 'GOOGLE_CANCELLED') showAuthError(res.code); return; }
        refreshAccountCard();
    });
}

function wireAccount() {
    if (!account.card) return;
    account.googleBtn.addEventListener('click', googleSignIn);
    account.signInBtn.addEventListener('click', () => submitAuth(false));
    account.signUpBtn.addEventListener('click', () => submitAuth(true));
    account.password.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(false); });
    account.sendLinkBtn.addEventListener('click', sendSignInLink);
    account.linkSignInBtn.addEventListener('click', completeLinkSignIn);
    account.linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') completeLinkSignIn(); });
    account.signOutBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'MERID_SYNC_SIGN_OUT' }, () => {
            void chrome.runtime.lastError;
            refreshAccountCard();
        });
    });
    refreshAccountCard();
    // Live-update the sync line while the page is open (storage-driven, cheap).
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.vm_sync_status || changes.vm_auth) refreshAccountCard();
        // Key restored from the account after sign-in: reflect it in the field.
        if (changes.geminiApiKey && document.activeElement !== els.aiKey) {
            els.aiKey.value = changes.geminiApiKey.newValue || '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => { load(); wire(); wireAccount(); wireCustom(); });

