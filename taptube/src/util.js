/** Small shared helpers: DOM building, formatting, math, ids, events. */

export const clamp = (value, min, max) =>
  value < min ? min : value > max ? max : value;

export const lerp = (a, b, amount) => a + (b - a) * amount;

export const easeOutCubic = (x) => 1 - (1 - x) ** 3;

/** Deterministic-ish unique id that is also safe in CSS selectors. */
export function uid(prefix = "id") {
  const random =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape untrusted text (YouTube titles, filenames) before templating. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** `el("div", { class: "x" }, "text", childNode)` */
export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "object")
      Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "html") node.innerHTML = value;
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

/** Replace a host element's contents in one paint. */
export function render(host, ...children) {
  host.replaceChildren(...children.flat().filter(Boolean));
  return host;
}

export function formatNumber(value, digits = 0) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Score display: grouped digits, padded to 7 like the original app. */
export function formatScore(value) {
  return Math.round(Math.max(0, value ?? 0)).toLocaleString("en-US");
}

export function formatTime(seconds, withHours = false) {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (hours > 0 || withHours) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}`;
}

export function formatPercent(value, digits = 2) {
  return `${(clamp(value, 0, 1) * 100).toFixed(digits)}%`;
}

export function debounce(fn, wait) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Yield to the browser so long analyses keep the UI responsive. */
export const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Median of a numeric array (does not mutate the input). */
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp((p / 100) * (sorted.length - 1), 0, sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return lerp(sorted[low], sorted[high], index - low);
}

/** Stable hash for cache keys (string → hex). */
export function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
