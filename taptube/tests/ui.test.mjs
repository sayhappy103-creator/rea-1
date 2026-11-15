/**
 * End-to-end screen smoke test.
 *
 * Runs the whole app (router → screens → game loop) against jsdom with fake
 * Web Audio, so a broken import, a missing element or a thrown render is caught
 * without a browser. Skipped when the optional `jsdom` dev dependency is absent
 * — install it with `npm i --no-save jsdom` to run this suite.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { loadJsdom, openApp } from "./support/dom-harness.mjs";

const jsdom = await loadJsdom();
const skip = jsdom ? false : "jsdom is not installed (npm i --no-save jsdom)";

test(
  "the app boots, every screen renders and a run reaches the results",
  { skip },
  async (t) => {
    const ui = await openApp(jsdom);
    t.after(() => ui.close());
    const { app, doc, tick, module } = ui;

    await t.test("boot", () => {
      assert.equal(doc.getElementById("app").hidden, false);
      assert.ok(doc.querySelector(".hero"), "home hero");
      assert.equal(doc.querySelectorAll(".tab").length, 3);
    });

    await t.test("settings renders and switches language", async () => {
      app.navigate("settings");
      await tick();
      assert.ok(doc.querySelectorAll(".panel").length >= 5);
      const english = [...doc.querySelectorAll(".segmented button")].find(
        (button) => button.textContent === "English",
      );
      assert.ok(english, "English option");
      english.click();
      await tick();
      assert.equal(
        doc.querySelector(".brand small").textContent,
        "Music video rhythm game",
      );
    });

    await t.test("library tabs", async () => {
      app.navigate("library");
      await tick();
      assert.equal(doc.querySelectorAll('[role="tab"]').length, 3);
    });

    const { demoPlaceholderSong, getChart, loadDemoSong } =
      await module("src/songs.js");
    const demo = demoPlaceholderSong();
    const loaded = await loadDemoSong(new ui.window.AudioContext());
    const chart = await getChart(loaded, {
      difficulty: "normal",
      lanes: 4,
      duration: loaded.duration,
    });

    await t.test("a real chart is derived from the demo audio", () => {
      assert.ok(chart.notes.length > 10, `only ${chart.notes.length} notes`);
      assert.ok(chart.bpm > 90 && chart.bpm < 160, `bpm ${chart.bpm}`);
      assert.ok(chart.duration > 0);
      for (const note of chart.notes) {
        assert.ok(note.lane >= 0 && note.lane < chart.lanes);
        assert.ok(Number.isFinite(note.time));
      }
    });

    await t.test("song screen shows the chart statistics", async () => {
      app.navigate("song", { songId: demo.id, song: loaded });
      await tick(400);
      assert.ok(doc.querySelectorAll(".stat").length >= 3);
    });

    await t.test("game screen mounts a playfield", async () => {
      app.navigate("game", { song: loaded, chart });
      await tick(500);
      assert.ok(doc.querySelector(".stage canvas"));
      assert.equal(doc.querySelectorAll(".hud-lane-key").length, 4);
    });

    await t.test("editor mounts stage and tools", async () => {
      app.navigate("editor", { song: loaded, chart });
      await tick(220);
      assert.ok(doc.querySelector(".editor__stage"));
      assert.ok(
        doc.querySelectorAll(".editor__bar .segmented button").length >= 4,
      );
    });

    await t.test("playing a run scores and can pause", async () => {
      app.navigate("game", { song: loaded, chart, practice: true });
      await tick(600);
      await tick(5200);
      const score = Number(
        (doc.querySelector(".hud-score strong")?.textContent ?? "0").replace(
          /\D+/gu,
          "",
        ),
      );
      assert.ok(score > 0, "score should increase");
      assert.equal(doc.querySelector(".hud-combo").hidden, false);

      doc.querySelector('[aria-label="Paused"]')?.click();
      await tick(220);
      const overlay = [...doc.querySelectorAll(".countdown")].find(
        (node) => !node.hidden,
      );
      assert.match(overlay?.textContent ?? "", /Paused/u);
    });

    await t.test(
      "a full run lands on the results screen and is saved",
      async () => {
        const { getSettings, getHistory } = await module("src/store.js");
        const shortChart = {
          ...chart,
          duration: 4,
          notes: chart.notes.slice(0, 6),
        };
        const before = getHistory().length;
        ui.window.localStorage.clear();
        app.navigate("game", { song: loaded, chart: shortChart });
        // 3 s count-in + 4 s chart + tail.
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (doc.querySelector(".results__rank")) break;
          await tick(300);
        }
        assert.ok(
          doc.querySelector(".results__rank"),
          "should reach the results screen",
        );
        assert.ok(doc.querySelector(".results__score"), "score is shown");
        assert.equal(getSettings().language, "en", "settings persist");
        assert.ok(getHistory().length >= 1, "the run is stored in the history");
        void before;
      },
    );

    await t.test("results screen renders the rank", async () => {
      app.navigate("result", {
        song: loaded,
        chart,
        summary: {
          score: 812345,
          accuracy: 0.9321,
          maxCombo: 88,
          counts: { perfect: 120, great: 30, good: 8, bad: 2, miss: 1 },
          judged: 161,
          rank: "B",
          fullCombo: false,
          allPerfect: false,
        },
        practice: false,
        improved: true,
      });
      await tick();
      assert.equal(doc.querySelector(".results__rank")?.textContent, "B");
      assert.ok(
        [...doc.querySelectorAll("button")].some((button) =>
          button.textContent.includes("Play again"),
        ),
      );
    });

    await t.test(
      "a YouTube link still opens when the proxy is offline",
      async () => {
        // window.fetch in the harness is stubbed to succeed, so force the failure.
        ui.window.fetch = async () => {
          throw new TypeError("fetch failed");
        };
        const { youtubeSong } = await module("src/songs.js");
        const song = await youtubeSong("dQw4w9WgXcQ", { proxyUrl: "" });
        assert.equal(song.metaUnavailable, true, "flags the missing metadata");
        assert.equal(song.videoId, "dQw4w9WgXcQ", "still playable");
        app.navigate("song", { songId: song.id, song });
        await tick(400);
        assert.ok(
          doc.querySelector(".hint--warn"),
          "explains that the BPM must be typed in",
        );
        // The chart is still generated from a tempo grid so the song can be played.
        const grid = await getChart(song, { difficulty: "normal", lanes: 4 });
        assert.ok(grid.notes.length > 0, "grid chart exists without metadata");
        ui.window.fetch = async () => ({
          ok: true,
          status: 200,
          async json() {
            return { ok: true, items: [] };
          },
        });
      },
    );

    await t.test("search screen renders its field", async () => {
      app.navigate("search", { query: "lofi" });
      await tick(320);
      assert.ok(doc.querySelector('input[type="search"]'));
    });

    await t.test("nothing threw along the way", () => {
      assert.deepEqual(ui.errors, []);
    });
  },
);
