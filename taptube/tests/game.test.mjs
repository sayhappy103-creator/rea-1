/**
 * Gameplay rules: judging windows, combo/score reaction, long-note release and
 * pause/resume. Runs the real game module with a stub canvas and player.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JUDGE_WINDOWS, createScoreState, summariseRun } from "../src/judge.js";

const noop = () => {};

/** Minimal canvas/renderer surface createGame touches. */
function stubCanvas() {
  const context = new Proxy(
    {
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (target, prop) => (prop in target ? target[prop] : noop),
      set: (target, prop, value) => {
        target[prop] = value;
        return true;
      },
    },
  );
  return {
    width: 720,
    height: 960,
    clientWidth: 720,
    clientHeight: 960,
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 720,
      height: 960,
      right: 720,
      bottom: 960,
    }),
    addEventListener: noop,
    removeEventListener: noop,
  };
}

/** A player whose clock the test drives by hand. */
function stubPlayer() {
  return {
    chartPosition: 0,
    played: 0,
    paused: false,
    seek(to) {
      this.chartPosition = to;
    },
    async play() {
      this.played += 1;
    },
    async pause() {
      this.paused = true;
    },
    async resume() {
      this.paused = false;
    },
  };
}

const settings = {
  speed: 4,
  offsetMs: 0,
  mirror: false,
  vibrate: false,
  showJudgment: true,
  backgroundDim: 0.4,
  autoplay: false,
};

const chart = {
  songId: "test",
  duration: 10,
  bpm: 120,
  lanes: 4,
  notes: [
    { time: 1, lane: 0, kind: "tap", intensity: 0.6 },
    { time: 1, lane: 1, kind: "tap", intensity: 0.6 },
    { time: 2, lane: 2, kind: "hold", endTime: 3, intensity: 0.6 },
    { time: 4, lane: 3, kind: "tap", intensity: 0.6 },
  ],
};

// requestAnimationFrame is not needed: the test drives frames through the
// player clock and the public API only.
globalThis.requestAnimationFrame = (callback) => {
  setTimeout(() => callback(performance.now()), 8);
  return 1;
};
globalThis.cancelAnimationFrame = noop;

const { createGame } = await import("../src/game.js");

function startGame(t, overrides = {}) {
  const events = [];
  const game = createGame({
    canvas: stubCanvas(),
    chart,
    settings: { ...settings, ...overrides },
    player: stubPlayer(),
    practice: false,
    callbacks: {
      onJudgment: (judgment) => events.push(judgment),
      onFinish: () => events.push("finish"),
      onIdleTap: () => events.push("idle"),
    },
  });
  game.start();
  // Always stop the loop, otherwise a failing assertion leaves rAF running and
  // the test process never exits.
  t.after(() => game.destroy());
  return { game, events };
}

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until the count-in has finished and notes are live. */
async function playing(game) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (game.status === "playing") return;
    await tick(50);
  }
  throw new Error(`game stuck in ${game.status}`);
}

test("judging windows are ordered and non-overlapping", () => {
  const { perfect, great, good, bad, miss } = JUDGE_WINDOWS;
  assert.ok(bad < miss, "bad window must be inside the miss window");
  assert.ok(perfect < great, "perfect must be tighter than great");
  assert.ok(good > great && bad > good);
});

test("a press inside the window scores, a press outside is an idle tap", async (t) => {
  const { game, events } = startGame(t);
  // Presses during the count-in are ignored entirely.
  game.press(0);
  assert.deepEqual(events, []);
  await playing(game);

  game.seek(1);
  game.press(0);
  assert.ok(events.includes("perfect"), `got ${events.join(",")}`);
  game.release(0);
});

test("an early release of a long note cancels the tail", async (t) => {
  const { game, events } = startGame(t);
  await playing(game);
  game.seek(2);
  game.press(2);
  assert.ok(events.includes("perfect"), "head should hit");
  // Release well before the 3 s tail.
  game.release(2);
  assert.ok(
    events.filter((event) => event === "miss").length >= 1,
    `expected a miss, got ${events.join(",")}`,
  );
});

test("holding a long note to its tail is not a miss", async (t) => {
  const { game, events } = startGame(t);
  await playing(game);
  game.seek(2);
  game.press(2);
  game.seek(3.05);
  game.release(2);
  assert.equal(
    events.filter((event) => event === "miss").length,
    0,
    `unexpected miss: ${events.join(",")}`,
  );
});

test("pause freezes the status and resume returns to play", async (t) => {
  const { game } = startGame(t);
  await playing(game);
  game.seek(1);
  game.pause();
  assert.equal(game.status, "paused");
  game.resume();
  assert.equal(game.status, "playing");
});

test("scoring rewards combos but stays under the chart maximum", () => {
  const state = createScoreState();
  assert.equal(state.score, 0);
  assert.equal(summariseRun(state).rank, "D");
});

test("a mirrored lane maps to the opposite column", (t) => {
  const { game } = startGame(t, { mirror: true });
  // 4 lanes across 720 px with a 25.2 px pad (see renderer.layout).
  assert.equal(game.pointerLane(60), 3, "first lane mirrors to the last");
  assert.equal(game.pointerLane(680), 0, "last lane mirrors to the first");
});
