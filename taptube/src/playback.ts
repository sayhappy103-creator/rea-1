import { loadYouTubeIframeApi, mapQualityToYouTube } from "./youtube";
import { GameSettings, YtItem } from "./types";

export type PlaybackState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

/**
 * YouTube IFrame playback controller used by the game road & note editor.
 * Falls back to the in-game Beat Synth clock when a video blocks external embedding.
 */
export class YouTubePlayback {
  private player: any = null;
  private api: any = null;
  private readyPromise: Promise<void> | null = null;
  private stateCallback: ((state: PlaybackState) => void) | null = null;
  private errorCallback: ((code: number) => void) | null = null;
  private startedAt = 0;
  private startOffsetSec = 0;
  private fallbackSec = 0;
  private lastTick = 0;
  private stopped = true;

  public state: PlaybackState = "idle";
  public fallbackMode = false;
  public errorCode: number | null = null;

  constructor(private mount: HTMLElement, private video: YtItem, private settings: GameSettings) {}

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
            },
            events: {
              onReady: () => resolve(),
              onError: (e: any) => {
                this.errorCode = Number(e?.data ?? 0) || 150;
                this.fallbackMode = true;
                this.setState("error");
                this.errorCallback?.(this.errorCode);
                resolve();
              },
              onStateChange: (e: any) => {
                const S = this.api?.PlayerState;
                if (!S) return;
                if (e.data === S.PLAYING) this.setState("playing");
                else if (e.data === S.PAUSED) this.setState("paused");
              },
            },
          });
        });
        if (!this.fallbackMode) {
          this.setState("ready");
          this.applyVideoQuality();
        } else {
          this.mount.innerHTML = "";
        }
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
      this.player?.setPlaybackQuality?.(mapQualityToYouTube(this.settings.videoQuality));
    } catch {
      /* ignore */
    }
  }

  public async loadVideo(video: YtItem): Promise<void> {
    this.video = video;
    if (!this.player) return this.prepare();
    this.startOffsetSec = 0;
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
    this.startOffsetSec = Math.max(0, sec);
    this.fallbackSec = Math.max(0, sec);
    this.lastTick = performance.now();
    if (this.player && !this.fallbackMode) {
      try {
        this.player.seekTo(sec, true);
      } catch {
        /* ignore */
      }
    }
  }

  public async play(): Promise<void> {
    this.stopped = false;
    this.lastTick = performance.now();
    if (this.player && !this.fallbackMode) {
      try {
        this.player.playVideo();
      } catch {
        /* ignore */
      }
    }
  }

  public pause(): void {
    this.stopped = true;
    // Preserve exact fallback time at pause
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
        if (typeof t === "number" && !Number.isNaN(t)) return t;
      } catch {
        /* ignore */
      }
      return null;
    }
    return this.fallbackSec;
  }

  public setVolume(percent: number): void {
    try {
      this.player?.setVolume?.(Math.max(0, Math.min(100, percent)));
    } catch {
      /* ignore */
    }
  }

  public setFallbackTime(sec: number): void {
    this.fallbackSec = Math.max(0, sec);
  }

  public tickFallback(dtMs: number): void {
    if (this.fallbackMode) {
      if (!this.stopped) this.fallbackSec += dtMs / 1000;
    }
  }

  public destroy(): void {
    try {
      this.player?.destroy?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.mount.innerHTML = "";
    this.stopped = true;
  }
}
