/**
 * Fully procedural audio (WebAudio). No audio files are required – every
 * sound effect and music track is synthesised at runtime. To use real audio
 * later, see public/assets/audio/README.md.
 */

interface Track {
  root: number; // MIDI note of tonic
  scale: number[];
  bpm: number;
  prog: number[]; // scale degree per bar
  lead: OscillatorType;
  bass: OscillatorType;
  arp: number; // note probability per 8th
  drums: 0 | 1 | 2;
  seed: number;
}

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const PHRYG = [0, 1, 3, 5, 7, 8, 10];
const MAJPENT = [0, 2, 4, 7, 9, 11, 12];

const TRACKS: Record<string, Track> = {
  menu: { root: 57, scale: MINOR, bpm: 76, prog: [0, 5, 3, 4], lead: 'triangle', bass: 'sine', arp: 0.5, drums: 0, seed: 3 },
  forest: { root: 62, scale: DORIAN, bpm: 96, prog: [0, 3, 0, 4], lead: 'triangle', bass: 'triangle', arp: 0.55, drums: 1, seed: 11 },
  ruins: { root: 57, scale: HARM, bpm: 86, prog: [0, 5, 2, 4], lead: 'square', bass: 'triangle', arp: 0.45, drums: 1, seed: 21 },
  caves: { root: 52, scale: MINOR, bpm: 68, prog: [0, 6, 5, 3], lead: 'sine', bass: 'sine', arp: 0.32, drums: 0, seed: 31 },
  sky: { root: 60, scale: LYDIAN, bpm: 108, prog: [0, 1, 4, 0], lead: 'triangle', bass: 'triangle', arp: 0.65, drums: 1, seed: 41 },
  boss: { root: 50, scale: PHRYG, bpm: 150, prog: [0, 0, 5, 6], lead: 'sawtooth', bass: 'sawtooth', arp: 0.8, drums: 2, seed: 51 },
  final: { root: 47, scale: HARM, bpm: 160, prog: [0, 5, 6, 4], lead: 'sawtooth', bass: 'square', arp: 0.85, drums: 2, seed: 61 },
  victory: { root: 60, scale: MAJPENT, bpm: 90, prog: [0, 3, 4, 0], lead: 'triangle', bass: 'sine', arp: 0.6, drums: 0, seed: 71 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private bus: GainNode | null = null;
  private timer = 0;
  private token = 0;
  current = '';
  private nextTime = 0;
  private stepIdx = 0;
  private motif: (number | null)[][] = [];
  private noise: AudioBuffer | null = null;
  private ambSrc: AudioBufferSourceNode | null = null;
  private lastSfx: Record<string, number> = {};

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.setVolumes(this.musicVol, this.sfxVol);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.current) {
      const c = this.current;
      this.current = '';
      this.playMusic(c);
    }
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx) {
      this.musicGain.gain.value = music * 0.7;
      this.sfxGain.gain.value = sfx;
    }
  }

  // ---------------------------------------------------------------- synth
  private osc(t: number, f: number, f2: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, attack = 0.004) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(t: number, dur: number, vol: number, freq: number, dest: AudioNode, type: BiquadFilterType = 'highpass') {
    const c = this.ctx!;
    if (!this.noise) return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ sfx
  sfx(name: string, vol = 1) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const c = this.ctx;
    const now = c.currentTime;
    if (now - (this.lastSfx[name] ?? -1) < 0.03) return;
    this.lastSfx[name] = now;
    const d = this.sfxGain;
    const T = (f: number, f2: number, dur: number, type: OscillatorType, v: number, delay = 0) =>
      this.osc(now + delay, f, f2, dur, type, v * vol * 0.5, d);
    const N = (dur: number, v: number, freq: number, delay = 0, type: BiquadFilterType = 'highpass') =>
      this.hiss(now + delay, dur, v * vol * 0.5, freq, d, type);
    switch (name) {
      case 'jump': T(260, 520, 0.12, 'square', 0.5); break;
      case 'doublejump': T(380, 900, 0.16, 'triangle', 0.8); N(0.1, 0.2, 4000); break;
      case 'walljump': T(300, 600, 0.12, 'square', 0.5); N(0.06, 0.3, 2500); break;
      case 'land': N(0.07, 0.5, 600, 0, 'lowpass'); break;
      case 'dash': N(0.18, 0.8, 1500, 0, 'bandpass'); T(500, 150, 0.15, 'sawtooth', 0.3); break;
      case 'slash': N(0.09, 0.9, 3000); T(700, 300, 0.08, 'triangle', 0.3); break;
      case 'bolt': T(900, 300, 0.14, 'square', 0.35); T(1400, 600, 0.1, 'sine', 0.3); break;
      case 'hit': N(0.1, 1, 1200, 0, 'bandpass'); T(200, 80, 0.12, 'square', 0.6); break;
      case 'clink': T(1800, 1700, 0.08, 'triangle', 0.6); T(2600, 2500, 0.06, 'sine', 0.4); break;
      case 'enemydie': T(400, 80, 0.25, 'sawtooth', 0.5); N(0.2, 0.7, 800, 0, 'lowpass'); break;
      case 'hurt': T(300, 90, 0.3, 'sawtooth', 0.8); N(0.25, 0.8, 500, 0, 'lowpass'); break;
      case 'coin': T(988, 988, 0.07, 'square', 0.4); T(1319, 1319, 0.16, 'square', 0.4, 0.06); break;
      case 'crystal': T(1318, 1318, 0.2, 'sine', 0.7); T(1760, 1760, 0.3, 'sine', 0.6, 0.07); T(2217, 2217, 0.4, 'sine', 0.4, 0.14); break;
      case 'heart': [523, 659, 784, 1046].forEach((f, i) => T(f, f, 0.18, 'triangle', 0.6, i * 0.07)); break;
      case 'powerup': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => T(f, f * 1.01, 0.14, 'square', 0.35, i * 0.05)); break;
      case 'checkpoint': [523, 784, 1046].forEach((f, i) => T(f, f, 0.5, 'sine', 0.7, i * 0.12)); break;
      case 'spring': T(200, 700, 0.2, 'sine', 0.8); break;
      case 'collapse': N(0.4, 0.8, 300, 0, 'lowpass'); break;
      case 'dart': T(1200, 400, 0.1, 'sawtooth', 0.25); break;
      case 'warn': T(800, 800, 0.06, 'square', 0.25); break;
      case 'select': T(660, 660, 0.04, 'square', 0.3); break;
      case 'confirm': T(660, 880, 0.1, 'square', 0.35); break;
      case 'back': T(500, 300, 0.1, 'square', 0.3); break;
      case 'talk': T(300 + Math.random() * 200, 300, 0.04, 'square', 0.15); break;
      case 'death': T(500, 40, 0.8, 'sawtooth', 0.8); N(0.6, 0.9, 400, 0, 'lowpass'); break;
      case 'respawn': T(200, 800, 0.4, 'sine', 0.7); break;
      case 'roar': T(110, 50, 0.7, 'sawtooth', 0.9); N(0.7, 0.8, 300, 0, 'lowpass'); break;
      case 'slam': N(0.5, 1, 250, 0, 'lowpass'); T(90, 30, 0.4, 'sine', 1); break;
      case 'bossdie': T(220, 30, 1.6, 'sawtooth', 0.9); N(1.4, 1, 500, 0, 'lowpass'); break;
      case 'teleport': T(1200, 200, 0.25, 'sine', 0.6); N(0.2, 0.4, 5000); break;
      case 'achievement': [784, 988, 1175, 1568].forEach((f, i) => T(f, f, 0.25, 'triangle', 0.6, i * 0.09)); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T(f, f, 0.3, 'triangle', 0.7, i * 0.14)); break;
      case 'portal': T(200, 1200, 0.6, 'sine', 0.7); N(0.5, 0.3, 3000); break;
      case 'thunder': N(1.2, 1.2, 200, 0, 'lowpass'); break;
      case 'pogo': T(300, 700, 0.12, 'triangle', 0.7); break;
      case 'gate': N(0.6, 0.9, 200, 0, 'lowpass'); T(70, 50, 0.6, 'sawtooth', 0.6); break;
    }
  }

  // ---------------------------------------------------------------- music
  private noteOf(tr: Track, deg: number) {
    const n = tr.scale.length;
    const oct = Math.floor(deg / n);
    return tr.root + tr.scale[((deg % n) + n) % n] + 12 * oct;
  }

  playMusic(name: string) {
    if (name === this.current) return;
    this.current = name;
    if (!this.ctx) return;
    const tr = TRACKS[name];
    this.token++;
    const c = this.ctx;
    // fade out old bus
    if (this.bus) {
      const old = this.bus;
      old.gain.cancelScheduledValues(c.currentTime);
      old.gain.setValueAtTime(old.gain.value, c.currentTime);
      old.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
      setTimeout(() => old.disconnect(), 1500);
    }
    window.clearInterval(this.timer);
    if (!tr) { this.bus = null; return; }
    // new bus with a feedback delay for atmosphere
    const bus = c.createGain();
    bus.gain.value = 0;
    bus.gain.linearRampToValueAtTime(1, c.currentTime + 0.6);
    const dly = c.createDelay(1);
    dly.delayTime.value = (60 / tr.bpm) * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    bus.connect(this.musicGain);
    bus.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(this.musicGain);
    this.bus = bus;
    // deterministic motif per chord position so melodies repeat musically
    const rnd = (() => { let a = tr.seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    this.motif = tr.prog.map(() => {
      const arr: (number | null)[] = [];
      for (let s = 0; s < 8; s++) arr.push(rnd() < tr.arp ? [0, 2, 4, 7, 9, 4, 2][Math.floor(rnd() * 7)] : null);
      return arr;
    });
    this.stepIdx = 0;
    this.nextTime = c.currentTime + 0.1;
    const myToken = this.token;
    this.timer = window.setInterval(() => {
      if (myToken !== this.token || !this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        this.scheduleStep(tr, this.nextTime, this.stepIdx, bus);
        this.nextTime += 60 / tr.bpm / 2;
        this.stepIdx++;
      }
    }, 60);
  }

  stopMusic() { this.playMusic('none'); }

  private scheduleStep(tr: Track, t: number, idx: number, bus: GainNode) {
    const s = idx % 8;
    const bar = Math.floor(idx / 8);
    const p = bar % tr.prog.length;
    const deg = tr.prog[p];
    const step = 60 / tr.bpm / 2;
    // bass
    if (s === 0 || s === 4 || (tr.drums === 2 && (s === 2 || s === 6))) {
      const f = mtof(this.noteOf(tr, deg) - 12);
      this.osc(t, f, f, step * (tr.drums === 2 ? 1.6 : 3.2), tr.bass, tr.drums === 2 ? 0.16 : 0.22, bus, 0.01);
    }
    // pad on bar start
    if (s === 0) {
      [0, 2, 4].forEach((o, i) => {
        const f = mtof(this.noteOf(tr, deg + o));
        this.osc(t + i * 0.01, f, f, step * 8.5, 'sine', 0.05, bus, step * 2);
      });
    }
    // melody / arpeggio
    const m = this.motif[p][s];
    if (m !== null) {
      const f = mtof(this.noteOf(tr, deg + m + 7));
      this.osc(t, f, f, step * 1.6, tr.lead, tr.lead === 'sawtooth' || tr.lead === 'square' ? 0.05 : 0.09, bus, 0.006);
    }
    // percussion
    if (tr.drums > 0) {
      if (s === 0 || s === 4 || (tr.drums === 2 && s === 7)) this.osc(t, 140, 40, 0.18, 'sine', 0.4, bus, 0.002);
      if (s % 2 === 1) this.hiss(t, 0.04, 0.07, 7000, bus);
      if (tr.drums === 2 && (s === 2 || s === 6)) this.hiss(t, 0.12, 0.2, 1800, bus, 'bandpass');
    }
  }

  /** Looping ambience bed: rain / wind / none. */
  setAmbience(kind: 'rain' | 'wind' | 'none') {
    if (!this.ctx || !this.noise) return;
    const c = this.ctx;
    if (this.ambSrc) {
      try { this.ambSrc.stop(); } catch { /* already stopped */ }
      this.ambSrc = null;
    }
    if (kind === 'none') return;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = kind === 'rain' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'rain' ? 3500 : 500;
    const g = c.createGain();
    g.gain.value = kind === 'rain' ? 0.05 : 0.035;
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start();
    this.ambSrc = s;
  }
}
