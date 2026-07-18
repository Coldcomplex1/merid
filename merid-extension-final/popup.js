const C = window.VMCore;

document.addEventListener('DOMContentLoaded', () => {
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
            datasetNotice.textContent = 'Your custom dataset could not be found, so Merid switched back to SAT.';
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

    // AI Context Check: shows the on-state once configured. Until the user has
    // saved their own Gemini API key, every popup open also shows the
    // onboarding modal that teaches how to create and paste the key.
    const aiHint = document.getElementById('ai-hint');
    const aiModal = document.getElementById('ai-key-modal');
    const openOptions = () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    };
    let aiKeyConfigured = false;
    chrome.storage.sync.get(['aiCheckEnabled'], (s) => {
        chrome.storage.local.get(['geminiApiKey'], (l) => {
            aiKeyConfigured = !!l.geminiApiKey;
            if (s.aiCheckEnabled && aiKeyConfigured) {
                aiHint.textContent = 'AI Context Check: ON';
                aiHint.classList.add('on');
            }
            if (!aiKeyConfigured) aiModal.hidden = false;
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

    // Opens the merid.site deck (cloud-synced view) in a new tab. The URL is a
    // fixed constant from lib/firebase-config.js - never user-supplied (A10).
    document.getElementById('view-deck-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: window.VMFirebaseConfig.webDeckUrl });
    });

    // Account section + footer sync hint. Sign-in happens on merid.site (the
    // /login page has Google + email); the session carries into the extension
    // through the content-bridge SSO, so the popup only needs to link there.
    // The URL is a fixed constant from lib/firebase-config.js (A10).
    const openLoginPage = () => chrome.tabs.create({ url: window.VMFirebaseConfig.webLoginUrl });
    const accountSection = document.getElementById('account-section');
    const accountSignedOut = document.getElementById('account-signed-out');
    const accountSignedIn = document.getElementById('account-signed-in');
    document.getElementById('signin-btn').addEventListener('click', openLoginPage);

    const syncHint = document.getElementById('sync-hint');
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status || status.state === 'disabled') return;
        accountSection.hidden = false;
        if (status.state === 'signed-out') {
            accountSignedOut.hidden = false;
            syncHint.hidden = false;
            syncHint.classList.add('warn');
            syncHint.textContent = '⚠ Not signed in - saved words stay on this device only.';
            syncHint.addEventListener('click', openLoginPage);
        } else {
            accountSignedIn.hidden = false;
            document.getElementById('account-email').textContent = status.email || 'your account';
            syncHint.hidden = false;
            syncHint.textContent = 'Syncing to your deck as ' + (status.email || 'your account');
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
        extensionToggle.textContent = enabled ? 'Extension is ON' : 'Extension is OFF';
        extensionToggle.classList.toggle('active', enabled);
    }
});
