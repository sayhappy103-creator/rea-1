import { soundEngine } from "../audio";
import {
  COMBO_PER_FEVER_STAGE,
  computeHitRatingPercent,
  computeRankGrade,
  FEVER_STAGE_MULTIPLIERS,
  getScorePointBase,
  getScoreScaling,
  HOLD_TICK_MULTIPLIER,
  STAGE_NOTE_THEMES,
  TIMING_WINDOWS_MS,
  VERDICT_MULTIPLIERS,
} from "../constants";
import {
  ChartNote,
  GamePlayOptions,
  GameResultData,
  GameSettings,
  LineCount,
  NoteSpeed,
  ReplayEvent,
  ReplayRecord,
  Verdict,
  YtItem,
} from "../types";
import { RoadRenderer, RuntimeNoteState } from "./RoadRenderer";

export interface HudSnapshot {
  score: number;
  combo: number;
  maxCombo: number;
  feverStage: number; // 0..5
  feverSegmentFill: number; // 0..8
  multiplier: number;
  songTimeMs: number;
  durationMs: number;
  hitRating: number;
}

const KEY_BINDINGS: Record<LineCount, string[]> = {
  3: ["KeyF", "Space", "KeyJ"],
  4: ["KeyD", "KeyF", "KeyJ", "KeyK"],
  5: ["KeyD", "KeyF", "Space", "KeyJ", "KeyK"],
  6: ["KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL"],
};

export class RhythmEngine {
  private renderer = new RoadRenderer();
  private runtimeNotes: RuntimeNoteState[] = [];
  private pointerLane = new Map<number, number>();
  private pressedLanes = new Set<number>();

  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private perfect = 0;
  private great = 0;
  private cool = 0;
  private good = 0;
  private miss = 0;
  private holdTicks = 0;

  private recordedEvents: ReplayEvent[] = [];
  private replayCursor = 0;

  private rafId = 0;
  private lastPerfMs = 0;
  private songTimeMs = 0;
  private startMs = 0;
  private endMs = 0;
  private paused = false;
  private finished = false;
  private startedPerfMs = 0;
  private lastSynthStep = -1;

  // Drift-smoothed clock anchored to YT.Player when active
  private useSynthClock = false;
  private musicVol = 0.8;

  constructor(
    private canvas: HTMLCanvasElement,
    private video: YtItem,
    private chartNotes: ChartNote[],
    private bpm: number,
    private playerLevel: number,
    private options: GamePlayOptions,
    private settings: GameSettings,
    private getVideoTimeSec: () => number | null,
    private onHudUpdate: (hud: HudSnapshot) => void,
    private onComplete: (result: Omit<GameResultData, "levelsGained" | "oldLevel" | "newLevel" | "sGradeDailyTriggered" | "rubiesEarned" | "isNewRecord">) => void,
    startMs = 0,
    endMs?: number
  ) {
    this.startMs = startMs;
    this.songTimeMs = startMs;
    const lastNoteEnd = chartNotes.reduce(
      (mx, n) => Math.max(mx, n.timeMs + (n.durationMs ?? 0)),
      0
    );
    this.endMs =
      endMs ?? Math.max((video.durationSec || 180) * 1000, lastNoteEnd + 2200);

    this.runtimeNotes = chartNotes
      .filter((n) => n.timeMs >= this.startMs && n.timeMs <= this.endMs)
      .map((n) => ({
        note: n,
        headHit: false,
        completed: false,
        missed: false,
        holding: false,
        lastHoldTickMs: n.timeMs,
        waypointsHit: (n.slidePath ?? []).map(() => false),
      }));
  }

  public getAppearWindowMs(): number {
    // Speed x1 = 2300ms down to x10 = 640ms
    return Math.round(2480 - this.options.speed * 184);
  }

  public setSpeed(speed: NoteSpeed): void {
    this.options.speed = speed;
  }

  public setNoteSyncMs(syncMs: number): void {
    this.settings.noteSyncMs = syncMs;
  }

  public enableSynthClock(enabled: boolean): void {
    this.useSynthClock = enabled;
    if (!enabled) this.lastSynthStep = -1;
  }

  /** Volume for the synthesized backing groove (0..100). */
  public setMusicVolume(percent: number): void {
    this.musicVol = Math.max(0, Math.min(1, percent / 100));
  }

  public start(): void {
    this.bindInputs();
    this.lastPerfMs = performance.now();
    this.startedPerfMs = this.lastPerfMs;
    this.loop(this.lastPerfMs);
  }

  public pause(): void {
    this.paused = true;
    soundEngine.stopLongHold();
  }

  public resume(): void {
    if (this.finished) return;
    this.paused = false;
    this.lastPerfMs = performance.now();
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    soundEngine.stopLongHold();
    this.unbindInputs();
  }

  public finishEarly(): Omit<
    GameResultData,
    | "levelsGained"
    | "oldLevel"
    | "newLevel"
    | "sGradeDailyTriggered"
    | "rubiesEarned"
    | "isNewRecord"
  > {
    this.finished = true;
    cancelAnimationFrame(this.rafId);
    soundEngine.stopLongHold();
    return this.buildResult(false);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.paused || this.finished || this.options.isReplay) return;
    e.preventDefault();
    soundEngine.unlock();
    const lane = this.pointerToLane(e);
    if (lane === null) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.handleLaneDown(e.pointerId, lane);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.paused || this.finished || this.options.isReplay) return;
    if (!this.pointerLane.has(e.pointerId)) return;
    const lane = this.pointerToLane(e);
    if (lane === null) return;
    const prev = this.pointerLane.get(e.pointerId);
    if (prev !== lane) {
      this.handleLaneMove(e.pointerId, lane);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.options.isReplay) return;
    this.handleLaneUp(e.pointerId);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || this.finished || this.options.isReplay || e.repeat) return;
    const map = KEY_BINDINGS[this.options.lines];
    const lane = map.indexOf(e.code);
    if (lane >= 0) {
      e.preventDefault();
      soundEngine.unlock();
      this.handleLaneDown(1000 + lane, lane);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.options.isReplay) return;
    const map = KEY_BINDINGS[this.options.lines];
    const lane = map.indexOf(e.code);
    if (lane >= 0) {
      this.handleLaneUp(1000 + lane);
    }
  };

  private bindInputs(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown, {
      passive: false,
    });
    this.canvas.addEventListener("pointermove", this.onPointerMove, {
      passive: false,
    });
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private unbindInputs(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private pointerToLane(e: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isLandscape = rect.width > rect.height * 1.1;
    return this.renderer.screenPointToLane(
      x,
      y,
      rect.width,
      rect.height,
      this.options.lines,
      isLandscape
    );
  }

  private rebuildPressedLanes(): void {
    this.pressedLanes.clear();
    for (const lane of this.pointerLane.values()) {
      this.pressedLanes.add(lane);
    }
  }

  private handleLaneDown(pointerId: number, lane: number): void {
    this.pointerLane.set(pointerId, lane);
    this.rebuildPressedLanes();

    if (!this.options.isReplay && !this.options.isTestPlay) {
      this.recordedEvents.push({
        timeMs: Math.round(this.songTimeMs),
        type: "down",
        lane,
        pointerId,
      });
    }

    const effectiveTime = this.songTimeMs - this.settings.noteSyncMs;
    // Find closest unhit note in this lane within GOOD window
    let best: RuntimeNoteState | null = null;
    let bestDiff = Infinity;
    for (const st of this.runtimeNotes) {
      if (st.headHit || st.missed || st.completed) continue;
      if (st.note.lane !== lane) continue;
      const diff = Math.abs(st.note.timeMs - effectiveTime);
      if (diff <= TIMING_WINDOWS_MS.good && diff < bestDiff) {
        best = st;
        bestDiff = diff;
      }
      if (st.note.timeMs - effectiveTime > TIMING_WINDOWS_MS.good) break;
    }

    soundEngine.playTouchHit(this.settings, lane);

    if (best) {
      const verdict = this.diffToVerdict(bestDiff);
      best.headHit = true;
      best.headVerdict = verdict;
      if (best.note.kind === "tap") {
        best.completed = true;
      } else {
        best.holding = true;
        best.lastHoldTickMs = Math.max(best.note.timeMs, effectiveTime);
        soundEngine.startLongHold(this.settings);
      }
      this.applyVerdict(lane, verdict, performance.now());
    }
  }

  private handleLaneMove(pointerId: number, newLane: number): void {
    this.pointerLane.set(pointerId, newLane);
    this.rebuildPressedLanes();
    if (!this.options.isReplay && !this.options.isTestPlay) {
      this.recordedEvents.push({
        timeMs: Math.round(this.songTimeMs),
        type: "move",
        lane: newLane,
        pointerId,
      });
    }
  }

  private handleLaneUp(pointerId: number): void {
    const oldLane = this.pointerLane.get(pointerId);
    this.pointerLane.delete(pointerId);
    this.rebuildPressedLanes();
    if (
      oldLane !== undefined &&
      !this.options.isReplay &&
      !this.options.isTestPlay
    ) {
      this.recordedEvents.push({
        timeMs: Math.round(this.songTimeMs),
        type: "up",
        lane: oldLane,
        pointerId,
      });
    }

    // Check if any Long note lost its hold prematurely
    const effectiveTime = this.songTimeMs - this.settings.noteSyncMs;
    let anyStillHolding = false;
    for (const st of this.runtimeNotes) {
      if (!st.holding || st.completed) continue;
      if (st.note.kind === "long" && !this.pressedLanes.has(st.note.lane)) {
        const endMs = st.note.timeMs + (st.note.durationMs ?? 0);
        if (effectiveTime >= endMs - TIMING_WINDOWS_MS.good) {
          st.holding = false;
          st.completed = true;
        } else {
          // Released too early
          st.holding = false;
          st.completed = true;
        }
      } else {
        anyStillHolding = true;
      }
    }
    if (!anyStillHolding) {
      soundEngine.stopLongHold();
    }
  }

  private diffToVerdict(absDiffMs: number): Verdict {
    if (absDiffMs <= TIMING_WINDOWS_MS.perfect) return "perfect";
    if (absDiffMs <= TIMING_WINDOWS_MS.great) return "great";
    if (absDiffMs <= TIMING_WINDOWS_MS.cool) return "cool";
    return "good";
  }

  private getFeverStage(): number {
    return Math.min(5, Math.floor(this.combo / COMBO_PER_FEVER_STAGE));
  }

  private applyVerdict(lane: number, verdict: Verdict, nowPerfMs: number): void {
    const prevStage = this.getFeverStage();

    if (verdict === "miss") {
      this.miss += 1;
      this.combo = 0;
      soundEngine.playMiss(this.settings);
    } else {
      if (verdict === "perfect") this.perfect += 1;
      else if (verdict === "great") this.great += 1;
      else if (verdict === "cool") this.cool += 1;
      else this.good += 1;

      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }

    const newStage = this.getFeverStage();
    if (newStage > prevStage && newStage === 5) {
      soundEngine.playFeverDash(this.settings);
    }

    const basePoint = getScorePointBase(
      this.playerLevel,
      this.options.difficulty,
      this.options.speed,
      this.options.lines
    );
    const mult = FEVER_STAGE_MULTIPLIERS[newStage];
    const gained = Math.round(
      basePoint * mult * VERDICT_MULTIPLIERS[verdict]
    );
    this.score += gained;

    const stageColor = STAGE_NOTE_THEMES[newStage].primary;
    this.renderer.triggerHitEffect(lane, verdict, stageColor, nowPerfMs);
  }

  private applyHoldTick(lane: number, nowPerfMs: number): void {
    this.holdTicks += 1;
    const stage = this.getFeverStage();
    const basePoint = getScorePointBase(
      this.playerLevel,
      this.options.difficulty,
      this.options.speed,
      this.options.lines
    );
    const mult = FEVER_STAGE_MULTIPLIERS[stage];
    // Hold tick adds partial tick score (scaled so long notes feel super rewarding!)
    this.score += Math.round(basePoint * mult * HOLD_TICK_MULTIPLIER * 0.25);
    this.renderer.triggerHitEffect(
      lane,
      "perfect",
      STAGE_NOTE_THEMES[stage].primary,
      nowPerfMs
    );
  }

  private loop = (nowPerfMs: number) => {
    const dtMs = Math.min(50, Math.max(0, nowPerfMs - this.lastPerfMs));
    this.lastPerfMs = nowPerfMs;

    if (!this.paused && !this.finished) {
      const ytSec = this.useSynthClock ? null : this.getVideoTimeSec();
      if (ytSec !== null && ytSec > 0) {
        const ytMs = ytSec * 1000;
        const drift = ytMs - this.songTimeMs;
        if (Math.abs(drift) > 220) {
          this.songTimeMs = ytMs;
        } else {
          this.songTimeMs += dtMs + drift * 0.14;
        }
      } else {
        this.songTimeMs += dtMs;
        if (this.useSynthClock) {
          // Schedule against the AudioContext clock so the groove stays steady
          // even when the tab throttles requestAnimationFrame.
          const halfBeatMs = 30000 / Math.max(80, this.bpm);
          const step = Math.floor(this.songTimeMs / halfBeatMs);
          if (this.lastSynthStep < 0) this.lastSynthStep = step - 1;
          if (step > this.lastSynthStep) {
            const gap = Math.min(4, step - this.lastSynthStep);
            for (let i = 1; i <= gap; i++) {
              soundEngine.playBeatSynthStep(
                this.lastSynthStep + i,
                this.bpm,
                this.musicVol
              );
            }
            this.lastSynthStep = step;
          }
        }
      }

      // Replay Mode playback (`GameRoadNode::onSubScheduleAppliedReplayTouch`)
      if (this.options.isReplay && this.options.replayData) {
        const evs = this.options.replayData.events;
        if (evs.length > 0) {
          while (
            this.replayCursor < evs.length &&
            evs[this.replayCursor].timeMs <= this.songTimeMs
          ) {
            const ev = evs[this.replayCursor++];
            if (ev.type === "down") this.handleLaneDown(ev.pointerId, ev.lane);
            else if (ev.type === "move")
              this.handleLaneMove(ev.pointerId, ev.lane);
            else this.handleLaneUp(ev.pointerId);
          }
        } else {
          // Auto-showcase replay for seeded leaderboard entries without raw pointer logs
          this.stepSeededAutoReplay(nowPerfMs);
        }
      }

      this.updateActiveNotes(nowPerfMs);

      if (this.songTimeMs >= this.endMs) {
        this.finished = true;
        soundEngine.stopLongHold();
        this.onComplete(this.buildResult(true));
        return;
      }
    }

    // Resize canvas crisply to DPR
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width * dpr));
    const ch = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.scale(dpr, dpr);
      const isLandscape = rect.width > rect.height * 1.1;
      const watermark = this.options.isReplay
        ? "REPLAY"
        : this.options.isTestPlay
        ? "TEST PLAY"
        : null;
      this.renderer.render({
        ctx,
        width: rect.width,
        height: rect.height,
        dtSec: dtMs / 1000,
        nowPerfMs,
        songTimeMs: this.songTimeMs - this.settings.noteSyncMs,
        bpm: this.bpm,
        lines: this.options.lines,
        speed: this.options.speed,
        isLandscape,
        combo: this.combo,
        feverStage: this.getFeverStage(),
        pressedLanes: this.pressedLanes,
        notes: this.runtimeNotes,
        appearWindowMs: this.getAppearWindowMs(),
        watermark,
      });
      ctx.restore();
    }

    const stage = this.getFeverStage();
    const withinStage =
      stage >= 5 ? 8 : Math.floor((this.combo % COMBO_PER_FEVER_STAGE) / 3);
    this.onHudUpdate({
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      feverStage: stage,
      feverSegmentFill: withinStage,
      multiplier: FEVER_STAGE_MULTIPLIERS[stage],
      songTimeMs: Math.max(0, this.songTimeMs - this.startMs),
      durationMs: Math.max(1000, this.endMs - this.startMs),
      hitRating: computeHitRatingPercent(
        this.perfect,
        this.great,
        this.cool,
        this.good,
        this.miss,
        this.holdTicks
      ),
    });

    this.rafId = requestAnimationFrame(this.loop);
  };

  private stepSeededAutoReplay(nowPerfMs: number): void {
    const effectiveTime = this.songTimeMs - this.settings.noteSyncMs;
    for (const st of this.runtimeNotes) {
      if (st.completed || st.missed) continue;
      if (!st.headHit && effectiveTime >= st.note.timeMs) {
        st.headHit = true;
        soundEngine.playTouchHit(this.settings, st.note.lane);
        if (st.note.kind === "tap") {
          st.completed = true;
        } else {
          st.holding = true;
          this.pointerLane.set(900 + st.note.lane, st.note.lane);
          this.rebuildPressedLanes();
        }
        this.applyVerdict(st.note.lane, "perfect", nowPerfMs);
      }
      if (st.holding && st.note.durationMs) {
        if (st.note.kind === "slide" && st.note.slidePath) {
          for (const wp of st.note.slidePath) {
            if (effectiveTime >= st.note.timeMs + wp.offsetMs - 20) {
              this.pointerLane.set(900 + wp.lane, wp.lane);
              this.rebuildPressedLanes();
            }
          }
        }
        if (effectiveTime >= st.note.timeMs + st.note.durationMs) {
          this.pointerLane.clear();
          this.rebuildPressedLanes();
        }
      }
    }
  }

  private updateActiveNotes(nowPerfMs: number): void {
    const effectiveTime = this.songTimeMs - this.settings.noteSyncMs;
    let anyHolding = false;

    for (const st of this.runtimeNotes) {
      if (st.completed) continue;
      const n = st.note;

      // Unhit note passed GOOD window => MISS (`onLostOutNoteEventCallback`)
      if (!st.headHit && !st.missed) {
        if (effectiveTime - n.timeMs > TIMING_WINDOWS_MS.good) {
          st.missed = true;
          st.completed = true;
          this.applyVerdict(n.lane, "miss", nowPerfMs);
          continue;
        }
      }

      // Active Long Note hold ticks
      if (st.headHit && n.kind === "long" && n.durationMs) {
        const endMs = n.timeMs + n.durationMs;
        if (st.holding && this.pressedLanes.has(n.lane)) {
          anyHolding = true;
          while (
            st.lastHoldTickMs + 180 <= Math.min(effectiveTime, endMs)
          ) {
            st.lastHoldTickMs += 180;
            this.applyHoldTick(n.lane, nowPerfMs);
          }
        }
        if (effectiveTime >= endMs) {
          st.holding = false;
          st.completed = true;
        }
      }

      // Active Slide Note waypoint checks
      if (st.headHit && n.kind === "slide" && n.slidePath) {
        anyHolding = true;
        n.slidePath.forEach((wp, idx) => {
          if (st.waypointsHit[idx]) return;
          const wpMs = n.timeMs + wp.offsetMs;
          if (
            Math.abs(effectiveTime - wpMs) <= TIMING_WINDOWS_MS.cool &&
            this.pressedLanes.has(wp.lane)
          ) {
            st.waypointsHit[idx] = true;
            soundEngine.playTouchHit(this.settings, wp.lane);
            this.applyHoldTick(wp.lane, nowPerfMs);
          } else if (effectiveTime - wpMs > TIMING_WINDOWS_MS.good) {
            st.waypointsHit[idx] = true;
            this.applyVerdict(wp.lane, "miss", nowPerfMs);
          }
        });
        const endMs = n.timeMs + (n.durationMs ?? 0);
        if (effectiveTime > endMs + TIMING_WINDOWS_MS.good) {
          st.holding = false;
          st.completed = true;
        }
      }
    }

    if (!anyHolding) {
      soundEngine.stopLongHold();
    }
  }

  private buildResult(completed: boolean) {
    // Any remaining unplayed notes if exited early count as miss only when completed
    if (completed) {
      for (const st of this.runtimeNotes) {
        if (!st.headHit && !st.missed) {
          st.missed = true;
          this.miss += 1;
        }
      }
    }

    const hitRegular = this.perfect + this.great + this.cool + this.good;
    const hitRating = computeHitRatingPercent(
      this.perfect,
      this.great,
      this.cool,
      this.good,
      this.miss,
      this.holdTicks
    );
    const grade = computeRankGrade(hitRating, completed);
    // Exact TapTube 1.6.5 reward formula (`NoteConfig::computeGameRasult`):
    const coinsEarned =
      completed && grade !== "F" ? Math.max(1, Math.floor(hitRegular / 25)) : 0;
    const expEarned =
      completed && grade !== "F"
        ? Math.max(2, Math.floor((coinsEarned * 6.0 * hitRating) / 100.0))
        : 0;

    const playableMin = Math.max(0.5, (this.endMs - this.startMs) / 60000);
    const npm = Math.round(this.runtimeNotes.length / playableMin);
    const playSeconds = Math.round(
      (performance.now() - this.startedPerfMs) / 1000
    );

    const replayRecord: ReplayRecord | undefined =
      completed && !this.options.isReplay && !this.options.isTestPlay
        ? {
            id: `rep_${Date.now()}`,
            videoId: this.video.videoId,
            videoTitle: this.video.title,
            videoThumbnail: this.video.thumbnail,
            playerName: "", // filled by store caller
            country: this.settings.countryCode || "TH",
            score: this.score,
            grade,
            hitRating: Number(hitRating.toFixed(2)),
            maxCombo: this.maxCombo,
            npm,
            difficulty: this.options.difficulty,
            lines: this.options.lines,
            speed: this.options.speed,
            useDoubleNote: this.options.useDoubleNote,
            useLongNote: this.options.useLongNote,
            useSlideNote: this.options.useSlideNote,
            customChartId: this.options.customChart?.id,
            events: this.recordedEvents,
            createdAt: Date.now(),
          }
        : undefined;

    return {
      video: this.video,
      options: this.options,
      score: this.score,
      scoreScaling: getScoreScaling(
        this.playerLevel,
        this.options.difficulty,
        this.options.speed,
        this.options.lines
      ),
      perfect: this.perfect,
      great: this.great,
      cool: this.cool,
      good: this.good,
      miss: this.miss,
      holdTicks: this.holdTicks,
      totalNotes: this.runtimeNotes.length,
      maxCombo: this.maxCombo,
      hitRating: Number(hitRating.toFixed(2)),
      npm,
      grade,
      coinsEarned,
      expEarned,
      playSeconds,
      replayRecord,
    };
  }
}
