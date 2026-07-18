const C = window.VMCore;

// UI strings via chrome.i18n (_locales/en + _locales/vi). Every call carries
// an English fallback so a missing message can never blank the UI.
function t(key, fallback, subs) {
    try {
        const msg = chrome.i18n.getMessage(key, subs);
        if (msg) return msg;
    } catch (e) { /* i18n unavailable (e.g. test harness) */ }
    return fallback;
}

// Static labels are marked with data-i18n (textContent) or data-i18n-html
// (innerHTML - trusted extension strings only, never user or page content).
function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const msg = t(el.dataset.i18n, '');
        if (msg) el.textContent = msg;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
        const msg = t(el.dataset.i18nHtml, '');
        if (msg) el.innerHTML = msg;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    applyI18n();

    const frequencySlider = document.getElementById('frequency-slider');
    const modeCards = document.getElementById('mode-cards');
    const extensionToggle = document.getElementById('extension-toggle');
    const datasetBtns = document.querySelectorAll('.dataset-btn');
    const modeSeg = document.getElementById('mode-seg');

    // ---- Load settings ----
    chrome.storage.sync.get(
        ['frequency', 'replacementMode', 'vieEngMode', 'engEngMode', 'extensionEnabled', 'datasetKey'],
        (raw) => {
            const s = C.withDefaults(raw);
            frequencySlider.value = s.frequency;
            setModeCard('vieEng', !!s.vieEngMode);
            setModeCard('engEng', !!s.engEngMode);
            setSegActive(modeSeg, s.replacementMode);
            document.querySelector(`.dataset-btn[data-key="${s.datasetKey}"]`)?.classList.add('active');
            updateExtensionToggleButton(s.extensionEnabled !== false);
            updateSliderLabels(s.frequency);
        }
    );

    // ---- Wire settings ----
    frequencySlider.addEventListener('input', (e) => {
        updateSliderLabels(e.target.value);
        chrome.storage.sync.set({ frequency: parseInt(e.target.value, 10) });
    });

    modeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('button'); if (!btn) return;
        setSegActive(modeSeg, btn.dataset.val);
        chrome.storage.sync.set({ replacementMode: btn.dataset.val });
    });

    datasetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            datasetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            customSelect.value = '';
            customSelect.classList.remove('active');
            chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: btn.dataset.key }, () => {
                void chrome.runtime.lastError;
            });
        });
    });

    // ---- Custom datasets (uploaded on the Settings page, stored locally) ----
    const customRow = document.getElementById('custom-row');
    const customSelect = document.getElementById('custom-select');
    const datasetNotice = document.getElementById('dataset-notice');

    chrome.storage.local.get(['vm_custom_index', 'vm_dataset_notice'], (l) => {
        const index = Array.isArray(l.vm_custom_index) ? l.vm_custom_index : [];
        if (index.length) {
            for (const d of index) {
                const opt = document.createElement('option');
                opt.value = C.customKeyFor(d.id);
                opt.textContent = `${d.name} (${d.count} ${d.count === 1 ? 'word' : 'words'})`;
                customSelect.appendChild(opt);
            }
            customRow.hidden = false;
        }
        // Highlight the active custom dataset (the 4 built-in buttons simply
        // find no matching data-key and stay unlit).
        chrome.storage.sync.get(['datasetKey'], (s) => {
            if (C.isCustomKey(s.datasetKey)) {
                customSelect.value = s.datasetKey;
                if (customSelect.value === s.datasetKey) customSelect.classList.add('active');
            }
        });
        // One-shot fallback notice written by the background when the selected
        // custom dataset went missing.
        if (l.vm_dataset_notice && l.vm_dataset_notice.code === 'CUSTOM_MISSING') {
            datasetNotice.textContent = t('popupCustomMissing',
                'Your custom dataset could not be found, so Merid switched back to SAT.');
            datasetNotice.hidden = false;
            chrome.storage.local.remove('vm_dataset_notice');
        }
    });

    customSelect.addEventListener('change', () => {
        if (!customSelect.value) return;
        datasetBtns.forEach(b => b.classList.remove('active'));
        customSelect.classList.add('active');
        chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: customSelect.value }, () => {
            void chrome.runtime.lastError;
        });
    });

    // Opens the guided AI dataset builder on merid.site. Fixed constant from
    // lib/firebase-config.js - never user-supplied (A10).
    document.getElementById('create-dataset-link').addEventListener('click', () => {
        chrome.tabs.create({ url: window.VMFirebaseConfig.webCreateDatasetUrl });
    });

    // Scan-direction cards toggle independently - both can be on at once.
    modeCards.addEventListener('click', (e) => {
        const card = e.target.closest('.mode-card'); if (!card) return;
        const next = !card.classList.contains('active');
        setModeCard(card.dataset.mode, next);
        chrome.storage.sync.set({
            vieEngMode: isModeCardOn('vieEng'),
            engEngMode: isModeCardOn('engEng')
        });
    });

    extensionToggle.addEventListener('click', () => {
        chrome.storage.sync.get('extensionEnabled', (result) => {
            const newState = result.extensionEnabled === false; // toggle
            chrome.storage.sync.set({ extensionEnabled: newState }, () => {
                updateExtensionToggleButton(newState);
            });
        });
    });

    // ---- Current-tab actions: revert + per-site pause ----
    // Runs on the activeTab grant from opening the popup: the tab's URL is
    // readable for the active tab only, and only while the popup is open.
    // Hidden entirely on non-web pages (chrome://, the Web Store, PDFs...).
    const pageActions = document.getElementById('page-actions');
    const revertBtn = document.getElementById('revert-btn');
    const siteToggle = document.getElementById('site-toggle');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        let host = '';
        try {
            const u = new URL(tab.url);
            if (u.protocol === 'http:' || u.protocol === 'https:') host = C.canonicalHost(u.hostname);
        } catch (e) { /* no URL access or non-web page */ }
        if (!tab || !host) return;
        pageActions.hidden = false;
        siteToggle.title = host;

        let disabledSites = [];
        const renderSiteToggle = () => {
            const off = C.isSiteDisabled(host, disabledSites);
            siteToggle.textContent = off
                ? t('popupSiteOn', 'Turn back on for this site')
                : t('popupSiteOff', 'Turn off on this site');
            siteToggle.classList.toggle('off', off);
        };
        chrome.storage.sync.get(['disabledSites'], (s) => {
            disabledSites = Array.isArray(s.disabledSites) ? s.disabledSites : [];
            renderSiteToggle();
        });

        siteToggle.addEventListener('click', () => {
            if (C.isSiteDisabled(host, disabledSites)) {
                // Drop every entry that covers this host (an apex entry also
                // covers its subdomains, so removing it re-enables all of them).
                disabledSites = disabledSites.filter(site => {
                    const cs = C.canonicalHost(site);
                    return !(host === cs || host.endsWith('.' + cs));
                });
            } else {
                disabledSites = disabledSites.concat(host);
            }
            // Open tabs revert/re-scan on their own via storage.onChanged.
            chrome.storage.sync.set({ disabledSites }, renderSiteToggle);
        });

        revertBtn.addEventListener('click', () => {
            chrome.tabs.sendMessage(tab.id, { action: 'revertPage' }, () => {
                void chrome.runtime.lastError; // no content script on this page
            });
        });
    });

    // AI Context Check: shows the on-state once configured. Until the user has
    // saved their own Gemini API key, the onboarding modal that teaches how to
    // create and paste the key auto-opens at most once per day - never on the
    // user's first day with the popup, and never again once they pick "Don't
    // show again". It can still be opened any time from the AI Context Check
    // button.
    const aiHint = document.getElementById('ai-hint');
    const aiModal = document.getElementById('ai-key-modal');
    const openOptions = () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    };
    let aiKeyConfigured = false;
    chrome.storage.sync.get(['aiCheckEnabled'], (s) => {
        chrome.storage.local.get(['geminiApiKey', 'vm_ai_modal_day', 'vm_ai_modal_optout', 'vm_first_day'], (l) => {
            aiKeyConfigured = !!l.geminiApiKey;
            if (s.aiCheckEnabled && aiKeyConfigured) {
                aiHint.textContent = t('popupAiCheckOn', 'AI Context Check: ON');
                aiHint.classList.add('on');
            }
            const today = new Date().toDateString();
            if (!l.vm_first_day) chrome.storage.local.set({ vm_first_day: today });
            const isFirstDay = !l.vm_first_day || l.vm_first_day === today;
            if (!aiKeyConfigured && !l.vm_ai_modal_optout && !isFirstDay && l.vm_ai_modal_day !== today) {
                aiModal.hidden = false;
                chrome.storage.local.set({ vm_ai_modal_day: today });
            }
        });
    });
    aiHint.addEventListener('click', () => {
        if (aiKeyConfigured) openOptions();
        else aiModal.hidden = false;
    });
    document.getElementById('ai-modal-settings').addEventListener('click', openOptions);
    // Guide URL is a fixed constant from lib/firebase-config.js - never
    // user-supplied (A10).
    document.getElementById('ai-modal-guide').addEventListener('click', () => {
        chrome.tabs.create({ url: window.VMFirebaseConfig.webApiKeyGuideUrl });
    });
    document.getElementById('ai-modal-later').addEventListener('click', () => {
        aiModal.hidden = true;
    });
    document.getElementById('ai-modal-never').addEventListener('click', () => {
        aiModal.hidden = true;
        chrome.storage.local.set({ vm_ai_modal_optout: true });
    });

    // Opens the merid.site deck (cloud-synced view) in a new tab. The URL is a
    // fixed constant from lib/firebase-config.js - never user-supplied (A10).
    document.getElementById('view-deck-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: window.VMFirebaseConfig.webDeckUrl });
    });

    // Account section + footer sync hint. Sign-in happens on merid.site (the
    // /login page has Google + email); the session carries into the extension
    // through the content-bridge SSO, so the popup only needs to link there.
    // The URL is a fixed constant from lib/firebase-config.js (A10).
    // While signed in the account section stays hidden - the sync line above
    // Settings already carries the identity.
    const openLoginPage = () => chrome.tabs.create({ url: window.VMFirebaseConfig.webLoginUrl });
    const accountSection = document.getElementById('account-section');
    document.getElementById('signin-btn').addEventListener('click', openLoginPage);

    const syncHint = document.getElementById('sync-hint');
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status || status.state === 'disabled') return;
        if (status.state === 'signed-out') {
            accountSection.hidden = false;
            syncHint.hidden = false;
            syncHint.classList.add('warn');
            syncHint.textContent = t('popupNotSignedIn', '⚠ Not signed in - saved words stay on this device only.');
            syncHint.addEventListener('click', openLoginPage);
        } else {
            const email = status.email || t('popupYourAccount', 'your account');
            syncHint.hidden = false;
            syncHint.textContent = t('popupSyncingAs', 'Syncing to your deck as ' + email, [email]);
        }
    });

    document.getElementById('options-btn').addEventListener('click', openOptions);

    // ---- helpers ----
    function setModeCard(mode, on) {
        const card = modeCards.querySelector(`.mode-card[data-mode="${mode}"]`);
        if (!card) return;
        card.classList.toggle('active', !!on);
        card.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function isModeCardOn(mode) {
        return !!modeCards.querySelector(`.mode-card[data-mode="${mode}"]`)?.classList.contains('active');
    }

    function setSegActive(seg, val) {
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === val));
    }

    function updateSliderLabels(value) {
        const labels = document.querySelectorAll('.slider-labels span');
        labels.forEach(span => span.classList.remove('active'));
        if (value < 33) labels[0].classList.add('active');
        else if (value < 66) labels[1].classList.add('active');
        else labels[2].classList.add('active');
    }

    function updateExtensionToggleButton(enabled) {
        extensionToggle.textContent = enabled
            ? t('popupExtensionOn', 'Extension is ON')
            : t('popupExtensionOff', 'Extension is OFF');
        extensionToggle.classList.toggle('active', enabled);
    }
});
