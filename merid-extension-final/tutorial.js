// =============================================================
// Merid - the tutorial poster
//
// "Hướng dẫn" in the popup opens this. The popup itself cannot show it: it is a
// small panel anchored to the toolbar button that closes the moment focus goes
// anywhere else, so the poster is put up over the page the reader is already
// on - centred, on a dimmed backdrop, closable by the button, by Escape, or by
// clicking off it.
//
// The poster is a tall A2 sheet full of small screenshots, so it is worth very
// little without magnification: it opens fitted to the window and zooms from
// there, by the buttons, by the wheel, or by double-click, and can be dragged
// around once it is larger than the space it has.
//
// Everything lives in an open shadow root, for the same reason status-badge.js
// does: this sits on pages whose CSS we do not control, and neither side may
// reach into the other.
//
// The same code backs tutorial.html, which is where the popup sends a reader
// whose current tab cannot host a content script at all - a new tab, a
// chrome:// page, the Web Store. `open({ standalone: true })` is that mode: the
// poster fills a page of its own, so there is no "outside" to click and closing
// means closing the tab.
// =============================================================

(function (global) {
    'use strict';

    const HOST_ID = 'merid-tutorial-host';
    const IMAGE = 'tutorial-vi.webp';

    // Zoom runs as a multiple of "fitted to the window", so 1 always means the
    // whole sheet is visible whatever the window size. The ceiling is well past
    // the poster's own resolution because the screenshots on it are small.
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 6;
    const STEP = 1.4;          // per button press or wheel notch
    const DOUBLE_CLICK_ZOOM = 2.5;

    let host = null;
    let root = null;
    let img = null;
    let stage = null;
    let zoomLabel = null;
    let standalone = false;

    let zoom = 1;
    // Where the poster sits inside the stage when it is bigger than it, in px.
    let panX = 0;
    let panY = 0;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    function msg(key, fallback) {
        try {
            const s = chrome.i18n.getMessage(key);
            return s || fallback;
        } catch (e) {
            return fallback;
        }
    }

    const STYLE = `
        :host { all: initial; }

        .backdrop {
            position: fixed;
            inset: 0;
            background: rgba(8, 13, 28, 0.82);
            display: flex;
            flex-direction: column;
            align-items: center;
            z-index: 2147483600;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            opacity: 0;
            transition: opacity 160ms ease;
        }
        .backdrop.show { opacity: 1; }
        .backdrop.standalone { position: absolute; background: #0b1020; }

        /* The sheet and its controls. Clicks inside here never reach the
           backdrop's close handler. */
        .frame {
            position: relative;
            display: flex;
            flex-direction: column;
            width: min(96vw, 1100px);
            height: 100%;
            padding: 14px 0 18px;
            box-sizing: border-box;
        }

        .bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 2px 10px;
            flex: 0 0 auto;
        }
        .title {
            color: #f6f7fb;
            font-size: 15px;
            font-weight: 600;
            margin-right: auto;
            letter-spacing: 0.01em;
        }
        button {
            all: unset;
            box-sizing: border-box;
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border-radius: 9px;
            background: rgba(255, 255, 255, 0.1);
            color: #f6f7fb;
            font-size: 17px;
            line-height: 1;
            cursor: pointer;
            transition: background 120ms ease;
            user-select: none;
        }
        button:hover { background: rgba(255, 255, 255, 0.2); }
        button:focus-visible { outline: 2px solid #f5c542; outline-offset: 2px; }
        button[disabled] { opacity: 0.35; cursor: default; background: rgba(255, 255, 255, 0.1); }
        .close { background: rgba(255, 255, 255, 0.16); font-size: 20px; }

        .zoom-label {
            color: #aeb6cc;
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            min-width: 44px;
            text-align: center;
            user-select: none;
        }

        /* The window onto the poster. Scrollbars stay off - panning is by drag,
           which is what a zoomed sheet wants. */
        /* Transparent, because the sheet is a tall portrait one and rarely fills
           a landscape window: a panel with its own background would sit around
           it as two bright empty columns. The paper is the image. */
        .stage {
            position: relative;
            flex: 1 1 auto;
            overflow: hidden;
            touch-action: none;
        }
        .stage.grabbable { cursor: grab; }
        .stage.grabbing { cursor: grabbing; }

        img {
            position: absolute;
            top: 0;
            left: 0;
            transform-origin: 0 0;
            /* Size is set from JS: the sheet is laid out to fit, then scaled. */
            background: #ffffff;
            border-radius: 10px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
            image-rendering: auto;
            user-select: none;
            -webkit-user-drag: none;
        }

        .hint {
            flex: 0 0 auto;
            padding-top: 9px;
            color: #8d97b1;
            font-size: 11.5px;
            text-align: center;
            user-select: none;
        }

        @media (prefers-reduced-motion: reduce) {
            .backdrop { transition: none; }
        }
    `;

    /** Largest scale at which the whole sheet fits the stage. */
    function fitScale() {
        if (!img || !stage || !img.naturalWidth) return 1;
        const box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return 1;
        return Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    }

    /**
     * Put the poster where the current zoom and pan say it goes.
     *
     * Pan is clamped every time rather than only while dragging, so a zoom-out
     * can never leave the sheet stranded off the edge of the stage. Whichever
     * axis has room to spare is centred instead of clamped.
     */
    function render() {
        if (!img || !stage) return;
        const scale = fitScale() * zoom;
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        const box = stage.getBoundingClientRect();

        if (w <= box.width) panX = (box.width - w) / 2;
        else panX = Math.min(0, Math.max(box.width - w, panX));
        if (h <= box.height) panY = (box.height - h) / 2;
        else panY = Math.min(0, Math.max(box.height - h, panY));

        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.transform = `translate(${panX}px, ${panY}px)`;

        const roomToDrag = w > box.width + 1 || h > box.height + 1;
        stage.classList.toggle('grabbable', roomToDrag);
        if (!roomToDrag) stage.classList.remove('grabbing');

        if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
        const inBtn = root.querySelector('.zoom-in');
        const outBtn = root.querySelector('.zoom-out');
        if (inBtn) inBtn.disabled = zoom >= MAX_ZOOM - 0.001;
        if (outBtn) outBtn.disabled = zoom <= MIN_ZOOM + 0.001;
    }

    /**
     * Zoom, keeping the point under (clientX, clientY) where it is.
     *
     * Without the anchor, zooming always pulls towards the top-left corner and
     * the reader loses whatever they were looking at - which on a sheet this
     * tall means losing their place entirely.
     */
    function zoomTo(next, clientX, clientY) {
        const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        if (Math.abs(target - zoom) < 0.0001) return;
        const box = stage.getBoundingClientRect();
        const anchorX = clientX === undefined ? box.width / 2 : clientX - box.left;
        const anchorY = clientY === undefined ? box.height / 2 : clientY - box.top;
        // Where that point sits on the poster right now, in unscaled pixels.
        const base = fitScale();
        const posterX = (anchorX - panX) / (base * zoom);
        const posterY = (anchorY - panY) / (base * zoom);
        zoom = target;
        panX = anchorX - posterX * base * zoom;
        panY = anchorY - posterY * base * zoom;
        render();
    }

    function close() {
        if (standalone) {
            // Opened as a tab of its own: there is nothing behind it to go back
            // to, so closing means closing the tab. Browsers refuse that for
            // tabs the user opened themselves, in which case the poster stays -
            // which is the right outcome for a page whose whole content it is.
            try { window.close(); } catch (e) { /* not ours to close */ }
            return;
        }
        if (!host) return;
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', render);
        const node = host;
        host = null;
        root = img = stage = zoomLabel = null;
        const backdrop = node.shadowRoot && node.shadowRoot.querySelector('.backdrop');
        if (backdrop) backdrop.classList.remove('show');
        setTimeout(() => node.remove(), 180);
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
        if (e.key === '+' || e.key === '=') zoomTo(zoom * STEP);
        else if (e.key === '-' || e.key === '_') zoomTo(zoom / STEP);
        else if (e.key === '0') { zoom = 1; render(); }
    }

    function build() {
        const backdrop = document.createElement('div');
        backdrop.className = 'backdrop' + (standalone ? ' standalone' : '');

        const frame = document.createElement('div');
        frame.className = 'frame';

        const bar = document.createElement('div');
        bar.className = 'bar';

        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = msg('popupTutorial', 'Tutorial');

        const out = document.createElement('button');
        out.className = 'zoom-out';
        out.textContent = '−';
        out.title = msg('tutorialZoomOut', 'Zoom out');
        out.setAttribute('aria-label', out.title);

        zoomLabel = document.createElement('span');
        zoomLabel.className = 'zoom-label';
        zoomLabel.textContent = '100%';

        const inBtn = document.createElement('button');
        inBtn.className = 'zoom-in';
        inBtn.textContent = '+';
        inBtn.title = msg('tutorialZoomIn', 'Zoom in');
        inBtn.setAttribute('aria-label', inBtn.title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close';
        closeBtn.textContent = '×';
        closeBtn.title = msg('tutorialClose', 'Close');
        closeBtn.setAttribute('aria-label', closeBtn.title);

        bar.append(title, out, zoomLabel, inBtn);
        if (!standalone) bar.append(closeBtn);

        stage = document.createElement('div');
        stage.className = 'stage';

        img = document.createElement('img');
        img.alt = msg('popupTutorial', 'Tutorial');
        img.draggable = false;
        stage.appendChild(img);

        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = standalone
            ? msg('tutorialHintPage', 'Scroll to zoom, drag to move')
            : msg('tutorialHint', 'Scroll to zoom, drag to move, Esc to close');

        frame.append(bar, stage, hint);
        backdrop.appendChild(frame);

        // --- closing ---
        closeBtn.addEventListener('click', close);
        if (!standalone) {
            // Only a press that both starts AND ends on the backdrop counts. A
            // drag that began on the poster and happened to finish outside it
            // is panning, not a request to close.
            let downOnBackdrop = false;
            backdrop.addEventListener('mousedown', (e) => { downOnBackdrop = e.target === backdrop; });
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop && downOnBackdrop) close();
                downOnBackdrop = false;
            });
        }

        // --- zooming ---
        inBtn.addEventListener('click', () => zoomTo(zoom * STEP));
        out.addEventListener('click', () => zoomTo(zoom / STEP));
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoomTo(zoom * (e.deltaY < 0 ? STEP : 1 / STEP), e.clientX, e.clientY);
        }, { passive: false });
        stage.addEventListener('dblclick', (e) => {
            e.preventDefault();
            zoomTo(zoom > 1.01 ? 1 : DOUBLE_CLICK_ZOOM, e.clientX, e.clientY);
        });

        // --- panning ---
        stage.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || !stage.classList.contains('grabbable')) return;
            dragging = true;
            dragStartX = e.clientX - panX;
            dragStartY = e.clientY - panY;
            stage.classList.add('grabbing');
            try { stage.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ }
        });
        stage.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            e.preventDefault();
            panX = e.clientX - dragStartX;
            panY = e.clientY - dragStartY;
            render();
        });
        const endDrag = (e) => {
            if (!dragging) return;
            dragging = false;
            stage.classList.remove('grabbing');
            try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
        };
        stage.addEventListener('pointerup', endDrag);
        stage.addEventListener('pointercancel', endDrag);

        return backdrop;
    }

    /**
     * Put the poster up. Safe to call twice - a second call just brings the one
     * already open back to its fitted size rather than stacking another.
     */
    function open(opts) {
        standalone = !!(opts && opts.standalone);
        if (host) { zoom = 1; render(); return true; }

        host = document.createElement('div');
        host.id = HOST_ID;
        host.style.cssText = 'all:initial;position:static;';
        (document.body || document.documentElement).appendChild(host);
        root = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = STYLE;
        root.appendChild(style);

        const backdrop = build();
        root.appendChild(backdrop);

        zoom = 1;
        panX = panY = 0;
        // Lay the sheet out only once its real dimensions are known, or it is
        // fitted against a naturalWidth of zero and lands at the wrong size.
        img.addEventListener('load', render);
        img.addEventListener('error', () => { if (zoomLabel) zoomLabel.textContent = '--'; });
        img.src = chrome.runtime.getURL(IMAGE);

        window.addEventListener('resize', render);
        // Escape and the +/-/0 keys work in both modes; only what Escape DOES
        // differs, and close() decides that.
        document.addEventListener('keydown', onKeyDown, true);

        requestAnimationFrame(() => backdrop.classList.add('show'));
        render();
        return true;
    }

    global.MeridTutorial = { open, close };

    // Standing itself up on tutorial.html.
    //
    // Chrome runs no content script on a chrome-extension: page, so this file
    // finding itself on one means tutorial.html loaded it directly - the
    // fallback tab, which has nothing else to be. Everywhere else this is a
    // content script and must stay dormant until the popup asks.
    //
    // It is here rather than in an inline <script> in the page because
    // extension pages run under script-src 'self', which refuses one.
    if (location.protocol === 'chrome-extension:') {
        const start = () => {
            document.title = msg('popupTutorial', 'Tutorial') + ' - Merid';
            open({ standalone: true });
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})(window);
