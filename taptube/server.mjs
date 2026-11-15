#!/usr/bin/env node
/**
 * Static server + YouTube proxy for TapTube for the web.
 *
 *   node taptube/server.mjs            # http://localhost:5173
 *   PORT=8080 node taptube/server.mjs
 *
 * Routes:
 *   GET /                     the app
 *   GET /api/search?q=…       YouTube search (no API key required)
 *   GET /api/video?id=…       title/author/thumbnail/duration for one video
 *   GET /api/health           proxy status for the settings screen
 *
 * The search path resolves through the InnerTube (youtubei) endpoints YouTube's
 * own web client uses. When YOUTUBE_API_KEY is set, the Data API is preferred.
 * The server never stores queries or results; responses are cacheable for a
 * short while so repeated searches do not hammer YouTube.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? "0.0.0.0";
const API_KEY = process.env.YOUTUBE_API_KEY ?? "";
const CACHE_TTL_MS = Number(process.env.PROXY_CACHE_TTL_MS ?? 5 * 60 * 1000);
const SEARCH_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS ?? 8000);

const INNERTUBE_CLIENTS = [
  {
    name: "WEB",
    key: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    context: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20240726.00.00",
        hl: "en",
        gl: "US",
      },
    },
  },
  {
    name: "ANDROID",
    key: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.09.37",
        androidSdkVersion: 30,
        hl: "en",
        gl: "US",
      },
    },
  },
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
};

/* ------------------------------------------------------------------- helpers */

const cache = new Map();

function cached(key, producer) {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && entry.expires > now) return entry.value;
  const value = producer().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { value, expires: now + CACHE_TTL_MS });
  if (cache.size > 500) {
    for (const [oldKey, record] of cache) {
      if (record.expires < now) cache.delete(oldKey);
    }
  }
  return value;
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${options.method ?? "GET"} ${url} → ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- youtube data */

/** ISO-8601 duration → seconds (`PT1H2M3S`). */
function isoDurationToSeconds(value) {
  const match = String(value ?? "").match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return 0;
  const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

/** Pull the runs/text payload the InnerTube renderers use. */
function readText(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node.simpleText === "string") return node.simpleText;
  if (Array.isArray(node.runs))
    return node.runs.map((run) => run.text ?? "").join("");
  return "";
}

function collectVideoRenderers(node, sink = []) {
  if (node === null || typeof node !== "object") return sink;
  if (node.videoRenderer) sink.push(node.videoRenderer);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectVideoRenderers(item, sink);
    } else if (typeof value === "object") {
      collectVideoRenderers(value, sink);
    }
  }
  return sink;
}

function fromVideoRenderer(renderer) {
  const id = renderer.videoId;
  if (typeof id !== "string" || id.length !== 11) return null;
  const thumbnail =
    renderer.thumbnail?.thumbnails?.at(-1)?.url ??
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    id,
    title: readText(renderer.title) || `YouTube ${id}`,
    channel: readText(renderer.ownerText) || readText(renderer.longBylineText),
    duration: clockToSeconds(renderer.lengthText?.simpleText),
    views: Number(readText(renderer.viewCountText).replace(/\D+/g, "")) || 0,
    thumbnail,
  };
}

/** `1:02:03` / `4:21` → seconds. */
function clockToSeconds(value) {
  const parts = String(value ?? "")
    .trim()
    .split(":")
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
  if (parts.length === 0) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

async function searchWithDataApi(query) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "24");
  url.searchParams.set("q", query);
  url.searchParams.set("key", API_KEY);
  const data = await fetchJson(url);
  const ids = (data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter(Boolean);
  let durations = new Map();
  if (ids.length > 0) {
    const detail = new URL("https://www.googleapis.com/youtube/v3/videos");
    detail.searchParams.set("part", "contentDetails");
    detail.searchParams.set("id", ids.join(","));
    detail.searchParams.set("key", API_KEY);
    const details = await fetchJson(detail);
    durations = new Map(
      (details.items ?? []).map((item) => [
        item.id,
        isoDurationToSeconds(item.contentDetails?.duration),
      ]),
    );
  }
  return (data.items ?? []).map((item) => {
    const id = item.id?.videoId;
    return {
      id,
      title: item.snippet?.title ?? `YouTube ${id}`,
      channel: item.snippet?.channelTitle ?? "",
      duration: durations.get(id) ?? 0,
      views: 0,
      thumbnail:
        item.snippet?.thumbnails?.medium?.url ??
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  });
}

async function searchWithInnertube(query) {
  const body = JSON.stringify({ context: null, query, params: "EgIQAQ==" });
  let lastError = null;
  for (const client of INNERTUBE_CLIENTS) {
    try {
      const url = `https://www.youtube.com/youtubei/v1/search?key=${client.key}&prettyPrint=false`;
      const payload = JSON.parse(body);
      payload.context = client.context;
      const data = await fetchJson(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "TapTubeWeb/1.6.5 (+https://github.com/)",
          "accept-language": "en-US,en;q=0.9",
        },
        body: JSON.stringify(payload),
      });
      const items = collectVideoRenderers(data)
        .map(fromVideoRenderer)
        .filter(Boolean);
      if (items.length > 0) return items.slice(0, 24);
      lastError = new Error(`no results from ${client.name}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("innertube search failed");
}

async function lookupVideoMeta(id) {
  if (API_KEY) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("id", id);
      url.searchParams.set("key", API_KEY);
      const data = await fetchJson(url);
      const item = data.items?.[0];
      if (item) {
        return {
          id,
          title: item.snippet?.title ?? `YouTube ${id}`,
          channel: item.snippet?.channelTitle ?? "",
          duration: isoDurationToSeconds(item.contentDetails?.duration),
          thumbnail:
            item.snippet?.thumbnails?.medium?.url ??
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      }
    } catch {
      /* fall through to InnerTube */
    }
  }

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const url = `https://www.youtube.com/youtubei/v1/player?key=${client.key}&prettyPrint=false`;
      const data = await fetchJson(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "TapTubeWeb/1.6.5",
        },
        body: JSON.stringify({ context: client.context, videoId: id }),
      });
      const details = data.videoDetails;
      if (details?.title) {
        return {
          id,
          title: String(details.title).slice(0, 200),
          channel: String(details.author ?? "").slice(0, 120),
          duration: Number(details.lengthSeconds) || 0,
          thumbnail:
            details.thumbnail?.thumbnails?.at(-1)?.url ??
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
      }
    } catch {
      /* try the next client */
    }
  }

  // Last resort: oEmbed (also reachable from browsers, but keep parity here).
  const oembed = await fetchJson(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${id}`,
    )}`,
  );
  return {
    id,
    title: String(oembed.title ?? `YouTube ${id}`).slice(0, 200),
    channel: String(oembed.author_name ?? "").slice(0, 120),
    duration: 0,
    thumbnail: String(
      oembed.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    ),
  };
}

const isVideoId = (value) => /^[A-Za-z0-9_-]{11}$/.test(String(value ?? ""));

/* ------------------------------------------------------------------- routing */

async function handleSearch(query, response) {
  const trimmed = String(query ?? "").trim();
  if (trimmed === "") return json(response, 400, { error: "query required" });
  if (trimmed.length > 200)
    return json(response, 400, { error: "query too long" });

  try {
    const items = await cached(`search:${trimmed.toLowerCase()}`, () =>
      API_KEY ? searchWithDataApi(trimmed) : searchWithInnertube(trimmed),
    );
    return json(response, 200, {
      items,
      provider: API_KEY ? "data-api" : "innertube",
    });
  } catch (error) {
    console.warn(`[tapTube] search failed: ${error?.message ?? error}`);
    try {
      const items = await searchWithInnertube(trimmed);
      return json(response, 200, { items, provider: "innertube-fallback" });
    } catch (fallbackError) {
      return json(response, 502, {
        error: "search unavailable",
        detail: String(fallbackError?.message ?? fallbackError),
      });
    }
  }
}

async function handleVideo(id, response) {
  if (!isVideoId(id)) return json(response, 400, { error: "invalid video id" });
  try {
    const meta = await cached(`video:${id}`, () => lookupVideoMeta(id));
    return json(response, 200, meta);
  } catch (error) {
    return json(response, 502, {
      error: "lookup failed",
      detail: String(error?.message),
    });
  }
}

async function serveStatic(pathname, response, method) {
  const relative =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  const target = normalize(join(ROOT, relative));
  if (!target.startsWith(ROOT + sep) && target !== join(ROOT, "index.html")) {
    response.writeHead(403).end("forbidden");
    return;
  }
  let info;
  try {
    info = await stat(target);
  } catch {
    // Single-page app fallback: unknown deep links render the shell.
    if (!extname(pathname)) {
      return serveStatic("/index.html", response, method);
    }
    response
      .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      .end("not found");
    return;
  }
  if (info.isDirectory())
    return serveStatic(join(relative, "index.html"), response, method);

  const type =
    MIME_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    "content-type": type,
    "content-length": info.size,
    // Images and audio never change; code and markup must be revalidated so a
    // deploy is picked up on the next reload.
    "cache-control": /\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$/iu.test(target)
      ? "public, max-age=86400"
      : "no-cache",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(target).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );
  const { pathname } = url;
  const method = request.method ?? "GET";

  if (method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
    });
    response.end();
    return;
  }

  if (pathname === "/api/health") {
    return json(response, 200, {
      ok: true,
      provider: API_KEY ? "data-api" : "innertube",
      cacheEntries: cache.size,
      uptime: Math.round(process.uptime()),
    });
  }
  if (pathname === "/api/search")
    return handleSearch(url.searchParams.get("q"), response);
  if (pathname === "/api/video")
    return handleVideo(url.searchParams.get("id"), response);

  if (method !== "GET" && method !== "HEAD") {
    response
      .writeHead(405, { allow: "GET, HEAD, OPTIONS" })
      .end("method not allowed");
    return;
  }
  return serveStatic(pathname, response, method);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}/`;
  console.log(`TapTube for the web → ${url}`);
  console.log(
    `YouTube proxy provider: ${API_KEY ? "Data API (key set)" : "InnerTube (keyless)"}`,
  );
});
