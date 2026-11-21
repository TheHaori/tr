/**
 * Pooled projectiles shared by the player (aether bolts) and hostile things
 * (turret bolts, darts, falling rocks, shockwaves).
 */
import { Pool, overlap, sign } from './util';
import type { Poolable } from './util';
import type { PlayScene } from './play';

export type ProjKind = 'bolt' | 'rock' | 'wave' | 'dart';

export interface Projectile extends Poolable {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number; gravity: number;
  owner: 'p' | 'e';
  dmg: number; color: string; kind: ProjKind;
  life: number; pierce: boolean; age: number;
}

export type ProjInit = Partial<Omit<Projectile, 'active'>> & { x: number; y: number; vx: number; vy: number };

export class Projectiles {
  pool = new Pool<Projectile>(96, () => ({
    active: false, x: 0, y: 0, w: 6, h: 6, vx: 0, vy: 0, gravity: 0, owner: 'e', dmg: 1,
    color: '#fff', kind: 'bolt', life: 3, pierce: false, age: 0,
  }));

  /** Spawn a projectile; `x`,`y` are the *centre*. */
  fire(o: ProjInit) {
    const p = this.pool.acquire();
    if (!p) return null;
    p.w = o.w ?? 6; p.h = o.h ?? 6;
    p.x = o.x - p.w / 2; p.y = o.y - p.h / 2;
    p.vx = o.vx; p.vy = o.vy;
    p.gravity = o.gravity ?? 0;
    p.owner = o.owner ?? 'e';
    p.dmg = o.dmg ?? 1;
    p.color = o.color ?? '#ff6bd0';
    p.kind = o.kind ?? 'bolt';
    p.life = o.life ?? 4;
    p.pierce = o.pierce ?? false;
    p.age = 0;
    return p;
  }

  kill(p: Projectile, s: PlayScene, fxCol?: string) {
    p.active = false;
    s.fx.burst(p.x + p.w / 2, p.y + p.h / 2, p.kind === 'rock' ? 10 : 5, {
      color: fxCol ?? (p.kind === 'rock' ? ['#8a8fa6', '#555b70'] : p.color), speed: 60, life: 0.35, size: 2, gravity: p.kind === 'rock' ? 200 : 0, glow: p.kind !== 'rock',
    });
    if (p.kind === 'rock') s.audio.sfx('collapse', 0.4);
  }

  update(dt: number, s: PlayScene) {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      p.age += dt;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'wave') {
        // hugs the ground, dies on walls / ledges
        if (s.world.solidRect(p.x, p.y, p.w, p.h - 2) || !s.world.solidAt(p.x + p.w / 2, p.y + p.h + 2)) { this.kill(p, s); continue; }
      } else if (s.world.solidRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2)) {
        this.kill(p, s);
        continue;
      }
      if (p.kind === 'bolt' && Math.random() < 0.5) s.fx.emit(p.x + p.w / 2, p.y + p.h / 2, { color: p.color, speed: 8, life: 0.25, size: 2, size2: 0, glow: true });
      if (p.owner === 'e') {
        if (overlap(p, s.player) && s.player.damage(p.dmg, p.x + p.w / 2, s)) this.kill(p, s);
      } else {
        for (const e of s.enemies) {
          if (e.dead || !overlap(p, e)) continue;
          e.hurt(p.dmg, sign(p.vx) || 1, s, 'bolt');
          if (!p.pierce) { this.kill(p, s); break; }
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      const x = Math.round(p.x - cx), y = Math.round(p.y - cy);
      switch (p.kind) {
        case 'bolt':
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y + 1, p.w, p.h - 2);
          ctx.fillRect(x + 1, y, p.w - 2, p.h);
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 2, y + 2, Math.max(1, p.w - 4), Math.max(1, p.h - 4));
          break;
        case 'rock':
          ctx.fillStyle = '#555b70'; ctx.fillRect(x, y, p.w, p.h);
          ctx.fillStyle = '#8a8fa6'; ctx.fillRect(x, y, p.w - 2, 3); ctx.fillRect(x, y, 3, p.h - 2);
          ctx.fillStyle = '#383d52'; ctx.fillRect(x + p.w - 3, y + 4, 3, p.h - 4);
          break;
        case 'wave': {
          const dir = sign(p.vx) || 1;
          ctx.fillStyle = '#ffb05a';
          ctx.fillRect(x, y + 3, p.w, p.h - 3);
          ctx.fillStyle = '#fff2b0';
          ctx.fillRect(dir > 0 ? x + p.w - 4 : x, y, 4, p.h);
          ctx.fillRect(x, y + p.h - 2, p.w, 2);
          break;
        }
        case 'dart':
          ctx.fillStyle = '#c8d0e6'; ctx.fillRect(x, y, p.w, p.h);
          ctx.fillStyle = '#ff7a7a'; ctx.fillRect(p.vx > 0 ? x + p.w - 2 : x, y, 2, p.h);
          break;
      }
    }
  }

  clear() { this.pool.releaseAll(); }
}
