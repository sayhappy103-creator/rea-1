# TapTube — for the web

A browser rebuild of **TapTube 1.6.5** (SmartPlayland's _Music Video Rhythm Game_):
play rhythm notes over a YouTube video, have the notes generated from the song,
and edit/share your own charts. No install, no account and no data leaves the
device except the YouTube search/thumbnail requests.

```bash
node taptube/server.mjs        # → http://localhost:5173
PORT=8080 node taptube/server.mjs
```

The server is a plain Node HTTP server (Node ≥ 20, zero runtime dependencies):
it serves the static app and answers the YouTube proxy routes.

## What it does

| Original app                                                     | Here                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rhythm game on top of a YouTube video                            | Canvas playfield over the YouTube embed (`youtube-nocookie`)                                      |
| "Smart TAPTUBE can analyse any soundtrack"                       | Real onset/BPM analysis of local audio files and the demo track (FFT → spectral flux → IOI tempo) |
| Note speed, number of lanes, long note on/off, slide note on/off | Same options, plus 4/5/6 lanes and a live offset control                                          |
| Custom note function (make and share your own notes)             | Full chart editor + JSON import/export, saved to `localStorage`                                   |
| Recommend / Favorite / Ranking                                   | Curated list, play history, best-score ranks per song                                             |
| iOS/Android build                                                | Responsive PWA (installable, works on phones and desktop)                                         |

Because browsers cannot read the audio of an embedded YouTube player, YouTube
charts follow a **tempo grid** (set the BPM, or tap along, and the notes snap to
beats); local files and the demo track are analysed for real. This is called out
in the UI so the difference is never silent, and a video whose metadata cannot be
loaded still opens, with a warning and the BPM field ready to type into.

## Screens

- **Play** — search box, quick actions, curated videos, recent plays.
- **Song** — difficulty (easy/normal/hard/extreme), lanes, note speed, long/slide
  toggles, BPM + tap tempo, chart statistics, play / practice / edit.
- **Game** — falling notes, judgement line, combo, accuracy, pause menu,
  keyboard (`D F J K`, `1`–`6`, `Esc`) and multi-touch lanes.
- **Result** — rank (S/A/B/C/D), accuracy, judgement counts, new-record flag.
- **Library** — history, custom charts, imported audio files.
- **Editor** — place/hold/slide/erase notes on a snapped lane grid, playhead
  scrubbing, autofill from the grid, save/export/import, test play.
- **Settings** — ไทย/English, gameplay, audio, YouTube proxy, data reset.

## YouTube proxy

`GET /api/search?q=…` and `GET /api/video?id=…` resolve through the InnerTube
(`youtubei/v1`) endpoints the YouTube web client uses, so **no API key is
required**. Optional knobs:

| env                  | default            | meaning                                 |
| -------------------- | ------------------ | --------------------------------------- |
| `YOUTUBE_API_KEY`    | unset              | prefer the official Data API when set   |
| `PROXY_CACHE_TTL_MS` | `300000`           | how long search/meta answers are cached |
| `PROXY_TIMEOUT_MS`   | `8000`             | upstream timeout                        |
| `PORT` / `HOST`      | `5173` / `0.0.0.0` | listen address                          |

The app defaults its proxy URL to its own origin, so the bundled server works
out of the box; a different host can be set on the Settings screen (with a
connection test). YouTube has no keyless SLA: if upstream search fails, the
screen says so and still accepts a pasted link, a local file, or the demo.

## Controls

| Action     | Keyboard                                        | Touch                     |
| ---------- | ----------------------------------------------- | ------------------------- |
| Hit a note | `D F J K` (4 lanes), `S D F J K L` (6), `1`–`6` | tap the lane              |
| Long note  | press and hold                                  | tap and keep holding      |
| Slide note | hit, then move to the end lane                  | hit, then move the finger |
| Pause      | `Esc` or `Space` while paused                   | ⏸ button                  |

## Development

```bash
cd taptube
npm test           # node:test — analysis, chart, judging, storage, YouTube parsing
npm run test:ui    # optional: full app smoke test in jsdom (npm i --no-save jsdom)
node server.mjs    # dev server, no build step
npm run check      # syntax check of every module + the whole test suite
```

There is no bundler: the app is dependency-free ES modules loaded directly by the
browser, and the same modules run under Node for the tests.

```
taptube/
  index.html  manifest.webmanifest  styles/app.css  assets/icon.svg
  server.mjs                 static server + YouTube proxy
  src/
    analysis.js              FFT, spectral flux, onset picking, IOI tempo
    audio.js                 decode, mono mixdown, sample-accurate player, hit SFX
    chart.js                 chart model, difficulty presets, chart generators
    judge.js                 judgement windows, scoring, accuracy, ranks
    game.js                  game loop, input, hold/slide handling
    renderer.js              canvas playfield
    categories …             screens: home/search/song/game/result/library/editor/settings
    store.js  songs.js  youtube.js  demo.js  router.js  i18n.js  ui.js
  tests/                     node:test suites (analysis, chart, judge, game,
                             store, YouTube, editor round-trip, UI smoke)
  scripts/check-syntax.mjs   `node --check` over every module
```

## Notes and limits

- YouTube playback uses the official embed player, so a video that blocks
  embedding stays blocked — use a local audio file for those.
- Importing a local audio file keeps the decoded audio in memory only; the
  library remembers its name/size so the same file can be re-picked and the
  cached chart is reused.
- `localStorage` holds settings, scores, history and custom charts; the Settings
  screen can clear scores or reset everything.
