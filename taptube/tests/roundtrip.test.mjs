/**
 * Editor/storage round-trip: a chart can be edited, exported, re-imported and
 * played back with exactly the same notes. This guards the share/import path
 * the original app advertised ("custom note function … share the music").
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DIFFICULTIES,
  chartStats,
  createEmptyChart,
  generateGridChart,
  parseChart,
  serialiseChart,
} from "../src/chart.js";

const songId = "demo:neon-pulse";

test("a generated chart survives serialise → parse unchanged", () => {
  const chart = generateGridChart({
    songId,
    bpm: 128,
    duration: 96,
    difficulty: "hard",
    lanes: 5,
    longNotes: true,
    slideNotes: true,
    seed: 7,
  });
  const restored = parseChart(serialiseChart(chart));
  assert.equal(restored.songId, chart.songId);
  assert.equal(restored.bpm, chart.bpm);
  assert.equal(restored.lanes, chart.lanes);
  assert.equal(restored.notes.length, chart.notes.length);
  assert.deepEqual(
    restored.notes.map((note) => [note.time, note.lane, note.kind]),
    chart.notes.map((note) => [note.time, note.lane, note.kind]),
  );
});

test("a hand-authored note list is normalised rather than rejected", () => {
  const handMade = {
    songId,
    bpm: "150",
    lanes: "6",
    notes: [
      { time: 1, lane: 0 },
      { time: 2.5, lane: 3, kind: "hold", endTime: 3.5 },
      { time: 4, lane: 5, kind: "slide", endLane: 2 },
      { time: 1.2, lane: 0 },
    ],
  };
  const chart = parseChart(handMade);
  assert.equal(chart.bpm, 150);
  assert.equal(chart.lanes, 6);
  // Sorted by time, unknown fields dropped, defaults filled in.
  assert.deepEqual(
    chart.notes.map((note) => note.time),
    [1, 1.2, 2.5, 4],
  );
  assert.equal(chart.notes[2].kind, "hold");
  assert.equal(chart.notes[3].endLane, 2);
  assert.equal(chart.notes[0].kind, "tap");
});

test("invalid charts are rejected instead of rendering an empty run", () => {
  assert.throws(() => parseChart(null));
  assert.throws(() => parseChart({ notes: "nope" }));
  assert.throws(() => parseChart({ notes: [], bpm: 0 }));
});

test("every difficulty keeps the same song length but different density", () => {
  const stats = DIFFICULTIES.map((difficulty) =>
    chartStats(
      generateGridChart({
        songId,
        bpm: 120,
        duration: 60,
        difficulty,
        lanes: 4,
        seed: 11,
      }),
    ),
  );
  assert.equal(
    new Set(stats.map((entry) => Math.round(entry.duration))).size,
    1,
  );
  const [easy, normal, hard, extreme] = stats.map((entry) => entry.noteCount);
  assert.ok(easy < normal, `easy ${easy} vs normal ${normal}`);
  assert.ok(normal <= hard, `normal ${normal} vs hard ${hard}`);
  assert.ok(hard < extreme, `hard ${hard} vs extreme ${extreme}`);
});

test("an empty chart is a valid starting point for the editor", () => {
  const chart = createEmptyChart({
    songId,
    bpm: 100,
    duration: 30,
    lanes: 4,
    difficulty: "normal",
  });
  assert.equal(chart.notes.length, 0);
  assert.equal(parseChart(serialiseChart(chart)).duration, 30);
});
