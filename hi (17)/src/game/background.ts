/**
 * Parallax backgrounds (pre-rendered per theme), weather particles, dynamic
 * lighting mask and day/night tinting.
 */
import { VIEW_W, VIEW_H } from './config';
import { seeded, mixColor, rand } from './util';
import { makeCanvas, skyAt } from './themes';
import type { Theme } from './themes';
import type { WeatherId } from './types';

const LW = VIEW_W * 2;
const EXTRA = 48; // extra layer height for vertical parallax

interface Layer { img: HTMLCanvasElement; f: number }

function ridge(g: CanvasRenderingContext2D, color: string, base: number, amp: number, seed: number) {
  const r = seeded(seed);
  const ks = [1, 2, 3, 5].map((k) => ({ k, p: r() * 6.28, a: amp * (0.5 + r() * 0.5) / k }));
  g.fillStyle = color;
  for (let x = 0; x < LW; x++) {
    let y = base;
    for (const s of ks) y += Math.sin((x / LW) * Math.PI * 2 * s.k * 2 + s.p) * s.a;
    g.fillRect(x, Math.round(y), 1, VIEW_H + EXTRA);
  }
}

function fogGradient(g: CanvasRenderingContext2D, fog: string, from: number, a: number) {
  const gr = g.createLinearGradient(0, from, 0, VIEW_H + EXTRA);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, mixColor('#000000', fog, 1).replace('rgb', 'rgba').replace(')', `,${a})`));
  g.fillStyle = gr;
  g.fillRect(0, from, LW, VIEW_H + EXTRA - from);
}

function buildLayers(th: Theme): Layer[] {
  const layers: Layer[] = [];
  const H = VIEW_H + EXTRA;
  const mk = (f: number, draw: (g: CanvasRenderingContext2D) => void) => {
    const c = makeCanvas(LW, H);
    draw(c.getContext('2d')!);
    layers.push({ img: c, f });
  };
  const r = seeded(th.id.charCodeAt(0) * 31);
  if (th.id === 'forest') {
    mk(0.08, (g) => { ridge(g, mixColor(th.far, th.fog, 0.35), 120, 34, 1); fogGradient(g, th.fog, 90, 0.5); });
    mk(0.2, (g) => {
      ridge(g, mixColor(th.far, th.mid, 0.6), 150, 18, 2);
      // distant pines
      for (let x = 10; x < LW - 10; x += 14 + Math.floor(r() * 12)) {
        const h = 36 + r() * 30; const y = 175;
        g.fillStyle = mixColor(th.mid, th.fog, 0.2);
        for (let i = 0; i < 4; i++) g.fillRect(x - 10 + i * 2, y - h + i * (h / 4), 20 - i * 4, h / 4 + 1);
      }
      fogGradient(g, th.fog, 120, 0.35);
    });
    mk(0.45, (g) => {
      for (let x = 0; x < LW; x += 28 + Math.floor(r() * 22)) {
        const h = 70 + r() * 50;
        g.fillStyle = mixColor(th.near, '#000', 0.25);
        g.fillRect(x, VIEW_H + EXTRA - h, 6, h);
        g.fillStyle = th.near;
        const cy = VIEW_H + EXTRA - h;
        g.beginPath(); g.arc(x + 3, cy, 18 + r() * 8, 0, 6.3); g.fill();
        g.fillStyle = mixColor(th.near, th.mid, 0.4);
        g.beginPath(); g.arc(x - 3, cy - 6, 10, 0, 6.3); g.fill();
      }
    });
  } else if (th.id === 'ruins') {
    mk(0.08, (g) => { ridge(g, mixColor(th.far, th.fog, 0.4), 130, 26, 5); fogGradient(g, th.fog, 100, 0.5); });
    mk(0.22, (g) => {
      // distant arches and towers
      for (let x = 20; x < LW - 60; x += 70 + Math.floor(r() * 40)) {
        g.fillStyle = mixColor(th.mid, th.fog, 0.35);
        const h = 60 + r() * 50;
        g.fillRect(x, 190 - h, 14, h);
        g.fillRect(x + 36, 190 - h * 0.8, 14, h * 0.8);
        g.fillRect(x - 2, 190 - h - 4, 18, 4);
        g.beginPath(); g.arc(x + 25, 190 - h * 0.8, 18, Math.PI, 0); g.fill();
        g.clearRect(x + 17, 190 - h * 0.8 - 2, 16, 16);
        g.fillRect(x + 14, 186 - h * 0.8 + 12, 22, 4);
      }
      fogGradient(g, th.fog, 110, 0.4);
    });
    mk(0.45, (g) => {
      for (let x = 10; x < LW; x += 56 + Math.floor(r() * 40)) {
        const h = 60 + r() * 60;
        g.fillStyle = th.near;
        g.fillRect(x, VIEW_H + EXTRA - h, 12, h);
        g.fillStyle = mixColor(th.near, th.fog, 0.2);
        g.fillRect(x - 2, VIEW_H + EXTRA - h, 16, 4);
        g.fillRect(x + 2, VIEW_H + EXTRA - h + 8, 2, h - 8);
        g.fillStyle = th.mid;
        g.fillRect(x + 9, VIEW_H + EXTRA - h + 6, 1, h - 6);
        // vines
        g.fillStyle = '#3f6a4a';
        for (let i = 0; i < 6; i++) g.fillRect(x + 1 + (i % 3) * 3, VIEW_H + EXTRA - h + 4, 1, 6 + r() * 20);
      }
    });
  } else if (th.id === 'caves') {
    mk(0.06, (g) => {
      ridge(g, th.far, 150, 30, 8);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(122,240,255,0.5)'; g.fillRect(r() * LW, r() * 160, 1, 1); }
    });
    mk(0.2, (g) => {
      g.fillStyle = th.mid;
      for (let x = 0; x < LW; x += 12 + Math.floor(r() * 16)) {
        const h = 20 + r() * 70;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 7, h); g.closePath(); g.fill();
      }
      for (let x = 6; x < LW; x += 40 + Math.floor(r() * 40)) {
        const h = 20 + r() * 50;
        g.fillStyle = th.mid;
        g.beginPath(); g.moveTo(x, VIEW_H + EXTRA); g.lineTo(x + 18, VIEW_H + EXTRA); g.lineTo(x + 9, VIEW_H + EXTRA - h); g.closePath(); g.fill();
        g.fillStyle = 'rgba(122,240,255,0.75)';
        g.fillRect(x + 8, VIEW_H + EXTRA - h, 2, 6);
      }
    });
    mk(0.42, (g) => {
      for (let x = 0; x < LW; x += 30 + Math.floor(r() * 30)) {
        const h = 10 + r() * 50;
        g.fillStyle = th.near;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 9, h); g.closePath(); g.fill();
        if (r() > 0.6) { g.fillStyle = th.accent; g.fillRect(x + 8, h - 2, 2, 3); }
      }
    });
  } else {
    // sky islands
    mk(0.06, (g) => {
      for (let i = 0; i < 14; i++) {
        const x = r() * LW, y = 20 + r() * 110, w = 30 + r() * 60;
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fillRect(x, y, w, 5); g.fillRect(x + 6, y - 4, w - 14, 5); g.fillRect(x + 12, y + 5, w - 24, 3);
      }
    });
    mk(0.16, (g) => {
      for (let x = 20; x < LW - 60; x += 90 + Math.floor(r() * 60)) {
        const y = 60 + r() * 90, w = 40 + r() * 40;
        g.fillStyle = mixColor(th.far, th.fog, 0.25);
        g.fillRect(x, y, w, 5);
        g.beginPath(); g.moveTo(x, y + 5); g.lineTo(x + w, y + 5); g.lineTo(x + w / 2, y + 30 + r() * 30); g.closePath(); g.fill();
        g.fillStyle = mixColor('#74d68e', th.fog, 0.4);
        g.fillRect(x, y - 2, w, 3);
      }
    });
    mk(0.38, (g) => {
      for (let x = 10; x < LW - 60; x += 110 + Math.floor(r() * 60)) {
        const y = 110 + r() * 80, w = 50 + r() * 50;
        g.fillStyle = th.mid;
        g.fillRect(x, y, w, 8);
        g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + w, y + 8); g.lineTo(x + w / 2, y + 40 + r() * 30); g.closePath(); g.fill();
        g.fillStyle = '#5fc27f'; g.fillRect(x, y - 3, w, 4);
        g.fillStyle = th.near; g.fillRect(x + w / 2 - 3, y - 14, 6, 11); // little shrine
      }
    });
  }
  return layers;
}

interface Mote { x: number; y: number; vx: number; vy: number; p: number; s: number }

export class Background {
  layers: Layer[];
  motes: Mote[] = [];
  weather: WeatherId;
  flash = 0;
  private nextBolt = 6;
  private light = makeCanvas(VIEW_W, VIEW_H);
  private glow = makeCanvas(96, 96);
  stars: { x: number; y: number; p: number }[] = [];
  onThunder: () => void = () => {};

  constructor(public theme: Theme, weather: WeatherId) {
    this.weather = weather;
    this.layers = buildLayers(theme);
    const g = this.glow.getContext('2d')!;
    const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 96, 96);
    const n = weather === 'rain' ? 90 : weather === 'none' ? 0 : 46;
    for (let i = 0; i < n; i++) {
      this.motes.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), vx: 0, vy: 0, p: rand(0, 6.28), s: rand(0.6, 1.4) });
    }
    for (let i = 0; i < 50; i++) this.stars.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H * 0.6), p: rand(0, 6) });
  }

  update(dt: number, camX: number, flashOk: boolean, wind = 0) {
    for (const m of this.motes) {
      m.p += dt * (1 + m.s);
      switch (this.weather) {
        case 'leaves': m.vx = -22 * m.s - wind * 0.2 + Math.sin(m.p) * 14; m.vy = 16 * m.s + Math.cos(m.p * 1.3) * 8; break;
        case 'rain': m.vx = -30; m.vy = 230 * m.s; break;
        case 'fireflies': m.vx = Math.sin(m.p * 0.7) * 10; m.vy = Math.cos(m.p * 0.9) * 8; break;
        case 'embers': m.vx = Math.sin(m.p) * 6; m.vy = -18 * m.s; break;
        case 'wind': m.vx = -120 * m.s; m.vy = Math.sin(m.p) * 4; break;
        case 'motes': m.vx = Math.sin(m.p * 0.5) * 6; m.vy = Math.cos(m.p * 0.4) * 4 + 3; break;
        default: break;
      }
      m.x += m.vx * dt - wind * 0.0;
      m.y += m.vy * dt;
      if (m.x < -6) m.x += VIEW_W + 12;
      if (m.x > VIEW_W + 6) m.x -= VIEW_W + 12;
      if (m.y > VIEW_H + 6) m.y -= VIEW_H + 12;
      if (m.y < -6) m.y += VIEW_H + 12;
    }
    void camX;
    if (this.weather === 'rain') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rand(7, 16);
        if (flashOk) this.flash = 0.7;
        this.onThunder();
      }
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  /** Sky + parallax layers. */
  drawBack(ctx: CanvasRenderingContext2D, camX: number, camY: number, maxCamY: number, phase: number, time: number) {
    const sky = skyAt(this.theme, phase);
    const gr = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    gr.addColorStop(0, sky.top);
    gr.addColorStop(1, sky.bottom);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // stars at night
    if (phase > 1.2 && this.theme.id !== 'caves') {
      const a = Math.min(1, (phase - 1.2) / 0.8);
      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        ctx.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + s.p)));
        ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      // moon
      ctx.fillStyle = '#f4f1d8';
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(VIEW_W - 70, 40, 12, 0, 6.3); ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath(); ctx.arc(VIEW_W - 65, 37, 11, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (phase < 1.2 && this.theme.id !== 'caves') {
      // sun
      ctx.fillStyle = phase > 0.6 ? '#ffb070' : '#fff6c0';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(70, 36 + phase * 40, 13, 0, 6.3); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const ratio = maxCamY > 0 ? Math.min(1, Math.max(0, camY / maxCamY)) : 0;
    for (const l of this.layers) {
      const ox = -Math.floor((camX * l.f) % LW);
      const oy = -Math.floor(ratio * EXTRA * (0.4 + l.f));
      const x0 = ox > 0 ? ox - LW : ox;
      ctx.drawImage(l.img, x0, oy);
      if (x0 + LW < VIEW_W) ctx.drawImage(l.img, x0 + LW, oy);
    }
  }

  /** Weather particles (screen space, in front of the world). */
  drawWeather(ctx: CanvasRenderingContext2D, time: number, density: number) {
    if (this.weather === 'none' || density === 0) return;
    const lim = density === 1 ? Math.floor(this.motes.length / 2) : this.motes.length;
    for (let i = 0; i < lim; i++) {
      const m = this.motes[i];
      const x = Math.round(m.x), y = Math.round(m.y);
      switch (this.weather) {
        case 'leaves':
          ctx.fillStyle = i % 3 === 0 ? '#e8b04a' : '#7ac455';
          ctx.fillRect(x, y, 2, Math.sin(m.p * 3) > 0 ? 1 : 2);
          break;
        case 'rain':
          ctx.fillStyle = 'rgba(190,210,255,0.55)';
          ctx.fillRect(x, y, 1, 5);
          break;
        case 'fireflies': {
          const a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.5 + m.p));
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(this.glow, x - 6, y - 6, 12, 12);
          ctx.globalAlpha = a;
          ctx.fillStyle = '#fff6a0';
          ctx.fillRect(x, y, 2, 2);
          ctx.globalAlpha = 1;
          break;
        }
        case 'embers':
          ctx.fillStyle = i % 2 ? '#ff9a3a' : '#ffd25a';
          ctx.fillRect(x, y, 1, 1);
          break;
        case 'wind':
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillRect(x, y, 8 + (i % 4) * 4, 1);
          break;
        case 'motes':
          ctx.fillStyle = 'rgba(255,240,200,0.5)';
          ctx.fillRect(x, y, 1, 1);
          break;
        default: break;
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /** Day/night colour overlay. */
  drawTint(ctx: CanvasRenderingContext2D, phase: number) {
    const s = skyAt(this.theme, phase);
    if (s.tintA <= 0.005) return;
    ctx.fillStyle = s.tint;
    ctx.globalAlpha = s.tintA;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }

  /** Darkness mask with lights punched through it (caves / night). */
  drawLighting(ctx: CanvasRenderingContext2D, lights: { x: number; y: number; r: number }[], darkness: number) {
    if (darkness <= 0.01) return;
    const g = this.light.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = `rgba(6,3,18,${darkness})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      if (l.x < -l.r || l.x > VIEW_W + l.r || l.y < -l.r || l.y > VIEW_H + l.r) continue;
      g.drawImage(this.glow, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.light, 0, 0);
  }

  /** Soft additive glow sprite (used for lamps, crystals). */
  drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.glow, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
}
