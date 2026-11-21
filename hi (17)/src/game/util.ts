/** Small math / helper utilities + a generic object pool. */
import type { Rect } from './types';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
/** Move `v` toward `target` by at most `d`. */
export const approach = (v: number, target: number, d: number) =>
  v < target ? Math.min(v + d, target) : Math.max(v - d, target);
/** Frame-rate independent smoothing factor. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Deterministic PRNG (mulberry32) so procedural art is stable between runs. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixColor(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

export const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

export interface Poolable {
  active: boolean;
}

/**
 * Fixed-size object pool. Objects are allocated once and recycled – no GC
 * churn while particles / projectiles are flying around.
 */
export class Pool<T extends Poolable> {
  readonly items: T[] = [];
  private cursor = 0;
  constructor(size: number, factory: () => T) {
    for (let i = 0; i < size; i++) this.items.push(factory());
  }
  /** Returns a free object (already flagged active) or null if exhausted. */
  acquire(): T | null {
    const n = this.items.length;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const it = this.items[idx];
      if (!it.active) {
        this.cursor = idx + 1;
        it.active = true;
        return it;
      }
    }
    return null;
  }
  releaseAll() {
    for (const it of this.items) it.active = false;
  }
  get activeCount() {
    let c = 0;
    for (const it of this.items) if (it.active) c++;
    return c;
  }
}
