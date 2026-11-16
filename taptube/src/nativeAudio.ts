import { GameSettings, YtItem } from "./types";

export interface PlaybackSource {
  /** True when the source cannot ever produce audio (blocked / unsupported). */
  fallbackMode: boolean;
  prepare(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(sec: number): void | Promise<void>;
  getCurrentTime(): number | null;
  isStalled(songTimeMs: number): boolean;
  setVolume(percent: number): void;
  ensureAudible(): void;
  onError(fn: (code: number) => void): void;
  destroy(): void;
}

type NativeBridge = NonNullable<Window["TapTubeNative"]>;

/**
 * Native Android soundtrack (`TapTubeNative.audio*`).
 *
 * The YouTube IFrame player is frequently blocked inside an Android WebView
 * (referrer checks, embed restrictions, DRM/codec limits), which produced a
 * completely silent game. This source resolves the real audio stream through
 * YouTube's InnerTube `/player` endpoint in Java and plays it with
 * `MediaPlayer`, so charts always have their actual song.
 */
export class NativeAudioPlayback implements PlaybackSource {
  public fallbackMode = false;
  public errorCode: number | null = null;
  private started = false;
  private volume = 85;
  private errorCb: ((code: number) => void) | null = null;
  private lastPosMs = -1;
  private stalledSince = 0;
  private fallbackSec = 0;

  constructor(
    private video: YtItem,
    private settings: GameSettings,
    private bridge: NativeBridge
  ) {}

  public onError(fn: (code: number) => void): void {
    this.errorCb = fn;
  }

  private status(): { state: string; error: string; durationMs: number } {
    try {
      const raw = this.bridge.audioStatus?.() ?? "{}";
      const parsed = JSON.parse(raw);
      return {
        state: String(parsed.state ?? "idle"),
        error: String(parsed.error ?? ""),
        durationMs: Number(parsed.durationMs ?? 0),
      };
    } catch {
      return { state: "idle", error: "", durationMs: 0 };
    }
  }

  public async prepare(): Promise<void> {
    try {
      this.bridge.audioPrepare?.(this.video.videoId);
    } catch {
      this.fallbackMode = true;
      return;
    }
    this.setVolume(this.settings.videoVolume ?? 85);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const st = this.status();
      if (st.state === "ready") {
        this.setVolume(this.settings.videoVolume ?? 85);
        return;
      }
      if (st.state === "error") {
        this.fallbackMode = true;
        this.errorCode = 2;
        this.errorCb?.(2);
        return;
      }
      await new Promise((r) => window.setTimeout(r, 220));
    }
    // Resolver timed out: continue, the stall watchdog will switch to synth.
    this.fallbackMode = false;
  }

  public async play(): Promise<void> {
    this.started = true;
    try {
      this.bridge.audioStart?.();
    } catch {
      /* ignore */
    }
    if (this.fallbackSec > 0.2) {
      try {
        this.bridge.audioSeekTo?.(Math.round(this.fallbackSec * 1000));
      } catch {
        /* ignore */
      }
    }
  }

  public pause(): void {
    this.started = false;
    try {
      this.bridge.audioPause?.();
    } catch {
      /* ignore */
    }
  }

  public seek(sec: number): void {
    this.fallbackSec = Math.max(0, sec);
    try {
      this.bridge.audioSeekTo?.(Math.round(sec * 1000));
    } catch {
      /* ignore */
    }
  }

  public getCurrentTime(): number | null {
    try {
      const ms = this.bridge.audioPositionMs?.();
      if (typeof ms === "number" && ms >= 0) return ms / 1000;
    } catch {
      /* ignore */
    }
    return null;
  }

  public isStalled(songTimeMs: number): boolean {
    if (this.fallbackMode) return true;
    const st = this.status();
    if (st.state === "error") {
      this.fallbackMode = true;
      return true;
    }
    const pos = this.getCurrentTime() ?? 0;
    const seconds = pos * 1000;
    if (this.started && Math.abs(seconds - this.lastPosMs) < 40) {
      if (!this.stalledSince) this.stalledSince = Date.now();
      if (Date.now() - this.stalledSince > 2600) return true;
    } else {
      this.stalledSince = 0;
    }
    this.lastPosMs = seconds;
    void songTimeMs;
    return false;
  }

  public setVolume(percent: number): void {
    this.volume = Math.max(0, Math.min(100, percent));
    try {
      this.bridge.audioSetVolume?.(this.volume);
    } catch {
      /* ignore */
    }
  }

  public ensureAudible(): void {
    this.setVolume(this.volume);
  }

  public destroy(): void {
    this.started = false;
    try {
      this.bridge.audioRelease?.();
    } catch {
      /* ignore */
    }
  }
}

export function hasNativeAudio(): boolean {
  const b = window.TapTubeNative;
  return !!b && typeof (b as NativeBridge).audioPrepare === "function";
}
