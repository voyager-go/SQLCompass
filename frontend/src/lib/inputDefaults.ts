const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password"]);

function applyInputDefaults(element: HTMLInputElement) {
    if (!TEXT_INPUT_TYPES.has(element.type)) return;
    if (element.dataset.allowTextSuggestions === "true") return;

    element.setAttribute("autocomplete", "off");
    element.setAttribute("autocapitalize", "none");
    element.setAttribute("autocorrect", "off");
    element.setAttribute("spellcheck", "false");
    element.spellcheck = false;
}

function applyInputDefaultsIn(root: ParentNode) {
    if (root instanceof HTMLInputElement) {
        applyInputDefaults(root);
        return;
    }

    root.querySelectorAll("input").forEach((element) => {
        applyInputDefaults(element);
    });
}

export function installInputDefaults() {
    applyInputDefaultsIn(document);

    document.addEventListener("focusin", (event) => {
        if (event.target instanceof HTMLInputElement) {
            applyInputDefaults(event.target);
        }
    });

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    applyInputDefaultsIn(node);
                }
            });
        });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
}
