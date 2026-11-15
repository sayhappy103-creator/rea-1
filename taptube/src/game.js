/**
 * Game loop: input, judging, scoring, rendering and audio in one place.
 * The loop is time-driven from the audio clock so pauses, seeks and frame
 * drops never desync the chart.
 */

import { LANE_COLORS, createRenderer } from "./renderer.js";
import {
  JUDGE_WINDOWS,
  accuracyOf,
  applyJudgment,
  classifyOffset,
  createScoreState,
  summariseRun,
} from "./judge.js";
import { clamp, formatScore, formatTime } from "./util.js";

const RELEASE_GRACE = 0.14;
const COUNT_IN_SECONDS = 3;

/**
 * Keyboard mapping per lane count (D F J K / 1..6 / numpad).
 * `string` values are compared against the lowercased event key.
 */
const KEY_MAPS = {
  4: [["d"], ["f"], ["j"], ["k"]],
  5: [["d"], ["f"], [" ", "g"], ["j"], ["k"]],
  6: [["s"], ["d"], ["f"], ["j"], ["k"], ["l"]],
};

export const KEY_HINTS = {
  4: ["D", "F", "J", "K"],
  5: ["D", "F", "SPACE", "J", "K"],
  6: ["S", "D", "F", "J", "K", "L"],
};

/**
 * @param {object} config
 * @param {HTMLCanvasElement} config.canvas
 * @param {object} config.chart
 * @param {object} config.settings
 * @param {import("./audio.js").AudioPlayer|null} config.player
 * @param {object} config.callbacks
 */
export function createGame(config) {
  const { canvas, chart, settings, player, callbacks = {} } = config;
  const renderer = createRenderer(canvas);
  const notes = [...chart.notes].sort((a, b) => a.time - b.time);
  const state = createScoreState();
  state.total = notes.length;

  const lanes = chart.lanes;
  const keyMap = KEY_MAPS[lanes] ?? KEY_MAPS[4];
  const activeHolds = new Map();
  /** Notes whose head was hit and whose tail is still in progress. */
  const heldNotes = new Set();
  const hits = new Map();
  const autoplay = Boolean(settings.autoplay) || Boolean(config.practice);
  const judgeOffset = (settings.offsetMs ?? 0) / 1000;

  let status = "countin"; // countin | playing | paused | finished
  let countIn = COUNT_IN_SECONDS;
  let chartTime = 0;
  let nextIndex = 0;
  let frameHandle = 0;
  let lastFrame = 0;
  let stopped = false;

  const hitSound = callbacks.hitSound ?? null;

  function pointerLane(clientX) {
    const rect = canvas.getBoundingClientRect();
    const geometry = renderer.layout(lanes);
    const localX = ((clientX - rect.left) / rect.width) * renderer.size.width;
    const lane = Math.floor((localX - geometry.padX) / geometry.laneWidth);
    return settings.mirror ? lanes - 1 - lane : clamp(lane, 0, lanes - 1);
  }

  function vibrate(pattern = 8) {
    if (!settings.vibrate) return;
    try {
      globalThis.navigator?.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }

  function noteWindow(note, time) {
    return note.time + judgeOffset - time;
  }

  const heldLanes = new Set();

  /** Press on a lane: judge the nearest unjudged note in that lane. */
  function press(lane) {
    if (status !== "playing") return;
    if (heldLanes.has(lane)) {
      const held = activeHolds.get(lane);
      if (held) {
        activeHolds.delete(lane);
        judgeHoldEnd(held);
      }
      return;
    }
    heldLanes.add(lane);
    let candidate = null;
    for (
      let index = Math.max(0, nextIndex - 2);
      index < notes.length;
      index += 1
    ) {
      const note = notes[index];
      if (note.time - chartTime > JUDGE_WINDOWS.miss + 0.1) break;
      if (note.lane !== lane || hits.has(note)) continue;
      if (note.time + judgeOffset - chartTime < -JUDGE_WINDOWS.miss) continue;
      candidate = note;
      break;
    }
    if (!candidate) {
      callbacks.onIdleTap?.(lane);
      return;
    }

    const offset = noteWindow(candidate, chartTime);
    const judgment = classifyOffset(offset);
    if (judgment === null) return;

    registerHit(candidate, judgment, lanes, settings);
  }

  /**
   * Judge the tail of a long note. Releasing early converts the note to a miss
   * (the head already scored); releasing at/after the tail is neutral, because
   * the note was scored when its head was hit.
   */
  function judgeHoldEnd(note) {
    heldNotes.delete(note);
    const endTime = note.endTime ?? note.time;
    const remaining = endTime + judgeOffset - chartTime;
    if (remaining > RELEASE_GRACE) {
      applyJudgment(state, "miss", { totalNotes: notes.length });
      callbacks.onJudgment?.("miss", state);
      if (settings.showJudgment) callbacks.onJudgeText?.("miss");
      callbacks.onScore?.(state);
    }
  }

  function release(lane) {
    heldLanes.delete(lane);
    const note = activeHolds.get(lane);
    if (!note) return;
    activeHolds.delete(lane);
    judgeHoldEnd(note);
  }

  function registerHit(note, judgment, laneCount, options) {
    hits.set(note, judgment);
    applyJudgment(state, judgment, { totalNotes: notes.length });
    callbacks.onScore?.(state);
    callbacks.onJudgment?.(judgment, state);
    if (options.showJudgment) callbacks.onJudgeText?.(judgment);

    if (judgment !== "miss") {
      renderer.burst(
        options.mirror ? laneCount - 1 - note.lane : note.lane,
        laneCount,
        LANE_COLORS[note.lane % LANE_COLORS.length],
        note.intensity ?? 0.8,
      );
      hitSound?.(Math.min(2, 1 + (note.intensity ?? 0.6) * 0.25));
      vibrate(judgment === "perfect" ? 6 : 10);
    }
    // Autoplay never holds: the tail is scored with the head, so treating the
    // note as complete keeps the lane free for the next note.
    if (
      !autoplay &&
      judgment !== "miss" &&
      (note.kind === "hold" || note.kind === "slide")
    ) {
      activeHolds.set(note.lane, note);
      heldNotes.add(note);
    }
  }

  /** Miss any note whose window has fully passed. */
  function expireNotes() {
    while (nextIndex < notes.length) {
      const note = notes[nextIndex];
      if (hits.has(note) || heldNotes.has(note)) {
        nextIndex += 1;
        continue;
      }
      const offset = noteWindow(note, chartTime);
      if (offset > -JUDGE_WINDOWS.miss) break;
      applyJudgment(state, "miss", { totalNotes: notes.length });
      hits.set(note, "miss");
      callbacks.onScore?.(state);
      callbacks.onJudgment?.("miss", state);
      if (settings.showJudgment) callbacks.onJudgeText?.("miss");
      nextIndex += 1;
    }
  }

  function autoplayTick() {
    while (nextIndex < notes.length) {
      const note = notes[nextIndex];
      if (hits.has(note)) {
        nextIndex += 1;
        continue;
      }
      const offset = noteWindow(note, chartTime);
      if (offset > 0.008) break;
      const judgment = offset < -JUDGE_WINDOWS.good ? "good" : "perfect";
      registerHit(note, judgment, lanes, { ...settings, autoplay: true });
      nextIndex += 1;
    }
  }

  function frame(timestamp) {
    if (stopped) return;
    const delta =
      lastFrame === 0 ? 0 : Math.min(0.05, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;

    if (status === "countin") {
      // The clock only advances once the count-in is over: running it during the
      // count-in would mark every note in the first seconds as missed.
      countIn -= delta;
      callbacks.onCountIn?.(Math.max(0, countIn));
      if (countIn <= 0) {
        status = "playing";
        callbacks.onCountIn?.(null);
        if (player) {
          player.offsetMs = settings.offsetMs ?? 0;
          void player.play(0);
        }
      } else {
        renderer.draw({
          time: 0,
          notes,
          options: {
            lanes,
            speed: settings.speed,
            dim: settings.backgroundDim,
            mirror: settings.mirror,
            videoVisible: Boolean(callbacks.videoVisible?.()),
          },
          active: activeHolds,
        });
        frameHandle = requestAnimationFrame(frame);
        return;
      }
    }

    if (status === "playing") {
      chartTime = player ? player.chartPosition : chartTime + delta;
      if (chartTime < 0) chartTime = 0;
      expireNotes();
      if (autoplay) autoplayTick();
      callbacks.onTick?.({
        time: chartTime,
        duration: chart.duration,
        state,
        accuracy: accuracyOf(state),
      });
      if (chartTime > chart.duration + 0.6) {
        finish();
        return;
      }
    }

    renderer.draw({
      time: chartTime,
      notes,
      options: {
        lanes,
        speed: settings.speed,
        dim: settings.backgroundDim,
        mirror: settings.mirror,
        videoVisible: Boolean(callbacks.videoVisible?.()),
      },
      active: activeHolds,
    });

    frameHandle = requestAnimationFrame(frame);
  }

  function finish() {
    status = "finished";
    stop();
    callbacks.onFinish?.(summariseRun(state));
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameHandle);
    player?.pause();
  }

  /** Freeze the run (audio included) and stop scheduling frames. */
  function pause() {
    if (status !== "playing") return false;
    status = "paused";
    player?.pause();
    cancelAnimationFrame(frameHandle);
    callbacks.onPause?.(true);
    renderer.draw({
      time: chartTime,
      notes,
      options: {
        lanes,
        speed: settings.speed,
        dim: settings.backgroundDim,
        mirror: settings.mirror,
        videoVisible: Boolean(callbacks.videoVisible?.()),
      },
      active: activeHolds,
    });
    return true;
  }

  /** Continue a paused run from the exact audio position. */
  function resume() {
    if (status !== "paused") return false;
    status = "playing";
    callbacks.onPause?.(false);
    if (player) void player.resume();
    lastFrame = 0;
    frameHandle = requestAnimationFrame(frame);
    return true;
  }

  function togglePause() {
    if (status === "paused") return resume();
    return pause();
  }

  function resize() {
    renderer.resize();
    if (status === "paused") {
      renderer.draw({
        time: chartTime,
        notes,
        options: {
          lanes,
          speed: settings.speed,
          dim: settings.backgroundDim,
          mirror: settings.mirror,
        },
        active: activeHolds,
      });
    }
  }

  function destroy() {
    stop();
    globalThis.removeEventListener?.("resize", resize);
  }

  function start() {
    lastFrame = 0;
    status = "countin";
    countIn = COUNT_IN_SECONDS;
    if (!player) {
      // No audio track (YouTube iframe mode): start counting from the top.
      chartTime = 0;
    }
    frameHandle = requestAnimationFrame(frame);
  }

  // Guarded so the module also runs outside a browser (tests, SSR).
  globalThis.addEventListener?.("resize", resize);

  return {
    start,
    stop,
    destroy,
    togglePause,
    press,
    release,
    pointerLane,
    get status() {
      return status;
    },
    pause,
    resume,
    get state() {
      return state;
    },
    get time() {
      return chartTime;
    },
    get progress() {
      return chart.duration > 0 ? clamp(chartTime / chart.duration, 0, 1) : 0;
    },
    get hud() {
      return {
        score: formatScore(state.score),
        accuracy: accuracyOf(state),
        combo: state.combo,
        time: formatTime(chartTime),
        duration: formatTime(chart.duration),
      };
    },
    renderer,
    keyHints: KEY_HINTS[lanes],
    keyMap,
    seek(seconds) {
      chartTime = clamp(seconds, 0, chart.duration);
      player?.seek(chartTime);
      nextIndex = notes.findIndex(
        (note) => note.time + judgeOffset >= chartTime - 0.5,
      );
      if (nextIndex < 0) nextIndex = notes.length;
    },
  };
}
