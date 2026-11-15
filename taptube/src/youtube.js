/**
 * YouTube identifiers: link parsing (no network) and the search/thumbnail
 * helpers that talk to the bundled proxy.
 */

import { TapTubeError } from "./errors.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export function isYouTubeId(value) {
  return ID_PATTERN.test(String(value ?? "").trim());
}

/**
 * Extract an 11-character video id from almost any YouTube link or a bare id.
 * @returns {string|null}
 */
export function parseYouTubeId(input) {
  const text = String(input ?? "").trim();
  if (text === "") return null;
  if (ID_PATTERN.test(text)) return text;

  let url;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  if (host.endsWith("youtu.be")) {
    const [id] = url.pathname.split("/").filter(Boolean);
    return isYouTubeId(id) ? id : null;
  }

  const queryId = url.searchParams.get("v");
  if (isYouTubeId(queryId)) return queryId;

  const segments = url.pathname.split("/").filter(Boolean);
  const marker = segments.findIndex((segment) =>
    ["embed", "shorts", "live", "v", "e"].includes(segment),
  );
  if (marker >= 0) {
    const candidate = segments[marker + 1];
    if (isYouTubeId(candidate)) return candidate;
  }
  return segments.length === 1 && isYouTubeId(segments[0]) ? segments[0] : null;
}

/** Canonical watch URL for an id. */
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

export const thumbnailUrl = (id, quality = "hqdefault") =>
  `https://i.ytimg.com/vi/${id}/${quality}.jpg`;

export const embedUrl = (id, { start = 0, autoplay = 1 } = {}) => {
  const params = new URLSearchParams({
    autoplay: String(autoplay),
    start: String(Math.max(0, Math.floor(start))),
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
};

export const oEmbedUrl = (id) =>
  `https://www.youtube-nocookie.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`;

/** Search endpoint for a self-hosted instance (see server.mjs). */
export const searchEndpoint = (base, query) =>
  `${String(base).replace(/\/+$/, "")}/api/search?q=${encodeURIComponent(query)}`;

/**
 * Read a "text" payload as returned by YouTube (string, `{simpleText}` or
 * `{runs:[{text}]}`) — search results from the InnerTube API use all three.
 */
export function readText(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs))
    return node.runs.map((run) => run.text ?? "").join("");
  return "";
}

/**
 * Normalise one search result coming from a proxy, the InnerTube API or the
 * Data API. Unknown shapes are dropped rather than rendered half-empty.
 */
export function normaliseVideo(item) {
  if (typeof item !== "object" || item === null) return null;
  const rawId =
    item.videoId ??
    item.id?.videoId ??
    item.id ??
    item.video_id ??
    item.url ??
    "";
  const id = isYouTubeId(rawId) ? rawId : parseYouTubeId(rawId);
  if (id === null) return null;

  const title =
    readText(item.title) || readText(item.snippet?.title) || `YouTube ${id}`;
  const thumbnail =
    item.thumbnail?.thumbnails?.at(-1)?.url ??
    item.thumbnail ??
    item.thumbnails?.[0]?.url ??
    item.snippet?.thumbnails?.medium?.url ??
    thumbnailUrl(id);
  return {
    id,
    title: String(title).slice(0, 200),
    channel: String(
      readText(item.ownerText) ||
        readText(item.longBylineText) ||
        readText(item.channel) ||
        readText(item.uploaderName) ||
        readText(item.author) ||
        readText(item.snippet?.channelTitle) ||
        "",
    ).slice(0, 120),
    duration: normaliseDuration(item),
    views:
      Number(
        item.views ??
          item.viewCount ??
          readText(item.viewCountText).replace(/\D+/gu, ""),
      ) || 0,
    thumbnail: typeof thumbnail === "string" ? thumbnail : thumbnailUrl(id),
  };
}

function normaliseDuration(item) {
  const candidates = [
    item.duration,
    item.lengthSeconds,
    item.snippet?.duration,
    item.lengthText,
    item.lengthText?.simpleText,
  ];
  for (const candidate of candidates) {
    const seconds = parseDuration(candidate);
    if (seconds > 0) return seconds;
  }
  return 0;
}

/** Accepts seconds (number or "123"), "12:34" or ISO-8601 "PT12M34S". */
export function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, Math.round(value));
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    const [, hours = 0, minutes = 0, seconds = 0] = iso;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const clock = text.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    const [, first, second, third] = clock;
    return third === undefined
      ? Number(first) * 60 + Number(second)
      : Number(first) * 3600 + Number(second) * 60 + Number(third);
  }
  return 0;
}

/**
 * Fetch a video's title/author/thumbnail through the app proxy.
 * @returns {Promise<{id:string,title:string,channel:string,thumbnail:string,duration:number}>}
 */
export async function fetchVideoMeta(
  id,
  { proxyUrl, fetchImpl = fetch, signal } = {},
) {
  const local = await fetchLocalMeta(id, { proxyUrl, fetchImpl, signal });
  if (local) return local;

  // Direct oEmbed only works when the page allows cross-origin requests; it is
  // a best-effort fallback for deployments without the bundled proxy.
  try {
    const response = await fetchImpl(oEmbedUrl(id), { signal, mode: "cors" });
    if (response.ok) {
      const data = await response.json();
      return {
        id,
        title: String(data.title ?? `YouTube ${id}`).slice(0, 200),
        channel: String(data.author_name ?? "").slice(0, 120),
        thumbnail: String(data.thumbnail_url ?? thumbnailUrl(id)),
        duration: 0,
      };
    }
  } catch {
    /* fall through to the placeholder */
  }

  throw new TapTubeError("error.network", {
    detail: `metadata failed for ${id}`,
  });
}

async function fetchLocalMeta(id, { proxyUrl, fetchImpl, signal }) {
  if (typeof proxyUrl !== "string" || proxyUrl.trim() === "") return null;
  const url = `${proxyUrl.replace(/\/+$/, "")}/api/video?id=${encodeURIComponent(id)}`;
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.error) return null;
    return {
      id,
      title: String(data.title ?? `YouTube ${id}`).slice(0, 200),
      channel: String(data.channel ?? "").slice(0, 120),
      thumbnail: String(data.thumbnail ?? thumbnailUrl(id)),
      duration: Number(data.duration) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Search YouTube through the proxy.
 * @returns {Promise<Array<ReturnType<typeof normaliseVideo>>>}
 */
export async function searchYouTube(
  query,
  { proxyUrl, apiKey, fetchImpl = fetch, signal } = {},
) {
  const trimmed = String(query ?? "").trim();
  if (trimmed === "") return [];

  if (typeof proxyUrl === "string" && proxyUrl.trim() !== "") {
    try {
      const response = await fetchImpl(searchEndpoint(proxyUrl, trimmed), {
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        return items.map(normaliseVideo).filter(Boolean);
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      /* try the API key path next */
    }
  }

  if (typeof apiKey === "string" && apiKey.trim() !== "") {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("type", "video");
    endpoint.searchParams.set("maxResults", "24");
    endpoint.searchParams.set("q", trimmed);
    endpoint.searchParams.set("key", apiKey.trim());
    try {
      const response = await fetchImpl(endpoint, { signal });
      if (response.ok) {
        const data = await response.json();
        return (data.items ?? []).map(normaliseVideo).filter(Boolean);
      }
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }

  throw new TapTubeError("error.network", { detail: "search unavailable" });
}

/** Curated list shown on the home screen (works without any network call). */
export const CURATED = [
  { id: "jfKfPfyJRdk", title: "lofi hip hop radio", channel: "Lofi Girl" },
  {
    id: "5qap5aO4i9A",
    title: "lofi hip hop radio — beats to relax",
    channel: "Lofi Girl",
  },
  {
    id: "DWcJFNfaw9c",
    title: "Beautiful Piano Music",
    channel: "Soothing Relaxation",
  },
  { id: "4xDzrJKXOOY", title: "synthwave radio", channel: "Lofi Girl" },
  { id: "n61ULEU7CO0", title: "Best of Chill Mix", channel: "Chill Nation" },
  { id: "36YnV9STBqc", title: "Ambient Study Music", channel: "Quiet Quest" },
  { id: "kJQP7kiw5Fk", title: "Despacito", channel: "Luis Fonsi" },
  { id: "9bZkp7q19f0", title: "GANGNAM STYLE", channel: "officialpsy" },
];
