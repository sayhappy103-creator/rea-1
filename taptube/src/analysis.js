/**
 * Audio analysis pipeline: BPM detection + onset (transient) extraction.
 *
 * Pure functions over a mono Float32Array so the whole pipeline can be tested
 * in Node without Web Audio or a browser.
 */

import { clamp, median, percentile } from "./util.js";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const MIN_BPM = 60;
const MAX_BPM = 200;

/**
 * In-place iterative radix-2 FFT.
 * @param {Float32Array} real
 * @param {Float32Array} imag
 */
export function fft(real, imag) {
  const length = real.length;
  if (length !== imag.length || (length & (length - 1)) !== 0) {
    throw new RangeError("fft expects equal power-of-two buffers");
  }

  for (let index = 1, reverse = 0; index < length; index += 1) {
    let bit = length >> 1;
    for (; reverse & bit; bit >>= 1) reverse ^= bit;
    reverse ^= bit;
    if (index < reverse) {
      [real[index], real[reverse]] = [real[reverse], real[index]];
      [imag[index], imag[reverse]] = [imag[reverse], imag[index]];
    }
  }

  for (let size = 2; size <= length; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < length; start += size) {
      for (let offset = 0; offset < half; offset += 1) {
        const cos = Math.cos(angle * offset);
        const sin = Math.sin(angle * offset);
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex] * cos - imag[oddIndex] * sin;
        const oddImag = real[oddIndex] * sin + imag[oddIndex] * cos;
        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }
}

/** Hann window of `size` samples (cached per size). */
const hannCache = new Map();
export function hannWindow(size) {
  const cached = hannCache.get(size);
  if (cached) return cached;
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
  }
  hannCache.set(size, window);
  return window;
}

/**
 * Spectral flux onset strength per hop, plus the band energies we reuse for
 * note placement (low band = kick/beat, high band = hats/transients).
 * @param {Float32Array} samples mono PCM
 * @param {number} sampleRate
 */
export function computeOnsetEnvelope(samples, sampleRate) {
  const frameCount = Math.max(
    0,
    Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1,
  );
  const bins = FRAME_SIZE >> 1;
  const flux = new Float32Array(Math.max(0, frameCount));
  const lowEnergy = new Float32Array(Math.max(0, frameCount));
  const highEnergy = new Float32Array(Math.max(0, frameCount));
  const window = hannWindow(FRAME_SIZE);
  const real = new Float32Array(FRAME_SIZE);
  const imag = new Float32Array(FRAME_SIZE);
  const previous = new Float32Array(bins);
  const magnitude = new Float32Array(bins);
  const lowBin = Math.max(1, Math.floor((150 / (sampleRate / 2)) * bins));
  const highBin = Math.max(
    lowBin + 1,
    Math.floor((5000 / (sampleRate / 2)) * bins),
  );

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * HOP_SIZE;
    for (let index = 0; index < FRAME_SIZE; index += 1) {
      const sample = samples[start + index] ?? 0;
      real[index] = sample * window[index];
      imag[index] = 0;
    }
    fft(real, imag);

    let fluxSum = 0;
    let lowSum = 0;
    let highSum = 0;
    for (let bin = 0; bin < bins; bin += 1) {
      const value = Math.hypot(real[bin], imag[bin]);
      magnitude[bin] = value;
      const delta = value - previous[bin];
      if (delta > 0) fluxSum += delta;
      if (bin <= lowBin) lowSum += value;
      if (bin >= lowBin && bin <= highBin) highSum += value;
    }
    flux[frame] = fluxSum;
    lowEnergy[frame] = lowSum;
    highEnergy[frame] = highSum;
    previous.set(magnitude);
  }

  return {
    flux,
    lowEnergy,
    highEnergy,
    hopSeconds: HOP_SIZE / sampleRate,
    frameSeconds: FRAME_SIZE / sampleRate,
    frameCount,
  };
}

/** Remove a slow-moving average so quiet sections still produce onsets. */
export function normaliseEnvelope(values, windowFrames = 32) {
  const output = new Float32Array(values.length);
  let runningSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    runningSum += values[index];
    if (index >= windowFrames) runningSum -= values[index - windowFrames];
    const localMean = runningSum / Math.min(index + 1, windowFrames);
    output[index] = Math.max(0, values[index] - localMean * 0.9);
  }
  return output;
}

/**
 * Autocorrelation tempo estimate over the onset envelope.
 * @returns {{bpm:number, confidence:number}}
 */
/**
 * Tempo from an inter-onset-interval histogram (Dixon-style comb scoring).
 * Robust against the octave errors of plain autocorrelation: a half-tempo
 * candidate only explains every second interval, so the comb scores lower.
 *
 * @param {number[]} times onset times in seconds (ascending)
 * @param {{minBpm?:number, maxBpm?:number}} [options]
 */
export function detectTempoFromOnsets(times, options = {}) {
  const minBpm = options.minBpm ?? MIN_BPM;
  const maxBpm = options.maxBpm ?? MAX_BPM;
  if (times.length < 4) return { bpm: 120, confidence: 0 };

  // Pairwise intervals up to two seconds, binned at 5 ms.
  const BIN = 0.005;
  const MAX_INTERVAL = 2;
  const limit = Math.min(times.length, 800);
  const histogram = new Float64Array(Math.round(MAX_INTERVAL / BIN) + 4);
  for (let first = 0; first < limit; first += 1) {
    for (let second = first + 1; second < limit; second += 1) {
      const interval = times[second] - times[first];
      if (interval > MAX_INTERVAL) break;
      if (interval < 0.15) continue;
      histogram[Math.round(interval / BIN)] += 1;
    }
  }

  /** Count intervals around `seconds` (±2 bins, weighted 1 / 0.8 / 0.6). */
  const energy = (seconds) => {
    const centre = Math.round(seconds / BIN);
    return (
      (histogram[centre] ?? 0) +
      ((histogram[centre - 1] ?? 0) + (histogram[centre + 1] ?? 0)) * 0.8 +
      ((histogram[centre - 2] ?? 0) + (histogram[centre + 2] ?? 0)) * 0.6
    );
  };

  const WEIGHTS = [1, 0.5, 0.33, 0.25];
  let bestScore = 0;
  let bestBpm = 120;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const period = 60 / bpm;
    let score = 0;
    for (let [index, weight] of WEIGHTS.entries()) {
      const multiple = period * (index + 1);
      if (multiple > MAX_INTERVAL) break;
      score += energy(multiple) * weight;
    }
    // Only a clearly stronger candidate wins, so the faster pulse is kept when
    // two tempos explain the same train (the usual octave ambiguity).
    if (score > bestScore * 1.04) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  if (bestScore <= 0) return { bpm: 120, confidence: 0 };

  const total = histogram.reduce((sum, value) => sum + value, 0) || 1;
  const confidence = clamp(bestScore / (total * 0.9), 0, 1);
  return { bpm: clamp(bestBpm, minBpm, maxBpm), confidence };
}

/**
 * Tempo detection over the onset envelope (convenience wrapper that peaks the
 * envelope first, so callers only need the spectral-flux array).
 */
export function detectTempo(envelope, hopSeconds) {
  const peaks = pickOnsets(envelope, hopSeconds, { minSpacing: 0.1 });
  return detectTempoFromOnsets(peaks.map((peak) => peak.time));
}

/**
 * Peak picking with an adaptive threshold and a minimum spacing.
 * @returns {number[]} times in seconds, ascending
 */
export function pickOnsets(envelope, hopSeconds, options = {}) {
  const { minSpacing = 0.09, sensitivity = 0.62, maxOnsets = 4000 } = options;
  let peak = 0;
  let sum = 0;
  for (let index = 0; index < envelope.length; index += 1) {
    const value = envelope[index];
    sum += value;
    if (value > peak) peak = value;
  }
  // Digital silence must not produce a note per frame: every frame is
  // "above zero" by definition, so the floor is derived from the signal itself.
  if (peak <= 1e-7 || sum <= 1e-6) return [];

  const noiseFloor = percentile(envelope, 60);
  const peakFloor = percentile(envelope, 95);
  const threshold = Math.max(
    noiseFloor * 1.05,
    peakFloor * (1.05 - sensitivity),
    peak * 0.04,
  );
  const peaks = [];
  for (let index = 2; index < envelope.length - 2; index += 1) {
    const value = envelope[index];
    if (value <= threshold) continue;
    if (
      value < envelope[index - 1] ||
      value < envelope[index - 2] ||
      value < envelope[index + 1] ||
      value < envelope[index + 2]
    ) {
      continue;
    }
    peaks.push({ index, value });
  }

  // Keep the strongest peak of every cluster, then re-sort by time.
  peaks.sort((left, right) => right.value - left.value);
  const kept = [];
  for (const peak of peaks) {
    if (kept.length >= maxOnsets) break;
    const time = peak.index * hopSeconds;
    if (kept.some((other) => Math.abs(other.time - time) < minSpacing))
      continue;
    kept.push({ time, value: peak.value });
  }
  kept.sort((left, right) => left.time - right.time);
  return kept;
}

/**
 * Full analysis entry point.
 * @param {Float32Array} samples mono PCM in [-1, 1]
 * @param {number} sampleRate
 * @param {{sensitivity?: number, minSpacing?: number}} [options]
 */
export function analyseSamples(samples, sampleRate, options = {}) {
  const envelope = computeOnsetEnvelope(samples, sampleRate);
  const flux = normaliseEnvelope(envelope.flux);
  const low = normaliseEnvelope(envelope.lowEnergy);
  const high = normaliseEnvelope(envelope.highEnergy);
  const onsets = pickOnsets(flux, envelope.hopSeconds, {
    sensitivity: options.sensitivity ?? 0.62,
    minSpacing: options.minSpacing ?? 0.09,
  });
  const tempo = detectTempoFromOnsets(onsets.map((onset) => onset.time));
  const duration = samples.length / sampleRate;

  const strengths = onsets.map((onset) => onset.value);
  const strengthMedian = median(strengths) || 1;
  const beatPeriod = 60 / tempo.bpm;
  const lowPeak = Math.max(percentile(low, 95), 1e-6);
  const highPeak = Math.max(percentile(high, 95), 1e-6);

  return {
    duration,
    bpm: Math.round(tempo.bpm * 10) / 10,
    bpmConfidence: tempo.confidence,
    beatOffset: estimateBeatOffset(
      onsets.map((onset) => onset.time),
      beatPeriod,
    ),
    onsets: onsets.map((onset) => ({
      time: Math.round(onset.time * 1000) / 1000,
      strength:
        Math.round(clamp(onset.value / strengthMedian / 2, 0, 1) * 100) / 100,
      ...bandStrengthAt({
        envelope,
        low,
        high,
        time: onset.time,
        lowPeak,
        highPeak,
      }),
    })),
  };
}

/** Peek a small window without spreading a typed array into `Math.max`. */
function windowPeak(values, index, radius = 3) {
  let peak = 0;
  const start = Math.max(0, index - radius);
  const end = Math.min(values.length, index + radius + 1);
  for (let cursor = start; cursor < end; cursor += 1) {
    if (values[cursor] > peak) peak = values[cursor];
  }
  return Math.max(peak, 1e-6);
}

/** Sample the low/high band normalised energies at a given time. */
function bandStrengthAt({ envelope, low, high, time, lowPeak, highPeak }) {
  const index = clamp(
    Math.round(time / envelope.hopSeconds),
    0,
    low.length - 1,
  );
  const localLow = Math.max(windowPeak(low, index), 1e-6);
  const localHigh = Math.max(windowPeak(high, index), 1e-6);
  return {
    low: round2(
      clamp((low[index] / localLow) * 0.5 + (low[index] / lowPeak) * 0.5, 0, 1),
    ),
    high: round2(
      clamp(
        (high[index] / localHigh) * 0.5 + (high[index] / highPeak) * 0.5,
        0,
        1,
      ),
    ),
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Estimate where the first beat falls (phase of the tempo grid). */
export function estimateBeatOffset(times, beatPeriod) {
  if (times.length === 0 || beatPeriod <= 0) return 0;
  const twoPi = Math.PI * 2;
  let sinSum = 0;
  let cosSum = 0;
  for (const time of times) {
    const angle = (twoPi * time) / beatPeriod;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }
  let phase = Math.atan2(sinSum, cosSum) / twoPi;
  if (phase < 0) phase += 1;
  return Math.round(phase * beatPeriod * 1000) / 1000;
}
