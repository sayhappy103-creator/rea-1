import assert from "node:assert/strict";
import { test } from "node:test";

import {
  embedUrl,
  isYouTubeId,
  normaliseVideo,
  parseDuration,
  parseYouTubeId,
  searchYouTube,
  watchUrl,
} from "../src/youtube.js";

test("parseYouTubeId accepts every common link shape", () => {
  const cases = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    [
      "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42",
      "dQw4w9WgXcQ",
    ],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    [
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM",
      "dQw4w9WgXcQ",
    ],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(parseYouTubeId(input), expected, input);
  }
});

test("parseYouTubeId rejects hosts and ids that are not YouTube", () => {
  assert.equal(parseYouTubeId(""), null);
  assert.equal(parseYouTubeId("hello world"), null);
  assert.equal(parseYouTubeId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseYouTubeId("https://www.youtube.com/watch?v=short"), null);
  assert.equal(parseYouTubeId(null), null);
  assert.equal(isYouTubeId("dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeId("dQw4w9WgXc"), false);
});

test("urls carry the player options", () => {
  assert.equal(
    watchUrl("dQw4w9WgXcQ"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  const url = new URL(embedUrl("dQw4w9WgXcQ", { start: 12.6 }));
  assert.equal(url.pathname, "/embed/dQw4w9WgXcQ");
  assert.equal(url.searchParams.get("start"), "12");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("playsinline"), "1");
});

test("normaliseVideo copes with proxy and Data API shapes", () => {
  const fromProxy = normaliseVideo({
    id: "dQw4w9WgXcQ",
    title: "Song",
    channel: "Artist",
    duration: "3:33",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  });
  assert.deepEqual(
    {
      id: fromProxy.id,
      title: fromProxy.title,
      channel: fromProxy.channel,
      duration: fromProxy.duration,
    },
    { id: "dQw4w9WgXcQ", title: "Song", channel: "Artist", duration: 213 },
  );

  const fromDataApi = normaliseVideo({
    id: { videoId: "dQw4w9WgXcQ" },
    snippet: {
      title: "API title",
      channelTitle: "API channel",
      thumbnails: { medium: { url: "https://example.test/t.jpg" } },
      duration: "PT3M33S",
    },
  });
  assert.equal(fromDataApi.title, "API title");
  assert.equal(fromDataApi.duration, 213);
  assert.equal(fromDataApi.thumbnail, "https://example.test/t.jpg");

  // Links are accepted too, and broken entries are dropped.
  assert.equal(
    normaliseVideo({ url: "https://youtu.be/dQw4w9WgXcQ" }).id,
    "dQw4w9WgXcQ",
  );
  assert.equal(normaliseVideo({ title: "no id" }), null);
  assert.equal(normaliseVideo(null), null);
});

test("parseDuration understands clocks and ISO durations", () => {
  assert.equal(parseDuration("3:33"), 213);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("PT3M33S"), 213);
  assert.equal(parseDuration("PT1H2M3S"), 3723);
  assert.equal(parseDuration(95), 95);
  assert.equal(parseDuration("95"), 95);
  assert.equal(parseDuration("nonsense"), 0);
  assert.equal(parseDuration(undefined), 0);
});

const jsonResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  async json() {
    return body;
  },
});

test("searchYouTube uses the proxy and falls back to the API key", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/api/search")) {
      return jsonResponse({ items: [{ id: "dQw4w9WgXcQ", title: "Proxied" }] });
    }
    return jsonResponse({ items: [] }, false);
  };
  const results = await searchYouTube("test", {
    proxyUrl: "http://localhost:5173",
    fetchImpl,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Proxied");
  assert.match(calls[0], /\/api\/search\?q=test$/);

  const keyCalls = [];
  const failingProxy = async (url) => {
    keyCalls.push(String(url));
    if (String(url).includes("/api/search"))
      return jsonResponse({ error: "down" }, false);
    return jsonResponse({
      items: [{ id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Keyed" } }],
    });
  };
  const keyed = await searchYouTube("test", {
    proxyUrl: "http://localhost:5173",
    apiKey: "KEY",
    fetchImpl: failingProxy,
  });
  assert.equal(keyed[0].title, "Keyed");
  assert.ok(keyCalls.some((url) => url.includes("googleapis.com")));
});

test("searchYouTube surfaces a typed failure when nothing answers", async () => {
  const failing = async () => jsonResponse({}, false);
  await assert.rejects(
    () =>
      searchYouTube("test", {
        proxyUrl: "http://localhost:1",
        fetchImpl: failing,
      }),
    (error) => error.code === "error.network",
  );
  // A blank query is a "no results" case, not a network failure.
  assert.deepEqual(await searchYouTube("   ", { fetchImpl: failing }), []);
});

test("normaliseVideo reads InnerTube text shapes from the proxy", () => {
  // These are the shapes /api/search returns from youtubei/v1/search.
  const items = [
    {
      videoId: "dQw4w9WgXcQ",
      title: { runs: [{ text: "Never Gonna " }, { text: "Give You Up" }] },
      ownerText: { runs: [{ text: "Rick Astley" }] },
      lengthText: { simpleText: "3:33" },
      viewCountText: { simpleText: "1,600,000,000 views" },
      thumbnail: { thumbnails: [{ url: "small.jpg" }, { url: "big.jpg" }] },
    },
    {
      videoId: "9bZkp7q19f0",
      title: { simpleText: "GANGNAM STYLE" },
      longBylineText: { runs: [{ text: "officialpsy" }] },
      lengthText: { simpleText: "4:12" },
      thumbnail: { thumbnails: [{ url: "thumb2.jpg" }] },
    },
  ];
  const [first, second] = items.map(normaliseVideo);
  assert.deepEqual(
    {
      id: first.id,
      title: first.title,
      channel: first.channel,
      duration: first.duration,
      thumbnail: first.thumbnail,
    },
    {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      channel: "Rick Astley",
      duration: 213,
      thumbnail: "big.jpg",
    },
  );
  assert.equal(first.views, 1600000000);
  assert.equal(second.title, "GANGNAM STYLE");
  assert.equal(second.channel, "officialpsy");
  assert.equal(second.duration, 252);
});
