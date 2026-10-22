// AudioWorklet for DOSBox sound: DOSBox pushes mono samples; this resamples them to the output
// rate and plays them from a ring buffer. The rate DOSBox reports (44.1 kHz) is not the rate it
// really delivers (about 49 kHz in js-dos 8.5), so the real rate is measured from what arrives
// and the playback speed is nudged (at most ±0.5%, inaudible) to keep the buffer near its target.
// If the buffer runs dry it plays silence (fading out to avoid clicks); only if it grows far too
// large does it skip ahead.
class Ring {
  constructor(size) { this.data = new Float32Array(size); this.read = 0; this.count = 0; }
  push(value) {
    if (this.count === this.data.length) { this.read = (this.read + 1) % this.data.length; this.count--; }
    this.data[(this.read + this.count) % this.data.length] = value;
    this.count++;
  }
  shift() { const value = this.data[this.read]; this.read = (this.read + 1) % this.data.length; this.count--; return value; }
  drop(n) { const k = Math.min(n, this.count); this.read = (this.read + k) % this.data.length; this.count -= k; }
}

const WINDOW = 1;    // seconds of arrivals per rate measurement
const NUDGE = 0.005; // largest speed correction for buffer level

class DosAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Ring(sampleRate * 2);
    this.nominal = 44100;
    this.position = 0;
    this.previous = 0;
    this.started = false;
    this.last = 0;
    this.target = Math.round(sampleRate * 0.08);
    this.reset(true);
    this.port.onmessage = ({ data }) => {
      if (data?.type === 'init') { this.nominal = data.rate || this.nominal; this.reset(true); return; }
      if (data?.type === 'clear') { this.reset(false); return; }
      if (data?.type === 'stats') { this.port.postMessage({ rate: this.rate, buffered: this.ring.count / sampleRate, playing: this.started }); return; }
      if (data instanceof Float32Array) { this.measure(data.length); this.resample(data); }
    };
  }

  // After a pause the measured rate is kept (it belongs to this machine); a new session forgets it.
  reset(forget) {
    this.ring.drop(this.ring.count);
    this.started = false;
    this.since = -1;
    if (forget) { this.rate = this.nominal; this.total = 0; this.totalTime = 0; }
  }

  // Counts arriving samples per WINDOW of audio-clock time. A window that contains a gap or a
  // burst (sound queued up while the tab or the audio was asleep) is far off the nominal rate and
  // is thrown away; the rest add up, so the estimate gets more exact the longer sound plays.
  measure(n) {
    if (this.since < 0 || currentTime - this.lastArrival > 0.25) {
      this.since = currentTime;
      this.received = 0;
      this.lastArrival = currentTime;
      return;
    }
    this.lastArrival = currentTime;
    this.received += n;
    const elapsed = currentTime - this.since;
    if (elapsed < WINDOW) return;
    const rate = this.received / elapsed;
    if (rate > this.nominal * 0.8 && rate < this.nominal * 1.25) {
      this.total += this.received;
      this.totalTime += elapsed;
      this.rate = this.total / this.totalTime;
    }
    this.since = currentTime;
    this.received = 0;
  }

  resample(input) {
    const fill = Math.max(-1, Math.min(1, (this.ring.count - this.target) / this.target));
    const step = (this.rate / sampleRate) * (1 + fill * NUDGE);
    let pos = this.position;
    let prev = this.previous;
    for (let i = 0; i < input.length; i++) {
      const next = input[i];
      while (pos < 1) {
        this.ring.push(prev + (next - prev) * pos);
        pos += step;
      }
      pos -= 1;
      prev = next;
    }
    this.position = pos;
    this.previous = prev;
    if (this.ring.count > this.target * 6) this.ring.drop(this.ring.count - this.target);
  }

  process(_, outputs) {
    const channels = outputs[0];
    const out = channels[0];
    if (!this.started && this.ring.count >= this.target) this.started = true;
    for (let i = 0; i < out.length; i++) {
      if (this.started && this.ring.count) this.last = this.ring.shift();
      else { this.last *= 0.95; if (this.started && !this.ring.count) this.started = false; }
      out[i] = this.last;
    }
    for (let c = 1; c < channels.length; c++) channels[c].set(out);
    return true;
  }
}

registerProcessor('lovos-dos-audio', DosAudio);
