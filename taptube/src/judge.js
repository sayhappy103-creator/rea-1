/**
 * Scoring rules. Kept free of rendering and audio so the exact same code runs
 * in tests and in the game loop.
 */

export const JUDGMENTS = ["perfect", "great", "good", "bad", "miss"];

/** Windows in seconds around a note's hit time (symmetric, before offset). */
export const JUDGE_WINDOWS = {
  perfect: 0.045,
  great: 0.09,
  good: 0.14,
  bad: 0.2,
  miss: 0.26,
};

export const JUDGE_SCORES = {
  perfect: 1,
  great: 0.75,
  good: 0.45,
  bad: 0.15,
  miss: 0,
};

/** Accuracy weight per judgment; miss counts fully against accuracy. */
export const ACCURACY_WEIGHTS = {
  perfect: 1,
  great: 0.75,
  good: 0.45,
  bad: 0.15,
  miss: 0,
};

export const MAX_COMBO_BONUS = 0.12;

export function classifyOffset(offsetSeconds) {
  const distance = Math.abs(offsetSeconds);
  if (distance <= JUDGE_WINDOWS.perfect) return "perfect";
  if (distance <= JUDGE_WINDOWS.great) return "great";
  if (distance <= JUDGE_WINDOWS.good) return "good";
  if (distance <= JUDGE_WINDOWS.bad) return "bad";
  if (distance <= JUDGE_WINDOWS.miss) return "miss";
  return null;
}

export function createScoreState() {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 },
    judged: 0,
    total: 0,
    accuracyPoints: 0,
    accuracyMax: 0,
    isFailed: false,
    fullCombo: true,
    allPerfect: true,
  };
}

/**
 * Score model: `PER_NOTE_MAX` per note, scaled by the judgment weight and a
 * combo bonus of up to 25% (reached at a 50-note combo). Scores are therefore
 * comparable across charts ("X of 1,000,000 + combo"), and a full-perfect run
 * reaches exactly 1,000,000 + the combo bonus ceiling.
 */
export const PER_NOTE_MAX = 1000;

export function scoreFor(judgment, combo) {
  const weight = JUDGE_SCORES[judgment] ?? 0;
  const comboBonus =
    1 +
    (Math.min(combo, MAX_COMBO_LENGTH) / MAX_COMBO_LENGTH) * MAX_COMBO_BONUS;
  return PER_NOTE_MAX * weight * comboBonus;
}

export const MAX_COMBO_LENGTH = 50;

/**
 * Apply one judgment to the running state. Accuracy is derived from the
 * judgment counts so the value shown mid-run and the final result always agree.
 * @param {ReturnType<typeof createScoreState>} state
 */
export function applyJudgment(state, judgment, { totalNotes } = {}) {
  const total = totalNotes ?? state.total;
  state.total = total;
  if (JUDGMENTS.includes(judgment)) state.counts[judgment] += 1;
  state.judged += 1;

  if (judgment === "miss" || judgment === "bad") {
    state.combo = 0;
    if (judgment === "miss") {
      state.fullCombo = false;
      state.allPerfect = false;
    }
  } else {
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    if (judgment !== "perfect") state.allPerfect = false;
  }

  state.score += scoreFor(judgment, state.combo);
  void total;
  return state;
}

/** Weighted accuracy 0..1, rounded down to the judged portion of the chart. */
export function accuracyOf(state) {
  const { perfect, great, good, bad, miss } = state.counts;
  const judged = perfect + great + good + bad + miss;
  if (judged === 0) return 0;
  const points =
    perfect * ACCURACY_WEIGHTS.perfect +
    great * ACCURACY_WEIGHTS.great +
    good * ACCURACY_WEIGHTS.good +
    bad * ACCURACY_WEIGHTS.bad +
    miss * ACCURACY_WEIGHTS.miss;
  return points / judged;
}

/** Letter grade shown on the results screen. */
export function rankOf(state) {
  const accuracy = accuracyOf(state);
  if (state.judged === 0) return "D";
  if (accuracy >= 0.995 && state.allPerfect) return "S";
  if (accuracy >= 0.95) return "A";
  if (accuracy >= 0.88) return "B";
  if (accuracy >= 0.75) return "C";
  return "D";
}

export function starsOf(state, starTarget = 3) {
  const accuracy = accuracyOf(state);
  const max = Math.max(1, Math.min(5, starTarget));
  const earned = Math.ceil(accuracy * max - 0.0001);
  return Math.max(
    0,
    Math.min(max, state.fullCombo ? Math.max(1, earned) : earned - 1),
  );
}

/** Ready-to-store summary of a finished run. */
export function summariseRun(state) {
  return {
    score: Math.round(state.score),
    maxScore: Math.round(state.total * PER_NOTE_MAX * (1 + MAX_COMBO_BONUS)),
    accuracy: accuracyOf(state),
    maxCombo: state.maxCombo,
    counts: { ...state.counts },
    judged: state.judged,
    rank: rankOf(state),
    fullCombo: state.fullCombo,
    allPerfect: state.allPerfect,
  };
}
