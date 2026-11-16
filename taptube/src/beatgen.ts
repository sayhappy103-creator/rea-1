import {
  ChartNote,
  Difficulty,
  LineCount,
  SlideWaypoint,
  YtItem,
} from "./types";

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 123456789;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function estimateSongBpm(video: YtItem): number {
  if (video.bpm && video.bpm >= 70 && video.bpm <= 200) {
    return video.bpm;
  }
  const lower = `${video.title} ${video.genre ?? ""}`.toLowerCase();
  if (lower.includes("dnb") || lower.includes("drum") || lower.includes("nightcore")) {
    return 168;
  }
  if (lower.includes("ballad") || lower.includes("slow") || lower.includes("lofi") || lower.includes("acoustic")) {
    return 94;
  }
  if (lower.includes("edm") || lower.includes("house") || lower.includes("dance") || lower.includes("remix")) {
    return 128;
  }
  if (lower.includes("rock") || lower.includes("anime") || lower.includes("opening")) {
    return 146;
  }
  const h = hashSeed(video.videoId);
  const candidates = [112, 120, 124, 128, 132, 138, 144, 150];
  return candidates[h % candidates.length];
}

export interface GeneratedChartInfo {
  notes: ChartNote[];
  bpm: number;
  npm: number;
  durationSec: number;
}

/**
 * Clean-room musical rhythm chart generator inspired by TapTube's Basic Engine (`smraMusicAnalyzer`).
 * Produces structured, ergonomic, non-overlapping charts tailored to 3/4/5/6 lanes and Easy..Extreme!
 */
export function generateBasicChart(
  video: YtItem,
  difficulty: Difficulty,
  lines: LineCount,
  useDoubleNote: boolean,
  useLongNote: boolean,
  useSlideNote: boolean
): GeneratedChartInfo {
  const durationSec = Math.max(45, video.durationSec || 210);
  const bpm = estimateSongBpm(video);
  const beatMs = 60000 / bpm;
  const rng = makeRng(
    hashSeed(`${video.videoId}:${difficulty}:${lines}`)
  );

  // Subdivision & density per difficulty
  const cfg = {
    easy: {
      subdiv: 1, // quarter notes / half notes
      density: 0.56,
      doubleProb: 0.05,
      longProb: 0.14,
      slideProb: 0.08,
    },
    normal: {
      subdiv: 2, // 8th notes
      density: 0.52,
      doubleProb: 0.1,
      longProb: 0.15,
      slideProb: 0.11,
    },
    hard: {
      subdiv: 2, // dense 8th + bursts
      density: 0.74,
      doubleProb: 0.16,
      longProb: 0.16,
      slideProb: 0.14,
    },
    extreme: {
      subdiv: 4, // 16th patterns + streams
      density: 0.54,
      doubleProb: 0.21,
      longProb: 0.14,
      slideProb: 0.16,
    },
    crazy: {
      subdiv: 4,
      density: 0.62,
      doubleProb: 0.24,
      longProb: 0.15,
      slideProb: 0.17,
    },
  }[difficulty];

  const stepMs = beatMs / cfg.subdiv;
  const startMs = 2200;
  const endMs = Math.max(startMs + 10000, durationSec * 1000 - 2200);
  const totalSpan = endMs - startMs;

  const laneBusyUntil = new Array<number>(lines).fill(0);
  const notes: ChartNote[] = [];
  let prevLane = Math.floor(rng() * lines);
  let dir = rng() > 0.5 ? 1 : -1;
  let noteCounter = 0;

  let stepIdx = 0;
  for (let t = startMs; t <= endMs; t += stepMs, stepIdx++) {
    const progress = (t - startMs) / totalSpan;
    // Song section energy curve: Intro -> Verse -> Build -> Chorus Drop -> Bridge -> Final Chorus -> Outro
    let sectionBoost = 1.0;
    if (progress < 0.1) sectionBoost = 0.62;
    else if (progress < 0.32) sectionBoost = 0.88;
    else if (progress < 0.44) sectionBoost = 1.04;
    else if (progress < 0.72) sectionBoost = 1.22; // Main chorus
    else if (progress < 0.82) sectionBoost = 0.82; // Bridge
    else if (progress < 0.94) sectionBoost = 1.25; // Climax chorus
    else sectionBoost = 0.7; // Outro

    const isDownbeat = stepIdx % cfg.subdiv === 0;
    const isBarStart = stepIdx % (cfg.subdiv * 4) === 0;
    const isHalfBeat = cfg.subdiv >= 2 && stepIdx % (cfg.subdiv / 2) === 0;

    let hitChance = cfg.density * sectionBoost;
    if (isBarStart) hitChance = Math.min(0.96, hitChance * 1.45);
    else if (isDownbeat) hitChance = Math.min(0.9, hitChance * 1.2);
    else if (!isHalfBeat) hitChance *= 0.48; // 16th offbeats only in energetic runs

    if (rng() > hitChance) continue;

    // Pick musical lane (stairs, alternations, leaps on accents)
    const freeLanes: number[] = [];
    for (let l = 0; l < lines; l++) {
      if (laneBusyUntil[l] <= t - 95) freeLanes.push(l);
    }
    if (freeLanes.length === 0) continue;

    let chosenLane = prevLane + dir;
    if (chosenLane < 0 || chosenLane >= lines || rng() < 0.28) {
      dir = -dir;
      chosenLane = prevLane + dir;
    }
    if (
      isBarStart &&
      rng() < 0.35 &&
      freeLanes.length > 0
    ) {
      chosenLane = freeLanes[Math.floor(rng() * freeLanes.length)];
    }
    if (!freeLanes.includes(chosenLane)) {
      chosenLane = freeLanes[Math.floor(rng() * freeLanes.length)];
    }
    prevLane = chosenLane;

    const timeMs = Math.round(t);

    // Decide note kind: Slide, Long, or Tap (+ optional Double chord)
    const roll = rng();
    if (
      useSlideNote &&
      isDownbeat &&
      lines >= 3 &&
      roll < cfg.slideProb &&
      t + beatMs * 2 < endMs
    ) {
      const steps = rng() < 0.5 ? 2 : 3;
      const slideDurPerStep = Math.round(beatMs * (difficulty === "easy" ? 1 : 0.5));
      const waypoints: SlideWaypoint[] = [];
      let curL = chosenLane;
      const slideDir = curL < lines / 2 ? 1 : -1;
      let valid = true;
      for (let s = 1; s <= steps; s++) {
        curL = Math.max(0, Math.min(lines - 1, curL + (s % 2 === 1 ? slideDir : slideDir)));
        if (curL === (waypoints[waypoints.length - 1]?.lane ?? chosenLane)) {
          curL = (curL + 1) % lines;
        }
        const wpTime = timeMs + s * slideDurPerStep;
        if (laneBusyUntil[curL] > wpTime - 80) {
          valid = false;
          break;
        }
        waypoints.push({ offsetMs: s * slideDurPerStep, lane: curL });
      }
      if (valid && waypoints.length > 0) {
        const totalDur = waypoints[waypoints.length - 1].offsetMs;
        notes.push({
          id: `n_${++noteCounter}`,
          timeMs,
          lane: chosenLane,
          kind: "slide",
          durationMs: totalDur,
          slidePath: waypoints,
        });
        laneBusyUntil[chosenLane] = timeMs + totalDur + 140;
        for (const wp of waypoints) {
          laneBusyUntil[wp.lane] = Math.max(
            laneBusyUntil[wp.lane],
            timeMs + wp.offsetMs + 140
          );
        }
        prevLane = waypoints[waypoints.length - 1].lane;
        continue;
      }
    }

    if (
      useLongNote &&
      isDownbeat &&
      roll < cfg.slideProb + cfg.longProb &&
      t + beatMs * 2 < endMs
    ) {
      const beatsHold = rng() < 0.65 ? 1 : 2;
      const holdDur = Math.max(280, Math.round(beatMs * beatsHold * 0.85));
      notes.push({
        id: `n_${++noteCounter}`,
        timeMs,
        lane: chosenLane,
        kind: "long",
        durationMs: holdDur,
      });
      laneBusyUntil[chosenLane] = timeMs + holdDur + 160;
      continue;
    }

    // Standard Tap Note
    notes.push({
      id: `n_${++noteCounter}`,
      timeMs,
      lane: chosenLane,
      kind: "tap",
    });
    laneBusyUntil[chosenLane] = timeMs + 130;

    // Optional Double Note (simultaneous chord on accents!)
    if (
      useDoubleNote &&
      (isBarStart || (isDownbeat && sectionBoost > 1.0)) &&
      freeLanes.length >= 2 &&
      rng() < cfg.doubleProb
    ) {
      const otherCandidates = freeLanes.filter((l) => l !== chosenLane);
      if (otherCandidates.length > 0) {
        const secondLane =
          otherCandidates[Math.floor(rng() * otherCandidates.length)];
        notes.push({
          id: `n_${++noteCounter}`,
          timeMs,
          lane: secondLane,
          kind: "tap",
        });
        laneBusyUntil[secondLane] = timeMs + 150;
      }
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
  const playableMinutes = Math.max(0.5, (endMs - startMs) / 60000);
  const npm = Math.round(notes.length / playableMinutes);

  return {
    notes,
    bpm,
    npm,
    durationSec,
  };
}
