import { store } from "../storage";
import { GameResultData } from "../types";
import { icon } from "./icons";
import { esc, fmtInt } from "./dom";
import { tt } from "./TopBar";
import { t } from "../i18n";
import { soundEngine } from "../audio";
import { openShareSheet } from "./Popups";

export class ResultView {
  public el: HTMLElement;

  constructor(
    private result: GameResultData,
    handlers: {
      onRetry: (watchReplay: boolean) => void;
      onLobby: () => void;
      onRanking: () => void;
    }
  ) {
    const r = this.result;
    const lang = store.settings.language;
    this.el = document.createElement("section");
    this.el.className = "result-view";

    const verdicts: Array<[string, number, string]> = [
      ["PERFECT", r.perfect, "perfect"],
      ["GREAT", r.great, "great"],
      ["COOL", r.cool, "cool"],
      ["GOOD", r.good, "good"],
      ["MISS", r.miss, "miss"],
    ];
    const maxV = Math.max(1, ...verdicts.map((v) => v[1]));

    this.el.innerHTML = `
      <div class="result-scroll">
        <div class="result-head">
          <button class="icon-btn" data-lobby>${icon("close", 18)}</button>
          <h2>${esc(t(lang, "result_title"))}</h2>
          <button class="icon-btn" data-share>${icon("share", 18)}</button>
        </div>

        <div class="grade-hero">
          <div class="grade-badge grade-${r.grade.toLowerCase()}" data-anim>
            ${r.grade}
          </div>
          ${r.isNewRecord ? `<span class="new-record">${icon("star", 12)} ${esc(tt("new_record"))}</span>` : ""}
          <div class="score-big" data-anim>${fmtInt(r.score)}</div>
          <div class="result-song">
            <img src="${esc(r.video.thumbnail)}" alt="" />
            <span>${esc(r.video.title.slice(0, 52))}</span>
          </div>
        </div>

        <div class="result-metrics">
          <div class="metric">
            <span>${esc(tt("accuracy"))}</span>
            <b>${r.hitRating.toFixed(2)}%</b>
          </div>
          <div class="metric">
            <span>${esc(tt("combo"))}</span>
            <b>${r.maxCombo}</b>
          </div>
          <div class="metric">
            <span>NPM</span>
            <b>${r.npm}</b>
          </div>
          <div class="metric">
            <span>${esc(tt("notes"))}</span>
            <b>${r.totalNotes}</b>
          </div>
        </div>

        <div class="verdict-list">
          ${verdicts
            .map(
              ([label, count, key]) => `
            <div class="verdict-row v-${key}">
              <span class="v-label">${label}</span>
              <div class="v-bar"><i style="width:${(count / maxV) * 100}%"></i></div>
              <b>${count}</b>
            </div>`
            )
            .join("")}
        </div>

        <div class="reward-row">
          <div class="reward coin">${icon("coin", 18)}<b>+${fmtInt(r.coinsEarned)}</b></div>
          <div class="reward exp">${icon("flame", 18)}<b>+${fmtInt(r.expEarned)} EXP</b></div>
          ${r.rubiesEarned > 0 ? `<div class="reward ruby">${icon("ruby", 18)}<b>+${r.rubiesEarned}</b></div>` : ""}
        </div>

        ${
          r.levelsGained > 0
            ? `<div class="levelup-strip">${icon("star", 15)} ${esc(tt("level_up"))} Lv.${r.newLevel}</div>`
            : ""
        }
        ${
          r.sGradeDailyTriggered
            ? `<div class="sgrade-strip">${icon("gift", 15)} ${esc(tt("s_daily"))}</div>`
            : ""
        }

        <div class="result-config">
          <span>${r.options.lines}K</span>
          <span>x${r.options.speed}</span>
          <span>${esc(t(lang, `diff_${r.options.difficulty}`))}</span>
          <span>${esc(tt("chart_badge"))}</span>
        </div>

        <div class="result-actions">
          <button class="btn primary" data-retry>${icon("refresh", 16)} ${esc(t(lang, "btn_retry"))}</button>
          ${
            r.replayRecord
              ? `<button class="btn ghost" data-watch>${icon("play", 15)} ${esc(t(lang, "btn_replay"))}</button>`
              : ""
          }
          <button class="btn ghost" data-rank>${icon("trophy", 15)} ${esc(t(lang, "btn_ranking"))}</button>
          <button class="btn ghost" data-lobby2>${icon("back", 15)} ${esc(t(lang, "btn_lobby"))}</button>
        </div>
      </div>
    `;

    this.el.querySelector("[data-lobby]")?.addEventListener("click", handlers.onLobby);
    this.el.querySelector("[data-lobby2]")?.addEventListener("click", handlers.onLobby);
    this.el.querySelector("[data-retry]")?.addEventListener("click", () =>
      handlers.onRetry(false)
    );
    this.el.querySelector("[data-watch]")?.addEventListener("click", () => {
      if (r.replayRecord) this.watchReplay(r.replayRecord.id, handlers);
    });
    this.el.querySelector("[data-rank]")?.addEventListener("click", handlers.onRanking);
    this.el.querySelector("[data-share]")?.addEventListener("click", () => {
      openShareSheet(
        r.video,
        `Score ${fmtInt(r.score)} · ${r.grade} · ${r.hitRating.toFixed(2)}% · ${r.maxCombo} combo`
      );
    });

    soundEngine.playRewardChime(
      store.settings,
      r.grade === "SSS" || r.grade === "SS" ? "s_grade" : "coin"
    );
  }

  private watchReplay(replayId: string, handlers: any): void {
    // Replays are launched from the lobby; delegate upward via custom event.
    this.el.dispatchEvent(
      new CustomEvent("taptube:watch-replay", {
        detail: replayId,
        bubbles: true,
      })
    );
    void handlers;
    void replayId;
  }

  public animateIn(): void {
    const badge = this.el.querySelector("[data-anim]");
    badge?.classList.add("in");
  }
}
