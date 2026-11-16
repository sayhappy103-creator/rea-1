import { store } from "../storage";
import {
  ATTENDANCE_REWARDS,
  COUNTRIES,
  GACHA_POOL,
  getRequiredExpForLevel,
} from "../constants";
import {
  Difficulty,
  GamePlayOptions,
  GameSettings,
  Language,
  LineCount,
  NoteSpeed,
  PlayOrientation,
  YtItem,
} from "../types";
import { icon } from "./icons";
import { esc, flagOf, fmtCountdown, fmtInt, fmtTime } from "./dom";
import { Modal, toast, confirmDialog } from "./Modal";
import { tt } from "./TopBar";
import { soundEngine } from "../audio";
import { t } from "../i18n";
import { t2, languageLabel } from "../i18nExtra";
import { formatDuration } from "../youtube";

const DIFFS: Difficulty[] = ["easy", "normal", "hard", "extreme", "crazy"];
const LINES: LineCount[] = [3, 4, 5, 6];
const SPEEDS: NoteSpeed[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Pre-game READY popup replicating `ReadyPopup` (orientation, speed, lanes, note types, difficulty). */
export function openReadyPopup(
  song: YtItem,
  onStart: (options: GamePlayOptions) => void,
  chartId?: string
): Modal {
  const opts: GamePlayOptions = {
    difficulty: store.settings.difficulty,
    speed: store.settings.speed,
    lines: store.settings.lines,
    orientation: store.settings.orientation,
    useDoubleNote: store.settings.useDoubleNote,
    useLongNote: store.settings.useLongNote,
    useSlideNote: store.settings.useSlideNote,
  };
  const customChart = chartId
    ? store.user.customCharts.find((c) => c.id === chartId)
    : undefined;
  if (customChart) {
    opts.lines = customChart.lines;
    opts.customChart = customChart;
  }
  const myCharts = store.user.customCharts.filter(
    (c) => c.videoId === song.videoId
  );
  let pickedChartId = customChart?.id ?? "";

  const rec = store.user.records[song.videoId];
  let modal: Modal;

  const bodyHtml = () => `
    <div class="ready-hero">
      <img src="${esc(song.thumbnail)}" alt="" />
      <div class="rh-grad"></div>
      <div class="rh-text">
        <strong>${esc(song.title)}</strong>
        <span>${esc(song.channelTitle)} · ${formatDuration(song.durationSec)}</span>
      </div>
      ${rec ? `<span class="rh-best">${icon("star", 12)} ${rec.bestGrade} · ${fmtInt(rec.bestScore)}</span>` : ""}
    </div>

    ${
      customChart
        ? `<div class="ready-chart-badge">${icon("note", 14)} ${esc(customChart.title)} · ${esc(tt("chart_npm"))} ${customChart.npm}</div>`
        : ""
    }

    <div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_orientation"))}</div>
      <div class="seg">
        ${(["portrait", "landscape"] as PlayOrientation[])
          .map(
            (o) =>
              `<button class="seg-btn ${opts.orientation === o ? "on" : ""}" data-orient="${o}">
                ${icon(o === "portrait" ? "grid" : "video", 15)}
                ${esc(t(store.settings.language, `mode_${o}`))}
              </button>`
          )
          .join("")}
      </div>
    </div>

    <div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_lines"))} <b>${opts.lines}K</b></div>
      <div class="seg">
        ${LINES.map(
          (l) =>
            `<button class="seg-btn ${opts.lines === l ? "on" : ""} ${customChart && customChart.lines !== l ? "disabled" : ""}" data-lines="${l}">${l}K</button>`
        ).join("")}
      </div>
    </div>

    <div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_speed"))} <b>x${opts.speed}</b></div>
      <div class="seg wrap">
        ${SPEEDS.map(
          (s) =>
            `<button class="seg-btn xs ${opts.speed === s ? "on" : ""}" data-speed="${s}">x${s}</button>`
        ).join("")}
      </div>
    </div>

    <div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_difficulty"))}</div>
      <div class="seg wrap">
        ${DIFFS.map(
          (d) =>
            `<button class="seg-btn d-${d} ${opts.difficulty === d ? "on" : ""}" data-diff="${d}">${esc(
              t(store.settings.language, `diff_${d}`)
            )}</button>`
        ).join("")}
      </div>
    </div>

    <div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_notetypes"))}</div>
      <div class="note-toggles">
        ${(
          [
            ["useDoubleNote", "note_double", "copy"],
            ["useLongNote", "note_long", "clock"],
            ["useSlideNote", "note_slide", "share"],
          ] as const
        )
          .map(
            ([field, label, ico]) => `
          <button class="toggle-card ${opts[field] ? "on" : ""}" data-toggle="${field}">
            ${icon(ico, 18)}
            <span>${esc(t(store.settings.language, label))}</span>
            <em></em>
          </button>`
          )
          .join("")}
      </div>
    </div>

    ${
      customChart
        ? ""
        : `<div class="ready-section">
      <div class="rs-label">${esc(t(store.settings.language, "opt_chart_source"))}</div>
      <div class="seg wrap" data-chart-row>
        <button class="seg-btn ${!pickedChartId ? "on" : ""}" data-chart="">${esc(tt("chart_default"))}</button>
        ${myCharts
          .map(
            (c) =>
              `<button class="seg-btn ${pickedChartId === c.id ? "on" : ""}" data-chart="${esc(c.id)}">${esc(c.title.slice(0, 18))} · ${c.npm}</button>`
          )
          .join("")}
      </div>
      ${
        myCharts.length === 0
          ? `<p class="hint">${esc(tt("no_custom_charts"))}</p>`
          : ""
      }
    </div>`
    }

    <div class="disc-hint">
      ${icon("disc", 14)}
      ${
        store.hasUnlimitedDiscs()
          ? `${esc(tt("unlimited_time"))} · ${fmtCountdown((store.user.unlimitedTicketUntil - Date.now()) / 1000)}`
          : `${store.user.discs} / ${store.user.maxDiscs} ${esc(tt("discs"))}`
      }
    </div>
  `;

  const wire = (root: HTMLElement) => {
    root.querySelectorAll<HTMLElement>("[data-chart]").forEach((b) =>
      b.addEventListener("click", () => {
        pickedChartId = b.dataset.chart ?? "";
        const picked = store.user.customCharts.find((c) => c.id === pickedChartId);
        opts.customChart = picked;
        if (picked) opts.lines = picked.lines;
        refresh();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-orient]").forEach((b) =>
      b.addEventListener("click", () => {
        opts.orientation = b.dataset.orient as PlayOrientation;
        refresh();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-lines]").forEach((b) =>
      b.addEventListener("click", () => {
        if (customChart && Number(b.dataset.lines) !== customChart.lines) return;
        opts.lines = Number(b.dataset.lines) as LineCount;
        refresh();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-speed]").forEach((b) =>
      b.addEventListener("click", () => {
        opts.speed = Number(b.dataset.speed) as NoteSpeed;
        refresh();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-diff]").forEach((b) =>
      b.addEventListener("click", () => {
        opts.difficulty = b.dataset.diff as Difficulty;
        refresh();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-toggle]").forEach((b) =>
      b.addEventListener("click", () => {
        const field = b.dataset.toggle as
          | "useDoubleNote"
          | "useLongNote"
          | "useSlideNote";
        opts[field] = !opts[field];
        refresh();
      })
    );
  };

  const refresh = () => {
    if (!modal) return;
    const root = modal.body();
    root.innerHTML = bodyHtml();
    wire(root);
  };

  modal = new Modal(
    t(store.settings.language, "ready_title"),
    bodyHtml(),
    {
      wide: true,
      buttons: [
        { label: t(store.settings.language, "btn_cancel"), kind: "ghost" },
        {
          label: `▶ ${t(store.settings.language, "btn_start")}`,
          kind: "primary",
          onClick: () => {
            store.updateSettings({
              difficulty: opts.difficulty,
              speed: opts.speed,
              lines: opts.lines,
              orientation: opts.orientation,
              useDoubleNote: opts.useDoubleNote,
              useLongNote: opts.useLongNote,
              useSlideNote: opts.useSlideNote,
            });
            const picked = pickedChartId
              ? store.user.customCharts.find((c) => c.id === pickedChartId)
              : undefined;
            onStart({ ...opts, customChart: picked });
          },
        },
      ],
      onClose: () => {
        store.refundDisc();
      },
    }
  );
  wire(modal.body());
  // Consume a disc when starting the run
  if (!store.consumeDisc()) {
    toast(tt("no_discs"), "warn");
  }
  return modal;
}

export function openShop(): Modal {
  const body = () => {
    const u = store.user;
    return `
      <div class="shop-wallet">
        <div class="sw-item coin">${icon("coin", 20)}<b>${fmtInt(u.coins)}</b><span>${esc(tt("coins"))}</span></div>
        <div class="sw-item ruby">${icon("ruby", 20)}<b>${fmtInt(u.rubies)}</b><span>${esc(tt("rubies"))}</span></div>
        <div class="sw-item disc">${icon("disc", 20)}<b>${u.discs}</b><span>${esc(tt("discs"))}</span></div>
      </div>
      <p class="shop-note">${icon("lock", 13)} ${esc(tt("exchange"))} — 100% free, no real-money purchases.</p>
      <div class="shop-grid">
        <div class="shop-item">
          <div class="si-ico disc">${icon("disc", 24)}</div>
          <div class="si-main"><b>+5 ${esc(tt("discs"))}</b><span>${(5 * 120).toLocaleString("en-US")} ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="disc:5:600">${esc(tt("exchange"))}</button>
        </div>
        <div class="shop-item">
          <div class="si-ico ruby">${icon("ruby", 24)}</div>
          <div class="si-main"><b>+5 ${esc(tt("rubies"))}</b><span>${(5 * 300).toLocaleString("en-US")} ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="ruby:5:1500">${esc(tt("exchange"))}</button>
        </div>
        <div class="shop-item">
          <div class="si-ico ticket">${icon("ticket", 24)}</div>
          <div class="si-main"><b>1-Day ${esc(tt("tickets"))}</b><span>${(2400).toLocaleString("en-US")} ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="ticket:24:2400">${esc(tt("exchange"))}</button>
        </div>
        <div class="shop-item">
          <div class="si-ico gift">${icon("gift", 24)}</div>
          <div class="si-main"><b>${esc(tt("gacha_free"))}</b><span>300 ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="gacha:1:300">${esc(tt("exchange"))}</button>
        </div>
        <div class="shop-item">
          <div class="si-ico heart">${icon("heart", 24)}</div>
          <div class="si-main"><b>+1 ${esc(tt("add_favorite"))}</b><span>300 ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="favorite:1:300">${esc(tt("exchange"))}</button>
        </div>
        <div class="shop-item">
          <div class="si-ico clock">${icon("clock", 24)}</div>
          <div class="si-main"><b>+1 ${esc(tt("plays"))} slot</b><span>300 ${esc(tt("coins"))}</span></div>
          <button class="btn tiny primary" data-buy="history:1:300">${esc(tt("exchange"))}</button>
        </div>
      </div>
      <button class="btn ghost wide-btn" data-refill>${icon("refresh", 15)} ${esc(t(store.settings.language, "btn_free_charge"))}</button>
    `;
  };

  const modal: Modal = new Modal(tt("exchange"), body(), {
    wide: true,
    buttons: [{ label: tt("btn_close"), kind: "ghost" }],
  });

  const rerender = () => {
    const root = modal.body();
    root.innerHTML = body();
    wire();
  };

  const wire = () => {
    modal.body().querySelectorAll<HTMLElement>("[data-buy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [kind, amountRaw, costRaw] = btn.dataset.buy!.split(":");
        const amount = Number(amountRaw);
        const cost = Number(costRaw);
        if (store.user.coins < cost) {
          toast(tt("not_enough_coin"), "warn");
          return;
        }
        store.user.coins -= cost;
        if (kind === "favorite") store.user.favoriteSlots += 1;
        else if (kind === "history") store.user.historySlots += 1;
        else if (kind === "gacha") {
          const prize = store.rollGacha();
          soundEngine.playRewardChime(store.settings, "gacha");
          toast(`${tt("gacha_result")}: ${prize.amount} ${tt(prize.kind as any)}`, "ok");
        } else {
          store.applyReward(kind as any, amount);
          soundEngine.playRewardChime(store.settings, kind === "disc" ? "disc" : kind === "ruby" ? "ruby" : "coin");
        }
        store.save();
        rerender();
      });
    });
    modal.body().querySelector("[data-refill]")?.addEventListener("click", () => {
      if (store.user.rubies < 5) {
        toast(tt("not_enough_coin"), "warn");
        return;
      }
      store.user.rubies -= 5;
      store.user.discs = store.user.maxDiscs;
      store.user.lastDiscChargeAt = Date.now();
      store.save();
      soundEngine.playRewardChime(store.settings, "disc");
      rerender();
    });
  };
  wire();
  return modal;
}

export function openMailbox(): Modal {
  const body = () => {
    const mails = store.user.mailbox;
    if (!mails.length) {
      return `<div class="empty-state">${icon("mail", 40)}<p>${esc(tt("mail_empty"))}</p></div>`;
    }
    return `
      <div class="mail-list">
        ${mails
          .map((m) => {
            const remain = Math.max(0, (m.expiresAt - Date.now()) / 1000);
            const title = t(store.settings.language, m.titleKey, m.titleParam);
            return `
            <div class="mail-row">
              <div class="mr-ico ${m.rewardKind}">${icon(
                m.rewardKind === "gacha" ? "gift" : m.rewardKind,
                19
              )}</div>
              <div class="mr-main">
                <b>${esc(title === m.titleKey ? tt("mail_claim") : title)}</b>
                <em>${m.rewardKind === "ticket" ? `${m.amount}h ${esc(tt("tickets"))}` : `+${fmtInt(m.amount)} ${esc(tt(m.rewardKind))}`} · ${esc(tt("mail_expire"))} ${fmtCountdown(remain)}</em>
              </div>
              <button class="btn tiny primary" data-claim="${esc(m.id)}">${esc(tt("mail_claim"))}</button>
            </div>`;
          })
          .join("")}
      </div>
      <button class="btn ghost wide-btn" data-claim-all>${esc(t(store.settings.language, "btn_get_all"))}</button>
    `;
  };

  const modal: Modal = new Modal(t(store.settings.language, "mailbox_title"), body(), {
    buttons: [{ label: tt("btn_close"), kind: "ghost" }],
  });

  const rerender = () => {
    modal.body().innerHTML = body();
    wire();
  };

  const claim = (id: string) => {
    const mail = store.claimMail(id);
    if (!mail) return;
    if (mail.rewardKind === "gacha") {
      const prize = store.rollGacha();
      soundEngine.playRewardChime(store.settings, "gacha");
      toast(`${tt("gacha_result")}: +${prize.amount} ${tt(prize.kind as any)}`, "ok");
    } else {
      soundEngine.playRewardChime(store.settings, mail.rewardKind === "ticket" ? "disc" : (mail.rewardKind as any));
    }
    rerender();
  };

  const wire = () => {
    modal.body().querySelectorAll<HTMLElement>("[data-claim]").forEach((b) =>
      b.addEventListener("click", () => claim(b.dataset.claim!))
    );
    modal.body().querySelector("[data-claim-all]")?.addEventListener("click", () => {
      const ids = store.user.mailbox.map((m) => m.id);
      ids.forEach((id) => claim(id));
      rerender();
    });
  };
  wire();
  return modal;
}

export function openAttendance(): Modal {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const claimedToday = store.user.lastAttendanceDate === iso;
  const currentDay = (store.user.attendanceDay % 7) + (claimedToday ? 0 : 1);

  const daysHtml = ATTENDANCE_REWARDS.map((r) => {
    const done = claimedToday ? r.day <= store.user.attendanceDay % 7 : r.day < currentDay;
    const active = !claimedToday && r.day === currentDay;
    return `
      <div class="att-day ${done ? "done" : ""} ${active ? "active" : ""}">
        <span class="ad-num">${esc(tt("attendance_day"))} ${r.day}</span>
        <div class="ad-ico ${r.kind}">${icon(r.kind === "gacha" ? "gift" : r.kind, 20)}</div>
        <span class="ad-amt">${r.kind === "gacha" ? "GACHA" : `+${r.amount}`}</span>
        ${done ? `<span class="ad-check">${icon("check", 12)}</span>` : ""}
      </div>`;
  }).join("");

  const modal = new Modal(t(store.settings.language, "attendance_title"), `
    <div class="att-grid">${daysHtml}</div>
    <button class="btn primary wide-btn" data-att-claim ${claimedToday ? "disabled" : ""}>
      ${icon("gift", 16)} ${esc(claimedToday ? tt("claimed_today") : tt("attendance_claim"))}
    </button>
  `, {
    buttons: [{ label: tt("btn_close"), kind: "ghost" }],
  });

  modal.body().querySelector("[data-att-claim]")?.addEventListener("click", () => {
    const res = store.checkDailyAttendance();
    if (res.triggered) {
      soundEngine.playRewardChime(store.settings, "s_grade");
      toast(`${tt("attendance_claim")} ✓`, "ok");
      modal.close();
      openMailbox();
    }
  });
  return modal;
}

export function openGacha(): Modal {
  const modal = new Modal(t(store.settings.language, "gacha_title"), `
    <div class="gacha-stage">
      <div class="capsule c1"></div>
      <div class="capsule c2"></div>
      <div class="capsule c3"></div>
    </div>
    <p class="modal-text center">${esc(tt("gacha_free"))}</p>
    <div class="gacha-result" data-gacha-result></div>
  `, {
    wide: true,
    buttons: [
      { label: tt("btn_close"), kind: "ghost" },
      {
        label: tt("gacha_free"),
        kind: "primary",
        onClick: () => {
          if (store.user.coins < 300) {
            toast(tt("not_enough_coin"), "warn");
            return;
          }
          store.user.coins -= 300;
          const prize = store.rollGacha();
          soundEngine.playRewardChime(store.settings, "gacha");
          const host = modal.body().querySelector("[data-gacha-result]") as HTMLElement;
          host.innerHTML = `
            <div class="gr-card">
              <div class="gr-ico ${prize.kind}">${icon(prize.kind, 34)}</div>
              <b>+${fmtInt(prize.amount)}</b>
              <span>${esc(tt(prize.kind))}</span>
            </div>`;
        },
      },
    ],
  });
  void GACHA_POOL;
  return modal;
}

export function openProfile(): Modal {
  const u = store.user;
  const need = getRequiredExpForLevel(u.level);
  const totalPlays = Object.values(u.records).reduce((a, r) => a + r.playCount, 0);
  const bestGrade = Object.values(u.records)
    .map((r) => r.bestGrade)
    .sort((a, b) => gradeRank(b) - gradeRank(a))[0] ?? "F";
  const body = () => `
    <div class="profile-hero">
      <div class="ph-avatar">${icon("user", 30)}</div>
      <div class="ph-info">
        <input class="nick-input" value="${esc(u.nickname)}" maxlength="16" data-nick />
        <div class="ph-tags">
          <span class="tag lv">Lv.${u.level}</span>
          <span class="tag">${flagOf(store.settings.countryCode)} ${store.settings.countryCode}</span>
          <span class="tag best">${bestGrade}</span>
        </div>
      </div>
    </div>
    <div class="exp-block">
      <div class="exp-row"><span>EXP</span><b>${fmtInt(u.exp)} / ${fmtInt(need)}</b></div>
      <div class="ps-bar"><i style="width:${Math.min(100, (u.exp / need) * 100)}%"></i></div>
    </div>
    <div class="stat-grid">
      <div class="stat"><span>${esc(tt("coins"))}</span><b>${fmtInt(u.coins)}</b></div>
      <div class="stat"><span>${esc(tt("rubies"))}</span><b>${fmtInt(u.rubies)}</b></div>
      <div class="stat"><span>${esc(tt("discs"))}</span><b>${u.discs}/${u.maxDiscs}</b></div>
      <div class="stat"><span>${esc(tt("plays"))}</span><b>${fmtInt(totalPlays)}</b></div>
      <div class="stat"><span>${esc(tt("add_favorite"))}</span><b>${u.favorites.length}/${u.favoriteSlots}</b></div>
      <div class="stat"><span>${esc(tt("replay_badge"))}</span><b>${u.replays.length}</b></div>
    </div>
    <div class="profile-actions">
      <button class="btn ghost" data-gacha>${icon("gift", 15)} ${esc(tt("gacha_free"))}</button>
      <button class="btn ghost" data-mail>${icon("mail", 15)} ${esc(t(store.settings.language, "mailbox_title"))}</button>
    </div>
    <div class="ticket-block">
      ${icon("ticket", 15)}
      ${
        store.hasUnlimitedDiscs()
          ? `<b>${esc(tt("tickets"))}</b><span>${fmtCountdown((u.unlimitedTicketUntil - Date.now()) / 1000)}</span>`
          : `<b>${esc(tt("tickets"))}</b><span>${esc(tt("off"))}</span>`
      }
    </div>
  `;

  const modal = new Modal(t(store.settings.language, "profile_title"), body(), {
    buttons: [{ label: tt("btn_close"), kind: "ghost" }],
  });
  modal.body().querySelector("[data-nick]")?.addEventListener("change", (e) => {
    const v = (e.target as HTMLInputElement).value.trim() || "TapPlayer";
    store.user.nickname = v;
    store.save();
  });
  modal.body().querySelector("[data-gacha]")?.addEventListener("click", () => {
    modal.close();
    openGacha();
  });
  modal.body().querySelector("[data-mail]")?.addEventListener("click", () => {
    modal.close();
    openMailbox();
  });
  return modal;
}

export function openSettings(): Modal {
  let tab: "general" | "effect" | "video" | "info" = "general";
  const lang = () => store.settings.language;

  const sections = (): string => {
    const s = store.settings;
    if (tab === "general") {
      return `
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_language"))}</label>
          <div class="seg wrap">
            ${(["th", "en", "ja", "ko"] as Language[])
              .map(
                (l) =>
                  `<button class="seg-btn ${s.language === l ? "on" : ""}" data-lang="${l}">${languageLabel(l)}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_country"))}</label>
          <select class="select" data-country>
            ${COUNTRIES.map(
              (c) =>
                `<option value="${c.code}" ${s.countryCode === c.code ? "selected" : ""}>${c.flag} ${esc(c.name)}</option>`
            ).join("")}
          </select>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_apikey"))}</label>
          <input class="text-input" type="text" data-apikey value="${esc(s.youtubeApiKey)}" placeholder="${esc(tt("apikey_hint"))}" />
          <p class="hint">${esc(tt("apikey_help"))}</p>
        </div>
        <div class="set-row">
          <span>${icon("refresh", 16)} ${esc(tt("set_streaming"))}</span>
          <div class="seg">
            <button class="seg-btn ${s.streamingMode === "always" ? "on" : ""}" data-stream="always">${esc(tt("on"))}</button>
            <button class="seg-btn ${s.streamingMode === "wifi" ? "on" : ""}" data-stream="wifi">Wi-Fi</button>
          </div>
        </div>
        <div class="set-row">
          <span>${icon("grid", 16)} ${esc(tt("orientation_lock"))}</span>
          <div class="seg">
            <button class="seg-btn ${s.orientation === "portrait" ? "on" : ""}" data-orient="portrait">${esc(t(lang(), "mode_portrait"))}</button>
            <button class="seg-btn ${s.orientation === "landscape" ? "on" : ""}" data-orient="landscape">${esc(t(lang(), "mode_landscape"))}</button>
          </div>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(tt("playback_speed"))} — ${s.speed}</label>
          <div class="seg wrap">
            ${SPEEDS.map(
              (sp) =>
                `<button class="seg-btn xs ${s.speed === sp ? "on" : ""}" data-defspeed="${sp}">x${sp}</button>`
            ).join("")}
          </div>
        </div>
        <div class="set-row">
          <span>${icon("refresh", 16)} ${esc(tt("backup_title"))}</span>
          <div class="seg">
            <button class="seg-btn" data-export>${esc(tt("export_backup"))}</button>
            <button class="seg-btn" data-import>${esc(tt("import_backup"))}</button>
          </div>
        </div>
        <button class="btn danger wide-btn" data-reset>${icon("trash", 15)} ${esc(tt("reset"))}</button>
      `;
    }
    if (tab === "effect") {
      return `
        <div class="set-row">
          <span>${icon("rainbow", 16)} ${esc(t(lang(), "set_normalfx"))}</span>
          <button class="switch ${s.normalFx ? "on" : ""}" data-flag="normalFx"><i></i></button>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_gamefx"))} — ${s.gameFxVolume}%</label>
          <input class="range" type="range" min="0" max="100" value="${s.gameFxVolume}" data-range="gameFxVolume" />
        </div>
        <div class="set-group">
          <label class="set-label">${esc(tt("music_volume"))} — ${s.musicVolume}%</label>
          <input class="range" type="range" min="0" max="100" value="${s.musicVolume}" data-range="musicVolume" />
        </div>
        <div class="set-group">
          <label class="set-label">${esc(tt("video_volume"))} — ${s.videoVolume}%</label>
          <input class="range" type="range" min="0" max="100" value="${s.videoVolume}" data-range="videoVolume" />
          <p class="hint">${esc(tt("volume_hint"))}</p>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(tt("hitsound"))}</label>
          <div class="seg">
            ${[1, 2, 3, 4, 5]
              .map(
                (i) =>
                  `<button class="seg-btn ${s.touchSound === i ? "on" : ""}" data-sound="${i}">${i}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="set-row">
          <span>${icon("volume", 16)} ${esc(t(lang(), "set_touchvib"))}</span>
          <button class="switch ${s.touchVibration ? "on" : ""}" data-flag="touchVibration"><i></i></button>
        </div>
        <div class="set-row">
          <span>${icon("volume", 16)} ${esc(t(lang(), "set_missvib"))}</span>
          <button class="switch ${s.missVibration ? "on" : ""}" data-flag="missVibration"><i></i></button>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_notesync"))} — ${s.noteSyncMs > 0 ? "+" : ""}${s.noteSyncMs} ms</label>
          <input class="range" type="range" min="-500" max="500" step="10" value="${s.noteSyncMs}" data-range="noteSyncMs" />
          <div class="range-actions">
            <button class="btn tiny ghost" data-sync="-500">-500</button>
            <button class="btn tiny ghost" data-sync="0">0</button>
            <button class="btn tiny ghost" data-sync="500">+500</button>
          </div>
        </div>
      `;
    }
    if (tab === "video") {
      return `
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_videomode"))}</label>
          <div class="seg wrap">
            ${(["video", "image", "slideshow", "none"] as const)
              .map(
                (m) =>
                  `<button class="seg-btn ${s.videoBgMode === m ? "on" : ""}" data-bgmode="${m}">${esc(
                    t(lang(), m === "video" ? "set_videomode" : m === "slideshow" ? "slideshow" : m === "image" ? "select_bg_image" : "reset")
                  )}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_videoquality"))}</label>
          <div class="seg wrap">
            ${(["auto", "high", "middle", "low"] as const)
              .map(
                (q) =>
                  `<button class="seg-btn ${s.videoQuality === q ? "on" : ""}" data-quality="${q}">${esc(
                    q === "auto" ? "Auto" : q === "high" ? "720p" : q === "middle" ? "480p" : "360p"
                  )}</button>`
              )
              .join("")}
          </div>
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_videozoom"))} — ${s.videoZoom}%</label>
          <input class="range" type="range" min="50" max="100" value="${s.videoZoom}" data-range="videoZoom" />
        </div>
        <div class="set-group">
          <label class="set-label">${esc(t(lang(), "set_videobright"))} — ${s.videoBrightness}%</label>
          <input class="range" type="range" min="15" max="100" value="${s.videoBrightness}" data-range="videoBrightness" />
        </div>
      `;
    }
    return `
      <div class="info-block">
        <div class="info-logo">TapTube<em>REBORN</em></div>
        <p class="muted">${esc(tt("version"))} 1.6.5 (Reborn, No IAP)</p>
        <p class="info-text">${esc(tt("about_text")).replace(/\n/g, "<br/>")}</p>
      </div>
      <div class="info-block">
        <h4>${esc(tt("settings_info_help"))}</h4>
        <ol class="step-list">
          <li>${esc(tt("step1"))}</li>
          <li>${esc(tt("step2"))}</li>
          <li>${esc(tt("step3"))}</li>
        </ol>
        <p class="hint">${esc(tt("free_quota"))}</p>
      </div>
      <div class="info-block">
        <h4>${esc(tt("credits"))}</h4>
        <p class="hint">
          Clean-room reconstruction analyzed with REA (Reverse Engineer Anything).<br/>
          All gameplay formulas derived from the original binary; no original assets,
          code, or proprietary media were copied.<br/>
          YouTube playback via the official IFrame Player API.
        </p>
      </div>
    `;
  };

  const modal: Modal = new Modal(t(store.settings.language, "settings_title"), "", {
    wide: true,
    buttons: [{ label: tt("btn_close"), kind: "ghost" }],
  });

  const draw = () => {
    const root = modal.body();
    root.innerHTML = `
      <div class="seg settings-tabs">
        ${(
          [
            ["general", "settings_tab_general", "sliders"],
            ["effect", "settings_tab_effect", "volume"],
            ["video", "settings_tab_video", "video"],
            ["info", "settings_tab_info", "info"],
          ] as const
        )
          .map(
            ([id, key, ico]) =>
              `<button class="seg-btn ${tab === id ? "on" : ""}" data-stab="${id}">${icon(ico, 14)} ${esc(t(lang(), key))}</button>`
          )
          .join("")}
      </div>
      <div class="settings-body">${sections()}</div>
    `;
    wire();
  };

  const wire = () => {
    const root = modal.body();
    root.querySelectorAll<HTMLElement>("[data-stab]").forEach((b) =>
      b.addEventListener("click", () => {
        tab = b.dataset.stab as any;
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-lang]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ language: b.dataset.lang as Language });
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-defspeed]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ speed: Number(b.dataset.defspeed) as NoteSpeed });
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-orient]").forEach((b) =>
      b.addEventListener("click", () => {
        const o = b.dataset.orient as PlayOrientation;
        store.updateSettings({ orientation: o });
        window.TapTubeNative?.setOrientation?.(o);
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-stream]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ streamingMode: b.dataset.stream as any });
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-flag]").forEach((b) =>
      b.addEventListener("click", () => {
        const flag = b.dataset.flag as keyof GameSettings;
        store.updateSettings({ [flag]: !store.settings[flag] } as any);
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-sound]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ touchSound: Number(b.dataset.sound) as any });
        soundEngine.playTouchHit({ ...store.settings, touchVibration: false });
        draw();
      })
    );
    root.querySelectorAll<HTMLInputElement>("[data-range]").forEach((r) =>
      r.addEventListener("change", () => {
        store.updateSettings({ [r.dataset.range!]: Number(r.value) } as any);
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-sync]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ noteSyncMs: Number(b.dataset.sync) });
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-bgmode]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ videoBgMode: b.dataset.bgmode as any });
        draw();
      })
    );
    root.querySelectorAll<HTMLElement>("[data-quality]").forEach((b) =>
      b.addEventListener("click", () => {
        store.updateSettings({ videoQuality: b.dataset.quality as any });
        draw();
      })
    );
    const select = root.querySelector<HTMLSelectElement>("[data-country]");
    select?.addEventListener("change", () => {
      store.updateSettings({ countryCode: select.value });
    });
    const apiKey = root.querySelector<HTMLInputElement>("[data-apikey]");
    apiKey?.addEventListener("change", () => {
      store.updateSettings({ youtubeApiKey: apiKey.value.trim() });
      toast(tt("saved_ok"), "ok");
    });
    root.querySelector("[data-export]")?.addEventListener("click", () => {
      const blob = new Blob([store.exportBackupJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taptube-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    });
    root.querySelector("[data-import]")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        if (store.importBackupJson(text)) {
          toast(tt("backup_ok"), "ok");
          draw();
        } else {
          toast(tt("backup_fail"), "warn");
        }
      });
      input.click();
    });
    root.querySelector("[data-reset]")?.addEventListener("click", async () => {
      if (await confirmDialog(tt("reset"), tt("confirm_reset"))) {
        localStorage.clear();
        location.reload();
      }
    });
  };

  draw();
  return modal;
}

function gradeRank(g: string): number {
  return ["F", "D", "C", "B", "A", "S", "SS", "SSS"].indexOf(g);
}

export function openReplayPicker(
  replays: { id: string; videoTitle: string; score: number; grade: string; videoThumbnail: string }[],
  onPick: (id: string) => void
): Modal {
  const modal = new Modal(t(store.settings.language, "btn_replay"), `
    <div class="replay-list">
      ${replays
        .map(
          (r) => `
        <button class="replay-row" data-pick="${esc(r.id)}">
          <img src="${esc(r.videoThumbnail)}" alt="" />
          <span class="rr-main"><b>${esc(r.videoTitle.slice(0, 44))}</b><em>${fmtInt(r.score)}</em></span>
          <span class="grade grade-${r.grade.toLowerCase()}">${r.grade}</span>
        </button>`
        )
        .join("")}
    </div>
  `, { buttons: [{ label: tt("btn_close"), kind: "ghost" }] });
  modal.body().querySelectorAll<HTMLElement>("[data-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      onPick(b.dataset.pick!);
      modal.close();
    })
  );
  return modal;
}

export function openShareSheet(song: YtItem, scoreText: string): void {
  const text = `🎵 ${song.title} — ${scoreText} | TapTube Reborn`;
  if (window.TapTubeNative?.shareText) {
    window.TapTubeNative.shareText("TapTube Reborn", text);
    toast(tt("sharing"), "ok");
    return;
  }
  if (navigator.share) {
    navigator.share({ title: "TapTube Reborn", text }).catch(() => undefined);
    return;
  }
  navigator.clipboard?.writeText(text).then(
    () => toast(tt("sharing"), "ok"),
    () => undefined
  );
  void t2;
  void fmtTime;
}
