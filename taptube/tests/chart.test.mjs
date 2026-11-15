import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIFFICULTIES,
  chartStats,
  generateChart,
  generateGridChart,
  normaliseChart,
  parseChart,
  serialiseChart,
} from "../src/chart.js";
import { analyseSamples } from "../src/analysis.js";

const SR = 22050;

function clickTrack({ bpm = 120, seconds = 12 } = {}) {
  const samples = new Float32Array(SR * seconds);
  const step = Math.round((60 / bpm) * SR);
  const clickLength = Math.round(0.02 * SR);
  for (let start = 0; start < samples.length; start += step) {
    for (
      let offset = 0;
      offset < clickLength && start + offset < samples.length;
      offset += 1
    ) {
      const t = offset / SR;
      const taper = 0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / clickLength);
      samples[start + offset] +=
        Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60) * 0.8 * taper;
    }
  }
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] += Math.sin((2 * Math.PI * 110 * index) / SR) * 0.05;
  }
  return samples;
}

test("generated chart is deterministic for the same seed", () => {
  const onsets = Array.from({ length: 60 }, (_, index) => ({
    time: index * 0.25,
    strength: 0.5 + (index % 5) * 0.1,
    low: 0.5,
    high: 0.5,
  }));
  const options = {
    songId: "s",
    difficulty: "normal",
    lanes: 4,
    bpm: 120,
    duration: 15,
  };
  const first = generateChart(onsets, options);
  const second = generateChart(onsets, options);
  assert.deepEqual(first.notes, second.notes);
});

test("harder difficulties place more notes", () => {
  const onsets = Array.from({ length: 120 }, (_, index) => ({
    time: index * 0.12,
    strength: 0.9,
    low: 0.6,
    high: 0.6,
  }));
  const counts = DIFFICULTIES.map(
    (difficulty) =>
      generateChart(onsets, {
        songId: "s",
        difficulty,
        lanes: 4,
        bpm: 150,
        duration: 16,
      }).notes.length,
  );
  for (let index = 1; index < counts.length; index += 1) {
    assert.ok(counts[index] >= counts[index - 1], `counts ${counts}`);
  }
  assert.ok(counts[0] > 0);
});

test("notes respect lane count, ordering and hold lengths", () => {
  const analysis = analyseSamples(clickTrack({ seconds: 12 }), SR);
  const chart = generateChart(analysis.onsets, {
    songId: "analysis",
    difficulty: "hard",
    lanes: 5,
    bpm: analysis.bpm,
    duration: analysis.duration,
    longNotes: true,
    slideNotes: true,
  });
  assert.ok(chart.notes.length > 10);
  let previous = -1;
  for (const note of chart.notes) {
    assert.ok(note.time >= previous, "notes must be sorted");
    previous = note.time;
    assert.ok(note.lane >= 0 && note.lane < 5);
    if (note.kind === "hold") assert.ok(note.endTime > note.time);
    if (note.kind === "slide") {
      assert.ok(note.endLane >= 0 && note.endLane < 5);
      assert.notEqual(note.endLane, note.lane);
    }
  }
  const stats = chartStats(chart);
  assert.equal(stats.noteCount, chart.notes.length);
  assert.ok(stats.lastNoteTime <= chart.duration + 2);
});

test("grid charts follow the requested tempo and length", () => {
  const chart = generateGridChart({
    songId: "grid",
    difficulty: "normal",
    lanes: 4,
    bpm: 120,
    duration: 60,
  });
  assert.ok(chart.notes.length > 60 && chart.notes.length < 200);
  // A normal-difficulty grid uses quarter notes at 120 BPM = 0.5 s apart.
  const gaps = chart.notes
    .slice(1, 10)
    .map((note, index) => note.time - chart.notes[index].time);
  assert.ok(
    gaps.every((gap) => Math.abs(gap - 0.5) < 0.01),
    `gaps ${gaps}`,
  );
  assert.equal(chart.source, "grid");
  assert.equal(chart.lanes, 4);
});

test("parseChart rejects malformed documents and keeps the good ones", () => {
  const chart = generateGridChart({ songId: "g", duration: 30, bpm: 100 });
  const roundTrip = parseChart(serialiseChart(chart));
  assert.equal(roundTrip.notes.length, chart.notes.length);
  assert.equal(roundTrip.bpm, 100);

  assert.throws(() => parseChart("{}"), /notes/);
  assert.throws(
    () => parseChart(JSON.stringify({ notes: [], duration: 0 })),
    /duration/,
  );
  assert.throws(() =>
    parseChart(JSON.stringify({ notes: "nope", duration: 10 })),
  );
  assert.equal(
    parseChart(JSON.stringify({ notes: [], duration: 10, lanes: 99 })).lanes,
    4,
  );
  assert.throws(
    () => parseChart(JSON.stringify({ notes: [], duration: 6000 })),
    /duration/,
  );
});

test("normaliseChart drops duplicates and clamps out-of-range lanes", () => {
  const chart = normaliseChart({
    songId: "n",
    lanes: 4,
    bpm: 120,
    duration: 30,
    notes: [
      { time: 1, lane: 0, kind: "tap" },
      { time: 1, lane: 0, kind: "tap" },
      { time: 2, lane: 99, kind: "tap" },
      { time: 3, lane: 1, kind: "hold", endTime: 0.5 },
      { time: 4, lane: 2, kind: "slide", endLane: 9 },
    ],
  });
  assert.equal(chart.notes.length, 4);
  const [first, second, third, fourth] = chart.notes;
  assert.equal(first.time, 1);
  assert.equal(second.lane, 3);
  assert.ok(third.endTime > third.time);
  assert.equal(fourth.endLane, 3);
});
