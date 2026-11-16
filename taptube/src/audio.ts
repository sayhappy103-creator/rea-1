import { GameSettings, TouchSoundId } from "./types";

/**
 * Clean-Room Zero-Latency Polyphonic WebAudio Sound Engine (`SoundManager`).
 * Synthesizes all 24 TapTube 1.6.5 audio cues & 5 selectable Touch Hit Sounds
 * + Metronome + optional Beat Backing Synth + Native Android Haptic Vibration!
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private longHoldOsc: OscillatorNode | null = null;
  private longHoldGain: GainNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const length = Math.floor(this.ctx.sampleRate * 0.18);
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.25));
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext();
  }

  public vibrate(ms: number): void {
    try {
      if (window.TapTubeNative?.vibrate) {
        window.TapTubeNative.vibrate(ms);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore on unsupported hosts
    }
  }

  public playUiClick(settings: GameSettings, heavy = false): void {
    if (!settings.normalFx) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? "triangle" : "sine";
    osc.frequency.setValueAtTime(heavy ? 520 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 240 : 440, now + 0.065);
    gain.gain.setValueAtTime(heavy ? 0.22 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playSwitch(settings: GameSettings, on: boolean): void {
    if (!settings.normalFx) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(on ? 540 : 760, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 860 : 460, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playTouchHit(
    settings: GameSettings,
    lane = 0,
    soundOverride?: TouchSoundId
  ): void {
    const vol = Math.max(0, Math.min(1, settings.gameFxVolume / 100));
    if (settings.touchVibration) {
      this.vibrate(14);
    }
    if (vol <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const id = soundOverride ?? settings.touchSound;

    if (id === 1) {
      // Sound 1: Crisp Rhythm Tambourine / Hi-Tick (TapTube Classic)
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 3400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.28 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
        src.connect(hp).connect(g).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.06);
      }
      const osc = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(1320 + lane * 90, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.045);
      g2.gain.setValueAtTime(0.25 * vol, now);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(g2).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (id === 2) {
      // Sound 2: Crystal Synth Bell
      const pitches = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      const freq = pitches[lane % pitches.length];
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc2.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2, now);
      g.gain.setValueAtTime(0.26 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(g);
      osc2.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc2.start(now);
      osc.stop(now + 0.15);
      osc2.stop(now + 0.15);
    } else if (id === 3) {
      // Sound 3: Tight Electronic Clap / Snare
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1850;
        bp.Q.value = 1.3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.42 * vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
        src.connect(bp).connect(g).connect(ctx.destination);
        src.start(now);
        src.stop(now + 0.09);
      }
    } else if (id === 4) {
      // Sound 4: Punchy Taiko / Wood Drum
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320 + lane * 20, now);
      osc.frequency.exponentialRampToValueAtTime(85, now + 0.075);
      g.gain.setValueAtTime(0.4 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } else {
      // Sound 5: Classic Arcade 8-Bit Blip
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(740 + lane * 80, now);
      osc.frequency.setValueAtTime(1120 + lane * 80, now + 0.022);
      g.gain.setValueAtTime(0.15 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  }

  public startLongHold(settings: GameSettings): void {
    if (this.longHoldOsc) return;
    const vol = Math.max(0, Math.min(1, settings.gameFxVolume / 100));
    if (vol <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.06 * vol, ctx.currentTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.longHoldOsc = osc;
    this.longHoldGain = gain;
  }

  public stopLongHold(): void {
    if (this.longHoldOsc && this.ctx && this.longHoldGain) {
      try {
        const now = this.ctx.currentTime;
        this.longHoldGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        this.longHoldOsc.stop(now + 0.05);
      } catch {
        // ignore
      }
    }
    this.longHoldOsc = null;
    this.longHoldGain = null;
  }

  public playMiss(settings: GameSettings): void {
    if (settings.missVibration) {
      this.vibrate(95);
    }
    const vol = Math.max(0, Math.min(1, settings.gameFxVolume / 100));
    if (vol <= 0.01) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.linearRampToValueAtTime(98, now + 0.14);
    g.gain.setValueAtTime(0.18 * vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playFeverDash(settings: GameSettings): void {
    if (!settings.normalFx && settings.gameFxVolume <= 0) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      const t0 = now + idx * 0.042;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.14, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  public playMetronome(accent = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(accent ? 1480 : 1020, now);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playRewardChime(
    settings: GameSettings,
    kind: "coin" | "ruby" | "disc" | "levelup" | "s_grade" | "gacha"
  ): void {
    if (!settings.normalFx) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const seq =
      kind === "s_grade"
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98]
        : kind === "levelup"
        ? [440, 554.37, 659.25, 880, 1108.73]
        : kind === "gacha"
        ? [392, 523.25, 659.25, 783.99, 1046.5]
        : kind === "ruby"
        ? [783.99, 1174.66]
        : kind === "disc"
        ? [587.33, 880]
        : [987.77, 1318.51];

    seq.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = kind === "s_grade" || kind === "levelup" ? "triangle" : "sine";
      const t0 = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.27);
    });
  }

  /** Optional musical synth pulse for Synth Fallback Mode when an MV blocks embedding */
  public playBeatSynthStep(stepIndex: number, bpm: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const beatDur = 60 / Math.max(80, Math.min(200, bpm));
    // Kick on 0, 2
    if (stepIndex % 2 === 0) {
      const kick = ctx.createOscillator();
      const kg = ctx.createGain();
      kick.type = "sine";
      kick.frequency.setValueAtTime(140, now);
      kick.frequency.exponentialRampToValueAtTime(42, now + 0.12);
      kg.gain.setValueAtTime(0.28, now);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      kick.connect(kg).connect(ctx.destination);
      kick.start(now);
      kick.stop(now + 0.15);
    }
    // Bass / Arp chord progression (Am - F - C - G)
    const roots = [220, 174.61, 261.63, 196.0];
    const bar = Math.floor(stepIndex / 4) % 4;
    const intervals = [1, 1.25, 1.5, 2];
    const freq = roots[bar] * intervals[stepIndex % 4];
    const synth = ctx.createOscillator();
    const sg = ctx.createGain();
    synth.type = "triangle";
    synth.frequency.setValueAtTime(freq, now);
    sg.gain.setValueAtTime(0.11, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + beatDur * 0.85);
    synth.connect(sg).connect(ctx.destination);
    synth.start(now);
    synth.stop(now + beatDur * 0.9);
  }
}

export const soundEngine = new SoundEngine();
