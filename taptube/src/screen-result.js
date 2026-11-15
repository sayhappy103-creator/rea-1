/** Result screen: rank, score, judgment breakdown, retry / edit / home. */

import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { getScores, updateSettings } from "./store.js";
import { el, formatTime } from "./util.js";

export function renderResult(
  context,
  host,
  { song, chart, summary, practice, improved },
) {
  const previous = getScores()[song.id];
  const rank = el(
    "div",
    { class: "results__rank", dataset: { rank: summary.rank } },
    summary.rank,
  );

  const stars = el("div", { class: "stars", "aria-label": `${summary.rank}` });
  for (let index = 0; index < 5; index += 1) {
    stars.append(
      el(
        "i",
        {
          class:
            index < Math.max(1, Math.round(summary.accuracy * 5)) ? "on" : "",
        },
        "★",
      ),
    );
  }

  const card = el(
    "div",
    {
      class: "card",
      style: { padding: "22px", width: "100%", maxWidth: "560px" },
    },
    el(
      "div",
      { class: "results" },
      el("h1", { style: { fontSize: "18px" } }, t("result.title")),
      el("p", { class: "hint", style: { marginBottom: "6px" } }, song.title),
      rank,
      stars,
      el(
        "div",
        { class: "results__score mono" },
        Math.round(summary.score).toLocaleString(),
      ),
      improved
        ? el("span", { class: "chip chip--on" }, t("result.newRecord"))
        : el("span"),
      el(
        "div",
        { class: "results__grid" },
        stat(t("result.accuracy"), `${(summary.accuracy * 100).toFixed(2)}%`),
        stat(t("result.maxCombo"), summary.maxCombo),
        stat(t("result.perfect"), summary.counts.perfect),
        stat(t("result.great"), summary.counts.great),
        stat(t("result.good"), summary.counts.good),
        stat(t("result.bad"), summary.counts.bad),
        stat(t("result.miss"), summary.counts.miss),
        stat(t("song.duration"), formatTime(chart.duration)),
      ),
      practice
        ? el("p", { class: "hint" }, t("result.practiceNote"))
        : el("span"),
      previous && !practice
        ? el(
            "p",
            { class: "hint mono" },
            `${t("song.best")}: ${previous.rank} · ${Math.round(previous.score).toLocaleString()}`,
          )
        : el("span"),
      el(
        "div",
        {
          class: "dialog__actions",
          style: { justifyContent: "center", marginTop: "18px" },
        },
        el(
          "button",
          { type: "button", class: "btn btn--primary", onclick: () => retry() },
          el("span", { html: ICONS.refresh }),
          t("result.retry"),
        ),
        el(
          "button",
          { type: "button", class: "btn btn--ghost", onclick: () => edit() },
          el("span", { html: ICONS.edit }),
          t("result.editChart"),
        ),
        el(
          "button",
          {
            type: "button",
            class: "btn btn--ghost",
            onclick: () => context.navigate("home"),
          },
          el("span", { html: ICONS.home }),
          t("result.home"),
        ),
      ),
    ),
  );

  host.replaceChildren(el("div", { class: "results-wrap" }, card));
  context.setChrome({ tabs: true });
  context.focusMain();

  function retry() {
    context.navigate("game", { song, chart, practice });
  }

  function edit() {
    // Playing a custom chart implies editing it; mark the chart as custom so
    // the editor saves under the same song id.
    updateSettings({ lastDifficulty: chart.difficulty });
    context.navigate("editor", { song, chart });
  }
}

function stat(label, value) {
  return el(
    "div",
    { class: "stat" },
    el("span", {}, label),
    el("strong", {}, String(value)),
  );
}
