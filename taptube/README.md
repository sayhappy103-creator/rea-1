# TapTube Reborn 1.6.5 (No IAP)

A clean-room reconstruction of **TapTube 1.6.5** — the YouTube rhythm game — with every
gameplay system reproduced from binary analysis and **all in-app purchases removed**.

* 🎵 Search any song on YouTube and play it instantly
* 🎮 3–6 lanes, x1–x10 speed, Double / Long / Slide notes, Easy → Extreme
* 🔥 Exact original score scaling, 6-stage fever system, SSS–F grading, rewards
* ✏️ Built-in note editor (REC, scrub, NPM check, test play, JSON export)
* 📺 Touch replays, rankings, attendance, gacha, mailbox, exchange shop (coins only)
* 🌐 ไทย / English / 日本語 / 한국어
* 📱 Ships as a universal, v1+v2+v3-signed APK (`minSdk 24`, `targetSdk 34`)

## Download

* Google Drive: <https://drive.google.com/file/d/1RB2yb-J6wfXRT3TlkTtOG0I0b8N2auEe/view>
* GitHub Release: <https://github.com/sayhappy103-creator/rea-1/releases/tag/taptube-reborn-1.6.5-noiap>
* Thai install guide: [`docs/INSTALL_TH.md`](docs/INSTALL_TH.md)

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → web-dist/
```

## Build the APK

```bash
cd android
./build-apk.sh
# → taptube/build-output/TapTube-1.6.5-Reborn-NoIAP.apk
```

Requires JDK 17 and Android SDK platform 34 + build-tools 34. CI alternative:
`.github/workflows/build-taptube-apk.yml` (workflow_dispatch) builds, verifies the
v1/v2/v3 signature with `apksigner`, uploads the artifact and publishes a Release.

## YouTube search without any API key

On Android the app performs search through the native bridge (`youtubei/v1/search`,
no key required). A **YouTube Data API v3 key is optional** and only improves
reliability — paste it in **Settings → General → YouTube API key**.

How to get one (free):

1. Open <https://console.cloud.google.com/> and create a project.
2. Enable **YouTube Data API v3** (APIs & Services → Library).
3. Credentials → Create credentials → **API key**, then paste it into the game.

Quota is 10,000 units/day (≈100 searches). Without a key the game still works.

## Clean-room notice

No original code, art, audio or other assets were copied. Formulas were derived from
permitted binary analysis (REA) and re-implemented; all media is either generated at
runtime or streamed by the official YouTube IFrame Player API. See
[`docs/REA_RECONSTRUCTION_SPEC.md`](docs/REA_RECONSTRUCTION_SPEC.md).
