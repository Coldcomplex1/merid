const C = window.VMCore;
const I18n = window.VMI18n;

// UI strings from the language the READER chose - on merid.site or in Settings
// - rather than the one Chrome is in. lib/i18n.js explains why the panel loads
// _locales/ itself instead of calling chrome.i18n. Every call still carries an
// English fallback so a missing message can never blank the UI.
function t(key, fallback, subs) {
    return I18n.t(key, fallback, subs);
}

const applyI18n = () => I18n.applyI18n();

// What each intensity level actually buys, in the reader's terms. These track
// VMCore.POST_WORD_CAPS - if that table changes, change these too. They are the
// English fallbacks for popupIntensityHint_*, which is where the wording lives.
const INTENSITY_HINTS = {
    casual: 'Up to 1 word per post, 2–3 in a long article.',
    focused: 'Up to 2 words per post, 3–4 in a long article.',
    locked: 'Up to 2 words per short post, 3–5 as the article gets longer.'
};

document.addEventListener('DOMContentLoaded', async () => {
    // The catalog has to be in hand before the first label is written; the
    // markup ships English, so that is what shows for the one frame it takes.
    await I18n.init();
    applyI18n();

    // A language chosen in Settings (or on merid.site) while the popup happens
    // to be open. Every label here is drawn from storage anyway, and half of
    // them from callbacks nested three deep, so the panel starts over rather
    // than trying to repaint itself piece by piece. Nothing is lost: the popup
    // holds no state that is not already saved.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && (changes.uiLang || changes.siteLang)) location.reload();
    });

    const frequencySlider = document.getElementById('frequency-slider');
    const extensionToggle = document.getElementById('extension-toggle');
    const datasetBtns = document.querySelectorAll('.dataset-btn');
    const modeSeg = document.getElementById('mode-seg');
    const cardThemeBtn = document.getElementById('card-theme-btn');

    // ---- Load settings ----
    chrome.storage.sync.get(
        ['frequency', 'replacementMode', 'extensionEnabled', 'datasetKey', 'cardTheme'],
        (raw) => {
            const s = C.withDefaults(raw);
            frequencySlider.value = String(sliderValue(s.frequency));
            setSegActive(modeSeg, s.replacementMode);
            document.querySelector(`.dataset-btn[data-key="${s.datasetKey}"]`)?.classList.add('active');
            updateExtensionToggleButton(s.extensionEnabled !== false);
            updateSliderLabels(s.frequency);
            renderCardTheme(s.cardTheme);
        }
    );

    // ---- Wire settings ----
    // The slider hands storage the 0..100 frequency it is showing, unrounded:
    // the levels are what the number resolves to downstream, not a grid the
    // thumb has to sit on, so it stays where the reader let go of it.
    frequencySlider.addEventListener('input', (e) => {
        const freq = C.intensityToFrequency(levelAt(e.target.value));
        updateSliderLabels(freq);
        chrome.storage.sync.set({ frequency: freq });
    });

    // Reload the page the reader is looking at once they let go of the slider.
    //
    // A new intensity re-scans the open page in place, and a re-scan has to
    // work with what the last one left behind: words already swapped in, words
    // held back waiting on the context check, allowances half spent. The result
    // is a page marked up to neither the old setting nor the new one. Reloading
    // is the one way to give the new number a clean page, and dragging a
    // settings slider is a moment where a reload costs the reader nothing.
    // 'change' rather than 'input', so this fires once on release instead of on
    // every pixel of the drag.
    frequencySlider.addEventListener('change', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            // Only a page Merid actually runs on, and only one whose URL the
            // activeTab grant let us read - never a blind reload of whatever is
            // in front of the user.
            if (!tab || !/^https?:/i.test(tab.url || '')) return;
            chrome.tabs.reload(tab.id, {}, () => {
                void chrome.runtime.lastError; // tab closed or not ours to reload
            });
        });
    });

    cardThemeBtn.addEventListener('click', () => {
        const next = cardThemeBtn.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
        renderCardTheme(next);
        chrome.storage.sync.set({ cardTheme: next });
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
            const fallbackLabel = C.DATASET_REGISTRY[C.DEFAULT_DATASET_KEY].label;
            datasetNotice.textContent = t('popupCustomMissing',
                `Your custom dataset could not be found, so Merid switched back to ${fallbackLabel}.`,
                [fallbackLabel]);
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

    extensionToggle.addEventListener('click', () => {
        chrome.storage.sync.get('extensionEnabled', (result) => {
            const newState = result.extensionEnabled === false; // toggle
            chrome.storage.sync.set({ extensionEnabled: newState }, () => {
                updateExtensionToggleButton(newState);
            });
        });
    });

    // ---- Current-tab action: per-site pause ----
    // Runs on the activeTab grant from opening the popup: the tab's URL is
    // readable for the active tab only, and only while the popup is open.
    // Hidden entirely on non-web pages (chrome://, the Web Store, PDFs...).
    const pageActions = document.getElementById('page-actions');
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

        // The label says what the button does to THIS site; the tooltip names
        // the site and answers the question the label leaves open, in one short
        // sentence each. A tooltip nobody finishes reading explains nothing.
        //
        // Merid never runs on its own site or on private ones (email, chats,
        // banking, sign-in, exams) and that is not the user's to change.
        // Offering a toggle that does nothing is worse than no toggle.
        if (C.isUrlBlocked(tab.url)) {
            // The site is fine and stays fine - this page is not. Said as its
            // own state, because "never scans this site" would be wrong about
            // Facebook, and the reader is one click from the feed where Merid
            // is working normally.
            siteToggle.disabled = true;
            siteToggle.classList.add('off');
            siteToggle.textContent = t('popupPageAlwaysOff', 'Never scans messages');
            siteToggle.title = t('popupPageAlwaysOffHint',
                `Merid leaves message pages alone. The rest of ${host} works as usual.`, [host]);
        } else if (C.isHostBlocked(host)) {
            siteToggle.disabled = true;
            siteToggle.classList.add('off');
            siteToggle.textContent = t('popupSiteAlwaysOff', 'Never scans this site');
            siteToggle.title = C.blockedCategory(host) === 'own'
                ? t('popupSiteAlwaysOffHint', 'Merid never runs on its own site.')
                : t('popupSiteAlwaysOffPrivate',
                    'Merid never runs on private pages like chats, email and banking. It cannot be turned on here.');
        } else {
            let disabledSites = [];
            let allowedSites = [];
            // Sites that ship off (dictionaries, editors, coursework) say so,
            // rather than looking like the user paused them and forgot.
            const defaultOff = C.isHostDefaultOff(host);
            const renderSiteToggle = () => {
                const state = C.siteToggleState(host, disabledSites, allowedSites);
                const off = state !== 'on';
                if (state === 'default-off') {
                    siteToggle.textContent = t('popupSiteTurnOn', 'Start scanning this site');
                    siteToggle.title = t('popupSiteDefaultOffHint',
                        `Merid starts off on ${host}. Click if you want it on here.`, [host]);
                } else if (off) {
                    siteToggle.textContent = t('popupSiteOn', 'Resume scanning this site');
                    siteToggle.title = t('popupSiteOnHint',
                        `Merid is off on ${host}. Click to turn it back on.`, [host]);
                } else {
                    siteToggle.textContent = t('popupSiteOff', 'Stop scanning this site');
                    siteToggle.title = t('popupSiteOffHint',
                        `Stops replacing words on ${host}. Other sites keep working.`, [host]);
                }
                siteToggle.classList.toggle('off', off);
                siteToggle.classList.toggle('muted', state === 'default-off');
            };
            chrome.storage.sync.get(['disabledSites', 'allowedSites'], (s) => {
                disabledSites = Array.isArray(s.disabledSites) ? s.disabledSites : [];
                allowedSites = Array.isArray(s.allowedSites) ? s.allowedSites : [];
                renderSiteToggle();
            });

            siteToggle.addEventListener('click', () => {
                const on = C.siteToggleState(host, disabledSites, allowedSites) === 'on';
                if (on) {
                    // Turning off: drop any allow entry, and only add a pause
                    // entry where the site would otherwise run by default.
                    allowedSites = C.removeSiteFromList(allowedSites, host);
                    if (!defaultOff) disabledSites = C.addSiteToList(disabledSites, host);
                } else {
                    disabledSites = C.removeSiteFromList(disabledSites, host);
                    if (defaultOff) allowedSites = C.addSiteToList(allowedSites, host);
                }
                // Open tabs revert/re-scan on their own via storage.onChanged.
                chrome.storage.sync.set({ disabledSites, allowedSites }, renderSiteToggle);
            });
        }
    });

    // AI Context Check has no control in the popup: it is on by default, it is
    // what decides whether a word appears at all, and a reader with a reason to
    // switch it off can still do that from the Settings page.
    //
    // What is left here is onboarding. Until the user has saved their own Gemini
    // API key, the modal that teaches how to create and paste one auto-opens at
    // most once per day - never on the user's first day with the popup, and
    // never again once they pick "Don't show again".
    const aiModal = document.getElementById('ai-key-modal');
    const openOptions = () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    };
    // Merid serves the AI check from its own keys, so a reader needs no key at
    // all. The onboarding modal only makes sense when that hosted path is
    // switched off (aiProxyUrl empty) - otherwise it would nag every user, daily,
    // to do something that is already done for them.
    const hostedAi = !!(window.VMFirebaseConfig && window.VMFirebaseConfig.aiProxyUrl);
    if (!hostedAi) {
        chrome.storage.local.get(['geminiApiKey', 'vm_ai_modal_day', 'vm_ai_modal_optout', 'vm_first_day'], (l) => {
            const today = new Date().toDateString();
            if (!l.vm_first_day) chrome.storage.local.set({ vm_first_day: today });
            const isFirstDay = !l.vm_first_day || l.vm_first_day === today;
            if (!l.geminiApiKey && !l.vm_ai_modal_optout && !isFirstDay && l.vm_ai_modal_day !== today) {
                aiModal.hidden = false;
                chrome.storage.local.set({ vm_ai_modal_day: today });
            }
        });
    }
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
    //
    // Each state says its piece exactly once. Signed out: the button at the top
    // of the popup, which is the offer and the way to take it. Signed in: the
    // line above Settings naming the account, which is the one thing the button
    // can no longer tell you. A signed-out reader used to get both the button
    // and a red warning at the bottom - the same news twice, the second time as
    // a telling-off for a choice they are allowed to make. Merid works fully
    // without an account; the deck simply stays on this device.
    const openLoginPage = () => chrome.tabs.create({ url: window.VMFirebaseConfig.webLoginUrl });
    const accountSection = document.getElementById('account-section');
    document.getElementById('signin-btn').addEventListener('click', openLoginPage);

    const syncHint = document.getElementById('sync-hint');
    chrome.runtime.sendMessage({ type: 'MERID_SYNC_STATUS' }, (status) => {
        if (chrome.runtime.lastError || !status || status.state === 'disabled') return;
        if (status.state === 'signed-out') {
            accountSection.hidden = false;
        } else {
            const email = status.email || t('popupYourAccount', 'your account');
            syncHint.hidden = false;
            syncHint.textContent = t('popupSyncingAs', 'Syncing to your deck as ' + email, [email]);
        }
    });

    // Puts the tutorial poster up over the page the reader is already on.
    //
    // It cannot be shown here: this panel is a few hundred pixels wide and
    // closes the moment focus leaves it, so the poster goes to the content
    // script instead and this window gets out of the way.
    //
    // Not every tab can take it. A new tab, a chrome:// page, the Web Store and
    // the built-in PDF viewer run no content script, and there the poster opens
    // as a tab of its own rather than the button doing nothing. Both paths show
    // the same sheet - see tutorial.js.
    document.getElementById('tutorial-btn').addEventListener('click', () => {
        const openInTab = () => chrome.tabs.create({ url: chrome.runtime.getURL('tutorial.html') });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab) { openInTab(); window.close(); return; }
            // Whether a content script is there is not something to infer from
            // the URL - `tabs.url` is only ours to read by the activeTab grant,
            // and guessing from it would put the poster in a tab on pages that
            // could have hosted it perfectly well. Ask, and let the answer
            // decide: no listener means no reply, which arrives as lastError.
            chrome.tabs.sendMessage(tab.id, { action: 'showTutorial' }, (res) => {
                if (chrome.runtime.lastError || !res || !res.ok) openInTab();
                window.close();
            });
        });
    });

    document.getElementById('options-btn').addEventListener('click', openOptions);

    // ---- helpers ----
    function setSegActive(seg, val) {
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.val === val));
    }

    /** The level a stop belongs to, guarding against a value from anywhere else. */
    function levelAt(stop) {
        return C.INTENSITY_LEVELS[Number(stop)] || 'focused';
    }

    /** Which stop a stored frequency sits on. Anything in between - a setting
     *  written by an older version, or by hand - snaps to the level it already
     *  resolves to everywhere else. */
    function sliderValue(frequency) {
        const index = C.INTENSITY_LEVELS.indexOf(C.normalizeIntensity(frequency));
        return index < 0 ? 1 : index;
    }

    /**
     * Say what the stop under the thumb buys.
     *
     * Zero is its own answer: it means "replace nothing". The slider cannot
     * reach it - there are three stops and none of them is off - but installs
     * from before the three-level change have it stored, and postWordCap still
     * honours it, so it has to be describable. It reads as the far-left stop
     * with no level lit until the reader moves the thumb, which is the first
     * moment a real level is chosen.
     *
     * @param {number} frequency 0..100
     */
    function updateSliderLabels(frequency) {
        const off = Number(frequency) === 0;
        const level = C.normalizeIntensity(frequency);
        // At zero no level is lit: Merid is replacing nothing, and leaving
        // "Casual" highlighted would name a level it is not doing.
        const index = off ? -1 : C.INTENSITY_LEVELS.indexOf(level);
        const labels = document.querySelectorAll('.slider-labels span');
        labels.forEach((span, i) => span.classList.toggle('active', i === index));
        // The thumb reports a stop number; a screen reader needs the name.
        frequencySlider.setAttribute('aria-valuetext',
            (labels[index < 0 ? 0 : index] || {}).textContent || level);
        const hint = document.getElementById('intensity-hint');
        if (!hint) return;
        hint.textContent = off
            ? t('popupIntensityOff', 'Currently replacing nothing. Move the slider to switch it back on.')
            : t('popupIntensityHint_' + level, INTENSITY_HINTS[level]);
    }

    /** Paint the card-theme button for a palette, without writing it. */
    function renderCardTheme(theme) {
        const dark = theme === 'dark';
        cardThemeBtn.setAttribute('aria-pressed', String(dark));
        const label = dark
            ? t('popupCardThemeDark', 'Learning card: dark. Click for light.')
            : t('popupCardThemeLight', 'Learning card: light. Click for dark.');
        cardThemeBtn.setAttribute('aria-label', label);
        cardThemeBtn.title = label;
    }

    // Today's AI allowance, if and only if it has run out.
    (function renderQuotaHint() {
        const el = document.getElementById('quota-hint');
        if (!el) return;
        chrome.storage.local.get(['vm_ai_quota'], (r) => {
            const q = r.vm_ai_quota;
            if (!q || !q.exhausted) return;
            // A stale "exhausted" from a previous day must not linger.
            if (q.resetAt && Date.now() > q.resetAt) return;
            el.textContent = q.anonymous
                ? t('popupQuotaAnon', 'AI checks used up for today. Sign in for more.')
                : t('popupQuotaOut', 'AI checks used up for today. Resets at midnight UTC.');
            el.hidden = false;
        });
    })();

    function updateExtensionToggleButton(enabled) {
        extensionToggle.textContent = enabled
            ? t('popupExtensionOn', 'Extension is ON')
            : t('popupExtensionOff', 'Extension is OFF');
        extensionToggle.classList.toggle('active', enabled);
    }
});
