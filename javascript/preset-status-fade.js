/* ADetailer Ultimate — auto-clear of the preset / IO status messages.
 *
 * The preset library widgets (Load / Save / Delete / Rename / Reset +
 * Export / Import) write feedback messages like "✅ Loaded 'X'." or
 * "➕ 2 added · ⏭ 1 skipped" into a small markdown widget below the
 * action row. Without auto-clearing those messages linger forever — the
 * user has to keep ignoring them. This script watches the relevant
 * markdown containers and wipes their content ~4 seconds after a new
 * non-empty message appears, so the UI returns to a clean state.
 *
 * Mechanics:
 * - Look for any element with class `.ad-preset-status` (preset
 *   button row) or `.ad-preview-status` is excluded (those are
 *   warnings that should stay until the user fixes the precondition).
 * - On any DOM mutation inside that element, sample the inner <p>
 *   text. If it changed AND is non-empty, schedule a clear in 4 s.
 * - Clear by setting the inner .md innerHTML to empty. The
 *   `:has(.md:empty)` CSS rule then hides the container so it
 *   doesn't keep its styled background.
 * - The clear is purely DOM-level — we don't notify Gradio's
 *   reactive store, so the underlying Python state is untouched.
 *   Next time the user clicks Load/Save/etc., the handler writes a
 *   new message and the cycle restarts.
 */

(function () {
    "use strict";

    const FADE_DELAY_MS = 4000;
    const WATCH_CLASS = "ad-preset-status";

    function setupWatcher(statusEl) {
        if (statusEl.__adStatusFadeAttached) return;
        statusEl.__adStatusFadeAttached = true;

        let timer = null;
        let lastSeen = "";

        const tick = () => {
            const md = statusEl.querySelector(".md");
            if (!md) return;
            const text = (md.textContent || "").trim();
            if (text && text !== lastSeen) {
                lastSeen = text;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    // Clear if the message is still the same one we
                    // scheduled for — don't wipe a fresher message
                    // that arrived in the meantime.
                    const fresh = (md.textContent || "").trim();
                    if (fresh === lastSeen) {
                        md.innerHTML = "";
                        lastSeen = "";
                    }
                }, FADE_DELAY_MS);
            } else if (!text && lastSeen) {
                // Outside reset (e.g. Gradio overwrote with empty) —
                // forget our timer state.
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                lastSeen = "";
            }
        };

        // Initial check + observer on the .md subtree so we catch
        // Gradio overwrites + Svelte rerenders.
        tick();
        const obs = new MutationObserver(tick);
        obs.observe(statusEl, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    function scanAll() {
        document
            .querySelectorAll("." + WATCH_CLASS)
            .forEach((el) => setupWatcher(el));
    }

    function boot() {
        scanAll();
        // Re-scan on body mutations so we attach to status elements
        // that mount lazily (e.g. when a tab is first opened).
        const docObs = new MutationObserver(() => scanAll());
        docObs.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
