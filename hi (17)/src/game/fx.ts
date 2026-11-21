/**
 * Visual effects: pooled particle system, floating texts and a trauma-based
 * screen shake helper.
 */
import { Pool, rand } from './util';
import type { Poolable } from './util';

export interface Particle extends Poolable {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; size2: number;
  color: string; gravity: number; drag: number; glow: boolean;
}

export interface FloatText extends Poolable {
  x: number; y: number; life: number; text: string; color: string;
}

export interface BurstOpts {
  color?: string | string[];
  speed?: number; spread?: number; angle?: number; arc?: number;
  life?: number; size?: number; size2?: number; gravity?: number; drag?: number; glow?: boolean;
}

export class Effects {
  particles = new Pool<Particle>(900, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, size2: 0, color: '#fff', gravity: 0, drag: 0, glow: false,
  }));
  texts = new Pool<FloatText>(24, () => ({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' }));
  /** 0 = off, 1 = low, 2 = high (from settings). */
  density = 2;
  shakeAmount = 1;
  trauma = 0;

  emit(x: number, y: number, o: BurstOpts = {}) {
    const p = this.particles.acquire();
    if (!p) return;
    const col = o.color ?? '#fff';
    const a = (o.angle ?? 0) + rand(-(o.arc ?? Math.PI), o.arc ?? Math.PI);
    const sp = (o.speed ?? 60) * rand(1 - (o.spread ?? 0.5), 1 + (o.spread ?? 0.5));
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.max = p.life = (o.life ?? 0.5) * rand(0.7, 1.2);
    p.size = o.size ?? 2; p.size2 = o.size2 ?? 0;
    p.color = Array.isArray(col) ? col[Math.floor(Math.random() * col.length)] : col;
    p.gravity = o.gravity ?? 0; p.drag = o.drag ?? 0; p.glow = o.glow ?? false;
  }

  burst(x: number, y: number, n: number, o: BurstOpts = {}) {
    if (this.density === 0) return;
    const count = Math.ceil(n * (this.density === 1 ? 0.5 : 1));
    for (let i = 0; i < count; i++) this.emit(x, y, o);
  }

  dust(x: number, y: number, dir = 0) {
    this.burst(x, y, 6, { color: ['#d8d0c0', '#b8b0a0'], speed: 35, arc: 0.6, angle: dir === 0 ? -Math.PI / 2 : dir > 0 ? 0 : Math.PI, life: 0.35, size: 2, size2: 0, drag: 2 });
  }

  ring(x: number, y: number, color = '#9ff') {
    this.burst(x, y, 14, { color, speed: 80, arc: Math.PI, life: 0.3, size: 2, drag: 3, glow: true });
  }

  text(x: number, y: number, text: string, color = '#fff') {
    const t = this.texts.acquire();
    if (!t) return;
    t.x = x; t.y = y; t.life = 1.1; t.text = text; t.color = color;
  }

  addTrauma(a: number) { this.trauma = Math.min(1, this.trauma + a * this.shakeAmount); }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    for (const p of this.particles.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (const t of this.texts.items) {
      if (!t.active) continue;
      t.life -= dt;
      t.y -= 14 * dt;
      if (t.life <= 0) t.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    for (const p of this.particles.items) {
      if (!p.active) continue;
      const k = p.life / p.max;
      const s = p.size2 !== undefined ? p.size2 + (p.size - p.size2) * k : p.size;
      const sz = Math.max(1, Math.round(s));
      ctx.globalAlpha = p.glow ? Math.min(1, k * 1.5) : Math.min(1, k * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX - sz / 2), Math.round(p.y - camY - sz / 2), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.particles.releaseAll();
    this.texts.releaseAll();
    this.trauma = 0;
  }
}
