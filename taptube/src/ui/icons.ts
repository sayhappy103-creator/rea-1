const SVG: Record<string, string> = {
  search:
    '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.4l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.4 2.2"/>',
  note: '<path d="M9 18.2a2.6 2.6 0 1 1-2.6-2.6c.4 0 .8.1 1.1.2V5.4l8.6-1.8v9.6"/><circle cx="13.5" cy="16.4" r="2.6"/>',
  trophy:
    '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.6v1.2A3.4 3.4 0 0 0 8 10.1M17 5.5h2.4v1.2A3.4 3.4 0 0 1 16 10.1"/><path d="M12 13v3.4M9 20h6l-.6-3.6H9.6z"/>',
  flame:
    '<path d="M12 3s4.6 3.7 4.6 8.1A4.6 4.6 0 0 1 12 15.7a4.6 4.6 0 0 1-4.6-4.6C7.4 6.7 12 3 12 3z"/><path d="M9.4 20.4h5.2"/>',
  coin: '<circle cx="12" cy="12" r="8.2"/><path d="M12 8.2v7.6M9.8 10h4.4M9.8 14h4.4"/>',
  ruby: '<path d="M12 3.4l6.4 4.1-2.2 9.3-4.2 3.8-4.2-3.8L5.6 7.5z"/>',
  disc: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.4"/>',
  ticket:
    '<path d="M3.6 9.2V6.8h16.8v2.4a2.6 2.6 0 0 0 0 5.2v2.4H3.6v-2.4a2.6 2.6 0 0 0 0-5.2z"/><path d="M12 7.4v9.2"/>',
  settings:
    '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.2v2.2M12 18.6v2.2M4.8 12H2.6M21.4 12h-2.2M6.9 6.9L5.3 5.3M18.7 18.7l-1.6-1.6M17.1 6.9l1.6-1.6M5.3 18.7l1.6-1.6"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.8 20.2c.7-3.6 3.7-5.6 7.2-5.6s6.5 2 7.2 5.6"/>',
  mail: '<rect x="3.6" y="5.6" width="16.8" height="12.8" rx="2"/><path d="M4.2 6.6L12 12.6l7.8-6"/>',
  gift: '<rect x="3.6" y="9.6" width="16.8" height="10.2" rx="1.8"/><path d="M2.8 6.4h18.4v3.2H2.8zM12 6.4v13.4"/><path d="M12 6.4S9.4 2.8 7.4 4.4 9.2 6.4 12 6.4zM12 6.4s2.6-3.6 4.6-2 1.8 2 0 2z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M8 4.8l11 7.2-11 7.2z"/>',
  pause: '<rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1"/>',
  back: '<path d="M14.4 5.6L8 12l6.4 6.4"/>',
  share:
    '<circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="M8.8 10.7l6.4-3.4M8.8 13.3l6.4 3.4"/>',
  edit: '<path d="M4.4 19.6l.9-4.2L15.6 5.1l3.3 3.3L8.6 18.7z"/><path d="M14.2 6.5l3.3 3.3"/>',
  heart:
    '<path d="M12 20s-7.4-4.6-7.4-9.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.4 3C19.4 15.4 12 20 12 20z"/>',
  plus: '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  trash: '<path d="M5.6 7.4h12.8M9.4 7.4V5.2h5.2v2.2M7 7.4l.9 12.2h8.2L17 7.4"/>',
  check: '<path d="M5 12.8l4.6 4.4L19 6.8"/>',
  youtube:
    '<rect x="2.6" y="6" width="18.8" height="12" rx="3.4"/><path d="M10.4 9.6l5 2.4-5 2.4z"/>',
  refresh:
    '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.2V10h-5.6"/>',
  volume: '<path d="M4 9.4h3.2L12 5.6v12.8L7.2 14.6H4z"/><path d="M15.6 9a4.2 4.2 0 0 1 0 6"/>',
  video: '<rect x="2.8" y="6" width="12.4" height="12" rx="2"/><path d="M15.2 10.6l6-3.2v9.2l-6-3.2z"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 10.6v6M12 7.6v.4"/>',
  lock: '<rect x="5" y="10.6" width="14" height="9.4" rx="2"/><path d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6"/>',
  sliders:
    '<path d="M5 7.4h14M5 12h14M5 16.6h14"/><circle cx="9" cy="7.4" r="1.9"/><circle cx="15" cy="12" r="1.9"/><circle cx="8" cy="16.6" r="1.9"/>',
  grid: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.4"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.4"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.4"/>',
  rainbow:
    '<path d="M3.4 18a8.6 8.6 0 0 1 17.2 0"/><path d="M6.8 18a5.2 5.2 0 0 1 10.4 0"/><path d="M10.2 18a1.8 1.8 0 0 1 3.6 0"/>',
};

export function icon(name: keyof typeof SVG | string, size = 20): string {
  const body = SVG[name] ?? SVG.info;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
