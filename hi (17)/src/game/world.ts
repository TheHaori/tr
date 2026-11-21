/**
 * Tile world: parsing level strings, tile collision (solid / one-way /
 * collapsing), hazards, secret walls, boss-gate sealing and tile rendering.
 */
import { TILE as T, VIEW_W, VIEW_H } from './config';
import type { Rect } from './types';
import type { Tileset } from './themes';

export const AIR = 0, SOLID = 1, ONEWAY = 2, COLLAPSE = 3, SECRET = 4, SPIKE_UP = 5, LAVA = 6, SEALED = 7, SPIKE_DOWN = 8;

const CHAR_TILE: Record<string, number> = { '#': SOLID, '=': ONEWAY, C: COLLAPSE, S: SECRET, '^': SPIKE_UP, '~': LAVA, p: SPIKE_DOWN };

export interface Spawn { ch: string; tx: number; ty: number }
export interface Body extends Rect { vx: number; vy: number }
export interface Hit { l: boolean; r: boolean; u: boolean; d: boolean }

interface CollapseState { state: 'shake' | 'gone'; t: number }

export class World {
  readonly w: number;
  readonly h: number;
  readonly t: Uint8Array;
  readonly reveal: Float32Array;
  private revealTarget: Uint8Array;
  spawns: Spawn[] = [];
  collapse = new Map<number, CollapseState>();
  private sealed: number[] = [];
  onCollapse: (tx: number, ty: number) => void = () => {};

  constructor(rows: string[]) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.t = new Uint8Array(this.w * this.h);
    this.reveal = new Float32Array(this.w * this.h);
    this.revealTarget = new Uint8Array(this.w * this.h);
    rows.forEach((row, ty) => {
      for (let tx = 0; tx < this.w; tx++) {
        const ch = row[tx] ?? '.';
        if (CHAR_TILE[ch] !== undefined) this.t[ty * this.w + tx] = CHAR_TILE[ch];
        else if (ch === '<' || ch === '>') {
          this.t[ty * this.w + tx] = SOLID;
          this.spawns.push({ ch, tx, ty });
        } else if (ch !== '.' && ch !== ' ') this.spawns.push({ ch, tx, ty });
      }
    });
  }

  get pixelW() { return this.w * T; }
  get pixelH() { return this.h * T; }

  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return SOLID; // invisible side walls
    if (ty < 0 || ty >= this.h) return AIR;
    return this.t[ty * this.w + tx];
  }

  private isSolidCode(c: number, tx: number, ty: number) {
    if (c === SOLID || c === SEALED) return true;
    if (c === COLLAPSE) return this.collapse.get(ty * this.w + tx)?.state !== 'gone';
    return false;
  }
  solidTile(tx: number, ty: number) { return this.isSolidCode(this.get(tx, ty), tx, ty); }
  solidAt(px: number, py: number) { return this.solidTile(Math.floor(px / T), Math.floor(py / T)); }
  solidRect(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
    const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidTile(tx, ty)) return true;
    return false;
  }
  /** Is there a one-way (and no solid) tile directly under this body? */
  oneWayBelow(b: Rect): boolean {
    const ty = Math.floor((b.y + b.h + 1) / T);
    for (let tx = Math.floor(b.x / T); tx <= Math.floor((b.x + b.w - 0.001) / T); tx++) {
      if (this.get(tx, ty) === ONEWAY) return true;
    }
    return false;
  }

  /**
   * Axis-separated move with tile collision. Mutates b.x / b.y and returns
   * which sides were blocked. Max step must stay < one tile (true at 60 Hz).
   */
  move(b: Rect, dx: number, dy: number, dropThrough = false): Hit {
    const hit: Hit = { l: false, r: false, u: false, d: false };
    if (dx !== 0) {
      b.x += dx;
      const y0 = Math.floor(b.y / T), y1 = Math.floor((b.y + b.h - 0.001) / T);
      if (dx > 0) {
        const tx = Math.floor((b.x + b.w - 0.001) / T);
        for (let ty = y0; ty <= y1; ty++) if (this.solidTile(tx, ty)) { b.x = tx * T - b.w; hit.r = true; break; }
      } else {
        const tx = Math.floor(b.x / T);
        for (let ty = y0; ty <= y1; ty++) if (this.solidTile(tx, ty)) { b.x = (tx + 1) * T; hit.l = true; break; }
      }
    }
    if (dy !== 0) {
      const prevBottom = b.y + b.h;
      b.y += dy;
      const x0 = Math.floor(b.x / T), x1 = Math.floor((b.x + b.w - 0.001) / T);
      if (dy > 0) {
        const ty = Math.floor((b.y + b.h - 0.001) / T);
        for (let tx = x0; tx <= x1; tx++) {
          const c = this.get(tx, ty);
          if (this.isSolidCode(c, tx, ty) || (c === ONEWAY && !dropThrough && prevBottom <= ty * T + 0.01)) {
            b.y = ty * T - b.h; hit.d = true; break;
          }
        }
      } else {
        const ty = Math.floor(b.y / T);
        for (let tx = x0; tx <= x1; tx++) if (this.solidTile(tx, ty)) { b.y = (ty + 1) * T; hit.u = true; break; }
      }
    }
    return hit;
  }

  /** Check rectangle against spikes / lava. */
  hazardAt(r: Rect): 'spike' | 'lava' | null {
    const x0 = Math.floor(r.x / T), x1 = Math.floor((r.x + r.w - 0.001) / T);
    const y0 = Math.floor(r.y / T), y1 = Math.floor((r.y + r.h - 0.001) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = this.get(tx, ty);
        if (c === SPIKE_UP && r.x + r.w > tx * T + 3 && r.x < tx * T + 13 && r.y + r.h > ty * T + 8) return 'spike';
        if (c === SPIKE_DOWN && r.x + r.w > tx * T + 3 && r.x < tx * T + 13 && r.y < ty * T + 8) return 'spike';
        if (c === LAVA) {
          const surface = this.get(tx, ty - 1) !== LAVA;
          if (r.y + r.h > ty * T + (surface ? 5 : 0)) return 'lava';
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------- dynamic tiles
  stepOn(tx: number, ty: number) {
    if (this.get(tx, ty) !== COLLAPSE) return;
    const k = ty * this.w + tx;
    if (!this.collapse.has(k)) this.collapse.set(k, { state: 'shake', t: 0.42 });
  }

  /** Reveal a connected cluster of secret wall tiles. Returns true if newly revealed. */
  revealAt(tx: number, ty: number): boolean {
    if (this.get(tx, ty) !== SECRET || this.revealTarget[ty * this.w + tx]) return false;
    const stack = [[tx, ty]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (this.get(x, y) !== SECRET || this.revealTarget[y * this.w + x]) continue;
      this.revealTarget[y * this.w + x] = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push([x + dx, y + dy]);
    }
    return true;
  }

  /** Seal the boss gate: every empty tile in a column becomes solid. */
  seal(col: number) {
    for (let ty = 0; ty < this.h; ty++) {
      const i = ty * this.w + col;
      if (this.t[i] === AIR || this.t[i] === ONEWAY) { this.t[i] = SEALED; this.sealed.push(i); }
    }
  }
  unseal() {
    for (const i of this.sealed) this.t[i] = AIR;
    this.sealed = [];
  }
  get isSealed() { return this.sealed.length > 0; }

  update(dt: number, player: Rect) {
    for (const [k, c] of this.collapse) {
      c.t -= dt;
      const tx = k % this.w, ty = Math.floor(k / this.w);
      if (c.state === 'shake' && c.t <= 0) {
        c.state = 'gone'; c.t = 2.6;
        this.onCollapse(tx, ty);
      } else if (c.state === 'gone' && c.t <= 0) {
        const r = { x: tx * T, y: ty * T, w: T, h: T };
        const o = player.x < r.x + r.w && player.x + player.w > r.x && player.y < r.y + r.h && player.y + player.h > r.y;
        if (!o) this.collapse.delete(k);
        else c.t = 0.3;
      }
    }
    for (let i = 0; i < this.reveal.length; i++) {
      if (this.revealTarget[i] && this.reveal[i] < 1) this.reveal[i] = Math.min(1, this.reveal[i] + dt * 3);
    }
  }

  private visualSolid(tx: number, ty: number) {
    const c = this.get(tx, ty);
    return c === SOLID || c === SECRET || c === SEALED || (c === COLLAPSE && this.collapse.get(ty * this.w + tx)?.state !== 'gone');
  }

  /** Render visible tiles into the pixel buffer. */
  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, ts: Tileset, time: number) {
    const x0 = Math.max(0, Math.floor(camX / T)), x1 = Math.min(this.w - 1, Math.floor((camX + VIEW_W) / T));
    const y0 = Math.max(0, Math.floor(camY / T)), y1 = Math.min(this.h - 1, Math.floor((camY + VIEW_H) / T));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = this.t[ty * this.w + tx];
        if (c === AIR) continue;
        const sx = tx * T - camX, sy = ty * T - camY;
        const v = ((tx * 73856093) ^ (ty * 19349663)) & 3;
        switch (c) {
          case SOLID:
            ctx.drawImage(ts.fill[v], sx, sy);
            if (!this.visualSolid(tx, ty - 1)) ctx.drawImage(ts.top, sx, sy);
            break;
          case SECRET: {
            const a = 1 - this.reveal[ty * this.w + tx] * 0.8;
            ctx.globalAlpha = a;
            ctx.drawImage(ts.fill[v], sx, sy);
            if (!this.visualSolid(tx, ty - 1)) ctx.drawImage(ts.top, sx, sy);
            ctx.globalAlpha = 1;
            break;
          }
          case COLLAPSE: {
            const st = this.collapse.get(ty * this.w + tx);
            if (st?.state === 'gone') break;
            const jx = st ? Math.round(Math.sin(time * 90) * 1) : 0;
            ctx.drawImage(ts.fill[v], sx + jx, sy);
            ctx.drawImage(ts.cracks, sx + jx, sy);
            if (!this.visualSolid(tx, ty - 1)) ctx.drawImage(ts.top, sx + jx, sy);
            break;
          }
          case ONEWAY: ctx.drawImage(ts.oneway, sx, sy); break;
          case SPIKE_UP: ctx.drawImage(ts.spikeUp, sx, sy); break;
          case SPIKE_DOWN: ctx.drawImage(ts.spikeDown, sx, sy); break;
          case SEALED: {
            ctx.fillStyle = '#241a3e';
            ctx.fillRect(sx, sy, T, T);
            const pulse = 0.5 + 0.5 * Math.sin(time * 4 + ty);
            ctx.fillStyle = `rgba(180,120,255,${0.35 + pulse * 0.4})`;
            ctx.fillRect(sx + 5, sy + 2, 6, 1);
            ctx.fillRect(sx + 7, sy + 2, 2, 12);
            ctx.fillRect(sx + 4, sy + 13, 8, 1);
            break;
          }
          case LAVA: {
            const surface = this.get(tx, ty - 1) !== LAVA;
            ctx.fillStyle = '#e8441a';
            ctx.fillRect(sx, sy, T, T);
            ctx.fillStyle = '#ff7a24';
            ctx.fillRect(sx + ((tx * 5 + Math.floor(time * 3)) % 12), sy + 6 + (ty % 3) * 3, 4, 2);
            if (surface) {
              ctx.fillStyle = '#ffd25a';
              for (let i = 0; i < T; i += 2) {
                const wv = Math.round(Math.sin(time * 3 + (tx * T + i) * 0.35) * 1.5);
                ctx.fillRect(sx + i, sy + 3 + wv, 2, 3);
              }
              ctx.fillStyle = '#ff9a2a';
              ctx.fillRect(sx, sy + 7, T, 2);
            }
            break;
          }
        }
      }
    }
  }
}
