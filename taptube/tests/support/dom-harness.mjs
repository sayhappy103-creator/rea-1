/**
 * Minimal DOM harness for the TapTube screens.
 *
 * jsdom is intentionally *not* a dependency of the app: this harness is an
 * optional dev tool. When `jsdom` is not installed the UI suite skips itself
 * instead of failing, so `npm test` stays green in a bare checkout.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export async function loadJsdom() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}

/** Fake 2D context: every drawing call is a no-op. */
function context2d() {
  return new Proxy(
    {
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      getImageData: () => ({ data: [] }),
    },
    {
      get: (target, prop) => (prop in target ? target[prop] : () => {}),
      set: (target, prop, value) => {
        target[prop] = value;
        return true;
      },
    },
  );
}

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.playbackRate = new FakeParam(1);
    this.frequency = new FakeParam(0);
    this.detune = new FakeParam(0);
    this.buffer = null;
  }
  connect(node) {
    return node;
  }
  disconnect() {}
  start() {}
  stop() {}
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
  }
  getChannelData(index) {
    return this.channels[index];
  }
}

class FakeContext {
  constructor() {
    this.sampleRate = 44100;
    // A real-time clock: the game loop reads chartPosition from it, so a frozen
    // clock would freeze the playfield.
    this.startedAt = Date.now();
    this.state = "running";
    this.destination = new FakeNode();
  }
  get currentTime() {
    return (Date.now() - this.startedAt) / 1000;
  }
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createConvolver() {
    return new FakeNode();
  }
  createDynamicsCompressor() {
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createBuffer(channels, length, sampleRate) {
    return new FakeBuffer(channels, length, sampleRate);
  }
  async resume() {}
  async close() {}
  async decodeAudioData() {
    const rate = 44100;
    const buffer = new FakeBuffer(1, rate * 4, rate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.sin((2 * Math.PI * 220 * index) / rate) * 0.3;
    }
    return buffer;
  }
}

/** Renders a click track at 128 BPM so the analyzer has something to find. */
class FakeOfflineContext extends FakeContext {
  async startRendering() {
    const rate = this.sampleRate;
    const buffer = new FakeBuffer(1, Math.round(rate * 24), rate);
    const data = buffer.getChannelData(0);
    const step = Math.round((60 / 128) * rate);
    const clickLength = Math.round(0.02 * rate);
    for (let start = 0; start < data.length; start += step) {
      for (
        let offset = 0;
        offset < clickLength && start + offset < data.length;
        offset += 1
      ) {
        const t = offset / rate;
        const taper =
          0.5 - 0.5 * Math.cos((2 * Math.PI * offset) / clickLength);
        data[start + offset] +=
          Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60) * 0.8 * taper;
      }
    }
    for (let index = 0; index < data.length; index += 1) {
      data[index] += Math.sin((2 * Math.PI * 110 * index) / rate) * 0.05;
    }
    return buffer;
  }
}

/** Rewrites the app's ES modules into a CommonJS-ish graph for jsdom. */
function makeLoader(window) {
  const modules = new Map();

  const resolve = (spec, directory) => {
    if (!spec.startsWith(".")) throw new Error(`bare import ${spec}`);
    const base = new URL(spec, `file://${ROOT}${directory}/`).pathname;
    return base.endsWith(".js") ? base : `${base}.js`;
  };

  async function load(absolutePath) {
    if (modules.has(absolutePath)) return modules.get(absolutePath);
    const code = readFileSync(absolutePath, "utf8");
    const relative = absolutePath.slice(ROOT.length);
    const directory = relative.includes("/")
      ? relative.slice(0, relative.lastIndexOf("/"))
      : ".";

    let importIndex = 0;
    const rewritten = code
      .replace(
        /^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";?$/gm,
        (_, names, spec) =>
          `const __m${importIndex++} = await __require(${JSON.stringify(spec)}); const {${names}} = __m${importIndex - 1};`,
      )
      .replace(/^import\s+\w+\s+from\s+"[^"]+";?$/gm, "")
      .replace(/^export\s+\{[\s\S]*?\};?$/gm, "")
      .replace(/^export\s+(async\s+function|function|class)\s+/gm, "$1 ")
      .replace(/^export\s+(const|let|var)\s+/gm, "var ")
      .replace(/^export\s+default\s+/gm, "");

    const exported = [];
    for (const match of code.matchAll(
      /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm,
    )) {
      exported.push(match[1]);
    }
    for (const match of code.matchAll(/^export\s+\{([\s\S]*?)\};?$/gm)) {
      for (const name of match[1].split(",")) {
        const trimmed = name
          .trim()
          .split(/\s+as\s+/u)
          .pop()
          ?.trim();
        if (trimmed) exported.push(trimmed);
      }
    }
    const unique = [...new Set(exported)];

    const factory = new window.Function(
      "__require",
      `return (async () => { ${rewritten}\n; return { ${unique.join(", ")} }; })();`,
    );
    const result = await factory((spec) => load(resolve(spec, directory)));
    modules.set(absolutePath, result);
    return result;
  }

  return load;
}

/** Boot the real app inside jsdom and return the tooling the tests need. */
export async function openApp(jsdom) {
  const errors = [];
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  virtualConsole.on("error", (...args) => errors.push(args.join(" ")));

  const dom = new jsdom.JSDOM(readFileSync(`${ROOT}index.html`, "utf8"), {
    url: "http://localhost:5173/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  const ctx = context2d();
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
    get: () => 720,
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
    get: () => 960,
    configurable: true,
  });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 720,
    height: 960,
    right: 720,
    bottom: 960,
    x: 0,
    y: 0,
    toJSON() {},
  });
  window.HTMLElement.prototype.setPointerCapture = () => {};
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.scrollTo = () => {};
  window.localStorage.clear();
  window.AudioContext = FakeContext;
  window.webkitAudioContext = FakeContext;
  window.OfflineAudioContext = FakeOfflineContext;
  window.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { ok: true, items: [], title: "Stub song", duration: 200 };
    },
  });

  const load = makeLoader(window);
  const app = await load(`${ROOT}src/main.js`);
  const tick = (ms = 140) => new Promise((resolve) => setTimeout(resolve, ms));
  await tick(320);

  return {
    app,
    doc: window.document,
    window,
    errors,
    load,
    tick,
    module: (path) => load(`${ROOT}${path}`),
    close: () => window.close(),
  };
}
