import {
  ATTENDANCE_REWARDS,
  CURATED_SONGS,
  DEFAULT_MAX_DISCS,
  DISC_RECHARGE_MS,
  GACHA_POOL,
  getRequiredExpForLevel,
} from "./constants";
import { generateBasicChart } from "./beatgen";
import {
  CustomNoteChart,
  GameSettings,
  MailItem,
  RankGrade,
  ReplayRecord,
  RewardKind,
  UserState,
  YtItem,
} from "./types";

const SETTINGS_KEY = "taptube_165_settings_v1";
const USER_KEY = "taptube_165_user_v1";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export const DEFAULT_SETTINGS: GameSettings = {
  language: "th",
  streamingMode: "always",
  countryCode: "TH",
  youtubeApiKey: "",
  normalFx: true,
  gameFxVolume: 85,
  missVibration: true,
  touchVibration: true,
  touchSound: 1,
  noteSyncMs: 0,
  videoBgMode: "video",
  videoQuality: "auto",
  videoZoom: 100,
  videoBrightness: 65,
  difficulty: "normal",
  speed: 3,
  lines: 4,
  orientation: "portrait",
  useDoubleNote: true,
  useLongNote: true,
  useSlideNote: true,
};

function createStarterCustomCharts(): CustomNoteChart[] {
  const s1 = CURATED_SONGS[0];
  const s2 = CURATED_SONGS[1];
  const c1 = generateBasicChart(s1, "hard", 4, true, true, true);
  const c2 = generateBasicChart(s2, "extreme", 5, true, true, true);
  return [
    {
      id: "chart_builtin_onon_4k",
      videoId: s1.videoId,
      videoTitle: s1.title,
      videoChannel: s1.channelTitle,
      videoThumbnail: s1.thumbnail,
      videoDurationSec: s1.durationSec,
      title: "On & On [4K Hyper Mix]",
      author: "TapTubeMaster",
      lines: 4,
      npm: c1.npm,
      startMs: 0,
      endMs: s1.durationSec * 1000,
      notes: c1.notes,
      useLong: true,
      useSlide: true,
      ratingSum: 24,
      ratingCount: 5,
      playCount: 128,
      createdAt: Date.now() - 86400000 * 5,
      isMine: false,
    },
    {
      id: "chart_builtin_spectre_5k",
      videoId: s2.videoId,
      videoTitle: s2.title,
      videoChannel: s2.channelTitle,
      videoThumbnail: s2.thumbnail,
      videoDurationSec: s2.durationSec,
      title: "Spectre [5K Neon Festival]",
      author: "RhythmTH",
      lines: 5,
      npm: c2.npm,
      startMs: 0,
      endMs: s2.durationSec * 1000,
      notes: c2.notes,
      useLong: true,
      useSlide: true,
      ratingSum: 29,
      ratingCount: 6,
      playCount: 94,
      createdAt: Date.now() - 86400000 * 2,
      isMine: false,
    },
  ];
}

function createStarterReplays(): ReplayRecord[] {
  return CURATED_SONGS.slice(0, 5).flatMap((song, idx) => [
    {
      id: `rep_seed_${song.videoId}_1`,
      videoId: song.videoId,
      videoTitle: song.title,
      videoThumbnail: song.thumbnail,
      playerName: ["NongBeatTH", "SkyTapKR", "HaruRhythm", "NeonFingers", "ChiangMaiPro"][idx],
      country: ["TH", "KR", "JP", "TH", "TH"][idx],
      score: 685000 - idx * 41000,
      grade: (idx === 0 ? "SSS" : idx < 3 ? "SS" : "S") as RankGrade,
      hitRating: idx === 0 ? 100 : 99.6 - idx * 0.3,
      maxCombo: 260 - idx * 18,
      npm: 148,
      difficulty: "hard",
      lines: 4,
      speed: 4,
      useDoubleNote: true,
      useLongNote: true,
      useSlideNote: true,
      events: [],
      createdAt: Date.now() - idx * 3600000 * 6,
    },
    {
      id: `rep_seed_${song.videoId}_2`,
      videoId: song.videoId,
      videoTitle: song.title,
      videoThumbnail: song.thumbnail,
      playerName: ["TapQueen", "RhythmFox", "KPopTapper", "BeatWave", "MintMelody"][idx],
      country: ["TH", "US", "KR", "JP", "TH"][idx],
      score: 512000 - idx * 29000,
      grade: "S",
      hitRating: 98.4 - idx * 0.2,
      maxCombo: 195 - idx * 14,
      npm: 132,
      difficulty: "normal",
      lines: 4,
      speed: 3,
      useDoubleNote: true,
      useLongNote: true,
      useSlideNote: true,
      events: [],
      createdAt: Date.now() - idx * 3600000 * 11,
    },
  ]);
}

function createInitialUserState(): UserState {
  const now = Date.now();
  const threeDays = 3 * 24 * 3600 * 1000;
  return {
    nickname: "TapPlayer",
    level: 1,
    exp: 0,
    rubies: 50,
    coins: 2500,
    discs: DEFAULT_MAX_DISCS,
    maxDiscs: DEFAULT_MAX_DISCS,
    lastDiscChargeAt: now,
    unlimitedTicketUntil: 0,
    favoriteSlots: 15,
    historySlots: 20,
    attendanceDay: 0,
    lastAttendanceDate: "",
    lastSGradeDate: "",
    sGradeStreak: 0,
    favorites: [CURATED_SONGS[0], CURATED_SONGS[1]],
    history: [],
    records: {},
    mailbox: [
      {
        id: "mail_welcome_1",
        kind: "welcome",
        titleKey: "mail_welcome",
        rewardKind: "gacha",
        amount: 1,
        createdAt: now,
        expiresAt: now + threeDays,
      },
    ],
    customCharts: createStarterCustomCharts(),
    ratedChartIds: {},
    replays: createStarterReplays(),
  };
}

class AppStore {
  public settings: GameSettings;
  public user: UserState;
  private listeners = new Set<() => void>();

  constructor() {
    this.settings = this.loadSettings();
    this.user = this.loadUser();
    this.tickDiscRecharge();
    this.pruneExpiredMail();
  }

  private loadSettings(): GameSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS };
  }

  private loadUser(): UserState {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const base = createInitialUserState();
        return { ...base, ...parsed };
      }
    } catch {
      // ignore
    }
    return createInitialUserState();
  }

  public save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      localStorage.setItem(USER_KEY, JSON.stringify(this.user));
    } catch {
      // ignore storage quota errors
    }
    this.listeners.forEach((fn) => fn());
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public updateSettings(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.save();
  }

  public hasUnlimitedDiscs(): boolean {
    return this.user.unlimitedTicketUntil > Date.now();
  }

  public tickDiscRecharge(): number {
    const now = Date.now();
    if (this.user.discs >= this.user.maxDiscs) {
      this.user.lastDiscChargeAt = now;
      return 0;
    }
    const elapsed = now - this.user.lastDiscChargeAt;
    if (elapsed >= DISC_RECHARGE_MS) {
      const gained = Math.floor(elapsed / DISC_RECHARGE_MS);
      this.user.discs = Math.min(this.user.maxDiscs, this.user.discs + gained);
      this.user.lastDiscChargeAt =
        this.user.discs >= this.user.maxDiscs
          ? now
          : this.user.lastDiscChargeAt + gained * DISC_RECHARGE_MS;
      this.save();
    }
    const rem = DISC_RECHARGE_MS - (now - this.user.lastDiscChargeAt);
    return Math.max(0, Math.ceil(rem / 1000));
  }

  public consumeDisc(): boolean {
    this.tickDiscRecharge();
    if (this.hasUnlimitedDiscs()) return true;
    if (this.user.discs <= 0) return false;
    if (this.user.discs === this.user.maxDiscs) {
      this.user.lastDiscChargeAt = Date.now();
    }
    this.user.discs -= 1;
    this.save();
    return true;
  }

  public refundDisc(): void {
    if (this.hasUnlimitedDiscs()) return;
    this.user.discs = Math.min(this.user.maxDiscs + 5, this.user.discs + 1);
    this.save();
  }

  public checkDailyAttendance(): { triggered: boolean; day: number } {
    const today = todayIso();
    if (this.user.lastAttendanceDate === today) {
      return { triggered: false, day: this.user.attendanceDay };
    }
    const nextDayIdx = this.user.attendanceDay % 7;
    const reward = ATTENDANCE_REWARDS[nextDayIdx];
    this.user.lastAttendanceDate = today;
    this.user.attendanceDay = (nextDayIdx + 1) % 7;
    const now = Date.now();
    this.user.mailbox.unshift({
      id: `mail_att_${now}`,
      kind: "attendance",
      titleKey: "mail_attendance",
      titleParam: reward.day,
      rewardKind: reward.kind,
      amount: reward.amount,
      createdAt: now,
      expiresAt: now + 3 * 24 * 3600 * 1000,
    });
    this.save();
    return { triggered: true, day: reward.day };
  }

  public pruneExpiredMail(): void {
    const now = Date.now();
    this.user.mailbox = this.user.mailbox.filter((m) => m.expiresAt > now);
  }

  public applyReward(kind: RewardKind, amount: number): void {
    if (kind === "coin") this.user.coins += amount;
    else if (kind === "ruby") this.user.rubies += amount;
    else if (kind === "disc") this.user.discs += amount;
    else if (kind === "ticket") {
      const base = Math.max(Date.now(), this.user.unlimitedTicketUntil);
      this.user.unlimitedTicketUntil = base + amount * 3600 * 1000;
    }
    this.save();
  }

  public rollGacha(): { kind: Exclude<RewardKind, "gacha">; amount: number } {
    const totalWeight = GACHA_POOL.reduce((acc, item) => acc + item.weight, 0);
    let r = Math.random() * totalWeight;
    for (const item of GACHA_POOL) {
      r -= item.weight;
      if (r <= 0) {
        this.applyReward(item.kind, item.amount);
        return { kind: item.kind, amount: item.amount };
      }
    }
    const fallback = GACHA_POOL[0];
    this.applyReward(fallback.kind, fallback.amount);
    return { kind: fallback.kind, amount: fallback.amount };
  }

  public claimMail(mailId: string): MailItem | null {
    const idx = this.user.mailbox.findIndex((m) => m.id === mailId);
    if (idx < 0) return null;
    const [mail] = this.user.mailbox.splice(idx, 1);
    if (mail.rewardKind !== "gacha") {
      this.applyReward(mail.rewardKind, mail.amount);
    } else {
      this.save();
    }
    return mail;
  }

  public toggleFavorite(video: YtItem): {
    added: boolean;
    slotFull?: boolean;
  } {
    const idx = this.user.favorites.findIndex(
      (f) => f.videoId === video.videoId
    );
    if (idx >= 0) {
      this.user.favorites.splice(idx, 1);
      this.save();
      return { added: false };
    }
    if (this.user.favorites.length >= this.user.favoriteSlots) {
      return { added: false, slotFull: true };
    }
    this.user.favorites.unshift(video);
    this.save();
    return { added: true };
  }

  public isFavorite(videoId: string): boolean {
    return this.user.favorites.some((f) => f.videoId === videoId);
  }

  public addHistory(video: YtItem): void {
    this.user.history = this.user.history.filter(
      (h) => h.videoId !== video.videoId
    );
    this.user.history.unshift(video);
    if (this.user.history.length > this.user.historySlots) {
      this.user.history.length = this.user.historySlots;
    }
    this.save();
  }

  public extendSlots(type: "favorites" | "history", costCoins = 300): boolean {
    if (this.user.coins < costCoins) return false;
    this.user.coins -= costCoins;
    if (type === "favorites") this.user.favoriteSlots += 1;
    else this.user.historySlots += 1;
    this.save();
    return true;
  }

  public grantExpAndRewards(
    coinsEarned: number,
    expEarned: number,
    grade: RankGrade
  ): {
    levelsGained: number;
    oldLevel: number;
    newLevel: number;
    sGradeDailyTriggered: boolean;
    rubiesEarned: number;
  } {
    const oldLevel = this.user.level;
    this.user.coins += coinsEarned;
    this.user.exp += expEarned;

    let levelsGained = 0;
    while (
      this.user.level < 100 &&
      this.user.exp >= getRequiredExpForLevel(this.user.level)
    ) {
      this.user.exp -= getRequiredExpForLevel(this.user.level);
      this.user.level += 1;
      levelsGained += 1;
      // Refill all discs on level up (`fillLevelUpDisc`) + send level-up mail!
      this.user.discs = Math.max(this.user.discs, this.user.maxDiscs);
      const now = Date.now();
      const isMilestone = this.user.level % 5 === 0;
      this.user.mailbox.unshift({
        id: `mail_lv_${this.user.level}_${now}`,
        kind: "levelup",
        titleKey: "mail_levelup",
        titleParam: this.user.level,
        rewardKind: isMilestone ? "ticket" : "ruby",
        amount: isMilestone ? 24 : 5,
        createdAt: now,
        expiresAt: now + 3 * 24 * 3600 * 1000,
      });
    }

    let sGradeDailyTriggered = false;
    let rubiesEarned = 0;
    if (grade === "SSS" || grade === "SS" || grade === "S") {
      if (grade === "SSS") rubiesEarned = 3;
      else if (grade === "SS") rubiesEarned = 2;
      else rubiesEarned = 1;
      this.user.rubies += rubiesEarned;

      const today = todayIso();
      if (this.user.lastSGradeDate !== today) {
        this.user.lastSGradeDate = today;
        this.user.sGradeStreak += 1;
        sGradeDailyTriggered = true;
        const now = Date.now();
        this.user.mailbox.unshift({
          id: `mail_sgrade_${now}`,
          kind: "s_grade",
          titleKey: "mail_s_grade",
          titleParam: `Day ${this.user.sGradeStreak}`,
          rewardKind: this.user.sGradeStreak % 3 === 0 ? "gacha" : "coin",
          amount: this.user.sGradeStreak % 3 === 0 ? 1 : 500,
          createdAt: now,
          expiresAt: now + 3 * 24 * 3600 * 1000,
        });
      }
    }

    this.save();
    return {
      levelsGained,
      oldLevel,
      newLevel: this.user.level,
      sGradeDailyTriggered,
      rubiesEarned,
    };
  }

  public exportBackupJson(): string {
    return JSON.stringify(
      {
        version: "1.6.5-reborn",
        exportedAt: new Date().toISOString(),
        settings: this.settings,
        user: this.user,
      },
      null,
      2
    );
  }

  public importBackupJson(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.settings) {
        this.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
      }
      if (parsed.user) {
        this.user = { ...createInitialUserState(), ...parsed.user };
      }
      this.save();
      return true;
    } catch {
      return false;
    }
  }
}

export const store = new AppStore();
