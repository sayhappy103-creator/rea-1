/**
 * URL sync for shareable links. Screens stay in-memory objects; only the bits
 * that make sense to share (a video id, a search phrase) reach the address bar.
 */

import { parseYouTubeId } from "./youtube.js";

/** @returns {{screen:string, videoId?:string, query?:string}|null} */
export function deepLinkFromLocation(location = globalThis.location) {
  if (!location) return null;
  const params = new URLSearchParams(location.search);
  const hash = String(location.hash ?? "").replace(/^#\/?/u, "");
  const hashParams = new URLSearchParams(hash);

  const rawVideo = params.get("v") ?? hashParams.get("v");
  if (rawVideo) {
    const videoId = parseYouTubeId(rawVideo);
    if (videoId) return { screen: "song", videoId };
  }

  const query = params.get("q") ?? hashParams.get("q");
  if (query && query.trim() !== "")
    return { screen: "search", query: query.trim() };

  if (hash === "settings") return { screen: "settings" };
  if (hash === "library") return { screen: "library" };
  return null;
}

export function syncLocation(screen, params = {}) {
  if (!globalThis.history?.replaceState) return;
  const url = new URL(globalThis.location.href);
  url.search = "";
  url.hash = "";

  if (screen === "song" && params.song?.videoId) {
    url.searchParams.set("v", params.song.videoId);
  } else if (screen === "search" && params.query) {
    url.searchParams.set("q", params.query);
  } else if (["settings", "library"].includes(screen)) {
    url.hash = `#/${screen}`;
  }

  const next = `${url.pathname}${url.search}${url.hash}`;
  globalThis.history.replaceState({ screen }, "", next);
}

export const shareableUrl = (videoId) => {
  const url = new URL(globalThis.location.href);
  url.search = `?v=${videoId}`;
  url.hash = "";
  return url.toString();
};
