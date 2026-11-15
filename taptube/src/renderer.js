/**
 * Playfield renderer: lane background, judgement line, falling notes,
 * long-note tails, slides, hit particles and the YouTube video window.
 *
 * Positions are computed from seconds (not pixels), so note speed, lane count
 * and canvas size can change without touching the game state.
 */

import { clamp } from "./util.js";

export const LANE_COLORS = [
  "#ffffff",
  "#8ff7e4",
  "#ffd166",
  "#ff8fc7",
  "#9fb4ff",
  "#c3ff8f",
];

const PARTICLES_PER_HIT = 10;

export function createRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  let width = canvas.clientWidth || 720;
  let height = canvas.clientHeight || 960;
  let ratio = 1;

  const particles = [];

  function resize() {
    ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    width = canvas.clientWidth || width;
    height = canvas.clientHeight || height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  resize();

  /** Geometry shared by input handling and drawing. */
  function layout(laneCount) {
    const padX = Math.max(10, width * 0.035);
    const fieldWidth = width - padX * 2;
    const laneWidth = fieldWidth / laneCount;
    const judgeY = height * 0.8;
    const topY = Math.max(16, height * 0.06);
    return { padX, fieldWidth, laneWidth, judgeY, topY, laneCount };
  }

  /** Pixels per second derived from the travel distance and note speed. */
  function travelSeconds(speed) {
    return clamp(2.35 - speed * 0.17, 0.55, 2.4);
  }

  /**
   * @param {object} frame
   * @param {number} frame.time current chart time in seconds
   * @param {Array} frame.notes notes to consider
   * @param {object} frame.state score state (for combo glow)
   * @param {object} frame.options {lanes, speed, dim, videoUrl, mirror, theme}
   */
  function draw(frame) {
    const { time, notes, options, active = new Map() } = frame;
    const geometry = layout(options.lanes);
    const seconds = travelSeconds(options.speed);
    const distance = geometry.judgeY - geometry.topY;
    const pxPerSecond = distance / seconds;

    context.clearRect(0, 0, width, height);

    // Video window (YouTube iframe sits behind the canvas; we only draw the
    // dimming veil and the rounded frame so notes stay readable).
    if (options.videoVisible) {
      context.save();
      const inset = Math.max(8, width * 0.02);
      const videoHeight = geometry.judgeY - geometry.topY;
      context.fillStyle = `rgba(4, 3, 10, ${clamp(options.dim, 0, 0.92)})`;
      roundRect(context, {
        x: inset,
        y: geometry.topY - 6,
        width: width - inset * 2,
        height: videoHeight + 12,
        radius: 18,
      });
      context.fill();
      context.restore();
    }

    drawLanes(geometry);
    drawHitLine(geometry, time);
    drawNotes({ geometry, pxPerSecond, time, notes, options, active });
    drawParticles(time);
  }

  function drawLanes(geometry) {
    const { padX, laneWidth, topY, judgeY, laneCount } = geometry;
    context.save();
    const gradient = context.createLinearGradient(0, topY, 0, judgeY);
    gradient.addColorStop(0, "rgba(12, 10, 26, 0.0)");
    gradient.addColorStop(0.35, "rgba(12, 10, 26, 0.42)");
    gradient.addColorStop(1, "rgba(6, 5, 14, 0.72)");
    context.fillStyle = gradient;
    roundRect(context, {
      x: padX - 4,
      y: topY - 10,
      width: laneWidth * laneCount + 8,
      height: judgeY - topY + 22,
      radius: 20,
    });
    context.fill();

    for (let lane = 0; lane < laneCount; lane += 1) {
      const x = padX + lane * laneWidth;
      if (lane > 0) {
        context.strokeStyle = "rgba(255, 255, 255, 0.06)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, topY - 6);
        context.lineTo(x, judgeY + 10);
        context.stroke();
      }
      const color = LANE_COLORS[lane % LANE_COLORS.length];
      context.globalAlpha = 0.05;
      context.fillStyle = color;
      context.fillRect(x + 1, topY, laneWidth - 2, judgeY - topY);
      context.globalAlpha = 1;
    }
    context.restore();
  }

  function drawHitLine(geometry, time) {
    const { padX, laneWidth, judgeY, laneCount } = geometry;
    context.save();
    const pulse = 0.55 + 0.45 * Math.sin(time * 4);
    const glow = context.createLinearGradient(0, judgeY - 26, 0, judgeY + 14);
    glow.addColorStop(0, "rgba(124, 92, 255, 0)");
    glow.addColorStop(0.7, `rgba(124, 92, 255, ${0.22 * pulse})`);
    glow.addColorStop(1, "rgba(35, 224, 200, 0.28)");
    context.fillStyle = glow;
    context.fillRect(padX - 4, judgeY - 26, laneWidth * laneCount + 8, 40);

    context.strokeStyle = "rgba(255, 255, 255, 0.85)";
    context.lineWidth = 2.5;
    context.shadowColor = "rgba(124, 92, 255, 0.9)";
    context.shadowBlur = 16;
    context.beginPath();
    context.moveTo(padX, judgeY);
    context.lineTo(padX + laneWidth * laneCount, judgeY);
    context.stroke();
    context.restore();
  }

  function drawNotes({ geometry, pxPerSecond, time, notes, options, active }) {
    const { padX, laneWidth, judgeY, topY } = geometry;
    const noteHeight = clamp(laneWidth * 0.34, 12, 26);
    const noteWidth = laneWidth - 10;
    const cullBefore = time - 0.4;
    const cullAfter = time + travelSeconds(options.speed) + 0.6;

    context.save();
    for (const note of notes) {
      if (note.time < cullBefore || note.time > cullAfter) continue;
      const laneIndex = options.mirror
        ? options.lanes - 1 - note.lane
        : note.lane;
      const x = padX + laneIndex * laneWidth + 5;
      const y = judgeY - (note.time - time) * pxPerSecond;
      const color = LANE_COLORS[laneIndex % LANE_COLORS.length];
      const heldBy = active.get(note);
      const intensity = note.intensity ?? 0.6;

      if (note.kind === "hold" || note.kind === "slide") {
        const endTime = note.endTime ?? note.time + 0.4;
        const endY = judgeY - (endTime - time) * pxPerSecond;
        const tailTop = Math.min(y, endY);
        const tailHeight = Math.max(noteHeight, Math.abs(endY - y));
        const slideLane =
          note.kind === "slide" ? (note.endLane ?? note.lane) : note.lane;
        const endLaneIndex = options.mirror
          ? options.lanes - 1 - slideLane
          : slideLane;
        const endX = padX + endLaneIndex * laneWidth + 5;

        context.globalAlpha = 0.32 + intensity * 0.25;
        const tail = context.createLinearGradient(
          0,
          tailTop,
          0,
          tailTop + tailHeight,
        );
        tail.addColorStop(0, color);
        tail.addColorStop(1, "rgba(255, 255, 255, 0.15)");
        context.fillStyle = tail;
        if (note.kind === "slide" && endX !== x) {
          context.beginPath();
          context.moveTo(x, y + noteHeight / 2);
          context.lineTo(x + noteWidth, y + noteHeight / 2);
          context.lineTo(endX + noteWidth, endY + noteHeight / 2);
          context.lineTo(endX, endY + noteHeight / 2);
          context.closePath();
          context.fill();
        } else {
          context.fillRect(
            x + noteWidth * 0.28,
            tailTop,
            noteWidth * 0.44,
            tailHeight,
          );
        }
        context.globalAlpha = 1;
      }

      if (note.kind === "slide") {
        const endLane = note.endLane ?? note.lane;
        const endLaneIndex = options.mirror
          ? options.lanes - 1 - endLane
          : endLane;
        const endX = padX + endLaneIndex * laneWidth + 5;
        const endY =
          judgeY - ((note.endTime ?? note.time + 0.4) - time) * pxPerSecond;
        drawCap({
          x: endX,
          y: endY - noteHeight / 2,
          width: noteWidth,
          height: noteHeight,
          color,
          alpha: 0.55,
        });
      }

      const glowSize = 6 + intensity * 10;
      context.shadowColor = color;
      context.shadowBlur = glowSize;
      const height = noteHeight * (heldBy ? 0.85 : 1);
      drawCap({
        x,
        y: y - height / 2,
        width: noteWidth,
        height,
        color,
        alpha: heldBy ? 1 : 0.94,
      });
      context.shadowBlur = 0;

      if (heldBy) {
        context.globalAlpha = 0.35;
        drawCap({
          x: x - 2,
          y: y - height / 2 - 2,
          width: noteWidth + 4,
          height: height + 4,
          color: "#ffffff",
          alpha: 0.9,
        });
        context.globalAlpha = 1;
      }
    }

    // Landing markers so the player can read the lane at a glance.
    context.globalAlpha = 0.55;
    for (let lane = 0; lane < options.lanes; lane += 1) {
      const x = padX + lane * laneWidth + laneWidth / 2;
      context.strokeStyle = LANE_COLORS[lane % LANE_COLORS.length];
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, judgeY, 3, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.restore();
    void topY;
  }

  function drawCap({ x, y, width, height, color, alpha = 1 }) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    roundRect(context, {
      x,
      y,
      width,
      height,
      radius: Math.min(height / 2, 8),
    });
    context.fill();
    context.globalAlpha = 1;
  }

  /** Burst of particles where a note was hit. */
  function burst(lane, laneCount, color, strength = 1) {
    const geometry = layout(laneCount);
    const x =
      geometry.padX + lane * geometry.laneWidth + geometry.laneWidth / 2;
    for (let index = 0; index < PARTICLES_PER_HIT; index += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const speed = 90 + Math.random() * 220 * strength;
      particles.push({
        x,
        y: geometry.judgeY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        ttl: 0.42 + Math.random() * 0.32,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  let lastParticleTime = 0;
  function drawParticles(time) {
    const delta =
      lastParticleTime === 0 ? 0.016 : clamp(time - lastParticleTime, 0, 0.05);
    lastParticleTime = time;
    if (particles.length === 0) return;
    context.save();
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life += delta;
      if (particle.life >= particle.ttl) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 520 * delta;
      const progress = particle.life / particle.ttl;
      context.globalAlpha = (1 - progress) * 0.9;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(
        particle.x,
        particle.y,
        particle.size * (1 - progress * 0.6),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();
  }

  function roundRect(ctx, { x, y, width: w, height: h, radius }) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Editor preview: static field with the current time marker. */
  function drawEditor({ time, notes, lanes, windowSeconds = 4 }) {
    const geometry = layout(lanes);
    const pxPerSecond = (geometry.judgeY - geometry.topY) / windowSeconds;
    context.clearRect(0, 0, width, height);
    drawLanes(geometry);
    drawNotes({
      geometry,
      pxPerSecond,
      time,
      notes,
      options: { lanes, speed: 3, mirror: false },
      active: new Map(),
    });
    drawHitLine(geometry, time);
    return { geometry, pxPerSecond };
  }

  return {
    canvas,
    context,
    resize,
    layout,
    travelSeconds,
    draw,
    drawEditor,
    burst,
    clearParticles: () => particles.splice(0, particles.length),
    get size() {
      return { width, height, ratio };
    },
  };
}
