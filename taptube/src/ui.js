/** Shared view fragments: song cards, rows, empty states, skeletons. */

import { ICONS, mountIcons } from "./icons.js";
import { escapeHtml, el, formatNumber, formatTime } from "./util.js";

/** Placeholder artwork for local files and demo tracks. */
export function artworkFor(song, { variant = "card" } = {}) {
  if (song.thumbnail) {
    return el("img", {
      src: song.thumbnail,
      alt: "",
      loading: "lazy",
      decoding: "async",
      referrerpolicy: "no-referrer",
    });
  }
  const hue = Math.abs(hashHue(song.title ?? song.id ?? ""));
  const node = el("div", {
    class: `art-fallback art-fallback--${variant}`,
    style: {
      background: `radial-gradient(120% 120% at 20% 10%, hsl(${hue} 85% 62% / 0.55), transparent 60%), linear-gradient(160deg, hsl(${(hue + 40) % 360} 70% 30%), #100d21)`,
    },
    "aria-hidden": "true",
  });
  node.append(
    el("span", {
      class: "art-fallback__icon",
      html: song.kind === "local" ? ICONS.folder : ICONS.music,
    }),
    el(
      "span",
      { class: "art-fallback__label" },
      (song.title ?? "").slice(0, 22),
    ),
  );
  return node;
}

function hashHue(text) {
  let hash = 0;
  for (const char of String(text))
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

/**
 * @param {object} song
 * @param {{onPlay?:Function, rank?:string, duration?:number, difficulty?:string}} options
 */
export function songCard(song, options = {}) {
  const { onPlay, rank, duration, difficulty } = options;
  const art = el("div", { class: "song-card__art" });
  art.append(artworkFor(song));
  if (duration && duration > 0) {
    art.append(
      el("span", { class: "song-card__dur mono" }, formatTime(duration)),
    );
  }
  if (rank) {
    art.append(
      el("span", { class: "song-card__rank", style: rankColor(rank) }, rank),
    );
  }
  art.append(el("span", { class: "song-card__play", html: ICONS.play }));

  const card = el(
    "button",
    {
      type: "button",
      class: "song-card",
      "aria-label": `${song.title} — ${song.channel || ""}`,
      onclick: () => onPlay?.(song),
    },
    art,
    el(
      "div",
      { class: "song-card__body" },
      el("span", { class: "song-card__title" }, song.title),
      el(
        "span",
        { class: "song-card__sub" },
        [difficulty, song.channel].filter(Boolean).join(" · ") || "TapTube",
      ),
    ),
  );
  return card;
}

/** Horizontal row used by search results, history and local files. */
export function songRow(song, options = {}) {
  const { onPlay, onDelete, meta, trailing, rank } = options;
  const thumb = el("div", { class: "rowitem__thumb-wrap" });
  thumb.append(artworkFor(song, { variant: "row" }));

  const side = el("div", { class: "rowitem__side" });
  if (rank)
    side.append(el("span", { class: "chip", style: rankColor(rank) }, rank));
  if (trailing) side.append(trailing);
  if (onDelete) {
    side.append(
      el("button", {
        type: "button",
        class: "btn btn--icon btn--sm btn--ghost",
        "aria-label": "Delete",
        html: ICONS.trash,
        onclick: (event) => {
          event.stopPropagation();
          onDelete(song);
        },
      }),
    );
  }
  side.append(
    el("button", {
      type: "button",
      class: "btn btn--icon btn--sm btn--teal",
      "aria-label": `Play ${song.title}`,
      html: ICONS.play,
      onclick: (event) => {
        event.stopPropagation();
        onPlay?.(song);
      },
    }),
  );

  return el(
    "div",
    { class: "rowitem" },
    thumb,
    el(
      "div",
      { class: "rowitem__main" },
      el("span", { class: "rowitem__title" }, song.title),
      el("span", { class: "rowitem__sub" }, meta ?? song.channel ?? ""),
    ),
    side,
  );
}

export function rankColor(rank) {
  const colors = {
    S: "#ffe680",
    A: "#8ff7e4",
    B: "#b6a1ff",
    C: "#ffb27d",
    D: "#ff8fa3",
  };
  return { color: colors[rank] ?? "var(--text)" };
}

export function emptyState({ icon = "music", title, body }) {
  const node = el("div", { class: "empty" });
  node.append(
    el("span", { html: ICONS[icon] ?? ICONS.music }),
    el("strong", {}, title),
  );
  if (body) node.append(el("span", { class: "hint" }, body));
  return node;
}

export function skeletonCards(count = 6) {
  const grid = el("div", { class: "song-grid" });
  for (let index = 0; index < count; index += 1) {
    grid.append(
      el(
        "div",
        { class: "song-card" },
        el("div", { class: "skeleton", style: { aspectRatio: "16/9" } }),
        el("div", {
          class: "skeleton",
          style: { height: "30px", margin: "10px" },
        }),
      ),
    );
  }
  return grid;
}

export function sectionHead(title, subtitle, action) {
  const head = el("div", { class: "section-head" }, el("h2", {}, title));
  if (subtitle) head.append(el("span", {}, subtitle));
  if (action) {
    action.classList.add("section-head__action");
    head.append(action);
  }
  return head;
}

export function statTile(label, value) {
  return el(
    "div",
    { class: "stat" },
    el("span", {}, label),
    el("strong", {}, String(value)),
  );
}

export function badged(value, level) {
  return el("span", { class: `chip${level ? ` chip--${level}` : ""}` }, value);
}

export function viewsLabel(count) {
  if (!count) return "";
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M views`;
  if (count >= 1e3) return `${formatNumber(count / 1e3, 1)}K views`;
  return `${formatNumber(count)} views`;
}

export { mountIcons, escapeHtml };
