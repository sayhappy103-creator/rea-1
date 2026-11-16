import { generateBasicChart } from "../beatgen";
import { soundEngine } from "../audio";
import { store } from "../storage";
import {
  ChartNote,
  GamePlayOptions,
  GameResultData,
  NoteSpeed,
  YtItem,
} from "../types";
import { RhythmEngine, HudSnapshot } from "../engine/RhythmEngine";
import { YouTubePlayback } from "../playback";
import { NativeAudioPlayback, hasNativeAudio } from "../nativeAudio";
import { icon } from "./icons";
import { esc, fmtInt } from "./dom";
import { tt } from "./TopBar";
import { toast } from "./Modal";
import { t } from "../i18n";
import { openShareSheet } from "./Popups";
import { searchYouTubeSongs } from "../youtube";

export interface PlaySessionConfig {
  song: YtItem;
  options: GamePlayOptions;
  chartNotes: ChartNote[];
  bpm: number;
  replayId?: string;
}

export class PlayView {
  public el: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private videoLayer!: HTMLElement;
  private engine: RhythmEngine | null = null;
  private playback: YouTubePlayback | null = null;
  /** Real soundtrack via native MediaPlayer (Android). Takes priority. */
  private nativeAudio: NativeAudioPlayback | null = null;
  private paused = false;
  private hudTimer = 0;
  private lastBeatMs = 0;
  private countdownOverlay: HTMLElement | null = null;
  private metronomeOn = false;
  private finished = false;
  private lastCombo = 0;
  private usingSynth = false;
  private lastStallCheck = 0;
  private slideTimer = 0;

  constructor(
    private cfg: PlaySessionConfig,
    private onExit: (result: GameResultData | null) => void
  ) {
    this.el = document.createElement("section");
    this.el.className = `play-view ${cfg.options.orientation}`;
    this.render();
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("taptube:resume-audio", this.onVisibility);
    this.boot();
  }

  private render(): void {
    const opt = this.cfg.options;
    this.el.innerHTML = `
      <div class="play-stage">
        <div class="bg-layer" data-bg></div>
        <div class="video-layer" data-video></div>
        <div class="video-shade"></div>
        <canvas class="road-canvas" data-canvas></canvas>
        <div class="hud">
          <button class="hud-btn" data-pause>${icon("pause", 18)}</button>
          <div class="hud-score">
            <span>${esc(tt("score"))}</span>
            <b data-hud="score">0</b>
          </div>
          <div class="hud-right">
            <span class="hud-acc" data-hud="acc">100.0%</span>
            <button class="hud-btn" data-metro title="metronome">${icon("volume", 17)}</button>
          </div>
        </div>
        <div class="fever-bar" data-fever>
          ${Array.from({ length: 8 })
            .map((_, i) => `<i data-seg="${i}"></i>`)
            .join("")}
        </div>
        <div class="song-strip">
          <img src="${esc(this.cfg.song.thumbnail)}" alt="" />
          <span>${esc(this.cfg.song.title.slice(0, 50))}</span>
          <em data-hud="timer">0:00</em>
        </div>
        <div class="countdown" data-count hidden></div>
        <div class="embed-warning" data-warn hidden>
          <p>${esc(tt("embed_error"))}</p>
          <div class="warn-actions">
            <button class="btn tiny primary" data-alt-audio>${icon("search", 12)} ${esc(tt("find_alt"))}</button>
            <button class="btn tiny ghost" data-synth-mode>${icon("volume", 12)} ${esc(tt("btn_play_synth_mode"))}</button>
            <button class="btn tiny ghost" data-unmute>${icon("volume", 12)} ${esc(tt("btn_fix_sound"))}</button>
          </div>
        </div>
      </div>
      <div class="pause-overlay" data-pause-layer hidden>
        <div class="pause-card">
          <h3>${esc(t(store.settings.language, "pause_title"))}</h3>
          <div class="pause-stats">
            <span>${esc(tt("score"))} <b data-p="score">0</b></span>
            <span>${esc(tt("combo"))} <b data-p="combo">0</b></span>
            <span>${esc(tt("accuracy"))} <b data-p="acc">100%</b></span>
          </div>
          <div class="pause-speed">
            <label>${esc(t(store.settings.language, "opt_speed"))}</label>
            <div class="seg wrap" data-speed-row>
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                .map(
                  (s) =>
                    `<button class="seg-btn xs ${opt.speed === s ? "on" : ""}" data-set-speed="${s}">x${s}</button>`
                )
                .join("")}
            </div>
          </div>
          <div class="pause-sync">
            <label>${esc(tt("music_volume"))} <b data-music-val>${store.settings.musicVolume}%</b></label>
            <input class="range" type="range" min="0" max="100" value="${store.settings.musicVolume}" data-music-range />
          </div>
          <div class="pause-sync">
            <label>${esc(tt("note_sync"))} <b data-sync-val>${store.settings.noteSyncMs}ms</b></label>
            <input class="range" type="range" min="-400" max="400" step="10" value="${store.settings.noteSyncMs}" data-sync-range />
          </div>
          <div class="pause-actions">
            <button class="btn primary" data-resume>${icon("play", 16)} ${esc(tt("resume"))}</button>
            <button class="btn ghost" data-restart>${icon("refresh", 16)} ${esc(tt("restart"))}</button>
            <button class="btn ghost danger" data-quit>${icon("close", 16)} ${esc(tt("quit_game"))}</button>
          </div>
        </div>
      </div>
    `;
    this.canvas = this.el.querySelector("[data-canvas]") as HTMLCanvasElement;
    this.videoLayer = this.el.querySelector("[data-video]") as HTMLElement;
    this.applyVideoStyle();
    this.el.querySelector("[data-synth-mode]")?.addEventListener("click", () => {
      this.dismissWarning();
      this.engine?.enableSynthClock(true);
      this.nativeAudio?.destroy();
      this.nativeAudio = null;
      this.playback?.destroy();
      this.playback = null;
      (this.el.querySelector("[data-warn]") as HTMLElement).hidden = true;
    });
    this.el.querySelector("[data-alt-audio]")?.addEventListener("click", () => {
      void this.findAlternativeAudio();
    });
    this.el.querySelector("[data-unmute]")?.addEventListener("click", () => {
      soundEngine.unlock();
      store.updateSettings({
        musicVolume: Math.max(60, store.settings.musicVolume),
        videoVolume: Math.max(80, store.settings.videoVolume),
        gameFxVolume: Math.max(60, store.settings.gameFxVolume),
      });
      this.engine?.setMusicVolume(store.settings.musicVolume);
      this.nativeAudio?.setVolume(store.settings.videoVolume);
      this.nativeAudio?.ensureAudible();
      this.playback?.setVolume(store.settings.videoVolume);
      this.playback?.ensureAudible();
      if (!this.usingSynth) {
        this.usingSynth = false;
        this.engine?.enableSynthClock(!this.playback || this.playback.fallbackMode);
      }
      void this.playback?.play();
      toast(tt("sound_fixed"), "ok");
    });

    this.el.querySelector("[data-pause]")?.addEventListener("click", () => this.openPause());
    this.el.querySelector("[data-resume]")?.addEventListener("click", () => this.closePause());
    this.el.querySelector("[data-restart]")?.addEventListener("click", () => {
      this.closePause();
      this.restart();
    });
    this.el.querySelector("[data-quit]")?.addEventListener("click", () => this.quit());
    this.el.querySelector("[data-metro]")?.addEventListener("click", (e) => {
      this.metronomeOn = !this.metronomeOn;
      (e.currentTarget as HTMLElement).classList.toggle("on", this.metronomeOn);
    });
    this.el.querySelectorAll<HTMLElement>("[data-set-speed]").forEach((b) =>
      b.addEventListener("click", () => {
        const sp = Number(b.dataset.setSpeed) as NoteSpeed;
        this.cfg.options.speed = sp;
        this.engine?.setSpeed(sp);
        store.updateSettings({ speed: sp });
        this.el
          .querySelectorAll("[data-set-speed]")
          .forEach((n) => n.classList.toggle("on", n === b));
      })
    );
    const musicRange = this.el.querySelector<HTMLInputElement>("[data-music-range]");
    musicRange?.addEventListener("input", () => {
      const v = Number(musicRange.value);
      store.updateSettings({ musicVolume: v });
      this.engine?.setMusicVolume(v);
      this.nativeAudio?.setVolume(store.settings.videoVolume ?? 85);
      this.playback?.setVolume(this.nativeAudio ? 0 : store.settings.videoVolume ?? 85);
      const label = this.el.querySelector("[data-music-val]");
      if (label) label.textContent = `${v}%`;
    });
    const syncRange = this.el.querySelector<HTMLInputElement>("[data-sync-range]");
    syncRange?.addEventListener("input", () => {
      const v = Number(syncRange.value);
      store.updateSettings({ noteSyncMs: v });
      this.engine?.setNoteSyncMs(v);
      const label = this.el.querySelector("[data-sync-val]");
      if (label) label.textContent = `${v}ms`;
    });

    window.TapTubeNative?.setOrientation?.(this.cfg.options.orientation);
    window.TapTubeNative?.setImmersive?.(true);
    document.body.classList.add(
      this.cfg.options.orientation === "landscape" ? "landscape" : "portrait"
    );
  }

  private dismissWarning(): void {
    const warn = this.el.querySelector("[data-warn]") as HTMLElement;
    if (warn) warn.hidden = true;
  }

  private isWifiOnlyBlocked(): boolean {
    if (store.settings.streamingMode !== "wifi") return false;
    const conn = (navigator as any).connection;
    if (!conn || !conn.type) return false;
    return conn.type !== "wifi" && conn.type !== "ethernet";
  }

  private applyVideoStyle(): void {
    const s = store.settings;
    const zoom = Math.max(50, Math.min(100, s.videoZoom));
    const bright = Math.max(15, Math.min(100, s.videoBrightness));
    const scale = 1 + (100 - zoom) / 100;
    this.videoLayer.style.transform = `scale(${scale.toFixed(3)})`;
    this.videoLayer.style.filter = `brightness(${(bright / 100).toFixed(2)}) saturate(1.05)`;

    const bg = this.el.querySelector("[data-bg]") as HTMLElement;
    if (!bg) return;
    const mode = s.videoBgMode;
    if (mode === "image") {
      bg.style.backgroundImage = `url("${this.cfg.song.thumbnail}")`;
      bg.style.opacity = "0.55";
    } else if (mode === "slideshow") {
      const pool = [...store.user.favorites, ...store.user.history]
        .map((x) => x.thumbnail)
        .filter(Boolean);
      const thumbs = pool.length ? pool : [this.cfg.song.thumbnail];
      let i = 0;
      bg.style.backgroundImage = `url("${thumbs[0]}")`;
      bg.style.opacity = "0.5";
      this.slideTimer = window.setInterval(() => {
        i = (i + 1) % thumbs.length;
        bg.style.opacity = "0.18";
        window.setTimeout(() => {
          bg.style.backgroundImage = `url("${thumbs[i]}")`;
          bg.style.opacity = "0.5";
        }, 260);
      }, 6200);
    } else {
      bg.style.backgroundImage = "";
      bg.style.opacity = "0";
    }
  }

  private async findAlternativeAudio(): Promise<void> {
    this.dismissWarning();
    const query = `${this.cfg.song.title.replace(/\[.*?\]/g, "").trim()} audio`;
    try {
      const found = await searchYouTubeSongs(
        query,
        "music",
        store.settings.countryCode,
        store.settings.youtubeApiKey
      );
      const alt = found.find(
        (x) => x.videoId !== this.cfg.song.videoId && x.durationSec >= 45
      );
      if (!alt) {
        toast(tt("search_failed"), "warn");
        this.engine?.enableSynthClock(true);
        return;
      }
      this.cfg.song = alt;
      const layer = this.el.querySelector("[data-video]") as HTMLElement;
      if (hasNativeAudio()) {
        this.nativeAudio?.destroy();
        this.nativeAudio = new NativeAudioPlayback(alt, store.settings, window.TapTubeNative!);
        this.nativeAudio.onError(() => this.onNativeAudioFailed());
        this.nativeAudio.setVolume(store.settings.videoVolume ?? 85);
        await this.nativeAudio.prepare();
        if (!this.nativeAudio.fallbackMode) {
          this.nativeAudio.setVolume(store.settings.videoVolume ?? 85);
          await this.nativeAudio.play();
          this.usingSynth = false;
          this.engine?.enableSynthClock(false);
          this.dismissWarning();
          toast(`✓ ${alt.title.slice(0, 42)}`, "ok");
          return;
        }
        this.nativeAudio = null;
      }
      if (!this.playback) {
        this.playback = new YouTubePlayback(layer, alt, store.settings);
        this.playback.onError(() => {
          const warn = this.el.querySelector("[data-warn]") as HTMLElement;
          if (warn) warn.hidden = false;
          this.engine?.enableSynthClock(true);
        });
      }
      await this.playback.prepare();
      if (this.playback.fallbackMode) {
        this.engine?.enableSynthClock(true);
        toast(tt("embed_error"), "warn");
        return;
      }
      this.playback.setVolume(store.settings.videoVolume ?? 85);
      this.playback.ensureAudible();
      await this.playback.play();
      this.usingSynth = false;
      this.engine?.enableSynthClock(false);
      toast(`✓ ${alt.title.slice(0, 42)}`, "ok");
    } catch {
      toast(tt("search_failed"), "warn");
    }
  }

  private async boot(): Promise<void> {
    const song = this.cfg.song;
    store.addHistory(song);

    // Audio must be unlocked from this (user-initiated) navigation.
    soundEngine.unlock();

    const wantVideo = store.settings.videoBgMode === "video";
    const nativeOk = !this.isWifiOnlyBlocked() && hasNativeAudio();

    if (nativeOk) {
      // Guaranteed audio: native MediaPlayer stream (works even when the
      // YouTube iframe refuses to embed).
      this.nativeAudio = new NativeAudioPlayback(
        song,
        store.settings,
        window.TapTubeNative!
      );
      this.nativeAudio.setVolume(store.settings.videoVolume ?? 85);
      this.nativeAudio.onError(() => this.onNativeAudioFailed());
      void this.nativeAudio.prepare().then(() => {
        if (!this.nativeAudio || this.nativeAudio.fallbackMode) return;
        this.nativeAudio.setVolume(store.settings.videoVolume ?? 85);
        void this.nativeAudio.play();
        this.usingSynth = false;
        this.engine?.enableSynthClock(false);
      });
    }

    // The iframe is only used for the moving picture when native audio runs.
    const wantIframe = wantVideo && !this.isWifiOnlyBlocked();
    if (wantIframe) {
      this.playback = new YouTubePlayback(
        this.videoLayer,
        song,
        store.settings
      );
      this.playback.onError(() => this.onVideoUnavailable());
      if (this.nativeAudio) this.playback.setSoundEnabled(false);
      void this.playback.prepare().then(() => {
        const pb = this.playback;
        if (!pb) return;
        if (pb.fallbackMode) {
          this.onVideoUnavailable();
          return;
        }
        // The real song is audible: run the chart on the video clock and keep
        // the backing synth silent so the two never play on top of each other.
        if (!this.nativeAudio) {
          this.usingSynth = false;
          this.engine?.enableSynthClock(false);
        }
        // With native audio the iframe is visual-only: keep it muted so the two
        // soundtracks never overlap.
        pb.setVolume(this.nativeAudio ? 0 : store.settings.videoVolume ?? 85);
        pb.ensureAudible();
        void pb.seek(0);
        void pb.play();
        // Re-assert audibility once the player reports PLAYING.
        window.setTimeout(() => {
          if (this.playback && !this.playback.fallbackMode && !this.usingSynth) {
            this.playback.setVolume(store.settings.videoVolume ?? 85);
            this.playback.ensureAudible();
          }
        }, 900);
      });
    } else {
      this.videoLayer.style.display = "none";
      const bg = this.el.querySelector("[data-bg]") as HTMLElement;
      if (bg) {
        bg.style.backgroundImage = `url("${song.thumbnail}")`;
        bg.style.opacity = "0.55";
      }
    }
    if (!nativeOk && !wantIframe) {
      this.usingSynth = true;
      this.showSynthBadge();
    }

    const notes = this.cfg.chartNotes;
    this.engine = new RhythmEngine(
      this.canvas,
      song,
      notes,
      this.cfg.bpm,
      store.user.level,
      this.cfg.options,
      store.settings,
      () => this.primaryClockSeconds(),
      (hud) => this.updateHud(hud),
      (result) => this.complete(result)
    );
    this.engine.setMusicVolume(store.settings.musicVolume ?? 80);
    // Only start on the synth clock when nothing else can carry the song.
    this.engine.enableSynthClock(!nativeOk && (!wantIframe || this.usingSynth));

    this.showCountdown(3);
  }

  /** Video time only when the player is actually producing sound/frames. */
  private primaryClockSeconds(): number | null {
    if (this.nativeAudio && !this.nativeAudio.fallbackMode && !this.usingSynth) {
      const nt = this.nativeAudio.getCurrentTime();
      if (nt !== null && nt > 0) return nt;
    }
    if (!this.playback || this.playback.fallbackMode) return null;
    if (this.usingSynth) return null;
    const t = this.playback.getCurrentTime();
    return t !== null && t > 0 ? t : null;
  }

  private showSynthBadge(): void {
    const warn = this.el.querySelector("[data-warn]") as HTMLElement;
    if (warn) warn.hidden = false;
    const videoLayer = this.videoLayer;
    if (videoLayer) videoLayer.style.opacity = "0.35";
    this.engine?.enableSynthClock(true);
  }

  /** Native stream failed (private/region-blocked video) — try iframe, else synth. */
  private onNativeAudioFailed(): void {
    this.nativeAudio = null;
    if (this.playback && !this.playback.fallbackMode) {
      this.playback.setVolume(store.settings.videoVolume ?? 85);
      this.playback.ensureAudible();
      void this.playback.play();
      this.usingSynth = false;
      this.engine?.enableSynthClock(false);
      return;
    }
    // Keep the game audible right away with the synth groove; if the iframe
    // turns out to work we hand the clock back to the real song.
    this.showSynthBadge();
    const wantIframe = store.settings.videoBgMode === "video" && !this.isWifiOnlyBlocked();
    if (wantIframe && !this.playback) {
      this.playback = new YouTubePlayback(this.videoLayer, this.cfg.song, store.settings);
      this.playback.onError(() => this.onVideoUnavailable());
      void this.playback.prepare().then(() => {
        const pb = this.playback;
        if (!pb || pb.fallbackMode) {
          this.onVideoUnavailable();
          return;
        }
        this.usingSynth = false;
        this.engine?.enableSynthClock(false);
        pb.setVolume(store.settings.videoVolume ?? 85);
        pb.ensureAudible();
        void pb.seek(0);
        void pb.play();
      });
      return;
    }
    this.onVideoUnavailable();
  }

  private onVideoUnavailable(): void {
    this.usingSynth = true;
    this.showSynthBadge();
  }

  private showCountdown(from: number): void {
    const node = this.el.querySelector("[data-count]") as HTMLElement;
    this.countdownOverlay = node;
    node.hidden = false;
    let n = from;
    const step = () => {
      if (n > 0) {
        node.textContent = String(n);
        node.classList.remove("pop");
        void node.offsetWidth;
        node.classList.add("pop");
        soundEngine.playMetronome(false);
        n -= 1;
        window.setTimeout(step, 700);
      } else {
        node.textContent = "GO!";
        node.classList.add("pop");
        soundEngine.playMetronome(true);
        window.setTimeout(() => {
          node.hidden = true;
          this.beginPlay();
        }, 420);
      }
    };
    step();
  }

  private onVisibility = () => {
    if (document.visibilityState !== "visible" || this.paused || this.finished) return;
    soundEngine.unlock();
    if (this.nativeAudio && !this.nativeAudio.fallbackMode) {
      this.nativeAudio.play();
    }
    if (this.playback && !this.usingSynth) {
      this.playback.setVolume(store.settings.videoVolume ?? 85);
      this.playback.ensureAudible();
      void this.playback.play();
    }
  };

  private beginPlay(): void {
    this.finished = false;
    soundEngine.unlock();
    if (this.nativeAudio && !this.nativeAudio.fallbackMode) {
      this.nativeAudio.ensureAudible();
      void this.nativeAudio.play();
    }
    if (this.playback && !this.playback.fallbackMode) {
      this.playback.ensureAudible();
      void this.playback.play();
    }
    this.engine?.start();
    this.engine?.resume();
  }

  private restart(): void {
    this.engine?.destroy();
    this.engine = null;
    this.el.remove();
    // Handled by App: simplest is reload session through callback
    this.onExit(null);
  }

  private updateHud(hud: HudSnapshot): void {
    const score = this.el.querySelector('[data-hud="score"]');
    if (score) score.textContent = fmtInt(hud.score);
    const acc = this.el.querySelector('[data-hud="acc"]');
    if (acc) acc.textContent = `${hud.hitRating.toFixed(1)}%`;
    const timer = this.el.querySelector('[data-hud="timer"]');
    if (timer) {
      const s = Math.floor(hud.songTimeMs / 1000);
      timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    const feverHost = this.el.querySelector("[data-fever]");
    if (feverHost) {
      feverHost.setAttribute("data-stage", String(hud.feverStage));
      feverHost.querySelectorAll<HTMLElement>("[data-seg]").forEach((seg, i) => {
        seg.classList.toggle("on", i < hud.feverSegmentFill || hud.feverStage >= 5);
      });
    }
    this.lastCombo = hud.combo;
    const now = performance.now();
    if (
      this.nativeAudio &&
      !this.usingSynth &&
      !this.paused &&
      now - this.lastStallCheck > 1200
    ) {
      this.lastStallCheck = now;
      if (this.nativeAudio.isStalled(hud.songTimeMs)) {
        this.nativeAudio = null;
        if (this.playback && !this.playback.fallbackMode) {
          this.playback.setVolume(store.settings.videoVolume ?? 85);
          this.playback.ensureAudible();
          void this.playback.play();
        } else {
          this.usingSynth = true;
          this.showSynthBadge();
        }
      } else {
        this.nativeAudio.ensureAudible();
      }
      return;
    }
    if (
      this.playback &&
      !this.usingSynth &&
      !this.paused &&
      now - this.lastStallCheck > 1200
    ) {
      this.lastStallCheck = now;
      if (this.playback.isStalled(hud.songTimeMs)) {
        this.usingSynth = true;
        this.showSynthBadge();
      } else {
        this.playback.ensureAudible();
      }
    }
    const beatMs = 60000 / Math.max(60, this.cfg.bpm);
    if (
      this.metronomeOn &&
      this.cfg.options.isTestPlay === undefined &&
      now - this.lastBeatMs > beatMs - 24
    ) {
      this.lastBeatMs = now;
      soundEngine.playMetronome(false);
    }
  }

  private openPause(): void {
    if (this.finished || this.paused) return;
    this.paused = true;
    this.engine?.pause();
    this.nativeAudio?.pause();
    this.playback?.pause();
    const layer = this.el.querySelector("[data-pause-layer]") as HTMLElement;
    layer.hidden = false;
    requestAnimationFrame(() => layer.classList.add("show"));
    const ps = this.el.querySelector('[data-p="score"]');
    const pc = this.el.querySelector('[data-p="combo"]');
    const pa = this.el.querySelector('[data-p="acc"]');
    const scoreNode = this.el.querySelector('[data-hud="score"]');
    const accNode = this.el.querySelector('[data-hud="acc"]');
    if (ps && scoreNode) ps.textContent = scoreNode.textContent ?? "0";
    if (pa && accNode) pa.textContent = accNode.textContent ?? "100%";
    if (pc) pc.textContent = String(this.lastCombo);
  }

  private closePause(): void {
    this.paused = false;
    soundEngine.unlock();
    this.nativeAudio?.ensureAudible();
    void this.nativeAudio?.play();
    this.playback?.ensureAudible();
    const layer = this.el.querySelector("[data-pause-layer]") as HTMLElement;
    layer.classList.remove("show");
    window.setTimeout(() => (layer.hidden = true), 160);
    void this.playback?.play();
    this.engine?.resume();
  }

  private quit(): void {
    if (this.finished) return;
    this.finished = true;
    this.engine?.pause();
    this.nativeAudio?.pause();
    this.playback?.pause();
    const result = this.engine?.finishEarly() ?? null;
    this.engine?.destroy();
    this.nativeAudio?.destroy();
    this.playback?.destroy();
    this.onExit(
      result
        ? {
            ...result,
            rubiesEarned: 0,
            levelsGained: 0,
            oldLevel: store.user.level,
            newLevel: store.user.level,
            sGradeDailyTriggered: false,
            isNewRecord: false,
          }
        : null
    );
  }

  private complete(
    result: Omit<
      GameResultData,
      | "levelsGained"
      | "oldLevel"
      | "newLevel"
      | "sGradeDailyTriggered"
      | "rubiesEarned"
      | "isNewRecord"
    >
  ): void {
    if (this.finished) return;
    this.finished = true;
    window.clearInterval(this.hudTimer);
    this.engine?.destroy();
    this.nativeAudio?.destroy();
    this.playback?.destroy();

    const prev = store.user.records[result.video.videoId];
    const isNewRecord = !prev || result.score > prev.bestScore;
    store.user.records[result.video.videoId] = {
      videoId: result.video.videoId,
      bestScore: Math.max(prev?.bestScore ?? 0, result.score),
      bestGrade: pickBetterGrade(prev?.bestGrade, result.grade),
      bestCombo: Math.max(prev?.bestCombo ?? 0, result.maxCombo),
      bestHitRating: Math.max(prev?.bestHitRating ?? 0, result.hitRating),
      playCount: (prev?.playCount ?? 0) + 1,
      lastPlayedAt: Date.now(),
    };

    const grants = store.grantExpAndRewards(
      result.coinsEarned,
      result.expEarned,
      result.grade
    );

    if (result.replayRecord) {
      result.replayRecord.playerName = store.user.nickname;
      store.user.replays.unshift(result.replayRecord);
      if (store.user.replays.length > 60) store.user.replays.length = 60;
    }

    if (result.options.customChart) {
      const chart = store.user.customCharts.find(
        (c) => c.id === result.options.customChart!.id
      );
      if (chart) {
        chart.playCount += 1;
        store.save();
      }
    }

    store.addHistory(result.video);
    store.save();

    if (grants.levelsGained > 0) {
      soundEngine.playRewardChime(store.settings, "levelup");
      toast(`${tt("level_up")} Lv.${grants.newLevel}`, "ok");
    }
    if (grants.sGradeDailyTriggered) {
      soundEngine.playRewardChime(store.settings, "s_grade");
    }

    const full: GameResultData = {
      ...result,
      ...grants,
      isNewRecord,
    };
    this.onExit(full);
  }

  public destroy(): void {
    window.TapTubeNative?.setImmersive?.(false);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("taptube:resume-audio", this.onVisibility);
    window.clearInterval(this.hudTimer);
    window.clearInterval(this.slideTimer);
    this.engine?.destroy();
    this.nativeAudio?.destroy();
    this.playback?.destroy();
    document.body.classList.remove("landscape", "portrait");
    this.el.remove();
  }

  public destroyWithResult(): void {
    this.destroy();
  }

  public shareCurrent(result: GameResultData): void {
    openShareSheet(
      result.video,
      `Score ${fmtInt(result.score)} · ${result.grade} · ${result.hitRating.toFixed(1)}%`
    );
    void esc;
  }
}

function pickBetterGrade(a: string | undefined, b: string): any {
  const order = ["F", "D", "C", "B", "A", "S", "SS", "SSS"];
  if (!a) return b;
  return order.indexOf(b) > order.indexOf(a) ? b : a;
}
