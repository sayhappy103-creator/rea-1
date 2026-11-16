import { ChartNote, CustomNoteChart, LineCount, YtItem } from "../types";
import { estimateSongBpm, generateBasicChart } from "../beatgen";
import { RoadRenderer, RuntimeNoteState } from "./RoadRenderer";
import { STAGE_NOTE_THEMES } from "../constants";

export type EditorTool = "tap" | "long" | "slide";

/**
 * Clean-room Custom Note Editor engine (`EditScene` / `NoteEditNode`).
 * Supports REC-style placement, timeline scrubbing, snapping, and live test-play.
 */
export class EditorEngine {
  private renderer = new RoadRenderer();
  private rafId = 0;
  private lastPerf = 0;
  private playing = false;

  public notes: ChartNote[] = [];
  public playheadMs = 0;
  public tool: EditorTool = "tap";
  public snapDiv = 4; // 1/4 beat
  public bpm = 128;

  constructor(
    private canvas: HTMLCanvasElement,
    public video: YtItem,
    public lines: LineCount,
    public startMs: number,
    public endMs: number,
    initialNotes?: ChartNote[]
  ) {
    this.bpm = estimateSongBpm(video);
    if (initialNotes) this.notes = [...initialNotes];
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
  }

  public getAppearWindowMs(): number {
    return 1400;
  }

  public setLoopRange(startMs: number, endMs: number): void {
    this.startMs = Math.max(0, startMs);
    this.endMs = Math.max(this.startMs + 5000, endMs);
  }

  public setPlayhead(ms: number): void {
    this.playheadMs = Math.max(this.startMs, Math.min(this.endMs, ms));
  }

  public togglePlay(): boolean {
    this.playing = !this.playing;
    if (this.playing) this.lastPerf = performance.now();
    return this.playing;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getNpm(): number {
    const minutes = Math.max(0.5, (this.endMs - this.startMs) / 60000);
    return Math.round(this.notes.length / minutes);
  }

  public addNoteAt(ms: number, lane: number): void {
    const snapped = this.snapTime(ms);
    if (snapped < this.startMs || snapped > this.endMs) return;
    if (
      this.notes.some(
        (n) => n.lane === lane && Math.abs(n.timeMs - snapped) < 40
      )
    ) {
      return;
    }
    const note: ChartNote = {
      id: `ed_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      timeMs: snapped,
      lane,
      kind: this.tool === "tap" ? "tap" : "tap",
    };
    if (this.tool === "long") {
      const beatMs = 60000 / Math.max(80, this.bpm);
      note.kind = "long";
      note.durationMs = Math.round(beatMs * 2);
    } else if (this.tool === "slide") {
      const beatMs = 60000 / Math.max(80, this.bpm);
      note.kind = "slide";
      note.durationMs = Math.round(beatMs * 2);
      note.slidePath = [
        {
          offsetMs: Math.round(beatMs),
          lane: Math.min(this.lines - 1, lane + 1),
        },
      ];
    }
    this.notes.push(note);
    this.notes.sort((a, b) => a.timeMs - b.timeMs || a.lane - b.lane);
  }

  public removeNoteNear(ms: number, lane: number): boolean {
    const idx = this.notes.findIndex(
      (n) => n.lane === lane && Math.abs(n.timeMs - ms) < 190
    );
    if (idx < 0) return false;
    this.notes.splice(idx, 1);
    return true;
  }

  public clearAll(): void {
    this.notes = [];
  }

  public snapTime(ms: number): number {
    const step = 60000 / Math.max(80, this.bpm) / this.snapDiv;
    return Math.round(ms / step) * step;
  }

  public autoGenerate(difficulty: "easy" | "normal" | "hard" | "extreme" | "crazy"): void {
    const g = generateBasicChart(
      this.video,
      difficulty,
      this.lines,
      true,
      true,
      true
    );
    this.notes = g.notes.filter(
      (n) => n.timeMs >= this.startMs && n.timeMs <= this.endMs
    );
    this.bpm = g.bpm;
  }

  public timeFromClientY(clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const isLandscape = rect.width > rect.height * 1.1;
    const { vanishY, hitY } = this.renderer.getRoadGeometry(
      rect.width,
      rect.height,
      isLandscape
    );
    const y = clientY - rect.top;
    const p = Math.max(0, Math.min(1, (y - vanishY) / (hitY - vanishY)));
    // Find u whose projected depth equals p
    let bestU = 0;
    let bestErr = Infinity;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      const err = Math.abs(this.renderer.projectU(u) - p);
      if (err < bestErr) {
        bestErr = err;
        bestU = u;
      }
    }
    const window = this.getAppearWindowMs();
    return this.playheadMs + (1 - bestU) * window;
  }

  public clientToLane(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const isLandscape = rect.width > rect.height * 1.1;
    return this.renderer.screenPointToLane(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
      this.lines,
      isLandscape
    );
  }

  private onPointerDown = (e: PointerEvent) => {
    const lane = this.clientToLane(e.clientX, e.clientY);
    if (lane === null) return;
    const ms = this.timeFromClientY(e.clientY);
    if (e.shiftKey || e.button === 2) {
      this.removeNoteNear(ms, lane);
    } else {
      this.addNoteAt(ms, lane);
    }
  };

  public buildChart(meta: {
    title: string;
    author: string;
    id?: string;
  }): CustomNoteChart {
    return {
      id: meta.id ?? `mychart_${Date.now()}`,
      videoId: this.video.videoId,
      videoTitle: this.video.title,
      videoChannel: this.video.channelTitle,
      videoThumbnail: this.video.thumbnail,
      videoDurationSec: this.video.durationSec,
      title: meta.title,
      author: meta.author,
      lines: this.lines,
      npm: this.getNpm(),
      startMs: this.startMs,
      endMs: this.endMs,
      notes: this.notes,
      useLong: true,
      useSlide: true,
      ratingSum: 0,
      ratingCount: 0,
      playCount: 0,
      createdAt: Date.now(),
      isMine: true,
    };
  }

  public start(): void {
    this.lastPerf = performance.now();
    this.loop(this.lastPerf);
  }

  private loop = (now: number) => {
    const dt = Math.min(60, now - this.lastPerf);
    this.lastPerf = now;
    if (this.playing) {
      this.playheadMs += dt;
      if (this.playheadMs >= this.endMs) {
        this.playheadMs = this.startMs;
      }
    }

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
      const isLandscape = rect.width > rect.height * 1.1;
      ctx.save();
      ctx.scale(dpr, dpr);
      const runtime: RuntimeNoteState[] = this.notes.map((n) => ({
        note: n,
        headHit: false,
        completed: false,
        missed: false,
        holding: false,
        lastHoldTickMs: 0,
        waypointsHit: (n.slidePath ?? []).map(() => false),
      }));
      this.renderer.render({
        ctx,
        width: rect.width,
        height: rect.height,
        dtSec: dt / 1000,
        nowPerfMs: now,
        songTimeMs: this.playheadMs,
        bpm: this.bpm,
        lines: this.lines,
        speed: 3,
        isLandscape,
        combo: 0,
        feverStage: 0,
        pressedLanes: new Set<number>(),
        notes: runtime,
        appearWindowMs: this.getAppearWindowMs(),
        watermark: "REC",
      });

      // Editor guides: playhead marker & snapped grid labels
      const { vanishY, hitY } = this.renderer.getRoadGeometry(
        rect.width,
        rect.height,
        isLandscape
      );
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, hitY + 26);
      ctx.lineTo(rect.width, hitY + 26);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(190, 225, 255, 0.9)";
      ctx.font = "700 11px system-ui, sans-serif";
      ctx.fillText(`PLAYHEAD ${(this.playheadMs / 1000).toFixed(2)}s`, 12, hitY + 20);
      ctx.fillText(`NOTES ${this.notes.length}`, 12, vanishY - 8);
      ctx.restore();
      void STAGE_NOTE_THEMES;
      ctx.restore();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
