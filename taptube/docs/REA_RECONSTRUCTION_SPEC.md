# TapTube 1.6.5 — Clean-Room Reconstruction Spec (Reborn, No IAP)

This document records the REA (Reverse Engineer Anything) analysis of the original
`taptube 1.6.5.apk` and how every gameplay system was reproduced. It contains **no**
original source code, assets, or proprietary media — only behavioral facts and
formulas re-implemented from scratch.

## 1. Original artifact

| Property | Value |
| --- | --- |
| File | `taptube 1.6.5.apk` (Google Drive) |
| Size | 30,999,779 bytes |
| SHA-256 | `8c39dbf1c4e007a8a4f25cf363c5523f1bcc033818f57b63159d864cbcc331f5` |
| Signing | v1 only (signer `OU=Joylol, CN=Hwangkyoosung`) — fails Android 11+ install rules |
| Native lib | `lib/armeabi-v7a/libgame.so` only (32-bit ARMv7) — uninstallable on 64-bit-only Android 14+ |
| Engine | cocos2d-x 3.x (`libgame.so`, 318 C++ classes) + Java shell (447 classes) |

### Why the original cannot be shipped as-is

1. **v1-only signature** — Android 11 (API 30) requires v2+; the APK is rejected.
2. **32-bit only native code** — 64-bit-only devices (Pixel 7+, Android 14/15/16) refuse to install.
3. **Dead backend** — `http://www.smartplayland.com/api/taptube` (JoylolServerManager) is offline.
4. **Dead YouTube scraping** — `YoutubeContentsParser` uses the removed `get_video_info` endpoint.
5. **Monetization** — IAP SKUs (`iap.taptube.ruby.02`…`.50`, `iap.taptube.rmads`,
   `iap.taptube.premium.subscribe.1m`) and ad SDKs (AdMob, Chartboost, Tapjoy, Unity Ads).

The Reborn build re-implements the game with a web-tech gameplay core wrapped in a
modern Android shell, so it installs on every current device and needs no dead services.

## 2. Extracted gameplay math (implemented 1:1)

Source: `NoteConfig` and `PlayScene` symbols in `libgame.so` (ARM disassembly + `.data` tables).

### 2.1 Score scaling

```
ScoreScaling  = LevelBonus * DifficultyScale * SpeedScale * LineScale
BasePoint     = 100.0 * ScoreScaling
```

| Factor | Formula |
| --- | --- |
| `LevelBonus` | `1.0 + (level - 1) * 0.01` (Lv.1…100) |
| `DifficultyScale` | Easy 1.0, Normal 1.1, Hard 1.2, Extreme 1.3, Crazy 1.3 |
| `SpeedScale` | `1.0 + (speed - 1) * 0.05` (x1…x10 → 1.0…1.45) |
| `LineScale` | `1.0 + (lines - 3) * 0.01` (3…6 → 1.0…1.03) |

### 2.2 Combo / Fever

* `COMBO_PER_FEVER_STAGE = 24` → 8 bar segments × 3 combo each.
* Stage multipliers: `1, 2, 3, 4, 5, 10`.
* Six note colour themes: Blue → Green → Yellow → Orange → Red → Violet (MAX FEVER).

### 2.3 Verdicts, accuracy, grade

| Verdict | Multiplier |
| --- | --- |
| PERFECT | 5 |
| GREAT | 4 |
| COOL | 3 |
| GOOD | 2 |
| MISS | 0 (resets combo + fever stage, shakes rail, vibrates) |
| Hold tick | 5 |

```
HitRating = ((PERFECT*8 + GREAT*6 + COOL*4 + GOOD*2 + HOLD_TICKS) * 100)
            / (regularNotes*8 + HOLD_TICKS)
```

Grades: `100 → SSS`, `≥99.5 → SS`, `≥98 → S`, `≥92 → A`, `≥78 → B`,
`≥60 → C`, `≥40 → D`, `<40 → F`.

### 2.4 Rewards

For any grade above `F`, `N = floor(regularHits / 25)`:

* Coins `= max(1, N)`
* EXP `= max(2, N * 6 * HitRating / 100)`

Level-up refills all discs and mails a reward (ticket every 5 levels, otherwise rubies).
First `S`-grade of the day increments the streak and mails coins / gacha.
7-day attendance mails escalating rewards; every mailbox item expires after 3 days.

## 3. Reconstructed feature matrix

| Original system | Reborn implementation |
| --- | --- |
| 7 lobby tabs (Weekly, Search, Recommend, Favorites, History, Note Box, Ranking) | `ui/LobbyView.ts` |
| `ReadyPopup` (orientation, speed x1–x10, 3–6 lanes, Double/Long/Slide, Easy–Extreme/Custom) | `ui/Popups.ts#openReadyPopup` |
| 3D perspective road (`GameRoadNode`) | `engine/RoadRenderer.ts` (true 3D camera projection) |
| Note types: Tap, Double, Long (hold + ticks), Slide (waypoints) | `engine/RhythmEngine.ts` |
| Fever bar, 6 colour themes, MAX FEVER aura | `constants.ts` + `RoadRenderer` |
| YouTube video background with zoom/brightness/quality + pause sync tool | `playback.ts` + `PlayView` |
| Beat-synth fallback when a video blocks embedding | `audio.ts#playBeatSynthStep` |
| Custom note editor (REC, scrub, NPM ≥ 30, test play, JSON) | `engine/EditorEngine.ts` + `ui/EditView.ts` |
| Touch replay recording & playback | `RhythmEngine` replay events + `watchReplay` |
| Result screen, best-record table, rankings | `ui/ResultView.ts`, `storage.ts` |
| Attendance, 3-capsule gacha, mailbox, profile, exchange shop | `ui/Popups.ts` |
| 4-tab settings (General/Effect/Video/Info, TH/EN/JA/KO) | `ui/Popups.ts#openSettings` + `i18n.ts` |
| ~~IAP~~ / ~~Ads~~ | **Removed.** Shop is coin/ruby only — nothing is purchasable with money. |

## 4. YouTube search & playback

Search is layered, first hit wins (`src/youtube.ts`):

1. Pasted URL / 11-char video ID → direct oEmbed lookup (always works).
2. **Android native bridge** `TapTubeNative.searchYouTube` → `youtubei/v1/search`
   (WEB client, no API key) — this is how the APK searches with zero setup.
3. Optional YouTube Data API v3 key (Settings → General) for maximum reliability.
4. Public CORS mirrors (Piped / Invidious) for the desktop browser preview.
5. Bundled curated catalog as offline fallback.

Playback uses the official YouTube IFrame Player API loaded from `https://www.youtube.com/iframe_api`.
Because the app is served from the virtual origin `https://localhost/` inside the WebView
(intercepted by `MainActivity.shouldInterceptRequest`), embedding is permitted — a
`file://` origin would fail with error 152/153.

If an uploader disables embedding, the game transparently switches to the in-game
beat synthesizer and keeps the chart perfectly in time.

## 5. Android packaging

* `minSdk 24`, `targetSdk 34`, `versionCode 165`, `versionName "1.6.5"`.
* WebView with `shouldInterceptRequest` serving `assets/web` at `https://localhost/`.
* `TapTubeBridge` (`@JavascriptInterface`) → search, oEmbed, vibration, orientation,
  share, YouTube `SEND`/`VIEW` intent capture.
* Release APK signed with **v1 + v2 + v3** schemes (RSA-2048, 10,000-day validity).

Build locally:

```bash
cd taptube/android && ./build-apk.sh
# → taptube/build-output/TapTube-1.6.5-Reborn-NoIAP.apk
```

Build in CI: `.github/workflows/build-taptube-apk.yml` (manual dispatch or push to the
work branch) uploads the APK artifact and publishes a GitHub Release.
