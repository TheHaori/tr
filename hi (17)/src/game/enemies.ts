/**
 * Enemy base class and the regular enemy roster. Each enemy type has its own
 * behaviour pattern (state machine) and procedural pixel-art drawing.
 *
 *  - Slime    : patrols, hops at the player
 *  - Bat      : hangs, telegraphs, dives, retreats
 *  - Sentinel : stationary stone turret, telegraphed aimed shots
 *  - Knight   : shielded patroller, wind-up + charge, stunned by walls
 *  - Wisp     : shy ghost – only moves while you look away
 */
import { rand, sign, approach } from './util';
import type { Rect } from './types';
import type { PlayScene } from './play';

export type HitSource = 'melee' | 'bolt' | 'stomp' | 'dash';

export const R = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

export abstract class Enemy implements Rect {
  vx = 0; vy = 0; kx = 0;
  facing = -1;
  dead = false;
  flash = 0;
  stun = 0;
  t = Math.random() * 10;
  onGround = false;
  contact = 1;
  stompable = true;
  invulnerable = false;
  harmless = false;
  guarding = false;
  name = '';
  homeX: number; homeY: number;
  constructor(public kind: string, public x: number, public y: number, public w: number, public h: number, public hp: number) {
    this.homeX = x; this.homeY = y;
    this._max = hp;
  }
  get maxHp() { return this._max; }
  protected _max: number;
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  abstract think(dt: number, s: PlayScene): void;
  abstract draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene): void;

  update(dt: number, s: PlayScene) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.think(dt, s);
  }

  /** Gravity + tile collision for walkers. */
  protected physics(dt: number, s: PlayScene, gravity = true): { wall: boolean } {
    if (gravity) this.vy = Math.min(this.vy + 900 * dt, 300);
    const h = s.world.move(this, (this.vx + this.kx) * dt, 0);
    const v = s.world.move(this, 0, this.vy * dt);
    this.onGround = v.d;
    if (v.d || v.u) this.vy = 0;
    this.kx = approach(this.kx, 0, 420 * dt);
    return { wall: h.l || h.r };
  }

  /** Return true to block the hit (shields). */
  protected guard(_dir: number, _src: HitSource): boolean { return false; }

  hurt(dmg: number, dir: number, s: PlayScene, src: HitSource): boolean {
    if (this.dead || this.invulnerable) return false;
    if (this.guard(dir, src)) {
      s.audio.sfx('clink');
      s.fx.burst(this.cx - dir * (this.w / 2), this.cy, 5, { color: ['#fff', '#ffe27a'], speed: 80, life: 0.2, size: 2, glow: true });
      this.kx = dir * 40;
      return false;
    }
    this.hp -= dmg;
    this.flash = 0.12;
    this.kx = dir * 130;
    if (!this.floats) this.vy = -80;
    s.audio.sfx('hit');
    s.fx.burst(this.cx, this.cy, 8, { color: ['#fff', '#ffe27a'], speed: 90, life: 0.3, size: 2 });
    s.fx.text(this.cx, this.y - 4, `-${dmg}`, '#ffe27a');
    if (this.hp <= 0) this.die(s);
    return true;
  }
  protected floats = false;

  die(s: PlayScene) {
    this.dead = true;
    s.audio.sfx('enemydie');
    s.fx.burst(this.cx, this.cy, 18, { color: this.deathColors(), speed: 110, life: 0.6, size: 3, size2: 0, gravity: 160 });
    s.fx.ring(this.cx, this.cy, '#fff');
    s.shake(0.25);
    s.onEnemyKilled(this);
  }
  protected deathColors(): string[] { return ['#fff', '#ffe27a', '#ff9a5a']; }
}

// ------------------------------------------------------------------ Slime
export class Slime extends Enemy {
  hop = rand(0.5, 1.5);
  constructor(x: number, y: number) { super('slime', x + 2, y + 6, 12, 10, 2); }
  think(dt: number, s: PlayScene) {
    const p = s.player;
    if (this.onGround) {
      this.vx = this.facing * 24;
      this.hop -= dt;
      const ahead = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
      if (!s.world.solidAt(ahead, this.y + this.h + 2) && !s.world.oneWayBelow(this)) this.facing *= -1;
      if (this.hop <= 0 && Math.abs(p.cx - this.cx) < 110 && Math.abs(p.cy - this.cy) < 50) {
        this.facing = sign(p.cx - this.cx) || 1;
        this.vy = -175; this.vx = this.facing * 62; this.hop = rand(1.2, 2.3);
        this.onGround = false;
      }
    }
    const r = this.physics(dt, s);
    if (r.wall) { this.facing *= -1; this.vx = 0; }
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const sq = this.onGround ? Math.sin(this.t * 6) * 0.5 : -1;
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    const body = f ? '#fff' : '#5fd37a', dark = f ? '#fff' : '#2f8f52', hi = f ? '#fff' : '#b4f5b0';
    const rows = [[3, 6], [1, 10], [0, 12], [0, 12], [0, 12], [0, 12], [0, 12], [0, 12]];
    const top = Math.round(2 + sq * 0.6);
    rows.forEach(([ox, w], i) => R(ctx, i > 5 ? dark : body, x + ox - (sq < 0 ? -0 : 0), y + top + i, w, 1));
    R(ctx, hi, x + 3, y + top + 1, 3, 1);
    R(ctx, hi, x + 2, y + top + 2, 1, 2);
    R(ctx, '#fff', x + (this.facing > 0 ? 6 : 3), y + top + 3, 3, 3);
    R(ctx, '#1d2540', x + (this.facing > 0 ? 7 : 3), y + top + 4, 2, 2);
  }
  protected deathColors() { return ['#5fd37a', '#b4f5b0', '#2f8f52']; }
}

// -------------------------------------------------------------------- Bat
export class Bat extends Enemy {
  state: 'hang' | 'warn' | 'dive' | 'return' = 'hang';
  timer = 0; cd = 0; dx = 0; dy = 0;
  constructor(x: number, y: number) { super('bat', x + 3, y + 4, 10, 8, 1); this.floats = true; }
  think(dt: number, s: PlayScene) {
    const p = s.player;
    this.cd -= dt;
    this.timer -= dt;
    if (this.kx) { this.x += this.kx * dt; this.kx = approach(this.kx, 0, 400 * dt); }
    switch (this.state) {
      case 'hang':
        this.y = this.homeY + Math.sin(this.t * 3) * 2;
        this.x = this.homeX + Math.sin(this.t * 1.3) * 3;
        if (this.cd <= 0 && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 95) { this.state = 'warn'; this.timer = 0.5; s.audio.sfx('warn', 0.6); }
        break;
      case 'warn':
        this.x += Math.sin(this.t * 80) * 0.4;
        this.facing = sign(p.cx - this.cx) || 1;
        if (this.timer <= 0) {
          const d = Math.hypot(p.cx - this.cx, p.cy - this.cy) || 1;
          this.dx = (p.cx - this.cx) / d; this.dy = (p.cy - this.cy) / d;
          this.state = 'dive'; this.timer = 0.9;
        }
        break;
      case 'dive':
        this.x += this.dx * 175 * dt; this.y += this.dy * 175 * dt;
        if (this.timer <= 0 || s.world.solidRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4)) { this.state = 'return'; this.timer = 3; }
        break;
      case 'return': {
        const dx = this.homeX - this.x, dy = this.homeY - this.y, d = Math.hypot(dx, dy);
        if (d < 3 || this.timer <= 0) { this.state = 'hang'; this.cd = 1.2; this.x = this.homeX; this.y = this.homeY; }
        else { this.x += (dx / d) * 75 * dt; this.y += (dy / d) * 75 * dt; }
        break;
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    const body = f ? '#fff' : '#5a3a86', wing = f ? '#fff' : '#3a2560';
    const flap = this.state === 'hang' ? Math.sin(this.t * 4) * 1 : Math.sin(this.t * 28) * 3;
    R(ctx, wing, x - 5, y + 1 - flap, 5, 3);
    R(ctx, wing, x - 3, y + 4 - flap, 3, 2);
    R(ctx, wing, x + 10, y + 1 - flap, 5, 3);
    R(ctx, wing, x + 10, y + 4 - flap, 3, 2);
    R(ctx, body, x + 1, y, 8, 7);
    R(ctx, body, x + 2, y + 7, 6, 1);
    R(ctx, body, x + 1, y - 2, 2, 2);
    R(ctx, body, x + 7, y - 2, 2, 2);
    const eye = this.state === 'warn' || this.state === 'dive' ? '#ffec5a' : '#ff5a7a';
    R(ctx, eye, x + 2, y + 2, 2, 2);
    R(ctx, eye, x + 6, y + 2, 2, 2);
  }
  protected deathColors() { return ['#5a3a86', '#ff5a7a', '#fff']; }
}

// --------------------------------------------------------------- Sentinel
export class Sentinel extends Enemy {
  cool = rand(0.5, 1.5); warn = 0; burst = 0;
  constructor(x: number, y: number) { super('sentinel', x + 2, y + 2, 12, 14, 3); }
  think(dt: number, s: PlayScene) {
    const p = s.player;
    this.physics(dt, s);
    this.facing = sign(p.cx - this.cx) || this.facing;
    const near = Math.hypot(p.cx - this.cx, p.cy - this.cy) < 185 && Math.abs(p.cy - this.cy) < 95;
    if (this.warn > 0) {
      this.warn -= dt;
      if (this.warn <= 0) { this.burst = this.hp <= 1 ? 3 : 1; this.cool = 0; }
    } else if (this.burst > 0) {
      this.cool -= dt;
      if (this.cool <= 0) { this.shoot(s); this.burst--; this.cool = 0.16; if (this.burst === 0) this.cool = this.hp <= 1 ? 1.5 : 2.2; }
    } else {
      this.cool -= dt;
      if (this.cool <= 0 && near) { this.warn = 0.55; s.audio.sfx('warn', 0.7); }
    }
  }
  private shoot(s: PlayScene) {
    const p = s.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    s.projectiles.fire({ x: this.cx, y: this.cy - 2, vx: (dx / d) * 105, vy: (dy / d) * 105, color: '#ff6bd0', owner: 'e' });
    s.audio.sfx('dart', 0.6);
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    R(ctx, f ? '#fff' : '#555b70', x - 1, y - 1, 14, 16);
    R(ctx, f ? '#fff' : '#8a8fa6', x, y, 12, 14);
    R(ctx, f ? '#fff' : '#a9aec6', x, y, 12, 2);
    R(ctx, f ? '#fff' : '#6a7090', x + 8, y + 2, 4, 12);
    R(ctx, '#2a2f48', x + 3, y + 4, 6, 5);
    const glow = this.warn > 0 ? (Math.sin(this.t * 40) > 0 ? '#fff' : '#ff6bd0') : '#ff6bd0';
    R(ctx, glow, x + 4, y + 5, 4, 3);
    if (this.warn > 0) R(ctx, 'rgba(255,107,208,0.35)', x - 3, y + 2, 18, 9);
    R(ctx, '#555b70', x + 1, y + 11, 3, 1);
    R(ctx, '#555b70', x + 8, y + 11, 3, 1);
    R(ctx, f ? '#fff' : '#9cc88a', x + 1, y + 13, 2, 1);
  }
  protected deathColors() { return ['#8a8fa6', '#ff6bd0', '#fff']; }
}

// ----------------------------------------------------------------- Knight
export class Knight extends Enemy {
  state: 'patrol' | 'windup' | 'charge' | 'stun' = 'patrol';
  timer = 0;
  constructor(x: number, y: number) { super('knight', x + 2, y, 12, 16, 4); }
  protected guard(dir: number, src: HitSource) {
    if (src === 'stomp' || this.state === 'stun') return false;
    return dir === -this.facing; // attack travelling against our facing = hit the shield
  }
  think(dt: number, s: PlayScene) {
    const p = s.player;
    this.timer -= dt;
    this.guarding = this.state !== 'stun';
    switch (this.state) {
      case 'patrol': {
        this.vx = this.facing * 28;
        const ahead = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
        if (this.onGround && !s.world.solidAt(ahead, this.y + this.h + 2) && !s.world.oneWayBelow(this)) this.facing *= -1;
        const dx = p.cx - this.cx;
        if (Math.abs(dx) < 130 && Math.abs(p.cy - this.cy) < 28 && sign(dx) === this.facing) {
          this.state = 'windup'; this.timer = 0.55; this.vx = 0; s.audio.sfx('warn');
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        if (this.timer <= 0) { this.state = 'charge'; this.timer = 1; s.audio.sfx('dash', 0.6); }
        break;
      case 'charge':
        this.vx = this.facing * 180;
        if (this.onGround && Math.random() < 0.5) s.fx.dust(this.cx - this.facing * 6, this.y + this.h, -this.facing);
        break;
      case 'stun':
        this.vx = 0;
        if (this.timer <= 0) this.state = 'patrol';
        break;
    }
    const ledge = this.state === 'charge' && this.onGround && !s.world.solidAt(this.facing > 0 ? this.x + this.w + 4 : this.x - 4, this.y + this.h + 2);
    const r = this.physics(dt, s);
    if (this.state === 'charge' && (r.wall || ledge || this.timer <= 0)) {
      if (r.wall) { s.shake(0.35); s.audio.sfx('slam', 0.6); s.fx.burst(this.cx + this.facing * 8, this.cy, 8, { color: ['#8a8fa6', '#fff'], speed: 70, life: 0.4, gravity: 200 }); }
      this.state = 'stun'; this.timer = 1.2; this.vx = 0;
    } else if (this.state === 'patrol' && r.wall) this.facing *= -1;
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    const fc = this.facing;
    const bob = this.state === 'patrol' ? Math.round(Math.sin(this.t * 8)) : 0;
    const steel = f ? '#fff' : '#9aa3bf', dark = f ? '#fff' : '#5a6382';
    const leg = this.state === 'patrol' || this.state === 'charge' ? Math.sin(this.t * (this.state === 'charge' ? 24 : 9)) * 2 : 0;
    R(ctx, dark, x + 2 + leg, y + 12, 3, 4);
    R(ctx, dark, x + 7 - leg, y + 12, 3, 4);
    R(ctx, '#2a2f48', x - 1 + 1, y - 1 + bob, 12, 14);
    R(ctx, steel, x + 1, y + 5 + bob, 10, 7);
    R(ctx, steel, x + 1, y + bob, 10, 6);
    R(ctx, '#1d2030', x + (fc > 0 ? 5 : 1), y + 2 + bob, 6, 2);
    R(ctx, this.state === 'windup' ? '#ffec5a' : '#ff5a5a', x + (fc > 0 ? 8 : 2), y + 2 + bob, 2, 2);
    R(ctx, f ? '#fff' : '#d84a4a', x + 4, y - 3 + bob, 4, 3); // plume
    // shield on the front
    R(ctx, dark, x + (fc > 0 ? 9 : -3), y + 4 + bob, 6, 9);
    R(ctx, f ? '#fff' : '#c8a14a', x + (fc > 0 ? 11 : -1), y + 7 + bob, 2, 3);
    // sword raised during windup
    if (this.state === 'windup' || this.state === 'charge') {
      R(ctx, '#e8eeff', x + (fc > 0 ? 8 : 3), y - 8, 1, 10);
      R(ctx, '#c8a14a', x + (fc > 0 ? 7 : 2), y + 2, 3, 1);
    }
    if (this.state === 'stun') {
      for (let i = 0; i < 3; i++) R(ctx, '#ffe27a', x + 6 + Math.cos(this.t * 8 + i * 2.1) * 7, y - 5 + Math.sin(this.t * 8 + i * 2.1) * 2, 2, 2);
    }
  }
}

// ------------------------------------------------------------------- Wisp
export class Wisp extends Enemy {
  shy = false;
  constructor(x: number, y: number) { super('wisp', x + 3, y + 3, 10, 10, 2); this.floats = true; }
  think(dt: number, s: PlayScene) {
    const p = s.player;
    const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
    // watched when the player is facing towards the wisp
    this.shy = d < 220 && sign(dx) === p.facing;
    if (this.kx) { this.x += this.kx * dt; this.kx = approach(this.kx, 0, 400 * dt); }
    if (!this.shy && d < 220) {
      this.x += (dx / d) * 42 * dt;
      this.y += (dy / d) * 42 * dt + Math.sin(this.t * 3) * 0.3;
    } else {
      this.y += Math.sin(this.t * 2) * 0.2;
    }
    this.facing = sign(dx) || 1;
    this.harmless = false;
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = this.x - cx, y = this.y - cy;
    const f = this.flash > 0;
    ctx.globalAlpha = this.shy ? 0.55 : 0.95;
    const c = f ? '#fff' : this.shy ? '#b8c8ff' : '#e8f0ff';
    R(ctx, c, x + 2, y, 6, 1);
    R(ctx, c, x, y + 1, 10, 6);
    R(ctx, c, x + 1, y + 7, 2, 3 + Math.round(Math.sin(this.t * 6)));
    R(ctx, c, x + 4, y + 7, 2, 2 + Math.round(Math.cos(this.t * 6)));
    R(ctx, c, x + 7, y + 7, 2, 3 - Math.round(Math.sin(this.t * 6)));
    if (this.shy) {
      R(ctx, '#7a8cd0', x + 1, y + 3, 8, 2); // hands over the eyes
      R(ctx, '#ff9ab0', x + 1, y + 5, 2, 1); R(ctx, '#ff9ab0', x + 7, y + 5, 2, 1);
    } else {
      R(ctx, '#1d2540', x + 2, y + 3, 2, 3);
      R(ctx, '#1d2540', x + 6, y + 3, 2, 3);
      R(ctx, '#1d2540', x + 4, y + 6, 2, 1);
    }
    ctx.globalAlpha = 1;
  }
  protected deathColors() { return ['#e8f0ff', '#b8c8ff', '#fff']; }
}

export function createEnemy(ch: string, tx: number, ty: number): Enemy | null {
  const x = tx * 16, y = ty * 16;
  switch (ch) {
    case 's': return new Slime(x, y);
    case 'b': return new Bat(x, y);
    case 'r': return new Sentinel(x, y);
    case 'k': return new Knight(x, y);
    case 'w': return new Wisp(x, y);
    default: return null;
  }
}

