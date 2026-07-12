// Dedicated "My deck" page. Reads the local deck (chrome.storage.local) written
// by the hover card's "Save to Deck" / "I know this" actions. Local-only.
const C = window.VMCore;

const els = {
    savedList: document.getElementById('savedList'),
    savedCount: document.getElementById('savedCount'),
    knownList: document.getElementById('knownList'),
    knownCount: document.getElementById('knownCount'),
    resetKnown: document.getElementById('resetKnown')
};

function esc(s) { return C && C.escapeHtml ? C.escapeHtml(s) : String(s); }

function render() {
    chrome.storage.local.get(['savedWords', 'knownWords'], (r) => {
        renderSaved(r.savedWords || []);
        renderKnown(r.knownWords || []);
    });
}

function renderSaved(list) {
    els.savedCount.textContent = String(list.length);
    els.savedList.innerHTML = '';
    if (!list.length) {
        els.savedList.innerHTML = '<li class="deck-empty">No saved words yet. Hover a highlighted word and click "Save to Deck".</li>';
        return;
    }
    list.forEach((entry, i) => {
        const word = entry && entry.word ? entry.word : String(entry);
        const vn = entry && entry.vietnamese ? entry.vietnamese : '';
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.innerHTML = `<span class="w">${esc(word)}</span>${vn ? `<span class="vn">${esc(vn)}</span>` : ''}`;
        li.appendChild(left);
        li.appendChild(removeButton('savedWords', i));
        els.savedList.appendChild(li);
    });
}

function renderKnown(list) {
    els.knownCount.textContent = String(list.length);
    els.knownList.innerHTML = '';
    if (!list.length) {
        els.knownList.innerHTML = '<li class="deck-empty">No known words yet. Click "I know this" on a word to stop replacing it.</li>';
        return;
    }
    list.forEach((w, i) => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.innerHTML = `<span class="w">${esc(String(w))}</span>`;
        li.appendChild(left);
        li.appendChild(removeButton('knownWords', i));
        els.knownList.appendChild(li);
    });
}

function removeButton(key, index) {
    const rm = document.createElement('button');
    rm.className = 'deck-remove';
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove');
    rm.textContent = '✕';
    rm.addEventListener('click', () => removeFrom(key, index));
    return rm;
}

function removeFrom(key, index) {
    chrome.storage.local.get([key], (r) => {
        const list = r[key] || [];
        list.splice(index, 1);
        chrome.storage.local.set({ [key]: list }, render);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    render();
    els.resetKnown.addEventListener('click', () => {
        if (!confirm('Reset the known-words list? Those words will be replaced again while you browse.')) return;
        chrome.storage.local.set({ knownWords: [] }, render);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.savedWords || changes.knownWords)) render();
    });
});
