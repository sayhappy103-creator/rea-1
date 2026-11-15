/**
 * Persistent state: settings, scores, play history, custom charts and imported
 * audio references. Everything lives in localStorage; a missing/corrupt entry
 * is replaced by its default instead of failing the boot.
 */

import { detectLanguage, LANGUAGES } from "./i18n.js";
import { clamp } from "./util.js";

export const STORAGE_NAMESPACE = "taptube.web.v1";
export const SETTINGS_VERSION = 1;

const KEYS = {
  settings: `${STORAGE_NAMESPACE}.settings`,
  scores: `${STORAGE_NAMESPACE}.scores`,
  history: `${STORAGE_NAMESPACE}.history`,
  charts: `${STORAGE_NAMESPACE}.charts`,
  files: `${STORAGE_NAMESPACE}.files`,
  language: `${STORAGE_NAMESPACE}.language`,
};

export const LANE_OPTIONS = [4, 5, 6];
export const SPEED_OPTIONS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];
export const OFFSET_LIMIT = 300;

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    language: "th",
    lanes: 4,
    speed: 3,
    offsetMs: 0,
    hitSfx: true,
    vibrate: true,
    showJudgment: true,
    backgroundDim: 0.55,
    autoplay: false,
    mirror: false,
    longNotes: true,
    slideNotes: true,
    showFps: false,
    proxyUrl: "",
    apiKey: "",
    audioVolume: 0.9,
    sfxVolume: 0.6,
    lastDifficulty: "normal",
  };
}

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

function coerceSettings(raw) {
  const base = defaultSettings();
  if (typeof raw !== "object" || raw === null) return base;
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    if (typeof base[key] === "number" && isFiniteNumber(value))
      merged[key] = value;
    else if (typeof base[key] === "boolean" && typeof value === "boolean")
      merged[key] = value;
    else if (typeof base[key] === "string" && typeof value === "string")
      merged[key] = value;
  }
  merged.lanes = LANE_OPTIONS.includes(merged.lanes)
    ? merged.lanes
    : base.lanes;
  merged.speed = SPEED_OPTIONS.includes(merged.speed)
    ? merged.speed
    : clamp(merged.speed, 1, 8);
  merged.offsetMs = clamp(
    Math.round(merged.offsetMs),
    -OFFSET_LIMIT,
    OFFSET_LIMIT,
  );
  merged.backgroundDim = clamp(merged.backgroundDim, 0, 0.9);
  merged.audioVolume = clamp(merged.audioVolume, 0, 1);
  merged.sfxVolume = clamp(merged.sfxVolume, 0, 1);
  if (!LANGUAGES.some(({ id }) => id === merged.language)) {
    merged.language = detectLanguage(globalThis.navigator?.language);
  }
  return merged;
}

/** Safe localStorage facade; a blocked store degrades to memory only. */
function createStore() {
  let memory = new Map();
  let available = true;
  try {
    const probe = `${STORAGE_NAMESPACE}.probe`;
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
  } catch {
    available = false;
  }

  return {
    get available() {
      return available;
    },
    read(key) {
      if (!available) return memory.get(key) ?? null;
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      if (!available) {
        memory.set(key, value);
        return;
      }
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        available = false;
        memory = new Map([[key, value]]);
      }
    },
    remove(key) {
      memory.delete(key);
      if (!available) return;
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        /* store already unusable */
      }
    },
  };
}

const store = createStore();

export const storageAvailable = () => store.available;

function readJson(key, fallback) {
  const raw = store.read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  store.write(key, JSON.stringify(value));
}

/* ------------------------------------------------------------------ settings */

let settings = coerceSettings(readJson(KEYS.settings, null));
const settingsListeners = new Set();

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = coerceSettings({ ...settings, ...patch });
  writeJson(KEYS.settings, settings);
  for (const listener of settingsListeners) listener(settings);
  return settings;
}

export function onSettingsChange(listener) {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

/* ------------------------------------------------------------------ language */

export function getStoredLanguage() {
  const raw = store.read(KEYS.language);
  return LANGUAGES.some(({ id }) => id === raw) ? raw : null;
}

export function storeLanguage(language) {
  store.write(KEYS.language, language);
}

/* -------------------------------------------------------------------- scores */

/**
 * @typedef {object} ScoreRecord
 * @property {number} score
 * @property {number} accuracy
 * @property {number} maxCombo
 * @property {string} rank
 * @property {string} difficulty
 * @property {number} lanes
 * @property {number} playedAt
 */

/** @returns {Record<string, ScoreRecord>} */
export function getScores() {
  const raw = readJson(KEYS.scores, {});
  return typeof raw === "object" && raw !== null ? raw : {};
}

export function saveScore(songId, record) {
  const scores = getScores();
  const previous = scores[songId];
  const better =
    previous === undefined ||
    record.score > previous.score ||
    (record.score === previous.score && record.accuracy > previous.accuracy);
  if (better) {
    scores[songId] = record;
    writeJson(KEYS.scores, scores);
  }
  return { scores, improved: better, previous: previous ?? null };
}

export function clearScores() {
  writeJson(KEYS.scores, {});
}

/* ------------------------------------------------------------------- history */

const HISTORY_LIMIT = 40;

/** @returns {Array<{songId:string,title:string,channel:string,thumbnail:string,duration:number,playedAt:number,score:number,accuracy:number,rank:string,difficulty:string,lanes:number}>} */
export function getHistory() {
  const raw = readJson(KEYS.history, []);
  return Array.isArray(raw) ? raw.filter((entry) => entry?.songId) : [];
}

export function pushHistory(entry) {
  const history = getHistory().filter((item) => item.songId !== entry.songId);
  history.unshift({ ...entry, playedAt: Date.now() });
  writeJson(KEYS.history, history.slice(0, HISTORY_LIMIT));
  return history;
}

export function clearHistory() {
  writeJson(KEYS.history, []);
}

/* -------------------------------------------------------------------- charts */

/** Custom charts keyed by song id. Values embed the full chart document. */
export function getCustomCharts() {
  const raw = readJson(KEYS.charts, {});
  return typeof raw === "object" && raw !== null ? raw : {};
}

export function saveCustomChart(songId, chart) {
  const charts = getCustomCharts();
  charts[songId] = chart;
  writeJson(KEYS.charts, charts);
  return charts;
}

export function deleteCustomChart(songId) {
  const charts = getCustomCharts();
  delete charts[songId];
  writeJson(KEYS.charts, charts);
  return charts;
}

/* --------------------------------------------------------------- local files */

/**
 * Imported audio files are described by metadata only. The File handle itself
 * cannot be persisted, so the user re-picks the file when reopening a track
 * from the library (the chart is reused, not re-analysed).
 */
export function getLocalFiles() {
  const raw = readJson(KEYS.files, []);
  return Array.isArray(raw) ? raw.filter((entry) => entry?.id) : [];
}

export function rememberLocalFile(entry) {
  const files = getLocalFiles().filter((item) => item.id !== entry.id);
  files.unshift({ ...entry, addedAt: Date.now() });
  writeJson(KEYS.files, files.slice(0, 20));
  return files;
}

export function forgetLocalFile(id) {
  const files = getLocalFiles().filter((item) => item.id !== id);
  writeJson(KEYS.files, files);
  return files;
}

/* --------------------------------------------------------------------- reset */

export function resetScoresAndHistory() {
  clearScores();
  clearHistory();
}

export function resetAll() {
  for (const key of Object.values(KEYS)) store.remove(key);
  settings = coerceSettings(null);
  writeJson(KEYS.settings, settings);
  for (const listener of settingsListeners) listener(settings);
  return settings;
}

/** True when this browser refuses persistence (private mode, quota). */
export const persistenceWarningKey = "error.noStorage";
