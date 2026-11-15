/** Transient messages + modal overlays (dialog / bottom sheet). */

import { el } from "./util.js";
import { mountIcons } from "./icons.js";

let root;
let overlayRoot;
let hideTimer;

function hosts() {
  root ??= document.getElementById("toast-root");
  overlayRoot ??= document.getElementById("overlay-root");
  return { root, overlayRoot };
}

/**
 * @param {string} message
 * @param {{type?: "info"|"success"|"error", duration?: number}} [options]
 */
export function toast(message, options = {}) {
  const { type = "info", duration = 2600 } = options;
  const host = hosts().root;
  if (!host) return;
  const node = el(
    "div",
    { class: `toast toast--${type}`, role: "status" },
    message,
  );
  host.append(node);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
    setTimeout(() => node.remove(), 220);
  }, duration);
}

/**
 * Open a modal. Returns a promise resolved with the action id (or `null` when
 * dismissed with Escape / a backdrop click).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {Node|string} [options.body]
 * @param {Array<{id:string,label:string,variant?:string}>} [options.actions]
 * @param {boolean} [options.sheet] render as a bottom sheet (mobile pickers)
 * @param {(close:(value?:string)=>void)=>void} [options.onMount]
 */
export function openDialog(options) {
  const {
    title,
    body,
    actions = [],
    sheet = false,
    onMount,
    dismissible = true,
  } = options;
  const host = hosts().overlayRoot;
  if (!host) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const close = (value = null) => {
      if (settled) return;
      settled = true;
      overlay.classList.remove("is-open");
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    };

    const overlay = el("div", {
      class: `overlay${sheet ? " overlay--sheet" : ""} is-open`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
    });

    const dialog = el("div", { class: "dialog" });
    dialog.append(el("h2", {}, title));
    if (body) {
      const bodyNode = el("div", { class: "dialog__body" });
      if (typeof body === "string")
        bodyNode.append(el("p", { class: "hint" }, body));
      else bodyNode.append(body);
      dialog.append(bodyNode);
    }

    if (actions.length > 0) {
      const actionRow = el("div", { class: "dialog__actions" });
      for (const action of actions) {
        actionRow.append(
          el(
            "button",
            {
              type: "button",
              class: `btn ${action.variant === "primary" ? "btn--primary" : action.variant === "teal" ? "btn--teal" : action.variant === "danger" ? "btn--danger" : "btn--ghost"}`,
              onclick: () => close(action.id),
            },
            action.label,
          ),
        );
      }
      dialog.append(actionRow);
    }

    overlay.append(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && dismissible) close(null);
    });

    const onKey = (event) => {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        close(null);
      }
    };
    document.addEventListener("keydown", onKey);

    host.append(overlay);
    mountIcons(dialog);
    onMount?.(close);
    dialog.querySelector("button, input, select")?.focus?.();
  });
}

/** Confirm dialog with translated strings supplied by the caller. */
export async function confirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
}) {
  const result = await openDialog({
    title,
    body: message,
    actions: [
      { id: "cancel", label: cancelLabel, variant: "ghost" },
      { id: "confirm", label: confirmLabel, variant: "danger" },
    ],
  });
  return result === "confirm";
}

export function closeAllOverlays() {
  hosts().overlayRoot?.replaceChildren();
}
