import { icon } from "./icons";
import { store } from "../storage";
import { t } from "../i18n";
import { t2 } from "../i18nExtra";
import { fmtCountdown, fmtInt } from "./dom";
import { soundEngine } from "../audio";

export function tt(key: string, param?: string | number): string {
  const lang = store.settings.language;
  const base = t(lang, key, param);
  if (base !== key) return base;
  return t2(lang, key, param);
}

export class TopBar {
  public el: HTMLElement;
  private timer = 0;

  constructor(private onOpen: (target: "shop" | "mailbox" | "profile" | "settings" | "attendance" | "gacha") => void) {
    this.el = document.createElement("header");
    this.el.className = "topbar";
    this.el.innerHTML = `
      <div class="brand">
        <div class="brand-logo">TT</div>
        <div class="brand-text">
          <strong>TapTube</strong>
          <span>REBORN 1.6.5</span>
        </div>
      </div>
      <div class="wallet">
        <button class="wallet-pill" data-open="shop" title="coins">
          <span class="wallet-ico coin">${icon("coin", 15)}</span>
          <b data-bind="coins">0</b>
          <i class="plus">+</i>
        </button>
        <button class="wallet-pill" data-open="shop" title="rubies">
          <span class="wallet-ico ruby">${icon("ruby", 15)}</span>
          <b data-bind="rubies">0</b>
          <i class="plus">+</i>
        </button>
        <button class="wallet-pill" data-open="profile" title="discs">
          <span class="wallet-ico disc">${icon("disc", 15)}</span>
          <b data-bind="discs">0</b>
          <i class="timer" data-bind="discTimer"></i>
        </button>
      </div>
      <div class="top-actions">
        <button class="icon-btn" data-open="attendance" title="attendance">${icon("gift", 19)}<em class="dot" data-bind="attDot"></em></button>
        <button class="icon-btn" data-open="mailbox" title="mail">${icon("mail", 19)}<em class="dot" data-bind="mailDot"></em></button>
        <button class="icon-btn" data-open="settings" title="settings">${icon("settings", 19)}</button>
        <button class="icon-btn avatar" data-open="profile" title="profile">${icon("user", 19)}</button>
      </div>
    `;
    this.el.querySelectorAll<HTMLElement>("[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundEngine.playUiClick(store.settings);
        this.onOpen(btn.dataset.open as any);
      });
    });
    this.refresh();
    this.timer = window.setInterval(() => this.refresh(), 1000);
  }

  public refresh(): void {
    const u = store.user;
    const set = (bind: string, value: string) => {
      const node = this.el.querySelector(`[data-bind="${bind}"]`);
      if (node) node.textContent = value;
    };
    set("coins", fmtInt(u.coins));
    set("rubies", fmtInt(u.rubies));
    set("discs", store.hasUnlimitedDiscs() ? "∞" : `${u.discs}`);
    const rem = store.tickDiscRecharge();
    set(
      "discTimer",
      store.hasUnlimitedDiscs()
        ? tt("unlimited_time")
        : u.discs >= u.maxDiscs
        ? ""
        : fmtCountdown(rem)
    );
    const mailDot = this.el.querySelector('[data-bind="mailDot"]');
    if (mailDot) mailDot.classList.toggle("show", u.mailbox.length > 0);
    const attDot = this.el.querySelector('[data-bind="attDot"]');
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    if (attDot) attDot.classList.toggle("show", u.lastAttendanceDate !== iso);
  }

  public destroy(): void {
    window.clearInterval(this.timer);
    this.el.remove();
  }
}
