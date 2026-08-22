// =============================================================
// Merid - reading status badge
//
// A mark in the corner that says Merid is still deciding about the words on
// this screen. Nothing is swapped into the page until the context check has
// cleared it, so this is the one thing telling the reader that words are on
// their way - which is why it is sized to be noticed at a glance rather than
// hunted for.
//
// It is still deliberately quiet: hidden whenever there is nothing in flight,
// gone entirely when the context check is off, and it asks for nothing - the
// one thing it accepts is being dragged out of the way.
//
// It sits bottom-LEFT. The bottom-right corner is where the web keeps its own
// furniture - Facebook's new-message button, Messenger bubbles, chat widgets,
// back-to-top arrows - and a badge that covers one of those is not quiet, it
// is in the way. Dragging is the escape hatch for the sites this still
// collides with, and where it is dropped is remembered.
//
// Everything lives in an open shadow root. The badge sits on pages whose CSS
// we do not control and must not disturb: a shadow root means no page rule can
// reach in and no rule of ours can leak out.
// =============================================================

(function (global) {
    'use strict';

    const HOST_ID = 'merid-status-host';
    // Where the reader dragged it to, if they ever did. One position for every
    // site: a reader who moved it once has said where they want it.
    const POS_KEY = 'vm_badge_pos';
    // Gap kept from the viewport edges, so it can never be dragged half off.
    const MARGIN = 8;
    const SIZE = 44;
    // How long the finished state stays up before fading. Long enough to
    // notice, short enough not to become furniture.
    const DONE_HOLD_MS = 1200;
    const FADE_MS = 250;

    let host = null;
    let root = null;
    let state = 'idle';
    let hideTimer = null;

    const STYLE = `
        :host { all: initial; }
        .badge {
            position: fixed;
            left: 20px;
            bottom: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #16213c;
            box-shadow: 0 6px 18px rgba(10, 17, 34, 0.45);
            display: grid;
            place-items: center;
            opacity: 0;
            transform: scale(0.85);
            transition: opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease;
            pointer-events: none;
            touch-action: none;
            z-index: 2147483000;
        }
        /* Grabbable only while it is actually on screen. An opacity:0 element
           still receives clicks, so leaving this on would silently swallow
           every click in that corner for the whole time the badge is hidden -
           which is most of the time. */
        .badge.show { opacity: 1; transform: scale(1); pointer-events: auto; cursor: grab; }
        .badge.dragging { cursor: grabbing; transition: none; }

        svg { display: block; overflow: visible; }

        /* Track sits under the arc so the ring reads as a ring, not a comma. */
        .track { stroke: rgba(245, 197, 66, 0.18); }

        .arc {
            stroke: #f5c542;
            stroke-linecap: round;
            stroke-dasharray: 22 60;
            transform-origin: 15px 15px;
            animation: merid-spin 1s linear infinite;
        }
        .badge.done .arc {
            stroke: #34c98a;
            stroke-dasharray: 82 0;
            animation: none;
        }

        /* The M, in the logo's proportions. */
        .mark { fill: #f7f6f3; }
        .bar { fill: #f3c33c; }

        .tick {
            stroke: #34c98a;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
            opacity: 0;
            transition: opacity 200ms ease;
        }
        .badge.done .tick { opacity: 1; }
        .badge.done .mark, .badge.done .bar { opacity: 0; transition: opacity 200ms ease; }

        @keyframes merid-spin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
            .badge { transition: none; }
            .arc { animation: none; stroke-dasharray: 82 0; stroke: rgba(245, 197, 66, 0.55); }
        }
    `;

    const MARKUP = `
        <div class="badge" part="badge" role="status" aria-live="polite">
            <svg width="44" height="44" viewBox="0 0 30 30" aria-hidden="true" focusable="false">
                <circle class="track" cx="15" cy="15" r="13" fill="none" stroke-width="2"></circle>
                <circle class="arc" cx="15" cy="15" r="13" fill="none" stroke-width="2"></circle>
                <path class="mark" d="M10 19.5v-9h2.1l2.9 4.6 2.9-4.6H20v9h-2v-5.4l-2.4 3.7h-1.2L12 14.1v5.4z"></path>
                <rect class="bar" x="10" y="20.6" width="10" height="1.6" rx="0.8"></rect>
                <path class="tick" d="M10.5 15.3l3 3 6-6"></path>
            </svg>
        </div>
    `;

    function mount() {
        if (host && host.isConnected) return true;
        if (!document.body) return false;
        host = document.getElementById(HOST_ID);
        if (!host) {
            host = document.createElement('div');
            host.id = HOST_ID;
            // The host itself must take no space and catch no clicks; the badge
            // inside is position:fixed and does the positioning.
            host.style.cssText = 'all:initial;position:static;';
            document.body.appendChild(host);
        }
        // The host may already be hosting a shadow tree this instance did not
        // attach. A second copy of the extension in the same tab is what does
        // it in the wild - content scripts share the page's DOM, so the second
        // copy finds the first copy's host with its own `root` still null.
        // attachShadow() throws on a host that already has a tree, and nothing
        // caught it: the throw came out of set(), which is called from the
        // middle of the scan and the middle of the AI check, and with the
        // reveal deferred that left every held word hidden. Adopt the tree that
        // is there instead.
        //
        // Reading the root off `host` rather than remembering it also settles a
        // quieter one: a page that replaces document.body takes our host with
        // it, and the badge was then driven through a shadow root belonging to
        // an element no longer in the page.
        try {
            root = host.shadowRoot || host.attachShadow({ mode: 'open' });
        } catch (e) {
            // A tree that is there but closed: nothing to adopt and nothing to
            // attach. No badge is a fair outcome; an exception is not.
            console.warn('[Merid] status badge: no shadow root available', e);
            return false;
        }
        if (!root.querySelector('.badge')) {
            const style = document.createElement('style');
            style.textContent = STYLE;
            root.appendChild(style);
            const wrap = document.createElement('div');
            wrap.innerHTML = MARKUP;
            root.appendChild(wrap.firstElementChild);
            armDrag(root.querySelector('.badge'));
            loadPlacement();
        }
        return true;
    }

    function badge() {
        return root && root.querySelector('.badge');
    }

    // ---------------------------------------------------------------
    // Dragging
    //
    // Same shape as the site's useDraggable hook (src/hooks/useDraggable.ts):
    // snapshot the rect on pointerdown, capture the pointer, then write
    // left/top straight to the element on every move so following the finger
    // never waits on anything. Clamped to the viewport, because a badge
    // dragged off the edge cannot be dragged back.
    // ---------------------------------------------------------------
    let placed = null;   // { left, top } once dragged, in viewport px
    let grab = null;
    let pendingHide = false;   // a hide() that arrived mid-drag, owed on release

    function clamp(v, lo, hi) {
        return Math.min(Math.max(v, lo), Math.max(lo, hi));
    }

    /** Put the badge at `placed`, re-clamped to whatever the viewport is now.
     *  Called on load, after a drag, and on resize - a position saved on a wide
     *  window would otherwise sit off-screen on a narrow one. */
    function applyPlacement() {
        const el = badge();
        if (!el || !placed) return;
        const left = clamp(placed.left, MARGIN, window.innerWidth - SIZE - MARGIN);
        const top = clamp(placed.top, MARGIN, window.innerHeight - SIZE - MARGIN);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    function loadPlacement() {
        try {
            chrome.storage.local.get([POS_KEY], (r) => {
                const p = r && r[POS_KEY];
                if (p && typeof p.left === 'number' && typeof p.top === 'number') {
                    placed = { left: p.left, top: p.top };
                    applyPlacement();
                }
            });
        } catch (e) { /* no storage on this page: the default corner is fine */ }
    }

    function savePlacement() {
        try {
            chrome.storage.local.set({ [POS_KEY]: placed });
        } catch (e) { /* the drag still holds for this page */ }
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const el = badge();
        if (!el) return;
        e.preventDefault();   // no text selection, and no click reaching the page
        const rect = el.getBoundingClientRect();
        grab = { id: e.pointerId, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top };
        el.classList.add('dragging');
        el.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
        if (!grab || e.pointerId !== grab.id) return;
        placed = { left: grab.left + (e.clientX - grab.startX), top: grab.top + (e.clientY - grab.startY) };
        applyPlacement();
    }

    function onPointerUp(e) {
        if (!grab || e.pointerId !== grab.id) return;
        const el = badge();
        if (el) {
            el.classList.remove('dragging');
            if (el.hasPointerCapture(grab.id)) el.releasePointerCapture(grab.id);
        }
        grab = null;
        if (placed) savePlacement();
        if (pendingHide) { pendingHide = false; hide(); }
    }

    function armDrag(el) {
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointercancel', onPointerUp);
        el.addEventListener('lostpointercapture', onPointerUp);
    }

    // Once for the module, not once per badge. The badge can be built more than
    // once over a page's life now - a page that replaces document.body gets a
    // fresh one - and a listener added on each pass would accumulate.
    window.addEventListener('resize', applyPlacement);

    function hide() {
        // Never out from under a finger. The badge is only up while a check is
        // in flight, so a check finishing mid-drag would otherwise take it away
        // and cancel the drag - which is most of why dragging it felt like it
        // did nothing. The next hide() lands when the pointer is released.
        if (grab) { pendingHide = true; return; }
        const el = badge();
        if (el) el.classList.remove('show');
    }

    /**
     * Move the badge to a state.
     *
     * 'checking' - a request is in flight (spinning arc)
     * 'done'     - verdicts applied; holds green briefly, then hides
     * 'idle'     - nothing pending; hides
     * 'off'      - the context check will not run at all; hides and stays gone
     */
    function set(next) {
        if (next === state && next !== 'done') return;
        state = next;

        if (next === 'off' || next === 'idle') {
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            hide();
            return;
        }
        if (!mount()) return;
        const el = badge();
        if (!el) return;

        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

        if (next === 'checking') {
            el.classList.remove('done');
            el.classList.add('show');
            return;
        }
        if (next === 'done') {
            el.classList.add('done', 'show');
            hideTimer = setTimeout(() => {
                hideTimer = null;
                // Only fade if nothing started up again in the meantime.
                if (state === 'done') { state = 'idle'; hide(); }
            }, DONE_HOLD_MS);
        }
    }

    // set() is called from inside the scan and from inside the AI check, where
    // an exception strands every word waiting on a verdict and the page reads
    // as though the extension were switched off. content.js already promises a
    // status indicator can never stop a page being read; that has to hold for a
    // badge that fails as well as one that never loaded.
    global.MeridStatus = {
        set: function (next) {
            try {
                set(next);
            } catch (e) {
                console.warn('[Merid] status badge:', e);
            }
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
