/**
 * Song detail: pick difficulty / lanes / notes options, watch the chart being
 * built, then play, edit or regenerate it.
 */

import { ICONS, mountIcons } from "./icons.js";
import { t } from "./i18n.js";
import { DIFFICULTIES, chartStats } from "./chart.js";
import { getChart, isYouTubeSong } from "./songs.js";
import { DEMO_SONG_ID } from "./demo.js";
import { getScores, getSettings, updateSettings } from "./store.js";
import { artworkFor, statTile } from "./ui.js";
import { clamp, el, formatTime } from "./util.js";
import { KEY_HINTS } from "./game.js";

const DIFFICULTY_KEY = {
  easy: { th: "ง่าย", en: "Easy" },
  normal: { th: "ปกติ", en: "Normal" },
  hard: { th: "ยาก", en: "Hard" },
  extreme: { th: "โหด", en: "Extreme" },
};

let context0 = null;

export function renderSong(context, host, { song, language = "th" }) {
  context0 = context;
  const settings = getSettings();
  const score = getScores()[song.id];
  let difficulty = settings.lastDifficulty ?? "normal";
  let lanes = settings.lanes;
  let bpm = song.bpm ?? 0;
  let chart = null;
  let busy = false;
  let disposed = false;

  const state = {
    longNotes: settings.longNotes,
    slideNotes: settings.slideNotes,
  };

  const art = el("div", { class: "song-detail__art" });
  art.append(artworkFor(song));

  const isDemo = song.id === DEMO_SONG_ID;
  const meta = el(
    "div",
    { class: "song-detail__meta" },
    // The stub title ("YouTube <id>") is replaced once metadata arrives, so a
    // placeholder name is never shown as the song's name.
    el(
      "h2",
      { class: "eyebrow" },
      isDemo ? t("song.demoTrack") : t("song.youtubeVideo"),
    ),
    el("h1", {}, song.title),
    el(
      "p",
      { class: "hint" },
      [song.channel, song.duration ? formatTime(song.duration) : null]
        .filter(Boolean)
        .join(" · ") || "TapTube",
    ),
    score
      ? el(
          "div",
          { class: "song-detail__best" },
          el(
            "span",
            { class: "chip chip--on" },
            `${t("song.best")}: ${score.rank}`,
          ),
          el(
            "span",
            { class: "hint mono" },
            `${Math.round(score.score).toLocaleString()} · ${(score.accuracy * 100).toFixed(1)}%`,
          ),
        )
      : el("div"),
  );

  if (song.metaUnavailable) {
    meta.append(el("p", { class: "hint hint--warn" }, t("song.metaOffline")));
  }

  const statusLine = el(
    "p",
    { class: "hint", role: "status" },
    t("song.chartMissing"),
  );
  const statsRow = el("div", { class: "results__grid" });

  const difficultyPicker = segmented(
    DIFFICULTIES.map((id) => ({
      id,
      label: DIFFICULTY_KEY[id][language] ?? id,
    })),
    difficulty,
    (value) => {
      difficulty = value;
      updateSettings({ lastDifficulty: value });
      void refresh(true);
    },
  );

  const lanePicker = segmented(
    [4, 5, 6].map((count) => ({ id: String(count), label: `${count}` })),
    String(lanes),
    (value) => {
      lanes = Number(value);
      updateSettings({ lanes });
      void refresh(true);
    },
  );

  const speedSlider = el("input", {
    type: "range",
    min: "1",
    max: "8",
    step: "0.25",
    value: String(settings.speed),
    "aria-label": t("song.speed"),
    oninput: (event) => {
      const value = clamp(Number(event.target.value), 1, 8);
      speedLabel.textContent = `${value}×`;
      updateSettings({ speed: value });
    },
  });
  const speedLabel = el("strong", { class: "mono" }, `${settings.speed}×`);

  const toggles = el(
    "div",
    { class: "song-options" },
    toggleRow(t("song.longNotes"), state.longNotes, (value) => {
      state.longNotes = value;
      updateSettings({ longNotes: value });
      void refresh(true);
    }),
    toggleRow(t("song.slideNotes"), state.slideNotes, (value) => {
      state.slideNotes = value;
      updateSettings({ slideNotes: value });
      void refresh(true);
    }),
  );

  const bpmRow = el("div", { class: "field" });
  if (isYouTubeSong(song) || bpm > 0) {
    const bpmInput = el("input", {
      class: "input mono",
      type: "number",
      min: "40",
      max: "240",
      step: "0.5",
      value: String(Math.round(bpm || 120)),
      onchange: (event) => {
        bpm = clamp(Number(event.target.value) || 120, 40, 240);
        event.target.value = String(bpm);
        void refresh(true);
      },
    });
    bpmRow.append(
      el("span", { class: "field__label" }, t("song.bpm")),
      bpmInput,
    );
    if (isYouTubeSong(song)) {
      bpmRow.append(
        el(
          "p",
          { class: "hint", style: { marginTop: "6px" } },
          t("song.youtubeNote"),
        ),
        tapTempoButton((value) => {
          bpm = value;
          bpmInput.value = String(Math.round(value));
          void refresh(true);
        }),
      );
    }
  }

  const playButton = el(
    "button",
    {
      type: "button",
      class: "btn btn--primary btn--block",
      onclick: () => play(false),
    },
    el("span", { html: ICONS.play }),
    t("song.play"),
  );
  const practiceButton = el(
    "button",
    { type: "button", class: "btn btn--block", onclick: () => play(true) },
    el("span", { html: ICONS.headphone }),
    t("song.practice"),
  );
  const editButton = el(
    "button",
    {
      type: "button",
      class: "btn btn--ghost btn--block",
      onclick: () => edit(),
    },
    el("span", { html: ICONS.edit }),
    t("song.edit"),
  );
  const regenButton = el(
    "button",
    {
      type: "button",
      class: "btn btn--ghost btn--sm",
      onclick: () => refresh(false, true),
    },
    el("span", { html: ICONS.refresh }),
    t("song.regenerate"),
  );

  const actions = el(
    "div",
    { class: "song-detail__actions" },
    playButton,
    practiceButton,
    el(
      "div",
      { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      editButton,
      regenButton,
    ),
  );

  const keyHint = el(
    "div",
    { class: "keycaps" },
    ...KEY_HINTS[lanes].map((key) => el("span", { class: "keycap" }, key)),
  );

  const layout = el(
    "div",
    { class: "song-detail" },
    el("div", { class: "song-detail__top" }, art, meta),
    el(
      "div",
      { class: "panel" },
      el("h2", {}, el("span", { html: ICONS.chart }), t("song.chartHeader")),
      statusLine,
      statsRow,
      el(
        "div",
        { class: "option" },
        el("span", { class: "field__label" }, t("song.difficulty")),
        difficultyPicker,
      ),
      el(
        "div",
        { class: "option" },
        el("span", { class: "field__label" }, t("song.lanes")),
        lanePicker,
      ),
      el(
        "div",
        { class: "range" },
        el(
          "div",
          { class: "range__head" },
          el("span", {}, t("song.speed")),
          speedLabel,
        ),
        speedSlider,
      ),
      toggles,
      bpmRow,
      el(
        "div",
        { class: "option" },
        el("span", { class: "field__label" }, t("home.tip.title")),
        keyHint,
      ),
    ),
    actions,
  );

  host.replaceChildren(
    el("div", { class: "section-head" }, backButton()),
    layout,
  );

  async function refresh(force = false, regenerate = false) {
    if (busy || disposed) return;
    busy = true;
    playButton.disabled = true;
    practiceButton.disabled = true;
    statusLine.textContent = isYouTubeSong(song)
      ? t("song.generating")
      : t("song.analysing");
    if (!isYouTubeSong(song))
      statusLine.textContent += ` — ${t("song.analyzingHint")}`;
    try {
      chart = await getChart(
        song,
        {
          difficulty,
          lanes,
          bpm: bpm || undefined,
          longNotes: state.longNotes,
          slideNotes: state.slideNotes,
        },
        { regenerate: regenerate || force },
      );
      const stats = chartStats(chart);
      statsRow.replaceChildren(
        statTile(t("song.notes"), stats.noteCount),
        statTile(t("song.bpm"), Math.round(chart.bpm)),
        statTile(t("song.duration"), formatTime(chart.duration)),
        statTile(t("song.lanes"), chart.lanes),
      );
      statusLine.textContent = `${t("song.chartReady")} · ${DIFFICULTY_KEY[difficulty]?.[language] ?? difficulty}`;
      if (chart.notes.length === 0) statusLine.textContent = t("error.noNotes");
      playButton.disabled = chart.notes.length === 0;
      practiceButton.disabled = chart.notes.length === 0;
      editButton.disabled = chart.notes.length === 0;
      if (chart.detectedBpm) bpm = chart.detectedBpm;
    } catch (error) {
      statusLine.textContent = t(error?.code ?? "common.error");
      context.notify(error?.code ? t(error.code) : t("common.error"), "error");
    } finally {
      busy = false;
    }
    if (disposed) return;
  }

  function play(practice) {
    if (!chart) return;
    context.navigate("game", {
      song,
      chart,
      practice,
      title: song.title,
    });
  }

  function edit() {
    if (!chart) return;
    context.navigate("editor", { song, chart });
  }

  mountIcons(host);
  void refresh();
  return {
    destroy: () => {
      disposed = true;
    },
  };
}

function backButton() {
  return el(
    "button",
    {
      type: "button",
      class: "btn btn--sm btn--ghost",
      onclick: () => context0?.navigate?.("home"),
    },
    el("span", { html: ICONS.back }),
    t("song.back"),
  );
}

function segmented(items, current, onSelect) {
  const wrap = el("div", { class: "segmented", role: "group" });
  for (const item of items) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(item.id === current),
        onclick: () => {
          for (const sibling of wrap.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
          onSelect(item.id);
        },
      },
      item.label,
    );
    wrap.append(button);
  }
  return wrap;
}

function toggleRow(label, checked, onChange) {
  const button = el("button", {
    type: "button",
    class: "switch",
    role: "switch",
    "aria-checked": String(checked),
    "aria-label": label,
    onclick: () => {
      const next = button.getAttribute("aria-checked") !== "true";
      button.setAttribute("aria-checked", String(next));
      onChange(next);
    },
  });
  return el(
    "div",
    { class: "option" },
    el("span", { class: "option__text" }, el("strong", {}, label)),
    button,
  );
}

function tapTempoButton(onBpm) {
  const taps = [];
  const label = el("span", { class: "hint" }, t("song.tapTempoHint"));
  const button = el(
    "button",
    {
      type: "button",
      class: "btn btn--sm btn--teal",
      style: { marginTop: "8px", marginBottom: "8px" },
      onclick: () => {
        const now = performance.now();
        if (taps.length > 0 && now - taps.at(-1) > 2500) taps.length = 0;
        taps.push(now);
        if (taps.length > 8) taps.shift();
        if (taps.length >= 3) {
          const intervals = taps
            .slice(1)
            .map((time, index) => time - taps[index]);
          const average =
            intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
          const value = clamp(
            Math.round((60_000 / average) * 10) / 10,
            40,
            240,
          );
          label.textContent = `${t("song.bpm")} ≈ ${value}`;
          onBpm(value);
        }
      },
    },
    el("span", { html: ICONS.timer }),
    t("song.tapTempo"),
  );
  return el("div", {}, button, label);
}
