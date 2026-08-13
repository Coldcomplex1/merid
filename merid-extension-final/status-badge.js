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
// gone entirely when the context check is off, and never interactive - it
// reports, it does not ask for anything.
//
// Everything lives in an open shadow root. The badge sits on pages whose CSS
// we do not control and must not disturb: a shadow root means no page rule can
// reach in and no rule of ours can leak out.
// =============================================================

(function (global) {
    'use strict';

    const HOST_ID = 'merid-status-host';
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
            right: 20px;
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
            z-index: 2147483000;
        }
        .badge.show { opacity: 1; transform: scale(1); }

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
        if (!root) {
            root = host.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = STYLE;
            root.appendChild(style);
            const wrap = document.createElement('div');
            wrap.innerHTML = MARKUP;
            root.appendChild(wrap.firstElementChild);
        }
        return true;
    }

    function badge() {
        return root && root.querySelector('.badge');
    }

    function hide() {
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

    global.MeridStatus = { set };
})(typeof window !== 'undefined' ? window : globalThis);
