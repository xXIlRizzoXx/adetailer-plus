/* ADetailer fork — drag-and-drop reorder for the detector-classes dropdown.
 *
 * The Sequential class detection feature processes classes in the order
 * shown in the multi-select dropdown. Gradio doesn't let the user reorder
 * selected tokens natively, so this script:
 *   1. Marks each selected token as draggable.
 *   2. On drop, computes the new label order.
 *   3. Syncs Gradio's internal value to the new order by clicking each
 *      token's × to deselect everything, then opening the dropdown and
 *      clicking each option in the new order. This way Gradio rebuilds
 *      the value array in our desired sequence.
 *
 * A1111/Forge auto-loads any .js file in the extension's javascript/
 * folder. The script is a no-op until the matching dropdowns appear in
 * the DOM.
 */

(function () {
    "use strict";

    const DROPDOWN_SELECTOR = '[id*="ad_model_classes_dropdown"]';
    const SETUP_FLAG = "__adReorderSetup";
    const TOKEN_FLAG = "__adReorderToken";

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function getTokens(wrapInner) {
        // Tokens are direct children that aren't the secondary-wrap (which
        // holds the text input + chevron).
        return Array.from(wrapInner.children).filter(
            (c) => !c.classList.contains("secondary-wrap")
        );
    }

    function getTokenLabel(token) {
        const removeBtn = token.querySelector(
            ".token-remove, [class*='token-remove']"
        );
        const txt = token.textContent || "";
        // Strip the × glyph that Gradio puts inside the remove button.
        return txt.replace(/×/g, "").trim();
    }

    async function syncOrderToGradio(dropdown, newOrder) {
        const wrapInner = dropdown.querySelector(".wrap-inner");
        if (!wrapInner) return;

        // Step 1: deselect everything by clicking each × in turn.
        // Gradio rebuilds the value array on every click, so we re-query
        // after each removal.
        let safety = 30;
        while (safety-- > 0) {
            const removeBtn = wrapInner.querySelector(
                ".token-remove, [class*='token-remove']"
            );
            if (!removeBtn) break;
            removeBtn.click();
            await sleep(40);
        }

        // Step 2: open the dropdown by focusing its input.
        const input = dropdown.querySelector(".secondary-wrap input");
        if (!input) return;
        input.focus();
        input.click();
        await sleep(120);

        // Step 3: click each option in the desired order.
        for (const label of newOrder) {
            // Options can be in a sibling list or a portal. Search both.
            const all = Array.from(
                dropdown.querySelectorAll("li, .item, [role='option']")
            ).concat(
                Array.from(
                    document.querySelectorAll(".options li, .options .item")
                )
            );
            const target = all.find(
                (o) => (o.textContent || "").trim() === label
            );
            if (target) {
                target.click();
                await sleep(80);
            }
        }

        // Step 4: close the dropdown.
        input.blur();
    }

    function attachDragHandlers(token, wrapInner, dropdown) {
        if (token[TOKEN_FLAG]) return;
        token[TOKEN_FLAG] = true;
        token.draggable = true;
        token.style.cursor = "grab";

        token.addEventListener("dragstart", (e) => {
            token.classList.add("ad-token-dragging");
            try {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", getTokenLabel(token));
            } catch (_) {
                /* some browsers throw on programmatic drags — ignore */
            }
        });

        token.addEventListener("dragend", () => {
            token.classList.remove("ad-token-dragging");
        });

        token.addEventListener("dragover", (e) => {
            e.preventDefault();
            const dragging = wrapInner.querySelector(".ad-token-dragging");
            if (!dragging || dragging === token) return;
            const rect = token.getBoundingClientRect();
            const after = e.clientX - rect.left > rect.width / 2;
            if (after) {
                token.parentNode.insertBefore(dragging, token.nextSibling);
            } else {
                token.parentNode.insertBefore(dragging, token);
            }
        });

        token.addEventListener("drop", async (e) => {
            e.preventDefault();
            // DOM is already in the new order thanks to the dragover handler.
            // Now persist the new order to Gradio's internal value.
            const newOrder = getTokens(wrapInner).map(getTokenLabel).filter(Boolean);
            await syncOrderToGradio(dropdown, newOrder);
        });
    }

    function makeTokensDraggable(dropdown) {
        const wrapInner = dropdown.querySelector(".wrap-inner");
        if (!wrapInner) return;
        for (const token of getTokens(wrapInner)) {
            attachDragHandlers(token, wrapInner, dropdown);
        }
    }

    function setupDropdown(dropdown) {
        if (dropdown[SETUP_FLAG]) return;
        dropdown[SETUP_FLAG] = true;

        // Watch for tokens being added/removed (selecting/deselecting in
        // Gradio re-renders the .wrap-inner contents).
        const observer = new MutationObserver(() => makeTokensDraggable(dropdown));
        observer.observe(dropdown, {
            childList: true,
            subtree: true,
        });
        makeTokensDraggable(dropdown);
    }

    function scanAll() {
        document
            .querySelectorAll(DROPDOWN_SELECTOR)
            .forEach((dd) => setupDropdown(dd));
    }

    function boot() {
        scanAll();
        // Some Gradio components mount late — re-scan when the body changes.
        const docObserver = new MutationObserver(() => scanAll());
        docObserver.observe(document.body, {
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
