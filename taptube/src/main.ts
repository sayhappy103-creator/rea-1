import "./styles.css";
import { store } from "./storage";
import { soundEngine } from "./audio";
import { estimateSongBpm, generateBasicChart } from "./beatgen";
import { extractYoutubeId, lookupYoutubeById } from "./youtube";
import { GamePlayOptions, GameResultData, LobbyTab, YtItem } from "./types";
import { TopBar } from "./ui/TopBar";
import { LobbyView } from "./ui/LobbyView";
import { PlayView } from "./ui/PlayView";
import { EditView } from "./ui/EditView";
import { ResultView } from "./ui/ResultView";
import { Modal, toast } from "./ui/Modal";
import {
  openAttendance,
  openGacha,
  openMailbox,
  openProfile,
  openReadyPopup,
  openSettings,
  openShop,
} from "./ui/Popups";
import { ChartNote } from "./types";

type Screen = "lobby" | "play" | "edit" | "result";

class App {
  private root: HTMLElement;
  private topBar: TopBar | null = null;
  private lobby: LobbyView | null = null;
  private playView: PlayView | null = null;
  private editView: EditView | null = null;
  private resultView: ResultView | null = null;
  private screen: Screen = "lobby";
  private activeTab: LobbyTab = "weekly";
  private pendingSong: YtItem | null = null;
  private pendingOptions: GamePlayOptions | null = null;
  private lastResult: GameResultData | null = null;
  private testPlayReturnChart: { notes: ChartNote[]; startMs: number; endMs: number } | null =
    null;

  constructor() {
    this.root = document.getElementById("app") as HTMLElement;
    this.root.className = "app-root";
    this.mountLobby();
    this.handleNativeShareIntent();
    window.addEventListener("resize", () => this.syncOrientationClass());
  }

  private syncOrientationClass(): void {
    const isLandscape = window.innerWidth > window.innerHeight * 1.05;
    document.body.classList.toggle("is-landscape", isLandscape);
  }

  private mountLobby(): void {
    this.screen = "lobby";
    this.root.innerHTML = "";
    this.topBar = new TopBar((target) => this.openTopTarget(target));
    this.lobby = new LobbyView({
      onSelectSong: (song) => this.selectSong(song),
      onOpenEditor: (song, chartId) => this.openEditor(song, chartId),
      onWatchReplay: (replayId) => this.watchReplay(replayId),
    });
    this.lobby.setTab(this.activeTab);
    this.root.appendChild(this.topBar.el);
    this.root.appendChild(this.lobby.el);
    this.syncOrientationClass();
    window.TapTubeNative?.setOrientation?.("portrait");
  }

  private openTopTarget(
    target: "shop" | "mailbox" | "profile" | "settings" | "attendance" | "gacha"
  ): void {
    const modal =
      target === "shop"
        ? openShop()
        : target === "mailbox"
        ? openMailbox()
        : target === "profile"
        ? openProfile()
        : target === "settings"
        ? openSettings()
        : target === "attendance"
        ? openAttendance()
        : openGacha();
    modal.body().addEventListener("click", () => this.topBar?.refresh());
    window.setTimeout(() => this.topBar?.refresh(), 400);
  }

  private selectSong(song: YtItem): void {
    const chart = store.user.customCharts.find((c) => c.videoId === song.videoId);
    if (chart && store.user.records[song.videoId] === undefined) {
      openReadyPopup(song, (options) => this.startPlay(song, options), chart.id);
      return;
    }
    openReadyPopup(song, (options) => this.startPlay(song, options));
  }

  private startPlay(
    song: YtItem,
    options: GamePlayOptions,
    overrideChart?: { notes: ChartNote[]; startMs: number; endMs: number }
  ): void {
    const bpm = estimateSongBpm(song);
    let notes: ChartNote[];
    if (options.customChart) {
      notes = options.customChart.notes;
    } else if (overrideChart) {
      notes = overrideChart.notes;
    } else {
      const gen = generateBasicChart(
        song,
        options.difficulty,
        options.lines,
        options.useDoubleNote,
        options.useLongNote,
        options.useSlideNote
      );
      notes = gen.notes;
    }

    this.pendingSong = song;
    this.pendingOptions = options;
    this.screen = "play";
    this.destroyAll();
    this.root.innerHTML = "";
    this.playView = new PlayView(
      { song, options, chartNotes: notes, bpm },
      (result) => this.onPlayExit(result)
    );
    this.root.appendChild(this.playView.el);
  }

  private onPlayExit(result: GameResultData | null): void {
    if (!result) {
      const song = this.pendingSong;
      const options = this.pendingOptions;
      this.playView?.destroy();
      this.playView = null;
      this.destroyAll();
      this.mountLobby();
      if (song && options) {
        window.setTimeout(() => this.startPlay(song, options), 60);
      }
      return;
    }
    this.lastResult = result;
    this.playView?.destroy();
    this.playView = null;
    this.showResult(result);
  }

  private showResult(result: GameResultData): void {
    this.screen = "result";
    this.root.innerHTML = "";
    this.resultView = new ResultView(result, {
      onRetry: () => {
        const song = this.pendingSong;
        const opts = this.pendingOptions;
        this.destroyAll();
        this.mountLobby();
        if (song && opts) window.setTimeout(() => this.startPlay(song, opts), 50);
      },
      onLobby: () => {
        this.destroyAll();
        this.mountLobby();
      },
      onRanking: () => {
        this.activeTab = "ranking";
        this.destroyAll();
        this.mountLobby();
      },
    });
    this.root.appendChild(this.resultView.el);
    this.resultView.animateIn();
    this.resultView.el.addEventListener("taptube:watch-replay", (ev: Event) => {
      const id = (ev as CustomEvent).detail as string;
      this.watchReplay(id);
    });
  }

  private watchReplay(replayId: string): void {
    const rec = store.user.replays.find((r) => r.id === replayId);
    if (!rec) return;
    const song: YtItem = {
      videoId: rec.videoId,
      title: rec.videoTitle,
      channelTitle: "",
      durationSec: Math.max(60, Math.round(rec.maxCombo * 0.6)),
      thumbnail: rec.videoThumbnail,
    };
    const chartInfo = generateBasicChart(
      song,
      rec.difficulty,
      rec.lines,
      rec.useDoubleNote,
      rec.useLongNote,
      rec.useSlideNote
    );
    this.pendingSong = song;
    this.pendingOptions = {
      difficulty: rec.difficulty,
      speed: rec.speed,
      lines: rec.lines,
      orientation: store.settings.orientation,
      useDoubleNote: rec.useDoubleNote,
      useLongNote: rec.useLongNote,
      useSlideNote: rec.useSlideNote,
      isReplay: true,
      replayData: rec,
    };
    this.destroyAll();
    this.root.innerHTML = "";
    this.screen = "play";
    this.playView = new PlayView(
      {
        song,
        options: this.pendingOptions,
        chartNotes: chartInfo.notes,
        bpm: chartInfo.bpm,
      },
      () => {
        this.destroyAll();
        this.mountLobby();
      }
    );
    this.root.appendChild(this.playView.el);
  }

  private openEditor(song: YtItem, chartId?: string): void {
    if (!store.consumeDisc()) {
      toast("ไม่มีการเล่นเหลืออยู่", "warn");
    }
    this.destroyAll();
    this.root.innerHTML = "";
    this.screen = "edit";
    const chart = chartId
      ? store.user.customCharts.find((c) => c.id === chartId)
      : undefined;
    this.editView = new EditView(
      song,
      chart?.lines ?? store.settings.lines,
      chartId,
      () => {
        this.editView?.destroy();
        this.editView = null;
        this.destroyAll();
        this.mountLobby();
      },
      (notes, startMs, endMs) => {
        this.testPlayReturnChart = { notes, startMs, endMs };
        const opts: GamePlayOptions = {
          difficulty: "hard",
          speed: store.settings.speed,
          lines: chart?.lines ?? store.settings.lines,
          orientation: store.settings.orientation,
          useDoubleNote: true,
          useLongNote: true,
          useSlideNote: true,
          isTestPlay: true,
        };
        this.editView?.destroy();
        this.editView = null;
        this.startPlay(
          song,
          opts,
          this.testPlayReturnChart
        );
      }
    );
    this.root.appendChild(this.editView.el);
  }

  private destroyAll(): void {
    this.topBar?.destroy();
    this.topBar = null;
    this.lobby?.destroy();
    this.lobby = null;
    this.playView?.destroy();
    this.playView = null;
    this.editView?.destroy();
    this.editView = null;
    this.resultView?.el.remove();
    this.resultView = null;
    document.body.classList.remove("landscape", "portrait");
  }

  private handleNativeShareIntent(): void {
    const tryShared = async () => {
      const url = window.TapTubeNative?.getSharedYoutubeUrl?.();
      if (!url) return;
      const id = extractYoutubeId(url);
      if (!id) return;
      const song = await lookupYoutubeById(id, store.settings.youtubeApiKey);
      window.setTimeout(() => this.selectSong(song), 350);
    };
    window.onTapTubeSharedUrl = (url: string) => {
      const id = extractYoutubeId(url);
      if (!id) return;
      void lookupYoutubeById(id, store.settings.youtubeApiKey).then((song) => {
        this.selectSong(song);
      });
    };
    void tryShared();
  }
}

function boot(): void {
  const app = new App();
  (window as any).__taptubeApp = app;
  document.addEventListener(
    "pointerdown",
    () => soundEngine.unlock(),
    { once: true }
  );

  const isAndroid = !!window.TapTubeNative?.isAndroidApp?.();
  if (!store.user.lastAttendanceDate) {
    const modal = new Modal(
      "TapTube Reborn 1.6.5",
      `<p class="modal-text">${isAndroid ? "Android · " : "Web · "}No IAP · ${store.user.discs} discs</p>`,
      { buttons: [{ label: "OK", kind: "primary" }] }
    );
    void modal;
  }
}

boot();
