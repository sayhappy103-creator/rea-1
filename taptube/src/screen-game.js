/** In-game screen: canvas playfield, HUD, YouTube layer, pause and results. */

import { AudioPlayer, createHitSound, getAudioContext } from "./audio.js";
import { createGame } from "./game.js";
import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { accuracyOf } from "./judge.js";
import { getSettings, pushHistory, saveScore } from "./store.js";
import { el, formatScore, formatTime } from "./util.js";
import { embedUrl } from "./youtube.js";

export function renderGame(context, host, { song, chart, practice = false }) {
  const settings = getSettings();
  const audioContext = getAudioContext();
  const autoplay = settings.autoplay && !practice;
  let player = null;
  let game = null;
  let finished = false;
  let destroyed = false;

  const canvas = el("canvas", {
    "aria-label": "TapTube playfield",
    tabindex: "0",
  });
  const videoLayer = el("div", { class: "stage__video-wrap" });
  const judgeText = el("div", { class: "hud-judge", "aria-hidden": "true" });
  const comboValue = el("strong", {}, "0");
  const comboWrap = el(
    "div",
    { class: "hud-combo", hidden: true },
    comboValue,
    el("em", {}, t("game.combo")),
  );
  const scoreValue = el("strong", { class: "mono" }, "0");
  const accuracyValue = el("strong", { class: "mono" }, "0.00%");
  const timeLabel = el(
    "span",
    { class: "hud-time mono" },
    `0:00 / ${formatTime(chart.duration)}`,
  );
  const progressBar = el("i");
  const countdown = el("div", { class: "countdown", hidden: true });
  const laneHints = el("div", { class: "hud-lanes", "aria-hidden": "true" });

  const hud = el(
    "div",
    { class: "stage__hud" },
    el(
      "div",
      { class: "hud-top" },
      el(
        "div",
        { class: "hud-score" },
        scoreValue,
        el("span", {}, t("game.score")),
      ),
      el(
        "div",
        { class: "hud-acc" },
        accuracyValue,
        el("span", {}, t("game.accuracy")),
      ),
    ),
    comboWrap,
    judgeText,
    laneHints,
    el(
      "div",
      { class: "hud-bottom" },
      el("div", { class: "hud-progress" }, progressBar),
      timeLabel,
    ),
  );

  const stage = el(
    "div",
    { class: "stage" },
    videoLayer,
    canvas,
    hud,
    countdown,
  );

  const pauseButton = el("button", {
    type: "button",
    class: "btn btn--icon btn--ghost",
    "aria-label": t("game.paused"),
    html: ICONS.pause,
    onclick: () => togglePause(),
  });
  const backButton = el("button", {
    type: "button",
    class: "btn btn--icon btn--ghost",
    "aria-label": t("common.close"),
    html: ICONS.back,
    onclick: () => quit(),
  });

  const root = el(
    "div",
    { class: "game" },
    el(
      "div",
      { class: "game__header" },
      backButton,
      el(
        "div",
        { class: "game__title-wrap" },
        el("div", { class: "game__title" }, song.title),
        el(
          "div",
          { class: "game__sub" },
          [
            autoplay
              ? t("game.autoplay")
              : practice
                ? t("game.practice")
                : null,
            `${chart.difficulty} · ${chart.lanes} ${t("song.lanes")}`,
            `BPM ${Math.round(chart.bpm)}`,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      pauseButton,
    ),
    stage,
    el(
      "div",
      { class: "game__controls" },
      el(
        "button",
        { type: "button", class: "btn btn--sm", onclick: () => restart() },
        el("span", { html: ICONS.refresh }),
        t("game.restart"),
      ),
      el(
        "button",
        {
          type: "button",
          class: "btn btn--sm btn--ghost",
          onclick: () => quit(),
        },
        el("span", { html: ICONS.close }),
        t("game.quit"),
      ),
      el("span", { class: "hint" }, autoplay ? t("settings.autoplay") : ""),
    ),
  );

  host.replaceChildren(root);
  context.setChrome({ tabs: false });

  /* ------------------------------------------------------------------ boot */

  if (song.kind === "youtube") {
    videoLayer.append(
      el("iframe", {
        class: "stage__video",
        src: embedUrl(song.videoId, { autoplay: 1 }),
        title: song.title,
        allow: "autoplay; encrypted-media; picture-in-picture",
        referrerpolicy: "strict-origin-when-cross-origin",
      }),
    );
  } else if (song.audio) {
    player = new AudioPlayer(audioContext, {
      volume: settings.audioVolume,
      offsetMs: settings.offsetMs,
    });
    player.setBuffer(song.audio.buffer);
  }

  const hitSound = settings.hitSfx
    ? createHitSound(audioContext, audioContext.destination, settings.sfxVolume)
    : null;

  game = createGame({
    canvas,
    chart,
    settings: { ...settings, autoplay },
    practice,
    player,
    callbacks: {
      hitSound,
      onTick: ({ time, duration, state }) => {
        scoreValue.textContent = formatScore(state.score);
        accuracyValue.textContent = `${(accuracyOf(state) * 100).toFixed(2)}%`;
        timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
        progressBar.style.width = `${Math.min(100, (time / Math.max(1, duration)) * 100)}%`;
        if (state.combo > 1) {
          comboWrap.hidden = false;
          comboValue.textContent = String(state.combo);
        } else {
          comboWrap.hidden = true;
        }
      },
      onJudgeText: (judgment) => {
        const key = judgment === "hold" ? "perfect" : judgment;
        judgeText.className = `hud-judge is-on judge-${key}`;
        judgeText.textContent = t(`game.judge.${key}`);
        judgeText.style.animation = "none";
        void judgeText.offsetWidth;
        judgeText.style.animation = "";
      },
      onCountIn: (value) => {
        if (value === null) {
          countdown.hidden = true;
          countdown.replaceChildren();
          return;
        }
        countdown.hidden = false;
        countdown.replaceChildren(
          el("strong", {}, String(Math.max(1, Math.ceil(value)))),
          el("span", {}, t("game.getReady")),
        );
      },
      onFinish: (summary) => finish(summary),
      videoVisible: () => videoLayer.childElementCount > 0,
    },
  });

  const listeners = {};

  laneHints.replaceChildren(
    ...game.keyHints.map((key) => el("span", { class: "hud-lane-key" }, key)),
  );
  context.keyHints = game.keyHints;
  bindInputs();
  game.start();
  canvas.focus({ preventScroll: true });

  /* ---------------------------------------------------------------- inputs */

  function bindInputs() {
    const laneForKey = (event) => {
      const key = event.key.toLowerCase();
      const mapped = game.keyMap.findIndex((keys) => keys.includes(key));
      if (mapped >= 0) return mapped;
      if (/^[1-6]$/.test(key)) {
        const lane = Number(key) - 1;
        return lane < chart.lanes ? lane : -1;
      }
      return -1;
    };

    listeners.keydown = (event) => {
      if (event.repeat) return;
      if (
        event.key === "Escape" ||
        (event.key === " " && game?.status === "paused")
      ) {
        event.preventDefault();
        togglePause();
        return;
      }
      const lane = laneForKey(event);
      if (lane < 0) return;
      event.preventDefault();
      game.press(lane);
    };
    listeners.keyup = (event) => {
      const lane = laneForKey(event);
      if (lane < 0) return;
      game.release(lane);
    };

    const pointerLanes = new Map();
    listeners.pointerdown = (event) => {
      event.preventDefault();
      const lane = game.pointerLane(event.clientX);
      pointerLanes.set(event.pointerId, lane);
      canvas.setPointerCapture?.(event.pointerId);
      game.press(lane);
    };
    listeners.pointerup = (event) => {
      const lane = pointerLanes.get(event.pointerId);
      if (lane === undefined) return;
      pointerLanes.delete(event.pointerId);
      game.release(lane);
    };
    listeners.contextmenu = (event) => event.preventDefault();

    window.addEventListener("keydown", listeners.keydown);
    window.addEventListener("keyup", listeners.keyup);
    canvas.addEventListener("pointerdown", listeners.pointerdown);
    canvas.addEventListener("pointerup", listeners.pointerup);
    canvas.addEventListener("pointercancel", listeners.pointerup);
    canvas.addEventListener("contextmenu", listeners.contextmenu);
  }

  /* ----------------------------------------------------------------- pause */

  let overlayNode = null;

  function togglePause() {
    // Resume goes through the game object; pausing is driven here so the
    // restart/quit buttons can live in one overlay and the game stays "paused"
    // until the player commits.
    if (!game || finished) return;
    if (game.status === "paused") {
      hidePauseOverlay();
      game.resume();
      return;
    }
    game.pause();
    showPauseOverlay();
  }

  function showPauseOverlay() {
    hidePauseOverlay();
    countdown.hidden = true;
    overlayNode = el(
      "div",
      { class: "countdown", role: "dialog", "aria-label": t("game.paused") },
      el("strong", { style: { fontSize: "26px" } }, t("game.paused")),
      el(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
            marginTop: "12px",
            flexWrap: "wrap",
            justifyContent: "center",
          },
        },
        el(
          "button",
          {
            type: "button",
            class: "btn btn--primary",
            onclick: () => togglePause(),
          },
          t("game.resume"),
        ),
        el(
          "button",
          { type: "button", class: "btn btn--ghost", onclick: () => restart() },
          t("game.restart"),
        ),
        el(
          "button",
          { type: "button", class: "btn btn--ghost", onclick: () => quit() },
          t("game.quit"),
        ),
      ),
    );
    stage.append(overlayNode);
  }

  function hidePauseOverlay() {
    overlayNode?.remove();
    overlayNode = null;
  }

  function restart() {
    destroy();
    context.navigate("game", { song, chart, practice }, { replace: true });
  }

  function quit() {
    const wasFinished = finished;
    destroy();
    if (!wasFinished) {
      context.navigate("song", { songId: song.id, song }, { replace: true });
    }
  }

  function finish(summary) {
    if (finished) return;
    finished = true;
    hidePauseOverlay();
    const record = {
      score: summary.score,
      accuracy: summary.accuracy,
      maxCombo: summary.maxCombo,
      rank: summary.rank,
      difficulty: chart.difficulty,
      lanes: chart.lanes,
      playedAt: Date.now(),
    };
    let improved = false;
    if (!practice && !autoplay) {
      improved = saveScore(song.id, record).improved;
      pushHistory({
        songId: song.id,
        title: song.title,
        channel: song.channel,
        thumbnail: song.thumbnail,
        duration: chart.duration,
        score: record.score,
        accuracy: record.accuracy,
        rank: record.rank,
        difficulty: chart.difficulty,
        lanes: chart.lanes,
      });
    }
    destroy();
    context.navigate(
      "result",
      { song, chart, summary, practice: practice || autoplay, improved },
      { replace: true },
    );
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    hidePauseOverlay();
    game?.destroy();
    if (listeners.keydown)
      window.removeEventListener("keydown", listeners.keydown);
    if (listeners.keyup) window.removeEventListener("keyup", listeners.keyup);
    canvas.removeEventListener("pointerdown", listeners.pointerdown);
    canvas.removeEventListener("pointerup", listeners.pointerup);
    canvas.removeEventListener("pointercancel", listeners.pointerup);
    canvas.removeEventListener("contextmenu", listeners.contextmenu);
    player?.dispose();
    player = null;
    game = null;
  }

  return {
    destroy() {
      destroy();
      context.setChrome({ tabs: true });
    },
    get status() {
      return game?.status ?? null;
    },
  };
}
