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
    directionHint: document.getElementById('directionHint'),
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
    // Scan directions this build offers. The markup ships the withdrawn one
    // hidden, so this only has to put it (and the line about running both at
    // once, which is only true when there are two) back when the flag says so.
    els.directionCards.querySelectorAll('.mode-card[data-mode="engEng"]')
        .forEach(card => { card.hidden = !C.ENG_ENG_AVAILABLE; });
    els.directionHint.hidden = !C.ENG_ENG_AVAILABLE;

    chrome.storage.sync.get(SYNC_KEYS, sync => {
        const s = C.withDefaults(sync);
        setActive(els.modeSeg, s.replacementMode);
        setActive(els.intensitySeg, C.normalizeIntensity(s.frequency));
        setCard('vieEng', !!s.vieEngMode);
        setCard('engEng', !!s.engEngMode);
        setActive(els.datasetSeg, s.datasetKey);
        refreshDatasetInfo();
    });
    // AI context check: toggle lives in sync, the key stays local-only.
    chrome.storage.sync.get(['aiCheckEnabled'], raw => {
        setActive(els.aiSeg, C.withDefaults(raw).aiCheckEnabled ? 'on' : 'off');
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
// Sites. Three lists, in descending order of the reader's control:
//   disabledSites  - sites they turned off (add/remove here or from the popup)
//   allowedSites   - default-off sites they turned back on (popup only; this
//                    page can put them back)
//   built-in       - read-only, rendered straight from VMCore
// Both editable lists live in storage.sync; open tabs re-scan on their own via
// the storage.onChanged listener in content.js.
// =============================================================
const sites = {
    pausedList: document.getElementById('pausedList'),
    pausedEmpty: document.getElementById('pausedEmpty'),
    pauseInput: document.getElementById('pauseInput'),
    pauseAddBtn: document.getElementById('pauseAddBtn'),
    pauseError: document.getElementById('pauseError'),
    allowedList: document.getElementById('allowedList'),
    allowedNone: document.getElementById('allowedNone'),
    defaultOffCatalog: document.getElementById('defaultOffCatalog'),
    blockedCatalog: document.getElementById('blockedCatalog')
};

/**
 * What the reader may type into "turn Merid off on another site". A full URL
 * is accepted and reduced to its hostname, since pasting one is the obvious
 * thing to do. Returns '' when there is nothing usable.
 */
function parseSiteInput(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (s.indexOf('://') !== -1) {
        try { s = new URL(s).hostname; } catch (e) { return ''; }
    }
    s = s.split('/')[0].split('?')[0].split('#')[0].split('@').pop();
    s = C.canonicalHost(s).replace(/\.$/, '');
    // A bare word is a typo, not a site; anything with a space or a scheme
    // separator left in it never matches a hostname.
    if (!/^[a-z0-9.-]+$/.test(s) || s.indexOf('.') === -1) return '';
    return s;
}

function siteRowEl(host, actionLabel, onAction) {
    const li = document.createElement('li');
    li.className = 'custom-row-item';

    const info = document.createElement('div');
    info.className = 'custom-info';
    const nameEl = document.createElement('span');
    nameEl.className = 'custom-name';
    nameEl.textContent = host;
    nameEl.title = host;
    info.append(nameEl);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const btn = miniBtn(actionLabel);
    btn.addEventListener('click', onAction);
    actions.append(btn);

    li.append(info, actions);
    return li;
}

/** Read-only rendering of a built-in list, grouped by category. */
function renderCatalog(box, byCategory) {
    if (!box) return;
    box.textContent = '';
    for (const key of Object.keys(byCategory)) {
        const head = document.createElement('p');
        head.className = 'subhead site-cat';
        head.textContent = C.SITE_CATEGORY_LABELS[key] || key;
        const body = document.createElement('p');
        body.className = 'hint site-cat-hosts';
        body.textContent = byCategory[key].join(', ');
        box.append(head, body);
    }
}

function renderSiteLists(disabledSites, allowedSites) {
    sites.pausedList.textContent = '';
    sites.pausedEmpty.hidden = disabledSites.length > 0;
    for (const host of disabledSites) {
        sites.pausedList.appendChild(siteRowEl(host, 'Turn back on', () => {
            writeSiteLists(C.removeSiteFromList(disabledSites, host), allowedSites);
        }));
    }

    sites.allowedList.textContent = '';
    sites.allowedNone.hidden = allowedSites.length > 0;
    for (const host of allowedSites) {
        sites.allowedList.appendChild(siteRowEl(host, 'Turn back off', () => {
            writeSiteLists(disabledSites, C.removeSiteFromList(allowedSites, host));
        }));
    }
}

function writeSiteLists(disabledSites, allowedSites) {
    chrome.storage.sync.set({ disabledSites, allowedSites }, () => {
        flashSaved();
        renderSiteLists(disabledSites, allowedSites);
    });
}

function refreshSiteUI() {
    chrome.storage.sync.get(['disabledSites', 'allowedSites'], (s) => {
        renderSiteLists(
            Array.isArray(s.disabledSites) ? s.disabledSites : [],
            Array.isArray(s.allowedSites) ? s.allowedSites : []);
    });
}

function wireSites() {
    if (!sites.pausedList) return;
    renderCatalog(sites.defaultOffCatalog, C.DEFAULT_OFF_BY_CATEGORY);
    renderCatalog(sites.blockedCatalog, C.BLOCKED_BY_CATEGORY);
    refreshSiteUI();

    const showError = (msg) => {
        sites.pauseError.hidden = !msg;
        sites.pauseError.textContent = msg || '';
        sites.pauseError.classList.toggle('auth-error', !!msg);
    };

    sites.pauseInput.addEventListener('input', () => {
        sites.pauseAddBtn.disabled = !parseSiteInput(sites.pauseInput.value);
        showError('');
    });

    sites.pauseAddBtn.addEventListener('click', () => {
        const host = parseSiteInput(sites.pauseInput.value);
        if (!host) return showError('That does not look like a site name.');
        if (C.isHostBlocked(host)) {
            return showError(`Merid is already always off on ${host}.`);
        }
        chrome.storage.sync.get(['disabledSites', 'allowedSites'], (s) => {
            const disabled = Array.isArray(s.disabledSites) ? s.disabledSites : [];
            const allowed = Array.isArray(s.allowedSites) ? s.allowedSites : [];
            if (disabled.length >= C.MAX_SITE_LIST) {
                return showError(`You can turn Merid off on up to ${C.MAX_SITE_LIST} sites.`);
            }
            sites.pauseInput.value = '';
            sites.pauseAddBtn.disabled = true;
            showError('');
            // Turning a site off also clears any allow entry for it, so the two
            // lists never disagree about the same host.
            writeSiteLists(C.addSiteToList(disabled, host), C.removeSiteFromList(allowed, host));
        });
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && (changes.disabledSites || changes.allowedSites)) refreshSiteUI();
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
            li.textContent = `Row ${e.row}: ${e.message}` + (e.sample ? ` - ${e.sample}` : '');
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
        + (isActive ? ` This is your active dataset - Merid will switch back to ${C.DATASET_REGISTRY[C.DEFAULT_DATASET_KEY].label}.` : '');
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
    // Point every outbound link at its configured merid.site URL (A10). Each
    // destination has its own hook class - a link must not borrow another's,
    // or its href gets rewritten to the wrong page.
    document.querySelectorAll('a.create-dataset-url').forEach(a => {
        a.href = window.VMFirebaseConfig.webCreateDatasetUrl;
    });
    document.querySelectorAll('a.api-key-guide-url').forEach(a => {
        a.href = window.VMFirebaseConfig.webApiKeyGuideUrl;
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
            custom.notice.textContent = 'Your custom dataset could not be found on this device, so Merid switched back to '
                + C.DATASET_REGISTRY[C.DEFAULT_DATASET_KEY].label + '.';
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
    // One-click Google sign-in stays hidden until googleClientId is set in
    // lib/firebase-config.js (and "identity" is restored in manifest.json).
    // Users still sign in with Google on merid.site - the SSO bridge carries
    // the session into the extension.
    const googleConfigured = !!(window.VMFirebaseConfig && window.VMFirebaseConfig.googleClientId);
    const googleRow = document.getElementById('googleRow');
    const authDivider = document.getElementById('authDivider');
    if (googleRow) googleRow.hidden = !googleConfigured;
    if (authDivider) authDivider.hidden = !googleConfigured;
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

// =============================================================
// "What Merid has learned about you"
//
// Reads the local profile back to the user in plain language and gives it its
// own Forget button. A personalization system nobody can inspect or reset is
// a trust problem, and "Delete all stored data" is too blunt for the job -
// it also wipes the deck.
// =============================================================
const Prof = window.VMProfile;

function renderProfilePanel() {
    const card = document.getElementById('profileCard');
    if (!card || !Prof) return;
    const empty = document.getElementById('profileEmpty');
    const body = document.getElementById('profileBody');

    chrome.runtime.sendMessage({ type: 'MERID_PROFILE_GET' }, (res) => {
        if (chrome.runtime.lastError) return;
        const p = Prof.withDefaults(res && res.profile);
        const words = Object.keys(p.words);

        if (!p.events && !words.length) {
            empty.hidden = false;
            body.hidden = true;
            return;
        }
        empty.hidden = true;
        body.hidden = false;

        const pct = Math.round(Prof.confidence(p) * 100);
        document.getElementById('profileBar').style.width = pct + '%';
        document.getElementById('profileConfidence').textContent =
            `${p.events} feedback signal${p.events === 1 ? '' : 's'} so far - personalization is ${pct}% dialled in.` +
            (pct < 100 ? ' Below 100% Merid stays close to its default behaviour on purpose.' : '');

        // Rank the CEFR buckets the same way the ranker does.
        const levels = Object.keys(p.levels)
            .map(k => ({ k, rate: Prof.bucketRate(p.levels[k]), n: p.levels[k].up + p.levels[k].down }))
            .filter(x => x.n >= 2)
            .sort((a, b) => b.rate - a.rate);
        document.getElementById('profileLevel').textContent = levels.length ? levels[0].k : 'still working it out';

        const topics = Object.keys(p.topics)
            .map(k => ({ k, n: p.topics[k].up + p.topics[k].down }))
            .filter(x => x.n >= 2)
            .sort((a, b) => b.n - a.n)
            .slice(0, 3)
            .map(x => x.k);
        document.getElementById('profileTopics').textContent = topics.length ? topics.join(', ') : 'still working it out';
        document.getElementById('profileWords').textContent = String(words.length);

        renderLevelTip(p);

        const score = w => (w.up + w.saved) - (w.down + w.known);
        const chips = (el, list, cls) => {
            el.textContent = '';
            list.forEach(w => {
                const span = document.createElement('span');
                span.className = 'learn-chip ' + cls;
                span.textContent = w;  // textContent: never innerHTML for stored words
                el.appendChild(span);
            });
        };
        const ranked = words
            .map(w => ({ w, s: score(p.words[w]) }))
            .filter(x => x.s !== 0)
            .sort((a, b) => b.s - a.s);
        chips(document.getElementById('profileLiked'), ranked.filter(x => x.s > 0).slice(0, 12).map(x => x.w), 'up');
        chips(document.getElementById('profileDisliked'),
            ranked.filter(x => x.s < 0).reverse().slice(0, 12).map(x => x.w), 'down');
    });
}

/**
 * Offer a different dataset when the reader's own behaviour says the current
 * one no longer fits - too many words they already know, or too many they
 * reject. One tap switches, and the same message drives both directions.
 */
function renderLevelTip(profile) {
    const btn = document.getElementById('levelTip');
    if (!btn || !Prof) return;
    chrome.storage.sync.get(['datasetKey'], (s) => {
        // "All" and custom datasets have no place on the CEFR ladder, so
        // suggestLevel returns null for them and nothing is offered.
        const tip = Prof.suggestLevel(profile, C.datasetTagFor(s.datasetKey || C.DEFAULT_DATASET_KEY));
        if (!tip) { btn.hidden = true; return; }
        btn.textContent = tip.direction === 'up'
            ? `You already know a lot of ${tip.from} words - try ${tip.to} →`
            : `${tip.from} looks like a stretch right now - try ${tip.to} →`;
        btn.hidden = false;
        btn.onclick = () => {
            const target = tip.to.toLowerCase();
            chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: target }, () => {
                void chrome.runtime.lastError;
                setActive(els.datasetSeg, target);
                refreshDatasetInfo();
                flashSaved();
                btn.hidden = true;
            });
        };
    });
}

function wireProfilePanel() {
    const btn = document.getElementById('profileReset');
    if (!btn) return;
    const status = document.getElementById('profileStatus');
    btn.addEventListener('click', () => {
        if (!confirm('Forget everything Merid learned about your preferences? Your deck and settings are not affected.')) return;
        chrome.runtime.sendMessage({ type: 'MERID_PROFILE_RESET' }, () => {
            void chrome.runtime.lastError;
            status.hidden = false;
            status.textContent = 'Cleared. Merid starts learning again from your next page.';
            renderProfilePanel();
        });
    });
    // The service worker rewrites the profile as you browse; keep this live.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.vm_profile) renderProfilePanel();
    });
}

/**
 * Daily allowance for the hosted AI check. The numbers come from the server on
 * every successful call, so this only reads back what it last said - it is a
 * report, never the thing enforcing the limit.
 */
function renderAiQuota() {
    const el = document.getElementById('aiQuota');
    if (!el) return;
    chrome.storage.local.get(['vm_ai_quota', 'geminiApiKey'], (r) => {
        if (r.geminiApiKey) {
            el.hidden = false;
            el.textContent = 'Using your own API key - no daily limit from Merid.';
            return;
        }
        const q = r.vm_ai_quota;
        if (!q || typeof q.limit !== 'number') { el.hidden = true; return; }
        const left = Math.max(0, q.limit - (q.used || 0));
        el.hidden = false;
        el.textContent = q.exhausted
            ? `Daily limit reached (${q.limit}). It resets at midnight UTC.` +
              (q.anonymous ? ' Signing in raises it.' : '')
            : `${left} of ${q.limit} AI checks left today.` +
              (q.anonymous ? ' Sign in to raise the limit.' : '');
    });
}

/**
 * "Test the AI check" - runs one real check and reports which link failed.
 * The whole point is to answer "is it the key or the extension?" without
 * anyone having to read a console log.
 */
function wireAiDiagnose() {
    const btn = document.getElementById('aiDiagnoseBtn');
    const out = document.getElementById('aiDiagnosis');
    if (!btn || !out) return;
    btn.addEventListener('click', () => {
        btn.disabled = true;
        out.hidden = false;
        out.classList.remove('auth-error');
        out.textContent = 'Testing…';
        chrome.runtime.sendMessage({ type: 'MERID_AI_DIAGNOSE' }, (res) => {
            btn.disabled = false;
            if (chrome.runtime.lastError || !res) {
                out.classList.add('auth-error');
                out.textContent = 'Could not reach the extension background. Reload Merid at chrome://extensions and try again.';
                return;
            }
            out.classList.toggle('auth-error', !res.ok);
            out.textContent = (res.ok ? '✓ ' : '✗ ') + res.message +
                (res.detail ? ` (${res.detail})` : '');
            renderAiQuota();
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    load(); wire(); wireAccount(); wireCustom(); wireSites();
    renderProfilePanel(); wireProfilePanel();
    renderAiQuota(); wireAiDiagnose();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.vm_ai_quota || changes.geminiApiKey)) renderAiQuota();
    });
});

