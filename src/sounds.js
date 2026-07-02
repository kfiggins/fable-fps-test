// Tiny synthesized sound effects via WebAudio — no asset files needed.
export class Sounds {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  // Must be called from a user gesture (click) so the browser allows audio.
  init() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  sweep(type, freqStart, freqEnd, duration, volume = 0.5, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  noise(duration, volume = 0.3, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  shoot() {
    this.sweep('square', 320, 70, 0.11, 0.4);
    this.noise(0.06, 0.35);
  }

  botShoot() {
    this.sweep('square', 180, 55, 0.1, 0.2);
    this.noise(0.05, 0.15);
  }

  hit() {
    this.sweep('sine', 1300, 900, 0.06, 0.35);
  }

  kill() {
    this.sweep('sine', 500, 900, 0.09, 0.4);
    this.sweep('sine', 750, 1300, 0.12, 0.35, 0.07);
  }

  hurt() {
    this.sweep('sawtooth', 160, 70, 0.22, 0.45);
  }

  reload() {
    this.sweep('square', 700, 500, 0.05, 0.2);
    this.sweep('square', 900, 1100, 0.05, 0.2, 0.25);
  }

  empty() {
    this.sweep('square', 500, 400, 0.04, 0.15);
  }
}
