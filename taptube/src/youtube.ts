import { CURATED_SONGS } from "./constants";
import { SearchCategory, VideoQualityMode, YtItem } from "./types";

/** Extract 11-character YouTube Video ID from any URL or bare ID */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        (parts[0] === "shorts" ||
          parts[0] === "embed" ||
          parts[0] === "live" ||
          parts[0] === "v") &&
        parts[1] &&
        /^[A-Za-z0-9_-]{11}$/.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    // fallback regex
  }
  const match = trimmed.match(
    /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/** Parse ISO-8601 YouTube duration (e.g., PT3M45S) into seconds */
export function parseIso8601Duration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 210;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const sec = parseInt(m[3] || "0", 10);
  const total = h * 3600 + min * 60 + sec;
  return total > 0 ? total : 210;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export async function lookupYoutubeById(
  videoId: string,
  apiKey = ""
): Promise<YtItem> {
  if (apiKey.trim()) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(
          videoId
        )}&key=${encodeURIComponent(apiKey.trim())}`
      );
      if (resp.ok) {
        const json = await resp.json();
        const item = json.items?.[0];
        if (item) {
          return {
            videoId,
            title: item.snippet?.title || `YouTube (${videoId})`,
            channelTitle: item.snippet?.channelTitle || "YouTube",
            durationSec: parseIso8601Duration(
              item.contentDetails?.duration || "PT3M30S"
            ),
            thumbnail:
              item.snippet?.thumbnails?.high?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            viewCount: Number(item.statistics?.viewCount || 0),
          };
        }
      }
    } catch {
      // fall through
    }
  }

  // Android Native Bridge oEmbed lookup
  if (window.TapTubeNative?.fetchOEmbed) {
    try {
      const raw = window.TapTubeNative.fetchOEmbed(videoId);
      const parsed = JSON.parse(raw);
      if (parsed && parsed.title) {
        return {
          videoId,
          title: parsed.title,
          channelTitle: parsed.author_name || "YouTube",
          durationSec: Number(parsed.durationSec || 210),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
      }
    } catch {
      // fall through
    }
  }

  // Browser CORS oEmbed lookup (`youtube.com/oembed` allows CORS `*`)
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (resp.ok) {
      const data = await resp.json();
      return {
        videoId,
        title: data.title || `YouTube (${videoId})`,
        channelTitle: data.author_name || "YouTube",
        durationSec: 210,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  } catch {
    // fall through
  }

  return {
    videoId,
    title: `YouTube Video (${videoId})`,
    channelTitle: "YouTube",
    durationSec: 210,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 4800
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Multi-source Live YouTube Search:
 * 1) Direct YouTube URL / Video ID paste (instant!)
 * 2) Native Android `TapTubeNative.searchYouTube` (InnerTube zero-key + optional YouTube Data API v3!)
 * 3) Official YouTube Data API v3 (when optional key is supplied in Settings)
 * 4) Public CORS YouTube Search APIs (Piped / Invidious) for zero-key Web Browser preview
 * 5) Curated catalog fallback match
 */
export async function searchYouTubeSongs(
  query: string,
  category: SearchCategory,
  regionCode: string,
  apiKey: string
): Promise<YtItem[]> {
  const q = query.trim();
  if (!q) return [];

  // 1. Direct URL or 11-char ID
  const directId = extractYoutubeId(q);
  if (directId) {
    const single = await lookupYoutubeById(directId, apiKey);
    return [single];
  }

  // 2. Native Android APK Bridge (works 100% key-free via InnerTube on Android!)
  if (window.TapTubeNative?.searchYouTube) {
    try {
      const raw = window.TapTubeNative.searchYouTube(
        q,
        category,
        regionCode || "TH",
        apiKey || ""
      );
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed.items as YtItem[];
      }
    } catch {
      // fall through to web routes
    }
  }

  // 3. Official YouTube Data API v3 (if user provided an API key)
  if (apiKey.trim()) {
    try {
      const catParam = category === "music" ? "&videoCategoryId=10" : "";
      const sUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=20&regionCode=${encodeURIComponent(
        regionCode || "TH"
      )}${catParam}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(
        apiKey.trim()
      )}`;
      const sResp = await fetchWithTimeout(sUrl, 6000);
      if (sResp.ok) {
        const sJson = await sResp.json();
        const ids: string[] = (sJson.items || [])
          .map((it: any) => it.id?.videoId)
          .filter(Boolean);
        if (ids.length > 0) {
          const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.join(
            ","
          )}&key=${encodeURIComponent(apiKey.trim())}`;
          const vResp = await fetchWithTimeout(vUrl, 6000);
          if (vResp.ok) {
            const vJson = await vResp.json();
            return (vJson.items || []).map((v: any) => ({
              videoId: v.id,
              title: v.snippet?.title || "Untitled",
              channelTitle: v.snippet?.channelTitle || "YouTube",
              durationSec: parseIso8601Duration(
                v.contentDetails?.duration || "PT3M30S"
              ),
              thumbnail:
                v.snippet?.thumbnails?.high?.url ||
                `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
              viewCount: Number(v.statistics?.viewCount || 0),
              publishedAt: v.snippet?.publishedAt,
            }));
          }
        }
      }
    } catch {
      // fall through
    }
  }

  // 4. Zero-Key Browser Search via public Piped / Invidious CORS APIs
  const searchTerm = category === "music" ? `${q} music` : q;
  const pipedEndpoints = [
    `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(
      searchTerm
    )}&filter=${category === "music" ? "music_songs" : "videos"}`,
    `https://pipedapi.tokhmi.xyz/search?q=${encodeURIComponent(
      searchTerm
    )}&filter=videos`,
    `https://api.piped.private.coffee/search?q=${encodeURIComponent(
      searchTerm
    )}&filter=videos`,
  ];

  for (const ep of pipedEndpoints) {
    try {
      const resp = await fetchWithTimeout(ep, 4200);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items: any[] = data.items || [];
      const mapped: YtItem[] = [];
      for (const it of items) {
        const vid = extractYoutubeId(it.url || "");
        if (!vid || (it.duration && it.duration < 25)) continue;
        mapped.push({
          videoId: vid,
          title: it.title || "YouTube Track",
          channelTitle: it.uploaderName || "YouTube",
          durationSec: Number(it.duration) > 0 ? Number(it.duration) : 210,
          thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          viewCount: Number(it.views || 0),
          publishedAt: it.uploadedDate || undefined,
        });
        if (mapped.length >= 24) break;
      }
      if (mapped.length > 0) return mapped;
    } catch {
      // try next mirror
    }
  }

  const invidiousEndpoints = [
    `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(
      searchTerm
    )}&type=video`,
    `https://invidious.nerdvpn.de/api/v1/search?q=${encodeURIComponent(
      searchTerm
    )}&type=video`,
  ];
  for (const ep of invidiousEndpoints) {
    try {
      const resp = await fetchWithTimeout(ep, 4200);
      if (!resp.ok) continue;
      const items = await resp.json();
      if (!Array.isArray(items)) continue;
      const mapped: YtItem[] = items
        .filter((it: any) => it.videoId && (it.lengthSeconds ?? 180) >= 25)
        .slice(0, 24)
        .map((it: any) => ({
          videoId: it.videoId,
          title: it.title || "YouTube Track",
          channelTitle: it.author || "YouTube",
          durationSec: Number(it.lengthSeconds || 210),
          thumbnail: `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
          viewCount: Number(it.viewCount || 0),
          publishedAt: it.publishedText,
        }));
      if (mapped.length > 0) return mapped;
    } catch {
      // try next
    }
  }

  // 5. Local curated keyword fallback
  const lower = q.toLowerCase();
  return CURATED_SONGS.filter(
    (s) =>
      s.title.toLowerCase().includes(lower) ||
      s.channelTitle.toLowerCase().includes(lower) ||
      (s.genre ?? "").toLowerCase().includes(lower)
  );
}

let ytApiPromise: Promise<any> | null = null;

export function loadYouTubeIframeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("YouTube IFrame API load timeout"));
    }, 9000);

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      prev?.();
      resolve(window.YT);
    };

    const existing = document.querySelector(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => {
        clearTimeout(timeout);
        ytApiPromise = null;
        reject(new Error("Failed to load YouTube IFrame API"));
      };
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

export function mapQualityToYouTube(q: VideoQualityMode): string {
  if (q === "high") return "hd720";
  if (q === "middle") return "medium";
  if (q === "low") return "small";
  return "default";
}
