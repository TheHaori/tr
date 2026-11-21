/**
 * Reusable level "prefabs": pickups, checkpoints, exits, portals, moving
 * platforms, traps, springs and NPCs. Each is a tiny class with update/draw.
 */
import { overlap, rand } from './util';
import { R } from './enemies';
import type { NpcDef, Rect } from './types';
import type { PlayScene } from './play';

export interface Entity extends Rect {
  removed?: boolean;
  update(dt: number, s: PlayScene): void;
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene): void;
  light?(): { x: number; y: number; r: number } | null;
}

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, fill: string, shine = '#fff') {
  HEART.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === 'X') { ctx.fillStyle = fill; ctx.fillRect(x + i * px, y + j * px, px, px); }
  });
  ctx.fillStyle = shine;
  ctx.fillRect(x + px, y + px, px, px);
}

// ------------------------------------------------------------------ Pickup
export type PickupKind = 'coin' | 'crystal' | 'heart' | 'surge' | 'dashgem' | 'relic' | 'energy' | 'artifact';

export class Pickup implements Entity {
  w = 10; h = 10;
  vx = 0; vy = 0;
  t = rand(0, 6);
  cool = 0;
  age = 0;
  removed = false;
  constructor(public kind: PickupKind, public x: number, public y: number, public key = '', public physical = false) {
    if (kind === 'artifact') { this.w = 16; this.h = 16; }
  }
  update(dt: number, s: PlayScene) {
    this.t += dt;
    this.age += dt;
    const p = s.player;
    if (this.cool > 0) { this.cool -= dt; return; }
    if (this.physical) {
      this.vy = Math.min(this.vy + 600 * dt, 300);
      const h = s.world.move(this, this.vx * dt, 0);
      if (h.l || h.r) this.vx *= -0.5;
      const v = s.world.move(this, 0, this.vy * dt);
      if (v.d) { this.vy = this.vy > 80 ? -this.vy * 0.4 : 0; this.vx *= 0.8; }
      if (this.age > 14) this.removed = true;
    }
    // coin magnet (upgrade) and auto-magnet for dropped loot
    const mag = s.upgrade('magnet');
    const range = this.physical && this.age > 0.5 ? 46 : (this.kind === 'coin' || this.kind === 'energy') && mag > 0 ? 24 + mag * 22 : 0;
    if (range > 0) {
      const dx = p.cx - (this.x + 5), dy = p.cy - (this.y + 5), d = Math.hypot(dx, dy);
      if (d < range && d > 1) { this.x += (dx / d) * 150 * dt; this.y += (dy / d) * 150 * dt; this.vy = 0; }
    }
    if (!p.dead && overlap({ x: p.x - 2, y: p.y - 2, w: p.w + 4, h: p.h + 4 }, this)) {
      if (this.kind === 'dashgem') {
        if (p.dashes >= p.maxDashes && p.airJumps >= 1) return;
        this.cool = 2.5;
      } else this.removed = true;
      s.onPickup(this);
    }
  }
  light() {
    if (this.cool > 0) return null;
    if (this.kind === 'crystal' || this.kind === 'relic' || this.kind === 'artifact' || this.kind === 'surge') return { x: this.x + 5, y: this.y + 5, r: this.kind === 'artifact' ? 70 : 28 };
    return null;
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    if (this.cool > 0) {
      if (this.kind === 'dashgem') { ctx.globalAlpha = 0.25; R(ctx, '#7dffb0', this.x - cx + 3, this.y - cy + 3, 4, 4); ctx.globalAlpha = 1; }
      return;
    }
    const bob = this.physical ? 0 : Math.round(Math.sin(this.t * 3) * 1.5);
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy) + bob;
    switch (this.kind) {
      case 'coin': {
        const w = Math.max(1, Math.round(Math.abs(Math.cos(this.t * 5)) * 6));
        R(ctx, '#a8741a', x + 5 - w / 2 - 1, y + 1, w + 2, 8);
        R(ctx, '#ffd23f', x + 5 - w / 2, y + 2, w, 6);
        if (w > 3) R(ctx, '#fff3a8', x + 5 - w / 2 + 1, y + 3, 1, 3);
        break;
      }
      case 'crystal': {
        R(ctx, '#1f6a9a', x + 2, y + 3, 6, 6);
        R(ctx, '#1f6a9a', x + 3, y + 1, 4, 10);
        R(ctx, '#5ae6ff', x + 3, y + 3, 4, 6);
        R(ctx, '#5ae6ff', x + 4, y + 1, 2, 9);
        R(ctx, '#e8ffff', x + 4, y + 3, 1, 3);
        if (Math.sin(this.t * 6) > 0.8) R(ctx, '#fff', x + 8, y, 2, 2);
        s.bg.drawGlow(ctx, x + 5, y + 5, 12, 0.35);
        break;
      }
      case 'heart': drawHeart(ctx, x + 1, y + 2, 1, '#ff4a6a'); R(ctx, '#ff4a6a', x, y + 1, 1, 1); R(ctx, '#ff4a6a', x + 8, y + 1, 1, 1); R(ctx, '#ff4a6a', x + 1, y + 2, 7, 3); break;
      case 'surge':
        s.bg.drawGlow(ctx, x + 5, y + 5, 14, 0.5);
        R(ctx, '#ff9a2a', x + 1, y + 1, 8, 8);
        R(ctx, '#ffe27a', x + 3, y + 2, 4, 2); R(ctx, '#ffe27a', x + 4, y + 4, 3, 2); R(ctx, '#ffe27a', x + 3, y + 6, 3, 2);
        break;
      case 'dashgem': {
        R(ctx, '#2a9a5a', x + 1, y + 3, 8, 4); R(ctx, '#2a9a5a', x + 3, y + 1, 4, 8);
        R(ctx, '#7dffb0', x + 2, y + 4, 6, 2); R(ctx, '#7dffb0', x + 4, y + 2, 2, 6);
        s.bg.drawGlow(ctx, x + 5, y + 5, 12, 0.3);
        break;
      }
      case 'relic': {
        s.bg.drawGlow(ctx, x + 5, y + 5, 18, 0.55 + Math.sin(this.t * 4) * 0.2);
        const c = '#d79bff';
        R(ctx, c, x + 4, y, 2, 10); R(ctx, c, x, y + 4, 10, 2); R(ctx, c, x + 2, y + 2, 6, 6);
        R(ctx, '#fff', x + 4, y + 4, 2, 2);
        break;
      }
      case 'energy': R(ctx, '#5aa0ff', x + 3, y + 3, 4, 4); R(ctx, '#bfe0ff', x + 4, y + 4, 2, 2); break;
      case 'artifact': {
        const r = 7 + Math.sin(this.t * 3);
        s.bg.drawGlow(ctx, x + 8, y + 8, 46, 0.8);
        ctx.fillStyle = '#fff6c0';
        ctx.beginPath(); ctx.arc(x + 8, y + 8, r, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#ffd36a';
        ctx.beginPath(); ctx.arc(x + 8, y + 8, r - 3, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x + 6, y + 5, 3, 3);
        break;
      }
    }
  }
}

// -------------------------------------------------------------- Checkpoint
export class Checkpoint implements Entity {
  x: number; y: number; w = 12; h = 24;
  active = false;
  t = rand(0, 5);
  constructor(tx: number, ty: number) { this.x = tx * 16 + 2; this.y = ty * 16 - 8; }
  update(dt: number, s: PlayScene) {
    this.t += dt;
    if (!this.active && overlap(s.player, this)) s.activateCheckpoint(this);
    if (this.active && Math.random() < 0.15) s.fx.emit(this.x + 6, this.y + 6, { color: ['#ffb84a', '#ffe27a'], speed: 12, angle: -Math.PI / 2, arc: 0.5, life: 0.8, size: 2, size2: 0, glow: true });
  }
  light() { return this.active ? { x: this.x + 6, y: this.y + 8, r: 58 } : null; }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    R(ctx, '#3a3350', x + 5, y + 8, 2, 16);
    R(ctx, '#554c75', x + 2, y + 21, 8, 3);
    R(ctx, '#2a2540', x + 2, y + 2, 8, 9);
    R(ctx, this.active ? '#ffe9a0' : '#3a4a7a', x + 3, y + 3, 6, 7);
    if (this.active) {
      const fl = Math.round(Math.sin(this.t * 14) * 1);
      R(ctx, '#ff9a3a', x + 4, y + 5 + fl, 4, 5 - fl);
      R(ctx, '#fff6c0', x + 5, y + 7, 2, 3);
      s.bg.drawGlow(ctx, x + 6, y + 7, 22, 0.45);
    }
    R(ctx, '#554c75', x + 1, y + 1, 10, 2);
    R(ctx, '#554c75', x + 4, y - 1, 4, 2);
  }
}

// ------------------------------------------------------------- Exit portal
export class ExitGate implements Entity {
  x: number; y: number; w = 24; h = 32;
  t = 0;
  constructor(tx: number, ty: number) { this.x = tx * 16 - 4; this.y = ty * 16 - 16; }
  update(dt: number, s: PlayScene) {
    this.t += dt;
    if (s.exitOpen && overlap({ x: s.player.x + 2, y: s.player.y, w: s.player.w - 4, h: s.player.h }, this)) s.completeLevel();
  }
  light() { return { x: this.x + 12, y: this.y + 16, r: 48 }; }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const open = s.exitOpen;
    R(ctx, '#2a2f48', x, y + 4, 24, 28);
    R(ctx, '#6a7090', x + 1, y + 4, 4, 28); R(ctx, '#6a7090', x + 19, y + 4, 4, 28);
    R(ctx, '#8a90b0', x + 3, y, 18, 5); R(ctx, '#6a7090', x + 5, y - 2, 14, 3);
    const inner = open ? '#b78cff' : '#2a2540';
    R(ctx, inner, x + 5, y + 6, 14, 26);
    if (open) {
      for (let i = 0; i < 6; i++) {
        const yy = y + 8 + i * 4;
        R(ctx, i % 2 ? '#ffffff' : '#e0c8ff', x + 6 + Math.round(Math.sin(this.t * 4 + i) * 3) + 3, yy, 4, 2);
      }
      s.bg.drawGlow(ctx, x + 12, y + 18, 34, 0.55);
    } else {
      R(ctx, '#ff5a7a', x + 10, y + 14, 4, 4);
    }
  }
}

// ---------------------------------------------------------- Secret portal
export class SecretPortal implements Entity {
  x: number; y: number; w = 20; h = 28; t = 0;
  constructor(tx: number, ty: number, public target: string) { this.x = tx * 16 - 2; this.y = ty * 16 - 12; }
  update(dt: number) { this.t += dt; }
  light() { return { x: this.x + 10, y: this.y + 14, r: 44 }; }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    s.bg.drawGlow(ctx, x + 10, y + 14, 36, 0.6);
    for (let i = 0; i < 7; i++) {
      const a = this.t * 3 + i * 0.9;
      R(ctx, i % 2 ? '#7af0ff' : '#d79bff', x + 8 + Math.cos(a) * 7, y + 12 + Math.sin(a) * 11, 3, 3);
    }
    R(ctx, '#fff', x + 9, y + 12, 3, 4);
  }
}

// --------------------------------------------------------- Moving platform
export class MovingPlatform implements Entity {
  x: number; y: number; w = 28; h = 7;
  ox: number; oy: number; px: number; py: number; dx = 0; dy = 0; t: number;
  constructor(tx: number, ty: number, public vertical: boolean) {
    this.ox = tx * 16 - 6; this.oy = ty * 16;
    this.x = this.ox; this.y = this.oy; this.px = this.x; this.py = this.y;
    this.t = tx * 0.7;
  }
  update(dt: number) {
    this.t += dt * (this.vertical ? 0.95 : 1.05);
    this.px = this.x; this.py = this.y;
    const s = Math.sin(this.t);
    if (this.vertical) this.y = this.oy + s * 36; else this.x = this.ox + s * 40;
    this.dx = this.x - this.px; this.dy = this.y - this.py;
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    R(ctx, '#3a3f58', x, y + 2, this.w, 5);
    R(ctx, '#8a90b0', x, y, this.w, 3);
    R(ctx, '#b4bad8', x, y, this.w, 1);
    R(ctx, '#7af0ff', x + 4, y + 4, 2, 1); R(ctx, '#7af0ff', x + 13, y + 4, 2, 1); R(ctx, '#7af0ff', x + 22, y + 4, 2, 1);
  }
}

// ---------------------------------------------------------------- Dart trap
export class DartTrap implements Entity {
  x: number; y: number; w = 16; h = 16;
  timer: number; dir: number;
  constructor(tx: number, ty: number, ch: string) {
    this.x = tx * 16; this.y = ty * 16; this.dir = ch === '<' ? -1 : 1;
    this.timer = 1 + ((tx * 37) % 10) / 10 * 1.4;
  }
  update(dt: number, s: PlayScene) {
    if (Math.abs(s.player.cx - this.x) > 230) return;
    const before = this.timer;
    this.timer -= dt;
    if (before > 0.35 && this.timer <= 0.35) s.audio.sfx('warn', 0.3);
    if (this.timer <= 0) {
      s.projectiles.fire({ x: this.x + 8 + this.dir * 9, y: this.y + 8, vx: this.dir * 150, vy: 0, w: 8, h: 4, kind: 'dart', life: 3 });
      s.audio.sfx('dart', 0.5);
      this.timer = 2.3;
    }
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const charge = this.timer < 0.35;
    const face = this.dir > 0 ? x + 10 : x;
    R(ctx, '#2a2f48', face, y + 4, 6, 8);
    R(ctx, charge ? '#ff5a5a' : '#12142a', face + (this.dir > 0 ? 1 : 1), y + 6, 4, 4);
    R(ctx, '#ff7a7a', this.dir > 0 ? x + 12 : x + 2, y + 2, 2, 1);
  }
}

// ------------------------------------------------------------ Falling spike
export class FallingSpike implements Entity {
  x: number; y: number; w = 10; h = 14;
  ox: number; oy: number; state: 'hang' | 'shake' | 'fall' | 'gone' = 'hang';
  timer = 0; vy = 0;
  constructor(tx: number, ty: number) { this.ox = this.x = tx * 16 + 3; this.oy = this.y = ty * 16; }
  update(dt: number, s: PlayScene) {
    const p = s.player;
    this.timer -= dt;
    switch (this.state) {
      case 'hang':
        if (Math.abs(p.cx - (this.x + 5)) < 14 && p.y > this.y && p.y - this.y < 200) { this.state = 'shake'; this.timer = 0.4; s.audio.sfx('warn', 0.5); }
        break;
      case 'shake':
        if (this.timer <= 0) { this.state = 'fall'; this.vy = 0; }
        break;
      case 'fall':
        this.vy = Math.min(this.vy + 800 * dt, 380);
        this.y += this.vy * dt;
        if (!p.dead && overlap(p, { x: this.x + 1, y: this.y, w: this.w - 2, h: this.h }) && p.damage(1, this.x + 5, s)) this.shatter(s);
        else if (s.world.solidRect(this.x + 2, this.y + this.h - 2, this.w - 4, 3)) this.shatter(s);
        break;
      case 'gone':
        if (this.timer <= 0) { this.state = 'hang'; this.x = this.ox; this.y = this.oy; }
        break;
    }
  }
  private shatter(s: PlayScene) {
    this.state = 'gone'; this.timer = 4;
    s.fx.burst(this.x + 5, this.y + this.h, 10, { color: ['#c0b4ff', '#8a7ad0', '#fff'], speed: 70, life: 0.5, gravity: 250, size: 2 });
    s.audio.sfx('collapse', 0.5);
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    if (this.state === 'gone') return;
    const jx = this.state === 'shake' ? Math.round(Math.sin(this.timer * 80)) : 0;
    const x = Math.round(this.x - cx) + jx, y = Math.round(this.y - cy);
    R(ctx, '#8a7ad0', x, y, 10, 4);
    R(ctx, '#a89aef', x + 1, y + 4, 8, 3);
    R(ctx, '#c0b4ff', x + 2, y + 7, 6, 3);
    R(ctx, '#e0daff', x + 3, y + 10, 3, 2);
    R(ctx, '#fff', x + 4, y + 12, 1, 2);
  }
}

// ------------------------------------------------------------------- Spring
export class Spring implements Entity {
  x: number; y: number; w = 16; h = 8; comp = 0;
  constructor(tx: number, ty: number) { this.x = tx * 16; this.y = ty * 16 + 8; }
  update(dt: number, s: PlayScene) {
    this.comp = Math.max(0, this.comp - dt * 5);
    const p = s.player;
    if (!p.dead && p.vy >= 0 && overlap({ x: p.x, y: p.y + p.h - 4, w: p.w, h: 6 }, this)) {
      p.bounce(-470);
      this.comp = 1;
      s.audio.sfx('spring');
      s.fx.ring(this.x + 8, this.y, '#ffe27a');
    }
  }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const c = Math.round(this.comp * 3);
    R(ctx, '#7a6a4a', x + 1, y + 6, 14, 2);
    R(ctx, '#d8d8e8', x + 4, y + 3 + c, 8, 1); R(ctx, '#d8d8e8', x + 4, y + 5, 8, 1);
    R(ctx, '#ff6a4a', x, y + c, 16, 3);
    R(ctx, '#ffa08a', x, y + c, 16, 1);
  }
}

// ---------------------------------------------------------------------- NPC
export class Npc implements Entity {
  x: number; y: number; w = 16; h = 16; t = rand(0, 5);
  near = false;
  constructor(tx: number, ty: number, public ch: string, public def: NpcDef) { this.x = tx * 16; this.y = ty * 16; }
  update(dt: number, s: PlayScene) {
    this.t += dt;
    const p = s.player;
    this.near = Math.abs(p.cx - (this.x + 8)) < 26 && Math.abs(p.cy - (this.y + 8)) < 26;
  }
  light() { return this.def.style === 'tablet' || this.def.style === 'spirit' ? { x: this.x + 8, y: this.y + 8, r: 40 } : { x: this.x + 8, y: this.y + 6, r: 32 }; }
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: PlayScene) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    const style = this.def.style ?? 'person';
    if (style === 'tablet') {
      R(ctx, '#3a3f58', x + 2, y + 1, 12, 15);
      R(ctx, '#8a90b0', x + 3, y + 2, 10, 13);
      R(ctx, '#6a7090', x + 4, y, 8, 2);
      const g = 0.5 + 0.5 * Math.sin(this.t * 3);
      R(ctx, g > 0.5 ? '#7af0ff' : '#4ab0c8', x + 5, y + 5, 6, 1); R(ctx, '#7af0ff', x + 5, y + 8, 4, 1); R(ctx, '#7af0ff', x + 5, y + 11, 6, 1);
      s.bg.drawGlow(ctx, x + 8, y + 8, 20, 0.2 + g * 0.15);
    } else if (style === 'spirit') {
      const fy = Math.round(Math.sin(this.t * 2) * 2);
      s.bg.drawGlow(ctx, x + 8, y + 8 + fy, 26, 0.5);
      ctx.globalAlpha = 0.9;
      R(ctx, '#bff4ff', x + 4, y + 2 + fy, 8, 9);
      R(ctx, '#bff4ff', x + 6, y + 11 + fy, 4, 4);
      R(ctx, '#1d4a66', x + 5, y + 5 + fy, 2, 2); R(ctx, '#1d4a66', x + 9, y + 5 + fy, 2, 2);
      R(ctx, '#fff', x + 5, y + fy, 6, 2);
      ctx.globalAlpha = 1;
    } else {
      const col = ['#c8704a', '#7a6ac8', '#4aa8a0', '#c8a04a'][(this.ch.charCodeAt(0) - 49 + 4) % 4];
      const bob = Math.round(Math.sin(this.t * 2.5) * 0.6);
      R(ctx, '#1d1a2e', x + 3, y + 1 + bob, 10, 15);
      R(ctx, col, x + 4, y + 2 + bob, 8, 14);
      R(ctx, '#2a2540', x + 5, y + 4 + bob, 6, 4);
      R(ctx, '#fff', x + 6, y + 5 + bob, 1, 2); R(ctx, '#fff', x + 9, y + 5 + bob, 1, 2);
      R(ctx, '#e8d0a0', x + 3, y + 10 + bob, 2, 2);
      R(ctx, '#8a6a3a', x + 13, y - 1, 1, 17);
      R(ctx, '#ffe27a', x + 12, y - 3, 3, 3);
    }
    if (this.near) {
      const by = y - 10 + Math.round(Math.sin(this.t * 6));
      R(ctx, '#fff', x + 4, by, 8, 7);
      R(ctx, '#fff', x + 7, by + 7, 2, 2);
      R(ctx, '#1d1a2e', x + 6, by + 2, 1, 1); R(ctx, '#1d1a2e', x + 8, by + 2, 1, 1); R(ctx, '#1d1a2e', x + 10, by + 2, 1, 1);
    }
  }
}

