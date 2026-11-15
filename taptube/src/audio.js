/**
 * Web Audio plumbing: decode files, resample to mono, play with a seekable
 * clock, and synthesize the short hit sounds (no binary assets needed).
 */

import { TapTubeError } from "./errors.js";
import { clamp } from "./util.js";

const TARGET_ANALYSIS_RATE = 22050;
const MAX_ANALYSIS_SECONDS = 420;

export function getAudioContext() {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Ctor)
    throw new TapTubeError("error.audio", { detail: "Web Audio unavailable" });
  const context = new Ctor({ latencyHint: "interactive" });
  return context;
}

/**
 * Decode any browser-supported audio file into a mono Float32Array.
 * @param {ArrayBuffer} buffer
 */
export async function decodeToMono(buffer, context = getAudioContext()) {
  let decoded;
  try {
    decoded = await context.decodeAudioData(buffer.slice(0));
  } catch (error) {
    throw new TapTubeError("error.decode", { cause: error });
  }
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let index = 0; index < length; index += 1)
      mono[index] += data[index] / channels;
  }
  return { mono, sampleRate: decoded.sampleRate, duration: decoded.duration };
}

/** Linear resample to `targetRate` (good enough for onset detection). */
export function resampleMono(
  mono,
  sampleRate,
  targetRate = TARGET_ANALYSIS_RATE,
) {
  if (sampleRate === targetRate) return { samples: mono, sampleRate };
  const ratio = sampleRate / targetRate;
  const length = Math.floor(mono.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const low = Math.floor(position);
    const frac = position - low;
    output[index] = (mono[low] ?? 0) * (1 - frac) + (mono[low + 1] ?? 0) * frac;
  }
  return { samples: output, sampleRate: targetRate };
}

/**
 * Normalise loudness (peak) and trim the analysis window so very long files
 * still analyse quickly.
 */
export function prepareForAnalysis(mono, sampleRate) {
  const limit = Math.min(
    mono.length,
    Math.floor(MAX_ANALYSIS_SECONDS * sampleRate),
  );
  const slice = mono.subarray(0, limit);
  let peak = 0;
  for (let index = 0; index < slice.length; index += 1) {
    const value = Math.abs(slice[index]);
    if (value > peak) peak = value;
  }
  const gain = peak > 0.0001 ? 0.95 / peak : 1;
  const scaled = new Float32Array(slice.length);
  for (let index = 0; index < slice.length; index += 1) {
    scaled[index] = clamp(slice[index] * gain, -1, 1);
  }
  return { samples: scaled, sampleRate, truncated: limit < mono.length };
}

/**
 * A decoded song ready for playback and analysis.
 * @typedef {object} LoadedSong
 * @property {AudioBuffer} buffer
 * @property {Float32Array} mono
 * @property {number} sampleRate
 * @property {number} duration
 */

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {AudioContext} [context]
 * @returns {Promise<LoadedSong>}
 */
export async function loadAudioFile(arrayBuffer, context = getAudioContext()) {
  let buffer;
  try {
    buffer = await context.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    throw new TapTubeError("error.decode", { cause: error });
  }
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1)
      mono[index] += data[index] / channels;
  }
  return {
    buffer,
    mono,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
  };
}

/**
 * Playback engine with a sample-accurate clock.
 * `position` is the offset into the song that the *user hears now*, taking the
 * configured audio latency compensation into account via `offsetMs` on read.
 */
export class AudioPlayer {
  /**
   * @param {AudioContext} context
   * @param {{volume?: number, offsetMs?: number}} [options]
   */
  constructor(context, options = {}) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = options.volume ?? 0.9;
    this.gain.connect(context.destination);
    this.buffer = null;
    this.source = null;
    this.startedAt = 0;
    this.startOffset = 0;
    this.playing = false;
    this.offsetMs = options.offsetMs ?? 0;
    this.rate = 1;
  }

  setBuffer(buffer) {
    this.stop();
    this.buffer = buffer;
    this.startOffset = 0;
  }

  setVolume(value) {
    this.gain.gain.value = clamp(value, 0, 1);
  }

  /** Current playback position in seconds (0 when not playing). */
  get position() {
    if (!this.playing) return this.startOffset;
    return (
      this.startOffset + (this.context.currentTime - this.startedAt) * this.rate
    );
  }

  /** Position the *player* should judge against (includes user offset). */
  get chartPosition() {
    return this.position - this.offsetMs / 1000;
  }

  async play(fromSeconds = this.startOffset) {
    if (!this.buffer) return false;
    this.stop();
    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        /* the caller surfaces the blocked-audio message */
      }
    }
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.gain);
    const offset = clamp(
      fromSeconds,
      0,
      Math.max(0, this.buffer.duration - 0.02),
    );
    source.start(0, offset);
    this.source = source;
    this.startedAt = this.context.currentTime;
    this.startOffset = offset;
    this.playing = true;
    source.onended = () => {
      if (this.source === source) {
        this.playing = false;
        this.startOffset = this.buffer?.duration ?? offset;
      }
    };
    return true;
  }

  pause() {
    if (!this.playing) return;
    this.startOffset = this.position;
    this.playing = false;
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
  }

  stop() {
    this.pause();
    this.startOffset = 0;
  }

  seek(seconds) {
    const target = clamp(seconds, 0, this.buffer?.duration ?? 0);
    if (this.playing) {
      void this.play(target);
    } else {
      this.startOffset = target;
    }
  }

  async resume() {
    return this.play(this.startOffset);
  }

  dispose() {
    this.stop();
    try {
      this.gain.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

/** Short synthesized hit sound; returns a function that triggers it. */
export function createHitSound(context, destination, volume = 0.6) {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * 0.08),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const t = index / context.sampleRate;
    const envelope = Math.exp(-t * 90);
    data[index] =
      (Math.sin(2 * Math.PI * 880 * t) * 0.6 + (Math.random() * 2 - 1) * 0.25) *
      envelope;
  }
  const gain = context.createGain();
  gain.gain.value = volume;
  gain.connect(destination);

  return (pitch = 1) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clamp(pitch, 0.5, 2);
    source.connect(gain);
    source.start();
  };
}
