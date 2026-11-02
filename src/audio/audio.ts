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
