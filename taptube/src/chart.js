/**
 * Chart model + three generators:
 *  - `generateChart`  from analysed audio (real onsets, band splitting)
 *  - `generateGridChart` from a tempo grid (YouTube mode: no audio access)
 *  - `parseChart` / `serialiseChart` for the editor, import/export and storage
 *
 * A chart is plain JSON so custom charts can be shared and re-imported.
 */

import { clamp } from "./util.js";

export const CHART_VERSION = 1;
export const LANE_COUNTS = [4, 5, 6];

export const DIFFICULTIES = ["easy", "normal", "hard", "extreme"];

/**
 * Per-difficulty generation policy.
 * `density` is the share of detected onsets that become notes; `minGap` keeps
 * adjacent notes playable at high note speeds.
 */
export const DIFFICULTY_PRESETS = {
  easy: {
    density: 0.34,
    minGap: 0.24,
    longNoteChance: 0.06,
    slideChance: 0,
    strengthFloor: 0.3,
    lanes: 4,
    starTarget: 2,
  },
  normal: {
    density: 0.55,
    minGap: 0.16,
    longNoteChance: 0.1,
    slideChance: 0.04,
    strengthFloor: 0.18,
    lanes: 4,
    starTarget: 3,
  },
  hard: {
    density: 0.78,
    minGap: 0.11,
    longNoteChance: 0.14,
    slideChance: 0.08,
    strengthFloor: 0.08,
    lanes: 5,
    starTarget: 4,
  },
  extreme: {
    density: 0.96,
    minGap: 0.075,
    longNoteChance: 0.18,
    slideChance: 0.12,
    strengthFloor: 0,
    lanes: 6,
    starTarget: 5,
  },
};

export const NOTE_KINDS = ["tap", "hold", "slide"];

/**
 * @typedef {object} ChartNote
 * @property {number} time seconds from the start of the audio
 * @property {number} lane 0-based lane index
 * @property {"tap"|"hold"|"slide"} kind
 * @property {number} [endTime] for hold notes
 * @property {number} [endLane] for slide notes
 * @property {number} [intensity] 0..1, drives note size + hit volume
 */

/**
 * @typedef {object} Chart
 * @property {number} version
 * @property {string} songId
 * @property {"auto"|"grid"|"custom"} source
 * @property {string} difficulty
 * @property {number} lanes
 * @property {number} bpm
 * @property {number} offset seconds of the first beat
 * @property {number} duration
 * @property {ChartNote[]} notes
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {object} [meta]
 */

/** Small deterministic PRNG so regenerating the same chart is reproducible. */
export function createRandom(seed = 0x2f6e2b1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Map onsets to lanes with a bias against repeating the same lane, then add
 * long notes and slides from the per-difficulty chances.
 *
 * @param {Array<{time:number,strength:number,low?:number,high?:number}>} onsets
 * @param {object} options
 */
export function generateChart(onsets, options) {
  const {
    songId,
    difficulty = "normal",
    lanes = 4,
    bpm = 120,
    duration = 0,
    longNotes = true,
    slideNotes = true,
    seed = 0x2f6e2b1,
    minGapOverride,
    maxNotes = 2400,
  } = options;
  const preset = DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.normal;
  const random = createRandom(seed);
  const laneCount = LANE_COUNTS.includes(lanes) ? lanes : preset.lanes;
  const minGap = minGapOverride ?? preset.minGap;

  const filtered = [];
  for (const onset of [...onsets].sort((a, b) => a.time - b.time)) {
    if ((onset.strength ?? 0.5) < preset.strengthFloor) continue;
    const previous = filtered.at(-1);
    if (previous && onset.time - previous.time < minGap) {
      // Keep the stronger of two onsets that are too close together.
      if ((onset.strength ?? 0.5) > (previous.strength ?? 0.5))
        filtered[filtered.length - 1] = onset;
      continue;
    }
    filtered.push(onset);
  }

  const stride =
    preset.density >= 1 ? 1 : Math.max(1, Math.round(1 / preset.density));
  const selected = filtered
    .filter((_, index) => index % stride === 0)
    .slice(0, maxNotes);

  /** @type {ChartNote[]} */
  const notes = [];
  let lastLane = Math.floor(random() * laneCount);
  for (const [index, onset] of selected.entries()) {
    const strength = clamp(onset.strength ?? 0.5, 0, 1);
    const lane = chooseLane({
      random,
      laneCount,
      lastLane,
      strength,
      low: onset.low ?? 0.5,
      high: onset.high ?? 0.5,
      index,
    });
    const note = {
      time: round(onset.time),
      lane,
      kind: "tap",
      intensity: round(strength),
    };

    const next = selected[index + 1];
    const gap = next ? next.time - onset.time : 0.5;
    const canHold =
      longNotes &&
      gap > Math.max(0.45, minGap * 3) &&
      random() < preset.longNoteChance;
    const canSlide =
      slideNotes && !canHold && laneCount >= 4 && random() < preset.slideChance;

    if (canHold) {
      note.kind = "hold";
      note.endTime = round(onset.time + Math.min(gap * 0.72, 2.4));
    } else if (canSlide) {
      note.kind = "slide";
      const direction =
        lane === 0 ? 1 : lane === laneCount - 1 ? -1 : random() < 0.5 ? -1 : 1;
      note.endLane = clamp(lane + direction, 0, laneCount - 1);
      note.endTime = round(
        onset.time + Math.min(Math.max(gap * 0.6, 0.22), 0.9),
      );
    }

    notes.push(note);
    lastLane = note.endLane ?? lane;
  }

  const now = Date.now();
  return {
    version: CHART_VERSION,
    songId,
    source: "auto",
    difficulty,
    lanes: laneCount,
    bpm: round(bpm),
    offset: 0,
    duration: round(
      Math.max(
        duration || 0,
        notes.at(-1)?.endTime ?? notes.at(-1)?.time ?? 0,
        1,
      ),
    ),
    notes,
    stars: preset.starTarget,
    createdAt: now,
    updatedAt: now,
    meta: { generatedFrom: "audio", denseRatio: stride },
  };
}

function chooseLane({
  random,
  laneCount,
  lastLane,
  strength,
  low,
  high,
  index,
}) {
  const candidates = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    let weight = 1;
    if (lane === lastLane) weight *= 0.25;
    if (Math.abs(lane - lastLane) === 1) weight *= 1.35;
    // Low-band hits (kick) favour the outer lanes, high-band (hats) the middle.
    const centre = (laneCount - 1) / 2;
    const distance = Math.abs(lane - centre) / Math.max(1, centre);
    weight *= 1 + (low - high) * distance * 0.8;
    if (index === 0) weight *= lane === Math.floor(laneCount / 2) ? 1.6 : 1;
    candidates.push(weight * (0.7 + random() * 0.6) * (0.6 + strength * 0.8));
  }
  let total = candidates.reduce((sum, value) => sum + value, 0);
  let roll = random() * total;
  for (let lane = 0; lane < laneCount; lane += 1) {
    roll -= candidates[lane];
    if (roll <= 0) return lane;
  }
  return laneCount - 1;
}

/**
 * Tempo-grid generator used for YouTube videos, where the page cannot read the
 * audio stream. Notes follow the beat/subdivision grid and a deterministic
 * random pattern, so the same BPM always produces the same chart.
 */
export function generateGridChart(options) {
  const {
    songId,
    difficulty = "normal",
    lanes = 4,
    bpm = 120,
    duration = 180,
    offset = 0,
    longNotes = true,
    slideNotes = true,
    seed = 0x51f3a7,
    subdivision,
    intensity = 1,
  } = options;
  const preset = DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.normal;
  const laneCount = LANE_COUNTS.includes(lanes) ? lanes : preset.lanes;
  const random = createRandom(seed);
  const safeBpm = clamp(bpm, 40, 240);
  const step =
    subdivision ??
    (difficulty === "easy" ? 2 : difficulty === "normal" ? 1 : 0.5);
  const beatSeconds = 60 / safeBpm;
  const noteGap = beatSeconds * step;
  const start = Math.max(0, offset);
  /** @type {ChartNote[]} */
  const notes = [];
  let lastLane = Math.floor(random() * laneCount);
  let beat = 0;

  for (let time = start; time < duration - 0.8; time += noteGap, beat += 1) {
    // Leave breathing room occasionally so the chart does not feel mechanical.
    if (difficulty !== "extreme" && beat % 16 === 15) continue;
    const strength = clamp(
      (0.55 + (beat % 4 === 0 ? 0.35 : 0) + random() * 0.25) * intensity,
      0.15,
      1,
    );
    const lane = chooseLane({
      random,
      laneCount,
      lastLane,
      strength,
      low: beat % 4 === 0 ? 0.9 : 0.4,
      high: beat % 4 === 0 ? 0.35 : 0.7,
      index: beat,
    });
    const note = {
      time: round(time),
      lane,
      kind: "tap",
      intensity: round(strength),
    };

    if (
      longNotes &&
      beat % 8 === 4 &&
      random() < 0.45 + preset.longNoteChance
    ) {
      note.kind = "hold";
      note.endTime = round(time + Math.min(noteGap * 3, 1.6));
    } else if (slideNotes && random() < preset.slideChance + 0.02) {
      const direction =
        lane === 0 ? 1 : lane === laneCount - 1 ? -1 : random() < 0.5 ? -1 : 1;
      note.kind = "slide";
      note.endLane = clamp(lane + direction, 0, laneCount - 1);
      note.endTime = round(time + Math.min(noteGap * 1.5, 0.8));
    }

    notes.push(note);
    lastLane = note.endLane ?? lane;
  }

  const now = Date.now();
  return {
    version: CHART_VERSION,
    songId,
    source: "grid",
    difficulty,
    lanes: laneCount,
    bpm: round(safeBpm),
    offset: round(start),
    duration: round(duration),
    notes,
    stars: preset.starTarget,
    createdAt: now,
    updatedAt: now,
    meta: { generatedFrom: "grid", subdivision: step },
  };
}

/** Empty chart for the editor. */
export function createEmptyChart({
  songId,
  bpm = 120,
  duration = 120,
  lanes = 4,
}) {
  const now = Date.now();
  return {
    version: CHART_VERSION,
    songId,
    source: "custom",
    difficulty: "normal",
    lanes,
    bpm,
    offset: 0,
    duration,
    notes: [],
    stars: 3,
    createdAt: now,
    updatedAt: now,
    meta: { generatedFrom: "editor" },
  };
}

/** Sort + de-duplicate notes; used after every edit and before play. */
export function normaliseChart(chart) {
  const declaredLanes = Number(chart.lanes);
  const laneCount = LANE_COUNTS.includes(declaredLanes) ? declaredLanes : 4;
  const seen = new Set();
  const notes = [];
  for (const note of [...(chart.notes ?? [])].sort(
    (a, b) => a.time - b.time || a.lane - b.lane,
  )) {
    const time = round(
      clamp(Number(note.time) || 0, 0, chart.duration || 3600),
    );
    const lane = clamp(Math.round(Number(note.lane) || 0), 0, laneCount - 1);
    const key = `${time.toFixed(3)}:${lane}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = NOTE_KINDS.includes(note.kind) ? note.kind : "tap";
    const clean = {
      time,
      lane,
      kind,
      intensity: clamp(Number(note.intensity ?? 0.6), 0.05, 1),
    };
    if (kind === "hold") {
      const endTime = round(
        clamp(
          Number(note.endTime ?? time + 0.5),
          time + 0.1,
          (chart.duration || 3600) + 2,
        ),
      );
      clean.endTime = endTime;
    } else if (kind === "slide") {
      clean.endLane = clamp(
        Math.round(Number(note.endLane ?? lane)),
        0,
        laneCount - 1,
      );
      clean.endTime = round(
        clamp(Number(note.endTime ?? time + 0.35), time + 0.1, time + 4),
      );
    }
    notes.push(clean);
  }
  return {
    ...chart,
    lanes: laneCount,
    bpm: clamp(Number(chart.bpm) || 120, 40, 240),
    notes,
  };
}

/** Aggregate stats used by the UI (note count, first/last note time). */
export function chartStats(chart) {
  const notes = chart.notes ?? [];
  const last = notes.reduce(
    (max, note) => Math.max(max, note.endTime ?? note.time),
    0,
  );
  const density = chart.duration > 0 ? notes.length / chart.duration : 0;
  return {
    noteCount: notes.length,
    lastNoteTime: last,
    notesPerSecond: density,
    laneCount: chart.lanes,
    bpm: chart.bpm,
  };
}

/**
 * Parse an imported/exported chart document, rejecting untrusted shapes.
 * @returns {Chart}
 */
export function parseChart(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (typeof data !== "object" || data === null)
    throw new TypeError("chart must be an object");
  if (!Array.isArray(data.notes))
    throw new TypeError("chart.notes must be an array");
  if (data.notes.length > 20000)
    throw new TypeError("chart has too many notes");
  // JSON exports from other editors often store these as strings.
  const declaredLanes = Number(data.lanes);
  const lanes = LANE_COUNTS.includes(declaredLanes) ? declaredLanes : 4;
  // A shared chart may omit the length; derive it from the last note so a
  // hand-authored file still imports instead of being rejected.
  const declared = Number(data.duration);
  const lastNote = data.notes.reduce(
    (max, note) => Math.max(max, Number(note?.endTime ?? note?.time) || 0),
    0,
  );
  const duration =
    Number.isFinite(declared) && declared > 0 ? declared : Math.ceil(lastNote);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
    throw new TypeError("chart.duration must be between 0 and 3600 seconds");
  }
  const songId =
    typeof data.songId === "string" && data.songId.length > 0
      ? data.songId
      : "imported";
  return normaliseChart({
    version: CHART_VERSION,
    songId,
    source:
      data.source === "auto" || data.source === "grid" ? data.source : "custom",
    difficulty: DIFFICULTIES.includes(data.difficulty)
      ? data.difficulty
      : "normal",
    lanes,
    bpm: Number(data.bpm) || 120,
    offset: Number(data.offset) || 0,
    duration,
    notes: data.notes,
    stars: clamp(Number(data.stars) || 3, 1, 5),
    createdAt: Number(data.createdAt) || Date.now(),
    updatedAt: Date.now(),
    meta: typeof data.meta === "object" && data.meta !== null ? data.meta : {},
  });
}

export function serialiseChart(chart) {
  return JSON.stringify(
    { ...chart, exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

const round = (value) => Math.round(value * 1000) / 1000;
