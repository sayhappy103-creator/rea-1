/** Library: play history, custom charts, imported local files. */

import { ICONS } from "./icons.js";
import { t } from "./i18n.js";
import { parseChart } from "./chart.js";
import {
  deleteCustomChart,
  forgetLocalFile,
  getCustomCharts,
  getHistory,
  getLocalFiles,
  resetScoresAndHistory,
  saveCustomChart,
} from "./store.js";
import { emptyState, songRow } from "./ui.js";
import { el, formatTime } from "./util.js";
import { confirmDialog, toast } from "./toast.js";
import { songFromHistoryEntry } from "./songs.js";

const TAB_KEYS = [
  { id: "history", labelKey: "library.tab.history" },
  { id: "charts", labelKey: "library.tab.charts" },
  { id: "files", labelKey: "library.tab.files" },
];

export function renderLibrary(context, host, { tab = "history" } = {}) {
  const content = el("div", { style: { marginTop: "16px" } });

  const tabRow = el("div", { class: "segmented", role: "tablist" });
  for (const item of TAB_KEYS) {
    const button = el(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-pressed": String(item.id === tab),
        onclick: () => {
          tab = item.id;
          for (const sibling of tabRow.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
          paint();
        },
      },
      t(item.labelKey),
    );
    tabRow.append(button);
  }

  host.replaceChildren(
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
      el("h1", { style: { fontSize: "22px", flex: 1 } }, t("library.title")),
      importButton(),
      el(
        "button",
        {
          type: "button",
          class: "btn btn--sm btn--ghost",
          onclick: () => exportAll(),
        },
        el("span", { html: ICONS.download }),
        t("library.exportAll"),
      ),
    ),
    tabRow,
    content,
  );

  function paint() {
    if (tab === "history") return paintHistory();
    if (tab === "charts") return paintCharts();
    return paintFiles();
  }

  function paintHistory() {
    const history = getHistory();
    if (history.length === 0) {
      content.replaceChildren(
        emptyState({
          icon: "clock",
          title: t("library.historyEmpty"),
          body: t("home.recentSub"),
        }),
      );
      return;
    }
    const list = el("div", { class: "rowlist" });
    for (const entry of history) {
      const song = songFromHistoryEntry(entry);
      list.append(
        songRow(song, {
          onPlay: (picked) => context.startSong(picked),
          rank: entry.rank,
          meta: [
            entry.channel,
            entry.difficulty,
            `${Math.round(entry.score).toLocaleString()}`,
            new Date(entry.playedAt).toLocaleDateString(),
          ]
            .filter(Boolean)
            .join(" · "),
        }),
      );
    }
    content.replaceChildren(
      list,
      el(
        "button",
        {
          type: "button",
          class: "btn btn--sm btn--ghost",
          style: { marginTop: "14px" },
          onclick: async () => {
            const ok = await confirmDialog({
              title: t("library.clearHistory"),
              message: t("settings.resetConfirm"),
              confirmLabel: t("common.confirm"),
              cancelLabel: t("common.cancel"),
            });
            if (!ok) return;
            resetScoresAndHistory();
            paint();
            toast(t("settings.resetScores"), "success");
          },
        },
        el("span", { html: ICONS.trash }),
        t("library.clearHistory"),
      ),
    );
  }

  function paintCharts() {
    const charts = Object.values(getCustomCharts());
    if (charts.length === 0) {
      content.replaceChildren(
        emptyState({
          icon: "edit",
          title: t("library.chartsEmpty"),
          body: t("editor.help"),
        }),
      );
      return;
    }
    const list = el("div", { class: "rowlist" });
    for (const chart of charts) {
      const song = {
        id: chart.songId,
        kind: chart.songId.startsWith("yt:") ? "youtube" : "local",
        videoId: chart.songId.startsWith("yt:")
          ? chart.songId.slice(3)
          : undefined,
        title: chart.title ?? chart.songId,
        channel: `${chart.notes.length} ${t("song.notes")}`,
        thumbnail: chart.thumbnail ?? "",
        duration: chart.duration,
      };
      list.append(
        songRow(song, {
          onPlay: () => openChart(chart, song),
          onDelete: () => {
            deleteCustomChart(chart.songId);
            paint();
            toast(t("common.delete"), "success");
          },
          meta: `${chart.difficulty} · ${chart.lanes} ${t("song.lanes")} · ${formatTime(chart.duration)}`,
        }),
      );
    }
    content.replaceChildren(list);
  }

  function paintFiles() {
    const files = getLocalFiles();
    if (files.length === 0) {
      content.replaceChildren(
        emptyState({
          icon: "folder",
          title: t("library.filesEmpty"),
          body: t("home.quick.localSub"),
        }),
      );
      return;
    }
    const list = el("div", { class: "rowlist" });
    for (const file of files) {
      const song = {
        id: file.id,
        kind: "local",
        title: file.title,
        channel: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        thumbnail: "",
        duration: file.duration,
      };
      list.append(
        songRow(song, {
          onPlay: () => context.openFilePicker({ songId: file.id }),
          onDelete: () => {
            forgetLocalFile(file.id);
            paint();
          },
          meta: `${file.fileName} · ${formatTime(file.duration)}`,
        }),
      );
    }
    content.replaceChildren(
      list,
      el(
        "p",
        { class: "hint", style: { marginTop: "12px" } },
        t("library.filesEmpty"),
      ),
    );
  }

  function openChart(chart, song) {
    context.navigate("game", { song, chart });
  }

  function exportAll() {
    const payload = {
      app: "taptube-web",
      exportedAt: new Date().toISOString(),
      charts: Object.values(getCustomCharts()),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: "taptube-charts.json" });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importButton() {
    const input = el("input", {
      type: "file",
      accept: "application/json,.json",
      hidden: true,
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const chart = parseChart(await file.text());
          chart.title = chart.title ?? file.name;
          saveCustomChart(chart.songId, chart);
          toast(t("editor.saved"), "success");
          paint();
        } catch {
          toast(t("error.invalidChart"), "error");
        }
        event.target.value = "";
      },
    });
    const button = el(
      "button",
      { type: "button", class: "btn btn--sm", onclick: () => input.click() },
      el("span", { html: ICONS.upload }),
      t("library.import"),
    );
    return el("span", {}, input, button);
  }

  paint();
  return { destroy: () => {} };
}
