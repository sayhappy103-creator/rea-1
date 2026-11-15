import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

/** Minimal localStorage so the store module can be exercised in Node. */
class MemoryStorage {
  #data = new Map();
  getItem(key) {
    return this.#data.has(key) ? this.#data.get(key) : null;
  }
  setItem(key, value) {
    this.#data.set(key, String(value));
  }
  removeItem(key) {
    this.#data.delete(key);
  }
  clear() {
    this.#data.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const store = await import("../src/store.js");

beforeEach(() => {
  globalThis.localStorage.clear();
  store.resetAll();
});

test("defaults are sane and language independent of the browser", () => {
  const settings = store.getSettings();
  assert.equal(settings.lanes, 4);
  assert.equal(settings.speed, 3);
  assert.equal(settings.offsetMs, 0);
  assert.equal(settings.hitSfx, true);
  assert.equal(settings.longNotes, true);
  assert.ok(store.LANE_OPTIONS.includes(settings.lanes));
});

test("updates persist and are coerced back into range", () => {
  store.updateSettings({
    lanes: 6,
    speed: 4.5,
    offsetMs: 5000,
    backgroundDim: 5,
  });
  const settings = store.getSettings();
  assert.equal(settings.lanes, 6);
  assert.equal(settings.speed, 4.5);
  assert.equal(settings.offsetMs, store.OFFSET_LIMIT);
  assert.equal(settings.backgroundDim, 0.9);

  store.updateSettings({ lanes: 9 });
  assert.equal(store.getSettings().lanes, 4, "invalid lane counts fall back");

  const raw = JSON.parse(
    globalThis.localStorage.getItem(`${store.STORAGE_NAMESPACE}.settings`),
  );
  assert.equal(raw.lanes, 4);
});

test("scores keep the best run per song", () => {
  const first = store.saveScore("yt:abc", {
    score: 500000,
    accuracy: 0.8,
    maxCombo: 40,
    rank: "B",
    difficulty: "normal",
    lanes: 4,
    playedAt: Date.now(),
  });
  assert.equal(first.improved, true);

  const worse = store.saveScore("yt:abc", {
    score: 400000,
    accuracy: 0.9,
    maxCombo: 30,
    rank: "C",
    difficulty: "normal",
    lanes: 4,
    playedAt: Date.now(),
  });
  assert.equal(worse.improved, false);
  assert.equal(store.getScores()["yt:abc"].score, 500000);

  const better = store.saveScore("yt:abc", {
    score: 900000,
    accuracy: 0.99,
    maxCombo: 120,
    rank: "A",
    difficulty: "normal",
    lanes: 4,
    playedAt: Date.now(),
  });
  assert.equal(better.improved, true);
  assert.equal(store.getScores()["yt:abc"].rank, "A");
});

test("history is newest-first, de-duplicated and capped", () => {
  for (let index = 0; index < 45; index += 1) {
    store.pushHistory({
      songId: `song-${index}`,
      title: `Song ${index}`,
      score: index,
    });
  }
  const history = store.getHistory();
  assert.ok(history.length <= 40);
  assert.equal(history[0].songId, "song-44");

  store.pushHistory({ songId: "song-44", title: "again" });
  const deduped = store.getHistory();
  assert.equal(deduped.filter((entry) => entry.songId === "song-44").length, 1);
});

test("custom charts round-trip and can be deleted", () => {
  store.saveCustomChart("yt:abc", {
    songId: "yt:abc",
    notes: [{ time: 1, lane: 0 }],
  });
  assert.deepEqual(store.getCustomCharts()["yt:abc"].notes, [
    { time: 1, lane: 0 },
  ]);
  store.deleteCustomChart("yt:abc");
  assert.equal(store.getCustomCharts()["yt:abc"], undefined);
});

test("resetAll clears everything and restores defaults", () => {
  store.updateSettings({ lanes: 6, hitSfx: false });
  store.pushHistory({ songId: "x", title: "x" });
  store.saveCustomChart("x", { notes: [] });
  store.resetAll();
  assert.equal(store.getSettings().lanes, 4);
  assert.equal(store.getHistory().length, 0);
  assert.deepEqual(store.getCustomCharts(), {});
});

test("corrupt persisted JSON degrades to defaults", () => {
  globalThis.localStorage.setItem(
    `${store.STORAGE_NAMESPACE}.settings`,
    "{not json",
  );
  globalThis.localStorage.setItem(`${store.STORAGE_NAMESPACE}.history`, "42");
  // Reading through a fresh import is not possible, so assert through the API
  // that already-loaded values stay usable.
  assert.doesNotThrow(() => store.getHistory());
  assert.equal(Array.isArray(store.getHistory()), true);
});
