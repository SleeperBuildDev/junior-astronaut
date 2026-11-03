import { settings } from '../engine/settings';

// Everything you hear outside is inside the suit: there is no air on the Moon to carry
// sound. So the soundscape is the suit's fans and breathing, the radio and beeps.

let ctx: AudioContext | null = null;
let master: GainNode;
let radioBus: AudioNode;
let breath: GainNode;
const buffers = new Map<string, Promise<AudioBuffer>>();
let voiceQueue: Promise<void> = Promise.resolve();

export function startAudio() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = settings.value.volume;
  master.connect(ctx.destination);

  // NASA air-to-ground radio sound: narrow band, compressed, slightly clipped.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 320;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.ratio.value = 6;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 512) - 1;
    curve[i] = Math.tanh(x * 1.8);
  }
  shaper.curve = curve;
  const radioGain = ctx.createGain();
  radioGain.gain.value = 1.1;
  hp.connect(lp).connect(comp).connect(shaper).connect(radioGain).connect(master);
  radioBus = hp;

  // Suit ambience: fan hum + slow breathing made from filtered noise.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const fan = ctx.createBufferSource();
  fan.buffer = noise;
  fan.loop = true;
  const fanFilter = ctx.createBiquadFilter();
  fanFilter.type = 'lowpass';
  fanFilter.frequency.value = 420;
  const fanGain = ctx.createGain();
  fanGain.gain.value = 0.05;
  fan.connect(fanFilter).connect(fanGain).connect(master);
  fan.start();

  const br = ctx.createBufferSource();
  br.buffer = noise;
  br.loop = true;
  const brFilter = ctx.createBiquadFilter();
  brFilter.type = 'bandpass';
  brFilter.frequency.value = 900;
  brFilter.Q.value = 0.7;
  breath = ctx.createGain();
  breath.gain.value = 0;
  br.connect(brFilter).connect(breath).connect(master);
  br.start();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.22;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain).connect(breath.gain);
  lfo.start();
  initExtras();
}

export function setVolume(v: number) {
  if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

/** Faster breathing when sprinting or low on oxygen. */
export function setExertion(level: number) {
  if (!ctx) return;
  breath.gain.setTargetAtTime(0.02 + level * 0.05, ctx.currentTime, 0.4);
}

function load(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b));
    buffers.set(url, p);
  }
  return p;
}

function tone(freq: number, start: number, dur: number, gain: number, dest: AudioNode) {
  const o = ctx!.createOscillator();
  o.frequency.value = freq;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.setValueAtTime(gain, start + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/**
 * Plays a Mission Control line over the radio, framed by Apollo-style Quindar
 * tones (2525 Hz to open, 2475 Hz to close, 250 ms each). Lines queue up so they
 * never talk over each other.
 */
export function playVoice(id: string) {
  if (!ctx) return Promise.resolve();
  const url = `./assets/audio/vo/${id}.mp3`;
  voiceQueue = voiceQueue.then(async () => {
    try {
      const buf = await load(url);
      const t0 = ctx!.currentTime + 0.05;
      tone(2525, t0, 0.25, 0.08, master);
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.connect(radioBus);
      src.start(t0 + 0.32);
      tone(2475, t0 + 0.4 + buf.duration, 0.25, 0.08, master);
      await new Promise((r) => setTimeout(r, (buf.duration + 0.9) * 1000));
    } catch {
      // Missing audio should never block the game.
    }
  });
  return voiceQueue;
}

export function beep(kind: 'ok' | 'warn' | 'select' = 'select') {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kind === 'ok') {
    tone(880, t, 0.08, 0.06, master);
    tone(1320, t + 0.09, 0.12, 0.06, master);
  } else if (kind === 'warn') {
    tone(620, t, 0.18, 0.08, master);
    tone(620, t + 0.28, 0.18, 0.08, master);
  } else tone(1100, t, 0.05, 0.04, master);
}

/** A soft thud felt through the suit when landing (vibration, not sound through air). */
export function thud(strength: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.min(0.25, 0.05 + strength * 0.06), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.3);
}

// ---------------------------------------------------------------- sound effects
// All synthesised with Web Audio: no files to load, no licences to track.

let noiseBuf: AudioBuffer;
let humGain: GainNode;
let musicGain: GainNode;

function noise() {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** Filtered noise burst: hisses, thumps, whooshes. */
function burst(opts: { type: BiquadFilterType; freq: number; q?: number; dur: number; gain: number; attack?: number; freqEnd?: number; at?: number }) {
  const t = ctx!.currentTime + (opts.at ?? 0);
  const src = noise();
  const f = ctx!.createBiquadFilter();
  f.type = opts.type;
  f.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur);
  f.Q.value = opts.q ?? 0.8;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + opts.dur + 0.05);
}

/** Oscillator note with an optional pitch glide. */
function note(opts: { type?: OscillatorType; freq: number; freqEnd?: number; dur: number; gain: number; at?: number; attack?: number }) {
  const t = ctx!.currentTime + (opts.at ?? 0);
  const o = ctx!.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(opts.freq, t);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + opts.dur + 0.05);
}

function initExtras() {
  noiseBuf = ctx!.createBuffer(1, ctx!.sampleRate * 2, ctx!.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Machinery hum, felt through the ground and the suit when standing near running equipment.
  humGain = ctx!.createGain();
  humGain.gain.value = 0;
  humGain.connect(master);
  for (const [f, g] of [[58, 0.5], [116, 0.3], [174, 0.12]]) {
    const o = ctx!.createOscillator();
    o.frequency.value = f;
    const og = ctx!.createGain();
    og.gain.value = g;
    o.connect(og).connect(humGain);
    o.start();
  }

  // Quiet ambient score: slow detuned pads under a low-pass filter that breathes.
  musicGain = ctx!.createGain();
  musicGain.gain.value = 0.035;
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  lp.Q.value = 0.5;
  lp.connect(musicGain).connect(master);
  const sweep = ctx!.createOscillator();
  sweep.frequency.value = 0.03;
  const sweepAmt = ctx!.createGain();
  sweepAmt.gain.value = 350;
  sweep.connect(sweepAmt).connect(lp.frequency);
  sweep.start();
  // An open chord (D, A, E, F#, A) that never resolves: calm but distant.
  for (const [f, det] of [[73.4, -6], [110, 5], [164.8, -4], [185, 7], [220, 3]]) {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    const og = ctx!.createGain();
    og.gain.value = 0.25;
    const trem = ctx!.createOscillator();
    trem.frequency.value = 0.05 + Math.random() * 0.08;
    const tremAmt = ctx!.createGain();
    tremAmt.gain.value = 0.12;
    trem.connect(tremAmt).connect(og.gain);
    o.connect(og).connect(lp);
    o.start();
    trem.start();
  }
}

/** 0..1: how loud nearby machinery is. */
export function setHum(level: number) {
  if (!ctx || !humGain) return;
  humGain.gain.setTargetAtTime(Math.min(1, level) * 0.06, ctx.currentTime, 0.3);
}

export type Sfx =
  | 'step'
  | 'jump'
  | 'scan'
  | 'terminal'
  | 'click'
  | 'hover'
  | 'refill'
  | 'airlock'
  | 'complete'
  | 'unlock'
  | 'alarm'
  | 'ratchet'
  | 'clunk'
  | 'powerup'
  | 'lamp'
  | 'panel';

let lastHover = 0;

export function sfx(name: Sfx, strength = 1) {
  if (!ctx || !noiseBuf) return;
  switch (name) {
    case 'step':
      // Boots on regolith, felt through the suit: a soft low crunch.
      burst({ type: 'lowpass', freq: 380, dur: 0.16, gain: 0.05 * strength });
      burst({ type: 'bandpass', freq: 1800, q: 1.2, dur: 0.09, gain: 0.012 * strength });
      break;
    case 'jump':
      burst({ type: 'lowpass', freq: 500, freqEnd: 150, dur: 0.25, gain: 0.07 });
      note({ freq: 140, freqEnd: 90, dur: 0.2, gain: 0.04 });
      break;
    case 'scan':
      note({ type: 'triangle', freq: 600, freqEnd: 2400, dur: 0.7, gain: 0.05, attack: 0.05 });
      note({ type: 'sine', freq: 1200, freqEnd: 4800, dur: 0.7, gain: 0.02, attack: 0.05 });
      for (let i = 0; i < 3; i++) note({ type: 'square', freq: 1600, dur: 0.05, gain: 0.015, at: 0.75 + i * 0.09 });
      break;
    case 'terminal':
      note({ type: 'square', freq: 880, dur: 0.06, gain: 0.025 });
      note({ type: 'square', freq: 1320, dur: 0.08, gain: 0.025, at: 0.07 });
      burst({ type: 'highpass', freq: 3000, dur: 0.12, gain: 0.01, at: 0.02 });
      break;
    case 'panel':
      burst({ type: 'bandpass', freq: 900, freqEnd: 2400, q: 0.7, dur: 0.18, gain: 0.025 });
      break;
    case 'click':
      note({ type: 'square', freq: 1500, dur: 0.03, gain: 0.02 });
      break;
    case 'hover': {
      const now = ctx.currentTime;
      if (now - lastHover < 0.06) return;
      lastHover = now;
      note({ type: 'sine', freq: 2200, dur: 0.035, gain: 0.008 });
      break;
    }
    case 'refill':
      burst({ type: 'bandpass', freq: 4000, freqEnd: 2500, q: 0.6, dur: 1.6, gain: 0.05, attack: 0.08 });
      note({ freq: 300, freqEnd: 600, dur: 1.4, gain: 0.015, attack: 0.2 });
      break;
    case 'airlock':
      burst({ type: 'lowpass', freq: 200, dur: 0.35, gain: 0.12 }); // hatch seals
      burst({ type: 'bandpass', freq: 1500, freqEnd: 600, q: 0.5, dur: 4.5, gain: 0.06, attack: 0.6, at: 0.4 }); // pressurising
      note({ freq: 90, freqEnd: 60, dur: 0.4, gain: 0.08, at: 4.9 });
      break;
    case 'complete':
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => note({ type: 'triangle', freq: f, dur: 0.9, gain: 0.05, at: i * 0.14 }));
      note({ type: 'sine', freq: 261.6, dur: 1.8, gain: 0.04, at: 0.1, attack: 0.1 });
      break;
    case 'unlock':
      note({ type: 'sine', freq: 1046.5, dur: 0.5, gain: 0.04 });
      note({ type: 'sine', freq: 1568, dur: 0.7, gain: 0.03, at: 0.1 });
      break;
    case 'alarm':
      // NASA-style master caution: two-tone, attention-getting but short.
      for (let i = 0; i < 2; i++) {
        note({ type: 'square', freq: 1000, dur: 0.18, gain: 0.03, at: i * 0.5 });
        note({ type: 'square', freq: 750, dur: 0.18, gain: 0.03, at: i * 0.5 + 0.2 });
      }
      break;
    case 'ratchet':
      for (let i = 0; i < 3; i++) burst({ type: 'bandpass', freq: 2600, q: 3, dur: 0.04, gain: 0.04, at: i * 0.06 });
      break;
    case 'clunk':
      note({ freq: 160, freqEnd: 70, dur: 0.25, gain: 0.1 });
      burst({ type: 'lowpass', freq: 800, dur: 0.15, gain: 0.08 });
      break;
    case 'powerup':
      note({ type: 'sawtooth', freq: 80, freqEnd: 320, dur: 1.2, gain: 0.03, attack: 0.3 });
      note({ type: 'sine', freq: 160, freqEnd: 640, dur: 1.2, gain: 0.03, attack: 0.3 });
      break;
    case 'lamp':
      note({ type: 'square', freq: 2000, dur: 0.02, gain: 0.02 });
      burst({ type: 'highpass', freq: 5000, dur: 0.05, gain: 0.01 });
      break;
  }
}

/** For QA: the audio engine's state ('running' once started). */
export const audioState = () => ctx?.state ?? 'not-started';
