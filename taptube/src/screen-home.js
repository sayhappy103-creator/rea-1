/** Home screen: hero search, quick actions, curated list, recent plays. */

import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { curatedSongs, demoPlaceholderSong } from "./songs.js";
import { getHistory, getScores } from "./store.js";
import { songCard, sectionHead } from "./ui.js";
import { el } from "./util.js";

/**
 * @param {object} context router context
 * @param {HTMLElement} host
 */
export function renderHome(context, host) {
  const { openSearch, openFilePicker, openEditor, startSong } = context;

  const input = el("input", {
    class: "input",
    type: "search",
    id: "home-search",
    placeholder: t("home.searchPlaceholder"),
    autocomplete: "off",
    enterkeyhint: "search",
    "aria-label": t("home.search"),
  });

  const form = el(
    "form",
    {
      class: "hero__form",
      onsubmit: (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (value === "") return;
        openSearch(value);
      },
    },
    input,
    el(
      "button",
      { type: "submit", class: "btn btn--primary" },
      el("span", { html: ICONS.search }),
      t("home.search"),
    ),
  );

  const quick = (icon, title, subtitle, action) =>
    el(
      "button",
      { type: "button", class: "quick", onclick: action },
      el("span", { class: "quick__icon", html: ICONS[icon] }),
      el("strong", {}, title),
      el("span", {}, subtitle),
    );

  const hero = el(
    "section",
    { class: "hero" },
    el(
      "span",
      { class: "hero__eyebrow" },
      el("span", { html: ICONS.sparkle }),
      t("home.eyebrow"),
    ),
    el(
      "h1",
      {},
      t("home.title"),
      el("br"),
      el("em", {}, t("home.titleAccent")),
    ),
    el("p", {}, t("home.subtitle")),
    form,
    el(
      "div",
      { class: "hero__meta" },
      el(
        "span",
        { class: "chip" },
        el("span", { html: ICONS.bolt }),
        "Auto-note",
      ),
      el(
        "span",
        { class: "chip" },
        el("span", { html: ICONS.gamepad }),
        "4 / 5 / 6 " + t("song.lanes"),
      ),
      el(
        "span",
        { class: "chip" },
        el("span", { html: ICONS.keyboard }),
        "D F J K",
      ),
    ),
  );
  hero
    .querySelectorAll(".hero__meta svg, .hero__eyebrow svg")
    .forEach((svg) => {
      svg.style.width = "14px";
      svg.style.height = "14px";
    });

  const quickRow = el(
    "div",
    { class: "quick-row" },
    quick("youtube", t("home.quick.youtube"), t("home.quick.youtubeSub"), () =>
      openSearch("", { focus: true }),
    ),
    quick("folder", t("home.quick.local"), t("home.quick.localSub"), () =>
      openFilePicker(),
    ),
    quick("music", t("home.quick.demo"), t("home.quick.demoSub"), () =>
      startSong(demoPlaceholderSong()),
    ),
    quick("edit", t("home.quick.editor"), t("home.quick.editorSub"), () =>
      openEditor(),
    ),
  );

  const scores = getScores();
  const curated = curatedSongs();
  const curatedGrid = el("div", { class: "song-grid" });
  for (const song of curated) {
    curatedGrid.append(
      songCard(song, {
        onPlay: (picked) => startSong(picked),
        rank: scores[song.id]?.rank,
      }),
    );
  }

  const history = getHistory().slice(0, 6);
  const recentGrid = el("div", { class: "song-grid" });
  for (const entry of history) {
    recentGrid.append(
      songCard(
        {
          id: entry.songId,
          kind: entry.songId.startsWith("yt:")
            ? "youtube"
            : entry.songId.startsWith("demo")
              ? "demo"
              : "local",
          videoId: entry.songId.startsWith("yt:")
            ? entry.songId.slice(3)
            : undefined,
          title: entry.title,
          channel: entry.channel,
          thumbnail: entry.thumbnail,
          duration: entry.duration,
        },
        {
          onPlay: (picked) => startSong(picked),
          rank: entry.rank,
          duration: entry.duration,
        },
      ),
    );
  }

  const tip = el(
    "div",
    { class: "panel", style: { marginTop: "18px" } },
    el("h2", {}, el("span", { html: ICONS.keyboard }), t("home.tip.title")),
    el("p", { class: "panel__sub" }, t("home.tip.body")),
    el(
      "div",
      { class: "keycaps" },
      ...["D", "F", "J", "K"].map((key) =>
        el("span", { class: "keycap" }, key),
      ),
      el(
        "span",
        { class: "hint", style: { alignSelf: "center" } },
        "· 1 2 3 4 5 6",
      ),
    ),
  );

  host.replaceChildren(
    hero,
    quickRow,
    sectionHead(t("home.recommended"), t("home.recommendedSub")),
    curatedGrid,
    history.length > 0
      ? el(
          "div",
          {},
          sectionHead(t("home.recent"), t("home.recentSub")),
          recentGrid,
        )
      : el("div"),
    tip,
  );
}
