// System sounds, synthesised with Web Audio (no sound files). All of them respect the
// Sounds setting and the volume in the taskbar.
import * as settings from './settings.js';

let ctx = null;
let master = null;

export function audioContext() {
  if (!ctx) {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    ctx = new Context({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// Every sound (system sounds and DOS games) goes through this node.
export function output() {
  audioContext();
  return master;
}

export function applyVolume() {
  if (master) master.gain.value = settings.get('muted') ? 0 : settings.get('volume');
}
settings.events.addEventListener('change', event => { if ('volume' in event.detail || 'muted' in event.detail) applyVolume(); });

function tone(freq, start, duration, { type = 'sine', gain = 0.18, slide = 0 } = {}) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + start + duration);
  env.gain.setValueAtTime(0, ctx.currentTime + start);
  env.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(env).connect(master);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

const SOUNDS = {
  startup() {
    [[392, 0], [523.25, 0.16], [659.25, 0.32], [783.99, 0.48]].forEach(([f, t]) => tone(f, t, 1.4, { gain: 0.09, type: 'triangle' }));
    tone(1046.5, 0.64, 1.8, { gain: 0.06 });
  },
  shutdown() {
    [[783.99, 0], [659.25, 0.18], [523.25, 0.36], [392, 0.54]].forEach(([f, t]) => tone(f, t, 1.1, { gain: 0.09, type: 'triangle' }));
  },
  error() { tone(440, 0, 0.35, { type: 'square', gain: 0.05 }); tone(330, 0.12, 0.4, { type: 'square', gain: 0.05 }); },
  ding() { tone(1318.5, 0, 0.5, { gain: 0.12 }); tone(1975.5, 0, 0.35, { gain: 0.04 }); },
  open() { tone(660, 0, 0.09, { gain: 0.05, slide: 1.5 }); },
  close() { tone(880, 0, 0.09, { gain: 0.05, slide: 0.6 }); },
  minimize() { tone(700, 0, 0.12, { gain: 0.04, slide: 0.5 }); },
  restore() { tone(450, 0, 0.12, { gain: 0.04, slide: 1.8 }); },
  click() { tone(1800, 0, 0.03, { type: 'square', gain: 0.02 }); },
  recycle() { tone(300, 0, 0.18, { type: 'sawtooth', gain: 0.03, slide: 0.4 }); }
};

export function play(name) {
  if (!settings.get('sounds') || !SOUNDS[name]) return;
  try {
    if (!audioContext()) return;
    SOUNDS[name]();
  } catch { /* audio can be unavailable; sounds are optional */ }
}
