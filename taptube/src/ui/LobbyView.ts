import { store } from "../storage";
import { CURATED_SONGS, getRequiredExpForLevel } from "../constants";
import {
  LobbyTab,
  SearchCategory,
  SortMode,
  YtItem,
} from "../types";
import { searchYouTubeSongs, formatDuration } from "../youtube";
import { icon } from "./icons";
import { debounce, esc, flagOf, fmtInt, fmtTime, fmtViews } from "./dom";
import { Modal, toast } from "./Modal";
import { tt } from "./TopBar";
import { soundEngine } from "../audio";
import { t } from "../i18n";
import { t2 } from "../i18nExtra";

export interface LobbyHandlers {
  onSelectSong: (song: YtItem) => void;
  onOpenEditor: (song: YtItem, chartId?: string) => void;
  onWatchReplay: (replayId: string) => void;
}

const TABS: Array<{ id: LobbyTab; label: string; ico: string }> = [
  { id: "weekly", label: "tab_weekly", ico: "trophy" },
  { id: "search", label: "tab_search", ico: "search" },
  { id: "recommend", label: "tab_recommend", ico: "flame" },
  { id: "favorites", label: "tab_favorites", ico: "heart" },
  { id: "history", label: "tab_history", ico: "clock" },
  { id: "notebox", label: "tab_notebox", ico: "note" },
  { id: "ranking", label: "tab_ranking", ico: "star" },
];

export class LobbyView {
  public el: HTMLElement;
  private tab: LobbyTab = "weekly";
  private query = "";
  private category: SearchCategory = "all";
  private sort: SortMode = "popular";
  private results: YtItem[] = [];
  private searching = false;
  private searchError = false;
  private listHost!: HTMLElement;
  private bannerHost!: HTMLElement;

  constructor(private handlers: LobbyHandlers) {
    this.el = document.createElement("main");
    this.el.className = "lobby";
    this.render();
  }

  public setTab(tab: LobbyTab): void {
    this.tab = tab;
    this.render();
  }

  public destroy(): void {
    this.el.remove();
  }

  private render(): void {
    const lang = store.settings.language;
    try {
      store.checkDailyAttendance();
    } catch {
      /* ignore */
    }
    this.el.innerHTML = `
      <div class="lobby-inner">
        <section class="spotlight" data-host="banner"></section>
        <nav class="tabbar">
          ${TABS.map(
            (tb) => `
            <button class="tab ${tb.id === this.tab ? "active" : ""}" data-tab="${tb.id}">
              ${icon(tb.ico, 17)}
              <span>${esc(t(lang, tb.label))}</span>
            </button>`
          ).join("")}
        </nav>
        <section class="tab-content" data-host="content"></section>
      </div>
    `;
    this.bannerHost = this.el.querySelector('[data-host="banner"]') as HTMLElement;
    this.listHost = this.el.querySelector('[data-host="content"]') as HTMLElement;

    this.el.querySelectorAll<HTMLElement>("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        soundEngine.playSwitch(store.settings, true);
        this.tab = btn.dataset.tab as LobbyTab;
        this.results = [];
        this.searchError = false;
        this.render();
      });
    });

    this.renderBanner();
    this.renderContent();
  }

  private renderBanner(): void {
    const u = store.user;
    const need = getRequiredExpForLevel(u.level);
    const pct = Math.min(100, Math.round((u.exp / Math.max(1, need)) * 100));
    const feat = CURATED_SONGS[(u.level + new Date().getDate()) % CURATED_SONGS.length];
    this.bannerHost.innerHTML = `
      <div class="hero-card">
        <img class="hero-thumb" src="${esc(feat.thumbnail)}" alt="" loading="lazy" />
        <div class="hero-grad"></div>
        <div class="hero-body">
          <div class="hero-tag">${icon("flame", 13)} ${esc(tt("recommend_title"))}</div>
          <h2>${esc(feat.title)}</h2>
          <p>${esc(feat.channelTitle)} · ${fmtTime(feat.durationSec)}</p>
          <div class="hero-cta">
            <button class="btn primary" data-hero-play>${icon("play", 16)} ${esc(t(store.settings.language, "btn_ready"))}</button>
            <button class="btn ghost" data-hero-make>${icon("edit", 16)} ${esc(t(store.settings.language, "btn_make_note"))}</button>
          </div>
        </div>
      </div>
      <div class="profile-strip">
        <div class="ps-avatar">${icon("user", 20)}</div>
        <div class="ps-main">
          <div class="ps-row">
            <strong>${esc(u.nickname)}</strong>
            <span class="lv">Lv.${u.level}</span>
            <span class="ps-country">${flagOf(store.settings.countryCode)}</span>
          </div>
          <div class="ps-bar"><i style="width:${pct}%"></i></div>
          <div class="ps-sub">${fmtInt(u.exp)} / ${fmtInt(need)} EXP</div>
        </div>
        <div class="ps-stats">
          <span><b>${fmtInt(u.coins)}</b>${esc(tt("coins"))}</span>
          <span><b>${fmtInt(u.rubies)}</b>${esc(tt("rubies"))}</span>
        </div>
      </div>
    `;
    this.bannerHost
      .querySelector("[data-hero-play]")
      ?.addEventListener("click", () => this.handlers.onSelectSong(feat));
    this.bannerHost
      .querySelector("[data-hero-make]")
      ?.addEventListener("click", () => this.handlers.onOpenEditor(feat));
  }

  private renderContent(): void {
    switch (this.tab) {
      case "search":
        this.renderSearch();
        break;
      case "favorites":
        this.renderSongList(
          store.user.favorites,
          "empty_favorites",
          true,
          `+1 (${fmtInt(300)})`
        );
        break;
      case "history":
        this.renderSongList(store.user.history, "empty_history", true);
        break;
      case "notebox":
        this.renderNotebox();
        break;
      case "ranking":
        this.renderRanking();
        break;
      case "weekly":
      case "recommend":
      default:
        this.renderWeekly();
        break;
    }
  }

  private renderWeekly(): void {
    const weekSeed = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    const songs = [...CURATED_SONGS].sort((a, b) => {
      const ha = this.hash(`${a.videoId}:${weekSeed}`);
      const hb = this.hash(`${b.videoId}:${weekSeed}`);
      return ha - hb;
    });
    const featured = this.tab === "recommend" ? songs.slice().reverse() : songs;
    this.listHost.innerHTML = `
      <div class="section-head">
        <h3>${esc(tt(this.tab === "recommend" ? "recommend_title" : "weekly_best"))}</h3>
        <span class="muted">${featured.length} · ${esc(tt("hot_songs"))}</span>
      </div>
      <div class="card-grid">
        ${featured.slice(0, 12).map((s, i) => this.cardHtml(s, i)).join("")}
      </div>
    `;
    this.bindCards();
  }

  private renderSearch(): void {
    const lang = store.settings.language;
    this.listHost.innerHTML = `
      <div class="search-panel">
        <form class="search-row" data-search-form>
          <div class="search-input">
            ${icon("search", 18)}
            <input
              type="search"
              inputmode="search"
              autocomplete="off"
              enterkeyhint="search"
              placeholder="${esc(t(lang, "search_placeholder"))}"
              value="${esc(this.query)}"
              data-search-input
            />
            <button type="button" class="clear-btn" data-clear ${this.query ? "" : "hidden"}>${icon("close", 15)}</button>
          </div>
          <button class="btn primary search-go" type="submit">${esc(t(lang, "search_btn"))}</button>
        </form>
        <div class="chips">
          ${(["all", "music", "author"] as SearchCategory[])
            .map(
              (c) =>
                `<button class="chip ${this.category === c ? "on" : ""}" data-cat="${c}">${esc(
                  t(lang, `search_cat_${c}`)
                )}</button>`
            )
            .join("")}
          <span class="chip-sep"></span>
          ${(["popular", "newest", "npm"] as SortMode[])
            .map(
              (s) =>
                `<button class="chip ${this.sort === s ? "on" : ""}" data-sort="${s}">${esc(
                  tt(`sort_${s}`)
                )}</button>`
            )
            .join("")}
        </div>
        <div class="search-hint">${esc(tt("search_hint"))}</div>
      </div>
      <div data-host="results"></div>
    `;

    const form = this.listHost.querySelector("[data-search-form]") as HTMLFormElement;
    const input = this.listHost.querySelector("[data-search-input]") as HTMLInputElement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.query = input.value;
      void this.runSearch();
    });
    const debounced = debounce(() => {
      this.query = input.value;
      if (this.query.trim().length >= 2) void this.runSearch();
    }, 520);
    input.addEventListener("input", () => {
      const clear = this.listHost.querySelector("[data-clear]") as HTMLElement;
      clear.hidden = input.value.length === 0;
      debounced();
    });
    input.addEventListener("paste", () => {
      window.setTimeout(() => {
        this.query = input.value;
        void this.runSearch();
      }, 60);
    });
    this.listHost.querySelector("[data-clear]")?.addEventListener("click", () => {
      input.value = "";
      this.query = "";
      this.results = [];
      this.renderSearch();
      input.focus();
    });
    this.listHost.querySelectorAll<HTMLElement>("[data-cat]").forEach((b) => {
      b.addEventListener("click", () => {
        this.category = b.dataset.cat as SearchCategory;
        if (this.query.trim()) void this.runSearch();
        else this.renderSearch();
      });
    });
    this.listHost.querySelectorAll<HTMLElement>("[data-sort]").forEach((b) => {
      b.addEventListener("click", () => {
        this.sort = b.dataset.sort as SortMode;
        this.sortResults();
        this.renderResults();
      });
    });

    this.renderResults();
  }

  private sortResults(): void {
    if (this.sort === "popular") {
      this.results.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    } else if (this.sort === "newest") {
      this.results.sort(
        (a, b) =>
          new Date(b.publishedAt ?? 0).getTime() -
          new Date(a.publishedAt ?? 0).getTime()
      );
    } else {
      this.results.sort((a, b) => (b.bpm ?? 128) - (a.bpm ?? 128));
    }
  }

  private async runSearch(): Promise<void> {
    const q = this.query.trim();
    if (!q) return;
    this.searching = true;
    this.searchError = false;
    this.renderResults();
    try {
      const items = await searchYouTubeSongs(
        q,
        this.category,
        store.settings.countryCode,
        store.settings.youtubeApiKey
      );
      this.results = items;
      this.sortResults();
    } catch {
      this.searchError = true;
      this.results = [];
    } finally {
      this.searching = false;
      this.renderResults();
    }
  }

  private renderResults(): void {
    const host = this.listHost.querySelector('[data-host="results"]') as HTMLElement | null;
    if (!host) return;
    if (this.searching) {
      host.innerHTML = `
        <div class="skeleton-list">
          ${Array.from({ length: 6 })
            .map(
              () => `
            <div class="sk-row">
              <div class="sk-thumb"></div>
              <div class="sk-lines"><i></i><i></i><i></i></div>
            </div>`
            )
            .join("")}
        </div>`;
      return;
    }
    if (!this.results.length) {
      host.innerHTML = `
        <div class="empty-state">
          ${icon(this.searchError ? "info" : "youtube", 42)}
          <p>${esc(
            this.searchError
              ? tt("search_failed")
              : this.query
              ? t(store.settings.language, "empty_no_result")
              : t(store.settings.language, "empty_search")
          )}</p>
        </div>`;
      return;
    }
    host.innerHTML = `
      <div class="section-head"><h3>${esc(tt("search_cat_all"))} · ${this.results.length}</h3></div>
      <div class="song-list">
        ${this.results.map((s) => this.rowHtml(s)).join("")}
      </div>
    `;
    this.bindCards();
  }

  private renderSongList(
    songs: YtItem[],
    emptyKey: string,
    allowExtend = false,
    extendLabel?: string
  ): void {
    const lang = store.settings.language;
    this.listHost.innerHTML = `
      <div class="section-head">
        <h3>${esc(t(lang, this.tab === "favorites" ? "tab_favorites" : "tab_history"))}</h3>
        <span class="muted">${songs.length} / ${
      this.tab === "favorites" ? store.user.favoriteSlots : store.user.historySlots
    }</span>
      </div>
      ${
        songs.length
          ? `<div class="song-list">${songs.map((s) => this.rowHtml(s)).join("")}</div>`
          : `<div class="empty-state">${icon("heart", 40)}<p>${esc(t(lang, emptyKey))}</p></div>`
      }
      ${
        allowExtend
          ? `<button class="btn ghost wide-btn" data-extend>${icon("plus", 16)} ${esc(extendLabel ?? t(lang, "btn_extend_slot"))}</button>`
          : ""
      }
    `;
    this.bindCards();
    this.listHost.querySelector("[data-extend]")?.addEventListener("click", () => {
      const type = this.tab === "favorites" ? "favorites" : "history";
      if (store.extendSlots(type, 300)) {
        soundEngine.playRewardChime(store.settings, "coin");
        this.renderContent();
      } else {
        toast(tt("not_enough_coin"), "warn");
      }
    });
  }

  private renderNotebox(): void {
    const charts = store.user.customCharts;
    const replays = store.user.replays.slice(0, 20);
    this.listHost.innerHTML = `
      <div class="section-head">
        <h3>${esc(t(store.settings.language, "tab_notebox"))}</h3>
        <span class="muted">${charts.length} ${esc(tt("chart_public"))}</span>
      </div>
      ${
        charts.length
          ? `<div class="chart-grid">${charts
              .map(
                (c) => `
            <article class="chart-card" data-chart="${esc(c.id)}">
              <div class="cc-thumb">
                <img src="${esc(c.videoThumbnail)}" alt="" loading="lazy" />
                <span class="cc-lines">${c.lines}K</span>
              </div>
              <div class="cc-body">
                <strong>${esc(c.title)}</strong>
                <span class="muted">${esc(c.videoTitle.slice(0, 42))}</span>
                <div class="cc-meta">
                  <span>${esc(tt("chart_npm"))} <b>${c.npm}</b></span>
                  <span>${icon("star", 12)} ${c.ratingCount ? (c.ratingSum / c.ratingCount).toFixed(1) : "-"}</span>
                  <span>${icon("play", 11)} ${c.playCount}</span>
                </div>
                <div class="cc-actions">
                  <button class="btn tiny primary" data-play-chart="${esc(c.id)}">${icon("play", 13)} ${esc(tt("play_now"))}</button>
                  <button class="btn tiny ghost" data-edit-chart="${esc(c.id)}">${icon("edit", 13)}</button>
                  <button class="btn tiny ghost danger" data-del-chart="${esc(c.id)}">${icon("trash", 13)}</button>
                </div>
              </div>
            </article>`
              )
              .join("")}</div>`
          : `<div class="empty-state">${icon("note", 40)}<p>${esc(
              t(store.settings.language, "empty_notebox")
            )}</p></div>`
      }
      <div class="section-head spaced">
        <h3>${esc(tt("replay_badge"))}</h3>
        <span class="muted">${replays.length}</span>
      </div>
      ${
        replays.length
          ? `<div class="replay-list">${replays
              .map(
                (r) => `
            <button class="replay-row" data-replay="${esc(r.id)}">
              <img src="${esc(r.videoThumbnail)}" alt="" loading="lazy" />
              <span class="rr-main">
                <b>${esc(r.videoTitle.slice(0, 46))}</b>
                <em>${esc(r.playerName || store.user.nickname)} · ${flagOf(r.country)} · ${fmtInt(r.score)}</em>
              </span>
              <span class="grade grade-${r.grade.toLowerCase()}">${r.grade}</span>
              ${icon("play", 15)}
            </button>`
              )
              .join("")}</div>`
          : `<div class="empty-state">${icon("clock", 36)}<p>${esc(tt("no_replays"))}</p></div>`
      }
    `;

    this.listHost.querySelectorAll<HTMLElement>("[data-play-chart]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const chart = store.user.customCharts.find(
          (c) => c.id === b.dataset.playChart
        );
        if (!chart) return;
        this.handlers.onSelectSong({
          videoId: chart.videoId,
          title: chart.videoTitle,
          channelTitle: chart.videoChannel,
          durationSec: chart.videoDurationSec,
          thumbnail: chart.videoThumbnail,
        });
      });
    });
    this.listHost.querySelectorAll<HTMLElement>("[data-edit-chart]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const chart = store.user.customCharts.find(
          (c) => c.id === b.dataset.editChart
        );
        if (!chart) return;
        this.handlers.onOpenEditor(
          {
            videoId: chart.videoId,
            title: chart.videoTitle,
            channelTitle: chart.videoChannel,
            durationSec: chart.videoDurationSec,
            thumbnail: chart.videoThumbnail,
          },
          chart.id
        );
      });
    });
    this.listHost.querySelectorAll<HTMLElement>("[data-del-chart]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = b.dataset.delChart!;
        const modal = new Modal(tt("confirm_delete"), `<p class="modal-text">${esc(
          store.user.customCharts.find((c) => c.id === id)?.title ?? ""
        )}</p>`, {
          buttons: [
            { label: tt("btn_cancel"), kind: "ghost" },
            {
              label: tt("btn_ok"),
              kind: "danger",
              onClick: () => {
                store.user.customCharts = store.user.customCharts.filter(
                  (c) => c.id !== id
                );
                store.save();
                this.renderContent();
              },
            },
          ],
        });
        void modal;
      });
    });
    this.listHost.querySelectorAll<HTMLElement>("[data-replay]").forEach((b) => {
      b.addEventListener("click", () =>
        this.handlers.onWatchReplay(b.dataset.replay!)
      );
    });
  }

  private renderRanking(): void {
    const all = [...store.user.replays];
    // Add seeded global entries from starter replays already in memory
    const unique = new Map<string, typeof all[number]>();
    for (const r of all) unique.set(r.id, r);
    const list = [...unique.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    const meBest = list.find((r) => r.playerName === store.user.nickname);

    this.listHost.innerHTML = `
      <div class="section-head">
        <h3>${esc(tt("ranking_title"))}</h3>
        <span class="muted">${flagOf(store.settings.countryCode)} ${esc(
      tt("ranking_global")
    )}</span>
      </div>
      <div class="rank-list">
        ${list
          .map(
            (r, i) => `
          <div class="rank-row ${r.playerName === store.user.nickname ? "mine" : ""}">
            <span class="rank-pos p${i < 3 ? i + 1 : ""}">${i + 1}</span>
            <img src="${esc(r.videoThumbnail)}" alt="" loading="lazy" />
            <span class="rank-main">
              <b>${esc(r.videoTitle.slice(0, 40))}</b>
              <em>${esc(r.playerName)} ${flagOf(r.country)} · ${r.lines}K · ${r.difficulty.toUpperCase()}</em>
            </span>
            <span class="rank-score">
              <b>${fmtInt(r.score)}</b>
              <span class="grade grade-${r.grade.toLowerCase()}">${r.grade}</span>
            </span>
          </div>`
          )
          .join("")}
      </div>
      <div class="my-rank">
        ${icon("user", 16)}
        <span>${esc(tt("my_rank"))}</span>
        <b>${meBest ? `#${list.indexOf(meBest) + 1}` : "-"}</b>
        <span class="muted">${meBest ? fmtInt(meBest.score) : ""}</span>
      </div>
    `;
  }

  private cardHtml(song: YtItem, idx: number): string {
    const rec = store.user.records[song.videoId];
    const diffLabel = idx % 3 === 0 ? "HARD" : idx % 3 === 1 ? "NORMAL" : "EXTREME";
    return `
      <article class="song-card" data-video="${esc(song.videoId)}">
        <div class="sc-thumb">
          <img src="${esc(song.thumbnail)}" alt="" loading="lazy" />
          <span class="sc-duration">${formatDuration(song.durationSec)}</span>
          <span class="sc-diff d-${diffLabel.toLowerCase()}">${diffLabel}</span>
          <button class="sc-fav ${store.isFavorite(song.videoId) ? "on" : ""}" data-fav="${esc(song.videoId)}">${icon("heart", 14)}</button>
          ${rec ? `<span class="sc-best ${rec.bestGrade}">${rec.bestGrade}</span>` : ""}
        </div>
        <div class="sc-body">
          <strong>${esc(song.title)}</strong>
          <span class="muted">${esc(song.channelTitle)}${song.viewCount ? ` · ${fmtViews(song.viewCount)}` : ""}</span>
          <div class="sc-foot">
            <button class="btn tiny primary" data-play="${esc(song.videoId)}">${icon("play", 12)} ${esc(t(store.settings.language, "btn_ready"))}</button>
            <button class="btn tiny ghost" data-make="${esc(song.videoId)}">${icon("edit", 12)}</button>
          </div>
        </div>
      </article>`;
  }

  private rowHtml(song: YtItem): string {
    const rec = store.user.records[song.videoId];
    return `
      <article class="song-row" data-video="${esc(song.videoId)}">
        <img class="sr-thumb" src="${esc(song.thumbnail)}" alt="" loading="lazy" />
        <div class="sr-main">
          <strong>${esc(song.title)}</strong>
          <span class="muted">${esc(song.channelTitle)} · ${fmtTime(song.durationSec)}${
      rec ? ` · ${icon("star", 11)} ${rec.bestScore.toLocaleString("en-US")}` : ""
    }</span>
        </div>
        <div class="sr-actions">
          <button class="icon-btn small" data-play="${esc(song.videoId)}">${icon("play", 16)}</button>
          <button class="icon-btn small" data-make="${esc(song.videoId)}">${icon("edit", 15)}</button>
          <button class="icon-btn small ${store.isFavorite(song.videoId) ? "active" : ""}" data-fav="${esc(song.videoId)}">${icon("heart", 15)}</button>
        </div>
      </article>`;
  }

  private findSong(videoId: string): YtItem | null {
    const pools = [
      this.results,
      store.user.favorites,
      store.user.history,
      CURATED_SONGS,
      store.user.customCharts.map((c) => ({
        videoId: c.videoId,
        title: c.videoTitle,
        channelTitle: c.videoChannel,
        durationSec: c.videoDurationSec,
        thumbnail: c.videoThumbnail,
      })),
    ];
    for (const pool of pools) {
      const found = pool.find((s) => s.videoId === videoId);
      if (found) return found;
    }
    return null;
  }

  private bindCards(): void {
    this.el.querySelectorAll<HTMLElement>("[data-play]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const song = this.findSong(b.dataset.play!);
        if (song) {
          soundEngine.playUiClick(store.settings);
          this.handlers.onSelectSong(song);
        }
      });
    });
    this.el.querySelectorAll<HTMLElement>("[data-make]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const song = this.findSong(b.dataset.make!);
        if (song) this.handlers.onOpenEditor(song);
      });
    });
    this.el.querySelectorAll<HTMLElement>("[data-fav]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const song = this.findSong(b.dataset.fav!);
        if (!song) return;
        const res = store.toggleFavorite(song);
        if (res.slotFull) {
          toast(tt("toast_slot_full"), "warn");
          return;
        }
        toast(res.added ? tt("toast_added_fav") : tt("toast_removed_fav"), "ok");
        if (this.tab === "favorites") this.renderContent();
        else {
          b.classList.toggle("on", res.added);
          b.classList.toggle("active", res.added);
        }
      });
    });
    this.el.querySelectorAll<HTMLElement>(".song-row, .song-card").forEach((card) => {
      card.addEventListener("click", () => {
        const song = this.findSong(card.dataset.video!);
        if (song) this.handlers.onSelectSong(song);
      });
    });
  }

  private hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  public refreshWallet(): void {
    this.renderBanner();
  }

  public unusedLangKey(): string {
    return t2(store.settings.language, "hot_songs");
  }
}
