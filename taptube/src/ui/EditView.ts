import { store } from "../storage";
import { EditorEngine, EditorTool } from "../engine/EditorEngine";
import { soundEngine } from "../audio";
import { ChartNote, LineCount, YtItem } from "../types";
import { icon } from "./icons";
import { esc, fmtInt } from "./dom";
import { tt } from "./TopBar";
import { t } from "../i18n";
import { toast } from "./Modal";

export class EditView {
  public el: HTMLElement;
  private engine: EditorEngine | null = null;
  private canvas!: HTMLCanvasElement;
  private tickTimer = 0;

  constructor(
    private song: YtItem,
    private lines: LineCount,
    private existingId: string | undefined,
    private onExit: (result: { saved: boolean; chartId?: string }) => void,
    private onTestPlay: (notes: ChartNote[], startMs: number, endMs: number) => void
  ) {
    this.el = document.createElement("section");
    this.el.className = "edit-view portrait";
    this.render();
    this.boot();
  }

  private render(): void {
    const existing = this.existingId
      ? store.user.customCharts.find((c) => c.id === this.existingId)
      : undefined;
    const startMs = existing?.startMs ?? 0;
    const endMs =
      existing?.endMs ?? Math.max(30000, (this.song.durationSec || 180) * 1000);

    this.el.innerHTML = `
      <div class="edit-head">
        <button class="icon-btn" data-back>${icon("back", 18)}</button>
        <div class="edit-title">
          <strong>${esc(existing?.title ?? t(store.settings.language, "editor_title"))}</strong>
          <span>${esc(this.song.title.slice(0, 40))}</span>
        </div>
        <button class="icon-btn" data-test>${icon("play", 18)}</button>
        <button class="icon-btn" data-save>${icon("check", 18)}</button>
      </div>
      <canvas class="edit-canvas" data-canvas></canvas>
      <div class="edit-tools">
        <div class="et-row">
          <div class="seg">
            ${(["tap", "long", "slide"] as EditorTool[])
              .map(
                (tool) =>
                  `<button class="seg-btn ${tool === "tap" ? "on" : ""}" data-tool="${tool}">
                    ${esc(tool === "tap" ? t(store.settings.language, "note_double") : tool === "long" ? t(store.settings.language, "note_long") : t(store.settings.language, "note_slide"))}
                  </button>`
              )
              .join("")}
          </div>
          <button class="btn tiny ghost" data-rec>${icon("note", 13)} REC</button>
        </div>
        <div class="et-slider">
          <span>${esc(tt("playback_speed"))}</span>
          <input class="range" type="range" min="0" max="100" value="38" data-seek />
          <b data-seek-label>0.00s</b>
        </div>
        <div class="et-meta">
          <span>${icon("note", 12)} <b data-note-count>0</b></span>
          <span>NPM <b data-npm>0</b></span>
          <span>BPM <b data-bpm>128</b></span>
          <button class="btn tiny ghost" data-auto>${icon("refresh", 12)} AUTO</button>
          <button class="btn tiny ghost danger" data-clear>${icon("trash", 12)}</button>
        </div>
        <p class="editor-hint">${esc(tt("editor_tip"))}</p>
      </div>
    `;

    this.canvas = this.el.querySelector("[data-canvas]") as HTMLCanvasElement;
    this.el.querySelector("[data-back]")?.addEventListener("click", () => this.exit());
    this.el.querySelector("[data-save]")?.addEventListener("click", () => this.save());
    this.el.querySelector("[data-test]")?.addEventListener("click", () => this.testPlay());
    this.el.querySelectorAll<HTMLElement>("[data-tool]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!this.engine) return;
        this.engine.tool = b.dataset.tool as EditorTool;
        this.el
          .querySelectorAll("[data-tool]")
          .forEach((n) => n.classList.toggle("on", n === b));
      })
    );
    this.el.querySelector("[data-rec]")?.addEventListener("click", (e) => {
      if (!this.engine) return;
      const playing = this.engine.togglePlay();
      (e.currentTarget as HTMLElement).classList.toggle("rec-on", playing);
    });
    this.el.querySelector("[data-auto]")?.addEventListener("click", () => {
      if (!this.engine) return;
      this.engine.autoGenerate("hard");
      soundEngine.playRewardChime(store.settings, "coin");
      this.refreshMeta();
    });
    this.el.querySelector("[data-clear]")?.addEventListener("click", () => {
      this.engine?.clearAll();
      this.refreshMeta();
    });

    void startMs;
    void endMs;
  }

  private boot(): void {
    const existing = this.existingId
      ? store.user.customCharts.find((c) => c.id === this.existingId)
      : undefined;
    const startMs = existing?.startMs ?? 0;
    const endMs =
      existing?.endMs ?? Math.max(30000, (this.song.durationSec || 180) * 1000);

    this.engine = new EditorEngine(
      this.canvas,
      this.song,
      this.lines,
      startMs,
      endMs,
      existing?.notes
    );
    this.engine.start();
    this.refreshMeta();

    const seek = this.el.querySelector<HTMLInputElement>("[data-seek]");
    seek?.addEventListener("input", () => {
      if (!this.engine) return;
      const pct = Number(seek.value) / 100;
      this.engine.setPlayhead(
        this.engine.startMs + (this.engine.endMs - this.engine.startMs) * pct
      );
      this.refreshMeta();
    });

    this.tickTimer = window.setInterval(() => {
      if (!this.engine) return;
      this.refreshMeta();
    }, 220);
  }

  private refreshMeta(): void {
    if (!this.engine) return;
    const set = (sel: string, v: string) => {
      const n = this.el.querySelector(sel);
      if (n) n.textContent = v;
    };
    set("[data-note-count]", fmtInt(this.engine.notes.length));
    set("[data-npm]", String(this.engine.getNpm()));
    set("[data-bpm]", String(Math.round(this.engine.bpm)));
    const label = this.el.querySelector("[data-seek-label]");
    if (label) label.textContent = `${(this.engine.playheadMs / 1000).toFixed(2)}s`;
    const seek = this.el.querySelector<HTMLInputElement>("[data-seek]");
    if (seek) {
      const span = Math.max(1, this.engine.endMs - this.engine.startMs);
      seek.value = String(
        Math.round(((this.engine.playheadMs - this.engine.startMs) / span) * 100)
      );
    }
  }

  private testPlay(): void {
    if (!this.engine) return;
    if (this.engine.getNpm() < 1) {
      toast(tt("npm_low"), "warn");
      return;
    }
    this.onTestPlay(
      [...this.engine.notes],
      this.engine.startMs,
      this.engine.endMs
    );
  }

  private save(): void {
    if (!this.engine) return;
    const npm = this.engine.getNpm();
    if (npm < 30) {
      toast(tt("npm_low"), "warn");
      return;
    }
    const existing = this.existingId
      ? store.user.customCharts.find((c) => c.id === this.existingId)
      : undefined;
    const chart = this.engine.buildChart({
      id: existing?.id,
      title: existing?.title ?? `${this.song.title.slice(0, 22)} [${this.lines}K]`,
      author: store.user.nickname,
    });
    if (existing) {
      const idx = store.user.customCharts.findIndex((c) => c.id === existing.id);
      if (idx >= 0) store.user.customCharts[idx] = { ...chart, isMine: true };
    } else {
      store.user.customCharts.unshift({ ...chart, isMine: true });
    }
    store.save();
    soundEngine.playRewardChime(store.settings, "coin");
    toast(tt("saved_ok"), "ok");
    this.onExit({ saved: true, chartId: chart.id });
  }

  private exit(): void {
    if (this.engine && this.engine.notes.length) {
      store.user.tempEditorDraft = {
        video: this.song,
        lines: this.lines,
        startMs: this.engine.startMs,
        endMs: this.engine.endMs,
        notes: [...this.engine.notes],
        title: this.song.title,
        savedAt: Date.now(),
      };
      store.save();
    }
    this.engine?.dispose();
    this.engine = null;
    window.clearInterval(this.tickTimer);
    this.onExit({ saved: false });
  }

  public destroy(): void {
    this.engine?.dispose();
    this.engine = null;
    window.clearInterval(this.tickTimer);
    this.el.remove();
  }
}
