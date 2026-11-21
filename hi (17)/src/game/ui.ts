/**
 * UI toolkit rendered at *display* resolution (crisp text) in logical
 * 384x216 coordinates: text/panel helpers, a reusable Menu widget, the HUD,
 * dialogue box, toasts and the debug overlay.
 */
import { VIEW_W, VIEW_H, PHYS } from './config';
import { drawHeart } from './objects';
import { fmtTime } from './util';
import type { Game } from './game';
import type { PlayScene } from './play';

export interface TextOpts {
  size?: number; color?: string; align?: CanvasTextAlign; shadow?: boolean; alpha?: number; bold?: boolean;
}

export class UI {
  ctx!: CanvasRenderingContext2D;
  hc = false; // high-contrast mode
  readonly font = "'Courier New', ui-monospace, Menlo, Consolas, monospace";

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    const c = this.ctx;
    c.font = `${o.bold === false ? '' : 'bold '}${o.size ?? 8}px ${this.font}`;
    c.textAlign = o.align ?? 'left';
    c.textBaseline = 'top';
    if (o.alpha !== undefined) c.globalAlpha = o.alpha;
    if (o.shadow !== false) { c.fillStyle = 'rgba(8,4,20,0.85)'; c.fillText(s, x + 1, y + 1); }
    c.fillStyle = this.hc ? '#fff' : o.color ?? '#fff';
    c.fillText(s, x, y);
    c.globalAlpha = 1;
  }

  measure(s: string, size = 8) {
    this.ctx.font = `bold ${size}px ${this.font}`;
    return this.ctx.measureText(s).width;
  }

  wrap(s: string, maxW: number, size = 8): string[] {
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (this.measure(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  panel(x: number, y: number, w: number, h: number, o: { fill?: string; border?: string; alpha?: number } = {}) {
    const c = this.ctx;
    c.globalAlpha = o.alpha ?? 1;
    c.fillStyle = this.hc ? '#000' : o.fill ?? 'rgba(18,12,40,0.88)';
    c.fillRect(x + 1, y, w - 2, h);
    c.fillRect(x, y + 1, w, h - 2);
    c.fillStyle = this.hc ? '#fff' : o.border ?? '#8a7ad0';
    c.fillRect(x + 1, y, w - 2, 1); c.fillRect(x + 1, y + h - 1, w - 2, 1);
    c.fillRect(x, y + 1, 1, h - 2); c.fillRect(x + w - 1, y + 1, 1, h - 2);
    c.globalAlpha = 1;
  }

  bar(x: number, y: number, w: number, h: number, pct: number, color: string, back = 'rgba(0,0,0,0.6)') {
    const c = this.ctx;
    c.fillStyle = '#05030c'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = back; c.fillRect(x, y, w, h);
    c.fillStyle = color; c.fillRect(x, y, Math.max(0, Math.min(1, pct)) * w, h);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y, Math.max(0, Math.min(1, pct)) * w, 1);
  }
}

// -------------------------------------------------------------------- Menu
export interface MenuItem {
  label: () => string;
  action?: () => void;
  adjust?: (dir: number) => void;
  hint?: () => string;
  disabled?: () => boolean;
}

export class Menu {
  index = 0;
  private rects: { x: number; y: number; w: number; h: number }[] = [];
  constructor(public title: string, public items: MenuItem[], public subtitle: () => string = () => '') {
    this.index = Math.max(0, items.findIndex((i) => !i.disabled?.()));
  }

  private move(g: Game, d: number) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      this.index = (this.index + d + n) % n;
      if (!this.items[this.index].disabled?.()) break;
    }
    g.audio.sfx('select');
  }

  update(g: Game) {
    const inp = g.input;
    const it = this.items[this.index];
    if (inp.pressed('up')) this.move(g, -1);
    if (inp.pressed('down')) this.move(g, 1);
    if (it.adjust) {
      if (inp.pressed('left')) { it.adjust(-1); g.audio.sfx('select'); }
      if (inp.pressed('right')) { it.adjust(1); g.audio.sfx('select'); }
    }
    if (inp.pressed('confirm') && !it.disabled?.()) { it.action?.(); if (it.action) g.audio.sfx('confirm'); else if (it.adjust) { it.adjust(1); g.audio.sfx('select'); } }
    const p = g.pointer;
    if (p.moved || p.clicked) {
      const hit = this.rects.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      if (hit >= 0 && !this.items[hit].disabled?.()) {
        if (p.moved && hit !== this.index) { this.index = hit; g.audio.sfx('select', 0.5); }
        if (p.clicked) {
          this.index = hit;
          const t = this.items[hit], r = this.rects[hit];
          if (t.action) { t.action(); g.audio.sfx('confirm'); }
          else if (t.adjust) { t.adjust(p.x < r.x + r.w / 2 ? -1 : 1); g.audio.sfx('select'); }
        }
      }
    }
  }

  draw(ui: UI) {
    const c = ui.ctx;
    const n = this.items.length;
    const rowH = 15;
    const total = n * rowH;
    const top = Math.max(56, Math.round((VIEW_H - total) / 2 + 14));
    ui.text(this.title, VIEW_W / 2, top - 38, { size: 16, align: 'center', color: '#ffe9a0' });
    const sub = this.subtitle();
    if (sub) ui.text(sub, VIEW_W / 2, top - 17, { size: 8, align: 'center', color: '#bfb4ff' });
    this.rects = [];
    this.items.forEach((it, i) => {
      const y = top + i * rowH;
      const sel = i === this.index;
      const dis = it.disabled?.() ?? false;
      const w = 220, x = (VIEW_W - w) / 2;
      this.rects.push({ x, y, w, h: rowH - 1 });
      if (sel) {
        c.fillStyle = 'rgba(138,122,208,0.35)';
        c.fillRect(x, y, w, rowH - 2);
        c.fillStyle = '#ffe9a0';
        c.fillRect(x, y, 2, rowH - 2);
        ui.text('▶', x + 6, y + 3, { size: 8, color: '#ffe9a0' });
      }
      ui.text(it.label(), VIEW_W / 2, y + 3, { size: 9, align: 'center', color: dis ? '#6a6488' : sel ? '#fff' : '#cfc8ee' });
    });
    const hint = this.items[this.index]?.hint?.();
    if (hint) ui.text(hint, VIEW_W / 2, VIEW_H - 22, { size: 8, align: 'center', color: '#a9a0d8' });
  }
}

// --------------------------------------------------------------------- HUD
export function drawHud(ui: UI, g: Game, s: PlayScene) {
  const c = ui.ctx;
  const p = s.player;
  // hearts
  const px = p.maxHp > 8 ? 1.2 : 1.5;
  for (let i = 0; i < p.maxHp; i++) {
    const x = 8 + i * (7 * px + 2);
    drawHeart(c, x, 8, px, i < p.hp ? '#ff4a6a' : '#3a2a4a', i < p.hp ? '#ffd0d8' : '#3a2a4a');
  }
  const hurtPulse = p.invuln > 0.9 ? 1 : 0;
  if (hurtPulse) { c.fillStyle = 'rgba(255,60,60,0.12)'; c.fillRect(0, 0, VIEW_W, VIEW_H); }
  // energy
  ui.bar(8, 22, 54, 4, p.energy / 100, p.energy >= PHYS.boltCost ? '#5ae6ff' : '#3a78a0');
  for (let i = 1; i < 5; i++) { c.fillStyle = 'rgba(5,3,12,0.8)'; c.fillRect(8 + i * 10.8, 22, 1, 4); }
  // dash pips
  for (let i = 0; i < p.maxDashes; i++) {
    c.fillStyle = '#05030c'; c.fillRect(7 + i * 9, 29, 8, 8);
    c.fillStyle = i < p.dashes ? '#ff6b6b' : '#33405a'; c.fillRect(8 + i * 9, 30, 6, 6);
    if (i < p.dashes) { c.fillStyle = '#ffc0c0'; c.fillRect(9 + i * 9, 31, 2, 2); }
  }
  if (p.surge > 0) ui.text(`SURGE ${p.surge.toFixed(1)}s`, 8, 40, { size: 7, color: '#ffd36a' });
  // currency
  c.fillStyle = '#ffd23f'; c.fillRect(VIEW_W - 60, 10, 6, 6);
  c.fillStyle = '#fff3a8'; c.fillRect(VIEW_W - 59, 11, 2, 3);
  ui.text(String(g.save.coins), VIEW_W - 50, 9, { size: 9, color: '#fff3a8' });
  c.fillStyle = '#5ae6ff'; c.fillRect(VIEW_W - 60, 22, 6, 6); c.fillStyle = '#e8ffff'; c.fillRect(VIEW_W - 59, 23, 2, 3);
  ui.text(String(g.save.crystals), VIEW_W - 50, 21, { size: 9, color: '#bff' });
  if (g.settings.speedrun) ui.text(fmtTime(s.levelMs), VIEW_W / 2, 6, { size: 9, align: 'center', color: s.levelMs <= s.level.par * 1000 ? '#aef5b0' : '#ffd0b0' });
  // boss bar
  const b = s.boss;
  if (b && b.active && !b.dead) {
    const w = 220, x = (VIEW_W - w) / 2, y = VIEW_H - 24;
    ui.text(b.title, VIEW_W / 2, y - 12, { size: 8, align: 'center', color: '#ffb0c0' });
    ui.bar(x, y, w, 6, b.hp / b.maxHp, '#e8445a', 'rgba(60,10,30,0.8)');
  }
  // level title card
  if (s.titleT > 0) {
    const a = Math.min(1, s.titleT, (3.2 - s.titleT) * 2);
    ui.text(s.level.name, VIEW_W / 2, 64, { size: 20, align: 'center', color: '#ffe9a0', alpha: a });
    if (s.level.subtitle) ui.text(s.level.subtitle, VIEW_W / 2, 90, { size: 9, align: 'center', color: '#cfc8ee', alpha: a });
    if (s.level.intro) ui.text(s.level.intro, VIEW_W / 2, 104, { size: 8, align: 'center', color: '#a9a0d8', alpha: a * 0.9, bold: false });
  }
  // interaction prompt
  if (s.prompt && !s.dialogue) {
    const w = ui.measure(s.prompt, 8) + 12;
    ui.panel(VIEW_W / 2 - w / 2, VIEW_H - 50, w, 14);
    ui.text(s.prompt, VIEW_W / 2, VIEW_H - 47, { size: 8, align: 'center' });
  }
  // floating texts (world → screen)
  for (const t of s.fx.texts.items) {
    if (!t.active) continue;
    ui.text(t.text, t.x - s.camX, t.y - s.camY, { size: 7, align: 'center', color: t.color, alpha: Math.min(1, t.life * 2) });
  }
  if (s.dialogue) drawDialogue(ui, s);
}

function drawDialogue(ui: UI, s: PlayScene) {
  const d = s.dialogue!;
  const x = 24, w = VIEW_W - 48, y = 40, h = 56;
  ui.panel(x, y, w, h, { fill: 'rgba(14,10,34,0.94)' });
  const nw = ui.measure(d.name, 8) + 14;
  ui.panel(x + 8, y - 8, nw, 14, { fill: 'rgba(60,40,110,0.98)', border: '#ffe9a0' });
  ui.text(d.name, x + 15, y - 5, { size: 8, color: '#ffe9a0' });
  const line = d.lines[d.i];
  const lines = ui.wrap(line, w - 24, 9);
  let left = Math.floor(d.shown);
  lines.forEach((l, i) => {
    const part = l.slice(0, Math.max(0, left));
    left -= l.length + 1;
    ui.text(part, x + 12, y + 10 + i * 12, { size: 9, color: '#f4f0ff' });
  });
  if (d.shown >= line.length) ui.text('▼', x + w - 16, y + h - 14 + Math.round(Math.sin(s.time * 8)), { size: 8, color: '#ffe9a0' });
}

// ------------------------------------------------------------------ Toasts
export function drawToasts(ui: UI, g: Game) {
  g.toasts.forEach((t, i) => {
    const a = Math.min(1, t.t * 2, (3.4 - t.t) * 4);
    const w = Math.max(ui.measure(t.title, 9), ui.measure(t.sub, 7)) + 24;
    const y = 46 + i * 28 - (1 - Math.min(1, a)) * 8;
    ui.ctx.globalAlpha = Math.max(0, a);
    ui.panel(VIEW_W / 2 - w / 2, y, w, t.sub ? 24 : 15, { fill: 'rgba(20,12,50,0.95)', border: '#ffe9a0' });
    ui.text(t.title, VIEW_W / 2, y + 3, { size: 9, align: 'center', color: '#ffe9a0' });
    if (t.sub) ui.text(t.sub, VIEW_W / 2, y + 14, { size: 7, align: 'center', color: '#cfc8ee' });
    ui.ctx.globalAlpha = 1;
  });
}

// ------------------------------------------------------------ Debug overlay
export function drawDebug(ui: UI, g: Game) {
  const lines = [
    `FPS ${g.debug.fps}  frame ${g.debug.frameMs.toFixed(1)}ms  god:${g.debug.god ? 'ON' : 'off'}  (F3 overlay, F4 god, N skip level)`,
    `input: ${g.input.device}${g.input.padConnected ? ' (pad)' : ''}   deaths: ${g.analytics.summary()}`,
  ];
  if (g.scene) {
    const d = g.scene.debugInfo();
    lines.push(`lvl ${d.level}  pos ${d.pos}  vel ${d.vel}  ground:${d.ground} dashes:${d.dashes} air:${d.airJumps}`);
    lines.push(`enemies ${d.enemies} entities ${d.entities} projectiles ${d.projectiles} particles ${d.particles}  boss:${d.boss} phase:${d.phase}`);
  }
  const w = 340;
  ui.ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ui.ctx.fillRect(4, VIEW_H - 8 - lines.length * 9, w, lines.length * 9 + 4);
  lines.forEach((l, i) => ui.text(l, 6, VIEW_H - 6 - (lines.length - i) * 9, { size: 6, color: '#7dffb0', shadow: false, bold: false }));
}
