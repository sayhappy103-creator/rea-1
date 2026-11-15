import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyseSamples,
  computeOnsetEnvelope,
  detectTempo,
  fft,
  normaliseEnvelope,
  pickOnsets,
} from "../src/analysis.js";

const SAMPLE_RATE = 22050;

/** Impulse train at `bpm` with a decaying click, mixed with a quiet pad. */
function clickTrack({ bpm = 120, seconds = 8, sampleRate = SAMPLE_RATE } = {}) {
  const samples = new Float32Array(Math.floor(seconds * sampleRate));
  const step = Math.round((60 / bpm) * sampleRate);
  const clickLength = Math.round(0.02 * sampleRate);
  for (let start = 0; start < samples.length; start += step) {
    for (
      let offset = 0;
      offset < clickLength && start + offset < samples.length;
      offset += 1
    ) {
      const t = offset / sampleRate;
      // Taper the tail so truncation cannot add a second broadband transient.
      const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / clickLength);
      samples[start + offset] +=
        Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60) * 0.8 * taper;
    }
  }
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] += Math.sin((2 * Math.PI * 110 * index) / sampleRate) * 0.05;
  }
  return samples;
}

test("fft round-trips a known signal", () => {
  const size = 64;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    real[index] = Math.cos((2 * Math.PI * 5 * index) / size);
  }
  fft(real, imag);
  // A pure cosine at bin 5 puts all energy in bins 5 and size-5.
  assert.ok(Math.hypot(real[5], imag[5]) > 20);
  assert.ok(Math.hypot(real[7], imag[7]) < 1e-3);
});

test("tone envelope produces one onset per click", () => {
  const samples = clickTrack({ bpm: 120, seconds: 6 });
  const envelope = computeOnsetEnvelope(samples, SAMPLE_RATE);
  const flux = normaliseEnvelope(envelope.flux);
  const peaks = pickOnsets(flux, envelope.hopSeconds, { minSpacing: 0.2 });
  // 6 seconds at 120 BPM with a click every beat → ~12 onsets.
  assert.ok(peaks.length >= 10 && peaks.length <= 14, `got ${peaks.length}`);
  const gaps = peaks
    .slice(1)
    .map((peak, index) => peak.time - peaks[index].time);
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  assert.ok(Math.abs(averageGap - 0.5) < 0.05, `gap ${averageGap}`);
});

test("tempo detection finds the click rate", () => {
  const samples = clickTrack({ bpm: 128, seconds: 12 });
  const envelope = computeOnsetEnvelope(samples, SAMPLE_RATE);
  const flux = normaliseEnvelope(envelope.flux);
  const { bpm } = detectTempo(flux, envelope.hopSeconds);
  assert.ok(
    Math.abs(bpm - 128) < 3,
    `expected ~128 BPM, got ${bpm.toFixed(2)}`,
  );
});

test("tempo detection prefers a plausible pulse over double time", () => {
  const samples = clickTrack({ bpm: 100, seconds: 14 });
  const envelope = computeOnsetEnvelope(samples, SAMPLE_RATE);
  const flux = normaliseEnvelope(envelope.flux);
  const { bpm } = detectTempo(flux, envelope.hopSeconds);
  assert.ok(bpm > 90 && bpm < 115, `expected ~100 BPM, got ${bpm.toFixed(2)}`);
});

test("full analysis reports duration, bpm and band-aware onsets", () => {
  const samples = clickTrack({ bpm: 120, seconds: 10 });
  const analysis = analyseSamples(samples, SAMPLE_RATE);
  assert.equal(Math.round(analysis.duration), 10);
  assert.ok(analysis.onsets.length > 12);
  assert.ok(analysis.bpm > 110 && analysis.bpm < 130);
  for (const onset of analysis.onsets) {
    assert.ok(onset.time >= 0 && onset.time <= 10);
    assert.ok(onset.strength >= 0 && onset.strength <= 1);
    assert.ok(onset.low >= 0 && onset.low <= 1);
    assert.ok(onset.high >= 0 && onset.high <= 1);
  }
  assert.ok(analysis.bpmConfidence >= 0 && analysis.bpmConfidence <= 1);
});

test("silence yields no onsets", () => {
  const samples = new Float32Array(SAMPLE_RATE * 3);
  const analysis = analyseSamples(samples, SAMPLE_RATE);
  assert.equal(analysis.onsets.length, 0);
});
