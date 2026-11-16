import {
  FEVER_STAGE_MULTIPLIERS,
  LANE_LIGHT_COLORS,
  STAGE_NOTE_THEMES,
} from "../constants";
import { ChartNote, LineCount, NoteSpeed, Verdict } from "../types";

export interface RuntimeNoteState {
  note: ChartNote;
  headHit: boolean;
  headVerdict?: Verdict;
  completed: boolean;
  missed: boolean;
  holding: boolean;
  lastHoldTickMs: number;
  waypointsHit: boolean[];
}

export interface HitBurstEffect {
  lane: number;
  color: string;
  bornMs: number;
  verdict: Verdict;
}

export interface NeonBullet {
  lane: number;
  progress: number; // 1.0 at hitLine -> 0.0 at vanish
  color: string;
}

interface WindStreak {
  side: -1 | 1;
  offsetRatio: number;
  z: number;
  len: number;
  speed: number;
}

/**
 * 60/120fps HTML5 Canvas 3D Perspective Metallic Highway Renderer (`BaseRoadNode` + `NoteSprite`).
 */
export class RoadRenderer {
  private windStreaks: WindStreak[] = [];
  private bursts: HitBurstEffect[] = [];
  private bullets: NeonBullet[] = [];
  private shakeUntilMs = 0;
  private lastVerdict: { text: Verdict; timeMs: number } | null = null;

  constructor() {
    for (let i = 0; i < 18; i++) {
      this.windStreaks.push({
        side: i % 2 === 0 ? -1 : 1,
        offsetRatio: 1.04 + Math.random() * 0.25,
        z: Math.random(),
        len: 0.08 + Math.random() * 0.12,
        speed: 0.65 + Math.random() * 0.7,
      });
    }
  }

  public triggerHitEffect(
    lane: number,
    verdict: Verdict,
    stageColor: string,
    nowPerfMs: number
  ): void {
    this.lastVerdict = { text: verdict, timeMs: nowPerfMs };
    if (verdict === "miss") {
      this.shakeUntilMs = nowPerfMs + 210;
      return;
    }
    this.bursts.push({
      lane,
      color: stageColor,
      bornMs: nowPerfMs,
      verdict,
    });
    this.bullets.push({
      lane,
      progress: 1.0,
      color: stageColor,
    });
  }

  /**
   * Perspective depth transform: `u` in [0 = vanish horizon, 1 = hitLine, >1 = past hitLine].
   * Uses true 3D camera foreshortening so far notes look smaller and accelerate naturally.
   */
  public projectU(u: number): number {
    const zNear = 1.0;
    const zFar = 5.2;
    const clamped = Math.max(-0.05, Math.min(1.28, u));
    const z = zFar - clamped * (zFar - zNear);
    if (z <= 0.15) return 1.35;
    const persp = (zFar / z - 1) / (zFar / zNear - 1);
    return persp;
  }

  public getRoadGeometry(width: number, height: number, isLandscape: boolean) {
    const vanishY = height * (isLandscape ? 0.15 : 0.18);
    const hitY = height * (isLandscape ? 0.83 : 0.835);
    const topHalfW = width * (isLandscape ? 0.095 : 0.13);
    const hitHalfW = width * (isLandscape ? 0.34 : 0.465);
    const centerX = width * 0.5;
    return { vanishY, hitY, topHalfW, hitHalfW, centerX };
  }

  public screenPointToLane(
    x: number,
    y: number,
    width: number,
    height: number,
    lines: LineCount,
    isLandscape: boolean
  ): number | null {
    const { vanishY, hitY, topHalfW, hitHalfW, centerX } =
      this.getRoadGeometry(width, height, isLandscape);
    if (y < vanishY * 0.85) return null;
    const p = Math.max(0.25, Math.min(1.22, (y - vanishY) / (hitY - vanishY)));
    const halfW = (topHalfW + (hitHalfW - topHalfW) * p) * 1.14;
    const rel = (x - (centerX - halfW)) / (halfW * 2);
    if (rel < -0.08 || rel > 1.08) return null;
    const lane = Math.floor(Math.max(0, Math.min(0.999, rel)) * lines);
    return lane;
  }

  public render(params: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    dtSec: number;
    nowPerfMs: number;
    songTimeMs: number;
    bpm: number;
    lines: LineCount;
    speed: NoteSpeed;
    isLandscape: boolean;
    combo: number;
    feverStage: number; // 0..5
    pressedLanes: Set<number>;
    notes: RuntimeNoteState[];
    appearWindowMs: number;
    watermark?: "REPLAY" | "TEST PLAY" | "REC" | null;
  }): void {
    const {
      ctx,
      width,
      height,
      dtSec,
      nowPerfMs,
      songTimeMs,
      bpm,
      lines,
      speed,
      isLandscape,
      combo,
      feverStage,
      pressedLanes,
      notes,
      appearWindowMs,
      watermark,
    } = params;

    ctx.clearRect(0, 0, width, height);

    const stageTheme =
      STAGE_NOTE_THEMES[Math.min(5, Math.max(0, feverStage))];
    const laneColors = LANE_LIGHT_COLORS[lines];

    ctx.save();
    // Rail Shake on MISS (`BaseRoadNode::shakeRail`)
    if (nowPerfMs < this.shakeUntilMs) {
      const mag = ((this.shakeUntilMs - nowPerfMs) / 210) * 9;
      ctx.translate(
        (Math.random() - 0.5) * mag * 2,
        (Math.random() - 0.5) * mag
      );
    }

    const { vanishY, hitY, topHalfW, hitHalfW, centerX } =
      this.getRoadGeometry(width, height, isLandscape);
    const bottomP = (height - vanishY) / (hitY - vanishY);
    const bottomHalfW = topHalfW + (hitHalfW - topHalfW) * bottomP;

    const roadX = (p: number, laneFrac: number) => {
      const hw = topHalfW + (hitHalfW - topHalfW) * p;
      return centerX + (laneFrac * 2 - 1) * hw;
    };
    const roadY = (p: number) => vanishY + (hitY - vanishY) * p;

    // MAX FEVER Stage 5 atmospheric aura
    if (feverStage >= 5) {
      const pulse = 0.16 + 0.1 * Math.sin(nowPerfMs * 0.012);
      const grad = ctx.createRadialGradient(
        centerX,
        hitY * 0.65,
        width * 0.05,
        centerX,
        hitY * 0.65,
        width * 0.72
      );
      grad.addColorStop(0, `rgba(212, 66, 255, ${pulse})`);
      grad.addColorStop(0.5, `rgba(40, 168, 255, ${pulse * 0.5})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 1. Road dark metallic surface trapezoid
    const roadBg = ctx.createLinearGradient(0, vanishY, 0, height);
    roadBg.addColorStop(0, "rgba(6, 12, 26, 0.35)");
    roadBg.addColorStop(0.35, "rgba(8, 16, 36, 0.78)");
    roadBg.addColorStop(0.88, "rgba(10, 20, 44, 0.92)");
    roadBg.addColorStop(1, "rgba(4, 8, 20, 0.97)");

    ctx.beginPath();
    ctx.moveTo(centerX - topHalfW, vanishY);
    ctx.lineTo(centerX + topHalfW, vanishY);
    ctx.lineTo(centerX + bottomHalfW, height);
    ctx.lineTo(centerX - bottomHalfW, height);
    ctx.closePath();
    ctx.fillStyle = roadBg;
    ctx.fill();

    // 2. WindLine speed streaks outside rails (`WindLineEffectNode`)
    const windSpeedScale = 0.55 + speed * 0.18;
    ctx.lineWidth = 1.6;
    for (const ws of this.windStreaks) {
      ws.z += dtSec * ws.speed * windSpeedScale;
      if (ws.z > 1.15) ws.z = 0;
      const p1 = this.projectU(ws.z);
      const p2 = this.projectU(Math.min(1.22, ws.z + ws.len));
      const x1 =
        centerX +
        ws.side * (topHalfW + (hitHalfW - topHalfW) * p1) * ws.offsetRatio;
      const y1 = roadY(p1);
      const x2 =
        centerX +
        ws.side * (topHalfW + (hitHalfW - topHalfW) * p2) * ws.offsetRatio;
      const y2 = roadY(p2);
      ctx.strokeStyle = `rgba(${stageTheme.rgb[0]}, ${stageTheme.rgb[1]}, ${
        stageTheme.rgb[2]
      }, ${0.12 + p1 * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 3. Pressed Lane Light Beams (`metal_light002_red..violet`)
    for (const lane of pressedLanes) {
      if (lane < 0 || lane >= lines) continue;
      const f0 = lane / lines;
      const f1 = (lane + 1) / lines;
      const beamGrad = ctx.createLinearGradient(0, hitY, 0, vanishY);
      const col = laneColors[lane % laneColors.length];
      beamGrad.addColorStop(0, this.hexWithAlpha(col, 0.42));
      beamGrad.addColorStop(0.55, this.hexWithAlpha(col, 0.12));
      beamGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.moveTo(roadX(0, f0), roadY(0));
      ctx.lineTo(roadX(0, f1), roadY(0));
      ctx.lineTo(roadX(bottomP, f1), height);
      ctx.lineTo(roadX(bottomP, f0), height);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.fill();
    }

    // 4. Horizontal Beat Measure Lines
    const beatMs = 60000 / Math.max(80, bpm);
    const firstBeat =
      Math.ceil((songTimeMs - appearWindowMs * 0.2) / beatMs) * beatMs;
    ctx.lineWidth = 1;
    for (let bt = firstBeat; bt <= songTimeMs + appearWindowMs; bt += beatMs) {
      const u = 1 - (bt - songTimeMs) / appearWindowMs;
      if (u < 0 || u > 1.15) continue;
      const p = this.projectU(u);
      const y = roadY(p);
      ctx.strokeStyle = `rgba(150, 195, 255, ${0.06 + p * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(roadX(p, 0), y);
      ctx.lineTo(roadX(p, 1), y);
      ctx.stroke();
    }

    // 5. Internal Lane Divider Rails & Metallic Outer Beams (`metal_line`)
    for (let i = 1; i < lines; i++) {
      const frac = i / lines;
      ctx.strokeStyle = "rgba(140, 185, 240, 0.24)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(roadX(0, frac), vanishY);
      ctx.lineTo(roadX(bottomP, frac), height);
      ctx.stroke();
    }

    // Glowing Outer Metallic Rails
    for (const frac of [0, 1]) {
      ctx.save();
      ctx.shadowColor = stageTheme.glow;
      ctx.shadowBlur = feverStage >= 5 ? 18 : 10;
      ctx.strokeStyle = stageTheme.primary;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(roadX(0, frac), vanishY);
      ctx.lineTo(roadX(bottomP, frac), height);
      ctx.stroke();
      ctx.restore();
    }

    // Horizon Glow Bar
    const horGrad = ctx.createLinearGradient(
      centerX - topHalfW * 1.4,
      vanishY,
      centerX + topHalfW * 1.4,
      vanishY
    );
    horGrad.addColorStop(0, "rgba(0,0,0,0)");
    horGrad.addColorStop(0.5, stageTheme.glow);
    horGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = horGrad;
    ctx.fillRect(centerX - topHalfW * 1.4, vanishY - 3, topHalfW * 2.8, 6);

    // 6. Metallic Hit Line & Receptor Bases (`metal_notebar`, `note_metalbase_off/on`)
    ctx.save();
    ctx.fillStyle = "rgba(25, 42, 74, 0.9)";
    ctx.strokeStyle = "rgba(180, 220, 255, 0.7)";
    ctx.lineWidth = 2;
    for (let l = 0; l < lines; l++) {
      const x0 = roadX(1, l / lines) + 3;
      const x1 = roadX(1, (l + 1) / lines) - 3;
      const padH = Math.max(14, height * 0.022);
      const isDown = pressedLanes.has(l);
      const lCol = laneColors[l % laneColors.length];

      ctx.beginPath();
      ctx.roundRect(x0, hitY - padH * 0.5, x1 - x0, padH, 5);
      if (isDown) {
        ctx.fillStyle = lCol;
        ctx.shadowColor = lCol;
        ctx.shadowBlur = 16;
      } else {
        ctx.fillStyle = "rgba(22, 36, 64, 0.92)";
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.strokeStyle = isDown ? "#ffffff" : "rgba(140, 190, 255, 0.65)";
      ctx.stroke();
    }
    ctx.restore();

    // 7. Neon Bullets shooting up lanes (`fireFxNeonBullet`)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.progress -= dtSec * 2.6;
      if (b.progress <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }
      const p = this.projectU(b.progress);
      const cx = roadX(p, (b.lane + 0.5) / lines);
      const cy = roadY(p);
      const r = 3 + p * 7;
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Draw Active Notes (Long Bodies & Slide Ribbons first, then Note Heads)
    const minVisibleMs = songTimeMs - 260;
    const maxVisibleMs = songTimeMs + appearWindowMs;

    for (const st of notes) {
      if (st.completed) continue;
      const n = st.note;
      const endMs = n.timeMs + (n.durationMs ?? 0);
      if (endMs < minVisibleMs) continue;
      if (n.timeMs > maxVisibleMs) break;

      if (n.kind === "long" && n.durationMs) {
        const headMs = st.holding ? Math.max(n.timeMs, songTimeMs) : n.timeMs;
        const tailMs = n.timeMs + n.durationMs;
        const uHead = Math.min(1.18, 1 - (headMs - songTimeMs) / appearWindowMs);
        const uTail = Math.max(0, 1 - (tailMs - songTimeMs) / appearWindowMs);
        if (uHead > 0 && uHead > uTail) {
          const pH = this.projectU(uHead);
          const pT = this.projectU(uTail);
          const f0 = (n.lane + 0.14) / lines;
          const f1 = (n.lane + 0.86) / lines;

          ctx.save();
          const ribbonGrad = ctx.createLinearGradient(
            0,
            roadY(pT),
            0,
            roadY(pH)
          );
          ribbonGrad.addColorStop(
            0,
            this.hexWithAlpha(stageTheme.primary, st.missed ? 0.18 : 0.42)
          );
          ribbonGrad.addColorStop(
            1,
            this.hexWithAlpha(stageTheme.primary, st.missed ? 0.25 : 0.78)
          );
          ctx.beginPath();
          ctx.moveTo(roadX(pT, f0), roadY(pT));
          ctx.lineTo(roadX(pT, f1), roadY(pT));
          ctx.lineTo(roadX(pH, f1), roadY(pH));
          ctx.lineTo(roadX(pH, f0), roadY(pH));
          ctx.closePath();
          ctx.fillStyle = ribbonGrad;
          ctx.fill();
          ctx.strokeStyle = st.holding ? "#ffffff" : stageTheme.core;
          ctx.lineWidth = st.holding ? 2.4 : 1.4;
          ctx.stroke();
          ctx.restore();

          // Tail cap
          this.drawNoteBar(
            ctx,
            roadX(pT, (n.lane + 0.1) / lines),
            roadX(pT, (n.lane + 0.9) / lines),
            roadY(pT),
            Math.max(5, 12 * pT),
            stageTheme.primary,
            stageTheme.core,
            0.75
          );
        }
      } else if (n.kind === "slide" && n.slidePath && n.slidePath.length > 0) {
        // Draw connected Slide Ribbon across waypoints!
        const pts: Array<{ ms: number; lane: number }> = [
          { ms: n.timeMs, lane: n.lane },
          ...n.slidePath.map((wp) => ({
            ms: n.timeMs + wp.offsetMs,
            lane: wp.lane,
          })),
        ];
        ctx.save();
        for (let seg = 0; seg < pts.length - 1; seg++) {
          const a = pts[seg];
          const b = pts[seg + 1];
          if (b.ms < minVisibleMs || a.ms > maxVisibleMs) continue;
          const uA = Math.max(0, Math.min(1.2, 1 - (a.ms - songTimeMs) / appearWindowMs));
          const uB = Math.max(0, Math.min(1.2, 1 - (b.ms - songTimeMs) / appearWindowMs));
          const pA = this.projectU(uA);
          const pB = this.projectU(uB);
          const wA = (roadX(pA, 1 / lines) - roadX(pA, 0)) * 0.32;
          const wB = (roadX(pB, 1 / lines) - roadX(pB, 0)) * 0.32;
          const xA = roadX(pA, (a.lane + 0.5) / lines);
          const xB = roadX(pB, (b.lane + 0.5) / lines);
          ctx.beginPath();
          ctx.moveTo(xA - wA, roadY(pA));
          ctx.lineTo(xA + wA, roadY(pA));
          ctx.lineTo(xB + wB, roadY(pB));
          ctx.lineTo(xB - wB, roadY(pB));
          ctx.closePath();
          ctx.fillStyle = this.hexWithAlpha(stageTheme.primary, 0.52);
          ctx.fill();
          ctx.strokeStyle = stageTheme.core;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        // Draw glowing Slide Dots on waypoints (`dot` sprite)
        n.slidePath.forEach((wp, wpIdx) => {
          if (st.waypointsHit[wpIdx]) return;
          const wpMs = n.timeMs + wp.offsetMs;
          if (wpMs < minVisibleMs || wpMs > maxVisibleMs) return;
          const u = 1 - (wpMs - songTimeMs) / appearWindowMs;
          if (u < 0 || u > 1.2) return;
          const p = this.projectU(u);
          const cx = roadX(p, (wp.lane + 0.5) / lines);
          const cy = roadY(p);
          const rad = Math.max(5, 14 * p);
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = stageTheme.primary;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = stageTheme.primary;
          ctx.stroke();
        });
        ctx.restore();
      }

      // Draw Main Note Head (unless already hit on a Long/Slide note)
      if (!st.headHit) {
        const u = 1 - (n.timeMs - songTimeMs) / appearWindowMs;
        if (u >= 0 && u <= 1.22) {
          const p = this.projectU(u);
          const x0 = roadX(p, (n.lane + 0.06) / lines);
          const x1 = roadX(p, (n.lane + 0.94) / lines);
          const y = roadY(p);
          const barH = Math.max(7, (isLandscape ? 22 : 20) * (0.35 + p * 0.78));
          this.drawNoteBar(
            ctx,
            x0,
            x1,
            y,
            barH,
            stageTheme.primary,
            stageTheme.core,
            st.missed ? 0.35 : 1.0,
            n.kind === "slide"
          );
        }
      }
    }

    // 9. Hit Burst Rings at Receptor Line (`touch_effect1` / `touch_focus`)
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      const age = (nowPerfMs - b.bornMs) / 280;
      if (age >= 1) {
        this.bursts.splice(i, 1);
        continue;
      }
      const cx = roadX(1, (b.lane + 0.5) / lines);
      const cy = hitY;
      const laneW = roadX(1, 1 / lines) - roadX(1, 0);
      const rad = laneW * (0.28 + age * 0.58);
      ctx.save();
      ctx.strokeStyle = this.hexWithAlpha(b.color, 1 - age);
      ctx.lineWidth = 4 * (1 - age);
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * 0.46, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 10. Center Combo + Verdict Overlay (`letter_combo`, `verdict01_perfect..05_miss`)
    const centerHudY = vanishY + (hitY - vanishY) * 0.36;
    if (combo >= 2) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(210, 235, 255, 0.88)";
      ctx.font = `800 ${Math.round(height * 0.02)}px system-ui, sans-serif`;
      ctx.fillText("COMBO", centerX, centerHudY - height * 0.042);

      const pulse =
        this.lastVerdict && nowPerfMs - this.lastVerdict.timeMs < 110
          ? 1.16
          : 1.0;
      ctx.font = `900 ${Math.round(
        height * 0.064 * pulse
      )}px system-ui, sans-serif`;
      ctx.shadowColor = stageTheme.glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(combo), centerX, centerHudY + height * 0.012);
      ctx.restore();
    }

    if (feverStage > 0) {
      const mult = FEVER_STAGE_MULTIPLIERS[feverStage];
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.round(height * 0.024)}px system-ui, sans-serif`;
      ctx.fillStyle = feverStage >= 5 ? "#ff7aff" : stageTheme.core;
      ctx.shadowColor = stageTheme.glow;
      ctx.shadowBlur = 14;
      ctx.fillText(
        feverStage >= 5 ? `★ MAX FEVER x${mult} ★` : `FEVER x${mult}`,
        centerX,
        centerHudY + height * 0.048
      );
      ctx.restore();
    }

    if (this.lastVerdict && nowPerfMs - this.lastVerdict.timeMs < 560) {
      const age = (nowPerfMs - this.lastVerdict.timeMs) / 560;
      const v = this.lastVerdict.text;
      const vColors: Record<Verdict, string> = {
        perfect: "#ffe44d",
        great: "#3df59b",
        cool: "#38b6ff",
        good: "#b59cff",
        miss: "#ff4d6a",
      };
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - age) * 1.4);
      ctx.textAlign = "center";
      const scale = age < 0.14 ? 0.85 + (age / 0.14) * 0.3 : 1.15 - age * 0.15;
      ctx.font = `900 italic ${Math.round(
        height * 0.042 * scale
      )}px system-ui, sans-serif`;
      ctx.shadowColor = vColors[v];
      ctx.shadowBlur = 18;
      ctx.fillStyle = vColors[v];
      ctx.fillText(
        v.toUpperCase(),
        centerX,
        centerHudY + height * 0.105 - age * 10
      );
      ctx.restore();
    }

    // Watermark (`watermark_replay` / `watermark_testplay` / `watermark_rec`)
    if (watermark) {
      ctx.save();
      ctx.textAlign = "right";
      ctx.font = `800 13px system-ui, sans-serif`;
      ctx.fillStyle =
        watermark === "REC"
          ? "rgba(255, 70, 90, 0.92)"
          : "rgba(90, 210, 255, 0.88)";
      ctx.fillText(`● ${watermark}`, width - 16, vanishY - 10);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawNoteBar(
    ctx: CanvasRenderingContext2D,
    x0: number,
    x1: number,
    cy: number,
    barH: number,
    primary: string,
    core: string,
    alpha: number,
    isSlideHead = false
  ): void {
    const w = Math.max(8, x1 - x0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = primary;
    ctx.shadowBlur = 14;

    const grad = ctx.createLinearGradient(0, cy - barH * 0.5, 0, cy + barH * 0.5);
    grad.addColorStop(0, core);
    grad.addColorStop(0.45, primary);
    grad.addColorStop(1, "#0f1c38");

    ctx.beginPath();
    ctx.roundRect(x0, cy - barH * 0.5, w, barH, barH * 0.38);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Inner bright specular core strip
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(
      x0 + w * 0.16,
      cy - barH * 0.16,
      w * 0.68,
      barH * 0.32,
      barH * 0.16
    );
    ctx.fill();

    if (isSlideHead) {
      ctx.fillStyle = "#ffe44d";
      ctx.beginPath();
      ctx.arc((x0 + x1) * 0.5, cy, barH * 0.36, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private hexWithAlpha(hex: string, alpha: number): string {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16) || 40;
    const g = parseInt(clean.slice(2, 4), 16) || 168;
    const b = parseInt(clean.slice(4, 6), 16) || 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
}
