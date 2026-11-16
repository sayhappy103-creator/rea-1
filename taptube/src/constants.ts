import {
  Difficulty,
  LineCount,
  NoteSpeed,
  RankGrade,
  Verdict,
  YtItem,
} from "./types";

/**
 * Exact REA-verified scoring, fever, grade & reward tables reconstructed from
 * TapTube 1.6.5 (`NoteConfig::getScoreScaling`, `NoteConfig::computeGameRasult`,
 * `PlayScene::onTakeScoreEventCallback`).
 */
export const BASE_SCORE_POINT = 100.0;

export const DIFFICULTY_SCALE: Record<Difficulty, number> = {
  easy: 1.0,
  normal: 1.1,
  hard: 1.2,
  extreme: 1.3,
  crazy: 1.3,
};

export const SPEED_SCALE: Record<NoteSpeed, number> = {
  1: 1.0,
  2: 1.05,
  3: 1.1,
  4: 1.15,
  5: 1.2,
  6: 1.25,
  7: 1.3,
  8: 1.35,
  9: 1.4,
  10: 1.45,
};

export const LINE_SCALE: Record<LineCount, number> = {
  3: 1.0,
  4: 1.01,
  5: 1.02,
  6: 1.03,
};

export function getLevelBonusMultiplier(level: number): number {
  const clamped = Math.max(1, Math.min(100, Math.floor(level)));
  return Number((1.0 + (clamped - 1) * 0.01).toFixed(4));
}

export function getScoreScaling(
  level: number,
  difficulty: Difficulty,
  speed: NoteSpeed,
  lines: LineCount
): number {
  return Number(
    (
      getLevelBonusMultiplier(level) *
      DIFFICULTY_SCALE[difficulty] *
      SPEED_SCALE[speed] *
      LINE_SCALE[lines]
    ).toFixed(4)
  );
}

export function getScorePointBase(
  level: number,
  difficulty: Difficulty,
  speed: NoteSpeed,
  lines: LineCount
): number {
  return BASE_SCORE_POINT * getScoreScaling(level, difficulty, speed, lines);
}

/**
 * Combo & Fever progression (`ComboPerFeverStage = 24`, 8 Fever Bar segments = 3 combo/bar).
 * Stage 0..5 => x1, x2, x3, x4, x5, x10 MAX FEVER!
 */
export const COMBO_PER_FEVER_STAGE = 24;
export const FEVER_BAR_SEGMENTS = 8;
export const COMBO_PER_FEVER_SEGMENT = 3;

export const FEVER_STAGE_MULTIPLIERS = [1.0, 2.0, 3.0, 4.0, 5.0, 10.0] as const;

export interface StageTheme {
  name: string;
  primary: string;
  glow: string;
  core: string;
  rgb: [number, number, number];
}

export const STAGE_NOTE_THEMES: readonly StageTheme[] = [
  {
    name: "blue",
    primary: "#28a8ff",
    glow: "rgba(40, 168, 255, 0.85)",
    core: "#b8e6ff",
    rgb: [40, 168, 255],
  },
  {
    name: "green",
    primary: "#2ee87a",
    glow: "rgba(46, 232, 122, 0.85)",
    core: "#c5ffde",
    rgb: [46, 232, 122],
  },
  {
    name: "yellow",
    primary: "#ffd426",
    glow: "rgba(255, 212, 38, 0.88)",
    core: "#fff5b8",
    rgb: [255, 212, 38],
  },
  {
    name: "orange",
    primary: "#ff8524",
    glow: "rgba(255, 133, 36, 0.88)",
    core: "#ffe0bd",
    rgb: [255, 133, 36],
  },
  {
    name: "red",
    primary: "#ff3355",
    glow: "rgba(255, 51, 85, 0.9)",
    core: "#ffc4cf",
    rgb: [255, 51, 85],
  },
  {
    name: "violet",
    primary: "#d442ff",
    glow: "rgba(212, 66, 255, 0.95)",
    core: "#f7ccff",
    rgb: [212, 66, 255],
  },
];

export const LANE_LIGHT_COLORS: Record<LineCount, string[]> = {
  3: ["#ff3b5c", "#2ee87a", "#28a8ff"],
  4: ["#ff3b5c", "#ffd426", "#2ee87a", "#28a8ff"],
  5: ["#ff3b5c", "#ffd426", "#2ee87a", "#28a8ff", "#c84bff"],
  6: ["#ff3b5c", "#ff8c24", "#ffd426", "#2ee87a", "#28a8ff", "#ff47b8"],
};

export const VERDICT_MULTIPLIERS: Record<Verdict, number> = {
  perfect: 5.0,
  great: 4.0,
  cool: 3.0,
  good: 2.0,
  miss: 0.0,
};

export const HOLD_TICK_MULTIPLIER = 5.0;

/** Hit timing windows in milliseconds */
export const TIMING_WINDOWS_MS = {
  perfect: 45,
  great: 82,
  cool: 118,
  good: 155,
};

/**
 * Exact TapTube 1.6.5 weighted Hit Rating % & Grade formula (`NoteConfig::computeGameRasult`):
 * Numerator = (perfect*8 + great*6 + cool*4 + good*2 + holdTicks*1) * 100
 * Denominator = (regularNotes*8 + holdTicks*1)
 */
export function computeHitRatingPercent(
  perfect: number,
  great: number,
  cool: number,
  good: number,
  miss: number,
  holdTicks: number
): number {
  const regularTotal = perfect + great + cool + good + miss;
  const denom = regularTotal * 8 + holdTicks;
  if (denom <= 0) return 0;
  const numer =
    (perfect * 8 + great * 6 + cool * 4 + good * 2 + holdTicks) * 100.0;
  return Math.min(100, Math.max(0, numer / denom));
}

export function computeRankGrade(
  hitRatingPercent: number,
  completed: boolean
): RankGrade {
  if (!completed) return "F";
  if (hitRatingPercent >= 100.0) return "SSS";
  if (hitRatingPercent >= 99.5) return "SS";
  if (hitRatingPercent >= 98.0) return "S";
  if (hitRatingPercent >= 92.0) return "A";
  if (hitRatingPercent >= 78.0) return "B";
  if (hitRatingPercent >= 60.0) return "C";
  if (hitRatingPercent >= 40.0) return "D";
  return "F";
}

/** Required EXP to advance from `level` to `level + 1` */
export function getRequiredExpForLevel(level: number): number {
  return Math.floor(60 + (level - 1) * 45 + Math.pow(level - 1, 1.35) * 18);
}

/** Disc recharge interval: 5 minutes (300,000 ms) */
export const DISC_RECHARGE_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_DISCS = 10;

/** 7-Day Daily Attendance Rewards (sent to Mailbox) */
export const ATTENDANCE_REWARDS = [
  { day: 1, kind: "coin" as const, amount: 300 },
  { day: 2, kind: "disc" as const, amount: 5 },
  { day: 3, kind: "ruby" as const, amount: 5 },
  { day: 4, kind: "coin" as const, amount: 600 },
  { day: 5, kind: "disc" as const, amount: 10 },
  { day: 6, kind: "ruby" as const, amount: 10 },
  { day: 7, kind: "gacha" as const, amount: 1 },
];

/** Gacha Capsule Reward Pool (Zero IAP — earned freely!) */
export const GACHA_POOL = [
  { kind: "coin" as const, amount: 500, weight: 26 },
  { kind: "coin" as const, amount: 1200, weight: 18 },
  { kind: "coin" as const, amount: 3000, weight: 8 },
  { kind: "disc" as const, amount: 5, weight: 20 },
  { kind: "disc" as const, amount: 15, weight: 10 },
  { kind: "ruby" as const, amount: 5, weight: 10 },
  { kind: "ruby" as const, amount: 15, weight: 5 },
  { kind: "ticket" as const, amount: 24, weight: 3 }, // 1-Day Unlimited Discs
];

export const COUNTRIES = [
  { code: "TH", name: "Thailand (ไทย)", flag: "🇹🇭" },
  { code: "KR", name: "South Korea (한국)", flag: "🇰🇷" },
  { code: "JP", name: "Japan (日本)", flag: "🇯🇵" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "TW", name: "Taiwan", flag: "🇹🇼" },
  { code: "ID", name: "Indonesia", flag: "🇮🇩" },
  { code: "VN", name: "Vietnam", flag: "🇻🇳" },
  { code: "PH", name: "Philippines", flag: "🇵🇭" },
  { code: "SG", name: "Singapore", flag: "🇸🇬" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
];

/**
 * Curated embeddable rhythm-friendly YouTube Music & NCS/Electronic/Pop/Thai/Anime/K-Pop catalog
 * so Weekly Best & Recommend tabs have vibrant tracks immediately on first launch!
 */
export const CURATED_SONGS: YtItem[] = [
  {
    videoId: "K4DyBUG242c",
    title: "Cartoon, Jéja - On & On (feat. Daniel Levi) [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 208,
    thumbnail: "https://i.ytimg.com/vi/K4DyBUG242c/hqdefault.jpg",
    viewCount: 515000000,
    bpm: 174,
    genre: "EDM",
  },
  {
    videoId: "AOeY-nDp7hI",
    title: "Alan Walker - Spectre [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 227,
    thumbnail: "https://i.ytimg.com/vi/AOeY-nDp7hI/hqdefault.jpg",
    viewCount: 340000000,
    bpm: 128,
    genre: "EDM",
  },
  {
    videoId: "bM7SZ5SBzyY",
    title: "Alan Walker - Fade [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 260,
    thumbnail: "https://i.ytimg.com/vi/bM7SZ5SBzyY/hqdefault.jpg",
    viewCount: 495000000,
    bpm: 90,
    genre: "EDM",
  },
  {
    videoId: "J2X5mJ3HDYE",
    title: "DEAF KEV - Invincible [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 273,
    thumbnail: "https://i.ytimg.com/vi/J2X5mJ3HDYE/hqdefault.jpg",
    viewCount: 255000000,
    bpm: 100,
    genre: "Electro",
  },
  {
    videoId: "p7ZsBPK656s",
    title: "Disfigure - Blank [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 209,
    thumbnail: "https://i.ytimg.com/vi/p7ZsBPK656s/hqdefault.jpg",
    viewCount: 290000000,
    bpm: 140,
    genre: "Melodic Bass",
  },
  {
    videoId: "TW9d8vYrVFQ",
    title: "Elektronomia - Sky High [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 238,
    thumbnail: "https://i.ytimg.com/vi/TW9d8vYrVFQ/hqdefault.jpg",
    viewCount: 245000000,
    bpm: 128,
    genre: "Progressive House",
  },
  {
    videoId: "3nQNiWdeH2Q",
    title: "Janji - Heroes Tonight (feat. Johnning) [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 208,
    thumbnail: "https://i.ytimg.com/vi/3nQNiWdeH2Q/hqdefault.jpg",
    viewCount: 380000000,
    bpm: 128,
    genre: "EDM",
  },
  {
    videoId: "yJg-Y5byMMw",
    title: "Warriyo - Mortals (feat. Laura Brehm) [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 230,
    thumbnail: "https://i.ytimg.com/vi/yJg-Y5byMMw/hqdefault.jpg",
    viewCount: 320000000,
    bpm: 138,
    genre: "Trap / Orchestral",
  },
  {
    videoId: "__CRWE-L45k",
    title: "Electro-Light - Symbolism [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 290,
    thumbnail: "https://i.ytimg.com/vi/__CRWE-L45k/hqdefault.jpg",
    viewCount: 265000000,
    bpm: 130,
    genre: "Electro House",
  },
  {
    videoId: "n8X9_MgEdCg",
    title: "TheFatRat - Unity",
    channelTitle: "TheFatRat",
    durationSec: 249,
    thumbnail: "https://i.ytimg.com/vi/n8X9_MgEdCg/hqdefault.jpg",
    viewCount: 270000000,
    bpm: 105,
    genre: "Glitch Hop",
  },
  {
    videoId: "cMg8KaMdDYo",
    title: "TheFatRat - Monody (feat. Laura Brehm)",
    channelTitle: "TheFatRat",
    durationSec: 291,
    thumbnail: "https://i.ytimg.com/vi/cMg8KaMdDYo/hqdefault.jpg",
    viewCount: 245000000,
    bpm: 107,
    genre: "Electronic",
  },
  {
    videoId: "B7xai5u_tnk",
    title: "TheFatRat - Xenogenesis (Outro Song)",
    channelTitle: "TheFatRat",
    durationSec: 237,
    thumbnail: "https://i.ytimg.com/vi/B7xai5u_tnk/hqdefault.jpg",
    viewCount: 185000000,
    bpm: 145,
    genre: "Future Bass",
  },
  {
    videoId: "f2xGxd9xPYA",
    title: "Different Heaven & EH!DE - My Heart [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 267,
    thumbnail: "https://i.ytimg.com/vi/f2xGxd9xPYA/hqdefault.jpg",
    viewCount: 310000000,
    bpm: 174,
    genre: "Drumstep",
  },
  {
    videoId: "VtKbiyyVZks",
    title: "Tobu - Hope [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 286,
    thumbnail: "https://i.ytimg.com/vi/VtKbiyyVZks/hqdefault.jpg",
    viewCount: 190000000,
    bpm: 128,
    genre: "House",
  },
  {
    videoId: "7wNb0pHyGuI",
    title: "Tobu & Itro - Sunburst [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 190,
    thumbnail: "https://i.ytimg.com/vi/7wNb0pHyGuI/hqdefault.jpg",
    viewCount: 125000000,
    bpm: 128,
    genre: "Melodic House",
  },
  {
    videoId: "S19UcWdOA-I",
    title: "Lost Sky - Fearless pt.II (feat. Chris Linton) [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 194,
    thumbnail: "https://i.ytimg.com/vi/S19UcWdOA-I/hqdefault.jpg",
    viewCount: 260000000,
    bpm: 152,
    genre: "Trap",
  },
  {
    videoId: "LHvYrn3FAgI",
    title: "Julius Dreisig & Zeus X Crona - Invisible [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 201,
    thumbnail: "https://i.ytimg.com/vi/LHvYrn3FAgI/hqdefault.jpg",
    viewCount: 165000000,
    bpm: 150,
    genre: "Trap",
  },
  {
    videoId: "QglaLzo_aPk",
    title: "Sub Urban - Cradles [NCS Release]",
    channelTitle: "NoCopyrightSounds",
    durationSec: 210,
    thumbnail: "https://i.ytimg.com/vi/QglaLzo_aPk/hqdefault.jpg",
    viewCount: 145000000,
    bpm: 158,
    genre: "Alternative Bass",
  },
];
