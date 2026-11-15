/** Search screen: YouTube results through the proxy + local file shortcuts. */

import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { getSettings } from "./store.js";
import {
  emptyState,
  sectionHead,
  skeletonCards,
  songRow,
  viewsLabel,
} from "./ui.js";
import { el, formatTime } from "./util.js";
import { parseYouTubeId, searchYouTube } from "./youtube.js";

export function renderSearch(context, host, { query = "" } = {}) {
  const { openSong, openFilePicker, navigate, startSong } = context;

  host.replaceChildren();
  host.append(sectionHead(t("search.title")));

  const input = el("input", {
    class: "input",
    type: "search",
    value: query,
    placeholder: t("home.searchPlaceholder"),
    "aria-label": t("home.search"),
    enterkeyhint: "search",
  });

  const results = el("div", { class: "rowlist", style: { marginTop: "14px" } });
  const form = el(
    "form",
    {
      style: { display: "flex", gap: "8px" },
      onsubmit: (event) => {
        event.preventDefault();
        void run(input.value.trim());
      },
    },
    input,
    el(
      "button",
      { type: "submit", class: "btn btn--primary" },
      el("span", { html: ICONS.search }),
    ),
  );

  const localShortcut = el(
    "div",
    { class: "panel", style: { marginTop: "16px" } },
    el("h2", {}, el("span", { html: ICONS.folder }), t("home.quick.local")),
    el("p", { class: "panel__sub" }, t("home.quick.localSub")),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--teal",
        onclick: () => openFilePicker(),
      },
      el("span", { html: ICONS.upload }),
      t("home.quick.local"),
    ),
  );

  host.append(form, results, localShortcut);

  let controller = null;

  async function run(value) {
    controller?.abort();
    controller = new AbortController();
    const settings = getSettings();
    if (value === "") {
      results.replaceChildren(
        emptyState({
          icon: "search",
          title: t("search.none"),
          body: t("search.noneHint"),
        }),
      );
      return;
    }

    const directId = parseYouTubeId(value);
    if (directId) {
      openSong(`yt:${directId}`);
      return;
    }

    results.replaceChildren(skeletonCards(3));
    try {
      const items = await searchYouTube(value, {
        proxyUrl: settings.proxyUrl,
        apiKey: settings.apiKey,
        signal: controller.signal,
      });
      if (items.length === 0) {
        results.replaceChildren(
          emptyState({
            icon: "search",
            title: t("search.none"),
            body: t("search.noneHint"),
          }),
        );
        return;
      }
      const list = el("div", { class: "rowlist" });
      for (const item of items) {
        list.append(
          songRow(
            {
              id: `yt:${item.id}`,
              kind: "youtube",
              videoId: item.id,
              title: item.title,
              channel: item.channel,
              thumbnail: item.thumbnail,
              duration: item.duration,
            },
            {
              onPlay: (song) => startSong(song),
              meta: [
                item.channel,
                item.duration ? formatTime(item.duration) : null,
                viewsLabel(item.views),
              ]
                .filter(Boolean)
                .join(" · "),
              trailing: el("button", {
                type: "button",
                class: "btn btn--icon btn--sm btn--ghost",
                "aria-label": t("song.edit"),
                html: ICONS.chart,
                onclick: () => openSong(`yt:${item.id}`),
              }),
            },
          ),
        );
      }
      results.replaceChildren(sectionHead(t("search.youtube")), list);
    } catch (error) {
      if (error?.name === "AbortError") return;
      results.replaceChildren(
        emptyState({
          icon: "wifi",
          title: t("search.offlineTitle"),
          body: t("search.offlineBody"),
        }),
        el(
          "div",
          {
            style: {
              display: "flex",
              gap: "8px",
              marginTop: "12px",
              flexWrap: "wrap",
            },
          },
          el(
            "button",
            {
              type: "button",
              class: "btn btn--ghost",
              onclick: () => navigate("settings"),
            },
            t("settings.network"),
          ),
          el(
            "button",
            {
              type: "button",
              class: "btn btn--primary",
              onclick: () => run(value),
            },
            t("common.retry"),
          ),
        ),
      );
    }
  }

  if (query) void run(query);
  else input.focus();
}
