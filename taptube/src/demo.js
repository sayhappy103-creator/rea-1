/**
 * Offline demo track: a synthesized 128 BPM pop loop rendered to a REAL audio
 * buffer, so the demo exercises the same decode → analyse → chart path as a
 * user file. No binary assets and no network.
 */

export const DEMO_SONG_ID = "demo:neon-pulse";
export const DEMO_BPM = 128;

const SCALE = [0, 3, 5, 7, 10, 12, 15, 19];
const CHORDS = [
  [0, 4, 7],
  [0, 3, 7],
  [-2, 3, 7],
  [-4, 0, 3],
];

/**
 * Render the demo track offline.
 * @param {BaseAudioContext} [context] any context (used for the sample rate)
 * @returns {Promise<AudioBuffer>}
 */
export async function renderDemoSong(context) {
  const sampleRate = context?.sampleRate ?? 44100;
  const beat = 60 / DEMO_BPM;
  const bars = 20;
  const duration = bars * 4 * beat + 1.2;
  const OfflineCtor = globalThis.OfflineAudioContext;
  if (!OfflineCtor) throw new Error("OfflineAudioContext unavailable");

  const offline = new OfflineCtor(
    1,
    Math.ceil(duration * sampleRate),
    sampleRate,
  );

  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  const reverb = offline.createConvolver();
  reverb.buffer = impulseResponse(offline, 1.4, 2.4);
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.24;
  reverb.connect(reverbGain).connect(master);

  const kick = bellBuffer({
    context: offline,
    seconds: 0.36,
    decay: (t) => Math.exp(-t * 22),
    baseFrequency: 55,
    sweepTo: 130,
  });
  const snare = noiseBuffer(offline, 0.22, (t) => Math.exp(-t * 26));
  const hat = noiseBuffer(offline, 0.07, (t) => Math.exp(-t * 90));

  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * 4 * beat;
    const chord = CHORDS[bar % CHORDS.length];

    for (let step = 0; step < 8; step += 1) {
      const time = barStart + step * (beat / 2);
      if (step % 2 === 0) {
        spawn({ context: offline, destination: master, buffer: kick, time });
      }
      if (step === 2 || step === 6) {
        spawn({
          context: offline,
          destination: master,
          buffer: snare,
          time,
          level: 0.5,
          rate: 0.9,
        });
      }
      if (bar >= 2) {
        spawn({
          context: offline,
          destination: master,
          buffer: hat,
          time: time + beat / 2,
          level: 0.18,
        });
      }
    }

    // Bass line: root notes on eighths.
    chord.forEach((semitones, index) => {
      const rootNote = 40 + semitones;
      const time = barStart + index * beat;
      spawnTone(offline, master, reverb, {
        start: time,
        duration: beat * 3.4,
        frequency: midiToHz(rootNote),
        type: "sawtooth",
        gain: 0.16,
      });
    });

    // Arpeggio lead: one note per eighth, walking the scale.
    for (let step = 0; step < 8; step += 1) {
      const degree = SCALE[(bar * 3 + step * 2) % SCALE.length];
      const time = barStart + step * (beat / 2);
      spawnTone(offline, master, reverb, {
        start: time,
        duration: beat * 0.42,
        frequency: midiToHz(72 + degree),
        type: "triangle",
        gain: step % 2 === 0 ? 0.14 : 0.09,
        detune: step % 3 === 0 ? 7 : -5,
      });
    }

    // Pad every second bar for width.
    if (bar % 2 === 0) {
      for (const semitones of chord) {
        spawnTone(offline, reverb, reverb, {
          start: barStart,
          duration: beat * 8,
          frequency: midiToHz(60 + semitones),
          type: "sine",
          gain: 0.05,
        });
      }
    }

    // Section markers: a bright crash at every 4-bar boundary.
    if (bar % 4 === 0) {
      spawnTone(offline, master, reverb, {
        start: barStart,
        duration: 0.9,
        frequency: midiToHz(84),
        type: "triangle",
        gain: 0.1,
      });
    }
  }

  return offline.startRendering();
}

/** Render the demo into raw samples for analysis (no live context needed). */
export async function renderDemoMono(context) {
  const buffer = await renderDemoSong(context);
  const mono = new Float32Array(buffer.length);
  const channel = buffer.getChannelData(0);
  mono.set(channel);
  return { mono, sampleRate: buffer.sampleRate, duration: buffer.duration };
}

function spawn({ context, destination, buffer, time, level = 1, rate = 1 }) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const gain = context.createGain();
  gain.gain.value = level;
  source.connect(gain).connect(destination);
  source.start(time);
}

function spawnTone(context, destination, reverb, options) {
  const {
    start,
    duration,
    frequency,
    type = "sine",
    gain = 0.1,
    detune = 0,
  } = options;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(destination);
  if (destination !== reverb) envelope.connect(reverb);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

function bellBuffer({ context, seconds, decay, baseFrequency, sweepTo }) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    const frequency =
      baseFrequency + (sweepTo - baseFrequency) * Math.exp(-t * 40);
    phase += (2 * Math.PI * frequency) / context.sampleRate;
    data[index] = Math.sin(phase) * decay(t);
  }
  return buffer;
}

function noiseBuffer(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * decay(t);
  }
  return buffer;
}

function impulseResponse(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      data[index] = (Math.random() * 2 - 1) * (1 - t) ** decay;
    }
  }
  return buffer;
}

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
