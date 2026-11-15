/**
 * Song sources and the local song cache.
 *
 * A `Song` is a plain object so it can be handed to the router, stored in
 * history and compared across screens:
 *   { id, kind: "youtube"|"local"|"demo", title, channel, thumbnail,
 *     duration, bpm?, audio? ({buffer, mono, sampleRate}), file? (File) }
 *
 * Charts are generated once and cached in memory (and in localStorage for
 * custom charts), so replaying or restarting never re-analyses the audio.
 */

import { analyseSamples } from "./analysis.js";
import { loadAudioFile, prepareForAnalysis } from "./audio.js";
import { DIFFICULTIES, generateChart, generateGridChart } from "./chart.js";
import { DEMO_BPM, DEMO_SONG_ID, renderDemoSong } from "./demo.js";
import { TapTubeError } from "./errors.js";
import { getSettings, getCustomCharts, rememberLocalFile } from "./store.js";
import { hashString } from "./util.js";
import { CURATED, fetchVideoMeta, thumbnailUrl } from "./youtube.js";

const chartCache = new Map();
const analysisCache = new Map();

export const DIFFICULTY_LABELS = DIFFICULTIES;

export function isYouTubeSong(song) {
  return song?.kind === "youtube";
}

/** Build the song descriptor for a YouTube video (metadata via the proxy). */
export async function youtubeSong(id, { proxyUrl } = {}) {
  const settings = getSettings();
  const base = {
    id: `yt:${id}`,
    kind: "youtube",
    videoId: id,
    title: `YouTube ${id}`,
    channel: "",
    thumbnail: thumbnailUrl(id),
    duration: 0,
  };
  try {
    const meta = await fetchVideoMeta(id, {
      proxyUrl: proxyUrl ?? settings.proxyUrl,
    });
    return {
      ...base,
      title: meta.title,
      channel: meta.channel,
      thumbnail: meta.thumbnail,
      duration: meta.duration,
    };
  } catch {
    // Metadata is a nicety: the player still works with a stub descriptor, but
    // flag it so the song screen can ask for the length/tempo by hand.
    return { ...base, metaUnavailable: true };
  }
}

export function demoPlaceholderSong() {
  return {
    id: DEMO_SONG_ID,
    kind: "demo",
    title: "Neon Pulse (demo)",
    channel: "TapTube",
    thumbnail: "",
    duration: 39,
    bpm: DEMO_BPM,
  };
}

/** Load (and cache) the synthesized demo audio. */
export async function loadDemoSong(context) {
  const cached = analysisCache.get(DEMO_SONG_ID);
  if (cached) return { ...demoPlaceholderSong(), ...cached };
  const buffer = await renderDemoSong(context);
  const mono = new Float32Array(buffer.length);
  mono.set(buffer.getChannelData(0));
  const audio = { buffer, mono, sampleRate: buffer.sampleRate };
  analysisCache.set(DEMO_SONG_ID, { audio, duration: buffer.duration });
  return {
    ...demoPlaceholderSong(),
    duration: buffer.duration,
    audio,
  };
}

/**
 * Wrap an imported audio file into a song descriptor and analyse it.
 * @param {File} file
 * @param {AudioContext} context
 */
export async function localSong(file, context) {
  const audio = await loadAudioFile(await file.arrayBuffer(), context);
  const id = `local:${hashString(`${file.name}:${file.size}:${file.lastModified}`)}`;
  const song = {
    id,
    kind: "local",
    title: file.name.replace(/\.[^.]+$/, ""),
    channel: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
    thumbnail: "",
    duration: audio.duration,
    audio,
    file,
  };
  analysisCache.set(id, {
    audio,
    duration: audio.duration,
    fileName: file.name,
  });
  rememberLocalFile({
    id,
    title: song.title,
    size: file.size,
    duration: audio.duration,
    fileName: file.name,
  });
  return song;
}

/**
 * Analyse a song's audio once; results (bpm + onsets) are cached per song.
 * @returns {Promise<{bpm:number, onsets:Array, duration:number, confidence:number}>}
 */
export async function analyseSong(song, { onProgress } = {}) {
  const cached = analysisCache.get(`${song.id}:analysis`);
  if (cached) return cached;
  if (!song.audio) {
    throw new TapTubeError("error.audio", {
      detail: "song has no audio buffer",
    });
  }
  onProgress?.("analyse");
  const { samples, sampleRate } = prepareForAnalysis(
    song.audio.mono,
    song.audio.sampleRate,
  );
  const analysis = await new Promise((resolve) => {
    // Let the "analysing" paint land before the blocking FFT loop.
    setTimeout(() => resolve(analyseSamples(samples, sampleRate)), 16);
  });
  const result = { ...analysis, duration: song.audio.duration };
  analysisCache.set(`${song.id}:analysis`, result);
  return result;
}

/** Chart cache key: song + settings that change the generated notes. */
function chartKey(songId, options) {
  return [
    songId,
    options.difficulty,
    options.lanes,
    options.bpm,
    options.duration,
    options.longNotes ? 1 : 0,
    options.slideNotes ? 1 : 0,
    options.source,
  ].join("|");
}

/**
 * Get (or generate) the chart for a song.
 *
 * YouTube songs use the tempo grid because the browser cannot read the audio
 * of an embedded player; local and demo songs are analysed for real.
 */
export async function getChart(
  inputSong,
  overrides = {},
  { onProgress, regenerate = false } = {},
) {
  let song = inputSong;
  const settings = getSettings();
  const custom = getCustomCharts()[song.id];
  if (custom && !regenerate && overrides.difficulty === undefined) {
    return { ...custom, custom: true };
  }

  const difficulty =
    overrides.difficulty ?? settings.lastDifficulty ?? "normal";
  const options = {
    difficulty,
    lanes: overrides.lanes ?? settings.lanes,
    bpm: overrides.bpm ?? song.bpm ?? 120,
    // `audio.duration` is the decoded length and is always authoritative; the
    // descriptor's `duration` can be a placeholder (demo/history stubs).
    duration:
      overrides.duration ?? song.audio?.duration ?? song.duration ?? 180,
    longNotes: settings.longNotes,
    slideNotes: settings.slideNotes,
    offset: overrides.offset ?? 0,
    source: song.kind === "youtube" ? "grid" : "auto",
  };

  const key = chartKey(song.id, options);
  if (!regenerate && chartCache.has(key)) return chartCache.get(key);

  onProgress?.("generate");
  let chart;
  if (song.kind === "youtube" || overrides.source === "grid") {
    chart = generateGridChart({
      songId: song.id,
      difficulty,
      lanes: options.lanes,
      bpm: options.bpm,
      duration: Math.max(20, options.duration),
      offset: options.offset,
      longNotes: options.longNotes,
      slideNotes: options.slideNotes,
    });
  } else {
    if (!song.audio && song.kind === "demo") {
      const loaded = await loadDemoSong(
        globalThis.__taptubeAudioContext ?? undefined,
      );
      song = { ...song, audio: loaded.audio, duration: loaded.duration };
      options.duration = loaded.duration;
    }
    const analysis = await analyseSong(song, { onProgress });
    chart = generateChart(analysis.onsets, {
      songId: song.id,
      difficulty,
      lanes: options.lanes,
      bpm: analysis.bpm,
      duration: analysis.duration,
      longNotes: options.longNotes,
      slideNotes: options.slideNotes,
    });
    chart.confidence = analysis.confidence ?? analysis.bpmConfidence ?? 0;
    chart.detectedBpm = analysis.bpm;
  }

  chartCache.set(key, chart);
  return chart;
}

export function forgetChart(songId) {
  for (const key of [...chartCache.keys()]) {
    if (key.startsWith(`${songId}|`)) chartCache.delete(key);
  }
}

export function putChart(songId, chart) {
  chartCache.set(chartKey(songId, { ...chart, source: chart.source }), chart);
}

/** Curated list; ids are stable so scores/history line up across sessions. */
export function curatedSongs() {
  return CURATED.map((entry) => ({
    id: `yt:${entry.id}`,
    kind: "youtube",
    videoId: entry.id,
    title: entry.title,
    channel: entry.channel,
    thumbnail: thumbnailUrl(entry.id),
    duration: 0,
  }));
}

export function songFromHistoryEntry(entry) {
  const [prefix, ...rest] = String(entry.songId).split(":");
  const value = rest.join(":");
  if (prefix === "yt") {
    return {
      id: entry.songId,
      kind: "youtube",
      videoId: value,
      title: entry.title,
      channel: entry.channel,
      thumbnail: entry.thumbnail,
      duration: entry.duration,
    };
  }
  if (prefix === "demo") {
    return demoPlaceholderSong();
  }
  const cached = analysisCache.get(entry.songId);
  return {
    id: entry.songId,
    kind: "local",
    title: entry.title,
    channel: entry.channel,
    thumbnail: entry.thumbnail,
    duration: entry.duration,
    audio: cached?.audio ?? null,
  };
}

/** True when a library entry still has playable audio in this session. */
export function hasAudio(song) {
  return Boolean(song?.audio) || song?.kind === "youtube";
}
