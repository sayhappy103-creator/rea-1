/** Inline SVG icons (stroke-based, currentColor) — no icon font, no network. */

const wrap = (paths, viewBox = "0 0 24 24") =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  play: wrap(
    '<path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none"/>',
  ),
  pause: wrap('<path d="M9 5v14M15 5v14" stroke-width="2.4"/>'),
  home: wrap(
    '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  ),
  library: wrap(
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M12 4h3.5A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12z"/><path d="M19.5 5.2 21 18"/>',
  ),
  settings: wrap(
    '<circle cx="12" cy="12" r="3.2"/><path d="M4.5 13.5a7.6 7.6 0 0 1 0-3l-1.7-1.3 1.9-3.2 2 .8a7.5 7.5 0 0 1 2.6-1.5l.3-2.1h3.8l.3 2.1a7.5 7.5 0 0 1 2.6 1.5l2-.8 1.9 3.2-1.7 1.3a7.6 7.6 0 0 1 0 3l1.7 1.3-1.9 3.2-2-.8a7.5 7.5 0 0 1-2.6 1.5l-.3 2.1h-3.8l-.3-2.1a7.5 7.5 0 0 1-2.6-1.5l-2 .8-1.9-3.2z"/>',
  ),
  search: wrap('<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  close: wrap('<path d="M6 6l12 12M18 6 6 18"/>'),
  note: wrap(
    '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor" stroke="none"/>',
  ),
  edit: wrap(
    '<path d="M4 20h4l10-10a2.6 2.6 0 0 0-3.7-3.7L4.3 16.3z"/><path d="M13.5 7.5 16.5 10.5"/>',
  ),
  folder: wrap(
    '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h6.5A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-12A1.5 1.5 0 0 1 4 17.5z"/>',
  ),
  sparkle: wrap(
    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  ),
  bolt: wrap('<path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z"/>'),
  star: wrap(
    '<path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.9l6.1-.8z"/>',
  ),
  trash: wrap(
    '<path d="M4.5 7h15M9.5 7V5h5v2M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4A1.5 1.5 0 0 0 16.2 19L17 7"/>',
  ),
  download: wrap(
    '<path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M4.5 18.5h15"/>',
  ),
  upload: wrap('<path d="M12 20V9m0 0 4 4m-4-4-4 4"/><path d="M4.5 5.5h15"/>'),
  share: wrap(
    '<path d="M8.5 13.5 15 17M15 7 8.5 10.5"/><circle cx="6" cy="12" r="2.2"/><circle cx="17.5" cy="5.5" r="2.2"/><circle cx="17.5" cy="18.5" r="2.2"/>',
  ),
  refresh: wrap('<path d="M20 11.5A8 8 0 1 0 17 17"/><path d="M20 5v6h-6"/>'),
  volume: wrap(
    '<path d="M5 10v4h3l4 3V7L8 10z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  volumeOff: wrap(
    '<path d="M5 10v4h3l4 3V7L8 10z"/><path d="m15 10 4 4m0-4-4 4"/>',
  ),
  vibrate: wrap(
    '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 9v6M20 9v6"/>',
  ),
  gamepad: wrap(
    '<rect x="2.5" y="8" width="19" height="9" rx="4.5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="12" r="1" fill="currentColor"/><circle cx="18.5" cy="14" r="1" fill="currentColor"/>',
  ),
  timer: wrap(
    '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.8M9.5 3h5"/>',
  ),
  gauge: wrap('<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 13 4-4"/>'),
  youtube: wrap(
    '<rect x="2.5" y="6" width="19" height="12" rx="4"/><path d="m10.5 9.5 5 2.5-5 2.5z" fill="currentColor" stroke="none"/>',
  ),
  globe: wrap(
    '<circle cx="12" cy="12" r="8"/><path d="M4.5 10h15M4.5 14h15M12 4a14 14 0 0 1 0 16 14 14 0 0 1 0-16z"/>',
  ),
  wifi: wrap(
    '<path d="M5 12.5a10 10 0 0 1 14 0M7.5 15.5a6.5 6.5 0 0 1 9 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/>',
  ),
  info: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 11v5.5M12 8h.01"/>'),
  check: wrap('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  chart: wrap(
    '<path d="M4 19V5M4 19h16"/><path d="M8 15v-4M12.5 15V8M17 15v-6"/>',
  ),
  keyboard: wrap(
    '<rect x="2.5" y="7" width="19" height="10" rx="2.4"/><path d="M6.5 10.5h.01M10 10.5h.01M13.5 10.5h.01M17 10.5h.01M8 14h8"/>',
  ),
  expand: wrap(
    '<path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"/>',
  ),
  clock: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>'),
  music: wrap(
    '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="16" r="2.6" fill="currentColor" stroke="none"/>',
  ),
  headphone: wrap(
    '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3" y="14" width="4" height="6" rx="2"/><rect x="17" y="14" width="4" height="6" rx="2"/>',
  ),
  spark: wrap(
    '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/>',
  ),
};

/** Hydrate every `[data-icon]` placeholder inside `root`. */
export function mountIcons(root = document) {
  for (const node of root.querySelectorAll("[data-icon]")) {
    const name = node.getAttribute("data-icon");
    if (name && ICONS[name] && node.childElementCount === 0) {
      node.innerHTML = ICONS[name];
    }
  }
}
