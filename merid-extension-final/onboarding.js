// =============================================================
// Merid - the first-run wizard
//
// Four questions asked once, on the day Merid is installed: hello, which
// vocabulary, how should the words appear, done. Before this a new reader met
// Merid already running on whatever defaults we picked for them - C1 words,
// highlighted - without ever being told those were choices.
//
// It comes up over whatever the reader is already looking at, the way the
// tutorial poster does, rather than taking them to a page of its own. Three
// things put it there:
//
//   - The first ordinary page loaded after installing. background.js cannot
//     show it at the moment of installing: the tab in front of the reader then
//     is the Web Store or a new tab, and neither runs a content script. So it
//     leaves `onboardingPending` in storage and autoStart() below picks it up
//     on the next real page.
//   - The popup's "Hướng dẫn nhanh", which sends `showOnboarding` to the
//     content script. The popup cannot host this itself: it is a few hundred
//     pixels wide and closes the moment focus leaves it.
//   - onboarding.html, kept only for where neither of those can reach - a
//     chrome:// page or the Web Store, where the popup button would otherwise
//     do nothing at all. `open({ standalone: true })` is that mode.
//
// It is modal in earnest. The backdrop swallows clicks meant for the page, Tab
// cannot walk out of the sheet, and neither clicking away nor Escape abandons
// it: the only ways out are the buttons, and both of them save. A setup screen
// that can be dismissed by a stray click is a setup screen that silently leaves
// people on defaults they were never shown.
//
// Everything lives in an open shadow root, like status-badge.js and
// tutorial.js: this sits on pages whose CSS we do not control, and neither
// side may reach into the other.
//
// On paper, not on the navy the popup and Settings wear. The three mode
// pictures are screenshots of an article, and an article is white: on a dark
// panel each one needed its own pale plate to sit on, and the step became three
// bright rectangles floating on navy. A light sheet puts them on the ground the
// reader already associates with reading, and the gold has something to carry
// against.
//
// Vietnamese only, deliberately. The rest of the extension's own UI goes
// through lib/i18n.js and _locales/, but the people meeting this screen are
// Vietnamese readers learning English - it is the one surface where the
// audience is not in question. Every string is in the VI table below, so
// moving to _locales/ later is a change to `t()` and nothing else.
// =============================================================

(function (global) {
    'use strict';

    const HOST_ID = 'merid-onboarding-host';

    // Above tutorial.js's 2147483600: if a reader somehow has both up, the
    // wizard is the one asking a question and belongs in front.
    const Z_INDEX = 2147483601;

    // Pictures for step 3, one per mode. Missing or slow ones are not a
    // problem - drawMode() below renders the mode in HTML instead, so the step
    // is never blank and never waits.
    const MODE_IMAGE = {
        replace: 'onboarding/mode-replace.webp',
        highlight: 'onboarding/mode-highlight.webp',
        beside: 'onboarding/mode-beside.webp'
    };

    // Order asked for in the brief. The labels come from VMCore's registry
    // rather than being spelled out here, so a future dataset-B2.csv shows up
    // as a card the moment it is registered - the same reason popup.js reads
    // them from there.
    const LEVEL_ORDER = ['sat', 'c1', 'c2', 'all'];
    const MODE_ORDER = ['replace', 'highlight', 'beside'];

    const STEP_COUNT = 4;

    // Short on purpose. Nobody reads a setup screen; they look at it, decide,
    // and press the button. Anything here that is not the question or the
    // answer is in the way of that.
    const VI = {
        skip: 'Bỏ qua',
        back: 'Quay lại',
        next: 'Tiếp tục',

        welcomeTitle: 'Chào mừng đến với Merid',
        welcomeLead: 'Vừa lướt web vừa học tiếng Anh.',
        welcomeStart: 'Bắt đầu',

        levelTitle: 'Chọn độ khó',
        levelDesc: {
            sat: 'Luyện thi SAT',
            c1: 'Nâng cao',
            c2: 'Thành thạo',
            all: 'Cả ba bộ'
        },

        modeTitle: 'Cách hiển thị',
        modeName: {
            replace: 'Replace',
            highlight: 'Highlight',
            beside: 'Beside'
        },
        modeDesc: {
            replace: 'Thay thế',
            highlight: 'Tô đậm',
            beside: 'Kế bên'
        },
        // Shown under the row, for whichever card is selected. The two-word
        // label on the card names the mode; this says what it does.
        modeAbout: {
            replace: 'Thay trực tiếp từ tiếng Việt bằng từ tiếng Anh tương đương.',
            highlight: 'Giữ nguyên tiếng Việt, chỉ tô đậm những từ đáng học.',
            beside: 'Giữ từ gốc và đặt từ tiếng Anh ngay bên cạnh.'
        },
        modeBadge: 'Bài viết tốt',

        doneTitle: 'Finish & enjoy!',
        doneLead: 'Mở một trang tiếng Việt bất kỳ là Merid chạy ngay.',
        doneCta: 'Bắt đầu đọc',
        saving: 'Đang lưu…'
    };

    // The sentence shown on step one, and drawn in a mode card when its picture
    // is missing. One sentence throughout, because the difference between the
    // modes is only visible when nothing else differs.
    const SAMPLE = {
        before: 'Nam ca sĩ đã ',
        vi: 'hợp tác',
        en: 'collaborate',
        after: ' với nhạc sĩ để phát hành bài hát mới.'
    };

    let host = null;
    let root = null;
    let standalone = false;
    let step = 0;
    let saving = false;

    // What the reader has picked. Seeded from the extension's defaults, then
    // corrected from storage by open() - because on a first run those defaults
    // ARE the answer, but when the wizard is reopened later from the popup the
    // answer is whatever the reader has since chosen, and "Bỏ qua" must not
    // quietly hand them back the defaults they had moved away from.
    const defaults = (global.VMCore && global.VMCore.DEFAULT_SETTINGS) || {};
    const picked = {
        datasetKey: defaults.datasetKey || 'c1',
        replacementMode: defaults.replacementMode || 'highlight'
    };

    /** Label for a dataset key, from the registry that owns them. */
    function levelLabel(key) {
        const reg = (global.VMCore && global.VMCore.DATASET_REGISTRY) || {};
        return (reg[key] && reg[key].label) || key.toUpperCase();
    }

    /** The dataset keys to offer: the order asked for, minus any not registered. */
    function levelKeys() {
        const reg = global.VMCore && global.VMCore.DATASET_REGISTRY;
        if (!reg) return LEVEL_ORDER;
        const known = LEVEL_ORDER.filter(k => reg[k]);
        // Anything registered later (dataset-B2.csv and friends) lands after
        // the four we were asked for, rather than being silently dropped.
        for (const k of Object.keys(reg)) if (!known.includes(k)) known.push(k);
        return known;
    }

    const STYLE = `
        :host { all: initial; }

        /* .btn and .skip start with \`all: unset\`, which discards the user-agent
           rule behind the hidden attribute. Without this, hiding an element
           does nothing to it. */
        [hidden] { display: none !important; }

        /* Inter throughout, Outfit only on the handful of labels that are ASCII
           by nature (the brand, SAT/C1/C2/All, Replace/Highlight/Beside).
           Outfit has no Vietnamese: Google ships it as latin and latin-ext, and
           Vietnamese lives in U+1EA0-1EF1, which neither covers. Setting a
           Vietnamese heading in it left every "ạ ệ ơ đ ữ" to the system
           fallback, so words changed shape halfway through.

           @font-face cannot be registered from inside a shadow root, only by a
           document. onboarding.html does it, which is where the fonts are
           needed; over a page there is no such declaration and the whole stack
           falls through to system-ui, which covers Vietnamese in one piece. */
        .backdrop {
            position: fixed;
            inset: 0;
            background: rgba(10, 18, 30, 0.55);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
            z-index: ${Z_INDEX};
            font-family: 'Inter', system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            opacity: 0;
            transition: opacity 180ms ease;
        }
        .backdrop.show { opacity: 1; }
        .backdrop.standalone {
            position: absolute;
            background: #ece7dc;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
        }

        .sheet {
            position: relative;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            width: min(94vw, 720px);
            max-height: min(92vh, 660px);
            background: #fbfaf7;
            border-radius: 22px;
            box-shadow: 0 24px 70px rgba(12, 20, 33, 0.3), 0 2px 6px rgba(12, 20, 33, 0.1);
            overflow: hidden;
            transform: translateY(10px) scale(0.99);
            transition: transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .backdrop.show .sheet { transform: none; }

        /* Progress as a hairline filling across the top. It replaced a row of
           dots, a "BƯỚC 2/4" kicker and a "Bước 2/4" caption in the footer,
           which between them said the same thing three times. */
        .rail {
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 3px;
            background: #eeeae0;
        }
        .rail span {
            display: block;
            height: 100%;
            width: 25%;
            background: #f4be37;
            transition: width 320ms cubic-bezier(0.2, 0.8, 0.3, 1);
        }

        /* ---------- head ---------- */
        .head {
            display: flex;
            align-items: center;
            padding: 22px 30px 0;
            flex: 0 0 auto;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: #16202e;
        }
        /* The mark is drawn for a navy panel, so it keeps one of its own here. */
        .brand img { width: 22px; height: 22px; border-radius: 6px; display: block; background: #0a192f; }

        .skip {
            all: unset;
            margin-left: auto;
            padding: 6px 10px;
            border-radius: 8px;
            color: #9aa1a9;
            font-size: 12.5px;
            cursor: pointer;
            transition: color 140ms ease, background 140ms ease;
        }
        .skip:hover { color: #16202e; background: rgba(20, 32, 46, 0.05); }
        .skip:focus-visible { outline: 2px solid #16202e; outline-offset: 2px; }

        /* ---------- body ---------- */
        /* One step at a time, and they differ in height. The floor stops the
           sheet resizing under the reader on every Next; centring is what keeps
           the leftover room on the shorter ones from reading as a gap. */
        .body {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow-y: auto;
            padding: 10px 30px 0;
            min-height: 316px;
        }
        .step { display: none; }
        .step.here { display: block; animation: rise 280ms cubic-bezier(0.2, 0.8, 0.3, 1); }
        @keyframes rise {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: none; }
        }

        h2 {
            margin: 0 0 7px;
            font-size: 25px;
            font-weight: 600;
            line-height: 1.25;
            color: #14202e;
            letter-spacing: -0.021em;
        }
        .lead { margin: 0 0 22px; font-size: 14px; line-height: 1.55; color: #6b737d; }
        h2.only { margin-bottom: 20px; }

        /* ---------- step 1 ---------- */
        .mark { display: block; width: 46px; height: 46px; margin-bottom: 18px; border-radius: 13px; background: #0a192f; }

        /* One line of the thing itself, instead of a list of promises about it. */
        .taste {
            margin: 0;
            padding: 16px 18px;
            background: #ffffff;
            border: 1px solid #ebe7dd;
            border-radius: 13px;
            font-size: 14px;
            line-height: 1.7;
            color: #2b3440;
        }

        /* ---------- the two grids ---------- */
        .levels { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 620px) {
            .levels { grid-template-columns: repeat(2, 1fr); }
            .modes { grid-template-columns: 1fr; }
        }

        .pick {
            all: unset;
            box-sizing: border-box;
            display: block;
            position: relative;
            background: #ffffff;
            border: 1.5px solid #e9e5db;
            border-radius: 14px;
            cursor: pointer;
            transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
        }
        .pick:hover {
            border-color: #f4be37;
            transform: translateY(-2px);
            box-shadow: 0 8px 22px rgba(20, 32, 46, 0.09);
        }
        .pick:focus-visible { outline: 2px solid #16202e; outline-offset: 3px; }
        .pick.on {
            border-color: #f4be37;
            box-shadow: 0 0 0 1.5px #f4be37, 0 8px 22px rgba(244, 190, 55, 0.22);
        }

        .tick {
            position: absolute;
            top: 10px;
            right: 10px;
            display: grid;
            place-items: center;
            width: 19px;
            height: 19px;
            border-radius: 99px;
            background: #f4be37;
            color: #16202e;
            font-size: 11px;
            font-weight: 800;
            opacity: 0;
            transform: scale(0.6);
            transition: opacity 150ms ease, transform 150ms ease;
            z-index: 2;
        }
        .pick.on .tick { opacity: 1; transform: none; }

        /* ---------- step 2 ---------- */
        /* The card innards are spans, because a <button> may not hold block-level
           elements. Left inline the name and the hint run together on one line
           and spill past the card's edge, so each is told to be a block. */
        .level { display: block; padding: 21px 12px 18px; text-align: center; }
        .level .name {
            display: block;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 19px;
            font-weight: 700;
            color: #14202e;
            letter-spacing: -0.01em;
        }
        .level .desc { display: block; margin-top: 3px; font-size: 12px; color: #949ba4; }

        /* ---------- step 3 ---------- */
        .mode { display: block; padding: 10px 10px 12px; }
        .plate {
            display: flex;
            border-radius: 9px;
            background: #ffffff;
            border: 1px solid #eeeae0;
            overflow: hidden;
            aspect-ratio: 1.85;
        }
        .plate img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* The drawn stand-in, used when a picture is missing. */
        .demo { display: flex; flex-direction: column; padding: 9px 10px; text-align: left; }
        .demo-badge {
            align-self: flex-start;
            padding: 3px 7px;
            margin-bottom: 6px;
            border-radius: 5px;
            background: #1f9d55;
            color: #ffffff;
            font-size: 8.5px;
            font-weight: 700;
        }
        .demo-text { margin: 0; font-size: 10px; line-height: 1.6; color: #2c3444; overflow: hidden; }
        /* The same marking content.css puts on a word in a real page. */
        .w { border-bottom: 2px solid #f4be37; background-color: rgba(244, 190, 55, 0.16); padding: 0 1px; }
        .w.en { color: #0a3d91; font-weight: 600; }

        .mode .name {
            display: block;
            margin-top: 11px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 15px;
            font-weight: 600;
            color: #14202e;
        }
        .mode .desc { display: block; margin-top: 1px; font-size: 12.5px; color: #949ba4; }

        /* What the selected mode actually does. It sits under the row rather
           than inside a card because it is a sentence, and a sentence in a card
           this size wraps to four lines and pushes the picture out of shape. */
        .about {
            display: flex;
            align-items: center;
            gap: 9px;
            margin: 14px 0 0;
            padding: 12px 15px;
            background: #ffffff;
            border: 1px solid #ebe7dd;
            border-radius: 11px;
            font-size: 13px;
            line-height: 1.5;
            color: #5b6572;
        }
        .about::before {
            content: '';
            flex: 0 0 auto;
            width: 6px;
            height: 6px;
            border-radius: 99px;
            background: #f4be37;
        }

        /* ---------- step 4 ---------- */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 9px 15px;
            background: #ffffff;
            border: 1px solid #e9e5db;
            border-radius: 99px;
            font-size: 12.5px;
            color: #949ba4;
        }
        .chip b { font-family: 'Outfit', system-ui, sans-serif; font-weight: 600; color: #14202e; }

        /* ---------- foot ---------- */
        .foot {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            padding: 24px 30px 26px;
            flex: 0 0 auto;
        }
        .btn {
            all: unset;
            box-sizing: border-box;
            padding: 11px 22px;
            border-radius: 11px;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
            transition: background 150ms ease, color 150ms ease, opacity 150ms ease;
        }
        .btn:focus-visible { outline: 2px solid #16202e; outline-offset: 2px; }
        .btn.ghost { color: #6b737d; }
        .btn.ghost:hover { color: #14202e; background: rgba(20, 32, 46, 0.05); }
        .btn.solid { background: #14202e; color: #fbfaf7; }
        .btn.solid:hover { background: #24374d; }
        .btn.solid[disabled] { opacity: 0.55; cursor: default; background: #14202e; }

        @media (prefers-reduced-motion: reduce) {
            .backdrop, .sheet, .pick, .tick, .rail span { transition: none; }
            .step.here { animation: none; }
        }
    `;

    // ---------------------------------------------------------------
    // small builders
    // ---------------------------------------------------------------

    function el(tag, className, text) {
        const n = document.createElement(tag);
        if (className) n.className = className;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function iconUrl(file) {
        try { return chrome.runtime.getURL(file); } catch (e) { return ''; }
    }

    /**
     * The sample sentence, marked up for one mode, appended into `into`.
     *
     * Mirrors what content.js:1048-1049 actually does: 'highlight' keeps the
     * Vietnamese, 'beside' appends the English in brackets, and anything else
     * swaps the word outright.
     */
    function sentence(mode, into) {
        into.appendChild(document.createTextNode(SAMPLE.before));
        if (mode === 'highlight') {
            into.appendChild(el('span', 'w', SAMPLE.vi));
        } else if (mode === 'beside') {
            into.appendChild(el('span', 'w', SAMPLE.vi));
            into.appendChild(document.createTextNode(' '));
            into.appendChild(el('span', 'w en', '(' + SAMPLE.en + ')'));
        } else {
            into.appendChild(el('span', 'w en', SAMPLE.en));
        }
        into.appendChild(document.createTextNode(SAMPLE.after));
        return into;
    }

    /** A mode card's stand-in, for when its picture is missing. */
    function drawMode(mode) {
        const demo = el('div', 'demo');
        demo.appendChild(el('span', 'demo-badge', VI.modeBadge));
        demo.appendChild(sentence(mode, el('p', 'demo-text')));
        return demo;
    }

    /**
     * One selectable card, in either grid.
     *
     * `radio` rather than `button`: the four levels are one choice between
     * four, and a screen reader should hear it that way.
     */
    function card(value, onPick) {
        const b = el('button', 'pick');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.value = value;
        b.appendChild(el('span', 'tick', '✓'));
        b.addEventListener('click', () => onPick(value));
        return b;
    }

    function grid(className, label) {
        const g = el('div', className);
        g.setAttribute('role', 'radiogroup');
        g.setAttribute('aria-label', label);
        return g;
    }

    // ---------------------------------------------------------------
    // the four steps
    // ---------------------------------------------------------------

    function stepWelcome() {
        const s = el('section', 'step');
        const logo = el('img', 'mark');
        logo.src = iconUrl('logo-mark.png');
        logo.alt = '';
        s.append(
            logo,
            el('h2', null, VI.welcomeTitle),
            el('p', 'lead', VI.welcomeLead),
            sentence('beside', el('p', 'taste'))
        );
        return s;
    }

    function stepLevel() {
        const s = el('section', 'step');
        s.appendChild(el('h2', 'only', VI.levelTitle));

        const g = grid('levels', VI.levelTitle);
        levelKeys().forEach(key => {
            const b = card(key, k => { picked.datasetKey = k; paint(); });
            const box = el('span', 'level');
            box.append(
                el('span', 'name', levelLabel(key)),
                el('span', 'desc', VI.levelDesc[key] || '')
            );
            b.setAttribute('aria-label', levelLabel(key) + '. ' + (VI.levelDesc[key] || ''));
            b.appendChild(box);
            g.appendChild(b);
        });

        s.appendChild(g);
        return s;
    }

    function stepMode() {
        const s = el('section', 'step');
        s.appendChild(el('h2', 'only', VI.modeTitle));

        const g = grid('modes', VI.modeTitle);
        MODE_ORDER.forEach(mode => {
            const b = card(mode, m => { picked.replacementMode = m; paint(); });
            b.setAttribute('aria-label', VI.modeName[mode] + ', ' + VI.modeDesc[mode] + '. ' + VI.modeAbout[mode]);

            const box = el('span', 'mode');
            const plate = el('span', 'plate');

            // Draw the mode first, then let a picture take its place if one
            // loads. That way the card is right from the first frame, and a
            // missing file is simply the drawing staying put - no flash, no
            // broken-image icon, no waiting.
            plate.appendChild(drawMode(mode));

            const url = iconUrl(MODE_IMAGE[mode]);
            if (url) {
                const pic = new Image();
                pic.onload = () => { pic.alt = ''; plate.replaceChildren(pic); };
                pic.src = url;
            }

            box.append(
                plate,
                el('span', 'name', VI.modeName[mode]),
                el('span', 'desc', VI.modeDesc[mode])
            );
            b.appendChild(box);
            g.appendChild(b);
        });

        s.appendChild(g);
        // aria-hidden: the same sentence is already in each card's own label,
        // where a screen reader meets it on the way past. Live here as well and
        // it would be read twice for every arrow key.
        const about = el('p', 'about');
        about.setAttribute('aria-hidden', 'true');
        s.appendChild(about);
        return s;
    }

    function stepDone() {
        const s = el('section', 'step');
        s.append(el('h2', null, VI.doneTitle), el('p', 'lead', VI.doneLead));

        const chips = el('div', 'chips');
        const a = el('span', 'chip');
        a.appendChild(el('b', 'sum-level', ''));
        const b = el('span', 'chip');
        b.appendChild(el('b', 'sum-mode', ''));
        chips.append(a, b);

        s.appendChild(chips);
        return s;
    }

    // ---------------------------------------------------------------
    // state -> screen
    // ---------------------------------------------------------------

    /** Redraw everything that depends on `step` or `picked`. */
    function paint() {
        if (!root) return;

        root.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('here', i === step));

        const fill = root.querySelector('.rail span');
        if (fill) fill.style.width = ((step + 1) / STEP_COUNT * 100) + '%';

        root.querySelectorAll('.levels .pick').forEach(b => {
            const on = b.dataset.value === picked.datasetKey;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });
        root.querySelectorAll('.modes .pick').forEach(b => {
            const on = b.dataset.value === picked.replacementMode;
            b.classList.toggle('on', on);
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        });

        const about = root.querySelector('.about');
        if (about) about.textContent = VI.modeAbout[picked.replacementMode] || '';

        const level = root.querySelector('.sum-level');
        const mode = root.querySelector('.sum-mode');
        if (level) level.textContent = levelLabel(picked.datasetKey);
        if (mode) mode.textContent = VI.modeName[picked.replacementMode] || picked.replacementMode;

        const last = step === STEP_COUNT - 1;
        const back = root.querySelector('.btn-back');
        const next = root.querySelector('.btn-next');
        const skip = root.querySelector('.skip');

        back.hidden = step === 0;
        if (skip) skip.hidden = last;
        next.textContent = saving ? VI.saving
            : last ? VI.doneCta
                : step === 0 ? VI.welcomeStart
                    : VI.next;
        next.disabled = saving;
    }

    function go(to) {
        const next = Math.min(STEP_COUNT - 1, Math.max(0, to));
        if (next === step) return;
        step = next;
        paint();
        // Send focus somewhere inside the new step, or a reader on the
        // keyboard is left holding a button that just vanished.
        const panel = root.querySelectorAll('.step')[step];
        const target = panel && (panel.querySelector('.pick.on') || panel.querySelector('h2'));
        if (target) {
            if (!target.hasAttribute('tabindex') && target.tagName === 'H2') target.tabIndex = -1;
            try { target.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
        }
        const body = root.querySelector('.body');
        if (body) body.scrollTop = 0;
    }

    // ---------------------------------------------------------------
    // saving
    // ---------------------------------------------------------------

    /**
     * Write the two answers, then get out of the way.
     *
     * The keys are the extension's own - `datasetKey` and `replacementMode`
     * from VMCore.DEFAULT_SETTINGS - not names invented here, or the popup and
     * the Settings page would read past them and the wizard would have
     * configured nothing.
     *
     * They also travel by different roads, and it matters:
     *
     *   - `datasetKey` goes through the `setDataset` message. Writing it to
     *     storage on its own does NOT switch datasets - the service worker
     *     holds the parsed vocabulary in memory and rebuilds it only in
     *     loadVocabulary(), which that message is what calls (background.js:942).
     *     This is the same road popup.js takes.
     *   - `replacementMode` is a plain storage write. content.js:2264 counts it
     *     as cosmetic and redraws the words already on the page, so the mode
     *     takes effect without a reload.
     *
     * Closing waits for both to land. A wizard that vanished and then failed to
     * save would be worse than one that took a moment.
     */
    function finish() {
        if (saving) return;
        saving = true;
        paint();

        let left = 2;
        const done = () => { if (--left === 0) close(); };

        try {
            chrome.runtime.sendMessage(
                { action: 'setDataset', datasetKey: picked.datasetKey },
                () => { void chrome.runtime.lastError; done(); }
            );
        } catch (e) { done(); }

        try {
            chrome.storage.sync.set(
                {
                    replacementMode: picked.replacementMode,
                    onboardingDone: true,
                    // Clear the flag background.js set on install, so nothing
                    // puts the wizard up again on the next page.
                    onboardingPending: false
                },
                () => { void chrome.runtime.lastError; done(); }
            );
        } catch (e) { done(); }
    }

    // ---------------------------------------------------------------
    // open / close
    // ---------------------------------------------------------------

    function onKeyDown(e) {
        if (!host) return;
        // Escape is the keyboard's "Bỏ qua", not a trapdoor: it saves what is on
        // screen and closes, exactly as the button does. Left as a bare close it
        // would be the one way to get out of a modal setup screen without ever
        // answering it, which is the hole this wizard exists to plug.
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); return; }
        if (e.key === 'Tab') { trapTab(e); return; }
        if (saving) return;
        if (e.key === 'ArrowRight') go(step + 1);
        else if (e.key === 'ArrowLeft') go(step - 1);
    }

    /**
     * Keep Tab inside the sheet.
     *
     * Without this the backdrop stops the mouse reaching the page but the
     * keyboard walks straight past it into whatever is behind, which for a modal
     * is the same hole with a different input device.
     */
    function trapTab(e) {
        if (!root) return;
        const inSheet = [...root.querySelectorAll('button, [tabindex]')]
            .filter(n => !n.hidden && n.tabIndex !== -1 && n.offsetParent !== null);
        if (!inSheet.length) return;
        const first = inSheet[0];
        const last = inSheet[inSheet.length - 1];
        // Inside a shadow root the focused node reads as the host from outside,
        // so ask the root itself who has focus.
        const here = root.activeElement;
        if (e.shiftKey && (here === first || !inSheet.includes(here))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && here === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function close() {
        if (standalone) {
            // A tab of its own has nothing behind it, so closing means closing
            // the tab. Browsers refuse that for tabs the user opened, and then
            // the wizard simply stays - which is the right outcome for a page
            // whose whole content it is.
            try { window.close(); } catch (e) { /* not ours to close */ }
            return;
        }
        if (!host) return;
        document.removeEventListener('keydown', onKeyDown, true);
        const node = host;
        host = null;
        root = null;
        saving = false;
        const backdrop = node.shadowRoot && node.shadowRoot.querySelector('.backdrop');
        if (backdrop) backdrop.classList.remove('show');
        setTimeout(() => node.remove(), 200);
    }

    function build() {
        const backdrop = el('div', 'backdrop' + (standalone ? ' standalone' : ''));

        const sheet = el('div', 'sheet');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-label', VI.welcomeTitle);

        const rail = el('div', 'rail');
        rail.appendChild(el('span'));

        // --- head ---
        const head = el('div', 'head');
        const brand = el('div', 'brand');
        const logo = el('img');
        logo.src = iconUrl('logo-mark.png');
        logo.alt = '';
        brand.append(logo, el('span', null, 'Merid'));

        const skip = el('button', 'skip', VI.skip);
        skip.type = 'button';
        // Skipping is still a decision, so it saves what is on screen - the
        // defaults, untouched, if the reader never picked anything. Leaving
        // without writing would drop them back to being configured by us.
        skip.addEventListener('click', finish);

        head.append(brand, skip);

        // --- body ---
        const body = el('div', 'body');
        body.append(stepWelcome(), stepLevel(), stepMode(), stepDone());

        // --- foot ---
        const foot = el('div', 'foot');

        const back = el('button', 'btn ghost btn-back', VI.back);
        back.type = 'button';
        back.addEventListener('click', () => go(step - 1));

        const next = el('button', 'btn solid btn-next', VI.next);
        next.type = 'button';
        next.addEventListener('click', () => {
            if (step === STEP_COUNT - 1) finish();
            else go(step + 1);
        });

        foot.append(back, next);

        sheet.append(rail, head, body, foot);
        backdrop.appendChild(sheet);

        // Nothing is bound to the backdrop. It exists to cover the page - which
        // it does by being fixed and full-viewport, so clicks aimed at whatever
        // is behind land here and stop - and clicking it is not an answer to
        // anything the sheet is asking. The way out is "Bỏ qua".
        return backdrop;
    }

    /**
     * Put the wizard up. Safe to call twice - a second call brings the one
     * already open back to its first step rather than stacking another.
     *
     * No "have they seen it already?" check here on purpose. Both ways in are
     * something the reader did: install, or the button in the popup. A guard
     * would only ever fire on the second of those, where it would look like
     * the button was broken.
     */
    function open(opts) {
        standalone = !!(opts && opts.standalone);
        if (host) { go(0); return true; }

        host = document.createElement('div');
        host.id = HOST_ID;
        // !important, because this div lives in the page's DOM and a page rule
        // carrying !important beats a plain inline style. It only takes one
        // `div { transform: ... !important }` for the host to become the
        // containing block for everything fixed inside it - at which point the
        // backdrop stops covering the viewport, and clicks meant for it land on
        // the page instead. Inline !important is the one thing a page cannot
        // out-rank, which is what makes the modal actually modal.
        host.style.cssText = 'all:initial!important;position:static!important;';
        (document.body || document.documentElement).appendChild(host);
        root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = STYLE;
        root.appendChild(style);
        root.appendChild(build());

        step = 0;
        saving = false;
        paint();

        // Correct the answers from what is actually stored. Asynchronous, and
        // that is fine: step one shows neither of them, so it has settled long
        // before the reader can reach a screen that does.
        try {
            chrome.storage.sync.get(['datasetKey', 'replacementMode'], (stored) => {
                void chrome.runtime.lastError;
                if (!stored || !root) return;
                if (stored.datasetKey) picked.datasetKey = stored.datasetKey;
                if (stored.replacementMode) picked.replacementMode = stored.replacementMode;
                paint();
            });
        } catch (e) { /* the defaults already on screen are a fair answer */ }

        document.addEventListener('keydown', onKeyDown, true);
        requestAnimationFrame(() => {
            const backdrop = root && root.querySelector('.backdrop');
            if (backdrop) backdrop.classList.add('show');
        });
        return true;
    }

    global.MeridOnboarding = { open, close };

    /**
     * Come up on the first ordinary page after installing.
     *
     * background.js leaves `onboardingPending` behind rather than showing this
     * itself, because at the moment of installing the tab in front of the reader
     * is the Web Store or a new tab and no content script runs on either. Here
     * is the first place that can honour it.
     *
     * The flag is cleared as the wizard opens, not when it is answered. Left set
     * until answered it would come up again in every tab the reader opened, and
     * a modal that reappears until obeyed is a worse thing than a reader who
     * closed the tab and kept the defaults. "Hướng dẫn nhanh" in the popup is
     * always there for them.
     */
    function autoStart() {
        if (window.top !== window) return;                 // top frame only
        const p = location.protocol;
        if (p !== 'http:' && p !== 'https:') return;
        // Not over a bank, a webmail, a DM thread. The same list content.js
        // refuses to read; a full-screen panel there is worse than a swapped word.
        try {
            if (global.VMCore && global.VMCore.isUrlBlocked(location.href)) return;
        } catch (e) { /* if in doubt, carry on */ }
        // Not on top of the tutorial poster. This one sits a layer above it, so
        // arriving uninvited over a sheet the reader deliberately opened would
        // bury it - and the wizard has the popup and the next page to come back on.
        if (document.getElementById('merid-tutorial-host')) return;

        try {
            chrome.storage.sync.get(['onboardingPending', 'onboardingDone'], (s) => {
                void chrome.runtime.lastError;
                if (!s || !s.onboardingPending || s.onboardingDone) return;
                chrome.storage.sync.set({ onboardingPending: false }, () => {
                    void chrome.runtime.lastError;
                    open();
                });
            });
        } catch (e) { /* no storage, no wizard - the popup still has it */ }
    }

    // Standing itself up on onboarding.html.
    //
    // Chrome runs no content script on a chrome-extension: page, so this file
    // finding itself on one means onboarding.html loaded it directly - the
    // fallback for a tab that cannot host an overlay at all. Everywhere else
    // this is a content script, and it either has an install to honour or stays
    // dormant until the popup asks.
    //
    // It is here rather than in an inline <script> in the page because
    // extension pages run under script-src 'self', which refuses one.
    const start = () => {
        if (location.protocol === 'chrome-extension:') {
            document.title = VI.welcomeTitle + ' - Merid';
            open({ standalone: true });
        } else {
            autoStart();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})(window);
