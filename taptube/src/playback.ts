import { loadYouTubeIframeApi, mapQualityToYouTube } from "./youtube";
import { GameSettings, YtItem } from "./types";

export type PlaybackState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "error";

/**
 * Robust YouTube IFrame playback controller.
 *
 * Key guarantees (these were the cause of the original "no song / no sound" bug):
 *  - `unMute()` is called explicitly: the IFrame API starts muted on autoplay
 *    paths in several WebView/Chrome configurations.
 *  - Every play() is retried after a user gesture and after a short delay,
 *    because mobile browsers reject the first autoplay attempt.
 *  - A stalled player (loaded but `getCurrentTime()` never advances) is
 *    detected and reported so the game can keep the chart clock alive.
 */
export class YouTubePlayback {
  private player: any = null;
  private api: any = null;
  private readyPromise: Promise<void> | null = null;
  private stateCallback: ((state: PlaybackState) => void) | null = null;
  private errorCallback: ((code: number) => void) | null = null;
  private volume = 80;
  private muted = false;
  /** When false, this player is visual-only and must never make sound. */
  private soundEnabled = true;
  private fallbackSec = 0;
  private stopped = true;
  private lastTime = 0;
  private stalledSince = 0;

  public state: PlaybackState = "idle";
  public fallbackMode = false;
  public errorCode: number | null = null;
  public ready = false;

  constructor(
    private mount: HTMLElement,
    private video: YtItem,
    private settings: GameSettings
  ) {}

  public onState(fn: (state: PlaybackState) => void): void {
    this.stateCallback = fn;
  }

  public onError(fn: (code: number) => void): void {
    this.errorCallback = fn;
  }

  private setState(s: PlaybackState): void {
    this.state = s;
    this.stateCallback?.(s);
  }

  public async prepare(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.setState("loading");
    this.readyPromise = (async () => {
      try {
        this.api = await loadYouTubeIframeApi();
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          // Never hang the game if the API silently fails.
          const guard = window.setTimeout(done, 12000);

          const holder = document.createElement("div");
          holder.style.width = "100%";
          holder.style.height = "100%";
          const inner = document.createElement("div");
          holder.appendChild(inner);
          this.mount.innerHTML = "";
          this.mount.appendChild(holder);

          this.player = new this.api.Player(inner, {
            videoId: this.video.videoId,
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              fs: 0,
              iv_load_policy: 3,
              origin: window.location.origin,
            },
            events: {
              onReady: () => {
                window.clearTimeout(guard);
                this.ready = true;
                // Un-mute + apply volume BEFORE the first play attempt.
                try {
                  this.player.unMute?.();
                  this.player.setVolume?.(this.volume);
                } catch {
                  /* ignore */
                }
                this.setState("ready");
                done();
              },
              onError: (e: any) => {
                window.clearTimeout(guard);
                this.errorCode = Number(e?.data ?? 0) || 150;
                this.fallbackMode = true;
                this.setState("error");
                this.errorCallback?.(this.errorCode);
                done();
              },
              onStateChange: (e: any) => {
                const S = this.api?.PlayerState;
                if (!S) return;
                if (e.data === S.PLAYING) {
                  this.stalledSince = 0;
                  this.setState("playing");
                } else if (e.data === S.PAUSED) {
                  this.setState("paused");
                }
              },
            },
          });
        });
        if (!this.fallbackMode) this.applyVideoQuality();
        else this.mount.innerHTML = "";
      } catch {
        this.fallbackMode = true;
        this.mount.innerHTML = "";
        this.setState("error");
        this.errorCode = -1;
        this.errorCallback?.(-1);
      }
    })();
    return this.readyPromise;
  }

  public applyVideoQuality(): void {
    try {
      this.player?.setPlaybackQuality?.(
        mapQualityToYouTube(this.settings.videoQuality)
      );
    } catch {
      /* ignore */
    }
  }

  public async loadVideo(video: YtItem): Promise<void> {
    this.video = video;
    if (!this.player) return this.prepare();
    this.fallbackSec = 0;
    this.stopped = true;
    await new Promise<void>((resolve) => {
      try {
        this.player.loadVideoById({ videoId: video.videoId, startSeconds: 0 });
      } catch {
        /* ignore */
      }
      window.setTimeout(resolve, 320);
    });
  }

  public async seek(sec: number): Promise<void> {
    this.fallbackSec = Math.max(0, sec);
    if (this.player && !this.fallbackMode) {
      try {
        this.player.seekTo(sec, true);
      } catch {
        /* ignore */
      }
    }
  }

  /** Visual-only mode: the native soundtrack owns the audio. */
  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (!enabled) {
      try {
        this.player?.setVolume?.(0);
        this.player?.mute?.();
      } catch {
        /* ignore */
      }
    } else if (this.player) {
      this.setVolume(this.volume);
    }
  }

  /** Ensure the player is unmuted and audible (call on every resume). */
  public ensureAudible(): void {
    if (!this.player || this.fallbackMode) return;
    if (!this.soundEnabled) {
      try {
        this.player.setVolume?.(0);
        this.player.mute?.();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      this.player.unMute?.();
      this.player.setVolume?.(this.volume);
    } catch {
      /* ignore */
    }
  }

  public async play(attempt = 0): Promise<void> {
    this.stopped = false;
    if (!this.player || this.fallbackMode) return;
    try {
      this.ensureAudible();
      this.player.playVideo();
    } catch {
      /* ignore */
    }
    // Mobile browsers can swallow the first (autoplay) request: verify and retry.
    if (attempt < 4) {
      window.setTimeout(() => {
        if (this.stopped || this.fallbackMode) return;
        const t = this.getCurrentTime();
        const S = this.api?.PlayerState;
        const isPlaying = this.state === "playing" || (t ?? 0) > 0.05;
        if (!isPlaying) {
          try {
            this.ensureAudible();
            this.player?.playVideo?.();
          } catch {
            /* ignore */
          }
          void this.play(attempt + 1);
        }
        void S;
      }, 420 + attempt * 260);
    }
  }

  public pause(): void {
    this.stopped = true;
    this.fallbackSec = this.getCurrentTime() ?? this.fallbackSec;
    try {
      this.player?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }

  /** Returns current video position in seconds, or null if unavailable. */
  public getCurrentTime(): number | null {
    if (this.player && !this.fallbackMode) {
      try {
        const t = this.player.getCurrentTime?.();
        if (typeof t === "number" && !Number.isNaN(t)) {
          this.lastTime = t;
          return t;
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    return this.fallbackSec;
  }

  /**
   * True when the chart must fall back to the synth clock: the video is
   * unavailable, blocked, or has been sitting at 0:00 while we are playing.
   */
  public isStalled(songTimeMs: number): boolean {
    if (this.fallbackMode) return true;
    if (!this.ready) return false;
    const t = this.getCurrentTime();
    if (t === null) return true;
    const silent = t < 0.15;
    if (silent && !this.stopped) {
      if (!this.stalledSince) this.stalledSince = Date.now();
      return Date.now() - this.stalledSince > 2200;
    }
    this.stalledSince = 0;
    void songTimeMs;
    return false;
  }

  public setVolume(percent: number): void {
    this.volume = Math.max(0, Math.min(100, percent));
    if (!this.soundEnabled) {
      try {
        this.player?.setVolume?.(0);
        this.player?.mute?.();
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      this.player?.unMute?.();
      this.player?.setVolume?.(this.volume);
    } catch {
      /* ignore */
    }
  }

  public isMutedByBrowser(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      if (muted) this.player?.mute?.();
      else this.player?.unMute?.();
    } catch {
      /* ignore */
    }
  }

  public setFallbackTime(sec: number): void {
    this.fallbackSec = Math.max(0, sec);
  }

  public tickFallback(dtMs: number): void {
    if (this.fallbackMode && !this.stopped) {
      this.fallbackSec += dtMs / 1000;
    }
  }

  public destroy(): void {
    try {
      this.player?.destroy?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.ready = false;
    this.mount.innerHTML = "";
    this.stopped = true;
  }
}
