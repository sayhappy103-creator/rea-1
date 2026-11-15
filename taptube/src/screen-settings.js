/** Settings screen: language, gameplay, audio, network, data. */

import { ICONS } from "./icons.js";
import { LANGUAGES, getLanguage, setLanguage, t } from "./i18n.js";
import {
  LANE_OPTIONS,
  OFFSET_LIMIT,
  SPEED_OPTIONS,
  getSettings,
  resetAll,
  resetScoresAndHistory,
  storeLanguage,
  updateSettings,
} from "./store.js";
import { confirmDialog, toast } from "./toast.js";
import { clamp, el } from "./util.js";

export function renderSettings(context, host) {
  const settings = getSettings();

  /* ------------------------------------------------------------- language */
  const languagePicker = el("div", { class: "segmented" });
  for (const language of LANGUAGES) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(language.id === getLanguage()),
        onclick: () => {
          setLanguage(language.id);
          storeLanguage(language.id);
          updateSettings({ language: language.id });
          for (const sibling of languagePicker.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
          context.rerender();
        },
      },
      language.label,
    );
    languagePicker.append(button);
  }

  const languagePanel = panel(
    "globe",
    t("settings.language"),
    t("settings.languageSub"),
    [
      optionRow(
        t("settings.language"),
        t("settings.languageSub"),
        languagePicker,
      ),
    ],
  );

  /* ------------------------------------------------------------- gameplay */
  const lanePicker = el("div", { class: "segmented" });
  for (const count of LANE_OPTIONS) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(count === settings.lanes),
        onclick: () => {
          updateSettings({ lanes: count });
          for (const sibling of lanePicker.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
        },
      },
      `${count}`,
    );
    lanePicker.append(button);
  }

  const speedPicker = el("div", { class: "segmented" });
  for (const speed of SPEED_OPTIONS) {
    const button = el(
      "button",
      {
        type: "button",
        "aria-pressed": String(speed === settings.speed),
        onclick: () => {
          updateSettings({ speed });
          for (const sibling of speedPicker.children)
            sibling.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-pressed", "true");
        },
      },
      `${speed}×`,
    );
    speedPicker.append(button);
  }

  const offsetValue = el(
    "strong",
    { class: "mono" },
    `${settings.offsetMs} ms`,
  );
  const offsetSlider = el("input", {
    type: "range",
    min: String(-OFFSET_LIMIT),
    max: String(OFFSET_LIMIT),
    step: "5",
    value: String(settings.offsetMs),
    "aria-label": t("settings.offset"),
    oninput: (event) => {
      const value = clamp(
        Math.round(Number(event.target.value)),
        -OFFSET_LIMIT,
        OFFSET_LIMIT,
      );
      offsetValue.textContent = `${value} ms`;
      updateSettings({ offsetMs: value });
    },
  });

  const gameplayPanel = panel("gamepad", t("settings.gameplay"), null, [
    optionRow(t("settings.lanes"), null, lanePicker),
    optionRow(t("settings.speed"), null, speedPicker),
    el(
      "div",
      { class: "range" },
      el(
        "div",
        { class: "range__head" },
        el("span", {}, t("settings.offset")),
        offsetValue,
      ),
      el(
        "p",
        { class: "option__text" },
        el("small", {}, t("settings.offsetSub")),
      ),
      offsetSlider,
    ),
    switchRow(t("settings.autoplay"), null, settings.autoplay, (value) =>
      updateSettings({ autoplay: value }),
    ),
    switchRow(t("settings.mirror"), null, settings.mirror, (value) =>
      updateSettings({ mirror: value }),
    ),
    switchRow(t("settings.showJudge"), null, settings.showJudgment, (value) =>
      updateSettings({ showJudgment: value }),
    ),
  ]);

  /* ---------------------------------------------------------------- audio */
  const volumeSlider = el("input", {
    type: "range",
    min: "0",
    max: "100",
    step: "5",
    value: String(Math.round(settings.audioVolume * 100)),
    oninput: (event) =>
      updateSettings({ audioVolume: Number(event.target.value) / 100 }),
  });
  const dimSlider = el("input", {
    type: "range",
    min: "0",
    max: "90",
    step: "5",
    value: String(Math.round(settings.backgroundDim * 100)),
    oninput: (event) =>
      updateSettings({ backgroundDim: Number(event.target.value) / 100 }),
  });

  const audioPanel = panel("volume", t("settings.audio"), null, [
    switchRow(t("settings.hitSfx"), null, settings.hitSfx, (value) =>
      updateSettings({ hitSfx: value }),
    ),
    switchRow(t("settings.vibrate"), null, settings.vibrate, (value) =>
      updateSettings({ vibrate: value }),
    ),
    el(
      "div",
      { class: "range" },
      el(
        "div",
        { class: "range__head" },
        el("span", {}, t("settings.audio")),
        el(
          "strong",
          { class: "mono" },
          `${Math.round(settings.audioVolume * 100)}%`,
        ),
      ),
      volumeSlider,
    ),
    el(
      "div",
      { class: "range" },
      el(
        "div",
        { class: "range__head" },
        el("span", {}, t("settings.backgroundDim")),
        el(
          "strong",
          { class: "mono" },
          `${Math.round(settings.backgroundDim * 100)}%`,
        ),
      ),
      dimSlider,
    ),
  ]);

  /* -------------------------------------------------------------- network */
  const proxyInput = el("input", {
    class: "input",
    type: "url",
    inputmode: "url",
    placeholder: "http://localhost:5173",
    value: settings.proxyUrl,
    onchange: (event) => {
      const value = event.target.value.trim().replace(/\/+$/, "");
      if (value !== "" && !/^https?:\/\//i.test(value)) {
        toast(t("settings.proxyInvalid"), "error");
        return;
      }
      updateSettings({ proxyUrl: value });
    },
  });
  const apiKeyInput = el("input", {
    class: "input",
    type: "password",
    autocomplete: "off",
    placeholder: t("common.optional"),
    value: settings.apiKey,
    onchange: (event) => updateSettings({ apiKey: event.target.value.trim() }),
  });
  const proxyStatus = el("span", { class: "hint" });

  const testButton = el(
    "button",
    {
      type: "button",
      class: "btn btn--sm",
      onclick: async () => {
        proxyStatus.textContent = t("common.loading");
        try {
          const base = (settings.proxyUrl || "").replace(/\/+$/, "");
          if (base === "") {
            proxyStatus.textContent = `${t("settings.proxyFail")} (${t("common.none")})`;
            return;
          }
          const response = await fetch(`${base}/api/health`);
          if (!response.ok) throw new Error("bad status");
          const data = await response.json();
          proxyStatus.textContent = `${t("settings.proxyOk")} · ${data.provider ?? "proxy"}`;
        } catch {
          proxyStatus.textContent = t("settings.proxyFail");
        }
      },
    },
    el("span", { html: ICONS.wifi }),
    t("settings.testProxy"),
  );

  const networkPanel = panel("globe", t("settings.network"), null, [
    el(
      "div",
      { class: "field" },
      el("span", { class: "field__label" }, t("settings.proxy")),
      proxyInput,
      el("small", { class: "hint" }, t("settings.proxySub")),
    ),
    el(
      "div",
      { class: "field" },
      el("span", { class: "field__label" }, t("settings.apiKey")),
      apiKeyInput,
      el("small", { class: "hint" }, t("settings.apiKeySub")),
    ),
    el(
      "div",
      {
        style: {
          display: "flex",
          gap: "10px",
          alignItems: "center",
          flexWrap: "wrap",
        },
      },
      testButton,
      proxyStatus,
    ),
  ]);

  /* ----------------------------------------------------------------- data */
  const dataPanel = panel("trash", t("settings.data"), null, [
    el(
      "div",
      { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
      el(
        "button",
        {
          type: "button",
          class: "btn btn--ghost btn--sm",
          onclick: async () => {
            const ok = await confirmDialog({
              title: t("settings.resetScores"),
              message: t("settings.resetConfirm"),
              confirmLabel: t("common.confirm"),
              cancelLabel: t("common.cancel"),
            });
            if (!ok) return;
            resetScoresAndHistory();
            toast(t("settings.resetScores"), "success");
          },
        },
        t("settings.resetScores"),
      ),
      el(
        "button",
        {
          type: "button",
          class: "btn btn--danger btn--sm",
          onclick: async () => {
            const ok = await confirmDialog({
              title: t("settings.resetAll"),
              message: t("settings.resetAllConfirm"),
              confirmLabel: t("common.confirm"),
              cancelLabel: t("common.cancel"),
            });
            if (!ok) return;
            resetAll();
            setLanguage(getSettings().language);
            toast(t("settings.resetAll"), "success");
            context.rerender();
          },
        },
        t("settings.resetAll"),
      ),
    ),
  ]);

  const aboutPanel = panel("info", t("settings.about"), null, [
    el("p", { class: "hint" }, t("settings.aboutBody")),
    el("p", { class: "hint" }, t("settings.credits")),
    el(
      "div",
      { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      el("span", { class: "chip" }, "v1.6.5-web"),
      el("span", { class: "chip" }, "PWA"),
      el("span", { class: "chip" }, "local-first"),
    ),
  ]);

  host.replaceChildren(
    el(
      "h1",
      { style: { fontSize: "22px", marginBottom: "14px" } },
      t("settings.title"),
    ),
    el(
      "div",
      { class: "settings" },
      languagePanel,
      gameplayPanel,
      audioPanel,
      networkPanel,
      dataPanel,
      aboutPanel,
    ),
  );

  return { destroy: () => {} };
}

function panel(icon, title, subtitle, children) {
  const node = el(
    "section",
    { class: "panel" },
    el("h2", {}, el("span", { html: ICONS[icon] }), title),
  );
  if (subtitle) node.append(el("p", { class: "panel__sub" }, subtitle));
  node.append(...children);
  return node;
}

function optionRow(label, description, control) {
  return el(
    "div",
    { class: "option" },
    el(
      "span",
      { class: "option__text" },
      el("strong", {}, label),
      description ? el("small", {}, description) : null,
    ),
    control,
  );
}

function switchRow(label, description, checked, onChange) {
  const button = el("button", {
    type: "button",
    class: "switch",
    role: "switch",
    "aria-checked": String(checked),
    "aria-label": label,
    onclick: () => {
      const next = button.getAttribute("aria-checked") !== "true";
      button.setAttribute("aria-checked", String(next));
      onChange(next);
    },
  });
  return optionRow(label, description, button);
}
