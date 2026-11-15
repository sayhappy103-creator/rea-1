/**
 * Chart editor: place, move and erase notes on a lane grid synced to the song
 * position, then save the chart locally or export it as JSON.
 */

import { AudioPlayer, getAudioContext } from "./audio.js";
import {
  chartStats,
  generateGridChart,
  normaliseChart,
  parseChart,
  serialiseChart,
} from "./chart.js";
import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { createRenderer } from "./renderer.js";
import { putChart } from "./songs.js";
import { saveCustomChart } from "./store.js";
import { toast, openDialog } from "./toast.js";
import { clamp, el, formatTime } from "./util.js";

const SNAP_OPTIONS = [
  { id: "1/4", beats: 1 },
  { id: "1/8", beats: 0.5 },
  { id: "1/16", beats: 0.25 },
];
/** Labels are resolved inside the screen so they follow the live language. */
const TOOLS = [
  { id: "tap", icon: "note", labelKey: "editor.tool.add" },
  { id: "hold", icon: "timer", labelKey: "editor.tool.hold" },
  { id: "slide", icon: "bolt", labelKey: "editor.tool.slide" },
  { id: "erase", icon: "close", labelKey: "editor.tool.erase" },
];

let context0 = null;

export function renderEditor(context, host, { song, chart: incoming } = {}) {
  context0 = context;
  let chart = incoming
    ? normaliseChart({ ...incoming })
    : normaliseChart(
        generateGridChart({
          songId: song?.id ?? "custom",
          difficulty: "normal",
          lanes: 4,
          bpm: song?.bpm ?? 120,
          duration: song?.duration ?? 120,
        }),
      );
  chart = {
    ...chart,
    source: "custom",
    title: song?.title ?? chart.title ?? chart.songId,
  };

  let tool = "tap";
  let snap = SNAP_OPTIONS[1];
  let playhead = 0;
  let playing = false;
  let player = null;

  const canvas = el("canvas", { "aria-label": "Chart editor grid" });
  const trackCanvas = el("canvas", { "aria-label": "Chart overview" });
  const timeLabel = el("span", { class: "mono" }, "0:00");
  const countLabel = el("span", { class: "chip" }, `${chart.notes.length}`);

  const renderer = createRenderer(canvas);
  const trackRenderer = createRenderer(trackCanvas);

  const stage = el("div", { class: "editor__stage" }, canvas);
  const track = el("div", { class: "editor__track" }, trackCanvas);

  const toolRow = el("div", { class: "segmented", role: "group" });
  for (const item of TOOLS) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(item.id === tool),
        onclick: () => {
          tool = item.id;
          for (const sibling of toolRow.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
        },
      },
      t(item.labelKey),
    );
    toolRow.append(button);
  }

  const snapRow = el("div", { class: "segmented" });
  for (const option of SNAP_OPTIONS) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(option.id === snap.id),
        onclick: () => {
          snap = option;
          for (const sibling of snapRow.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
        },
      },
      option.id,
    );
    snapRow.append(button);
  }

  const playButton = el("button", {
    type: "button",
    class: "btn btn--icon btn--teal",
    "aria-label": t("common.play"),
    html: ICONS.play,
    onclick: () => togglePlay(),
  });

  const saveButton = el(
    "button",
    {
      type: "button",
      class: "btn btn--primary btn--sm",
      onclick: () => save(),
    },
    el("span", { html: ICONS.check }),
    t("editor.save"),
  );

  const controls = el(
    "div",
    { class: "editor__bar" },
    toolRow,
    el("span", { class: "field__label" }, t("editor.snap")),
    snapRow,
    playButton,
    timeLabel,
    countLabel,
    el("span", { style: { flex: 1 } }),
    saveButton,
  );

  const extra = el(
    "div",
    { class: "editor__bar" },
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--ghost",
        onclick: () => autofill(),
      },
      el("span", { html: ICONS.sparkle }),
      t("editor.autofill"),
    ),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--ghost",
        onclick: () => exportJson(),
      },
      el("span", { html: ICONS.download }),
      t("editor.export"),
    ),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--ghost",
        onclick: () => importJson(),
      },
      el("span", { html: ICONS.upload }),
      t("editor.import"),
    ),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--ghost",
        onclick: () => testPlay(),
      },
      el("span", { html: ICONS.play }),
      t("editor.test"),
    ),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--danger",
        onclick: async () => {
          const ok = await openDialog({
            title: t("editor.clear"),
            body: t("settings.resetConfirm"),
            actions: [
              { id: "cancel", label: t("common.cancel") },
              { id: "ok", label: t("common.confirm"), variant: "danger" },
            ],
          });
          if (ok !== "ok") return;
          chart = { ...chart, notes: [] };
          refresh();
        },
      },
      t("editor.clear"),
    ),
  );

  host.replaceChildren(
    el(
      "div",
      { class: "editor" },
      el(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          },
        },
        el("button", {
          type: "button",
          class: "btn btn--icon btn--ghost",
          html: ICONS.back,
          "aria-label": t("song.back"),
          onclick: () =>
            context0?.navigate?.("song", { songId: song?.id, song }),
        }),
        el(
          "h1",
          { style: { fontSize: "18px", flex: 1 } },
          `${t("editor.title")} — ${chart.title}`,
        ),
      ),
      stage,
      track,
      controls,
      el("p", { class: "editor-note" }, t("editor.help")),
      extra,
    ),
  );
  context.setChrome({ tabs: false });

  if (song?.audio) {
    player = new AudioPlayer(getAudioContext(), { volume: 0.9 });
    player.setBuffer(song.audio.buffer);
  }

  refresh();
  const resizeObserver = new ResizeObserver(() => {
    renderer.resize();
    trackRenderer.resize();
    refresh();
  });
  resizeObserver.observe(stage);
  resizeObserver.observe(track);

  let frameHandle = 0;
  function loop() {
    if (playing && player) {
      playhead = player.position;
      if (playhead >= chart.duration) togglePlay(false);
    }
    draw();
    frameHandle = requestAnimationFrame(loop);
  }
  frameHandle = requestAnimationFrame(loop);

  function draw() {
    renderer.drawEditor({
      time: playhead,
      notes: chart.notes,
      lanes: chart.lanes,
    });
    drawTrack();
    timeLabel.textContent = `${formatTime(playhead)} / ${formatTime(chart.duration)}`;
  }

  function drawTrack() {
    const context2d = trackCanvas.getContext("2d");
    const width = trackCanvas.clientWidth || 400;
    const height = trackCanvas.clientHeight || 40;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    if (trackCanvas.width !== Math.round(width * ratio)) {
      trackCanvas.width = Math.round(width * ratio);
      trackCanvas.height = Math.round(height * ratio);
    }
    context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    context2d.clearRect(0, 0, width, height);
    const laneColors = [
      "#ffffff",
      "#8ff7e4",
      "#ffd166",
      "#ff8fc7",
      "#9fb4ff",
      "#c3ff8f",
    ];
    for (const note of chart.notes) {
      const x = (note.time / Math.max(0.001, chart.duration)) * width;
      const y = 6 + (note.lane / chart.lanes) * (height - 12);
      context2d.fillStyle = laneColors[note.lane % laneColors.length];
      context2d.globalAlpha = 0.85;
      context2d.fillRect(x, y, 2, 4);
    }
    context2d.globalAlpha = 1;
    const headX = (playhead / Math.max(0.001, chart.duration)) * width;
    context2d.strokeStyle = "#7c5cff";
    context2d.lineWidth = 2;
    context2d.beginPath();
    context2d.moveTo(headX, 0);
    context2d.lineTo(headX, height);
    context2d.stroke();
  }

  function refresh() {
    countLabel.textContent = `${chartStats(chart).noteCount}`;
    draw();
  }

  function snapTime(seconds) {
    const beat = 60 / chart.bpm;
    const step = beat * snap.beats;
    return Math.round(seconds / step) * step;
  }

  /* ------------------------------------------------------------ interaction */

  function laneFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const geometry = renderer.layout(chart.lanes);
    const localX =
      ((event.clientX - rect.left) / rect.width) * renderer.size.width;
    return clamp(
      Math.floor((localX - geometry.padX) / geometry.laneWidth),
      0,
      chart.lanes - 1,
    );
  }

  function timeFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const geometry = renderer.layout(chart.lanes);
    const localY =
      ((event.clientY - rect.top) / rect.height) * renderer.size.height;
    const windowSeconds = renderer.travelSeconds(3);
    const offsetSeconds =
      ((localY - geometry.judgeY) / (geometry.judgeY - geometry.topY)) *
      windowSeconds;
    return snapTime(clamp(playhead - offsetSeconds, 0, chart.duration));
  }

  let dragStart = null;

  canvas.addEventListener("pointerdown", (event) => {
    const lane = laneFromEvent(event);
    const time = timeFromEvent(event);
    if (tool === "erase") {
      eraseAt(time, lane);
      return;
    }
    dragStart = { lane, time, pointerId: event.pointerId };
    canvas.setPointerCapture?.(event.pointerId);
    if (tool === "hold" || tool === "slide") return;
    addNote(time, lane, "tap");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragStart || (tool !== "hold" && tool !== "slide")) return;
    const lane = laneFromEvent(event);
    const time = timeFromEvent(event);
    if (Math.abs(time - dragStart.time) < 0.08 && lane === dragStart.lane)
      return;
    const existing = chart.notes.find(
      (note) =>
        note.lane === dragStart.lane &&
        Math.abs(note.time - dragStart.time) < 0.02,
    );
    if (!existing) return;
    if (tool === "hold") {
      existing.kind = "hold";
      existing.endTime = Math.max(existing.time + 0.1, time);
    } else {
      existing.kind = "slide";
      existing.endLane = lane;
      existing.endTime = Math.max(existing.time + 0.1, time);
    }
    refresh();
  });

  const endDrag = () => {
    dragStart = null;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  function addNote(time, lane, kind) {
    const snapped = snapTime(time);
    if (
      chart.notes.some(
        (note) => note.lane === lane && Math.abs(note.time - snapped) < 0.01,
      )
    )
      return;
    chart.notes.push({ time: snapped, lane, kind, intensity: 0.7 });
    chart.notes.sort((left, right) => left.time - right.time);
    refresh();
  }

  function eraseAt(time, lane) {
    const index = chart.notes.findIndex(
      (note) => note.lane === lane && Math.abs(note.time - time) < 0.25,
    );
    if (index < 0) return;
    chart.notes.splice(index, 1);
    refresh();
  }

  track.addEventListener("click", (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    playhead = ratio * chart.duration;
    if (player) player.seek(playhead);
    draw();
  });

  function togglePlay(force) {
    playing = force ?? !playing;
    if (!player) {
      playing = false;
      toast(t("error.audio"), "error");
      return;
    }
    if (playing) void player.play(playhead);
    else player.pause();
    playButton.innerHTML = playing ? ICONS.pause : ICONS.play;
  }

  function autofill() {
    const generated = generateGridChart({
      songId: chart.songId,
      difficulty: chart.difficulty,
      lanes: chart.lanes,
      bpm: chart.bpm,
      duration: chart.duration,
    });
    chart.notes = generated.notes;
    refresh();
  }

  function save() {
    const saved = normaliseChart({
      ...chart,
      source: "custom",
      updatedAt: Date.now(),
    });
    saveCustomChart(chart.songId, {
      ...saved,
      title: chart.title,
      thumbnail: chart.thumbnail,
    });
    putChart(chart.songId, saved);
    chart = saved;
    toast(t("editor.saved"), "success");
  }

  function exportJson() {
    const blob = new Blob([serialiseChart(chart)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = el("a", {
      href: url,
      download: `taptube-${chart.songId.replace(/\W+/g, "-")}.json`,
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importJson() {
    const input = el("input", {
      type: "file",
      accept: "application/json,.json",
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          chart = {
            ...parseChart(await file.text()),
            songId: chart.songId,
            title: chart.title,
          };
          refresh();
          toast(t("common.copied"), "success");
        } catch {
          toast(t("error.invalidChart"), "error");
        }
      },
    });
    input.click();
  }

  function testPlay() {
    if (chart.notes.length === 0) {
      toast(t("error.noNotes"), "error");
      return;
    }
    context.navigate("game", {
      song,
      chart: normaliseChart(chart),
      practice: true,
    });
  }

  function onKey(event) {
    if (event.code === "Space") {
      event.preventDefault();
      togglePlay();
    }
    if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }
  window.addEventListener("keydown", onKey);

  return {
    destroy: () => {
      cancelAnimationFrame(frameHandle);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKey);
      player?.dispose();
      context.setChrome({ tabs: true });
    },
    get chart() {
      return chart;
    },
  };
}
