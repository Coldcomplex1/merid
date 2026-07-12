// Options page controller. Uses window.VMCore for defaults/registry.
// Local-only: no API keys, no backend URL, no AI settings. The deck lives on a
// separate page (deck.html).
const C = window.VMCore;

const SYNC_KEYS = ['frequency', 'replacementMode', 'vieEngMode', 'engEngMode', 'datasetKey'];

const els = {
    modeSeg: document.getElementById('modeSeg'),
    intensitySeg: document.getElementById('intensitySeg'),
    directionCards: document.getElementById('directionCards'),
    datasetSeg: document.getElementById('datasetSeg'),
    datasetInfo: document.getElementById('datasetInfo'),
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

    els.clearAll.addEventListener('click', () => {
        if (!confirm('Delete ALL stored data (settings + your deck)? This cannot be undone.')) return;
        chrome.storage.local.clear(() => chrome.storage.sync.clear(() => location.reload()));
    });
}

document.addEventListener('DOMContentLoaded', () => { load(); wire(); });
