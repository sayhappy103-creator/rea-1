/**
 * App shell: chrome (top bar + tabs), in-memory router with URL sync, the
 * global audio file picker and the boot sequence.
 *
 * Route state lives in memory (songs carry AudioBuffers, which no URL can), so
 * navigation is synchronous: `navigate("game", { song, chart })`.
 */

import { getAudioContext } from "./audio.js";
import { ICONS, mountIcons } from "./icons.js";
import { describeError, getLanguage, setLanguage, t } from "./i18n.js";
import { deepLinkFromLocation, syncLocation } from "./router.js";
import { renderEditor } from "./screen-editor.js";
import { renderGame } from "./screen-game.js";
import { renderHome } from "./screen-home.js";
import { renderLibrary } from "./screen-library.js";
import { renderResult } from "./screen-result.js";
import { renderSearch } from "./screen-search.js";
import { renderSettings } from "./screen-settings.js";
import { renderSong } from "./screen-song.js";
import {
  demoPlaceholderSong,
  localSong,
  songFromHistoryEntry,
  youtubeSong,
} from "./songs.js";
import {
  getLocalFiles,
  getSettings,
  getStoredLanguage,
  storeLanguage,
  updateSettings,
} from "./store.js";
import { toast } from "./toast.js";
import { el } from "./util.js";

const TABS = [
  { id: "home", label: () => t("nav.play"), icon: "home" },
  { id: "library", label: () => t("nav.library"), icon: "library" },
  { id: "settings", label: () => t("nav.settings"), icon: "settings" },
];

const SCREENS = {
  home: renderHome,
  search: renderSearch,
  song: renderSong,
  game: renderGame,
  result: renderResult,
  library: renderLibrary,
  editor: renderEditor,
  settings: renderSettings,
};

const AUDIO_EXTENSIONS =
  /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|mp4|webm)$/i;

const screenHost = document.getElementById("screen");
const topbar = document.getElementById("topbar");
const tabbar = document.getElementById("tabbar");
const bootNode = document.getElementById("boot");
const bootHint = document.getElementById("boot-hint");
const liveRegion = document.getElementById("sr-live");
const appNode = document.getElementById("app");

let current = { name: "home", params: {}, instance: null };
let chrome = { tabs: true };
let pendingFileTarget = null;

const fileInput = el("input", {
  type: "file",
  accept: "audio/*,.mp3,.m4a,.wav,.ogg,.flac,.opus,.webm",
  hidden: true,
});
document.body.append(fileInput);

/* ------------------------------------------------------------------ chrome */

function paintChrome() {
  const brand = el(
    "a",
    {
      class: "brand",
      href: "#",
      onclick: (event) => {
        event.preventDefault();
        navigate("home");
      },
    },
    el("img", { src: "./assets/icon.svg", alt: "", width: "30", height: "30" }),
    el("span", {}, "TapTube", el("small", {}, t("app.tagline"))),
  );

  const actions = el(
    "div",
    { class: "topbar__actions" },
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--ghost",
        "aria-label": t("home.search"),
        onclick: () => navigate("search", {}),
      },
      el("span", { html: ICONS.search }),
    ),
    el(
      "button",
      {
        type: "button",
        class: "btn btn--sm btn--teal",
        onclick: () => openFilePicker(),
      },
      el("span", { html: ICONS.upload }),
      el("span", { class: "topbar__label" }, t("home.quick.local")),
    ),
  );

  topbar.replaceChildren(
    brand,
    el("div", { class: "topbar__spacer" }),
    actions,
  );
  mountIcons(topbar);

  tabbar.hidden = !chrome.tabs;
  if (!chrome.tabs) {
    tabbar.replaceChildren();
    return;
  }
  tabbar.replaceChildren(
    ...TABS.map((tab) =>
      el(
        "button",
        {
          type: "button",
          class: "tab",
          "aria-current": current.name === tab.id ? "page" : "false",
          onclick: () => navigate(tab.id),
        },
        el("span", { html: ICONS[tab.icon] }),
        el("span", {}, tab.label()),
      ),
    ),
  );
}

/* ------------------------------------------------------------------ router */

const context = {
  navigate,
  rerender: () => renderScreen(current.name, current.params),
  openSearch,
  openSong,
  startSong,
  openFilePicker,
  openEditor,
  notify: (message, type) => toast(message, { type }),
  setChrome,
  focusMain: () => screenHost.focus({ preventScroll: true }),
  get keyHints() {
    return current.instance?.keyHints ?? ["D", "F", "J", "K"];
  },
};

/**
 * @param {string} name screen id
 * @param {object} [params] screen state
 * @param {{replace?: boolean}} [options] replace = keep the history/URL entry
 */
function navigate(name, params = {}, options = {}) {
  if (!SCREENS[name]) {
    console.warn(`[tapTube] unknown screen: ${name}`);
    return;
  }
  current.instance?.destroy?.();
  current = { name, params, instance: null };
  renderScreen(name, params);
  if (!options.replace) syncLocation(name, params);
  if (name !== "game") {
    try {
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch {
      /* jsdom and older WebViews may not implement scrolling */
    }
  }
  context.focusMain();
}

function renderScreen(name, params) {
  chrome =
    name === "game" || name === "editor" ? { tabs: false } : { tabs: true };
  paintChrome();
  screenHost.replaceChildren();
  const instance = SCREENS[name](context, screenHost, params);
  current.instance = instance ?? null;
  mountIcons(screenHost);
  liveRegion.textContent = "";
}

function setChrome(next) {
  chrome = { ...chrome, ...next };
  paintChrome();
}

/* ------------------------------------------------------------- file picker */

/**
 * Ask for an audio file. Without a target the file opens as a new song; with a
 * library target (`{ songId }`) the picked file reloads that previously
 * imported chart, because browsers cannot keep File handles between sessions.
 */
function openFilePicker(target = null) {
  pendingFileTarget = target;
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  const target = pendingFileTarget;
  pendingFileTarget = null;
  if (!file) return;
  if (!AUDIO_EXTENSIONS.test(file.name) && !file.type.startsWith("audio/")) {
    toast(t("error.decode"), "error");
    return;
  }
  const loading = showLoading(t("song.analysing"), t("song.analyzingHint"));
  try {
    const audioContext = getAudioContext();
    await audioContext.resume().catch(() => {});
    const song = await localSong(file, audioContext);
    loading.close();
    if (target?.songId) {
      const known = getLocalFiles().find((entry) => entry.id === target.songId);
      navigate("song", { songId: song.id, song, preferredTitle: known?.title });
    } else {
      navigate("song", { songId: song.id, song });
    }
  } catch (error) {
    loading.close();
    console.error("[tapTube] file import failed", error);
    toast(describeError(error), "error");
  }
});

function showLoading(title, hint) {
  const node = el(
    "div",
    { class: "overlay" },
    el(
      "div",
      { class: "dialog", style: { textAlign: "center" } },
      el("h2", {}, title),
      el("p", { class: "hint", style: { marginTop: "8px" } }, hint),
      el(
        "div",
        {
          style: {
            display: "flex",
            gap: "6px",
            justifyContent: "center",
            marginTop: "18px",
          },
        },
        ...Array.from({ length: 4 }, (_, index) =>
          el("span", {
            style: {
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "linear-gradient(135deg,#8c6bff,#23e0c8)",
              animation: `count-pop 0.9s ${index * 0.12}s infinite alternate`,
            },
          }),
        ),
      ),
    ),
  );
  document.getElementById("overlay-root").append(node);
  return { close: () => node.remove() };
}

/* --------------------------------------------------------- navigation verbs */

function openSearch(query = "", options = {}) {
  navigate("search", { query });
  if (options.focus)
    setTimeout(() => screenHost.querySelector("input")?.focus(), 40);
}

async function openSong(songId) {
  const settings = getSettings();
  if (String(songId).startsWith("yt:")) {
    const videoId = String(songId).slice(3);
    const stub = {
      id: songId,
      kind: "youtube",
      videoId,
      title: `YouTube ${videoId}`,
      channel: "",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
    };
    navigate("song", { songId, song: stub });
    const song = await youtubeSong(videoId, {
      proxyUrl: settings.proxyUrl,
      apiKey: settings.apiKey,
    });
    if (current.name === "song" && current.params.songId === songId) {
      navigate("song", { songId, song }, { replace: true });
    }
    if (song.metaUnavailable) {
      // The video can still be embedded; only the title/length are unknown.
      toast(t("song.metaOffline"), "error");
    }
    return;
  }
  navigate("song", {
    songId,
    song: songFromHistoryEntry({ songId, title: songId }),
  });
}

async function startSong(song) {
  if (song.kind === "local" && !song.audio) {
    toast(t("library.filesEmpty"), "error");
    openFilePicker({ songId: song.id });
    return;
  }
  navigate("song", { songId: song.id, song });
}

function openEditor(payload = {}) {
  navigate("editor", payload);
}

/* -------------------------------------------------------------- deep links */

async function applyDeepLink() {
  const link = deepLinkFromLocation();
  if (!link) {
    navigate("home");
    return;
  }
  if (link.screen === "song" && link.videoId) {
    await openSong(`yt:${link.videoId}`);
    return;
  }
  if (link.screen === "search") {
    openSearch(link.query);
    return;
  }
  navigate(link.screen);
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  const settings = getSettings();
  const language = getStoredLanguage() ?? settings.language ?? getLanguage();
  setLanguage(language);
  storeLanguage(language);
  updateSettings({ language });
  document.documentElement.lang = language;

  // The bundled server exposes the YouTube proxy on the same origin. Naming it
  // explicitly keeps `fetch` relative, so the app also works behind a preview
  // host or a reverse proxy.
  if (!settings.proxyUrl && globalThis.location.protocol.startsWith("http")) {
    updateSettings({ proxyUrl: globalThis.location.origin });
  }

  paintChrome();
  await applyDeepLink();

  bootHint.textContent = t("boot.ready");
  bootNode.hidden = true;
  appNode.hidden = false;
  mountIcons(document);
}

globalThis.addEventListener("popstate", () => {
  void applyDeepLink();
});

globalThis.addEventListener("error", (event) => {
  console.error("[tapTube]", event.error ?? event.message);
});
globalThis.addEventListener("unhandledrejection", (event) => {
  console.error("[tapTube] unhandled", event.reason);
  toast(describeError(event.reason), { type: "error" });
});

demoPlaceholderSong();

void boot().catch((error) => {
  console.error("[tapTube] boot failed", error);
  bootHint.textContent = describeError(error);
});

export { navigate, openSearch, openSong, startSong, openEditor, context };
