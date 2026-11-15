import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCURACY_WEIGHTS,
  JUDGE_WINDOWS,
  accuracyOf,
  applyJudgment,
  classifyOffset,
  createScoreState,
  rankOf,
  starsOf,
  summariseRun,
} from "../src/judge.js";

test("judgment windows are ordered and symmetric", () => {
  assert.equal(classifyOffset(0), "perfect");
  assert.equal(classifyOffset(JUDGE_WINDOWS.perfect), "perfect");
  assert.equal(classifyOffset(-JUDGE_WINDOWS.perfect), "perfect");
  assert.equal(classifyOffset(JUDGE_WINDOWS.great), "great");
  assert.equal(classifyOffset(-JUDGE_WINDOWS.good), "good");
  assert.equal(classifyOffset(JUDGE_WINDOWS.bad), "bad");
  assert.equal(classifyOffset(-JUDGE_WINDOWS.miss), "miss");
  assert.equal(classifyOffset(JUDGE_WINDOWS.miss + 0.02), null);
});

test("a perfect run scores higher than a sloppy one", () => {
  const perfect = createScoreState();
  const sloppy = createScoreState();
  for (let index = 0; index < 40; index += 1) {
    applyJudgment(perfect, "perfect", { totalNotes: 40 });
    applyJudgment(sloppy, index % 4 === 0 ? "good" : "great", {
      totalNotes: 40,
    });
  }
  assert.ok(perfect.score > sloppy.score);
  assert.equal(accuracyOf(perfect), 1);
  assert.ok(
    accuracyOf(sloppy) < 1 && accuracyOf(sloppy) > ACCURACY_WEIGHTS.good,
  );
  assert.equal(rankOf(perfect), "S");
  assert.equal(starsOf(perfect, 5), 5);
  assert.ok(starsOf(sloppy, 5) >= 1);
});

test("misses break the combo and the full combo flag", () => {
  const state = createScoreState();
  applyJudgment(state, "perfect", { totalNotes: 10 });
  applyJudgment(state, "perfect", { totalNotes: 10 });
  assert.equal(state.combo, 2);
  assert.equal(state.maxCombo, 2);
  applyJudgment(state, "miss", { totalNotes: 10 });
  assert.equal(state.combo, 0);
  assert.equal(state.maxCombo, 2);
  assert.equal(state.fullCombo, false);
  assert.equal(state.allPerfect, false);
  assert.equal(state.counts.miss, 1);
});

test("bad judgments reset the combo but keep the full combo", () => {
  const state = createScoreState();
  applyJudgment(state, "great", { totalNotes: 4 });
  applyJudgment(state, "bad", { totalNotes: 4 });
  applyJudgment(state, "perfect", { totalNotes: 4 });
  assert.equal(state.combo, 1);
  assert.equal(state.fullCombo, true);
  assert.equal(state.allPerfect, false);
});

test("summary is stable and rounds the score", () => {
  const state = createScoreState();
  for (let index = 0; index < 8; index += 1) {
    applyJudgment(state, "perfect", { totalNotes: 8 });
  }
  const summary = summariseRun(state);
  assert.equal(Number.isInteger(summary.score), true);
  assert.equal(summary.accuracy, 1);
  assert.equal(summary.maxCombo, 8);
  assert.equal(summary.rank, "S");
  assert.deepEqual(summary.counts, {
    perfect: 8,
    great: 0,
    good: 0,
    bad: 0,
    miss: 0,
  });
});

test("empty state reports zero accuracy without dividing by zero", () => {
  const state = createScoreState();
  assert.equal(accuracyOf(state), 0);
  assert.equal(rankOf(state), "D");
  const summary = summariseRun(state);
  assert.equal(summary.score, 0);
});

test("score grows with the note count and stays below the chart maximum", () => {
  const state = createScoreState();
  for (let index = 0; index < 25; index += 1) {
    applyJudgment(state, "perfect", { totalNotes: 25 });
  }
  // 25 notes × 1000 points × combo bonus, never above the theoretical ceiling.
  assert.ok(state.score > 25 * 1000);
  const summary = summariseRun(state);
  assert.ok(summary.score <= summary.maxScore);
  assert.ok(summary.maxScore >= 25 * 1000);
});
