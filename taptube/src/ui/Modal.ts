import { icon } from "./icons";
import { tt } from "./TopBar";
import { esc } from "./dom";
import { soundEngine } from "../audio";
import { store } from "../storage";

export interface SheetButton {
  label: string;
  value?: string;
  kind?: "primary" | "ghost" | "danger";
  onClick?: () => void;
}

export class Modal {
  private backdrop: HTMLElement;
  private card: HTMLElement;

  constructor(
    title: string,
    contentHtml: string,
    options: {
      wide?: boolean;
      buttons?: SheetButton[];
      onClose?: () => void;
      dismissible?: boolean;
    } = {}
  ) {
    this.backdrop = document.createElement("div");
    this.backdrop.className = "modal-backdrop";
    this.backdrop.innerHTML = `
      <div class="modal-card ${options.wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn modal-close">${icon("close", 18)}</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>
    `;
    this.card = this.backdrop.querySelector(".modal-card") as HTMLElement;
    const body = this.backdrop.querySelector(".modal-body") as HTMLElement;
    body.innerHTML = contentHtml;

    const foot = this.backdrop.querySelector(".modal-foot") as HTMLElement;
    const buttons = options.buttons ?? [{ label: tt("btn_close"), kind: "ghost" as const }];
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = `btn ${b.kind ?? "ghost"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        soundEngine.playUiClick(store.settings);
        if (b.onClick) b.onClick();
        this.close();
      });
      foot.appendChild(btn);
    });

    const dismissible = options.dismissible !== false;
    (this.backdrop.querySelector(".modal-close") as HTMLElement).addEventListener(
      "click",
      () => {
        soundEngine.playUiClick(store.settings);
        this.close();
      }
    );
    if (dismissible) {
      this.backdrop.addEventListener("click", (e) => {
        if (e.target === this.backdrop) this.close();
      });
    }
    this.onClose = options.onClose;
    document.body.appendChild(this.backdrop);
    requestAnimationFrame(() => this.backdrop.classList.add("show"));
  }

  private onClose?: () => void;

  public body(): HTMLElement {
    return this.card.querySelector(".modal-body") as HTMLElement;
  }

  public close(): void {
    this.backdrop.classList.remove("show");
    window.setTimeout(() => this.backdrop.remove(), 180);
    this.onClose?.();
  }
}

export function toast(message: string, kind: "info" | "ok" | "warn" = "info"): void {
  let host = document.querySelector(".toast-host") as HTMLElement | null;
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = `toast ${kind}`;
  item.textContent = message;
  host.appendChild(item);
  requestAnimationFrame(() => item.classList.add("show"));
  window.setTimeout(() => {
    item.classList.remove("show");
    window.setTimeout(() => item.remove(), 220);
  }, 2400);
}

export function confirmDialog(title: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const modal = new Modal(title, `<p class="modal-text">${esc(body)}</p>`, {
      buttons: [
        {
          label: tt("btn_cancel"),
          kind: "ghost",
          onClick: () => {
            decided = true;
            resolve(false);
          },
        },
        {
          label: tt("btn_ok"),
          kind: "primary",
          onClick: () => {
            decided = true;
            resolve(true);
          },
        },
      ],
      onClose: () => {
        if (!decided) resolve(false);
      },
    });
    void modal;
  });
}
