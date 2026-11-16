export type Language = "th" | "en" | "ja" | "ko";

export type Difficulty = "easy" | "normal" | "hard" | "extreme" | "crazy";
export type LineCount = 3 | 4 | 5 | 6;
export type NoteSpeed = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type PlayOrientation = "portrait" | "landscape";
export type Verdict = "perfect" | "great" | "cool" | "good" | "miss";
export type RankGrade = "SSS" | "SS" | "S" | "A" | "B" | "C" | "D" | "F";

export type LobbyTab =
  | "weekly"
  | "search"
  | "recommend"
  | "favorites"
  | "history"
  | "notebox"
  | "ranking";

export type SearchCategory = "all" | "music" | "author";
export type DurationFilter = "all" | "less6m" | "more6m";
export type SortMode = "popular" | "newest" | "npm";

export type VideoBgMode = "video" | "image" | "slideshow" | "none";
export type VideoQualityMode = "auto" | "high" | "middle" | "low";
export type StreamingNetworkMode = "always" | "wifi";
export type TouchSoundId = 1 | 2 | 3 | 4 | 5;

export type NoteKind = "tap" | "long" | "slide";

export interface SlideWaypoint {
  offsetMs: number;
  lane: number;
}

export interface ChartNote {
  id: string;
  timeMs: number;
  lane: number;
  kind: NoteKind;
  durationMs?: number;
  slidePath?: SlideWaypoint[];
}

export interface YtItem {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSec: number;
  thumbnail: string;
  viewCount?: number;
  publishedAt?: string;
  bpm?: number;
  genre?: string;
}

export interface CustomNoteChart {
  id: string;
  videoId: string;
  videoTitle: string;
  videoChannel: string;
  videoThumbnail: string;
  videoDurationSec: number;
  title: string;
  author: string;
  lines: LineCount;
  npm: number;
  startMs: number;
  endMs: number;
  notes: ChartNote[];
  useLong: boolean;
  useSlide: boolean;
  ratingSum: number;
  ratingCount: number;
  playCount: number;
  createdAt: number;
  isMine?: boolean;
}

export interface ReplayEvent {
  timeMs: number;
  type: "down" | "move" | "up";
  lane: number;
  pointerId: number;
}

export interface ReplayRecord {
  id: string;
  videoId: string;
  videoTitle: string;
  videoThumbnail: string;
  playerName: string;
  country: string;
  score: number;
  grade: RankGrade;
  hitRating: number;
  maxCombo: number;
  npm: number;
  difficulty: Difficulty;
  lines: LineCount;
  speed: NoteSpeed;
  useDoubleNote: boolean;
  useLongNote: boolean;
  useSlideNote: boolean;
  customChartId?: string;
  events: ReplayEvent[];
  createdAt: number;
}

export type MailKind =
  | "attendance"
  | "s_grade"
  | "levelup"
  | "note_revenue"
  | "replay_revenue"
  | "welcome";

export type RewardKind = "coin" | "ruby" | "disc" | "ticket" | "gacha";

export interface MailItem {
  id: string;
  kind: MailKind;
  titleKey: string;
  titleParam?: string | number;
  rewardKind: RewardKind;
  amount: number; // for ticket: duration hours (24, 168, 720)
  createdAt: number;
  expiresAt: number;
}

export interface SongBestRecord {
  videoId: string;
  bestScore: number;
  bestGrade: RankGrade;
  bestCombo: number;
  bestHitRating: number;
  playCount: number;
  lastPlayedAt: number;
}

export interface GameSettings {
  language: Language;
  streamingMode: StreamingNetworkMode;
  countryCode: string;
  youtubeApiKey: string;
  normalFx: boolean;
  gameFxVolume: number; // 0..100
  missVibration: boolean;
  touchVibration: boolean;
  touchSound: TouchSoundId;
  noteSyncMs: number; // -500..+500
  videoBgMode: VideoBgMode;
  videoQuality: VideoQualityMode;
  videoZoom: number; // 50..100 (%)
  videoBrightness: number; // 15..100 (%)
  // Default pre-game preferences
  difficulty: Difficulty;
  speed: NoteSpeed;
  lines: LineCount;
  orientation: PlayOrientation;
  useDoubleNote: boolean;
  useLongNote: boolean;
  useSlideNote: boolean;
}

export interface UserState {
  nickname: string;
  level: number;
  exp: number;
  rubies: number;
  coins: number;
  discs: number;
  maxDiscs: number;
  lastDiscChargeAt: number;
  unlimitedTicketUntil: number; // epoch ms
  favoriteSlots: number;
  historySlots: number;
  attendanceDay: number; // 0..6
  lastAttendanceDate: string; // YYYY-MM-DD
  lastSGradeDate: string; // YYYY-MM-DD
  sGradeStreak: number;
  favorites: YtItem[];
  history: YtItem[];
  records: Record<string, SongBestRecord>;
  mailbox: MailItem[];
  customCharts: CustomNoteChart[];
  ratedChartIds: Record<string, number>;
  replays: ReplayRecord[];
  tempEditorDraft?: {
    video: YtItem;
    lines: LineCount;
    startMs: number;
    endMs: number;
    notes: ChartNote[];
    title: string;
    savedAt: number;
  };
}

export interface GamePlayOptions {
  difficulty: Difficulty;
  speed: NoteSpeed;
  lines: LineCount;
  orientation: PlayOrientation;
  useDoubleNote: boolean;
  useLongNote: boolean;
  useSlideNote: boolean;
  customChart?: CustomNoteChart;
  isReplay?: boolean;
  replayData?: ReplayRecord;
  isTestPlay?: boolean;
}

export interface GameResultData {
  video: YtItem;
  options: GamePlayOptions;
  score: number;
  scoreScaling: number;
  perfect: number;
  great: number;
  cool: number;
  good: number;
  miss: number;
  holdTicks: number;
  totalNotes: number;
  maxCombo: number;
  hitRating: number;
  npm: number;
  grade: RankGrade;
  coinsEarned: number;
  expEarned: number;
  rubiesEarned: number;
  levelsGained: number;
  oldLevel: number;
  newLevel: number;
  sGradeDailyTriggered: boolean;
  playSeconds: number;
  isNewRecord: boolean;
  replayRecord?: ReplayRecord;
}

export interface TapTubeNativeBridge {
  searchYouTube?: (
    query: string,
    category: string,
    regionCode: string,
    apiKey: string
  ) => string;
  fetchOEmbed?: (urlOrId: string) => string;
  vibrate?: (durationMs: number) => void;
  setOrientation?: (mode: string) => void;
  shareText?: (title: string, text: string) => void;
  getSharedYoutubeUrl?: () => string;
  isAndroidApp?: () => boolean;
}

declare global {
  interface Window {
    TapTubeNative?: TapTubeNativeBridge;
    onYouTubeIframeAPIReady?: () => void;
    onTapTubeSharedUrl?: (url: string) => void;
    YT?: any;
  }
}
