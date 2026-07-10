const C = window.VMCore;

document.addEventListener('DOMContentLoaded', () => {
    const frequencySlider = document.getElementById('frequency-slider');
    const modeCards = document.getElementById('mode-cards');
    const datasetBtns = document.querySelectorAll('.dataset-btn');
    const modeSeg = document.getElementById('mode-seg');

    // Per-page activation UI (mirrors the keyboard shortcut - same SW flow).
    const activateBtn = document.getElementById('activate-btn');
    const pageDot = document.getElementById('page-dot');
    const pageStatusText = document.getElementById('page-status-text');
    const shortcutHint = document.getElementById('shortcut-hint');

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
            updateSliderLabels(s.frequency);
        }
    );

    // ---- Per-page activation (shared with the keyboard shortcut) ----
    refreshPageStatus();
    renderShortcut();

    activateBtn.addEventListener('click', () => {
        activateBtn.disabled = true;
        pageStatusText.textContent = 'Working…';
        chrome.runtime.sendMessage({ type: 'MERID_TOGGLE_ACTIVE_TAB' }, (res) => {
            if (chrome.runtime.lastError || !res) { renderPageStatus(null); return; }
            if (!res.ok) { renderPageStatus(res.restricted ? { ok: true, restricted: true } : null); return; }
            renderPageStatus({ ok: true, restricted: false, injected: res.injected, active: res.active });
        });
    });

    function refreshPageStatus() {
        chrome.runtime.sendMessage({ type: 'MERID_QUERY_ACTIVE_TAB' }, (state) => {
            if (chrome.runtime.lastError) { renderPageStatus(null); return; }
            renderPageStatus(state);
        });
    }

    function renderPageStatus(state) {
        pageDot.className = 'page-dot';
        if (!state || !state.ok) {
            pageStatusText.textContent = 'Merid can’t run on this page.';
            pageDot.classList.add('off');
            activateBtn.disabled = true;
            activateBtn.classList.remove('active');
            activateBtn.textContent = 'Unavailable here';
            return;
        }
        if (state.restricted) {
            pageStatusText.textContent = 'Merid can’t run on this browser-protected page.';
            pageDot.classList.add('off');
            activateBtn.disabled = true;
            activateBtn.classList.remove('active');
            activateBtn.textContent = 'Unavailable here';
            return;
        }
        activateBtn.disabled = false;
        if (state.active) {
            pageStatusText.textContent = 'Merid is active on this page.';
            pageDot.classList.add('on');
            activateBtn.classList.add('active');
            activateBtn.textContent = 'Deactivate on this page';
        } else {
            pageStatusText.textContent = 'Merid is not active on this page.';
            pageDot.classList.add('idle');
            activateBtn.classList.remove('active');
            activateBtn.textContent = 'Activate on this page';
        }
    }

    function renderShortcut() {
        const isMac = /Mac/i.test(navigator.platform || '') || /Mac/i.test(navigator.userAgent || '');
        const fallback = isMac ? 'Command+Shift+Y' : 'Ctrl+Shift+Y';
        chrome.runtime.sendMessage({ type: 'MERID_GET_COMMAND' }, (res) => {
            if (chrome.runtime.lastError || !res) {
                shortcutHint.textContent = `Use your Merid keyboard shortcut to toggle this page (default ${fallback}).`;
                shortcutHint.classList.remove('warn');
                return;
            }
            if (res.shortcut) {
                shortcutHint.textContent = `Shortcut: ${res.shortcut}. Change it in Chrome’s extension shortcut settings.`;
                shortcutHint.classList.remove('warn');
            } else {
                shortcutHint.textContent = 'Merid’s shortcut is not assigned. Set one in Chrome’s extension shortcut settings.';
                shortcutHint.classList.add('warn');
            }
        });
    }

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
            chrome.runtime.sendMessage({ action: 'setDataset', datasetKey: btn.dataset.key }, () => {
                void chrome.runtime.lastError;
            });
        });
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

    document.getElementById('shortcut-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    document.getElementById('deck-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('deck.html') });
    });

    document.getElementById('options-btn').addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    });

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
});
