// =============================================================
// Merid - the first-run wizard
//
// Four questions asked once, on the day Merid is installed: hello, which
// vocabulary, how should the words appear, done. Before this the answers were
// there to be found in the popup, which meant a new reader met Merid already
// running on whatever defaults we picked for them - C1 words, highlighted -
// without ever being told those were choices.
//
// Two ways in, one implementation, the same arrangement tutorial.js uses:
//
//   - Over the page. The popup's "Hướng dẫn nhanh" sends `showOnboarding` to
//     the content script, which calls open() here. The popup cannot host this
//     itself: it is a few hundred pixels wide and closes the moment focus
//     leaves it.
//   - As a page of its own. background.js opens onboarding.html on install,
//     because the tab sitting there at that moment is the Web Store or a new
//     tab, and neither runs a content script. `open({ standalone: true })` is
//     that mode - no backdrop to click off, and closing means closing the tab.
//
// Everything lives in an open shadow root, like status-badge.js and
// tutorial.js: this sits on pages whose CSS we do not control, and neither
// side may reach into the other.
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
        replace: 'onboarding/mode-replace.png',
        highlight: 'onboarding/mode-highlight.png',
        beside: 'onboarding/mode-beside.png'
    };

    // Order asked for in the brief. The labels come from VMCore's registry
    // rather than being spelled out here, so a future dataset-B2.csv shows up
    // as a card the moment it is registered - the same reason popup.js reads
    // them from there.
    const LEVEL_ORDER = ['sat', 'c1', 'c2', 'all'];
    const MODE_ORDER = ['replace', 'highlight', 'beside'];

    const STEP_COUNT = 4;

    const VI = {
        skip: 'Bỏ qua',
        back: 'Quay lại',
        next: 'Tiếp tục',
        stepOf: (n, total) => `Bước ${n}/${total}`,

        // 1 - welcome
        welcomeTitle: 'Chào mừng đến với Merid',
        welcomeLead: 'Merid dạy bạn từ vựng tiếng Anh ngay trong lúc bạn đọc báo, đọc truyện, lướt mạng — không cần học riêng một buổi nào.',
        welcomeP1: 'Thay vài từ tiếng Việt trên trang bằng từ tiếng Anh tương đương',
        welcomeP2: 'Rê chuột vào từ để xem nghĩa, phiên âm và cách phát âm',
        welcomeP3: 'Mọi thứ chạy ngay trên máy bạn — không gửi trang bạn đọc đi đâu cả',
        welcomeStart: 'Bắt đầu',

        // 2 - dataset
        levelTitle: 'Chọn bộ từ vựng',
        levelLead: 'Merid sẽ chỉ lấy từ trong bộ bạn chọn. Đổi lại bất cứ lúc nào trong bảng điều khiển.',
        levelDesc: {
            sat: 'Từ vựng luyện thi SAT',
            c1: 'Trình độ nâng cao (CEFR C1)',
            c2: 'Trình độ thành thạo (CEFR C2)',
            all: 'Gộp cả ba bộ ở trên'
        },

        // 3 - display mode
        modeTitle: 'Cách hiển thị',
        modeLead: 'Chọn cách từ tiếng Anh xuất hiện trong bài viết.',
        modeName: {
            replace: 'Replace (thay thế)',
            highlight: 'Highlight (tô đậm)',
            beside: 'Beside (kế bên)'
        },
        modeDesc: {
            replace: 'Thay trực tiếp từ tiếng Việt',
            highlight: 'Tô đậm từ tiếng Việt',
            beside: 'Để từ tiếng Anh kế bên'
        },
        modeBadge: 'Bài viết tốt',

        // 4 - done
        doneTitle: 'Finish & enjoy!',
        doneLead: 'Xong rồi. Mở một trang báo tiếng Việt bất kỳ và Merid sẽ bắt đầu làm việc.',
        summaryLevel: 'Bộ từ vựng',
        summaryMode: 'Cách hiển thị',
        doneCta: 'Bắt đầu đọc',
        saving: 'Đang lưu…'
    };

    // The sentence drawn in a mode card when its picture is missing. One
    // sentence for all three, because the difference between the modes is only
    // visible when nothing else differs.
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

    // What the reader has picked. Seeded from the same defaults the rest of
    // the extension starts on, so arriving at step 4 without touching anything
    // saves exactly what would have been true anyway.
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

        /* Outfit and Inter are the extension's own faces, but @font-face
           cannot be registered from inside a shadow root - only the document
           can do that. onboarding.html does, so the standalone wizard gets
           them; over a page there is no such declaration and this falls
           through to the system stack, which is what tutorial.js uses too. */
        .backdrop {
            position: fixed;
            inset: 0;
            background: rgba(4, 9, 20, 0.72);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
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
        .backdrop.standalone { position: absolute; background: #050b17; backdrop-filter: none; }

        .sheet {
            position: relative;
            display: flex;
            flex-direction: column;
            /* :host { all: initial } resets this to content-box, and the 1px
               border would otherwise put the sheet 2px over its stated width. */
            box-sizing: border-box;
            width: min(94vw, 760px);
            max-height: min(92vh, 700px);
            background: #0a192f;
            border: 1px solid rgba(244, 190, 55, 0.14);
            border-radius: 20px;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
            overflow: hidden;
            transform: translateY(10px) scale(0.985);
            transition: transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1);
        }
        .backdrop.show .sheet { transform: none; }

        /* A hairline of Merid's gold along the top edge. */
        .sheet::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, #f4be37, transparent);
        }

        /* ---------- head ---------- */
        .head {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 18px 26px 0;
            flex: 0 0 auto;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 9px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 15px;
            font-weight: 600;
            color: #e6f1ff;
            letter-spacing: 0.01em;
        }
        .brand img { width: 24px; height: 24px; border-radius: 6px; display: block; }

        .dots { display: flex; gap: 6px; margin-left: auto; }
        .dot {
            width: 7px;
            height: 7px;
            border-radius: 99px;
            background: rgba(230, 241, 255, 0.18);
            border: 0;
            padding: 0;
            transition: width 220ms ease, background 220ms ease;
        }
        .dot.done { background: rgba(244, 190, 55, 0.45); cursor: pointer; }
        .dot.here { width: 20px; background: #f4be37; }

        .skip {
            all: unset;
            margin-left: 4px;
            padding: 5px 9px;
            border-radius: 7px;
            color: #8892b0;
            font-size: 12px;
            cursor: pointer;
            transition: color 140ms ease, background 140ms ease;
        }
        .skip:hover { color: #e6f1ff; background: rgba(230, 241, 255, 0.07); }
        .skip:focus-visible { outline: 2px solid #f4be37; outline-offset: 2px; }

        /* ---------- body ---------- */
        .body {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow-y: auto;
            padding: 20px 26px 4px;
            min-height: 336px;
        }
        .step { display: none; }
        .step.here { display: block; animation: rise 260ms cubic-bezier(0.2, 0.8, 0.3, 1); }
        @keyframes rise {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: none; }
        }

        .kicker {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.09em;
            text-transform: uppercase;
            color: #f4be37;
            margin: 0 0 8px;
        }
        h2 {
            margin: 0 0 8px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 24px;
            font-weight: 600;
            line-height: 1.25;
            color: #e6f1ff;
            letter-spacing: -0.01em;
        }
        .lead {
            margin: 0 0 20px;
            font-size: 14px;
            line-height: 1.6;
            color: #8892b0;
            max-width: 58ch;
        }

        /* ---------- step 1 ---------- */
        .hero {
            display: grid;
            place-items: center;
            width: 66px;
            height: 66px;
            margin: 6px 0 18px;
            border-radius: 18px;
            background: rgba(244, 190, 55, 0.1);
            border: 1px solid rgba(244, 190, 55, 0.28);
        }
        .hero img { width: 38px; height: 38px; display: block; }

        .points { list-style: none; margin: 0 0 6px; padding: 0; display: grid; gap: 11px; }
        .points li {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            font-size: 13.5px;
            line-height: 1.55;
            color: #ccd6f6;
        }
        .tick {
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            width: 19px;
            height: 19px;
            margin-top: 1px;
            border-radius: 99px;
            background: rgba(244, 190, 55, 0.14);
            color: #f4be37;
            font-size: 11px;
            font-weight: 700;
        }

        /* ---------- step 2: the dataset cards ---------- */
        /* Four across, like .dataset-btns in the popup - the same shape the
           reader will meet again there. Two-up once that would squeeze the
           labels. */
        .levels {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
        }
        @media (max-width: 620px) {
            .levels { grid-template-columns: repeat(2, 1fr); }
        }

        .pick {
            all: unset;
            box-sizing: border-box;
            display: block;
            position: relative;
            background: #112240;
            border: 1.5px solid #1d2d50;
            border-radius: 13px;
            cursor: pointer;
            transition: border-color 160ms ease, background 160ms ease,
                        transform 160ms ease, box-shadow 160ms ease;
        }
        .pick:hover {
            border-color: #f4be37;
            background: #16294a;
            transform: translateY(-2px);
            box-shadow: 0 10px 26px rgba(244, 190, 55, 0.13);
        }
        .pick:focus-visible { outline: 2px solid #f4be37; outline-offset: 3px; }
        .pick.on {
            border-color: #f4be37;
            background: #16294a;
            box-shadow: 0 0 0 1px #f4be37 inset, 0 10px 26px rgba(244, 190, 55, 0.16);
        }

        .level { display: block; padding: 20px 12px 15px; text-align: center; }
        .level .name {
            display: block;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 17px;
            font-weight: 700;
            color: #8892b0;
            transition: color 160ms ease;
        }
        .pick:hover .level .name, .pick.on .level .name { color: #f4be37; }
        .level .desc {
            display: block;
            margin-top: 5px;
            font-size: 11.5px;
            line-height: 1.45;
            color: #64748b;
        }

        /* The tick that marks the chosen card, in both grids. */
        .mark {
            position: absolute;
            top: 9px;
            right: 9px;
            display: grid;
            place-items: center;
            width: 19px;
            height: 19px;
            border-radius: 99px;
            background: #f4be37;
            color: #0a192f;
            font-size: 11px;
            font-weight: 800;
            opacity: 0;
            transform: scale(0.6);
            transition: opacity 160ms ease, transform 160ms ease;
            z-index: 2;
        }
        .pick.on .mark { opacity: 1; transform: none; }

        /* ---------- step 3: the mode cards ---------- */
        .modes {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        @media (max-width: 620px) {
            .modes { grid-template-columns: 1fr; }
        }

        .mode { display: block; padding: 11px 11px 13px; }

        /* A cream plate behind the picture. The screenshots are cut out with
           no background of their own, and their text is dark - straight onto
           the navy panel they would sink into it. This is also how the sample
           in the brief looks: white cards on cream. */
        .plate {
            display: flex;
            position: relative;
            border-radius: 9px;
            background: #fdfcf7;
            padding: 10px;
            overflow: hidden;
            aspect-ratio: 3 / 2;
            display: flex;
            flex-direction: column;
        }
        .plate img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
        }

        /* The drawn stand-in, used until a picture is dropped in. */
        .demo {
            display: flex;
            flex-direction: column;
            height: 100%;
            text-align: left;
        }
        .demo-badge {
            align-self: flex-start;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 7px;
            border-radius: 5px;
            background: #1f9d55;
            color: #ffffff;
            font-size: 8.5px;
            font-weight: 700;
            letter-spacing: 0.01em;
            margin-bottom: 7px;
        }
        .demo-text {
            font-size: 10px;
            line-height: 1.65;
            color: #2c3444;
            overflow: hidden;
        }
        /* The same marking content.css puts on a word in a real page:
           two-pixel gold underline, an eighth-opacity gold wash. */
        .w {
            border-bottom: 2px solid #f4be37;
            background-color: rgba(244, 190, 55, 0.14);
            padding: 0 1px;
        }
        .w.en { color: #0a3d91; font-weight: 600; }

        .mode .name {
            display: block;
            margin-top: 11px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: #ccd6f6;
            transition: color 160ms ease;
        }
        .pick:hover .mode .name, .pick.on .mode .name { color: #f4be37; }
        .mode .desc {
            display: block;
            margin-top: 3px;
            font-size: 11.5px;
            line-height: 1.45;
            color: #64748b;
        }

        /* ---------- step 4 ---------- */
        .seal {
            display: grid;
            place-items: center;
            width: 58px;
            height: 58px;
            margin: 4px 0 18px;
            border-radius: 99px;
            background: rgba(31, 157, 85, 0.16);
            border: 1px solid rgba(31, 157, 85, 0.45);
            color: #34d399;
            font-size: 26px;
            font-weight: 700;
        }
        .summary {
            display: grid;
            gap: 9px;
            margin-top: 4px;
            padding: 15px 17px;
            background: #112240;
            border: 1px solid #1d2d50;
            border-radius: 13px;
        }
        .srow { display: flex; align-items: center; gap: 12px; font-size: 13px; }
        .srow .k { color: #8892b0; }
        .srow .v {
            margin-left: auto;
            font-family: 'Outfit', system-ui, sans-serif;
            font-weight: 600;
            color: #f4be37;
        }

        /* ---------- foot ---------- */
        .foot {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 18px 26px 22px;
            flex: 0 0 auto;
        }
        .count { margin-right: auto; font-size: 12px; color: #64748b; font-variant-numeric: tabular-nums; }

        .btn {
            all: unset;
            box-sizing: border-box;
            padding: 10px 20px;
            border-radius: 10px;
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
            transition: background 160ms ease, color 160ms ease,
                        border-color 160ms ease, opacity 160ms ease;
        }
        .btn:focus-visible { outline: 2px solid #f4be37; outline-offset: 2px; }
        .btn.ghost {
            border: 1px solid #1d2d50;
            color: #8892b0;
        }
        .btn.ghost:hover { border-color: #f4be37; color: #f4be37; }
        .btn.solid { background: #f4be37; color: #020c1b; }
        .btn.solid:hover { background: #ffd15c; }
        .btn.solid[disabled] { opacity: 0.6; cursor: default; background: #f4be37; }

        @media (prefers-reduced-motion: reduce) {
            .backdrop, .sheet, .pick, .dot, .mark { transition: none; }
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
     * The sentence, marked up for one mode - the stand-in a card shows until
     * its picture arrives.
     *
     * Mirrors what content.js:1048-1049 actually does: 'highlight' keeps the
     * Vietnamese, 'beside' appends the English in brackets, and anything else
     * swaps the word outright.
     */
    function drawMode(mode) {
        const demo = el('div', 'demo');

        const badge = el('span', 'demo-badge');
        badge.append(el('span', null, '★'), el('span', null, VI.modeBadge));
        demo.appendChild(badge);

        const p = el('p', 'demo-text');
        p.appendChild(document.createTextNode(SAMPLE.before));

        if (mode === 'highlight') {
            p.appendChild(el('span', 'w', SAMPLE.vi));
        } else if (mode === 'beside') {
            p.appendChild(el('span', 'w', SAMPLE.vi));
            p.appendChild(document.createTextNode(' '));
            p.appendChild(el('span', 'w en', '(' + SAMPLE.en + ')'));
        } else {
            p.appendChild(el('span', 'w en', SAMPLE.en));
        }

        p.appendChild(document.createTextNode(SAMPLE.after));
        demo.appendChild(p);
        return demo;
    }

    /**
     * One selectable card, in either grid.
     *
     * `radio` rather than `button`: the four levels are one choice between
     * four, and a screen reader should hear it that way. Arrow keys come free
     * with the role only in a real radiogroup, which is why the grids carry it.
     */
    function card(value, onPick) {
        const b = el('button', 'pick');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.value = value;
        b.appendChild(el('span', 'mark', '✓'));
        b.addEventListener('click', () => onPick(value));
        return b;
    }

    // ---------------------------------------------------------------
    // the four steps
    // ---------------------------------------------------------------

    function stepWelcome() {
        const s = el('section', 'step');

        const hero = el('div', 'hero');
        const mark = el('img');
        mark.src = iconUrl('logo-mark.png');
        mark.alt = '';
        hero.appendChild(mark);

        const list = el('ul', 'points');
        [VI.welcomeP1, VI.welcomeP2, VI.welcomeP3].forEach(text => {
            const li = el('li');
            li.append(el('span', 'tick', '✓'), el('span', null, text));
            list.appendChild(li);
        });

        s.append(hero, el('h2', null, VI.welcomeTitle), el('p', 'lead', VI.welcomeLead), list);
        return s;
    }

    function stepLevel() {
        const s = el('section', 'step');
        s.append(
            el('p', 'kicker', VI.stepOf(2, STEP_COUNT)),
            el('h2', null, VI.levelTitle),
            el('p', 'lead', VI.levelLead)
        );

        const grid = el('div', 'levels');
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', VI.levelTitle);

        levelKeys().forEach(key => {
            const b = card(key, k => { picked.datasetKey = k; paint(); });
            const box = el('span', 'level');
            box.append(
                el('span', 'name', levelLabel(key)),
                el('span', 'desc', VI.levelDesc[key] || '')
            );
            // The name is the accessible one; the blurb under it repeats in the
            // label, which is why the whole card carries it rather than aria
            // being left to guess from two spans.
            b.setAttribute('aria-label', levelLabel(key) + '. ' + (VI.levelDesc[key] || ''));
            b.appendChild(box);
            grid.appendChild(b);
        });

        s.appendChild(grid);
        return s;
    }

    function stepMode() {
        const s = el('section', 'step');
        s.append(
            el('p', 'kicker', VI.stepOf(3, STEP_COUNT)),
            el('h2', null, VI.modeTitle),
            el('p', 'lead', VI.modeLead)
        );

        const grid = el('div', 'modes');
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', VI.modeTitle);

        MODE_ORDER.forEach(mode => {
            const b = card(mode, m => { picked.replacementMode = m; paint(); });
            b.setAttribute('aria-label', VI.modeName[mode] + '. ' + VI.modeDesc[mode]);

            const box = el('span', 'mode');
            const plate = el('span', 'plate');

            // Draw the mode first, then let a picture take its place if one
            // loads. That way the card is right from the first frame, and a
            // missing file is simply the drawing staying put - no flash, no
            // broken-image icon, no waiting.
            const drawn = drawMode(mode);
            plate.appendChild(drawn);

            const url = iconUrl(MODE_IMAGE[mode]);
            if (url) {
                const pic = new Image();
                pic.onload = () => {
                    pic.alt = '';
                    plate.replaceChildren(pic);
                };
                pic.src = url;
            }

            box.append(
                plate,
                el('span', 'name', VI.modeName[mode]),
                el('span', 'desc', VI.modeDesc[mode])
            );
            b.appendChild(box);
            grid.appendChild(b);
        });

        s.appendChild(grid);
        return s;
    }

    function stepDone() {
        const s = el('section', 'step');
        s.append(el('div', 'seal', '✓'), el('h2', null, VI.doneTitle), el('p', 'lead', VI.doneLead));

        const sum = el('div', 'summary');
        const rowLevel = el('div', 'srow');
        rowLevel.append(el('span', 'k', VI.summaryLevel), el('span', 'v sum-level', ''));
        const rowMode = el('div', 'srow');
        rowMode.append(el('span', 'k', VI.summaryMode), el('span', 'v sum-mode', ''));
        sum.append(rowLevel, rowMode);

        s.appendChild(sum);
        return s;
    }

    // ---------------------------------------------------------------
    // state -> screen
    // ---------------------------------------------------------------

    /** Redraw everything that depends on `step` or `picked`. */
    function paint() {
        if (!root) return;

        root.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('here', i === step));

        root.querySelectorAll('.dot').forEach((d, i) => {
            d.classList.toggle('here', i === step);
            d.classList.toggle('done', i < step);
            d.setAttribute('aria-current', i === step ? 'step' : 'false');
        });

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

        const level = root.querySelector('.sum-level');
        const mode = root.querySelector('.sum-mode');
        if (level) level.textContent = levelLabel(picked.datasetKey);
        if (mode) mode.textContent = VI.modeName[picked.replacementMode] || picked.replacementMode;

        const last = step === STEP_COUNT - 1;
        const back = root.querySelector('.btn-back');
        const next = root.querySelector('.btn-next');
        const count = root.querySelector('.count');
        const skip = root.querySelector('.skip');

        back.hidden = step === 0;
        if (skip) skip.hidden = last;
        count.textContent = VI.stepOf(step + 1, STEP_COUNT);
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
                { replacementMode: picked.replacementMode, onboardingDone: true },
                () => { void chrome.runtime.lastError; done(); }
            );
        } catch (e) { done(); }
    }

    // ---------------------------------------------------------------
    // open / close
    // ---------------------------------------------------------------

    function onKeyDown(e) {
        if (!host) return;
        if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
        if (saving) return;
        if (e.key === 'ArrowRight') go(step + 1);
        else if (e.key === 'ArrowLeft') go(step - 1);
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

        // --- head ---
        const head = el('div', 'head');
        const brand = el('div', 'brand');
        const logo = el('img');
        logo.src = iconUrl('logo-mark.png');
        logo.alt = '';
        brand.append(logo, el('span', null, 'Merid'));

        const dots = el('div', 'dots');
        for (let i = 0; i < STEP_COUNT; i++) {
            const d = el('button', 'dot');
            d.type = 'button';
            d.setAttribute('aria-label', VI.stepOf(i + 1, STEP_COUNT));
            // Only backwards. Jumping ahead would skip a question whose answer
            // is about to be saved on the reader's behalf.
            d.addEventListener('click', () => { if (i < step) go(i); });
            dots.appendChild(d);
        }

        const skip = el('button', 'skip', VI.skip);
        skip.type = 'button';
        // Skipping is still a decision, so it saves what is on screen - the
        // defaults, untouched, if the reader never picked anything. Leaving
        // without writing would drop them back to being configured by us.
        skip.addEventListener('click', finish);

        head.append(brand, dots, skip);

        // --- body ---
        const body = el('div', 'body');
        body.append(stepWelcome(), stepLevel(), stepMode(), stepDone());

        // --- foot ---
        const foot = el('div', 'foot');
        const count = el('span', 'count');

        const back = el('button', 'btn ghost btn-back', VI.back);
        back.type = 'button';
        back.addEventListener('click', () => go(step - 1));

        const next = el('button', 'btn solid btn-next', VI.next);
        next.type = 'button';
        next.addEventListener('click', () => {
            if (step === STEP_COUNT - 1) finish();
            else go(step + 1);
        });

        foot.append(count, back, next);

        sheet.append(head, body, foot);
        backdrop.appendChild(sheet);

        if (!standalone) {
            // Only a press that both starts and ends on the backdrop closes.
            // A drag that began inside the sheet and finished outside it is a
            // selection, not a request to leave.
            let downOutside = false;
            backdrop.addEventListener('mousedown', (e) => { downOutside = e.target === backdrop; });
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop && downOutside) close();
                downOutside = false;
            });
        }

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
        host.style.cssText = 'all:initial;position:static;';
        (document.body || document.documentElement).appendChild(host);
        root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = STYLE;
        root.appendChild(style);
        root.appendChild(build());

        step = 0;
        saving = false;
        paint();

        document.addEventListener('keydown', onKeyDown, true);
        requestAnimationFrame(() => {
            const backdrop = root && root.querySelector('.backdrop');
            if (backdrop) backdrop.classList.add('show');
        });
        return true;
    }

    global.MeridOnboarding = { open, close };

    // Standing itself up on onboarding.html.
    //
    // Chrome runs no content script on a chrome-extension: page, so this file
    // finding itself on one means onboarding.html loaded it directly - the
    // first-run tab, which has nothing else to be. Everywhere else this is a
    // content script and must stay dormant until the popup asks.
    //
    // It is here rather than in an inline <script> in the page because
    // extension pages run under script-src 'self', which refuses one.
    if (location.protocol === 'chrome-extension:') {
        const start = () => {
            document.title = VI.welcomeTitle + ' - Merid';
            open({ standalone: true });
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})(window);
